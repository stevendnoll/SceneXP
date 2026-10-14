// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Whitestone's 2D interface: the markup rules no unit test sees, and the
 * flows driven through the page the way a visitor would, on the DOM stub.
 *
 *   - Every card in CARD_ORDER is in the markup, in that order, and every
 *     card in the markup is in CARD_ORDER.
 *   - Every id a script looks up exists in the page, so a renamed field is a
 *     failing test rather than a button that silently does nothing.
 *   - Nothing anywhere under www/whitestone writes markup from a string.
 *   - Start your own, care preferences, undo (button and keyboard), My
 *     checklists (open, duplicate, remove), another tab, and a browser that
 *     will not save.
 *
 * A HEADLESS BOOT IS NOT A WORKING PAGE. These say the wiring runs and the
 * document is right. How it looks is Steve's QA.
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { CARD_ORDER } from '../www/whitestone/js/cards.js';
import { UI } from '../www/whitestone/js/copy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const HTML = readFileSync(join(WS, 'index.html'), 'utf8');
const IDS = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

// ---- The markup -------------------------------------------------------------

describe('the markup', () => {
    test('every card is in CARD_ORDER, in markup order, with its panel', () => {
        const overlays = [...HTML.matchAll(/<div id="([a-z-]+)" class="card-overlay[^"]*"/g)].map((m) => m[1]);
        expect(overlays).toEqual(CARD_ORDER);
        for (const id of CARD_ORDER) expect(IDS.has(`${id}-panel`)).toBe(true);
    });

    test('every id a script looks up is in the page', () => {
        const missing = [];
        // Ids built at run time (each checklist's title, each checkbox) are
        // made by the same code that uses them, so only literal lookups count.
        const built = /^(my-title-|setup-levels-|prefs-)/;
        for (const file of ['main.js', 'forms.js', 'panels.js', 'cards.js']) {
            const src = readFileSync(join(WS, 'js', file), 'utf8');
            const ids = [...src.matchAll(/\b(?:el|byId|on)\('([a-z][a-z0-9-]*)'/g)].map((m) => m[1]);
            for (const id of ids) {
                if (!IDS.has(id) && !built.test(id)) missing.push(`${file}: ${id}`);
            }
        }
        // The two lists built from the taxonomy do have their containers.
        expect(IDS.has('setup-levels-list') && IDS.has('prefs-groups')).toBe(true);
        expect(missing).toEqual([]);
    });

    test('nothing under www/whitestone writes markup from a string', () => {
        const sources = [];
        (function walk(dir) {
            for (const name of readdirSync(dir)) {
                const full = join(dir, name);
                if (statSync(full).isDirectory()) walk(full);
                else if (name.endsWith('.js') && !name.endsWith('.min.js')) sources.push(full);
            }
        }(WS));
        expect(sources.length).toBeGreaterThan(15);
        const offenders = sources.filter((f) => /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(readFileSync(f, 'utf8')));
        expect(offenders).toEqual([]);
    });
});

// ---- The flows --------------------------------------------------------------

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

/**
 * Boot the page. With `example: true` it is a first visit (nothing saved)
 * shown the example, as Show me an example does; otherwise an empty saved
 * document is put in place first and the house starts empty.
 */
async function boot({ example = false, guide = false } = {}) {
    if (!example) {
        try {
            localStorage.setItem(CONFIG.storage.key, JSON.stringify({
                schema: 1, checklists: [], settings: { coached: 0, activeId: null }, meta: { createdAt: '2026-10-12T16:00:00.000Z', lastVisitAt: null }
            }));
        } catch (e) { /* a test that refuses storage */ }
    }
    const main = await import('../www/whitestone/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + 100);
    // These tests drive the cards, so Maya is put away first, as Skip
    // would (her guide has its own suite, whitestone-arrival).
    if (guide === false) main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'done' };
    // The example arrives when asked for (Maya's Show me an example).
    if (example) main.__test__.showExample();
    return main;
}

/** What the live region says, once its beat has passed. */
function said() {
    jest.advanceTimersByTime(50);
    return dom.el('ws-live').textContent;
}

/** The checkbox for `key` in a list built by forms.js. */
function box(listId, key) {
    for (const row of dom.el(listId).children) {
        const input = row.children[0];
        if (input.value === key) return input;
    }
    throw new Error(`no ${key} in ${listId}`);
}

/** The prefs list for a group, as built under #prefs-groups. */
function prefsBox(key) {
    for (const fieldset of dom.el('prefs-groups').children) {
        for (const row of fieldset.children[1].children) {
            if (row.children[0].value === key) return row.children[0];
        }
    }
    throw new Error(`no ${key}`);
}

const saved = () => JSON.parse(localStorage.getItem(CONFIG.storage.key));
const visible = (id) => !dom.el(id).hidden;

/** A new checklist's setup card, as a visitor reaches it without the
 *  guide: My checklists, from the Help menu, then New. */
function newHome() {
    fire(dom.el('help-mine'), 'click');
    fire(dom.el('my-new'), 'click');
}

/** Fill in and submit the setup card for a new home. */
async function startHome(main, { title = 'Maple Street', levels = ['main', 'second'] } = {}) {
    newHome();
    expect(visible('setup')).toBe(true);
    for (const key of ['basement', 'main', 'second', 'attic']) box('setup-levels-list', key).checked = levels.includes(key);
    dom.el('setup-title').value = title;
    dom.el('setup-household').value = 'Parking in the driveway.';
    fire(dom.el('setup-form'), 'submit');
    return main;
}

test('an empty house offers My checklists and the service menu, and nothing that needs a checklist', async () => {
    const main = await boot();
    expect(main.getState().storageStatus).toBe('restored');
    expect(visible('help-mine')).toBe(true);
    expect(visible('help-menu')).toBe(true);
    expect(visible('help-checklist')).toBe(false);
    expect(visible('help-home')).toBe(false);
    expect(visible('help-prefs')).toBe(false);
    expect(visible('hud-home')).toBe(false);
    expect(dom.el('ws-undo').disabled).toBe(true);
    // No fetch here, so the price sheet waits and nothing breaks.
    expect(main.getState().sheetStatus).toBe('failed');
});

test('Start your own: setup makes the checklist, opens it, and offers care preferences once', async () => {
    const main = await boot();
    await startHome(main);

    const doc = main.getDoc();
    expect(doc.checklists).toHaveLength(1);
    const c = doc.checklists[0];
    expect(c).toMatchObject({ title: 'Maple Street', levels: ['main', 'second'], household: 'Parking in the driveway.' });
    expect(doc.settings.activeId).toBe(c.id);
    expect(saved().checklists[0].title).toBe('Maple Street');

    expect(visible('setup')).toBe(false);
    expect(visible('preferences')).toBe(true);
    expect(dom.el('hud-home').textContent).toBe('Maple Street');
    expect(visible('help-home') && visible('help-prefs') && visible('help-checklist')).toBe(true);
    expect(dom.el('toast-text').textContent).toBe(UI.started('Maple Street'));

    prefsBox('no-bleach').checked = true;
    prefsBox('pets-home').checked = true;
    dom.el('prefs-note').value = 'Please keep the gate closed.';
    fire(dom.el('prefs-form'), 'submit');
    expect(main.getDoc().checklists[0].preferences).toEqual({ keys: ['no-bleach', 'pets-home'], note: 'Please keep the gate closed.' });
    expect(visible('preferences')).toBe(false);
    expect(said()).toBe(UI.preferencesSaved);
});

test('setup refuses a home with no levels, and says why', async () => {
    const main = await boot();
    await startHome(main, { levels: [] });
    expect(main.getDoc().checklists).toHaveLength(0);
    expect(visible('setup')).toBe(true);
    expect(dom.el('setup-error').textContent).toBe(UI.levelsNeeded);
});

test('editing the home changes its details and its levels, and a level with rooms cannot go', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    fire(dom.el('help-home'), 'click');
    expect(dom.el('setup-title').value).toBe('Maple Street');
    expect(box('setup-levels-list', 'second').checked).toBe(true);
    dom.el('setup-title').value = 'The Maple house';
    box('setup-levels-list', 'basement').checked = true;
    fire(dom.el('setup-form'), 'submit');
    expect(main.getDoc().checklists[0]).toMatchObject({ title: 'The Maple house', levels: ['basement', 'main', 'second'] });
    expect(said()).toBe(UI.homeSaved);
});

test('undo takes back each step, from the button and from the keyboard, but not inside a text field', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    fire(dom.el('help-home'), 'click');
    dom.el('setup-title').value = 'Renamed';
    fire(dom.el('setup-form'), 'submit');
    expect(main.getDoc().checklists[0].title).toBe('Renamed');
    expect(dom.el('ws-undo').disabled).toBe(false);

    // Ctrl+Z typed into a text box is the text box's own undo.
    fire(dom.windowStub, 'keydown', { key: 'z', ctrlKey: true, target: { tagName: 'TEXTAREA' } });
    expect(main.getDoc().checklists[0].title).toBe('Renamed');

    fire(dom.windowStub, 'keydown', { key: 'z', metaKey: true, target: dom.documentStub.body });
    expect(main.getDoc().checklists[0].title).toBe('Maple Street');
    expect(said()).toBe(UI.undone(UI.labels.home));

    fire(dom.el('ws-undo'), 'click');
    expect(main.getDoc().checklists).toHaveLength(0);
    expect(saved().checklists).toHaveLength(0);
    expect(dom.el('ws-undo').disabled).toBe(true);
    fire(dom.el('ws-undo'), 'click');
    expect(said()).toBe(UI.nothingToUndo);
});

