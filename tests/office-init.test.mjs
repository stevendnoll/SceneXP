// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for Corner Office, plus the page-level rules no unit
 * test can see: the welcome card's two shapes, the storage notes, following
 * another tab, undo, render on demand, and that nothing under www/office/js
 * writes markup from strings.
 *
 * Under Node, importing main.js is side-effect-free unless a `document`
 * exists, so this installs the browser stand-ins FIRST and then imports: the
 * module auto-boots the way a real page load does, and setAnimationLoop lands
 * in dom.loops so frames can be stepped by hand.
 *
 * A HEADLESS BOOT IS NOT A WORKING PAGE. The DOM stub auto-vivifies ids, so
 * these tests say that every function a page load calls actually runs and
 * that the document round-trips, and nothing about pixels. Steve's screenshot
 * round is the other half.
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication, addTask, setStatus } from '../www/office/js/store.js';
import { formatDate } from '../www/office/js/dates.js';
import { landGrids } from '../www/office/js/city.js';

/**
 * THE LAND, MADE ONCE AND THINNED. Every boot here re-imports the modules,
 * and the land across the bay is ninety thousand points of noise to work
 * out, which Jest's module sandbox runs some sixty times slower than plain
 * Node (800k noise calls: 7 ms in Node, 420 ms here). Thirteen boots of it
 * doubled this file and timed out its first test in a loaded full run
 * (2026-09-25). So the land is made once for the file and every sixth point
 * kept: these tests boot the page and drive it, and the land itself is
 * measured with the real three.js in office-view.
 */
function thinned({ positions, cols, rows }, every = 6) {
    const pick = (n) => [...new Set([...Array.from({ length: Math.ceil(n / every) }, (_, i) => i * every), n - 1])];
    const cs = pick(cols);
    const rs = pick(rows);
    const out = new Float32Array(cs.length * rs.length * 3);
    let k = 0;
    for (const r of rs) for (const c of cs) for (let a = 0; a < 3; a++) out[k++] = positions[(r * cols + c) * 3 + a];
    return { positions: out, cols: cs.length, rows: rs.length };
}
const LAND = Object.fromEntries(Object.entries(landGrids()).map(([name, grid]) => [name, thinned(grid)]));
jest.unstable_mockModule('../www/office/js/city.min.js', async () => ({
    ...(await import('../www/office/js/city.js')),
    landGrids: () => LAND
}));

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
});

