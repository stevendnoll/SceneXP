// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The arrival and the touch points (M2 piece 4), driven through the page on
 * the DOM stub:
 *
 *   - which home is on the plinth: the example on a first visit, the
 *     visitor's own latest on a return (intro.js arrivalId);
 *   - the arrival panel: its words are copy.js's, it arrives with the
 *     studio, steps the toolbar aside, and collapses to its handle;
 *   - each touch point does the same thing by every route: its halo, its
 *     row in the places list, its key;
 *   - the halos come one stage at a time, retire once used, and keep a
 *     first visit's example unsaved.
 *
 * Where a tap on the 3D studio lands is tested against the real three.js
 * in whitestone-marks. A HEADLESS BOOT IS NOT A WORKING PAGE: how it looks
 * is Steve's QA.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { BRAND, STUDIO } from '../www/whitestone/js/copy.js';
import { arrivalId, introHint } from '../www/whitestone/js/intro.js';
import { USED } from '../www/whitestone/js/marks.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const HTML = readFileSync(join(WS, 'index.html'), 'utf8');
const STAMP = '2026-10-12T16:00:00.000Z';

// ---- Which home arrives (pure) ------------------------------------------------------

describe('which home is on the plinth', () => {
    const c = (id, extra = {}) => ({ id, sample: false, deletedAt: null, updatedAt: STAMP, ...extra });
    const doc = (checklists, activeId = null) => ({ checklists, settings: { coached: 0, activeId } });

    test('the one open when they left', () => {
        expect(arrivalId(doc([c('a'), c('b')], 'a'))).toBe('a');
        expect(arrivalId(doc([c('a'), c('x', { sample: true })], 'x'))).toBe('x');
    });

    test('else their own most recently changed, ahead of the example', () => {
        expect(arrivalId(doc([
            c('x', { sample: true, updatedAt: '2026-10-13T00:00:00.000Z' }),
            c('old', { updatedAt: '2026-10-01T00:00:00.000Z' }),
            c('new', { updatedAt: '2026-10-11T00:00:00.000Z' })
        ]))).toBe('new');
    });

    test('a removed checklist never arrives, and with none left the plinth is empty', () => {
        expect(arrivalId(doc([c('gone', { deletedAt: STAMP }), c('x', { sample: true })], 'gone'))).toBe('x');
        expect(arrivalId(doc([c('gone', { deletedAt: STAMP })]))).toBeNull();
        expect(arrivalId(doc([]))).toBeNull();
    });

    test('the hint speaks to the device in hand, and to the halos only while there are any', () => {
        expect(introHint(true)).toBe(STUDIO.hintTouch);
        expect(introHint(false)).toBe(STUDIO.hintPointer);
        expect(introHint(true, false)).toBe(STUDIO.hintPlacesTouch);
        expect(introHint(false, false)).toBe(STUDIO.hintPlacesPointer);
        expect(STUDIO.hintPlacesPointer).not.toMatch(/marker/);
    });
});

// ---- The words in the markup are copy.js's ---------------------------------------------