test('My checklists: open, duplicate and remove, with undo for the last two', async () => {
    const main = await boot();
    await startHome(main, { title: 'First' });
    fire(dom.el('prefs-skip'), 'click');
    fire(dom.el('help-mine'), 'click');
    await startHome(main, { title: 'Second' });
    fire(dom.el('prefs-skip'), 'click');
    const [first, second] = main.getDoc().checklists;
    expect(main.getDoc().settings.activeId).toBe(second.id);

    fire(dom.el('hud-home'), 'click');
    expect(visible('my-checklists')).toBe(true);
    const rows = () => dom.el('my-list').children;
    expect(rows()).toHaveLength(2);
    const buttonsOf = (row) => row.children[1].children;
    const rowFor = (title) => [...rows()].find((r) => r.children[0].children[0].textContent === title);

    // Open the first.
    fire(buttonsOf(rowFor('First'))[0], 'click');
    expect(main.getDoc().settings.activeId).toBe(first.id);
    expect(said()).toBe(UI.opened('First'));
    expect(visible('my-checklists')).toBe(false);
    expect(main.__test__.history().size).toBe(2);   // opening is not an undo step

    // Duplicate it.
    fire(dom.el('help-mine'), 'click');
    fire(buttonsOf(rowFor('First'))[1], 'click');
    expect(main.getDoc().checklists.map((c) => c.title)).toEqual(['First', 'Second', 'Copy of First']);
    expect(rows()).toHaveLength(3);

    // Remove the second, through the confirmation card.
    fire(buttonsOf(rowFor('Second'))[2], 'click');
    expect(visible('confirm')).toBe(true);
    fire(dom.el('confirm-actions').children[1], 'click');
    expect(main.getDoc().checklists.find((c) => c.id === second.id).deletedAt).toBeTruthy();
    expect(rows()).toHaveLength(2);

    fire(dom.el('toast-undo'), 'click');
    expect(main.getDoc().checklists.find((c) => c.id === second.id).deletedAt).toBeNull();
    expect(rows()).toHaveLength(3);
});

