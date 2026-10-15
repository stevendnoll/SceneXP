// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The cleaner's page (www/whitestone/tasks/, M4 piece 1, PRD 12, PLANNING 8
 * and 10.3): a checklist published in the studio opens from its share link
 * and PIN. The key leaves the address bar and stays on the device, the
 * visit token is kept for its hours, wrong PINs are counted, the sealed
 * checklist opens with the key, its quote is worked out again from the
 * sheet it was quoted on, and the view puts the care preferences first,
 * then the home, Start here, and every room's tasks with their photos.
 *
 * Runs on Node's WebCrypto, the stand-in in memory and the DOM stub, on a
 * pinned clock.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { publish } from '../www/whitestone/js/sync.js';
import { createApi } from '../www/whitestone/js/api.js';
import { createStandin } from '../www/whitestone/js/standin.js';
import { createMemoryBackend, createPhotoStore } from '../www/whitestone/js/photos.js';
import { createSealer } from '../www/whitestone/js/seal.js';
import { emptyDoc, createChecklist, addRoom, addPhoto, setPublication, findChecklist, updateItem, setPreferences } from '../www/whitestone/js/store.js';
import { checkChoice, presetFor } from '../www/whitestone/js/sheet.js';
import { buildShare } from '../www/whitestone/js/links.js';
import { TASKS_PAGE as COPY } from '../www/whitestone/js/copy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const SCHEDULE = JSON.parse(readFileSync(join(WS, 'data', 'schedule.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const START = Date.parse('2026-10-14T16:00:00Z');
const NOW = new Date(START);
const SLOT = { date: '2026-10-16', time: '09:00', minutes: 120 };
const check = (choice, area, bath) => checkChoice(SHEET, choice, area, bath);
const PHOTO = 'photo-aaaaaaaaaaaaaaaa';

let dom;
let page;

beforeEach(async () => {
    // The DOM stub wraps the three.js stub, so it goes in first (the page
    // itself has no three.js).
    installThree();
    dom = installDom();
    globalThis.window.__whitestoneTasksTest = true;
    page = await import('../www/whitestone/tasks/js/main.js');
});

afterEach(() => {
    dom.uninstall();
    jest.resetModules();
});

/** A home published as the studio publishes it: a kitchen on the main
 *  floor and a bathroom upstairs, the stovetop starred, with a note, an
 *  avoid line and a photo, and care preferences. */
async function published({ prefs = true } = {}) {
    let doc = emptyDoc(CONFIG, NOW);
    doc = createChecklist(doc, { title: 'Maple Street', levels: ['main', 'second'], household: 'The side door sticks.' }, CONFIG, NOW, { id: 'checklist-1' }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'main', area: 'kitchen' }, CONFIG, NOW, { id: 'kitchen-1', check, presetItems: presetFor(SHEET, 'kitchen') }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'second', area: 'bathroom' }, CONFIG, NOW, { id: 'bathroom-1', check, presetItems: presetFor(SHEET, 'bathroom') }).doc;
    const stove = findChecklist(doc, 'checklist-1').items.find((i) => i.task === 'stovetop');
    doc = updateItem(doc, 'checklist-1', stove.id, { important: true, notes: 'Under the grates too.', avoid: 'No abrasive pads.' }, CONFIG, NOW, { check }).doc;
    doc = addPhoto(doc, 'checklist-1', stove.id, PHOTO, CONFIG, NOW).doc;
    if (prefs) doc = setPreferences(doc, 'checklist-1', { keys: ['fragrance-free', 'no-bleach'], note: 'Please keep the gate closed.' }, CONFIG, NOW).doc;
    const photos = createPhotoStore(createMemoryBackend(), CONFIG);
    await photos.put(PHOTO, { full: new Blob([new Uint8Array([1, 2, 3])]), thumb: new Blob([new Uint8Array([4])]) });
    let t = START;
    const standin = createStandin({ backend: createMemoryBackend(), config: CONFIG, schedule: SCHEDULE, now: () => t });
    const api = createApi((req) => standin.handle(req));
    const box = { doc };
    const record = async (patch) => {
        const r = setPublication(box.doc, 'checklist-1', patch, CONFIG, new Date(t));
        box.doc = r.doc;
        return r.record;
    };
    const sealer = createSealer();
    const r = await publish({ checklist: findChecklist(box.doc, 'checklist-1'), api, sealer, photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record });
    if (!r.ok) throw new Error(r.error);
    const c = findChecklist(box.doc, 'checklist-1');
    return {
        api, sealer, checklist: c, stove,
        link: buildShare('https://www.scenexp.com', CONFIG, c.published.id, c.published.key),
        advance: (ms) => { t += ms; },
        now: () => t
    };
}