describe('the markup', () => {
    const text = (pattern) => {
        const m = pattern.exec(HTML);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
    };

    test('the arrival panel says what copy.js says', () => {
        expect(text(/id="intro-kicker"[^>]*>([^<]+)</)).toBe(BRAND.name);
        expect(text(/class="intro-lead">([^<]+)</)).toBe(BRAND.tagline);
        expect(text(/class="intro-body">([^<]+)</)).toBe(STUDIO.body);
        expect(text(/id="intro-start"[^>]*>([^<]+)</)).toBe(STUDIO.start);
        expect(text(/id="intro-explore"[^>]*>([^<]+)</)).toBe(STUDIO.explore);
        expect(text(/id="intro-hint"[^>]*>([^<]+)</)).toBe(STUDIO.hintTouch);
        expect(text(/class="intro-honesty">([^<]+)</)).toBe(BRAND.honesty);
        expect(text(/id="intro-close"[^>]*aria-label="([^"]+)"/)).toBe(STUDIO.collapse);
        expect(text(/id="intro-handle"[^>]*>([^<]+)</)).toBe(STUDIO.handle);
        expect(text(/id="ws-back"[^>]*>([^<]+)</)).toBe(STUDIO.back);
        expect(HTML).toMatch(/<button id="ws-back"[^>]*\shidden>/);
    });

    test('the places list says what copy.js says', () => {
        expect(text(/id="prop-panel-heading"[^>]*>([^<]+)</)).toBe(STUDIO.listHeading);
        expect(text(/class="prop-panel-note">([^<]+)</)).toBe(STUDIO.listNote);
    });

    test('the places list is last, after the studio, and hidden until it is ready', () => {
        expect(HTML.indexOf('id="prop-panel"')).toBeGreaterThan(HTML.indexOf('id="game-canvas"'));
        expect(HTML.indexOf('id="prop-panel"')).toBeGreaterThan(HTML.lastIndexOf('class="card-overlay'));
        expect(HTML).toMatch(/<section id="prop-panel"[^>]*\shidden>/);
        expect(HTML).toMatch(/<section id="ws-intro" class="ws-intro is-out"/);
    });
});

// ---- Driven through the page ---------------------------------------------------------------

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    dom.windowStub.print = jest.fn();
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.fetch;
});

function serveSheet() {
    globalThis.fetch = async (url) => ({
        ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8'))
    });
}

/** Boot. `saved` is the document already in this browser (none: a first
 *  visit, which arrives to the example). */
async function boot({ saved = null, sheet = false } = {}) {
    if (saved) localStorage.setItem(CONFIG.storage.key, JSON.stringify(saved));
    // What the markup ships hidden (the stub reads no markup).
    for (const id of ['prop-panel', 'ws-marks', 'ws-back']) dom.el(id).hidden = true;
    if (sheet) serveSheet();
    const main = await import('../www/whitestone/js/main.js');
    await flushAsync(20);
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + 100);
    return main;
}

function stepFrames(n, ms = 16) {
    const loop = dom.loops[dom.loops.length - 1];
    for (let i = 0; i < n; i++) {
        jest.advanceTimersByTime(ms);
        loop();
    }
}

function said() {
    jest.advanceTimersByTime(50);
    return dom.el('ws-live').textContent;
}

const openCards = () => CONFIG && ['my-checklists', 'setup', 'preferences', 'menu', 'quote', 'checklist', 'room', 'task', 'confirm']
    .filter((id) => !dom.el(id).hidden);

/** A saved document made through the store's own mutations, so it is one
 *  the store accepts: `homes` are [id, updatedAt]. */
async function savedDoc(homes, settings = {}) {
    const { emptyDoc, createChecklist, setSettings } = await import('../www/whitestone/js/store.js');
    let doc = emptyDoc(CONFIG, new Date(STAMP));
    for (const [id, at] of homes) {
        doc = createChecklist(doc, { title: `Home ${id}`, levels: ['main'], visitFrequency: 'once', household: '' }, CONFIG, new Date(at), { id }).doc;
    }
    return setSettings(doc, settings).doc;
}