async function boot() {
    const main = await import('../www/office/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + 100);
    return main;
}

/** What the live region says, once its beat has passed (cards.announce
 *  clears it and refills it 30ms later, so a repeat is read again). */
function said() {
    jest.advanceTimersByTime(50);
    return dom.el('office-live').textContent;
}

function stepFrames(n, ms = 16) {
    const loop = dom.loops[dom.loops.length - 1];
    for (let i = 0; i < n; i++) {
        jest.advanceTimersByTime(ms);
        loop();
    }
}

/** A saved office with one application and a follow-up due today. */
function savedOffice() {
    const now = new Date();
    let doc = addApplication(emptyDoc(CONFIG, now), { company: 'Acme', role: 'Designer' }, CONFIG, now, { id: 'a1' }).doc;
    doc = addTask(doc, { applicationId: 'a1', text: 'Follow up', due: formatDate(now) }, CONFIG, now, { id: 't1' }).doc;
    return doc;
}

// ---- Boot -------------------------------------------------------------------

test('auto-boots through the loading screen into a running loop, with the welcome up', async () => {
    const main = await boot();
    const state = main.getState();
    expect(state.running).toBe(true);
    expect(state.loaded).toBe(true);
    expect(state.storageStatus).toBe('fresh');
    expect(dom.el('load-progress').style.width).toBe('100%');
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
    expect(dom.replaced).toHaveLength(0);

    // A fresh office: the welcome is up, with no resume line and no note.
    expect(dom.el('welcome').hidden).toBe(false);
    expect(dom.el('welcome-resume').hidden).toBe(true);
    expect(dom.el('storage-note').textContent).toBe('');
    expect(document.title).toBe('Corner Office');
    stepFrames(30);
});

test('a returning visitor is told what is waiting, in the card and in the title', async () => {
    localStorage.setItem(CONFIG.storage.key, JSON.stringify(savedOffice()));
    const main = await boot();
    expect(main.getState().storageStatus).toBe('restored');
    expect(main.getDoc().applications).toHaveLength(1);
    expect(dom.el('welcome-resume').hidden).toBe(false);
    expect(dom.el('welcome-resume').textContent).toBe('Welcome back. 1 follow-up is waiting for you today.');
    expect(document.title).toBe('(1) Corner Office');
});

test('a fresh office leads with adding an application, and a returning one with stepping inside', async () => {
    await boot();
    const labels = () => dom.el('welcome-actions').children.map((b) => b.textContent);
    expect(labels()).toEqual(['Add your first application', 'Stock the office with samples', 'Look around']);

    jest.resetModules();
    dom.uninstall();
    installThree();
    dom = installDom();
    localStorage.setItem(CONFIG.storage.key, JSON.stringify(savedOffice()));
    await boot();
    expect(labels()).toEqual(['Step inside', 'Open the computer']);
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(dom.el('welcome').hidden).toBe(true);
});

// ---- Storage ----------------------------------------------------------------

test('an office saved by a newer build is left alone, and the visitor is told', async () => {
    const newer = JSON.stringify({ schema: 99, applications: [] });
    localStorage.setItem(CONFIG.storage.key, newer);
    const main = await boot();
    expect(main.getState().storageStatus).toBe('newer');
    expect(dom.el('storage-note').textContent).toMatch(/newer version/);
    main.__test__.mutate((doc) => addApplication(doc, { company: 'X' }, CONFIG, new Date()));
    expect(localStorage.getItem(CONFIG.storage.key)).toBe(newer);
});

test('a browser that will not save says so', async () => {
    localStorage.getItem = () => { throw new Error('denied'); };
    const main = await boot();
    expect(main.getState().storageStatus).toBe('unavailable');
    expect(dom.el('storage-note').textContent).toMatch(/private window/);
});

test('a change in another tab is followed, and undo steps from before it are dropped', async () => {
    const main = await boot();
    const t = main.__test__;
    t.mutate((doc) => addApplication(doc, { company: 'Mine' }, CONFIG, new Date()), 'Added Mine');
    expect(t.history.canUndo).toBe(true);

    localStorage.setItem(CONFIG.storage.key, JSON.stringify(savedOffice()));
    fire(dom.windowStub, 'storage', { key: 'some-other-scene' });
    expect(main.getDoc().applications.map((a) => a.company)).toEqual(['Mine']);
    fire(dom.windowStub, 'storage', { key: CONFIG.storage.key });
    expect(main.getDoc().applications.map((a) => a.company)).toEqual(['Acme']);
    expect(t.history.canUndo).toBe(false);
    expect(said()).toBe('Your office was updated in another tab.');

    // Another tab clearing everything leaves this one empty, and able to save.
    localStorage.removeItem(CONFIG.storage.key);
    fire(dom.windowStub, 'storage', { key: CONFIG.storage.key });
    expect(main.getDoc().applications).toEqual([]);
    t.mutate((doc) => addApplication(doc, { company: 'Fresh start' }, CONFIG, new Date()));
    expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).applications).toHaveLength(1);
});

// ---- Changing the document --------------------------------------------------

