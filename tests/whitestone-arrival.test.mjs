// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The arrival and Maya's guide, driven through the page on the DOM stub
 * (M2 step 2, ONBOARDING section 5):
 *
 *   - a first visit meets a plain house, and Maya a moment later;
 *   - Let's start makes "Our home", the floors rise as they are ticked,
 *     the kitchen comes in one tap with its line from the price sheet, the
 *     dots, the rooms, the review, saved;
 *   - Skip, the example's three beats, a return mid-build, the nudges;
 *   - she steps out of sight while a card is open;
 *   - Help and Undo, top right, and the way back out of an open floor.
 *
 * The guide's every path is in whitestone-guide (pure); here is that the
 * page does what each step says. A HEADLESS BOOT IS NOT A WORKING PAGE:
 * how it looks and reads is Steve's QA.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { BRAND, GUIDE, HELP, STUDIO, UI } from '../www/whitestone/js/copy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const HTML = readFileSync(join(WS, 'index.html'), 'utf8');
const STAMP = '2026-10-12T16:00:00.000Z';

// ---- The markup -------------------------------------------------------------------------

describe('the markup', () => {
    const text = (pattern) => {
        const m = pattern.exec(HTML);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
    };

    test('the old studio is gone: no intro panel, no toolbar, no halos, no places list, no stations', () => {
        expect(HTML).not.toMatch(/id="ws-intro"|id="intro-|id="ws-bar"|id="bar-|id="ws-marks"|id="prop-panel"/);
        expect(HTML).not.toMatch(/intro\.min\.js|stations\.min\.js|studio\.min\.js|street\.min\.js|marks\.min\.js|boards\.min\.js|proplist-1\.0\.0|pan-1\.0\.0/);
        expect(text(/id="game-canvas"[^>]*aria-label="([^"]+)"/)).toMatch(/turntable.*Drag to turn it, and tap a floor to open it\.$/);
    });

    test("Maya's bubble ships hidden, with her name and the Skip in copy.js's words", () => {
        expect(HTML).toMatch(/<section id="ws-host"[^>]*\shidden>/);
        expect(text(/id="host-name"[^>]*>([^<]+)</)).toBe(GUIDE.name);
        expect(text(/class="host-role">([^<]+)</)).toBe(GUIDE.role);
        expect(text(/class="host-portrait"[^>]*>([^<]+)</)).toBe(GUIDE.portrait);
        expect(text(/id="host-skip"[^>]*>([^<]+)</)).toBe(GUIDE.skip);
    });

    test('Help and Undo say what copy.js says, and the menu ships closed', () => {
        expect(text(/id="ws-undo"[^>]*>([^<]+)</)).toBe(HELP.undo);
        expect(text(/id="ws-help"[^>]*aria-label="([^"]+)"/)).toBe(HELP.label);
        expect(HTML).toMatch(/<div id="ws-help-menu"[^>]*\shidden>/);
        for (const key of ['again', 'restart', 'checklist', 'menu', 'prefs', 'home', 'mine', 'about']) {
            expect(text(new RegExp(`id="help-${key}"[^>]*>([^<]+)<`))).toBe(HELP[key]);
        }
        expect(text(/id="ws-back"[^>]*>([^<]+)</)).toBe(STUDIO.back);
    });
});

// ---- Driven through the page -------------------------------------------------------------

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

function serveSheet() {
    globalThis.fetch = async (url) => ({
        ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8'))
    });
}

/** Boot, with `saved` the document already in this browser (none: a
 *  first visit), and wait until Maya has spoken unless `quiet`. */
async function boot({ saved = null, sheet = false, quiet = false } = {}) {
    if (saved) localStorage.setItem(CONFIG.storage.key, JSON.stringify(saved));
    // What the markup ships hidden (the stub reads no markup).
    for (const id of ['ws-host', 'ws-back', 'ws-help-menu', 'help-checklist', 'help-prefs', 'help-home']) dom.el(id).hidden = true;
    if (sheet) serveSheet();
    const main = await import('../www/whitestone/js/main.js');
    await flushAsync(20);
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + 100);
    if (!quiet) await jest.advanceTimersByTimeAsync(CONFIG.guide.delay * 1000 + 10);
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