describe('arriving', () => {
    test('a first visit: the example on the plinth, the panel up, the toolbar aside, only the concierge coaching', async () => {
        const main = await boot();
        expect(main.__test__.active().sample).toBe(true);
        const intro = main.__test__.intro();
        expect(intro.open).toBe(true);
        expect(dom.el('ws-intro').classList.contains('is-out')).toBe(false);
        expect(dom.el('intro-handle').classList.contains('is-out')).toBe(true);
        expect(dom.el('ws-bar').classList.contains('is-away')).toBe(true);
        expect(dom.el('intro-explore').hidden).toBe(false);
        expect(dom.el('prop-panel').hidden).toBe(false);
        expect(dom.el('intro-hint').textContent).toBe(STUDIO.hintPointer);
        stepFrames(2);
        // The halo layer is up, for the concierge alone.
        expect(dom.el('ws-marks').hidden).toBe(false);
        const marks = main.__test__.marks().list;
        expect(marks.map((m) => m.key)).toEqual(['desk', 'model', 'menu', 'board', 'printer']);
        expect(marks.map((m) => m.btn.getAttribute('aria-label'))).toEqual(marks.map((m) => STUDIO.halos[m.key]));
    });

    test('a returning visitor arrives to their latest checklist, not the example', async () => {
        const main = await boot({
            saved: await savedDoc([['home-older', '2026-10-01T00:00:00.000Z'], ['home-newer', '2026-10-11T00:00:00.000Z']])
        });
        expect(main.__test__.active().id).toBe('home-newer');
        expect(dom.el('intro-explore').hidden).toBe(true);
        expect(main.__test__.model().placed.slabs.length).toBe(1);
    });

    test('collapsing: the close button, then the handle brings it back', async () => {
        const main = await boot();
        fire(dom.el('intro-close'), 'click');
        expect(main.__test__.intro().open).toBe(false);
        expect(dom.el('ws-bar').classList.contains('is-away')).toBe(false);
        expect(dom.el('intro-handle').classList.contains('is-out')).toBe(false);
        expect(dom.el('intro-handle').getAttribute('aria-expanded')).toBe('false');
        fire(dom.el('intro-handle'), 'click');
        expect(main.__test__.intro().open).toBe(true);
        expect(dom.el('ws-intro').focused).toBe(true);
        expect(dom.el('ws-bar').classList.contains('is-away')).toBe(true);
    });

    test('a tap on the studio puts the panel away', async () => {
        const main = await boot();
        main.__test__.handleSceneTap(400, 300);
        expect(main.__test__.intro().open).toBe(false);
    });

    test('Start your own on the panel opens the setup card', async () => {
        await boot();
        fire(dom.el('intro-start'), 'click');
        expect(openCards()).toEqual(['setup']);
    });

    test('Explore the example lifts its main floor at the model', async () => {
        const main = await boot();
        fire(dom.el('intro-explore'), 'click');
        expect(main.__test__.model().lifted).toBe('main');
        expect(main.__test__.ui.station).toBe('model');
        expect(openCards()).toEqual([]);
    });
});