/** The tasks page's files, as the page fetches them (relative to tasks/). */
const fetchJson = async (url) => JSON.parse(readFileSync(join(WS, 'tasks', url), 'utf8'));

/** Run the page on `href` with a device's storage, recording the address
 *  it leaves. */
async function open(w, href, extra = {}) {
    const replaced = [];
    // As the markup ships them (the stub reads no markup).
    dom.el('pin-form').hidden = true;
    dom.el('tasks-view').hidden = true;
    const state = await page.boot({
        doc: globalThis.document, href, storage: globalThis.localStorage,
        history: { replaceState: (_s, _t, url) => replaced.push(url) },
        api: w.api, sealer: w.sealer, fetchJson, now: w.now,
        makeUrl: (blob) => `blob:test/${blob.size}`,
        ...extra
    });
    return { state, replaced };
}

/** Type a PIN and submit, waiting for the answer. */
async function enter(state, pin) {
    dom.el('pin-input').value = pin;
    fire(dom.el('pin-form'), 'submit', { preventDefault() {} });
    await state.pending;
}

const status = () => dom.el('pin-status').textContent;
const view = () => dom.el('tasks-view');
/** Every element under a node, depth first. */
function all(node, out = []) {
    for (const c of node.children || []) {
        out.push(c);
        all(c, out);
    }
    return out;
}
const byClass = (name) => all(view()).filter((e) => e.className && e.className.split(' ').includes(name));

describe('reading the link and the device (pure)', () => {
    test('a PIN is six digits, spaces and dashes forgiven', () => {
        expect(page.readPin('482 913')).toBe('482913');
        expect(page.readPin('482-913')).toBe('482913');
        expect(page.readPin('48291')).toBeNull();
        expect(page.readPin(null)).toBeNull();
    });

    test('which checklist: from a share link, or from the address and the key kept before', async () => {
        const w = await published();
        const id = w.checklist.published.id;
        const key = w.checklist.published.key;
        expect(page.arrival(w.link, { checklists: {} }, CONFIG)).toEqual({ id, key, fromLink: true });
        const bare = `https://www.scenexp.com/whitestone/tasks/?c=${id}`;
        expect(page.arrival(bare, { checklists: {} }, CONFIG)).toBeNull();
        expect(page.arrival(bare, { checklists: { [id]: { key } } }, CONFIG)).toEqual({ id, key, fromLink: false });
        expect(page.arrival('https://www.scenexp.com/whitestone/tasks/', { checklists: {} }, CONFIG)).toBeNull();
        expect(page.arrival('https://www.scenexp.com/whitestone/tasks/?c=nope', { checklists: { nope: { key } } }, CONFIG)).toBeNull();
    });

    test("a visit token opens until its hour, and the device's memory survives anything", () => {
        const at = Date.parse('2026-10-14T12:00:00Z');
        expect(page.tokenValid({ visitToken: 't', expiresAt: '2026-10-14T13:00:00Z' }, at)).toBe(true);
        expect(page.tokenValid({ visitToken: 't', expiresAt: '2026-10-14T11:00:00Z' }, at)).toBe(false);
        expect(page.tokenValid({ visitToken: null, expiresAt: '2026-10-14T13:00:00Z' }, at)).toBe(false);
        const broken = { getItem: () => '{nope' };
        expect(page.readMemory(broken)).toEqual({ checklists: {} });
        expect(page.readMemory(null)).toEqual({ checklists: {} });
    });
});