const line = () => dom.el('host-line').textContent;
const shown = () => !dom.el('ws-host').hidden;
const buttons = () => dom.el('host-actions').children.map((b) => b.textContent);
const press = (id) => {
    const b = dom.el('host-actions').children.find((x) => x.id === `host-${id}`);
    if (!b) throw new Error(`no ${id} in ${buttons().join(', ')}`);
    fire(b, 'click');
};
/** The floor's checkbox in the bubble. */
const floor = (key) => {
    const fieldset = dom.el('host-choices').children[0];
    const label = fieldset.children.slice(1).find((l) => l.children[0].value === key);
    if (!label) throw new Error(`no floor ${key}`);
    return label.children[0];
};
const tick = (key, on) => {
    const box = floor(key);
    box.checked = on;
    fire(box, 'change');
};
const openCards = () => ['my-checklists', 'setup', 'preferences', 'menu', 'quote', 'checklist', 'room', 'task', 'confirm']
    .filter((id) => !dom.el(id).hidden);
const saved = () => JSON.parse(localStorage.getItem(CONFIG.storage.key));
const own = (main) => main.getDoc().checklists.find((c) => !c.sample && !c.deletedAt);

/** A saved document made through the store's own mutations: `homes` are
 *  [id, updatedAt]. */
async function savedDoc(homes, settings = {}) {
    const { emptyDoc, createChecklist, setSettings } = await import('../www/whitestone/js/store.js');
    let doc = emptyDoc(CONFIG, new Date(STAMP));
    for (const [id, at] of homes) {
        doc = createChecklist(doc, { title: `Home ${id}`, levels: ['main'], visitFrequency: 'once', household: '' }, CONFIG, new Date(at), { id }).doc;
    }
    return setSettings(doc, settings).doc;
}