describe('the touch points', () => {
    test('the concierge: Start your own, and My checklists once there is one of their own', async () => {
        const main = await boot();
        main.__test__.actOn('desk');
        expect(main.__test__.ui.station).toBe('desk');
        expect(openCards()).toEqual(['setup']);
        dom.el('setup-cancel') && fire(dom.el('setup-cancel'), 'click');

        const back = await (async () => {
            dom.uninstall();
            jest.resetModules();
            installThree();
            dom = installDom();
            return boot({ saved: await savedDoc([['home-mine', STAMP]]) });
        })();
        back.__test__.actOn('desk');
        expect(openCards()).toEqual(['my-checklists']);
    });

    test('the model: each press lifts the next level, then puts it back together', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        const lifts = [];
        for (let i = 0; i < 4; i++) {
            main.__test__.actOn('model');
            lifts.push(main.__test__.model().lifted);
        }
        expect(lifts).toEqual(['basement', 'main', 'second', null]);
        expect(main.__test__.ui.station).toBe('model');
    });

    test('a tap on a level lifts it, and a tap on the lifted level opens its rooms', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.actOn('model', { level: 'second' });
        expect(main.__test__.model().lifted).toBe('second');
        expect(openCards()).toEqual([]);
        main.__test__.actOn('model', { level: 'second' });
        expect(openCards()).toEqual(['checklist']);
        expect(dom.el('checklist-filter').value).toBe('level:second');
    });

    test('the model with nothing on the plinth starts a checklist', async () => {
        const main = await boot({ saved: await savedDoc([]) });
        main.__test__.actOn('model');
        expect(openCards()).toEqual(['setup']);
    });

    test('the menu and the board', async () => {
        const main = await boot({ sheet: true });
        main.__test__.actOn('menu');
        expect(main.__test__.ui.station).toBe('menu');
        expect(openCards()).toEqual(['menu']);
        fire(dom.el('menu-close') || dom.el('menu'), 'click');
        main.__test__.state.reducedMotion = true;
        const fresh = await (async () => {
            dom.uninstall();
            jest.resetModules();
            installThree();
            dom = installDom();
            return boot();
        })();
        fresh.__test__.actOn('board');
        expect(fresh.__test__.ui.station).toBe('board');
        expect(openCards()).toEqual(['checklist']);
    });

    test('the printer prints the checklist, or says there is nothing to print yet', async () => {
        const main = await boot();
        main.__test__.actOn('printer');
        expect(openCards()).toEqual(['checklist']);
        expect(dom.windowStub.print).toHaveBeenCalledTimes(1);

        dom.uninstall();
        jest.resetModules();
        installThree();
        dom = installDom();
        dom.windowStub.print = jest.fn();
        const empty = await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine' }) });
        empty.__test__.actOn('printer');
        expect(said()).toBe(STUDIO.printerEmpty);
        expect(dom.windowStub.print).not.toHaveBeenCalled();
        expect(openCards()).toEqual([]);
    });

    test('nothing answers before the studio is ready, or for a key that is no touch point', async () => {
        const main = await boot();
        expect(main.__test__.actOn('lamp')).toBe(false);
        main.__test__.state.loaded = false;
        expect(main.__test__.actOn('menu')).toBe(false);
    });
});

describe('the places list and the keys', () => {
    test('one row per place, named as copy.js names them, each doing what a tap there does', async () => {
        const main = await boot();
        const rows = dom.el('prop-list').children.map((li) => li.children[0]);
        expect(rows.map((b) => b.textContent)).toEqual(Object.values(STUDIO.places));
        const desk = rows.find((b) => b.getAttribute('data-prop') === 'desk');
        fire(desk, 'click');
        expect(openCards()).toEqual(['setup']);
        expect(main.__test__.ui.station).toBe('desk');
        // With a card open, a row does nothing.
        fire(rows.find((b) => b.getAttribute('data-prop') === 'overview'), 'click');
        expect(main.__test__.ui.station).toBe('desk');
    });

    test('the number keys go to the places, but never from a text field or over a card', async () => {
        const main = await boot();
        const press = (key, target = dom.documentStub.body) => fire(dom.documentStub, 'keydown', { key, target, preventDefault() {} });
        press('1');
        expect(main.__test__.ui.station).toBe('overview');
        expect(main.__test__.intro().open).toBe(false);
        press('3', { tagName: 'INPUT' });
        expect(main.__test__.ui.station).toBe('overview');
        press('3');
        expect(main.__test__.ui.station).toBe('model');
        expect(main.__test__.model().lifted).toBe('basement');
        press('Escape');
        expect(main.__test__.model().lifted).toBeNull();
        press('2');
        expect(openCards()).toEqual(['setup']);
        press('1');
        expect(main.__test__.ui.station).toBe('desk');
    });

    test('Escape puts the arrival panel away', async () => {
        const main = await boot();
        fire(dom.documentStub, 'keydown', { key: 'Escape', target: dom.documentStub.body, preventDefault() {} });
        expect(main.__test__.intro().open).toBe(false);
    });
});

