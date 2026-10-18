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
import { SKIP_REASONS, WORDS_MAX, emptyProgress, cleanMark, cleanProgress, applyMark, summarize } from '../www/whitestone/tasks/js/visit.js';
import { ADDON_FORMAT, choicesFor, choiceKey, priceOf, addOnName, cleanProposal, cleanDecision, cleanKept, takenKeys, roomOf } from '../www/whitestone/tasks/js/addons.js';
import { contextFor } from '../www/whitestone/js/seal.js';
import { taskOf } from '../www/whitestone/js/sheet.js';
import { formatMoney, formatMinutes } from '../www/whitestone/js/pricing.js';

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
/** The page's timers, held here to run by hand: a poll is a call, not a wait. */
let timers;
/** How often the page asks after the checklist itself (QA, 2026-10-15). */
const FORM_POLL = CONFIG.api.checklistPollSeconds * 1000;
/** Those timers, still to run. */
const formTimers = () => timers.filter((t) => !t.cleared && !t.ran && t.ms === FORM_POLL);

beforeEach(async () => {
    // The DOM stub wraps the three.js stub, so it goes in first (the page
    // itself has no three.js).
    installThree();
    dom = installDom();
    globalThis.window.__whitestoneTasksTest = true;
    timers = [];
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
        // This device's sealed copies (the page's IndexedDB cache).
        cache: createMemoryBackend(),
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
        api: w.api, sealer: w.sealer, fetchJson, now: w.now, cache: w.cache,
        makeUrl: (blob) => `blob:test/${blob.size}`,
        setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimer: (n) => { if (timers[n - 1]) timers[n - 1].cleared = true; },
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
            // A device with no copy kept (one with a copy opens it: below).
            await open({ ...w, api, cache: createMemoryBackend() }, bare);
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
        // Modal for the keyboard too (the accessibility sweep, 2026-10-16):
        // Tab stays on its one button, either way.
        const closeBtn = all(overlay).find((e) => e.tagName === 'BUTTON');
        for (const shiftKey of [false, true]) {
            let kept = false;
            fire(globalThis.document, 'keydown', { key: 'Tab', shiftKey, preventDefault() { kept = true; } });
            expect(kept).toBe(true);
            expect(globalThis.document.activeElement).toBe(closeBtn);
        }
        fire(closeBtn, 'click');
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

// ---- The visit (M4 piece 2) ---------------------------------------------------

describe('the visit, as the cleaner marks it (pure)', () => {
    const form = { items: [{ id: 'a', important: true }, { id: 'b', important: true }, { id: 'c' }, { id: 'd' }] };

    test('a mark is done, or skipped with a quick reason or a few words; anything else is no mark', () => {
        expect(cleanMark({ status: 'done', extra: 1 })).toEqual({ status: 'done' });
        expect(cleanMark({ status: 'skipped', reason: 'no-time' })).toEqual({ status: 'skipped', reason: 'no-time', words: '' });
        expect(cleanMark({ status: 'skipped', words: '  The   dog was asleep there.  ' })).toEqual({ status: 'skipped', reason: null, words: 'The dog was asleep there.' });
        expect(cleanMark({ status: 'skipped', words: 'x'.repeat(500) }).words).toHaveLength(WORDS_MAX);
        // A skip that does not say why is not yet a skip.
        expect(cleanMark({ status: 'skipped' })).toBeNull();
        expect(cleanMark({ status: 'skipped', reason: 'made-up', words: '   ' })).toBeNull();
        expect(cleanMark({ status: 'later' })).toBeNull();
        expect(cleanMark(null)).toBeNull();
        expect(SKIP_REASONS.every((k) => typeof COPY.reasons[k] === 'string')).toBe(true);
    });

    test('outcomes, never a timeline: no time and no order is kept with a mark', () => {
        const p = applyMark(emptyProgress(), 'a', { status: 'done', at: '2026-10-16T09:12:00Z', order: 3 });
        expect(p.marks.a).toEqual({ status: 'done' });
        expect(JSON.stringify(p)).not.toMatch(/\d{4}-\d{2}-\d{2}|"at"|"order"/);
    });

    test('marks change and clear, each a new progress; a mark that says nothing changes nothing', () => {
        const p0 = emptyProgress();
        const p1 = applyMark(p0, 'a', { status: 'done' });
        expect(p0.marks).toEqual({});
        const p2 = applyMark(p1, 'a', { status: 'skipped', reason: 'no-access' });
        expect(p2.marks.a).toEqual({ status: 'skipped', reason: 'no-access', words: '' });
        expect(applyMark(p2, 'a', null).marks).toEqual({});
        expect(applyMark(p2, 'b', { status: 'skipped' })).toBe(p2);
    });

    test('progress read back from the device keeps only good marks', () => {
        expect(cleanProgress({ marks: { a: { status: 'done' }, b: { status: 'nope' }, c: 'x' } })).toEqual({ marks: { a: { status: 'done' } } });
        expect(cleanProgress(null)).toEqual({ marks: {} });
        expect(cleanProgress('garbage')).toEqual({ marks: {} });
    });

    test('where it stands: done, skipped, to go, and the starred, over the checklist\'s own tasks', () => {
        let p = emptyProgress();
        expect(summarize(form, p)).toMatchObject({ total: 4, done: 0, skipped: 0, toGo: 4, starred: 2, starredToGo: 2 });
        p = applyMark(p, 'a', { status: 'done' });
        p = applyMark(p, 'c', { status: 'skipped', reason: 'no-time' });
        // A mark for a task since taken off the checklist does not count.
        p = applyMark(p, 'gone', { status: 'done' });
        expect(summarize(form, p)).toEqual({ total: 4, done: 1, skipped: 1, toGo: 2, starred: 2, starredDone: 1, starredSkipped: 0, starredToGo: 1 });
        p = applyMark(p, 'b', { status: 'skipped', reason: 'customer-asked' });
        expect(summarize(form, p)).toMatchObject({ starredDone: 1, starredSkipped: 1, starredToGo: 0 });
    });
});

describe('the cleaner\'s usage beacons (Steve, 2026-10-16)', () => {
    test('the PIN\'s result (never the PIN), then each tap one beacon, every action cleaner-...', async () => {
        const w = await published();
        const sent = [];
        const { state } = await open(w, w.link, { track: (action, params) => sent.push([action, params]) });
        const button = (id) => all(view()).find((e) => e.id === id);
        await enter(state, '12');
        const wrong = w.checklist.published.pin === '000000' ? '111111' : '000000';
        await enter(state, wrong);
        await enter(state, w.checklist.published.pin);
        expect(sent.map(([a, p]) => `${a} ${p.outcome}`)).toEqual(['cleaner-open incomplete', 'cleaner-open denied', 'cleaner-open ok']);
        expect(JSON.stringify(sent)).not.toContain(w.checklist.published.pin);
        // A tap reaches the page's one listener as a browser bubbles it.
        const done = button(`done-${w.stove.id}`);
        fire(globalThis.document, 'click', { target: done });
        fire(globalThis.document, 'click', { target: button(`skip-${w.stove.id}`) });
        expect(sent.slice(3)).toEqual([['cleaner-done', {}], ['cleaner-skip', {}]]);
    });
});

describe('the visit on the page', () => {
    async function visiting() {
        const w = await published();
        const { state } = await open(w, w.link);
        await enter(state, w.checklist.published.pin);
        return { w, state };
    }
    const summary = () => byClass('tasks-summary-line')[0].textContent;
    const button = (id) => all(view()).find((e) => e.id === id);
    const taskLi = (id) => all(view()).find((e) => e.id === `task-${id}`);

    test('every task has Done and Skip, named for the task, and the summary starts with all to go', async () => {
        const { state } = await visiting();
        for (const item of state.form.items) {
            expect(button(`done-${item.id}`).getAttribute('aria-pressed')).toBe('false');
            expect(button(`skip-${item.id}`).getAttribute('aria-expanded')).toBe('false');
        }
        const n = state.form.items.length;
        expect(summary()).toBe(`${COPY.summary(0, 0, n)} ${COPY.starredToGo(1)}`);
        expect(byClass('tasks-summary-saved')[0].textContent).toBe(COPY.savedHere);
        expect(byClass('tasks-summary-line')[0].getAttribute('role')).toBe('status');
    });

    test('Done marks a task, keeps it on the device at once, leaves the keyboard on it, and a second press clears it', async () => {
        const { w, state } = await visiting();
        const n = state.form.items.length;
        fire(button(`done-${w.stove.id}`), 'click');
        expect(button(`done-${w.stove.id}`).getAttribute('aria-pressed')).toBe('true');
        expect(button(`done-${w.stove.id}`).focused).toBe(true);
        expect(taskLi(w.stove.id).className).toContain('is-done');
        expect(summary()).toBe(`${COPY.summary(1, 0, n - 1)} ${COPY.starredDone}`);
        const kept = JSON.parse(localStorage.getItem(page.STORAGE_KEY)).checklists[w.checklist.published.id];
        expect(kept.progress.marks[w.stove.id]).toEqual({ status: 'done' });
        // Start here says so too.
        expect(byClass('tasks-start-mark')[0].textContent).toBe(` (${COPY.isDone})`);
        fire(button(`done-${w.stove.id}`), 'click');
        expect(button(`done-${w.stove.id}`).getAttribute('aria-pressed')).toBe('false');
        expect(summary()).toBe(`${COPY.summary(0, 0, n)} ${COPY.starredToGo(1)}`);
    });

    test('Skip opens its reasons in the task; one tap on a reason skips it, says why, and closes', async () => {
        const { w, state } = await visiting();
        const id = w.stove.id;
        fire(button(`skip-${id}`), 'click');
        expect(button(`skip-${id}`).getAttribute('aria-expanded')).toBe('true');
        expect(button(`reason-${id}-no-time`).focused).toBe(true);
        expect(SKIP_REASONS.map((k) => button(`reason-${id}-${k}`).textContent)).toEqual(SKIP_REASONS.map((k) => COPY.reasons[k]));
        fire(button(`reason-${id}-no-access`), 'click');
        expect(button(`picker-${id}`)).toBeUndefined();
        expect(taskLi(id).className).toContain('is-skipped');
        expect(all(taskLi(id)).find((e) => e.className === 'task-skipped').textContent).toBe(COPY.skippedBecause(COPY.reasons['no-access']));
        expect(button(`skip-${id}`).focused).toBe(true);
        expect(summary()).toBe(`${COPY.summary(0, 1, state.form.items.length - 1)} ${COPY.starredMarked(0, 1)}`);
        // Opened again: the reason given is marked, and it can be taken back.
        fire(button(`skip-${id}`), 'click');
        expect(button(`reason-${id}-no-access`).getAttribute('aria-pressed')).toBe('true');
        fire(button(`unskip-${id}`), 'click');
        expect(taskLi(id).className).not.toContain('is-skipped');
    });

    test('a few words of the cleaner\'s own, or a prompt when there are none; Cancel changes nothing', async () => {
        const { w } = await visiting();
        const id = w.stove.id;
        fire(button(`skip-${id}`), 'click');
        fire(button(`skip-words-${id}`), 'click');
        expect(all(button(`picker-${id}`)).find((e) => e.className === 'skip-note').textContent).toBe(COPY.skipNeedsWhy);
        expect(button(`words-${id}`).focused).toBe(true);
        button(`words-${id}`).value = 'The dog was asleep on it.';
        fire(button(`skip-words-${id}`), 'click');
        expect(all(taskLi(id)).find((e) => e.className === 'task-skipped').textContent).toBe(COPY.skippedBecause('The dog was asleep on it.'));
        // Cancel leaves the mark as it was.
        fire(button(`skip-${id}`), 'click');
        fire(button(`skip-cancel-${id}`), 'click');
        expect(button(`picker-${id}`)).toBeUndefined();
        expect(taskLi(id).className).toContain('is-skipped');
        expect(button(`skip-${id}`).focused).toBe(true);
    });

    test('closed and opened again, the marks are all still there', async () => {
        const { w, state } = await visiting();
        const others = state.form.items.filter((i) => i.id !== w.stove.id);
        fire(button(`done-${w.stove.id}`), 'click');
        fire(button(`skip-${others[0].id}`), 'click');
        fire(button(`reason-${others[0].id}-already-clean`), 'click');
        const again = await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        expect(again.state.phase).toBe('open');
        expect(button(`done-${w.stove.id}`).getAttribute('aria-pressed')).toBe('true');
        expect(taskLi(others[0].id).className).toContain('is-skipped');
        expect(summary()).toBe(`${COPY.summary(1, 1, state.form.items.length - 2)} ${COPY.starredDone}`);
    });
});

// ---- Add-ons (M4 piece 3) -----------------------------------------------------

describe('add-ons: what can be proposed, and what one is (pure)', () => {
    const room = { id: 'kitchen-1', level: 'main', area: 'kitchen' };
    const items = presetFor(SHEET, 'kitchen').map((p, n) => ({ id: `item-${n}`, roomId: room.id, order: n, ...p }));
    const form = { rooms: [room], items };
    const stove = items.find((i) => i.task === 'stovetop');

    test('a task the room does not have, or an upgrade of one it does, each named and priced by the sheet', () => {
        const choices = choicesFor(SHEET, form, room.id);
        const oven = choices.find((c) => c.key === 'task:oven-interior');
        expect(oven).toMatchObject({ kind: 'task', name: 'Oven interior', addOn: { roomId: room.id, task: 'oven-interior', options: [] } });
        expect(priceOf(SHEET, form, oven.addOn)).toEqual({ cents: taskOf(SHEET, 'oven-interior').cents, minutes: taskOf(SHEET, 'oven-interior').minutes });
        // Never a task the room has already.
        expect(choices.some((c) => c.key === 'task:stovetop')).toBe(false);
        const deep = choices.find((c) => c.key === `up:${stove.id}:deep-clean`);
        expect(deep).toMatchObject({ kind: 'upgrade', name: 'Stovetop: Deep clean', addOn: { itemId: stove.id, options: ['deep-clean'] } });
        const option = taskOf(SHEET, 'stovetop').options.find((o) => o.key === 'deep-clean');
        expect(priceOf(SHEET, form, deep.addOn)).toEqual({ cents: option.cents, minutes: option.minutes });
        // Every new task comes before every upgrade, and each is one the sheet prices.
        const kinds = choices.map((c) => c.kind);
        expect(kinds.lastIndexOf('task')).toBeLessThan(kinds.indexOf('upgrade'));
        expect(choices.every((c) => !priceOf(SHEET, form, c.addOn).error)).toBe(true);
    });

    test('a task by room size takes the size the room\'s tasks have; one by the piece starts at one', () => {
        const sized = { ...form, items: items.map((i) => (i.size ? { ...i, size: 'large' } : i)) };
        const cabinets = choicesFor(SHEET, sized, room.id).find((c) => c.key === 'task:cabinet-fronts');
        expect(cabinets.addOn.size).toBe('large');
        const appliances = choicesFor(SHEET, form, room.id).find((c) => c.key === 'task:small-appliances');
        expect(appliances.addOn.quantity).toBe(1);
        expect(appliances.addOn.size).toBeUndefined();
    });

    test('one waiting or approved is not offered again; one declined is', () => {
        const deepKey = `up:${stove.id}:deep-clean`;
        const kept = [
            { itemId: stove.id, options: ['deep-clean'], status: 'waiting' },
            { roomId: room.id, task: 'oven-interior', status: 'declined' }
        ];
        const keys = choicesFor(SHEET, form, room.id, takenKeys(kept)).map((c) => c.key);
        expect(keys).not.toContain(deepKey);
        expect(keys).toContain('task:oven-interior');
        expect(choiceKey(kept[0])).toBe(deepKey);
        expect(roomOf(form, kept[0])).toBe(room.id);
        expect(roomOf(form, { itemId: 'gone', options: ['x'] })).toBeNull();
        expect(choicesFor(SHEET, form, 'no-such-room')).toEqual([]);
        expect(choicesFor(null, form, room.id)).toEqual([]);
        expect(priceOf(null, form, kept[0])).toEqual({ error: 'no-sheet' });
        expect(addOnName(null, form, { task: 'oven-interior' })).toBe('oven-interior');
    });

    test('a proposal or decision read back is made safe, or refused', () => {
        const id = 'A'.repeat(22);
        expect(cleanProposal({ format: ADDON_FORMAT, id, roomId: 'r', task: 't', options: ['a', 3], size: 'large', quantity: 2, words: '  Baked   on.  ', price: 1 }))
            .toEqual({ format: ADDON_FORMAT, id, roomId: 'r', task: 't', options: ['a'], size: 'large', quantity: 2, words: 'Baked on.' });
        expect(cleanProposal({ format: ADDON_FORMAT, id, itemId: 'i', options: ['a'] })).toEqual({ format: ADDON_FORMAT, id, itemId: 'i', options: ['a'], words: '' });
        expect(cleanProposal({ format: ADDON_FORMAT, id, itemId: 'i', options: ['a', 'b'] })).toBeNull();
        expect(cleanProposal({ format: ADDON_FORMAT, id, roomId: 'r' })).toBeNull();
        expect(cleanProposal({ format: 2, id, roomId: 'r', task: 't' })).toBeNull();
        expect(cleanProposal({ format: ADDON_FORMAT, id: 'short', roomId: 'r', task: 't' })).toBeNull();
        expect(cleanProposal({ format: ADDON_FORMAT, id, roomId: 'r', task: 't', words: 'x'.repeat(500) }).words).toHaveLength(WORDS_MAX);
        expect(cleanDecision({ format: ADDON_FORMAT, id, status: 'approved', decidedAt: 'then' }, id)).toEqual({ format: ADDON_FORMAT, id, status: 'approved', decidedAt: 'then' });
        expect(cleanDecision({ format: ADDON_FORMAT, id, status: 'maybe' }, id)).toBeNull();
        expect(cleanDecision({ format: ADDON_FORMAT, id: 'B'.repeat(22), status: 'approved' }, id)).toBeNull();
        expect(cleanKept([{ format: ADDON_FORMAT, id, roomId: 'r', task: 't', status: 'approved' }, { format: ADDON_FORMAT, id, roomId: 'r', task: 't', status: 'odd' }, 'junk']).map((a) => a.status))
            .toEqual(['approved', 'waiting']);
        expect(cleanKept('junk')).toEqual([]);
    });
});

describe('add-ons on the page', () => {
    async function visiting() {
        const w = await published();
        const { state } = await open(w, w.link);
        await enter(state, w.checklist.published.pin);
        return { w, state };
    }
    const find = (id) => all(view()).find((e) => e.id === id);
    const summary = () => byClass('tasks-summary-line')[0].textContent;
    const kept = (w) => JSON.parse(localStorage.getItem(page.STORAGE_KEY)).checklists[w.checklist.published.id];
    const pick = (value) => {
        const select = find('addon-choice-kitchen-1');
        select.value = value;
        fire(select, 'change');
    };
    async function proposeOven(state, words = '') {
        fire(find('propose-kitchen-1'), 'click');
        pick('task:oven-interior');
        if (words) find('addon-words-kitchen-1').value = words;
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
    }
    /** The customer's answer, as the studio will send it (M5). */
    async function decide(w, state, status) {
        const id = w.checklist.published.id;
        const key = await w.sealer.importKey(w.checklist.published.key);
        const a = state.addOns[0];
        const sealed = await w.sealer.sealJson(key, { format: ADDON_FORMAT, id: a.id, status, decidedAt: '2026-10-16T17:05:00Z' }, contextFor(id, 'decision', a.id));
        const r = await w.api.decideAddOn(id, w.checklist.published.ownerToken, state.visitId, a.id, sealed);
        if (!r.ok) throw new Error(r.error);
    }
    // The add-on and report timers; the checklist's own (formTimers) apart.
    const live = () => timers.filter((t) => !t.cleared && !t.ran && t.ms !== FORM_POLL);
    async function tick() {
        const t = live()[0];
        t.ran = true;
        await t.fn();
    }

    test('every room offers one; the picker opens on the keyboard, shows the price, and Cancel closes it', async () => {
        await visiting();
        const btn = find('propose-kitchen-1');
        expect(btn.getAttribute('aria-label')).toBe(COPY.proposeIn('Kitchen'));
        expect(find('propose-bathroom-1')).toBeTruthy();
        fire(btn, 'click');
        expect(find('propose-kitchen-1').getAttribute('aria-expanded')).toBe('true');
        expect(find('addon-choice-kitchen-1').focused).toBe(true);
        pick('task:oven-interior');
        const t = taskOf(SHEET, 'oven-interior');
        expect(find('addon-price-kitchen-1').textContent).toBe(COPY.addOnAdds(formatMoney(t.cents), formatMinutes(t.minutes)));
        expect(find('addon-choice-kitchen-1').focused).toBe(true);
        fire(find('addon-cancel-kitchen-1'), 'click');
        expect(find('addon-picker-kitchen-1')).toBeUndefined();
        expect(find('propose-kitchen-1').focused).toBe(true);
    });

    test('sent: it waits under its room with the cleaner\'s words, is kept on the device, and is not offered twice', async () => {
        const { w, state } = await visiting();
        fire(find('propose-kitchen-1'), 'click');
        // Nothing chosen yet: it asks.
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
        expect(all(find('addon-picker-kitchen-1')).find((e) => e.className === 'skip-note').textContent).toBe(COPY.addOnPickFirst);
        pick('task:oven-interior');
        find('addon-words-kitchen-1').value = 'Baked-on grease from a spill.';
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
        expect(state.addOns).toHaveLength(1);
        const li = find(`addon-${state.addOns[0].id}`);
        expect(li.className).toContain('is-waiting');
        expect(li.textContent).toContain('Oven interior');
        expect(li.textContent).toContain('Baked-on grease from a spill.');
        expect(li.textContent).toContain(COPY.addOnStatus.waiting);
        expect(find('propose-kitchen-1').focused).toBe(true);
        expect(summary()).toContain(COPY.addOnsLine(COPY.addOnCount.waiting(1)));
        expect(kept(w)).toMatchObject({ visitId: state.visitId, addOns: [{ id: state.addOns[0].id, task: 'oven-interior', status: 'waiting' }] });
        fire(find('propose-kitchen-1'), 'click');
        expect(all(find('addon-choice-kitchen-1')).some((e) => e.value === 'task:oven-interior')).toBe(false);
        // Sealed: the stand-in holds no words of it.
        const rows = (await w.api.listAddOns(w.checklist.published.id, kept(w).visitToken, state.visitId)).data.addons;
        expect(Buffer.from(rows[0].proposal, 'base64url').toString('latin1')).not.toContain('grease');
    });

    test('asked after while it waits: an approval appears in place with a Done of its own, and the asking stops', async () => {
        const { w, state } = await visiting();
        await proposeOven(state);
        expect(live()).toHaveLength(1);
        expect(live()[0].ms).toBe(CONFIG.api.pollSeconds * 1000);
        // Nothing new: still waiting, and asked again.
        await tick();
        expect(state.addOns[0].status).toBe('waiting');
        expect(live()).toHaveLength(1);
        await decide(w, state, 'approved');
        await tick();
        const id = state.addOns[0].id;
        expect(find(`addon-${id}`).className).toContain('is-approved');
        expect(find(`addon-${id}`).textContent).toContain(COPY.addOnStatus.approved);
        expect(summary()).toContain(COPY.addOnsLine(COPY.addOnCount.approved(1)));
        expect(live()).toHaveLength(0);
        fire(find(`addon-done-${id}`), 'click');
        expect(find(`addon-done-${id}`).getAttribute('aria-pressed')).toBe('true');
        expect(find(`addon-done-${id}`).focused).toBe(true);
        expect(kept(w).progress.marks[id]).toEqual({ status: 'done' });
        // The checklist's own count is unchanged by it.
        expect(summary()).toContain(COPY.summary(0, 0, state.form.items.length));
    });

    test('a decline appears too, with no Done, and the same task can be proposed again', async () => {
        const { w, state } = await visiting();
        await proposeOven(state);
        await decide(w, state, 'declined');
        await tick();
        const id = state.addOns[0].id;
        expect(find(`addon-${id}`).className).toContain('is-declined');
        expect(find(`addon-done-${id}`)).toBeUndefined();
        fire(find('propose-kitchen-1'), 'click');
        expect(all(find('addon-choice-kitchen-1')).some((e) => e.value === 'task:oven-interior')).toBe(true);
    });

    test('a poll keeps what is being typed and where the keyboard is', async () => {
        const { w, state } = await visiting();
        await proposeOven(state);
        fire(find('propose-kitchen-1'), 'click');
        pick(`up:${w.stove.id}:deep-clean`);
        find('addon-words-kitchen-1').value = 'Half typed';
        find('addon-words-kitchen-1').focus();
        await decide(w, state, 'approved');
        await tick();
        expect(find('addon-words-kitchen-1').value).toBe('Half typed');
        expect(find('addon-words-kitchen-1').focused).toBe(true);
        expect(find('addon-choice-kitchen-1').value).toBe(`up:${w.stove.id}:deep-clean`);
    });

    test('a task counted by the piece asks how many, and the price follows', async () => {
        const { state } = await visiting();
        fire(find('propose-kitchen-1'), 'click');
        pick('task:small-appliances');
        const t = taskOf(SHEET, 'small-appliances');
        const qty = find('addon-qty-kitchen-1');
        qty.value = '3';
        fire(qty, 'change');
        expect(find('addon-qty-kitchen-1').focused).toBe(true);
        expect(find('addon-price-kitchen-1').textContent).toBe(COPY.addOnAdds(formatMoney(t.cents * 3), formatMinutes(t.minutes * 3)));
        find('addon-qty-kitchen-1').value = '900';
        fire(find('addon-qty-kitchen-1'), 'change');
        expect(find('addon-qty-kitchen-1').value).toBe('50');
        find('addon-qty-kitchen-1').value = '2';
        fire(find('addon-qty-kitchen-1'), 'change');
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
        expect(state.addOns[0]).toMatchObject({ task: 'small-appliances', quantity: 2 });
    });

    test('a send that fails says why and keeps the words; the next try reuses the visit', async () => {
        const { w, state } = await visiting();
        let starts = 0;
        let refuse = 'offline';
        const api = {
            ...w.api,
            startVisit: (...a) => { starts++; return w.api.startVisit(...a); },
            putAddOn: (...a) => (refuse ? Promise.resolve({ ok: false, error: refuse }) : w.api.putAddOn(...a))
        };
        const again = await open({ ...w, api }, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        for (const [error, line] of [['offline', COPY.addOnOffline], ['too-many', COPY.addOnFull], ['denied', COPY.addOnExpired], ['http-500', COPY.addOnTrouble]]) {
            refuse = error;
            if (!find('addon-picker-kitchen-1')) fire(find('propose-kitchen-1'), 'click');
            pick('task:oven-interior');
            find('addon-words-kitchen-1').value = 'Please';
            fire(find('addon-send-kitchen-1'), 'click');
            await again.state.pending;
            expect(all(find('addon-picker-kitchen-1')).find((e) => e.className === 'skip-note').textContent).toBe(line);
            expect(find('addon-words-kitchen-1').value).toBe('Please');
            expect(find('addon-send-kitchen-1').focused).toBe(true);
        }
        refuse = null;
        fire(find('addon-send-kitchen-1'), 'click');
        await again.state.pending;
        expect(again.state.addOns).toHaveLength(1);
        expect(starts).toBe(1);
        expect(state).not.toBe(again.state);
    });

    test('opened again: the add-ons as the API has them, or as the device kept them when it cannot be reached', async () => {
        const { w, state } = await visiting();
        await proposeOven(state, 'Grease');
        await decide(w, state, 'approved');
        const bare = `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`;
        const back = await open(w, bare);
        expect(back.state.addOns).toMatchObject([{ task: 'oven-interior', status: 'approved', words: 'Grease' }]);
        expect(kept(w).addOns[0].status).toBe('approved');
        const offline = await open({ ...w, api: { ...w.api, listAddOns: async () => ({ ok: false, error: 'offline' }) } }, bare);
        expect(offline.state.addOns).toMatchObject([{ task: 'oven-interior', status: 'approved' }]);
    });

    test('out of view it stops asking, and back in view it asks at once', async () => {
        const { w, state } = await visiting();
        await proposeOven(state);
        const doc = globalThis.document;
        doc.visibilityState = 'hidden';
        fire(doc, 'visibilitychange');
        expect(live()).toHaveLength(0);
        await decide(w, state, 'approved');
        doc.visibilityState = 'visible';
        fire(doc, 'visibilitychange');
        await state.polled;
        expect(state.addOns[0].status).toBe('approved');
    });

    test('without the sheet nothing can be priced, so nothing is offered', async () => {
        const w = await published();
        const { state } = await open(w, w.link, { fetchJson: async () => { throw new Error('offline'); } });
        await enter(state, w.checklist.published.pin);
        expect(find('propose-kitchen-1')).toBeUndefined();
    });
});

// ---- Offline, and print (M4 piece 4) -------------------------------------------

describe('the copy kept on this device (pure)', () => {
    test('kept sealed until the visit pass ends, then gone; one checklist forgotten leaves the others', async () => {
        let t = Date.parse('2026-10-16T09:00:00Z');
        const backend = createMemoryBackend();
        const a = page.createKeeper(backend, 'aaaaaaaa', () => t);
        const b = page.createKeeper(backend, 'bbbbbbbb', () => t);
        await a.put('checklist', new Uint8Array([1]), '2026-10-16T21:00:00Z');
        await b.put('checklist', new Uint8Array([2]), '2026-10-16T10:00:00Z');
        expect([...(await a.get('checklist'))]).toEqual([1]);
        expect(await a.get('photo/x')).toBeNull();
        t = Date.parse('2026-10-16T11:00:00Z');
        expect(await b.get('checklist')).toBeNull();
        expect(await backend.keys()).toEqual(['aaaaaaaa/checklist']);
        await a.forget();
        expect(await backend.keys()).toEqual([]);
        // No store, or a broken one: no copy, and nothing thrown.
        expect(await page.createKeeper(null, 'aaaaaaaa', () => t).get('checklist')).toBeNull();
        const broken = { get: async () => { throw new Error('disk'); }, put: async () => { throw new Error('full'); }, delete: async () => {}, keys: async () => { throw new Error('disk'); } };
        const k = page.createKeeper(broken, 'aaaaaaaa', () => t);
        // A put says whether it was kept (proof photos rely on it, M5).
        await expect(k.put('checklist', new Uint8Array([1]), '2099-01-01T00:00:00Z')).resolves.toBe(false);
        await expect(page.createKeeper(createMemoryBackend(), 'aaaaaaaa', () => t).put('checklist', new Uint8Array([1]), '2099-01-01T00:00:00Z')).resolves.toBe(true);
        await expect(k.get('checklist')).resolves.toBeNull();
        await expect(k.forget()).resolves.toBeNull();
        await expect(page.sweepKept(broken, () => t)).resolves.toBeUndefined();
    });

    test('the sweep forgets every copy past its pass, whichever checklist', async () => {
        const backend = createMemoryBackend();
        await backend.put('x/checklist', { bytes: new Uint8Array([1]), until: '2026-10-16T10:00:00Z' });
        await backend.put('y/checklist', { bytes: new Uint8Array([1]), until: '2026-10-16T22:00:00Z' });
        await backend.put('z/checklist', { bytes: new Uint8Array([1]) });
        await page.sweepKept(backend, () => Date.parse('2026-10-16T12:00:00Z'));
        expect(await backend.keys()).toEqual(['y/checklist']);
    });

    test('its usage pings reach the site-root api.html, counted under the studio\'s scene', () => {
        const at = new URL(`${page.TELEMETRY_PAGE.endpoint}?action=cleaner-open`, 'https://www.scenexp.com/whitestone/tasks/?c=abc');
        expect(at.pathname).toBe('/api.html');
        expect(page.TELEMETRY_PAGE.scene).toBe('whitestone');
    });

    test('the files the worker is asked to keep: this page and what it loaded from this site, never the API', () => {
        const o = 'https://www.scenexp.com';
        expect(page.offlineUrls(`${o}/whitestone/tasks/?c=abc#k=secret`, o, [
            { name: `${o}/whitestone/js/copy.min.js` },
            { name: `${o}/whitestone/js/copy.min.js` },
            { name: `${o}/api/whitestone/checklists/abc` },
            // A usage beacon (beacons.js): a new address every tap.
            { name: `${o}/api.html?action=cleaner-done&scene=whitestone` },
            { name: 'https://elsewhere.example/a.js' },
            { name: 'blob:https://www.scenexp.com/1' },
            null
        ])).toEqual([`${o}/whitestone/tasks/?c=abc`, `${o}/whitestone/js/copy.min.js`]);
        expect(page.offlineUrls(`${o}/whitestone/tasks/`, o, null)).toEqual([`${o}/whitestone/tasks/`]);
    });
});

describe('opening with no signal', () => {
    const bare = (w) => `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`;
    const offline = (w) => ({
        ...w.api,
        getChecklist: async () => ({ ok: false, error: 'offline' }),
        getThumb: async () => ({ ok: false, error: 'offline' }),
        getPhoto: async () => ({ ok: false, error: 'offline' }),
        listAddOns: async () => ({ ok: false, error: 'offline' })
    });

    test('opened once with a signal, it opens again without one: the checklist, its thumbnails, a photo, and the marks', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        // Sealed as they arrived: the checklist, the thumbnail and the full photo.
        expect((await w.cache.keys()).sort()).toEqual(['checklist', `photo/${PHOTO}`, `thumb/${PHOTO}`].map((n) => `${w.checklist.published.id}/${n}`).sort());
        const kept = await w.cache.get(`${w.checklist.published.id}/checklist`);
        expect(new TextDecoder().decode(kept.bytes)).not.toContain('Under the grates');
        fire(all(view()).find((e) => e.id === `done-${w.stove.id}`), 'click');
        const again = await open({ ...w, api: offline(w) }, bare(w));
        expect(again.state.phase).toBe('open');
        expect(again.state.fromDevice).toBe(true);
        expect(byClass('tasks-notice')[0].textContent).toBe(COPY.keptCopy);
        expect(again.state.thumbs.get(PHOTO)).toBe('blob:test/1');
        expect(all(view()).find((e) => e.id === `done-${w.stove.id}`).getAttribute('aria-pressed')).toBe('true');
        fire(byClass('task-photo')[0], 'click');
        const overlayNow = () => globalThis.document.body.children.find((c) => c.className === 'photo-view');
        for (let i = 0; i < 100 && !overlayNow(); i++) await new Promise((r) => setTimeout(r, 5));
        expect(all(overlayNow()).find((e) => e.tagName === 'IMG').src).toBe('blob:test/3');
    });

    test('a copy never kept here: no signal is said, as before', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        await w.cache.delete(`${w.checklist.published.id}/checklist`);
        await open({ ...w, api: offline(w) }, bare(w));
        expect(status()).toBe(COPY.offline);
    });

    test('past the visit pass the copies are swept, and the PIN is asked', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        w.advance((CONFIG.api.visitHours + 1) * 3600000);
        const later = await open({ ...w, api: offline(w) }, bare(w));
        expect(later.state.phase).toBe('pin');
        expect(await w.cache.keys()).toEqual([]);
    });

    test('a checklist the API no longer has: the copy is cleared, not opened', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        await open({ ...w, api: { ...w.api, getChecklist: async () => ({ ok: false, error: 'not-found' }) } }, bare(w));
        expect(status()).toBe(COPY.gone);
        expect((await w.cache.keys()).filter((k) => k.endsWith('/checklist'))).toEqual([]);
    });

    test('a photo the API no longer has (the customer removed it) never comes back from the copy', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        expect(await w.cache.get(`${w.checklist.published.id}/thumb/${PHOTO}`)).toBeTruthy();
        const api = { ...w.api, getThumb: async () => ({ ok: false, error: 'not-found' }), getPhoto: async () => ({ ok: false, error: 'not-found' }) };
        const again = await open({ ...w, api }, bare(w));
        expect(again.state.phase).toBe('open');
        expect(again.state.thumbs.has(PHOTO)).toBe(false);
    });

    test('a pass the API refuses (the PIN changed) clears the copy at once', async () => {
        const w = await published();
        const first = await open(w, w.link);
        await enter(first.state, w.checklist.published.pin);
        expect((await w.cache.keys()).length).toBeGreaterThan(0);
        await w.api.resetPin(w.checklist.published.id, w.checklist.published.ownerToken);
        await open(w, bare(w));
        expect(status()).toBe(COPY.again);
        expect(await w.cache.keys()).toEqual([]);
    });
});