describe('a first visit', () => {
    test('a plain house, and Maya a moment after it arrives, with nothing saved', async () => {
        const main = await boot({ quiet: true });
        expect(main.__test__.active()).toBeNull();
        expect(main.__test__.model().placed.slabs).toHaveLength(1);
        expect(shown()).toBe(false);
        await jest.advanceTimersByTimeAsync(CONFIG.guide.delay * 1000 + 10);
        expect(shown()).toBe(true);
        expect(line()).toBe(GUIDE.hello);
        expect(said()).toBe(GUIDE.hello);
        expect(buttons()).toEqual([GUIDE.start, GUIDE.example]);
        expect(dom.el('host-small').textContent).toBe(BRAND.honesty);
        expect(dom.el('host-skip').hidden).toBe(true);
        expect(dom.el('host-progress').hidden).toBe(true);
        expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();
    });

    test('under reduced motion she speaks at once', async () => {
        dom.windowStub.matchMedia = (media) => ({ matches: /reduce/.test(media), addEventListener() {}, removeEventListener() {} });
        await boot({ quiet: true });
        await jest.advanceTimersByTimeAsync(1);
        expect(shown()).toBe(true);
    });

    test("Let's start makes \"Our home\" on one floor, and asks which floors it has", async () => {
        const main = await boot();
        press('start');
        const c = own(main);
        expect(c).toMatchObject({ title: GUIDE.defaultTitle, levels: ['main'] });
        expect(main.getDoc().settings.activeId).toBe(c.id);
        expect(line()).toBe(GUIDE.floors);
        expect(floor('main').checked).toBe(true);
        expect(floor('second').checked).toBe(false);
        expect(dom.el('host-skip').hidden).toBe(false);
        expect(dom.el('host-progress').hidden).toBe(false);
        expect(dom.el('host-progress').children.map((li) => li.getAttribute('aria-current'))).toEqual(['step', null, null, null]);
        // Saved, with where the guide is.
        expect(saved().settings.guide).toEqual({ scene: 'floors', reviewed: false });
    });

    test('each floor ticked rises onto the house, and the last cannot go', async () => {
        const main = await boot();
        press('start');
        tick('second', true);
        expect(own(main).levels).toEqual(['main', 'second']);
        expect(main.__test__.model().placed.slabs).toHaveLength(2);
        expect(line()).toBe(`${GUIDE.floorsTaking} ${GUIDE.floors}`);
        tick('basement', true);
        tick('second', false);
        expect(own(main).levels).toEqual(['basement', 'main']);
        tick('basement', false);
        tick('main', false);
        expect(own(main).levels).toEqual(['main']);
        // Its box is ticked again, since the floor stayed.
        expect(floor('main').checked).toBe(true);
        // Each is one undo step.
        expect(main.__test__.history().canUndo).toBe(true);
    });

    test('the name typed is kept on Next, and an empty one changes nothing', async () => {
        const main = await boot();
        press('start');
        main.__test__.host().titleField.value = '  Maple Street  ';
        press('next');
        expect(own(main).title).toBe('Maple Street');
        expect(line()).toBe(GUIDE.firstRoom);
        fire(dom.el('help-restart'), 'click');
        press('start');
        main.__test__.host().titleField.value = '   ';
        press('next');
        expect(own(main).title).toBe('Maple Street');
    });

    test('the kitchen in one tap: its preset, its floor opened, and its line from the price sheet', async () => {
        const main = await boot({ sheet: true });
        press('start');
        // On the main floor, not the first floor listed.
        tick('basement', true);
        press('next');
        expect(buttons()).toEqual([GUIDE.addKitchen, GUIDE.otherRoom]);
        press('kitchen');
        const c = own(main);
        expect(c.rooms).toHaveLength(1);
        expect(c.rooms[0]).toMatchObject({ area: 'kitchen', level: 'main' });
        expect(c.items).toHaveLength(9);
        expect(main.__test__.model().lifted).toBe('main');
        expect(line()).toBe("There's your kitchen with its nine standard tasks, $61 so far. Every visit starts at $120, so your next rooms fit inside that.");
        expect(dom.el('host-progress').children[1].getAttribute('aria-current')).toBe('step');
        press('next');
        expect(line()).toBe(GUIDE.dots);
        expect(buttons()).toEqual([GUIDE.gotIt]);
        press('gotIt');
        expect(line()).toBe(GUIDE.rooms);
        expect(buttons()).toEqual([GUIDE.addRoom]);
    });

    test('before the price sheet arrives, the kitchen waits and says so', async () => {
        const main = await boot();
        press('start');
        press('next');
        press('kitchen');
        expect(own(main).rooms).toHaveLength(0);
        expect(said()).toBe(UI.sheetLoading);
        expect(line()).toBe(GUIDE.firstRoom);
    });

    test('a tapped dot opens its task over the house, and Maya steps aside until it closes', async () => {
        const main = await boot({ sheet: true });
        press('start');
        press('next');
        press('kitchen');
        press('next');
        const dot = own(main).items[0];
        main.__test__.tapModel(null, dot.id);
        expect(openCards()).toEqual(['task']);
        // Armed: the tap's own click, landing a beat later on the card, is
        // swallowed (a keyboard press, detail 0, never is).
        expect(fire(dom.el('task-panel'), 'click', { detail: 1 }).defaultPrevented).toBe(true);
        expect(fire(dom.el('task-panel'), 'click', { detail: 0 }).defaultPrevented).toBe(false);
        stepFrames(2);
        expect(shown()).toBe(false);
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        const { closeCard } = await import('../www/whitestone/js/cards.min.js');
        closeCard('task');
        stepFrames(2);
        expect(shown()).toBe(true);
        expect(line()).toBe(GUIDE.rooms);
    });

    test('another room through the room card, then Review, preferences offered, and saved', async () => {
        const main = await boot({ sheet: true });
        press('start');
        tick('second', true);
        press('next');
        press('kitchen');
        press('next');
        press('gotIt');
        press('addRoom');
        expect(openCards()).toEqual(['room']);
        dom.el('room-level').value = 'second';
        dom.el('room-area').value = 'bedroom';
        dom.el('room-preset').checked = true;
        fire(dom.el('room-form'), 'submit');
        // Shown on the house, not in the checklist, while Maya is guiding.
        expect(openCards()).toEqual([]);
        expect(own(main).rooms).toHaveLength(2);
        expect(buttons()).toEqual([GUIDE.addRoom, GUIDE.reviewIt]);
        press('review');
        expect(main.__test__.model().lifted).toBeNull();
        expect(line()).toBe(GUIDE.review);
        press('preferences');
        expect(openCards()).toEqual(['preferences']);
        fire(dom.el('prefs-skip'), 'click');
        press('save');
        expect(line()).toBe(GUIDE.saved);
        expect(saved().settings.guide).toEqual({ scene: 'done', reviewed: true });
        press('lookAround');
        expect(shown()).toBe(false);
    });

    test('Skip leaves the guide, saved, and the house stays fully usable', async () => {
        const main = await boot();
        press('start');
        fire(dom.el('host-skip'), 'click');
        expect(shown()).toBe(false);
        expect(saved().settings.guide).toEqual({ scene: 'done', reviewed: false });
        expect(main.__test__.tapModel('main')).toBe(true);
        expect(main.__test__.model().lifted).toBe('main');
    });
});

