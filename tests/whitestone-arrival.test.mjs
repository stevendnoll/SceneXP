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
import { BRAND, GUIDE, HELP, PANEL, UI } from '../www/whitestone/js/copy.js';
import { roomName } from '../www/whitestone/js/taxonomy.js';

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
        // The panel ships closed, its back button in copy.js's words, and the
        // Rooms chip that opens it says what it opens.
        expect(HTML).not.toMatch(/id="ws-back"/);
        expect(HTML).toMatch(/<aside id="ws-panel"[^>]*\shidden>/);
        expect(text(/id="panel-back"[^>]*>([^<]+)</)).toBe(PANEL.back(PANEL.wholeHouse));
        expect(text(/id="hud-rooms"[^>]*>([^<]+)</)).toBe(PANEL.open);
        expect(text(/id="hud-rooms"[^>]*aria-label="([^"]+)"/)).toBe(PANEL.openLabel);
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
    for (const id of ['ws-host', 'ws-panel', 'ws-help-menu', 'help-checklist', 'help-prefs', 'help-home', 'hud-rooms']) dom.el(id).hidden = true;
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
const panelShown = () => !dom.el('ws-panel').hidden;
const rows = () => dom.el('panel-list').children.map((li) => li.children[0]);
const rowLabels = () => rows().map((b) => b.children[0].textContent);
const shown = () => !dom.el('ws-host').hidden;
const buttons = () => dom.el('host-actions').children.map((b) => b.textContent);
const press = (id) => {
    const b = dom.el('host-actions').children.find((x) => x.id === `host-${id}`);
    if (!b) throw new Error(`no ${id} in ${buttons().join(', ')}`);
    fire(b, 'click');
};
/** One of a few answers in the bubble (the kind of home). */
const picks = () => (dom.el('host-choices').children[0] || { children: [] }).children;
const pick = (id) => {
    const b = picks().find((x) => x.id === `host-${id}`);
    if (!b) throw new Error(`no ${id} in ${picks().map((x) => x.textContent).join(', ')}`);
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

describe('the kind of home (ONBOARDING Scene 2a)', () => {
    const floorKeys = () => dom.el('host-choices').children[0].children.slice(1).map((l) => l.children[0].value);

    test('Maya asks first, three answers in a group, on the strip\'s first step, with no other button', async () => {
        const main = await boot();
        press('start');
        expect(line()).toBe(GUIDE.home);
        expect(picks().map((b) => [b.id, b.textContent])).toEqual([
            ['host-kind-house', 'A house'], ['host-kind-townhome', 'A townhome'], ['host-kind-condo', 'A condo or apartment']
        ]);
        expect(dom.el('host-choices').children[0].getAttribute('aria-label')).toBe(GUIDE.homeLegend);
        expect(buttons()).toEqual([]);
        expect(dom.el('host-progress').getAttribute('aria-label')).toBe(GUIDE.progressStep(1, 5, 'Home type'));
        // The checklist is already there, a house until answered.
        expect(main.__test__.active().residence).toEqual({ kind: 'house', attached: null });
    });

    test('a townhome is asked once more, and its floors have no detached garage', async () => {
        const main = await boot();
        press('start');
        pick('kind-townhome');
        expect(main.__test__.active().residence).toEqual({ kind: 'townhome', attached: 'end' });
        expect(line()).toBe(GUIDE.attached);
        expect(picks().map((b) => b.textContent)).toEqual(['An end unit', 'Between two neighbors']);
        pick('attached-middle');
        expect(main.__test__.active().residence).toEqual({ kind: 'townhome', attached: 'middle' });
        expect(line()).toBe(GUIDE.floors);
        expect(floorKeys()).not.toContain('detached-garage');
        expect(floorKeys()).toContain('garage');
    });

    test('a condo is offered one floor or two, and nothing else', async () => {
        const main = await boot();
        press('start');
        pick('kind-condo');
        expect(main.__test__.active().residence).toEqual({ kind: 'condo', attached: null });
        expect(line()).toBe(GUIDE.floors);
        expect(floorKeys()).toEqual(['main', 'second']);
        tick('second', true);
        expect(main.__test__.active().levels).toEqual(['main', 'second']);
    });

    test('the house answers: neighbors beside a townhome, a building and a plaza round a condo (4c-2)', async () => {
        const main = await boot();
        press('start');
        expect(main.__test__.model().placed.massing).toEqual([]);
        pick('kind-townhome');
        expect(main.__test__.model().placed.massing.filter((p) => p.role === 'neighbor')).toHaveLength(1);
        pick('attached-middle');
        expect(main.__test__.model().placed.massing.filter((p) => p.role === 'neighbor')).toHaveLength(2);
        fire(dom.el('ws-undo'), 'click');
        fire(dom.el('ws-undo'), 'click');
        expect(main.__test__.model().placed.massing).toEqual([]);
        fire(dom.el('help-restart'), 'click');
        press('start');
        pick('kind-condo');
        expect(main.__test__.model().placed.lawn.map((p) => p.color)).toEqual(['paving']);
        expect(main.__test__.model().placed.massing.map((p) => p.role)).toContain('podium');
    });

    test('Back changes the answer: from the floors, or from a townhome\'s neighbors, the answer so far marked', async () => {
        const main = await boot();
        press('start');
        expect(picks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
        pick('kind-townhome');
        expect(buttons()).toEqual([GUIDE.back]);
        press('back');
        expect(line()).toBe(GUIDE.homeAgainAsked);
        expect(picks().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['A townhome']);
        expect(picks().find((b) => b.textContent === 'A townhome').classList.contains('is-on')).toBe(true);
        pick('kind-townhome');
        pick('attached-middle');
        press('back');
        pick('kind-townhome');
        // Its neighbors, once answered, are marked too.
        expect(picks().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['Between two neighbors']);
        press('back');
        pick('kind-condo');
        expect(main.__test__.active().residence).toEqual({ kind: 'condo', attached: null });
        expect(line()).toBe(GUIDE.floors);
        press('back');
        pick('kind-house');
        expect(main.__test__.active().residence.kind).toBe('house');
        expect(dom.el('host-choices').children[0].children.slice(1).map((l) => l.children[0].value)).toContain('basement');
    });

    test('Undo takes the answer back', async () => {
        const main = await boot();
        press('start');
        pick('kind-condo');
        fire(dom.el('ws-undo'), 'click');
        expect(main.__test__.active().residence.kind).toBe('house');
    });

    test('a return in the middle of the question is asked it again', async () => {
        await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine', guide: { scene: 'home', reviewed: false } }) });
        press('keepGoing');
        expect(line()).toBe(GUIDE.home);
        expect(picks()).toHaveLength(3);
    });

    test('Your home can change it later: the neighbors asked for a townhome, only a condo\'s floors offered', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
        main.__test__.editHome();
        expect(dom.el('setup-residence').children.map((o) => o.value)).toEqual(['house', 'townhome', 'condo']);
        expect(dom.el('setup-residence').value).toBe('house');
        expect(dom.el('setup-attached-row').hidden).toBe(true);
        const levelRows = () => dom.el('setup-levels-list').children.filter((r) => !r.hidden).map((r) => r.children[0].value);
        expect(levelRows()).toContain('detached-garage');
        dom.el('setup-residence').value = 'townhome';
        fire(dom.el('setup-residence'), 'change');
        expect(dom.el('setup-attached-row').hidden).toBe(false);
        expect(levelRows()).not.toContain('detached-garage');
        dom.el('setup-residence').value = 'condo';
        fire(dom.el('setup-residence'), 'change');
        expect(dom.el('setup-attached-row').hidden).toBe(true);
        expect(levelRows()).toEqual(['main', 'second']);
        main.__test__.submitSetup();
        expect(main.__test__.active().residence).toEqual({ kind: 'condo', attached: null });
        // One undo takes the whole card back.
        fire(dom.el('ws-undo'), 'click');
        expect(main.__test__.active().residence.kind).toBe('house');
    });

    test('a new home from the setup card keeps a condo a condo, a floor ticked before the change left behind', async () => {
        const main = await boot();
        main.__test__.startOwn();
        const box = (key) => dom.el('setup-levels-list').children.map((r) => r.children[0]).find((i) => i.value === key);
        box('basement').checked = true;
        dom.el('setup-residence').value = 'condo';
        fire(dom.el('setup-residence'), 'change');
        main.__test__.submitSetup();
        expect(main.__test__.active()).toMatchObject({ residence: { kind: 'condo', attached: null }, levels: ['main'] });
    });

    test('a return asked again, answering a kind its rooms do not fit, is told why and asked once more', async () => {
        const { emptyDoc, createChecklist, addRoom, setSettings } = await import('../www/whitestone/js/store.js');
        const at = new Date(STAMP);
        let doc = createChecklist(emptyDoc(CONFIG, at), { levels: ['basement', 'main'] }, CONFIG, at, { id: 'home-mine' }).doc;
        doc = addRoom(doc, 'home-mine', { level: 'basement', area: 'gym' }, CONFIG, at).doc;
        doc = setSettings(doc, { activeId: 'home-mine', guide: { scene: 'home', reviewed: false } }).doc;
        const main = await boot({ saved: doc });
        press('keepGoing');
        pick('kind-condo');
        expect(said()).toBe('Your basement still has rooms. Please move or remove them before changing the kind of home.');
        expect(line()).toBe(GUIDE.home);
        expect(main.__test__.active().residence.kind).toBe('house');
    });

    test('a kind whose floors still have rooms is refused, said on the card, and nothing changes', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        tick('basement', true);
        const { addRoom } = await import('../www/whitestone/js/store.js');
        const c = main.__test__.active();
        main.__test__.mutate((d) => addRoom(d, c.id, { level: 'basement', area: 'gym' }, CONFIG, new Date()), 'x');
        main.__test__.editHome();
        dom.el('setup-residence').value = 'condo';
        fire(dom.el('setup-residence'), 'change');
        main.__test__.submitSetup();
        expect(dom.el('setup-error').textContent).toBe('Your basement still has rooms. Please move or remove them before changing the kind of home.');
        expect(main.__test__.active().residence.kind).toBe('house');
        expect(main.__test__.active().levels).toContain('basement');
    });
});

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
        pick('kind-house');
        const c = own(main);
        expect(c).toMatchObject({ title: GUIDE.defaultTitle, levels: ['main'] });
        expect(main.getDoc().settings.activeId).toBe(c.id);
        expect(line()).toBe(GUIDE.floors);
        expect(floor('main').checked).toBe(true);
        expect(floor('second').checked).toBe(false);
        expect(dom.el('host-skip').hidden).toBe(false);
        expect(dom.el('host-progress').hidden).toBe(false);
        // The floors are the strip's second step, the home type done.
        expect(dom.el('host-progress').children.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null, null, null]);
        expect(dom.el('host-progress').children[0].classList.contains('is-done')).toBe(true);
        expect(buttons()).toEqual([GUIDE.next, GUIDE.back]);
        // Saved, with where the guide is.
        expect(saved().settings.guide).toEqual({ scene: 'floors', reviewed: false });
    });

    test('each floor ticked rises onto the house, and the last cannot go', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
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
        pick('kind-house');
        main.__test__.host().titleField.value = '  Maple Street  ';
        press('next');
        expect(own(main).title).toBe('Maple Street');
        expect(line()).toBe(GUIDE.firstRoom);
        fire(dom.el('help-restart'), 'click');
        press('start');
        pick('kind-house');
        main.__test__.host().titleField.value = '   ';
        press('next');
        expect(own(main).title).toBe('Maple Street');
    });

    test('the kitchen in one tap: its preset, its floor opened, and its line from the price sheet', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
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
        expect(dom.el('host-progress').children[2].getAttribute('aria-current')).toBe('step');
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
        pick('kind-house');
        press('next');
        press('kitchen');
        expect(own(main).rooms).toHaveLength(0);
        expect(said()).toBe(UI.sheetLoading);
        expect(line()).toBe(GUIDE.firstRoom);
    });

    test('a tapped dot shows its task in the panel, Maya stepping aside until it closes', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        press('kitchen');
        press('next');
        const dot = own(main).items[0];
        main.__test__.tapModel(null, dot.id);
        expect(openCards()).toEqual([]);
        expect(panelShown()).toBe(true);
        expect(dom.el('panel-title').textContent).toBe('Stovetop');
        stepFrames(2);
        expect(shown()).toBe(false);
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        // Back out of the task, the room, the floor: the panel goes, and Maya
        // is back with the step she is on.
        for (let i = 0; i < 3; i++) fire(dom.el('panel-back'), 'click');
        expect(panelShown()).toBe(false);
        stepFrames(2);
        expect(shown()).toBe(true);
        expect(line()).toBe(GUIDE.rooms);
    });

    test('another room through the room card, then Review, preferences offered, and saved', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
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
        pick('kind-house');
        fire(dom.el('host-skip'), 'click');
        expect(shown()).toBe(false);
        expect(saved().settings.guide).toEqual({ scene: 'done', reviewed: false });
        expect(main.__test__.tapModel('main')).toBe(true);
        expect(main.__test__.model().lifted).toBe('main');
    });
});