describe('print', () => {
    test('Print a work order prints the page', async () => {
        const w = await published();
        const print = jest.fn();
        const { state } = await open(w, w.link, { print });
        await enter(state, w.checklist.published.pin);
        const btn = all(view()).find((e) => e.id === 'tasks-print');
        expect(btn.textContent).toBe(COPY.print);
        fire(btn, 'click');
        expect(print).toHaveBeenCalledTimes(1);
    });

    test('the print stylesheet keeps the banner, ticks boxes and leaves out everything to press', () => {
        const css = readFileSync(join(WS, 'tasks', 'css', 'tasks.css'), 'utf8');
        const print = css.slice(css.indexOf('@media print'));
        const hidden = print.slice(0, print.indexOf('display: none !important'));
        for (const sel of ['.tasks-summary', '.tasks-print', '.task-marks', '.skip-picker', '.addon-propose', '.addon-picker', '.addon.is-waiting']) expect(hidden).toContain(sel);
        expect(print).toMatch(/\.task::before,[\s\S]*?border: 1pt solid/);
        expect(print).toMatch(/\.task\.is-done::before[\s\S]*?content: "\\2713"/);
        expect(hidden).not.toContain('.tasks-prefs');
    });
});

// ---- Finishing the visit (M5 piece 2) ------------------------------------------------