describe('the example', () => {
    test('three beats, its main floor opened on the second, and Build my own from it', async () => {
        const main = await boot();
        press('example');
        expect(main.__test__.active().sample).toBe(true);
        expect(line()).toBe(GUIDE.example1);
        expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();
        press('next');
        expect(line()).toBe(GUIDE.example2);
        expect(main.__test__.model().lifted).toBe('main');
        press('next');
        expect(buttons()).toEqual([GUIDE.buildOwn, GUIDE.lookAround]);
        press('buildOwn');
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.active().sample).toBe(false);
        expect(main.__test__.active().title).toBe(GUIDE.defaultTitle);
        expect(line()).toBe(GUIDE.floors);
    });

    test('Look around keeps Build my own at hand', async () => {
        await boot();
        press('example');
        press('next');
        press('next');
        press('lookAround');
        expect(line()).toBe(GUIDE.look);
        expect(buttons()).toEqual([GUIDE.buildOwn]);
    });

    test('starting over puts the example back and shows the plain house again', async () => {
        const main = await boot();
        press('example');
        fire(dom.el('help-restart'), 'click');
        expect(main.__test__.active()).toBeNull();
        expect(line()).toBe(GUIDE.hello);
    });
});

describe('a return', () => {
    test('mid-build: welcomed back to their own home, and Keep going goes back to the step', async () => {
        const main = await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine', guide: { scene: 'rooms', reviewed: false } }) });
        expect(main.__test__.active().id).toBe('home-mine');
        expect(line()).toBe(GUIDE.welcomeResume);
        expect(buttons()).toEqual([GUIDE.keepGoing, GUIDE.illLook]);
        press('keepGoing');
        expect(line()).toBe(GUIDE.rooms);
    });

    test('after the first build: welcomed, and the bubble goes at a tap', async () => {
        await boot({ saved: await savedDoc([['home-mine', STAMP]], { guide: { scene: 'done', reviewed: true } }) });
        expect(line()).toBe(GUIDE.welcome);
        expect(dom.el('host-progress').hidden).toBe(true);
        press('lookAround');
        expect(shown()).toBe(false);
    });
});

describe('nudges', () => {
    test('nothing for a while: the main button pulses once, then Maya says it again in other words, once', async () => {
        const main = await boot();
        const primary = () => dom.el('host-actions').children[0];
        await jest.advanceTimersByTimeAsync(CONFIG.guide.pulse * 1000 + 10);
        expect(primary().classList.contains('is-nudge')).toBe(true);
        await jest.advanceTimersByTimeAsync(2000);
        expect(primary().classList.contains('is-nudge')).toBe(false);
        await jest.advanceTimersByTimeAsync((CONFIG.guide.again - CONFIG.guide.pulse) * 1000);
        expect(line()).toBe(GUIDE.helloAgain);
        expect(said()).toBe(GUIDE.helloAgain);
        // And then nothing more, not even after a touch starts the wait
        // again: the hint is said once a scene.
        dom.el('ws-live').textContent = 'quiet';
        await jest.advanceTimersByTimeAsync(120000);
        main.__test__.host().poke();
        await jest.advanceTimersByTimeAsync(120000);
        expect(line()).toBe(GUIDE.helloAgain);
        expect(dom.el('ws-live').textContent).toBe('quiet');
    });

    test('a touch on the house starts the wait again', async () => {
        const main = await boot();
        await jest.advanceTimersByTimeAsync((CONFIG.guide.again - 2) * 1000);
        main.__test__.host().poke();
        await jest.advanceTimersByTimeAsync(4000);
        expect(line()).toBe(GUIDE.hello);
    });
});