describe('Maya on the stage', () => {
    test('she waves hello, points as each step begins, and sways only while she says her line', async () => {
        const main = await boot();
        const maya = main.__test__.cast();
        expect(maya.gesturing).toBe('wave');
        expect(maya.talking).toBeGreaterThan(2);
        press('start');
        pick('kind-house');
        expect(maya.gesturing).toBe('point');
        // The same scene again (a floor ticked) does not gesture again.
        stepFrames(Math.ceil(2500 / 16));
        expect(maya.gesturing).toBeNull();
        tick('second', true);
        expect(maya.gesturing).toBeNull();
        // Put away, she stops talking.
        fire(dom.el('host-skip'), 'click');
        expect(maya.talking).toBe(0);
    });

    test('her bubble goes beside her head where there is room for it, and back to its own place where there is not', async () => {
        const main = await boot();
        const host = main.__test__.host();
        const bubble = dom.el('ws-host');
        // The stub lays nothing out: the bubble counts as 340 by 260.
        expect(host.anchor(500, 300, 1280, 800)).toBe(true);
        expect(bubble.classList.contains('is-anchored')).toBe(true);
        expect([bubble.style.left, bubble.style.top]).toEqual(['518px', '272px']);
        // Kept below Help and Undo, and above the bottom edge.
        host.anchor(500, 10, 1280, 800);
        expect(bubble.style.top).toBe('76px');
        host.anchor(500, 790, 1280, 800);
        expect(bubble.style.top).toBe(`${800 - 260 - 16}px`);
        // No room to her right: back to its own place.
        expect(host.anchor(1000, 300, 1280, 800)).toBe(false);
        expect(bubble.classList.contains('is-anchored')).toBe(false);
        expect(bubble.style.left).toBe('');
        expect(host.anchor(500, 300, 1280, 800)).toBe(true);
        expect(host.anchor(null)).toBe(false);
        expect(bubble.style.left).toBe('');
        expect(host.anchor(NaN, 300, 1280, 800)).toBe(false);
    });

    test('under reduced motion she does not gesture', async () => {
        dom.windowStub.matchMedia = (media) => ({ matches: /reduce/.test(media), addEventListener() {}, removeEventListener() {} });
        const main = await boot();
        expect(main.__test__.cast().gesturing).toBeNull();
    });

    test('a tap on her: she says it again, and after the guide a hint about the house', async () => {
        const main = await boot();
        main.__test__.tapHost();
        expect(line()).toBe(GUIDE.helloAgain);
        expect(main.__test__.cast().gesturing).toBe('point');
        press('start');
        pick('kind-house');
        fire(dom.el('host-skip'), 'click');
        main.__test__.tapHost();
        expect(line()).toBe(GUIDE.hint);
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
        expect(line()).toBe(GUIDE.home);
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

    test('removed from My checklists, the example comes back when asked for again, and after a reload too', async () => {
        // QA, 2026-10-14: the removed example kept its fixed id for its
        // undo, and a second one could not be built beside it.
        const main = await boot();
        press('example');
        main.__test__.remove('example-home-1');
        fire(dom.el('confirm-actions').children[1], 'click');
        expect(main.__test__.active()).toBeNull();
        fire(dom.el('help-restart'), 'click');
        press('example');
        expect(main.__test__.active()).toMatchObject({ id: 'example-home-1', sample: true, deletedAt: null });
        expect(main.__test__.state.doc.checklists.filter((c) => c.id === 'example-home-1')).toHaveLength(1);
        expect(line()).toBe(GUIDE.example1);
        expect(main.__test__.model().levels()).toEqual(['basement', 'main', 'second']);
        // The removal was saved with the example in it, so a reload meets it too.
        const saved = JSON.parse(localStorage.getItem(CONFIG.storage.key));
        expect(saved.checklists.find((c) => c.id === 'example-home-1').deletedAt).not.toBeNull();
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
        pick('kind-house');
        fire(dom.el('host-skip'), 'click');
        fire(dom.el('help-again'), 'click');
        expect(line()).toBe(GUIDE.hint);
        press('close');
        expect(shown()).toBe(false);
    });

    test('About sits over the scene and goes back to it', async () => {
        await boot();
        press('start');
        pick('kind-house');
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
        pick('kind-house');
        for (const id of ['help-checklist', 'help-prefs', 'help-home']) expect(dom.el(id).hidden).toBe(false);
        fire(dom.el('help-home'), 'click');
        expect(openCards()).toEqual(['setup']);
        expect(dom.el('ws-help-menu').hidden).toBe(true);
        expect(main.__test__.active()).toBeTruthy();
    });

    test('Undo takes back a floor', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
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

    test('a tap on a floor opens it, turned to face you, and the panel lists its rooms; a tap on a room inside lists its tasks', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('second');
        expect(main.__test__.model().lifted).toBe('second');
        expect(said()).toBe('Opened the second floor of the house.');
        expect(Math.abs(main.__test__.turntable().yaw % (Math.PI * 2))).toBeLessThan(1e-9);
        expect(dom.el('panel-title').textContent).toBe('Second floor');
        expect(rowLabels()).toEqual(expect.arrayContaining(["Emma's room", 'Primary bedroom']));
        const room = main.getDoc().checklists[0].rooms.find((r) => r.level === 'second');
        main.__test__.tapModel('second', null, room.id);
        expect(dom.el('panel-title').textContent).toBe(roomName('cleaning', room));
        expect(main.__test__.model().selection.roomId).toBe(room.id);
        // A room on a closed floor cannot be met; a tap on another floor opens that floor.
        main.__test__.tapModel('main', null, room.id);
        expect(main.__test__.model().lifted).toBe('main');
        expect(main.__test__.ui.selected.scope).toBe('floor');
        expect(openCards()).toEqual([]);
    });

    test('the plain house tapped while Maya greets is Let\'s start, and after the guide opens the setup card', async () => {
        const main = await boot();
        main.__test__.tapModel();
        expect(openCards()).toEqual([]);
        expect(main.__test__.active().title).toBe(GUIDE.defaultTitle);
        expect(line()).toBe(GUIDE.home);
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
    test("the panel's back button steps back one at a time, and closes the house at the last", async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        expect(panelShown()).toBe(false);
        const c = main.getDoc().checklists[0];
        const item = c.items.find((i) => c.rooms.find((r) => r.id === i.roomId).level === 'second');
        main.__test__.tapModel(null, item.id);
        expect(main.__test__.ui.selected.scope).toBe('task');
        fire(dom.el('panel-back'), 'click');
        expect(main.__test__.ui.selected.scope).toBe('room');
        expect(dom.el('panel-back').textContent).toBe(PANEL.back('the second floor'));
        fire(dom.el('panel-back'), 'click');
        expect(main.__test__.ui.selected.scope).toBe('floor');
        expect(dom.el('panel-back').textContent).toBe(PANEL.back(PANEL.wholeHouse));
        fire(dom.el('panel-back'), 'click');
        expect(panelShown()).toBe(false);
        expect(main.__test__.model().lifted).toBeNull();
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