describe('finishing the visit on the page', () => {
    async function visiting(extra = {}) {
        const w = await published();
        const { state } = await open(w, w.link, extra);
        await enter(state, w.checklist.published.pin);
        return { w, state };
    }
    const find = (id) => all(view()).find((e) => e.id === id);
    const text = (id) => (find(id) ? find(id).textContent : undefined);
    const kept = (w) => JSON.parse(localStorage.getItem(page.STORAGE_KEY)).checklists[w.checklist.published.id];
    // The add-on and report timers; the checklist's own (formTimers) apart.
    const live = () => timers.filter((t) => !t.cleared && !t.ran && t.ms !== FORM_POLL);
    async function tick() {
        const t = live()[0];
        t.ran = true;
        await t.fn();
    }
    /** The report as the customer will read it (piece 3): fetched with the
     *  owner token and opened with the key. */
    async function customerReads(w, visitId) {
        const id = w.checklist.published.id;
        const key = await w.sealer.importKey(w.checklist.published.key);
        const got = await w.api.getReport(id, w.checklist.published.ownerToken, visitId);
        return got.ok ? w.sealer.openJson(key, got.bytes, contextFor(id, 'report', visitId)) : null;
    }
    const fill = ({ cleaner = '', hours = '0', minutes = '0', note = '' }) => {
        find('report-cleaner').value = cleaner;
        fire(find('report-cleaner'), 'input');
        find('report-hours').value = hours;
        find('report-minutes').value = minutes;
        fire(find('report-minutes'), 'change');
        find('report-note').value = note;
        fire(find('report-note'), 'input');
    };

    test('Finish visit shows the report and the bill first: skips with why, the not reached, and Back keeps everything', async () => {
        const { w, state } = await visiting();
        const items = state.form.items;
        for (const item of items) fire(find(`done-${item.id}`), 'click');
        fire(find(`skip-${w.stove.id}`), 'click');
        fire(find(`reason-${w.stove.id}-no-time`), 'click');
        const last = items[items.length - 1];
        fire(find(`done-${last.id}`), 'click');
        expect(find('tasks-finish').textContent).toBe(COPY.finish);
        fire(find('tasks-finish'), 'click');
        await state.polled;
        expect(text('report-title')).toBe(COPY.finishTitle);
        expect(find('report-title').focused).toBe(true);
        expect(text('report-bill').startsWith(COPY.billHeading)).toBe(true);
        expect(all(find('report-bill')).find((e) => e.className === 'report-bill-line').textContent).toMatch(/^Billed \$\d+(\.\d\d)? of the \$\d+(\.\d\d)? quote\.$/);
        expect(byClass('report-counts')[0].textContent).toBe(COPY.reportCounts(items.length - 2, 1, 1));
        expect(text(`report-${w.stove.id}`)).toMatch(/^Stovetop, in the kitchen \(Ran out of time\) \$\d+(\.\d\d)? off$/);
        expect(find('report-not-reached').textContent).toContain(text(`report-${last.id}`));
        // Nothing is marked from here.
        expect(find(`done-${w.stove.id}`)).toBeUndefined();
        fire(find('report-back'), 'click');
        expect(find('tasks-finish').focused).toBe(true);
        expect(state.progress.marks[w.stove.id]).toMatchObject({ status: 'skipped' });
        expect(kept(w).sent).toBeFalsy();
    });

    test('the cleaner\'s fields are kept on the device as typed, and come back', async () => {
        const { w, state } = await visiting();
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fill({ cleaner: 'Steve', hours: '2', minutes: '30', note: 'The side gate was open, so I closed it.' });
        expect(kept(w).draft).toEqual({ cleaner: 'Steve', hours: 2, minutes: 30, note: 'The side gate was open, so I closed it.' });
        const again = await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        fire(find('tasks-finish'), 'click');
        await again.state.polled;
        expect([find('report-cleaner').value, find('report-hours').value, find('report-minutes').value, find('report-note').value]).toEqual(['Steve', '2', '30', 'The side gate was open, so I closed it.']);
        expect(page.cleanDraft({ hours: 40, minutes: 10, cleaner: 'x'.repeat(60) })).toEqual({ cleaner: 'x'.repeat(40), hours: 0, minutes: 0, note: '' });
    });

    test('Send: sealed and sent once, the customer reads exactly it, and the page is the record of the visit', async () => {
        const { w, state } = await visiting();
        fire(find(`done-${w.stove.id}`), 'click');
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fill({ cleaner: 'Steve', hours: '1', minutes: '45', note: 'All good.' });
        fire(find('report-send'), 'click');
        await state.reportSend;
        const k = kept(w);
        expect(k.outbox).toBeNull();
        expect(k.sent.visitKey).toBe('2026-10-16 09:00');
        const read = await customerReads(w, k.sent.visitId);
        expect(read).toEqual(k.sent.report);
        expect(read).toMatchObject({ cleaner: 'Steve', minutesOnSite: 105, note: 'All good.', booking: { date: '2026-10-16', time: '09:00' }, submittedAt: new Date(START).toISOString() });
        expect(read.results.find((r) => r.itemId === w.stove.id)).toEqual({ itemId: w.stove.id, status: 'done' });
        expect(read.results.filter((r) => r.status === 'not-reached')).toHaveLength(state.form.items.length - 1);
        // The record: no fields, no buttons to mark, what was said.
        expect(text('report-title')).toBe(COPY.sentTitle);
        expect(find('report-title').focused).toBe(true);
        expect(find('report-cleaner')).toBeUndefined();
        expect(find('report-send')).toBeUndefined();
        expect(view().textContent).toContain(COPY.cleanerLine('Steve'));
        expect(view().textContent).toContain(COPY.onSiteLine('1 hour 45 minutes'));
        // Opened again, the same record.
        await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        expect(text('report-title')).toBe(COPY.sentTitle);
        expect(find(`done-${w.stove.id}`)).toBeUndefined();
    });

    /** The page on an API whose visit starts are held until a second one
     *  arrives (or a moment passes), then let go together: two starts read
     *  the visits before either writes, as two phones or a slow answer do. */
    async function racing() {
        const w = await published();
        const starts = { count: 0 };
        const held = [];
        // The later first, so the earlier start writes last (the order that lost the visit).
        const letGo = () => held.splice(0).reverse().forEach((go) => go());
        const api = {
            ...w.api,
            startVisit: async (...args) => {
                starts.count++;
                await new Promise((go) => {
                    held.push(go);
                    if (held.length >= 2) letGo();
                    else setTimeout(letGo, 30);
                });
                return w.api.startVisit(...args);
            }
        };
        const { state } = await open(w, w.link, { api });
        await enter(state, w.checklist.published.pin);
        return { w, state, starts };
    }

    test('sent while the first mark\'s start is still on its way: one visit, and the report reaches it (QA, 2026-10-16: a race lost the visit)', async () => {
        const { w, state, starts } = await racing();
        // The first mark begins the visit; Finish and Send follow at once,
        // before that start has answered.
        fire(find(`done-${w.stove.id}`), 'click');
        fire(find('tasks-finish'), 'click');
        fill({ cleaner: 'Steve', hours: '1', minutes: '0', note: '' });
        fire(find('report-send'), 'click');
        await state.reportSend;
        const k = kept(w);
        expect(k.outbox).toBeNull();
        const visits = (await w.api.listVisits(w.checklist.published.id, w.checklist.published.ownerToken)).data.visits;
        expect(visits).toHaveLength(1);
        expect(visits[0].visitId).toBe(k.sent.visitId);
        expect(visits[0].reportAt).not.toBeNull();
        // The send waited for the start on its way rather than making its own.
        expect(starts.count).toBe(1);
    });

    test('an add-on sent while the first mark\'s start is still on its way joins that visit', async () => {
        const { w, state, starts } = await racing();
        fire(find(`done-${w.stove.id}`), 'click');
        fire(find('propose-kitchen-1'), 'click');
        const select = find('addon-choice-kitchen-1');
        select.value = 'task:oven-interior';
        fire(select, 'change');
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
        expect(state.addOns).toHaveLength(1);
        const visits = (await w.api.listVisits(w.checklist.published.id, w.checklist.published.ownerToken)).data.visits;
        expect(visits).toHaveLength(1);
        expect(visits[0].visitId).toBe(state.visitId);
        expect(starts.count).toBe(1);
    });

    test('add-ons in the report: one still waiting lapses, the asking stops, and the visit takes no more', async () => {
        const { w, state } = await visiting();
        fire(find('propose-kitchen-1'), 'click');
        const select = find('addon-choice-kitchen-1');
        select.value = 'task:oven-interior';
        fire(select, 'change');
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
        expect(live()).toHaveLength(1);
        fire(find('tasks-finish'), 'click');
        await state.polled;
        expect(text(`report-${state.addOns[0].id}`)).toBe(`Oven interior (${COPY.addOnOutcome.lapsed})`);
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(kept(w).sent.report.addOns[0]).toMatchObject({ task: 'oven-interior', status: 'lapsed', done: false });
        // The asking stops with the send, and the stand-in takes nothing more.
        expect(live()).toHaveLength(0);
        const id = w.checklist.published.id;
        expect((await w.api.putAddOn(id, kept(w).visitToken, state.visitId, 'addon00000000000000009', new Uint8Array([1]))).error).toBe('closed');
    });

    test('an answer that comes while the report is being checked is in it', async () => {
        const { w, state } = await visiting();
        fire(find('propose-kitchen-1'), 'click');
        const select = find('addon-choice-kitchen-1');
        select.value = 'task:oven-interior';
        fire(select, 'change');
        fire(find('addon-send-kitchen-1'), 'click');
        await state.pending;
        fire(find('tasks-finish'), 'click');
        await state.polled;
        expect(text(`report-${state.addOns[0].id}`)).toBe(`Oven interior (${COPY.addOnOutcome.lapsed})`);
        // The customer approves it now, as the cleaner reads the report.
        const id = w.checklist.published.id;
        const key = await w.sealer.importKey(w.checklist.published.key);
        const a = state.addOns[0];
        const sealed = await w.sealer.sealJson(key, { format: ADDON_FORMAT, id: a.id, status: 'approved', decidedAt: 'x' }, contextFor(id, 'decision', a.id));
        expect((await w.api.decideAddOn(id, w.checklist.published.ownerToken, state.visitId, a.id, sealed)).ok).toBe(true);
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(kept(w).sent.report.addOns[0]).toMatchObject({ status: 'approved', done: false });
    });

    test('no signal: kept on the device, said so, tried again after a growing pause and when the connection returns', async () => {
        let offline = true;
        const w = await published();
        // What the device holds as the report leaves: it is kept first, so
        // a tab closed mid-send loses nothing.
        const held = [];
        const api = {
            ...w.api,
            putReport: (...args) => {
                held.push(Boolean(kept(w).outbox));
                return offline ? Promise.resolve({ ok: false, error: 'offline' }) : w.api.putReport(...args);
            }
        };
        const { state } = await open({ ...w, api }, w.link);
        await enter(state, w.checklist.published.pin);
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(text('report-title')).toBe(COPY.pendingTitle);
        expect(text('report-status')).toBe(COPY.reportOffline);
        expect(find('report-status').getAttribute('role')).toBe('alert');
        expect(kept(w).outbox.report.id).toBe(w.checklist.published.id);
        expect(live().map((t) => t.ms)).toEqual([CONFIG.api.reportRetrySeconds[0] * 1000]);
        await tick();
        await state.reportSend;
        expect(live().map((t) => t.ms)).toEqual([CONFIG.api.reportRetrySeconds[1] * 1000]);
        // Try again now, still nothing; then the connection returns.
        fire(find('report-retry'), 'click');
        await state.reportSend;
        expect(text('report-title')).toBe(COPY.pendingTitle);
        offline = false;
        fire(dom.windowStub, 'online');
        await state.reportSend;
        expect(text('report-title')).toBe(COPY.sentTitle);
        expect(kept(w).outbox).toBeNull();
        expect(live()).toHaveLength(0);
        expect(held).toEqual([true, true, true, true]);
    });

    test('a report waiting when the page closed goes as soon as it opens again', async () => {
        let offline = true;
        const w = await published();
        const api = { ...w.api, putReport: (...args) => (offline ? Promise.resolve({ ok: false, error: 'server' }) : w.api.putReport(...args)) };
        const first = await open({ ...w, api }, w.link);
        await enter(first.state, w.checklist.published.pin);
        fire(find('tasks-finish'), 'click');
        await first.state.polled;
        fire(find('report-send'), 'click');
        await first.state.reportSend;
        expect(text('report-status')).toBe(COPY.reportTrouble);
        offline = false;
        const again = await open({ ...w, api }, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        expect(again.state.phase).toBe('open');
        expect(text('report-title')).toBe(COPY.sentTitle);
        expect(await customerReads(w, kept(w).sent.visitId)).toEqual(kept(w).sent.report);
    });

    test('a visit pass that ran out: the PIN again, and then it sends', async () => {
        const { w, state } = await visiting();
        fire(find('tasks-finish'), 'click');
        await state.polled;
        w.advance(CONFIG.api.visitHours * 3600000 + 1000);
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(status()).toBe(COPY.reportNeedsPin);
        expect(view().hidden).toBe(true);
        expect(dom.el('pin-form').hidden).toBe(false);
        expect(kept(w).outbox).toBeTruthy();
        await enter(state, w.checklist.published.pin);
        expect(text('report-title')).toBe(COPY.sentTitle);
        expect(await customerReads(w, kept(w).sent.visitId)).toEqual(kept(w).sent.report);
    });

    test('after the report, the customer stops sharing it: the page says the visit is over, by the pass or the PIN', async () => {
        const { w, state } = await visiting();
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fire(find('report-send'), 'click');
        await state.reportSend;
        // The customer's page closes the checklist once the report is in.
        expect((await w.api.deleteChecklist(w.checklist.published.id, w.checklist.published.ownerToken)).ok).toBe(true);
        const href = `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`;
        const byPass = await open(w, href);
        expect(byPass.state.phase).toBe('over');
        expect(status()).toBe(COPY.visitOver);
        expect(dom.el('pin-form').hidden).toBe(true);
        // Later, with no pass left, the PIN says the same.
        const byPin = await open(w, href);
        expect(byPin.state.phase).toBe('pin');
        await enter(byPin.state, w.checklist.published.pin);
        expect(status()).toBe(COPY.visitOver);
        expect(dom.el('pin-form').hidden).toBe(true);
    });

    test('a report too long to send goes back to the fields, saying so', async () => {
        const w = await published();
        const api = { ...w.api, putReport: () => Promise.resolve({ ok: false, error: 'bad-request' }) };
        const { state } = await open({ ...w, api }, w.link);
        await enter(state, w.checklist.published.pin);
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(text('report-title')).toBe(COPY.finishTitle);
        expect(text('report-status')).toBe(COPY.reportTooLong);
        expect(find('report-note').focused).toBe(true);
        expect(kept(w).outbox).toBeNull();
    });

    test('a new booking of the same checklist is a new visit: the marks cleared, the name kept', async () => {
        const { w, state } = await visiting();
        fire(find(`done-${w.stove.id}`), 'click');
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fill({ cleaner: 'Steve' });
        fire(find('report-send'), 'click');
        await state.reportSend;
        // As if the sent report were for an earlier booking.
        const memory = JSON.parse(localStorage.getItem(page.STORAGE_KEY));
        memory.checklists[w.checklist.published.id].sent.visitKey = '2026-10-02 09:00';
        localStorage.setItem(page.STORAGE_KEY, JSON.stringify(memory));
        const again = await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        expect(find('tasks-finish')).toBeTruthy();
        expect(find(`done-${w.stove.id}`).getAttribute('aria-pressed')).toBe('false');
        expect(again.state.visitId).toBeNull();
        expect(kept(w)).toMatchObject({ sent: null, visitId: null, draft: { cleaner: 'Steve', note: '' } });
    });
});

// ---- Proof photos (M5 piece 4) ----------------------------------------------------------

describe('proof photos on the page', () => {
    /** A photo as photos.js would make it, without a canvas. */
    const prepared = (n = 1) => ({ full: new Blob([new Uint8Array([n, n, n])]), thumb: new Blob([new Uint8Array([n])]) });
    async function visiting(extra = {}) {
        const w = await published();
        let n = 0;
        const { state } = await open(w, w.link, { preparePhoto: async () => prepared(++n), ...extra });
        await enter(state, w.checklist.published.pin);
        return { w, state };
    }
    const find = (id) => all(view()).find((e) => e.id === id);
    const kept = (w) => JSON.parse(localStorage.getItem(page.STORAGE_KEY)).checklists[w.checklist.published.id];
    async function addPhoto(state, itemId) {
        const input = find(`proof-input-${itemId}`);
        input.files = [{ name: 'after.jpg' }];
        fire(input, 'change');
        await state.pending;
    }

    test('a marked task offers Add a photo, up to two, each shown with Remove; an unmarked one offers none', async () => {
        const { w, state } = await visiting();
        const id = w.stove.id;
        expect(find(`proof-input-${id}`)).toBeUndefined();
        fire(find(`done-${id}`), 'click');
        const input = find(`proof-input-${id}`);
        expect(input.getAttribute('accept')).toBe('image/*');
        expect(input.getAttribute('capture')).toBe('environment');
        await addPhoto(state, id);
        const [first] = state.proofs[id];
        expect(find(`proof-${first}`)).toBeTruthy();
        expect(find(`proof-remove-${first}`).focused).toBe(true);
        expect(find(`proof-remove-${first}`).getAttribute('aria-label')).toBe(COPY.removeProofOf(1, 'Stovetop'));
        expect(kept(w).proofs).toEqual({ [id]: [first] });
        await addPhoto(state, id);
        expect(state.proofs[id]).toHaveLength(2);
        expect(find(`proof-input-${id}`)).toBeUndefined();
        // Remove: off the task and off the device.
        fire(find(`proof-remove-${first}`), 'click');
        await state.pending;
        expect(state.proofs[id]).toHaveLength(1);
        expect(find(`proof-input-${id}`)).toBeTruthy();
        expect(await page.createKeeper(w.cache, w.checklist.published.id, w.now).get(`proof/${first}`)).toBeNull();
    });

    test('that photos are optional is said once, beside the first Add a photo in reading order', async () => {
        const { state } = await visiting();
        const hints = () => all(view()).filter((e) => e.id === 'proof-hint');
        expect(hints()).toHaveLength(0);
        const [first, second] = state.form.items;
        fire(find(`done-${second.id}`), 'click');
        expect(hints()).toHaveLength(1);
        expect(hints()[0].textContent).toBe(COPY.proofsOptional);
        expect(find(`proof-input-${second.id}`).getAttribute('aria-describedby')).toBe('proof-hint');
        // A task marked earlier in the list takes it over; still only once.
        fire(find(`done-${first.id}`), 'click');
        expect(hints()).toHaveLength(1);
        expect(find(`proof-input-${first.id}`).getAttribute('aria-describedby')).toBe('proof-hint');
        expect(find(`proof-input-${second.id}`).getAttribute('aria-describedby')).toBeNull();
        // A task with its two photos has no Add a photo, so the next one says it.
        await addPhoto(state, first.id);
        await addPhoto(state, first.id);
        expect(hints()).toHaveLength(1);
        expect(find(`proof-input-${second.id}`).getAttribute('aria-describedby')).toBe('proof-hint');
    });

    test('a photo that will not be made says so, and adds nothing', async () => {
        const { w, state } = await visiting({ preparePhoto: async () => { throw new Error('not a picture'); } });
        fire(find(`done-${w.stove.id}`), 'click');
        await addPhoto(state, w.stove.id);
        expect(state.proofs).toEqual({});
        expect(view().textContent).toContain(COPY.proofFailed);
    });

    test('kept on the device: reopened, the thumbnails come back', async () => {
        const { w, state } = await visiting();
        fire(find(`done-${w.stove.id}`), 'click');
        await addPhoto(state, w.stove.id);
        const again = await open(w, `https://www.scenexp.com/whitestone/tasks/?c=${w.checklist.published.id}`);
        const photoId = again.state.proofs[w.stove.id][0];
        expect(again.state.proofThumbs.get(photoId)).toMatch(/^blob:test\//);
        expect(all(find(`proof-${photoId}`)).find((e) => e.tagName === 'IMG')).toBeTruthy();
    });

    test('sent before the report, which names them; the customer reads them; off the device after', async () => {
        const { w, state } = await visiting();
        fire(find(`done-${w.stove.id}`), 'click');
        await addPhoto(state, w.stove.id);
        const photoId = state.proofs[w.stove.id][0];
        const api = w.api;
        // The page holds the API it opened with, so watch that one.
        const putProof = jest.spyOn(api, 'putProof');
        const putReport = jest.spyOn(api, 'putReport');
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(putProof).toHaveBeenCalled();
        expect(putProof.mock.invocationCallOrder[0]).toBeLessThan(putReport.mock.invocationCallOrder[0]);
        const sent = kept(w).sent;
        expect(sent.report.results.find((r) => r.itemId === w.stove.id).photos).toEqual([photoId]);
        const { fetchProofs } = await import('../www/whitestone/js/report.js');
        const key = await w.sealer.importKey(w.checklist.published.key);
        const got = await fetchProofs({ api, sealer: w.sealer, key, id: w.checklist.published.id, token: w.checklist.published.ownerToken, visitId: sent.visitId, report: sent.report });
        expect(got.map((p) => [p.photoId, [...p.full]])).toEqual([[photoId, [1, 1, 1]]]);
        expect(kept(w).proofs).toEqual({});
        expect(await page.createKeeper(w.cache, w.checklist.published.id, w.now).get(`proof/${photoId}`)).toBeNull();
    });

    test('a photo gone from the device is passed over, and the report still goes', async () => {
        const { w, state } = await visiting();
        fire(find(`done-${w.stove.id}`), 'click');
        await addPhoto(state, w.stove.id);
        const photoId = state.proofs[w.stove.id][0];
        await page.createKeeper(w.cache, w.checklist.published.id, w.now).drop(`proof/${photoId}`);
        fire(find('tasks-finish'), 'click');
        await state.polled;
        fire(find('report-send'), 'click');
        await state.reportSend;
        expect(find('report-title').textContent).toBe(COPY.sentTitle);
    });
});
