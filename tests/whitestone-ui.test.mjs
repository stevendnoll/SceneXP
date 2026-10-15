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
 *   - Start your own, care preferences, undo (button and keyboard),
 *     another tab, and a browser that will not save.
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
import { UI, GUIDE } from '../www/whitestone/js/copy.js';

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
        const built = /^(setup-levels-|prefs-)/;
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
/** A fact at a glance in Maya's bubble (quote, visit): its button, or
 *  undefined; and its value and note, as shown. */
const fact = (key) => dom.el('host-facts').children.find((b) => b.id === `host-fact-${key}`);
const factValue = (key) => (fact(key) ? fact(key).children[1].textContent : undefined);
/** Undo from the keyboard (the floating Undo is gone, Steve 2026-10-14). */
const ctrlZ = () => fire(dom.windowStub, 'keydown', { key: 'z', ctrlKey: true, target: dom.documentStub.body });

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

/** A new checklist's setup card, reached without the guide (editHome's
 *  own way, with no home open: startOwn). */
function newHome(main) {
    main.__test__.startOwn();
}

/** Fill in and submit the setup card for a new home. */
async function startHome(main, { levels = ['main', 'second'] } = {}) {
    newHome(main);
    expect(visible('setup')).toBe(true);
    // A box the card has locked (the main floor) is left as the card has it.
    for (const key of ['basement', 'main', 'second', 'attic']) {
        const input = box('setup-levels-list', key);
        if (!input.disabled) input.checked = levels.includes(key);
    }
    dom.el('setup-household').value = 'Parking in the driveway.';
    fire(dom.el('setup-form'), 'submit');
    return main;
}

test('the old Help items open nothing: the checklist is Maya\'s alone (Steve, 2026-10-15)', async () => {
    const main = await boot();
    expect(main.getState().storageStatus).toBe('restored');
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    const cards = ['checklist', 'setup', 'preferences', 'quote'];
    const { closeCard } = await import('../www/whitestone/js/cards.min.js');
    for (const id of cards) closeCard(id);
    expect(cards.filter(visible)).toEqual([]);
    for (const id of ['help-again', 'help-mine', 'help-menu', 'help-checklist', 'help-home', 'help-prefs', 'help-rooms']) {
        fire(dom.el(id), 'click');
        expect(cards.filter(visible)).toEqual([]);
    }
    // No fetch here, so the price sheet waits and nothing breaks.
    expect(main.getState().sheetStatus).toBe('failed');
});