describe('Help and Undo', () => {
    test('Help opens and closes its menu, and says so', async () => {
        await boot();
        fire(dom.el('ws-help'), 'click');
        expect(dom.el('ws-help-menu').hidden).toBe(false);
        expect(dom.el('ws-help').getAttribute('aria-expanded')).toBe('true');
        fire(dom.el('ws-help'), 'click');
        expect(dom.el('ws-help-menu').hidden).toBe(true);
        expect(dom.el('ws-help').getAttribute('aria-expanded')).toBe('false');
    });

    test('Escape closes the menu first, and focus goes back to Help', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('main');
        fire(dom.el('ws-help'), 'click');
        fire(dom.documentStub, 'keydown', { key: 'Escape', target: dom.documentStub.body });
        expect(dom.el('ws-help-menu').hidden).toBe(true);
        expect(dom.el('ws-help').focused).toBe(true);
        expect(main.__test__.model().lifted).toBe('main');
    });

    test("Show me again repeats the scene's hint, and after the guide a hint about the house", async () => {
        await boot();
        fire(dom.el('help-again'), 'click');
        expect(line()).toBe(GUIDE.helloAgain);
        press('start');
        fire(dom.el('host-skip'), 'click');
        fire(dom.el('help-again'), 'click');
        expect(line()).toBe(GUIDE.hint);
        press('close');
        expect(shown()).toBe(false);
    });

    test('About sits over the scene and goes back to it', async () => {
        await boot();
        press('start');
        fire(dom.el('help-about'), 'click');
        expect(line()).toBe(GUIDE.about);
        expect(dom.el('host-small').textContent).toBe(BRAND.honesty);
        press('close');
        expect(line()).toBe(GUIDE.floors);
    });

    test("the checklist's cards are in the menu once there is a checklist", async () => {
        const main = await boot();
        expect(dom.el('help-checklist').hidden).toBe(true);
        press('start');
        for (const id of ['help-checklist', 'help-prefs', 'help-home']) expect(dom.el(id).hidden).toBe(false);
        fire(dom.el('help-home'), 'click');
        expect(openCards()).toEqual(['setup']);
        expect(dom.el('ws-help-menu').hidden).toBe(true);
        expect(main.__test__.active()).toBeTruthy();
    });

    test('Undo takes back a floor', async () => {
        const main = await boot();
        press('start');
        tick('second', true);
        expect(dom.el('ws-undo').disabled).toBe(false);
        fire(dom.el('ws-undo'), 'click');
        expect(own(main).levels).toEqual(['main']);
    });
});