test('an empty list says so, kindly', async () => {
    await boot();
    fire(dom.el('help-mine'), 'click');
    expect(dom.el('my-list').children[0].textContent).toBe(UI.noChecklists);
});

test('a change in another tab is followed, and undo steps from before it are dropped', async () => {
    const main = await boot();
    await startHome(main, { title: 'Mine' });
    fire(dom.el('prefs-skip'), 'click');
    const theirs = saved();
    theirs.checklists[0].title = 'Theirs';
    localStorage.setItem(CONFIG.storage.key, JSON.stringify(theirs));
    fire(dom.windowStub, 'storage', { key: 'some-other-scene' });
    expect(main.getDoc().checklists[0].title).toBe('Mine');
    fire(dom.windowStub, 'storage', { key: CONFIG.storage.key });
    expect(main.getDoc().checklists[0].title).toBe('Theirs');
    expect(main.__test__.history().canUndo).toBe(false);
    expect(said()).toBe(UI.otherTab);
});

test('a browser that will not save says so under My checklists', async () => {
    localStorage.getItem = () => { throw new Error('denied'); };
    const main = await boot();
    expect(main.getState().storageStatus).toBe('unavailable');
    fire(dom.el('help-mine'), 'click');
    expect(dom.el('storage-note').textContent).toMatch(/private window/);
});

test('page hide saves the visit, then nothing more is written', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.windowStub, 'pagehide');
    expect(saved().meta.lastVisitAt).toBeTruthy();
    main.__test__.mutate((d) => ({ doc: { ...d, checklists: [] }, record: null, error: null }), 'x');
    expect(saved().checklists).toHaveLength(1);
});

test('with the price sheet loaded, My checklists shows each total', async () => {
    globalThis.fetch = async (url) => {
        const file = join(WS, String(url));
        return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
    };
    const main = await boot();
    await flushAsync(20);
    expect(main.getState().sheetStatus).toBe('ready');

    await startHome(main, { title: 'Priced' });
    fire(dom.el('prefs-skip'), 'click');
    const { addRoom } = await import('../www/whitestone/js/store.js');
    const id = main.getDoc().checklists[0].id;
    main.__test__.mutate((d) => addRoom(d, id, { level: 'main', area: 'powder-room' }, CONFIG, new Date(),
        { presetItems: [{ task: 'toilet' }, { task: 'bathroom-sink' }] }), 'Added a room');
    fire(dom.el('help-mine'), 'click');
    const summary = dom.el('my-list').children[0].children[0].children[2];
    // Toilet $12 and sink $6 come to $18, topped up to the $120 visit minimum.
    expect(summary.textContent).toBe('1 room, 2 tasks, $120');
});

// ---- Rooms, tasks and the checklist (M1 piece 2) ------------------------------