test('Start your own: setup makes the checklist, opens it, and offers care preferences once', async () => {
    const main = await boot();
    await startHome(main);

    const doc = main.getDoc();
    expect(doc.checklists).toHaveLength(1);
    const c = doc.checklists[0];
    // No name is asked for any more (QA, 2026-10-15): every home is "Our home".
    expect(c).toMatchObject({ title: GUIDE.defaultTitle, levels: ['main', 'second'], household: 'Parking in the driveway.' });
    expect(HTML).not.toMatch(/setup-title"|Name this checklist/);
    expect(doc.settings.activeId).toBe(c.id);
    expect(saved().checklists[0].title).toBe(GUIDE.defaultTitle);

    expect(visible('setup')).toBe(false);
    expect(visible('preferences')).toBe(true);
    // Said, not shown: the Undo pill is for removals only (Steve, 2026-10-15).
    expect(said()).toBe(UI.started(GUIDE.defaultTitle));
    expect(dom.el('toast-text').textContent).not.toBe(UI.started(GUIDE.defaultTitle));

    prefsBox('no-bleach').checked = true;
    prefsBox('pets-home').checked = true;
    dom.el('prefs-note').value = 'Please keep the gate closed.';
    fire(dom.el('prefs-form'), 'submit');
    expect(main.getDoc().checklists[0].preferences).toEqual({ keys: ['no-bleach', 'pets-home'], note: 'Please keep the gate closed.' });
    expect(visible('preferences')).toBe(false);
    expect(said()).toBe(UI.preferencesSaved);
});

test('the setup card keeps the main floor ticked, says why, and a home with no other floor has just it (QA, 2026-10-15)', async () => {
    const main = await boot();
    newHome(main);
    const mainBox = box('setup-levels-list', 'main');
    expect(mainBox.checked).toBe(true);
    expect(mainBox.disabled).toBe(true);
    expect(mainBox.getAttribute('aria-describedby')).toBe('setup-levels-note');
    expect(HTML).toMatch(/<p id="setup-levels-note" class="form-hint">([^<]+)<\/p>/);
    expect(HTML.match(/<p id="setup-levels-note" class="form-hint">([^<]+)<\/p>/)[1]).toBe(GUIDE.mainAlways);
    fire(dom.el('setup-cancel'), 'click');
    await startHome(main, { levels: [] });
    expect(main.getDoc().checklists[0].levels).toEqual(['main']);
});

test('editing the home changes its details and its levels, and a level with rooms cannot go', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    main.__test__.editHome();
    expect(dom.el('setup-household').value).toBe('Parking in the driveway.');
    expect(box('setup-levels-list', 'second').checked).toBe(true);
    dom.el('setup-household').value = 'Parking on the street.';
    box('setup-levels-list', 'basement').checked = true;
    fire(dom.el('setup-form'), 'submit');
    expect(main.getDoc().checklists[0]).toMatchObject({ household: 'Parking on the street.', levels: ['basement', 'main', 'second'] });
    expect(said()).toBe(UI.homeSaved);
});

test('undo takes back each step from the keyboard, but not inside a text field', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    main.__test__.editHome();
    dom.el('setup-household').value = 'Gate code 1234.';
    fire(dom.el('setup-form'), 'submit');
    expect(main.getDoc().checklists[0].household).toBe('Gate code 1234.');

    // Ctrl+Z typed into a text box is the text box's own undo.
    fire(dom.windowStub, 'keydown', { key: 'z', ctrlKey: true, target: { tagName: 'TEXTAREA' } });
    expect(main.getDoc().checklists[0].household).toBe('Gate code 1234.');

    fire(dom.windowStub, 'keydown', { key: 'z', metaKey: true, target: dom.documentStub.body });
    expect(main.getDoc().checklists[0].household).toBe('Parking in the driveway.');
    expect(said()).toBe(UI.undone(UI.labels.home));

    // The last step: the home itself.
    ctrlZ();
    expect(main.getDoc().checklists).toHaveLength(0);
    expect(saved().checklists).toHaveLength(0);
    // Ctrl+Z with nothing to undo says so.
    fire(dom.windowStub, 'keydown', { key: 'z', ctrlKey: true, target: dom.documentStub.body });
    expect(said()).toBe(UI.nothingToUndo);
});

test('a change in another tab is followed, and undo steps from before it are dropped', async () => {
    const main = await boot();
    await startHome(main);
    fire(dom.el('prefs-skip'), 'click');
    const theirs = saved();
    theirs.checklists[0].household = 'Theirs';
    localStorage.setItem(CONFIG.storage.key, JSON.stringify(theirs));
    fire(dom.windowStub, 'storage', { key: 'some-other-scene' });
    expect(main.getDoc().checklists[0].household).toBe('Parking in the driveway.');
    fire(dom.windowStub, 'storage', { key: CONFIG.storage.key });
    expect(main.getDoc().checklists[0].household).toBe('Theirs');
    expect(main.__test__.history().canUndo).toBe(false);
    expect(said()).toBe(UI.otherTab);
});