describe('opening it', () => {
    test('the key leaves the address bar at once and stays on the device; the PIN is asked', async () => {
        const w = await published();
        const { state, replaced } = await open(w, w.link);
        expect(state.phase).toBe('pin');
        expect(replaced).toEqual([`/whitestone/tasks/?c=${w.checklist.published.id}`]);
        const kept = JSON.parse(localStorage.getItem(page.STORAGE_KEY)).checklists[w.checklist.published.id];
        expect(kept.key).toBe(w.checklist.published.key);
        expect(dom.el('pin-form').hidden).toBe(false);
        expect(view().hidden).toBe(true);
    });

    test('a link that is not whole says so, and asks for nothing', async () => {
        const w = await published();
        const { state } = await open(w, 'https://www.scenexp.com/whitestone/tasks/?c=abc');
        expect(state.phase).toBe('no-link');
        expect(dom.el('pin-form').hidden).toBe(true);
        expect(status()).toBe(COPY.badLink);
    });

    test('wrong PINs are said, then warned about; the right one opens the checklist and is remembered', async () => {
        const w = await published();
        const { state } = await open(w, w.link);
        await enter(state, '12345');
        expect(status()).toBe(COPY.incomplete);
        const wrong = w.checklist.published.pin === '000000' ? '111111' : '000000';
        await enter(state, wrong);
        expect(status()).toBe(COPY.denied);
        await enter(state, wrong);
        await enter(state, wrong);
        expect(status()).toBe(COPY.deniedMany);
        await enter(state, w.checklist.published.pin);
        expect(state.phase).toBe('open');
        expect(dom.el('tasks-gate').hidden).toBe(true);
        expect(view().hidden).toBe(false);
        const kept = JSON.parse(localStorage.getItem(page.STORAGE_KEY)).checklists[w.checklist.published.id];
        expect(kept).toMatchObject({ fails: 0 });
        expect(kept.visitToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    test('back within the visit it opens straight away; after the token\'s hours, the PIN again', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        const bare = `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`;
        const again = await open(w, bare);
        expect(again.state.phase).toBe('open');
        expect(again.replaced).toEqual([]);
        w.advance((CONFIG.api.visitHours + 1) * 3600000);
        const later = await open(w, bare);
        expect(later.state.phase).toBe('pin');
    });

    test('a PIN changed by the customer: the kept token is refused, and the PIN is asked again', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        await w.api.resetPin(w.checklist.published.id, w.checklist.published.ownerToken);
        const again = await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        expect(again.state.phase).toBe('pin');
        expect(status()).toBe(COPY.again);
    });

    test('unpublished: the API says only "denied", as for any refusal, so the PIN is asked and then refused', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        await w.api.deleteChecklist(w.checklist.published.id, w.checklist.published.ownerToken);
        const again = await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        expect(status()).toBe(COPY.again);
        await enter(again.state, w.checklist.published.pin);
        expect(status()).toBe(COPY.denied);
        expect(view().hidden).toBe(true);
    });

    test('an answer the server can give but the stand-in never does: gone, offline, or trouble, each said', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        const bare = `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`;
        for (const [error, line] of [['not-found', COPY.gone], ['offline', COPY.offline], ['http-500', COPY.trouble]]) {
            const api = { ...w.api, getChecklist: async () => ({ ok: false, error }) };
            await open({ ...w, api }, bare);
            expect(status()).toBe(line);
        }
    });

    test('a key that does not open it says so', async () => {
        const w = await published();
        const other = await published();
        // The right id with another checklist's key.
        const wrongKey = buildShare('https://www.scenexp.com', CONFIG, w.checklist.published.id, other.checklist.published.key);
        const { state } = await open(w, wrongKey);
        await enter(state, w.checklist.published.pin);
        expect(state.phase).toBe('unreadable');
        expect(status()).toBe(COPY.unreadable);
    });
});