describe('tapping the house', () => {
    test('with no floor known, each tap opens the next floor up, then closes the house', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        const lifts = [];
        for (let i = 0; i < 4; i++) {
            main.__test__.tapModel();
            lifts.push(main.__test__.model().lifted);
        }
        expect(lifts).toEqual(['basement', 'main', 'second', null]);
    });

    test('a tap on a floor opens it, turned to face you, and a tap on the open floor shows its rooms', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('second');
        expect(main.__test__.model().lifted).toBe('second');
        expect(said()).toBe('Opened the second floor of the house.');
        expect(Math.abs(main.__test__.turntable().yaw % (Math.PI * 2))).toBeLessThan(1e-9);
        main.__test__.tapModel('second');
        expect(openCards()).toEqual(['checklist']);
        expect(dom.el('checklist-filter').value).toBe('level:second');
    });

    test('the plain house tapped while Maya greets is Let\'s start, and after the guide opens the setup card', async () => {
        const main = await boot();
        main.__test__.tapModel();
        expect(openCards()).toEqual([]);
        expect(main.__test__.active().title).toBe(GUIDE.defaultTitle);
        expect(line()).toBe(GUIDE.floors);
        fire(dom.el('host-skip'), 'click');
        fire(dom.el('ws-undo'), 'click');
        expect(main.__test__.active()).toBeNull();
        main.__test__.tapModel();
        expect(openCards()).toEqual(['setup']);
    });

    test('nothing answers before the house is ready', async () => {
        const main = await boot();
        main.__test__.showExample();
        main.__test__.state.loaded = false;
        expect(main.__test__.tapModel('main')).toBe(false);
        expect(main.__test__.model().lifted).toBeNull();
    });

    test('a press that barely moves is a tap, and a slow one or a moving one is not', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('main');
        const canvas = dom.el('game-canvas');
        fire(canvas, 'pointerdown', { pointerId: 3, clientX: 100, clientY: 100 });
        fire(canvas, 'pointermove', { pointerId: 3, clientX: 100 + CONFIG.view.tap.slop + 4, clientY: 100 });
        fire(canvas, 'pointerup', { pointerId: 3, clientX: 100 + CONFIG.view.tap.slop + 4, clientY: 100 });
        expect(main.__test__.model().lifted).toBe('main');
        fire(canvas, 'pointerdown', { pointerId: 4, clientX: 100, clientY: 100 });
        jest.advanceTimersByTime(CONFIG.view.tap.ms + 50);
        fire(canvas, 'pointerup', { pointerId: 4, clientX: 100, clientY: 100 });
        expect(main.__test__.model().lifted).toBe('main');
        // The stub's ray meets nothing, so a real tap is on empty space.
        fire(canvas, 'pointerdown', { pointerId: 5, clientX: 100, clientY: 100 });
        fire(canvas, 'pointermove', { pointerId: 5, clientX: 102, clientY: 101 });
        fire(canvas, 'pointerup', { pointerId: 5, clientX: 102, clientY: 101 });
        expect(main.__test__.model().lifted).toBeNull();
    });

    test('two fingers pinch and are never a tap, and lifting one lets the other turn', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('main');
        const canvas = dom.el('game-canvas');
        const tt = main.__test__.turntable();
        fire(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
        fire(canvas, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
        fire(canvas, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 });
        expect(tt.zoom).toBeLessThan(1);
        fire(canvas, 'pointerup', { pointerId: 2, clientX: 300, clientY: 100 });
        const yaw = tt.yaw;
        fire(canvas, 'pointermove', { pointerId: 1, clientX: 130, clientY: 100 });
        expect(tt.yaw).toBeGreaterThan(yaw);
        fire(canvas, 'pointerup', { pointerId: 1, clientX: 130, clientY: 100 });
        expect(main.__test__.model().lifted).toBe('main');
    });
});

describe('getting back out', () => {
    test('the Back button appears once a floor is open, and one press closes it', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        expect(dom.el('ws-back').hidden).toBe(true);
        main.__test__.tapModel('second');
        expect(dom.el('ws-back').hidden).toBe(false);
        fire(dom.el('ws-back'), 'click');
        expect(main.__test__.model().lifted).toBeNull();
        expect(dom.el('ws-back').hidden).toBe(true);
        expect(said()).toBe('The house is back together.');
    });

    test('Escape closes an open floor, and is left alone in a field or over a card', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        // The stub's own preventDefault, so a card's answer is seen.
        const key = (k, target = dom.documentStub.body) => fire(dom.documentStub, 'keydown', { key: k, target });
        main.__test__.tapModel('basement');
        key('Escape', { tagName: 'INPUT' });
        expect(main.__test__.model().lifted).toBe('basement');
        key('Escape');
        expect(main.__test__.model().lifted).toBeNull();
        main.__test__.tapModel('basement');
        main.__test__.openMine();
        key('Escape');
        // The card's own Escape is the card's: it closes, and the floor
        // stays open until the next one.
        expect(openCards()).toEqual([]);
        expect(main.__test__.model().lifted).toBe('basement');
        key('Escape');
        expect(main.__test__.model().lifted).toBeNull();
    });

    test('a tap on empty space steps back, and with nothing open does nothing', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('main');
        main.__test__.handleSceneTap(10, 10);
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.stepBack()).toBe(false);
        main.__test__.handleSceneTap(10, 10);
        expect(main.__test__.model().lifted).toBeNull();
        expect(openCards()).toEqual([]);
    });
});