test('mutate saves and refreshes, a refusal is announced, and undo puts the document back', async () => {
    const main = await boot();
    const t = main.__test__;
    const empty = main.getDoc();

    const added = t.mutate((doc) => addApplication(doc, { company: 'Acme' }, CONFIG, new Date(), { id: 'a1' }), 'Added Acme');
    expect(added.record.company).toBe('Acme');
    expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).applications).toHaveLength(1);

    const refused = t.mutate((doc) => setStatus(doc, 'a1', 'ghosted', CONFIG, new Date()));
    expect(refused.error).toBeTruthy();
    expect(said()).toBe(refused.error);
    expect(t.history.size).toBe(1);

    // A mutation that changes nothing is not an undo step.
    t.mutate((doc) => setStatus(doc, 'a1', 'applied', CONFIG, new Date()));
    expect(t.history.size).toBe(1);

    expect(t.undo().label).toBe('Added Acme');
    expect(main.getDoc()).toBe(empty);
    expect(said()).toBe('Undone. Added Acme');
    expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).applications).toHaveLength(0);
    expect(t.undo()).toBeNull();
});

// ---- Frames -----------------------------------------------------------------

test('an idle office draws no frames, and a change draws exactly one', async () => {
    const main = await boot();
    stepFrames(5);
    const settled = main.getState().frames;
    stepFrames(60);
    expect(main.getState().frames).toBe(settled);

    main.__test__.requestRender();
    stepFrames(10);
    expect(main.getState().frames).toBe(settled + 1);

    dom.windowStub.innerWidth = 390;
    dom.windowStub.innerHeight = 844;
    fire(dom.windowStub, 'resize');
    stepFrames(3);
    expect(main.getState().frames).toBe(settled + 2);
});

test('the clock is read again once a minute while the tab is open', async () => {
    const main = await boot();
    stepFrames(2);
    const before = main.getState().frames;
    // Frames are clamped, so a minute of them is needed, not one long one.
    stepFrames(Math.ceil(CONFIG.tickSeconds / CONFIG.quality.maxFrameSeconds) + 2, 100);
    expect(main.getState().frames).toBeGreaterThan(before);
});

test('a hidden tab saves and stops, and comes back running', async () => {
    const main = await boot();
    main.__test__.mutate((doc) => addApplication(doc, { company: 'Acme' }, CONFIG, new Date()));
    dom.documentStub.visibilityState = 'hidden';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(false);
    dom.documentStub.visibilityState = 'visible';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(true);
});

test('page hide notes the visit, saves, and stops saving after', async () => {
    const main = await boot();
    fire(dom.windowStub, 'pagehide');
    const saved = JSON.parse(localStorage.getItem(CONFIG.storage.key));
    expect(saved.meta.lastVisitAt).toBeTruthy();
    expect(main.getState().running).toBe(false);
    main.__test__.mutate((doc) => addApplication(doc, { company: 'Too late' }, CONFIG, new Date()));
    expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).applications).toHaveLength(0);
});

test('without WebGL the page says so and goes to the standard site', async () => {
    dom.windowStub.WebGLRenderingContext = undefined;
    await import('../www/office/js/main.js');
    await flushAsync();
    jest.advanceTimersByTime(3000);
    expect(dom.replaced).toEqual(['/']);
});

// ---- Source rules -----------------------------------------------------------

describe('source rules', () => {
    const dir = join(process.cwd(), 'www', 'office', 'js');
    const sources = readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));

    test('the sweep has files to sweep', () => {
        expect(sources).toEqual(expect.arrayContaining(['main.js', 'store.js', 'query.js', 'derive.js']));
    });

    test.each(sources)('%s never writes markup from a string', (file) => {
        // EVERY VISITOR STRING REACHES THE PAGE THROUGH textContent. The office
        // shows what visitors typed and what a restored backup file claims, and
        // either could be a script tag.
        const src = readFileSync(join(dir, file), 'utf8');
        expect(src).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/);
    });

    test.each(sources)('%s is built, so the page is not running stale code', (file) => {
        const min = file.replace(/\.js$/, '.min.js');
        expect(readdirSync(dir)).toContain(min);
    });
});