/** The real price sheet, served from disk. */
function serveSheet() {
    globalThis.fetch = async (url) => ({
        ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8'))
    });
}

/** Boot with prices, start a home, and skip preferences, which (first visit)
 *  goes on to the room card. */
async function homeWithPrices() {
    serveSheet();
    const main = await boot();
    await flushAsync(20);
    expect(main.getState().sheetStatus).toBe('ready');
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    jest.advanceTimersByTime(10);
    return main;
}

const options = (selectId) => dom.el(selectId).children.map((o) => o.value);
const checklist = (main) => main.getDoc().checklists[0];
const liveTasks = (main) => checklist(main).items.filter((i) => !i.deletedAt);

/** A button in the checklist body, found by its label and the room or task
 *  it names (aria-describedby). */
function bodyButton(label, describedBy) {
    const found = [];
    (function walk(node) {
        for (const child of node.children || []) {
            if (child.tagName === 'BUTTON' || child.tagName === 'button') {
                if (child.textContent === label && (!describedBy || child.getAttribute('aria-describedby') === describedBy)) found.push(child);
            }
            walk(child);
        }
    }(dom.el('checklist-body')));
    if (!found.length) throw new Error(`no ${label} button`);
    return found[0];
}

async function addKitchen(main) {
    dom.el('room-area').value = 'kitchen';
    fire(dom.el('room-area'), 'change');
    dom.el('room-level').value = 'main';
    fire(dom.el('room-form'), 'submit');
    return checklist(main).rooms.find((r) => r.area === 'kitchen');
}

test('a first visit goes from preferences straight to the first room, however preferences close', async () => {
    const main = await homeWithPrices();
    expect(visible('room')).toBe(true);
    expect(dom.el('room-title').textContent).toBe(UI.addRoomTitle);
    // A second home, with preferences closed by Escape instead.
    fire(dom.el('room-cancel'), 'click');
    fire(dom.el('help-mine'), 'click');
    await startHome(main, { title: 'Second' });
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    jest.advanceTimersByTime(10);
    expect(visible('preferences')).toBe(false);
    expect(visible('room')).toBe(true);
});

test('a room arrives with its standard tasks in one step, and the checklist shows them', async () => {
    const main = await homeWithPrices();
    expect(options('room-area')[0]).toBe('');
    dom.el('room-area').value = 'kitchen';
    fire(dom.el('room-area'), 'change');
    expect(dom.el('room-preset-list').textContent).toMatch(/^Adds Stovetop, Kitchen sink, Countertops/);

    const kitchen = await addKitchen(main);
    expect(kitchen).toMatchObject({ level: 'main', area: 'kitchen', label: '' });
    expect(liveTasks(main)).toHaveLength(9);
    expect(dom.el('toast-text').textContent).toBe(UI.roomAdded('Kitchen', 9));
    expect(visible('room')).toBe(false);
    expect(visible('checklist')).toBe(true);
    expect(dom.el('checklist-summary').textContent).toMatch(/^1 room, 9 tasks, \$/);

    // One undo takes the room and all nine tasks back.
    fire(dom.el('toast-undo'), 'click');
    expect(checklist(main).rooms).toHaveLength(0);
    expect(checklist(main).items).toHaveLength(0);
});

test('a room with no kind is refused, a room without its preset is empty, and a room keeps its kind when edited', async () => {
    const main = await homeWithPrices();
    fire(dom.el('room-form'), 'submit');
    expect(dom.el('room-error').textContent).toBe('Please choose what kind of room this is.');
    dom.el('room-area').value = 'bedroom';
    dom.el('room-level').value = 'second';
    dom.el('room-label').value = "Emma's room";
    dom.el('room-preset').checked = false;
    fire(dom.el('room-form'), 'submit');
    const room = checklist(main).rooms[0];
    expect(room).toMatchObject({ area: 'bedroom', level: 'second', label: "Emma's room" });
    expect(liveTasks(main)).toHaveLength(0);

    fire(bodyButton(UI.editRoom), 'click');
    expect(dom.el('room-area').disabled).toBe(true);
    expect(dom.el('room-preset-row').hidden).toBe(true);
    dom.el('room-label').value = 'Guest room';
    fire(dom.el('room-form'), 'submit');
    expect(checklist(main).rooms[0]).toMatchObject({ label: 'Guest room', area: 'bedroom' });
    expect(said()).toBe(UI.roomChanged('Guest room'));
});