test('a browser that will not save says so in the checklist card', async () => {
    localStorage.getItem = () => { throw new Error('denied'); };
    const main = await boot();
    expect(main.getState().storageStatus).toBe('unavailable');
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
    await startHome(main);
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
    expect(said()).toBe(UI.roomAdded('Kitchen', 9));
    expect(dom.el('toast-text').textContent).not.toBe(UI.roomAdded('Kitchen', 9));
    expect(visible('room')).toBe(false);
    expect(visible('checklist')).toBe(true);
    expect(dom.el('checklist-summary').textContent).toMatch(/^1 room, 9 tasks, \$/);

    // One undo (from the keyboard now) takes the room and all nine tasks back.
    main.__test__.undo();
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
    expect(said()).toBe(UI.taskAdded('Oven interior', 'Kitchen'));
    expect(dom.el('toast-text').textContent).not.toBe(UI.taskAdded('Oven interior', 'Kitchen'));
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
    // A removal keeps its pill, with Undo.
    expect(visible('ws-toast')).toBe(true);
    expect(dom.el('toast-text').textContent).toBe(UI.taskRemoved('Stovetop'));
    expect(visible('toast-undo')).toBe(true);
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
    expect(dom.el('toast-text').textContent).toBe(UI.roomRemoved('Kitchen'));
    expect(visible('toast-undo')).toBe(true);
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

test('the quote appears in Maya\'s bubble with the first task, in words for a screen reader, and opens the breakdown', async () => {
    const main = await homeWithPrices();
    main.__test__.showGuide();
    expect(fact('quote')).toBeUndefined();
    // A half bath alone: toilet $12 and sink $6, well under the $120 minimum.
    // A half bath is a bathroom's third type of bath on the card.
    dom.el('room-area').value = 'bathroom';
    fire(dom.el('room-area'), 'change');
    // The radios are built, so they are reached through their list; and the
    // stub leaves a radio's group alone, as a browser would not.
    const radios = dom.el('room-bath-list').children.map((row) => row.children[0]);
    expect(radios.map((r) => r.value)).toEqual(['tub', 'shower', 'half']);
    radios.forEach((r) => { r.checked = r.value === 'half'; });
    dom.el('room-level').value = 'main';
    dom.el('room-preset').checked = false;
    fire(dom.el('room-form'), 'submit');
    const room = checklist(main).rooms[0];
    const { addItem } = await import('../www/whitestone/js/store.js');
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: room.id, task: 'toilet' }, CONFIG, new Date()), 'x');
    main.__test__.mutate((d) => addItem(d, checklist(main).id, { roomId: room.id, task: 'bathroom-sink' }, CONFIG, new Date()), 'x');

    expect(factValue('quote')).toBe('$120');
    expect(fact('quote').getAttribute('aria-label')).toBe('Your quote, 120 dollars, about 10 minutes. Example prices. Show the breakdown.');

    fire(fact('quote'), 'click');
    expect(visible('quote')).toBe(true);
    expect(dom.el('quote-total').textContent).toBe('Your quote: $120');
    expect(dom.el('quote-minimum').textContent).toBe('Visit minimum $120. Add $102 more to reach it, or it rounds up to $120.');
    expect(dom.el('quote-tax').textContent).toBe('Prices are before any sales tax. Priced on service menu cleaning-2026-10.');
    const breakdown = dom.el('quote-breakdown').children;
    expect(breakdown[0].children[0].textContent).toBe('Half bath$18');
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

test('the quote shows the care preferences, read-only, and none when there are none (QA, 2026-10-15)', async () => {
    const main = await homeWithPrices();
    await addKitchen(main);
    main.__test__.openQuote();
    expect(dom.el('quote-prefs').hidden).toBe(true);
    const { setPreferences } = await import('../www/whitestone/js/store.js');
    main.__test__.mutate((d) => setPreferences(d, checklist(main).id, { keys: ['pets-home', 'no-bleach'], note: 'Please keep the gate closed.' }, CONFIG, new Date()), 'x');
    expect(dom.el('quote-prefs').hidden).toBe(false);
    // In the taxonomy's order and words, as the cleaner's page reads them.
    expect(dom.el('quote-prefs-list').children.map((li) => li.textContent)).toEqual(['No bleach', 'Pets at home']);
    expect(dom.el('quote-prefs-note').textContent).toBe('Please keep the gate closed.');
    expect(dom.el('quote-prefs-note').hidden).toBe(false);
    // A note alone shows the note alone; nothing, nothing.
    main.__test__.mutate((d) => setPreferences(d, checklist(main).id, { keys: [], note: 'Gate code 1234.' }, CONFIG, new Date()), 'x');
    expect(dom.el('quote-prefs').hidden).toBe(false);
    expect(dom.el('quote-prefs-list').hidden).toBe(true);
    main.__test__.mutate((d) => setPreferences(d, checklist(main).id, { keys: [], note: '' }, CONFIG, new Date()), 'x');
    expect(dom.el('quote-prefs').hidden).toBe(true);
    // Read-only: nothing in it to press.
    expect(HTML.slice(HTML.indexOf('id="quote-prefs"'), HTML.indexOf('id="quote-tax"'))).not.toMatch(/<button|<a /);
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
    ctrlZ();
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
    const main = await homeWithPrices();
    let printed = 0;
    dom.windowStub.print = () => { printed++; };
    fire(dom.el('room-cancel'), 'click');
    main.__test__.openChecklistView();
    fire(dom.el('checklist-print'), 'click');
    expect(printed).toBe(1);
});

test('on paper the checklist runs on for as many pages as it needs (QA, 2026-10-15: one page only)', () => {
    // The shared sheet holds every 3D page to one screen...
    const shared = readFileSync(join(WS, '..', 'shared', 'css', 'styles-1.0.0.css'), 'utf8');
    expect(shared).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/);
    // ...so the print block lets the page grow and overflow again, ahead of
    // everything else it does.
    const css = readFileSync(join(WS, 'css', 'experience.css'), 'utf8');
    const print = css.slice(css.indexOf('@media print {'));
    expect(print).toMatch(/^@media print \{\s*(\/\*[\s\S]*?\*\/\s*)?html,\s*body\s*\{\s*height:\s*auto;\s*overflow:\s*visible;\s*\}/);
    expect(print).toMatch(/#checklist \.card-panel \{[^}]*height: auto;[^}]*max-height: none;[^}]*overflow: visible;/);
});

// ---- The example home (M1 piece 4) -------------------------------------------

test('the example, asked for on a first visit, is priced and opens in full, and nothing is saved yet', async () => {
    serveSheet();
    const main = await boot({ example: true });
    await flushAsync(20);
    expect(main.getState().storageStatus).toBe('fresh');
    const doc = main.getDoc();
    expect(doc.settings.activeId).toBe('example-home-1');
    main.__test__.showGuide();
    expect(factValue('quote')).toMatch(/^\$\d+(\.\d\d)?$/);
    // Shown, not saved: nothing is written until the visitor changes something.
    expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();

    main.__test__.openChecklistView();
    expect(dom.el('checklist-summary').textContent).toMatch(/^13 rooms, 27 tasks, \$/);
});

test('starting your own from the example keeps the example beside it, and makes your own the open one', async () => {
    const main = await boot({ example: true });
    await startHome(main);
    const doc = main.getDoc();
    expect(doc.checklists.map((c) => c.title)).toEqual(['Example home', GUIDE.defaultTitle]);
    expect(doc.settings.activeId).toBe(doc.checklists[1].id);
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
    main.__test__.openPreferences();
    prefsBox('fragrance-free').checked = true;
    fire(dom.el('prefs-form'), 'submit'); record();
    main.__test__.editHome();
    dom.el('setup-household').value = 'Gate code 1234.';
    fire(dom.el('setup-form'), 'submit'); record();

    // Each undo lands exactly on the document before that step.
    for (let i = steps.length - 2; i >= 0; i--) {
        t.undo();
        expect(JSON.stringify(main.getDoc())).toBe(steps[i]);
    }
    t.undo();   // and the first step, starting the home
    expect(main.getDoc().checklists).toHaveLength(0);
    expect(t.history().canUndo).toBe(false);
});