describe('getting back out', () => {
    test('Back to the studio appears once a floor is opened, and one press sets the house down and returns', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        dom.el('ws-back').hidden = true;   // the markup ships it hidden
        expect(dom.el('ws-back').hidden).toBe(true);
        main.__test__.actOn('model', { level: 'second' });
        expect(dom.el('ws-back').hidden).toBe(false);
        fire(dom.el('ws-back'), 'click');
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.ui.station).toBe('overview');
        expect(dom.el('ws-back').hidden).toBe(true);
        expect(said()).toBe('The model is back together.');
    });

    test('it shows at any station, not only the model', async () => {
        const main = await boot();
        main.__test__.goTo('menu');
        expect(dom.el('ws-back').hidden).toBe(false);
        fire(dom.el('ws-back'), 'click');
        expect(main.__test__.ui.station).toBe('overview');
    });

    test('Escape, and the 1 key, do the whole thing in one step', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        const press = (key) => fire(dom.documentStub, 'keydown', { key, target: dom.documentStub.body, preventDefault() {} });
        press('3');
        expect(main.__test__.model().lifted).toBe('basement');
        press('Escape');
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.ui.station).toBe('overview');
        press('3');
        press('1');
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.ui.station).toBe('overview');
    });

    test('a tap on nothing in particular steps back out, and at the overview does nothing', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.actOn('model', { level: 'main' });
        // The stub's raycaster meets nothing, so every tap is on nothing.
        main.__test__.handleSceneTap(10, 10);
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.ui.station).toBe('overview');
        main.__test__.handleSceneTap(10, 10);
        expect(main.__test__.ui.station).toBe('overview');
    });
});

describe('the halos', () => {
    test('they retire as things are used, and go once three have been', async () => {
        const main = await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine' }) });
        stepFrames(2);
        expect(dom.el('ws-marks').hidden).toBe(false);
        main.__test__.noteUsed('desk');
        main.__test__.noteUsed('menu');
        expect(main.getDoc().settings.coached).toBe(USED.desk | USED.menu);
        stepFrames(2);
        expect(dom.el('ws-marks').hidden).toBe(false);
        main.__test__.noteUsed('board');
        stepFrames(2);
        expect(dom.el('ws-marks').hidden).toBe(true);
        // Kept, so a return is not coached again.
        expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).settings.coached).toBe(USED.desk | USED.menu | USED.board);
    });

    test('they are hidden while a card is open', async () => {
        const main = await boot();
        stepFrames(2);
        expect(dom.el('ws-marks').hidden).toBe(false);
        main.__test__.openMine();
        stepFrames(2);
        expect(dom.el('ws-marks').hidden).toBe(true);
    });

    test('a first visit\'s example stays unsaved when a halo retires, until a real change', async () => {
        const main = await boot();
        main.__test__.actOn('desk');
        expect(main.getDoc().settings.coached).toBe(USED.desk);
        expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();
        main.__test__.clearExample();
        expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).settings.coached).toBe(USED.desk);
    });

    test('once the halos have retired, the panel stops promising them', async () => {
        const main = await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine', coached: USED.desk | USED.menu | USED.board }) });
        expect(dom.el('intro-hint').textContent).toBe(STUDIO.hintPlacesPointer);
        expect(main.__test__.intro().open).toBe(true);
    });

    test('the hint changes the moment the last halo retires', async () => {
        const main = await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine' }) });
        expect(dom.el('intro-hint').textContent).toBe(STUDIO.hintPointer);
        main.__test__.noteUsed('desk');
        main.__test__.noteUsed('menu');
        expect(dom.el('intro-hint').textContent).toBe(STUDIO.hintPointer);
        main.__test__.noteUsed('board');
        expect(dom.el('intro-hint').textContent).toBe(STUDIO.hintPlacesPointer);
    });

    test('a halo does what its thing does', async () => {
        const main = await boot();
        const desk = main.__test__.marks().list.find((m) => m.key === 'desk');
        fire(desk.btn, 'click');
        expect(openCards()).toEqual(['setup']);
        expect(main.__test__.intro().open).toBe(false);
    });

    test('the toolbar counts as a use too', async () => {
        const main = await boot({ sheet: true });
        fire(dom.el('bar-menu'), 'click');
        expect(main.getDoc().settings.coached & USED.menu).toBe(USED.menu);
    });
});