test('the task card offers only what the room allows, prices it as it is chosen, and saves it', async () => {
    const main = await homeWithPrices();
    const kitchen = await addKitchen(main);
    fire(bodyButton(UI.addTask, `room-name-${kitchen.id}`), 'click');
    expect(visible('task')).toBe(true);
    expect(dom.el('task-title').textContent).toBe(UI.addTaskTitle('Kitchen'));
    expect(options('task-task')).toContain('oven-interior');
    expect(options('task-task')).not.toContain('toilet');

    dom.el('task-task').value = 'oven-interior';
    fire(dom.el('task-task'), 'change');
    expect(dom.el('task-size-row').hidden).toBe(true);
    expect(dom.el('task-quantity-row').hidden).toBe(true);
    const deep = dom.el('task-options-list').children[0].children[0];
    expect(deep.value).toBe('deep-clean');
    deep.checked = true;
    fire(dom.el('task-form'), 'change');
    expect(dom.el('task-price').textContent).toBe('$40, about 35 minutes');
    dom.el('task-important').checked = true;
    dom.el('task-notes').value = 'The racks soak in the sink first, please.';
    fire(dom.el('task-form'), 'submit');

    const oven = liveTasks(main).find((i) => i.task === 'oven-interior');
    expect(oven).toMatchObject({ options: ['deep-clean'], important: true, notes: 'The racks soak in the sink first, please.', size: null, quantity: null });
    expect(visible('task')).toBe(false);
    expect(dom.el('toast-text').textContent).toBe(UI.taskAdded('Oven interior', 'Kitchen'));
});

test('counted tasks take a quantity, room tasks a size, and a bad quantity is refused with the reason', async () => {
    const main = await homeWithPrices();
    const kitchen = await addKitchen(main);
    fire(bodyButton(UI.addTask, `room-name-${kitchen.id}`), 'click');
    dom.el('task-task').value = 'interior-windows';
    fire(dom.el('task-task'), 'change');
    expect(dom.el('task-quantity-row').hidden).toBe(false);
    dom.el('task-quantity').value = '0';
    fire(dom.el('task-form'), 'input');
    expect(dom.el('task-price').textContent).toBe('Please choose a quantity from 1 to 50.');
    fire(dom.el('task-form'), 'submit');
    expect(dom.el('task-error').textContent).toBe('Please choose a quantity from 1 to 50.');
    dom.el('task-quantity').value = '6';
    fire(dom.el('task-form'), 'input');
    expect(dom.el('task-price').textContent).toBe('$30, about 25 minutes');
    fire(dom.el('task-form'), 'submit');
    expect(liveTasks(main).find((i) => i.task === 'interior-windows').quantity).toBe(6);

    fire(bodyButton(UI.addTask, `room-name-${kitchen.id}`), 'click');
    dom.el('task-task').value = 'cabinet-fronts';
    fire(dom.el('task-task'), 'change');
    expect(dom.el('task-size-row').hidden).toBe(false);
    dom.el('task-size').value = 'large';
    fire(dom.el('task-form'), 'change');
    expect(dom.el('task-price').textContent).toBe('$18, about 15 minutes');
});

test('editing keeps the task, removing goes with an undo, and both are offered from the checklist', async () => {
    const main = await homeWithPrices();
    await addKitchen(main);
    const stove = liveTasks(main).find((i) => i.task === 'stovetop');
    fire(bodyButton(UI.edit, `task-name-${stove.id}`), 'click');
    expect(dom.el('task-task').disabled).toBe(true);
    expect(options('task-task')).toEqual(['stovetop']);
    expect(dom.el('task-title').textContent).toBe(UI.editTaskTitle('Stovetop'));
    dom.el('task-avoid').value = 'No steel wool.';
    fire(dom.el('task-form'), 'submit');
    expect(liveTasks(main).find((i) => i.id === stove.id).avoid).toBe('No steel wool.');

    fire(bodyButton(UI.remove, `task-name-${stove.id}`), 'click');
    expect(liveTasks(main).some((i) => i.id === stove.id)).toBe(false);
    expect(dom.el('toast-text').textContent).toBe(UI.taskRemoved('Stovetop'));
    fire(dom.el('toast-undo'), 'click');
    expect(liveTasks(main).some((i) => i.id === stove.id)).toBe(true);
});

test('removing a room takes its tasks, and undo brings them all back', async () => {
    const main = await homeWithPrices();
    const kitchen = await addKitchen(main);
    fire(bodyButton(UI.editRoom, `room-name-${kitchen.id}`), 'click');
    fire(dom.el('room-remove'), 'click');
    expect(liveTasks(main)).toHaveLength(0);
    expect(dom.el('checklist-body').children[0].textContent).toBe(UI.noRooms);
    fire(dom.el('toast-undo'), 'click');
    expect(liveTasks(main)).toHaveLength(9);
});