describe('what the cleaner reads', () => {
    async function opened(opts = {}) {
        const w = await published(opts);
        const { state } = await open(w, w.link, opts.extra || {});
        await enter(state, w.checklist.published.pin);
        return { w, state };
    }

    test('care preferences first, then the home: its name, the visit, the quote, its notes', async () => {
        const { state } = await opened();
        const blocks = view().children;
        expect(blocks[0].className).toBe('tasks-prefs');
        expect(blocks[0].textContent).toContain('Fragrance-free products');
        expect(blocks[0].textContent).toContain('No bleach');
        expect(blocks[0].textContent).toContain('Please keep the gate closed.');
        expect(blocks[1].className).toBe('tasks-home');
        // The cleaner's heading, not the customer's name for it (QA, 2026-10-15).
        expect(blocks[1].children[0].textContent).toBe(COPY.heading);
        expect(blocks[1].textContent).not.toContain('Maple Street');
        expect(blocks[1].textContent).toContain('Friday, October 16 at 9:00 am');
        expect(blocks[1].textContent).toMatch(/Quote \$\d+(\.\d\d)?, about /);
        expect(blocks[1].textContent).toContain('The side door sticks.');
        // Quoted on this sheet, worked out the same: no notice.
        expect(state.notice).toBe('');
        expect(state.quote.totalCents).toBe(state.form.quote.totalCents);
        expect(globalThis.document.title).toBe(`${COPY.heading} | ${COPY.pageTitle}`);
    });

    test('no preferences, no banner', async () => {
        await opened({ prefs: false });
        expect(view().children[0].className).toBe('tasks-home');
    });

    test('Start here lists the starred tasks, each with its room, linking to it', async () => {
        const { w } = await opened();
        const start = byClass('tasks-start')[0];
        const links = all(start).filter((e) => e.tagName === 'A');
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe('Stovetop');
        expect(links[0].href).toBe(`#task-${w.stove.id}`);
        expect(start.textContent).toContain(COPY.inRoom('Kitchen'));
    });

    test('every room by level, in the home\'s order, each task with what it is, how long, its notes and its Avoid line', async () => {
        const { state } = await opened();
        expect(byClass('tasks-level-name').map((e) => e.textContent)).toEqual(['Main floor', 'Second floor']);
        expect(byClass('tasks-room-name').map((e) => e.textContent)).toEqual(['Kitchen', 'Bathroom']);
        const tasks = all(view()).filter((e) => e.tagName === 'LI' && e.className.split(' ').includes('task'));
        expect(tasks).toHaveLength(state.form.items.length);
        const stove = tasks.find((t) => t.className.includes('is-starred'));
        expect(stove.textContent).toContain('Stovetop');
        expect(stove.textContent).toContain(COPY.notes);
        expect(stove.textContent).toContain('Under the grates too.');
        expect(byClass('task-avoid')[0].textContent).toBe(`${COPY.avoid} No abrasive pads.`);
        expect(byClass('task-minutes')[0].textContent).toMatch(/^Takes about \d+ minutes$/);
    });

    test('photo thumbnails arrive unsealed, and one opens full screen and closes back to its thumbnail', async () => {
        const { state } = await opened();
        expect(state.thumbs.get(PHOTO)).toBe('blob:test/1');
        const thumb = byClass('task-photo')[0];
        expect(all(thumb)[0].src).toBe('blob:test/1');
        thumb.focus();
        fire(thumb, 'click');
        const overlayNow = () => globalThis.document.body.children.find((c) => c.className === 'photo-view');
        for (let i = 0; i < 100 && !overlayNow(); i++) await new Promise((r) => setTimeout(r, 5));
        const overlay = overlayNow();
        expect(overlay).toBeTruthy();
        expect(all(overlay).find((e) => e.tagName === 'IMG').src).toBe('blob:test/3');
        fire(all(overlay).find((e) => e.tagName === 'BUTTON'), 'click');
        expect(globalThis.document.body.children.includes(overlay)).toBe(false);
        expect(thumb.focused).toBe(true);
    });

    test('quoted on figures that differ from the sheet now: said, and the sheet\'s figures shown', async () => {
        const changed = async (url) => {
            const json = await fetchJson(url);
            if (url.endsWith(`${SHEET.version}.json`)) json.visitMinimumCents += 1000;
            return json;
        };
        const { state } = await opened({ extra: { fetchJson: changed } });
        expect(state.notice).toBe(COPY.quoteChanged);
        expect(byClass('tasks-notice')[0].textContent).toBe(COPY.quoteChanged);
    });

    test('without the sheet the checklist still opens, every task by its key, and says why prices are missing', async () => {
        const { state } = await opened({ extra: { fetchJson: async () => { throw new Error('offline'); } } });
        expect(state.phase).toBe('open');
        expect(state.notice).toBe(COPY.noSheet);
        expect(byClass('task-minutes')).toHaveLength(0);
    });
});