test('photos: picked, resized and kept at once, attached on save, and a removed one is not attached', async () => {
    const main = await homeWithPrices();
    const kitchen = await addKitchen(main);
    await main.__test__.openPhotos();
    // The browser's pieces for preparePhoto: a decoder and canvases that save.
    globalThis.createImageBitmap = async () => ({ width: 4032, height: 3024, close() {} });
    const make = document.createElement;
    document.createElement = (tag) => {
        const node = make(tag);
        if (tag === 'canvas') node.toBlob = (cb, type) => cb(new Blob([new Uint8Array(node.width)], { type }));
        return node;
    };
    try {
        fire(bodyButton(UI.addTask, `room-name-${kitchen.id}`), 'click');
        dom.el('task-task').value = 'oven-interior';   // not in the kitchen's preset
        fire(dom.el('task-task'), 'change');
        const input = dom.el('task-photo-input');
        for (let n = 0; n < 2; n++) {
            input.files = [{ name: `IMG_${n}.HEIC` }];
            await main.__test__.addTaskPhoto();
        }
        expect(dom.el('task-photos').children).toHaveLength(2);
        expect(said()).toBe(`${UI.photoAdded} ${UI.photosInMemory}`);   // no IndexedDB in the suite
        // Remove the first before saving.
        fire(dom.el('task-photos').children[0].children[1], 'click');
        await flushAsync();
        expect(dom.el('task-photos').children).toHaveLength(1);
        fire(dom.el('task-form'), 'submit');
        const item = liveTasks(main).find((i) => i.task === 'oven-interior');
        expect(item.photos).toHaveLength(1);
        // Kept at both sizes, the full one resized to 1600 on its long edge.
        const full = await main.__test__.photoStore().get(item.photos[0]);
        expect(full.size).toBe(1600);
        expect(full.type).toBe('image/jpeg');

        // A file that is not a picture.
        fire(bodyButton(UI.edit, `task-name-${item.id}`), 'click');
        globalThis.createImageBitmap = async () => { throw new Error('InvalidStateError'); };
        input.files = [{ name: 'notes.pdf' }];
        await main.__test__.addTaskPhoto();
        expect(dom.el('task-error').textContent).toBe(UI.photoUnreadable);
    } finally {
        document.createElement = make;
        delete globalThis.createImageBitmap;
    }
});

test('without the price sheet, a task waits politely rather than offering nothing', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    jest.advanceTimersByTime(10);
    dom.el('room-area').value = 'kitchen';
    fire(dom.el('room-area'), 'change');
    expect(dom.el('room-preset-list').textContent).toBe(UI.presetWaiting);
    dom.el('room-level').value = 'main';
    fire(dom.el('room-form'), 'submit');
    const room = checklist(main).rooms[0];
    expect(liveTasks(main)).toHaveLength(0);
    main.__test__.openTask(room.id, null);
    expect(visible('task')).toBe(false);
    expect(said()).toBe(UI.sheetLoading);
});

// ---- The quote, the menu, and the checklist's tools (M1 piece 3) -------------

test('the quote chip appears with the first task, in words for a screen reader, and opens the breakdown', async () => {
    const main = await homeWithPrices();
    expect(visible('hud-quote')).toBe(false);
    // A powder room alone: toilet $12 and sink $6, well under the $120 minimum.
    dom.el('room-area').value = 'powder-room';
    dom.el('room-level').value = 'main';
    dom.el('room-preset').checked = false;
    fire(dom.el('room-form'), 'submit');
    const room = checklist(main).rooms[0];
    const { addItem } = await import('../www/whitestone/js/store.js');
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: room.id, task: 'toilet' }, CONFIG, new Date()), 'x');
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: room.id, task: 'bathroom-sink' }, CONFIG, new Date()), 'x');

    expect(visible('hud-quote')).toBe(true);
    expect(dom.el('hud-quote-text').textContent).toBe('Your quote: $120, about 10 minutes');
    expect(dom.el('hud-quote').getAttribute('aria-label')).toBe('Your quote, 120 dollars, about 10 minutes. Example prices. Show the breakdown.');

    fire(dom.el('hud-quote'), 'click');
    expect(visible('quote')).toBe(true);
    expect(dom.el('quote-total').textContent).toBe('Your quote: $120');
    expect(dom.el('quote-minimum').textContent).toBe('Visit minimum $120. Add $102 more to reach it, or it rounds up to $120.');
    expect(dom.el('quote-tax').textContent).toBe('Prices are before any sales tax. Priced on service menu cleaning-2026-10.');
    const breakdown = dom.el('quote-breakdown').children;
    expect(breakdown[0].children[0].textContent).toBe('Powder room$18');
    const sums = breakdown[breakdown.length - 1].children.map((r) => r.textContent);
    expect(sums).toEqual(['Tasks$18', 'Minimum top-up$102', 'Total$120']);

    fire(dom.el('quote-open-checklist'), 'click');
    expect(visible('checklist')).toBe(true);
});

test('a big enough home says the minimum is met, and a task the menu no longer has is named as a problem', async () => {
    const main = await homeWithPrices();
    await addKitchen(main);
    const { addItem } = await import('../www/whitestone/js/store.js');
    const kitchen = checklist(main).rooms[0];
    // The kitchen preset is $61, the oven $30, and ten windows $50: $141.
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: kitchen.id, task: 'oven-interior' }, CONFIG, new Date()), 'x');
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: kitchen.id, task: 'interior-windows', quantity: 10 }, CONFIG, new Date()), 'x');
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: kitchen.id, task: 'retired-task' }, CONFIG, new Date()), 'x');
    main.__test__.openQuote();
    expect(dom.el('quote-total').textContent).toBe('Your quote: $141');
    expect(dom.el('quote-minimum').textContent).toBe('The visit minimum of $120 is met.');
    expect(dom.el('quote-problems').hidden).toBe(false);
    expect(dom.el('quote-problems').textContent).toBe(UI.cannotPrice(1));
});

test('the service menu shows a room kind\'s tasks with their prices, and adds one to a room of that kind', async () => {
    const main = await homeWithPrices();
    const kitchen = await addKitchen(main);
    fire(dom.el('help-menu'), 'click');
    expect(visible('menu')).toBe(true);
    expect(dom.el('menu-area').value).toBe('kitchen');
    const rows = dom.el('menu-list').children;
    const row = (name) => [...rows].find((r) => r.children[0].children[0].textContent === name);
    expect(row('Stovetop').children[0].children[1].textContent).toBe('$10 each time, about 5 minutes');
    expect(row('Countertops').children[0].children[1].textContent).toBe('$7.50 small room, $10 medium, $15 large, about 8 minutes');
    expect(row('Interior windows').children[0].children[1].textContent).toBe('$5 each, about 4 minutes');
    expect(row('Stovetop').children[0].children[3].textContent).toBe('Deep clean adds $5');

    fire(row('Oven interior').children[1].children[0], 'click');
    expect(visible('task')).toBe(true);
    expect(dom.el('task-task').value).toBe('oven-interior');
    fire(dom.el('task-form'), 'submit');
    expect(liveTasks(main).filter((i) => i.roomId === kitchen.id && i.task === 'oven-interior')).toHaveLength(1);

    dom.el('menu-area').value = 'bathroom';
    fire(dom.el('menu-area'), 'change');
    expect(dom.el('menu-note').textContent).toBe('Your checklist has no bathroom yet. Add one to order these.');
    expect([...dom.el('menu-list').children].every((r) => r.children.length === 1)).toBe(true);
});

test('the menu can be browsed before there is a checklist, and waits for prices', async () => {
    let main = await boot();
    fire(dom.el('help-menu'), 'click');
    expect(visible('menu')).toBe(false);
    expect(said()).toBe(UI.sheetLoading);

    jest.resetModules();
    dom.uninstall();
    installThree();
    dom = installDom();
    serveSheet();
    main = await boot();
    await flushAsync(20);
    fire(dom.el('help-menu'), 'click');
    expect(visible('menu')).toBe(true);
    expect(dom.el('menu-note').textContent).toBe(UI.menuNoChecklist);
    expect(main.getState().sheetStatus).toBe('ready');
});

test('tasks move up and down in their room as one undo step each, and the ends cannot move further', async () => {
    const main = await homeWithPrices();
    const kitchen = await addKitchen(main);
    const order = () => checklist(main).items.filter((i) => i.roomId === kitchen.id && !i.deletedAt)
        .sort((a, b) => a.order - b.order).map((i) => i.task);
    const before = order();
    const first = liveTasks(main).find((i) => i.task === before[0]);
    const second = liveTasks(main).find((i) => i.task === before[1]);
    expect(bodyButton(UI.moveUp, `task-name-${first.id}`).disabled).toBe(true);

    main.__test__.moveTask(second.id, -1);
    expect(order().slice(0, 2)).toEqual([before[1], before[0]]);
    expect(said()).toBe(UI.moved('Kitchen sink'));
    main.__test__.moveTask(second.id, -1);   // already first
    expect(order().slice(0, 2)).toEqual([before[1], before[0]]);
    fire(dom.el('ws-undo'), 'click');
    expect(order()).toEqual(before);
});

test('the filter shows the important tasks, or one level, and says how many it shows', async () => {
    const main = await homeWithPrices();
    await addKitchen(main);
    const stove = liveTasks(main).find((i) => i.task === 'stovetop');
    const { updateItem } = await import('../www/whitestone/js/store.js');
    main.__test__.mutate((d) => updateItem(d, checklist(main).id, stove.id, { important: true }, CONFIG, new Date()), 'x');

    expect(options('checklist-filter')).toEqual(['all', 'important', 'level:main', 'level:second']);
    dom.el('checklist-filter').value = 'important';
    fire(dom.el('checklist-filter'), 'change');
    expect(dom.el('checklist-showing').textContent).toBe('Showing 1 of 9 tasks.');
    expect(() => bodyButton(UI.edit, `task-name-${stove.id}`)).not.toThrow();

    dom.el('checklist-filter').value = 'level:second';
    fire(dom.el('checklist-filter'), 'change');
    expect(dom.el('checklist-showing').textContent).toBe('Showing 0 of 9 tasks.');

    dom.el('checklist-filter').value = 'all';
    fire(dom.el('checklist-filter'), 'change');
    expect(dom.el('checklist-showing').hidden).toBe(true);
});

test('Print hands the checklist to the browser\'s print', async () => {
    await homeWithPrices();
    let printed = 0;
    dom.windowStub.print = () => { printed++; };
    fire(dom.el('room-cancel'), 'click');
    fire(dom.el('help-checklist'), 'click');
    fire(dom.el('checklist-print'), 'click');
    expect(printed).toBe(1);
});

// ---- The example home (M1 piece 4) -------------------------------------------

test('the example, asked for on a first visit, is priced and opens in full, and nothing is saved yet', async () => {
    serveSheet();
    const main = await boot({ example: true });
    await flushAsync(20);
    expect(main.getState().storageStatus).toBe('fresh');
    const doc = main.getDoc();
    expect(doc.settings.activeId).toBe('example-home-1');
    expect(dom.el('hud-home').textContent).toBe('Example home');
    expect(visible('help-checklist')).toBe(true);
    expect(visible('hud-quote')).toBe(true);
    expect(dom.el('hud-quote-text').textContent).toMatch(/^Your quote: \$\d+/);
    // Shown, not saved: nothing is written until the visitor changes something.
    expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();

    fire(dom.el('help-checklist'), 'click');
    expect(dom.el('checklist-summary').textContent).toMatch(/^13 rooms, 27 tasks, \$/);
});

test('My checklists marks the example, offers no duplicate of it, and clears it with an undo', async () => {
    const main = await boot({ example: true });
    fire(dom.el('help-mine'), 'click');
    const row = dom.el('my-list').children[0];
    expect(row.children[0].children[1].textContent).toBe(UI.example);
    expect(row.children[1].children.map((b) => b.textContent)).toEqual([UI.current, UI.remove]);
    expect(visible('my-clear-example')).toBe(true);

    fire(dom.el('my-clear-example'), 'click');
    expect(main.getDoc().checklists).toHaveLength(0);
    expect(main.getDoc().settings.activeId).toBeNull();
    expect(visible('my-clear-example')).toBe(false);
    expect(dom.el('toast-text').textContent).toBe(UI.exampleCleared);
    // Cleared for good: the change is saved, so the next visit is not a first one.
    expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).checklists).toHaveLength(0);

    fire(dom.el('toast-undo'), 'click');
    expect(main.getDoc().checklists[0].id).toBe('example-home-1');
});

test('starting your own from the example keeps the example in the list, and a returning visitor is not given it again', async () => {
    const main = await boot({ example: true });
    await startHome(main, { title: 'Our place' });
    const doc = main.getDoc();
    expect(doc.checklists.map((c) => c.title)).toEqual(['Example home', 'Our place']);
    expect(doc.settings.activeId).toBe(doc.checklists[1].id);
    expect(dom.el('hud-home').textContent).toBe('Our place');
});

test('UNDO ACROSS EVERY KIND OF CHANGE walks the document back to exactly where it began', async () => {
    const main = await homeWithPrices();
    // homeWithPrices made one step (starting the home), so begin from before it.
    const t = main.__test__;
    const steps = [];
    const record = () => steps.push(JSON.stringify(main.getDoc()));
    record();
    const kitchen = await addKitchen(main); record();
    const stove = liveTasks(main).find((i) => i.task === 'stovetop');
    t.moveTask(stove.id, 1); record();
    fire(bodyButton(UI.edit, `task-name-${stove.id}`), 'click');
    dom.el('task-notes').value = 'Gently.';
    fire(dom.el('task-form'), 'submit'); record();
    t.removeTask(stove.id); record();
    fire(bodyButton(UI.editRoom, `room-name-${kitchen.id}`), 'click');
    dom.el('room-label').value = 'Big kitchen';
    fire(dom.el('room-form'), 'submit'); record();
    fire(dom.el('help-prefs'), 'click');
    prefsBox('fragrance-free').checked = true;
    fire(dom.el('prefs-form'), 'submit'); record();
    fire(dom.el('help-home'), 'click');
    dom.el('setup-title').value = 'Renamed';
    fire(dom.el('setup-form'), 'submit'); record();
    t.duplicate(checklist(main).id); record();

    // Each undo lands exactly on the document before that step.
    for (let i = steps.length - 2; i >= 0; i--) {
        t.undo();
        expect(JSON.stringify(main.getDoc())).toBe(steps[i]);
    }
    t.undo();   // and the first step, starting the home
    expect(main.getDoc().checklists).toHaveLength(0);
    expect(t.history().canUndo).toBe(false);
});
