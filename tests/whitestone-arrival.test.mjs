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
import { framePose } from '../www/whitestone/js/turntable.js';
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

    test("Maya's bubble ships hidden, with her name in copy.js's words, and no Skip (QA, 2026-10-15)", () => {
        expect(HTML).toMatch(/<section id="ws-host"[^>]*\shidden>/);
        expect(text(/id="host-name"[^>]*>([^<]+)</)).toBe(GUIDE.name);
        expect(text(/class="host-role">([^<]+)</)).toBe(GUIDE.role);
        expect(text(/class="host-portrait"[^>]*>([^<]+)</)).toBe(GUIDE.portrait);
        expect(HTML).not.toMatch(/host-skip|Skip the guide/);
        expect(GUIDE.skip).toBeUndefined();
    });

    test('no Help and no About: a → by her name, Start over at her foot, in copy.js\'s words, and no floating Undo', () => {
        // Undo is the toast's and the keyboard's (Steve, 2026-10-14).
        expect(HTML).not.toMatch(/id="ws-undo"/);
        expect(HTML).toMatch(/<button id="toast-undo"[^>]*>Undo</);
        // The Help button and its menu are gone (QA, 2026-10-15).
        expect(HTML).not.toMatch(/id="ws-help|id="ws-tools|class="help-item/);
        // About is gone too (QA, 2026-10-15); a → takes her main step.
        expect(HTML).not.toMatch(/host-about|About Whitestone/);
        expect(HTML).toMatch(/<div class="host-head">[\s\S]*?<button id="host-next" class="host-next" type="button" aria-label="Continue" title="Continue" hidden><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><\/button>\s*<\/div>/);
        // Maya's Back and Start over ship hidden along her foot, in copy.js's words.
        expect(text(/id="host-back"[^>]*>([^<]+)</)).toBe(GUIDE.back);
        expect(HTML).toMatch(/<button id="host-back"[^>]*\shidden>/);
        expect(text(/id="host-reset"[^>]*>([^<]+)</)).toBe(GUIDE.startOver);
        // Hover titles (QA, 2026-10-15): Start over says what it does, and
        // the calendar's arrows say which month.
        expect(text(/id="host-reset"[^>]*title="([^"]+)"/)).toBe(HELP.resetHover);
        for (const id of ['booking-prev', 'booking-next']) {
            expect(text(new RegExp(`id="${id}"[^>]*title="([^"]+)"`))).toBe(text(new RegExp(`id="${id}"[^>]*aria-label="([^"]+)"`)));
        }
        expect(HTML).toMatch(/<button id="host-reset"[^>]*\shidden>/);
        // The panel ships closed, its back button in copy.js's words. No
        // chips top left (Steve, 2026-10-14: lost against the studio): the
        // quote and the visit are in Maya's bubble.
        expect(HTML).not.toMatch(/id="ws-back"/);
        expect(HTML).toMatch(/<aside id="ws-panel"[^>]*\shidden>/);
        expect(text(/id="panel-back"[^>]*>([^<]+)</)).toBe(PANEL.back(PANEL.wholeHouse));
        expect(HTML).not.toMatch(/id="ws-hud"|id="hud-/);
        // In their place, the wordmark (concept C): an image named for the
        // company, sized so the page does not jump as it loads, drawn as
        // plain paths with the house's header and nothing that runs or
        // reaches out.
        const logo = readFileSync(join(WS, 'assets', 'logo-whitestone.svg'), 'utf8');
        expect(logo.startsWith('<!-- © 2026 Continuum Commerce LLC. All rights reserved.')).toBe(true);
        const [, w, h] = logo.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" role="img" aria-label="Whitestone Home Care" viewBox="0 0 (\d+) (\d+)"/);
        expect(logo).not.toMatch(/<script|<text|<image|href=|url\(|font-family/i);
        // Sized as the drawing is, so the page does not jump, and versioned,
        // so a cached copy gives way when the drawing changes (QA,
        // 2026-10-15: heavier strokes tried and taken back, v=3).
        const img = `src="assets/logo-whitestone.svg?v=3" alt="Whitestone Home Care" width="${w}" height="${h}">`;
        expect(HTML).toContain(`<div id="ws-brand" class="ui-float ws-brand">\n        <img ${img}`);
        // The chosen weight: strokes 8.5% of the 100 high capitals.
        expect(logo).toMatch(/stroke-width="8\.50"/);
        expect(logo).not.toMatch(/stroke-width="13\.00"/);
        // The loading screen shows the same wordmark in place of a typed
        // title, and the icon follows it: the gable over a W.
        expect(HTML).toMatch(new RegExp(`<div class="loader-content">\\s*<img class="loader-logo" ${img.replace(/[.?]/g, '\\$&')}`));
        expect(HTML).not.toMatch(/class="loader-title"/);
        const icon = readFileSync(join(WS, 'favicon.svg'), 'utf8');
        expect(icon).toMatch(/THE GABLE\s+over a W|the gable\s+over a W/);
        expect(icon).not.toMatch(/<script|<text|<image|href=|url\(|font-family/i);
        expect(HTML).toMatch(/href="favicon\.svg\?v=2"/);
        expect(HTML).toMatch(/<div id="host-facts"[^>]*\shidden>/);
    });
});

// ---- Driven through the page -------------------------------------------------------------

let dom;
/** A fact at a glance in Maya's bubble (quote, visit): its button, or
 *  undefined; and its value and note, as shown. */
const fact = (key) => dom.el('host-facts').children.find((b) => b.id === `host-fact-${key}`);
const factValue = (key) => (fact(key) ? fact(key).children[1].textContent : undefined);
const factNote = (key) => (fact(key) && fact(key).children[2] ? fact(key).children[2].textContent : '');
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
    for (const id of ['ws-host', 'ws-panel']) dom.el(id).hidden = true;
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
/** A room chip in Maya's bubble, by its kind of room. */
const roomChip = (area) => {
    const group = dom.el('host-choices').children[0];
    return group ? group.children.find((x) => x.id === `host-chip-${area}`) : undefined;
};
const press = (id) => {
    // A button, or (the kitchen, a bedroom) one of her room chips.
    const b = dom.el('host-actions').children.find((x) => x.id === `host-${id}`) || roomChip(id);
    if (!b) throw new Error(`no ${id} in ${buttons().join(', ')}`);
    fire(b, 'click');
};
/** One of a few answers in the bubble (the kind of home). */
const picks = () => (dom.el('host-choices').children[0] || { children: [] }).children;
/** Whether Maya's button or answer of this id is pulsing (host.nudge). */
const nudged = (id) => {
    const b = [...dom.el('host-actions').children, ...picks()].find((x) => x.id === `host-${id}`);
    if (!b) throw new Error(`no ${id} in ${buttons().join(', ')}`);
    return b.classList.contains('is-nudge');
};
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
const openCards = () => ['setup', 'preferences', 'quote', 'checklist', 'room', 'task', 'confirm']
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
    // The floors' chips (the legend first, and the main floor's note last).
    const floorKeys = () => dom.el('host-choices').children[0].children.filter((l) => l.className === 'host-chip').map((l) => l.children[0].value);

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

    test('the main floor is ticked for good, says why, and stays when unticked any way (QA, 2026-10-15)', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
        const chips = dom.el('host-choices').children[0].children;
        const mainBox = chips.find((l) => l.className === 'host-chip' && l.children[0].value === 'main').children[0];
        expect(mainBox.checked).toBe(true);
        expect(mainBox.disabled).toBe(true);
        expect(mainBox.getAttribute('aria-describedby')).toBe('host-floors-note');
        expect(chips[chips.length - 1].textContent).toBe(GUIDE.mainAlways);
        // Steve's path: another floor ticked, then the main one unticked.
        tick('second', true);
        main.__test__.onFloor('main', false);
        expect(main.__test__.active().levels).toEqual(['main', 'second']);
        // The other floors come and go as ever.
        tick('second', false);
        expect(main.__test__.active().levels).toEqual(['main']);
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
        ctrlZ();
        ctrlZ();
        expect(main.__test__.model().placed.massing).toEqual([]);
        main.__test__.guideTo({ type: 'restart' });
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
        expect(buttons()).toEqual([]);
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.homeAgainAsked);
        expect(picks().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['A townhome']);
        expect(picks().find((b) => b.textContent === 'A townhome').classList.contains('is-on')).toBe(true);
        pick('kind-townhome');
        pick('attached-middle');
        fire(dom.el('host-back'), 'click');
        pick('kind-townhome');
        // Its neighbors, once answered, are marked too.
        expect(picks().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['Between two neighbors']);
        fire(dom.el('host-back'), 'click');
        pick('kind-condo');
        expect(main.__test__.active().residence).toEqual({ kind: 'condo', attached: null });
        expect(line()).toBe(GUIDE.floors);
        fire(dom.el('host-back'), 'click');
        pick('kind-house');
        expect(main.__test__.active().residence.kind).toBe('house');
        expect(floorKeys()).toContain('basement');
    });

    test('Undo takes the answer back', async () => {
        const main = await boot();
        press('start');
        pick('kind-condo');
        ctrlZ();
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
        ctrlZ();
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
    test('Maya starts within a second of "Ready", the loading screen lifting included (QA, 2026-10-15: the rest must be snappy)', () => {
        expect(CONFIG.loadingReveal / 1000 + CONFIG.guide.delay).toBeLessThanOrEqual(1);
    });

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
        expect(buttons()).toEqual([GUIDE.next]);
        expect(dom.el('host-back').hidden).toBe(false);
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
        main.__test__.guideTo({ type: 'restart' });
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
        expect(buttons()).toEqual([GUIDE.otherRoom]);
        // The rooms most homes have, as chips, the kitchen first and ringed.
        expect(dom.el('host-choices').children[0].children.slice(1).map((b) => b.textContent)).toEqual(
            ['+ Kitchen', '+ Living room', '+ Primary bedroom', '+ Primary bathroom', '+ Bedroom', '+ Bathroom']);
        expect(roomChip('kitchen').classList.contains('has-halo')).toBe(true);
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
        // Review from the first room on (QA, 2026-10-15).
        expect(buttons()).toEqual([GUIDE.reviewIt, GUIDE.otherRoom]);
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
        // Still on First room (QA, 2026-10-15), and the panel's one Back says
        // where it goes.
        expect(main.__test__.ui.guide.scene).toBe('dots');
        expect(dom.el('panel-back').textContent).toBe(PANEL.back('First room'));
        fire(dom.el('panel-back'), 'click');
        expect(panelShown()).toBe(false);
        // The floor stays open with its dots, nothing selected.
        expect(main.__test__.model().lifted).toBe('main');
        expect(main.__test__.ui.selected).toBeNull();
        stepFrames(2);
        expect(shown()).toBe(true);
        expect(line()).toBe(GUIDE.dotsSeen);
        expect(document.activeElement.id).toBe('host-gotIt');
        // Escape from another dot comes back the same way, in one press.
        main.__test__.tapModel(null, own(main).items[1].id);
        expect(panelShown()).toBe(true);
        fire(dom.documentStub, 'keydown', { key: 'Escape', target: dom.documentStub.body, preventDefault() {} });
        expect(panelShown()).toBe(false);
        expect(main.__test__.model().lifted).toBe('main');
        // Got it, the main button, moves on to Your rooms.
        press('gotIt');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        expect(line()).toBe(GUIDE.rooms);
        // There, the panel's Back is its own again.
        main.__test__.tapModel(null, own(main).items[0].id);
        expect(dom.el('panel-back').textContent).toBe(PANEL.back('the kitchen'));
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
        press('otherRoom');
        expect(openCards()).toEqual(['room']);
        dom.el('room-level').value = 'second';
        dom.el('room-area').value = 'bedroom';
        dom.el('room-preset').checked = true;
        fire(dom.el('room-form'), 'submit');
        // Shown on the house, not in the checklist, while Maya is guiding.
        expect(openCards()).toEqual([]);
        expect(own(main).rooms).toHaveLength(2);
        expect(buttons()).toEqual([GUIDE.reviewIt, GUIDE.otherRoom]);
        press('review');
        expect(main.__test__.model().lifted).toBeNull();
        expect(line()).toBe(GUIDE.review);
        press('preferences');
        expect(openCards()).toEqual(['preferences']);
        fire(dom.el('prefs-skip'), 'click');
        press('save');
        expect(line()).toBe(GUIDE.saved);
        expect(saved().settings.guide).toEqual({ scene: 'done', reviewed: true });
        // A time, or back to the rooms: no look around (QA, 2026-10-15).
        expect(buttons()).toEqual([GUIDE.chooseTime, GUIDE.editRooms]);
        press('editRooms');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        expect(line()).toBe(GUIDE.rooms);
    });

    test('no Skip: the build is the way, Back and the strip to move about in it (QA, 2026-10-15: "the guide is the UX")', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        expect(line()).toBe(GUIDE.floors);
        expect(dom.el('host-back').hidden).toBe(false);
        // A skip asked for some other way changes nothing.
        main.__test__.onHostButton('skip');
        expect(main.__test__.ui.guide.scene).toBe('floors');
        expect(line()).toBe(GUIDE.floors);
        // No room yet: a tap on the house opens nothing over her, and Next
        // pulses instead.
        expect(main.__test__.tapModel('main')).toBe(false);
        expect(main.__test__.model().lifted).toBeNull();
        expect(nudged('next')).toBe(true);
        jest.advanceTimersByTime(1700);
        expect(nudged('next')).toBe(false);
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
        // Tucked away while a card is open, she stops talking.
        expect(maya.talking).toBeGreaterThan(0);
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'saved' };
        main.__test__.guideTo({ type: 'away', to: 'booking', was: null });
        expect(main.__test__.ui.guide.minimized).toBe(true);
        expect(maya.talking).toBe(0);
    });

    test('the example builds itself, floor by floor, and whole at once under reduced motion', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = false;
        press('example');
        expect(main.__test__.model().assembling).toBe(true);
        stepFrames(Math.ceil(4000 / 16));
        expect(main.__test__.model().assembling).toBe(false);
        main.__test__.guideTo({ type: 'restart' });
        main.__test__.state.reducedMotion = true;
        press('example');
        expect(main.__test__.model().assembling).toBe(false);
    });

    test('the first checklist saved: the house turns once while Maya waves, and not under reduced motion', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = false;
        press('start');
        pick('kind-house');
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'review', reached: 4 };
        const tt = main.__test__.turntable();
        const yaw = tt.yaw;
        main.__test__.onHostButton('save');
        expect(line()).toBe(GUIDE.saved);
        expect(main.__test__.cast().gesturing).toBe('wave');
        stepFrames(Math.ceil((CONFIG.view.turn.celebrate + 0.5) * 1000 / 16));
        expect(tt.yaw - yaw).toBeCloseTo(Math.PI * 2, 3);
        // Under reduced motion, the words alone.
        main.__test__.state.reducedMotion = true;
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'review' };
        const still = tt.yaw;
        main.__test__.onHostButton('save');
        stepFrames(Math.ceil(3000 / 16));
        expect(tt.yaw).toBe(still);
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
        // Standing by after the guide (no Skip to get there quickly).
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'done', minimized: false };
        main.__test__.showGuide();
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
        expect(buttons()).toEqual([GUIDE.buildOwn]);
        press('buildOwn');
        expect(main.__test__.model().lifted).toBeNull();
        expect(main.__test__.active().sample).toBe(false);
        expect(main.__test__.active().title).toBe(GUIDE.defaultTitle);
        expect(line()).toBe(GUIDE.home);
    });

    test('an example removed in an earlier version comes back when asked for again, and after a reload too', async () => {
        // QA, 2026-10-14: the removed example kept its fixed id for its
        // undo, and a second one could not be built beside it. (My
        // checklists, which removed it, is gone; a browser may still hold
        // one it removed.)
        const main = await boot();
        press('example');
        const { deleteChecklist } = await import('../www/whitestone/js/store.min.js');
        main.__test__.change((d) => deleteChecklist(d, 'example-home-1', CONFIG, new Date()), 'Removed a checklist', null);
        expect(main.__test__.active()).toBeNull();
        main.__test__.guideTo({ type: 'restart' });
        press('example');
        expect(main.__test__.active()).toMatchObject({ id: 'example-home-1', sample: true, deletedAt: null });
        expect(main.__test__.state.doc.checklists.filter((c) => c.id === 'example-home-1')).toHaveLength(1);
        expect(line()).toBe(GUIDE.example1);
        expect(main.__test__.model().levels()).toEqual(['basement', 'main', 'second']);
        // The removal was saved with the example in it, so a reload meets it too.
        const saved = JSON.parse(localStorage.getItem(CONFIG.storage.key));
        expect(saved.checklists.find((c) => c.id === 'example-home-1').deletedAt).not.toBeNull();
    });

    test('restarting the guide puts the example back and shows the plain house again', async () => {
        const main = await boot();
        press('example');
        main.__test__.guideTo({ type: 'restart' });
        expect(main.__test__.active()).toBeNull();
        expect(line()).toBe(GUIDE.hello);
    });
});

describe('a return', () => {
    test('mid-build: welcomed back to their own home, and Keep going goes back to the step', async () => {
        const main = await boot({ saved: await savedDoc([['home-mine', STAMP]], { activeId: 'home-mine', guide: { scene: 'rooms', reviewed: false } }) });
        expect(main.__test__.active().id).toBe('home-mine');
        expect(line()).toBe(GUIDE.welcomeResume);
        // Keep going, or Start over beside it (QA, 2026-10-15), and so not
        // again at her foot.
        expect(buttons()).toEqual([GUIDE.keepGoing, GUIDE.startOver]);
        expect(dom.el('host-reset').hidden).toBe(true);
        press('startOver');
        expect(openCards()).toEqual(['confirm']);
        expect(dom.el('confirm-title').textContent).toBe(HELP.resetTitle);
        fire(dom.el('confirm-actions').children[0], 'click');
        press('keepGoing');
        expect(line()).toBe(GUIDE.rooms);
    });

    test('after the first build: welcomed to a home base, its ways on and nothing else (QA, 2026-10-15: no look around)', async () => {
        await boot({ saved: await savedDoc([['home-mine', STAMP]], { guide: { scene: 'done', reviewed: true } }) });
        expect(line()).toBe(`${GUIDE.welcomeBack} ${GUIDE.homeEmpty('Home home-mine')} ${GUIDE.returningLegend}`);
        expect(dom.el('host-progress').hidden).toBe(true);
        expect(picks().map((b) => b.id)).toEqual(['host-editRooms']);
        expect(dom.el('ws-host').classList.contains('is-minimized')).toBe(false);
    });

    test('a home with rooms: its rooms, tasks and price so far, and a time to choose first', async () => {
        const { emptyDoc, createChecklist, addRoom, setSettings } = await import('../www/whitestone/js/store.js');
        const { presetFor } = await import('../www/whitestone/js/sheet.js');
        const sheet = JSON.parse(readFileSync(join(process.cwd(), 'www', 'whitestone', 'data', 'prices', 'cleaning-2026-10.json'), 'utf8'));
        const at = new Date(STAMP);
        let doc = createChecklist(emptyDoc(CONFIG, at), { title: 'Maple Street', levels: ['main'] }, CONFIG, at, { id: 'home-mine' }).doc;
        doc = addRoom(doc, 'home-mine', { level: 'main', area: 'kitchen' }, CONFIG, at, { presetItems: presetFor(sheet, 'kitchen') }).doc;
        doc = setSettings(doc, { activeId: 'home-mine', guide: { scene: 'done', reviewed: true } }).doc;
        const main = await boot({ saved: doc, sheet: true });
        main.__test__.showGuide();
        expect(line()).toMatch(/^Welcome back\. Maple Street has 1 room and 9 tasks, \$\d+ so far\. What would you like to do\?$/);
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.chooseTime, GUIDE.editRooms, GUIDE.reviewChecklist]);
        // Add or change rooms: back to the build's Your rooms, Maya at the step.
        pick('editRooms');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        expect(line()).toBe(GUIDE.rooms);
    });

    test('by the edit link: its keys off the address bar at once, that checklist open, and Maya saying how', async () => {
        const { emptyDoc, createChecklist, setPublication, setSettings, findChecklist, contentPrint } = await import('../www/whitestone/js/store.js');
        const at = new Date(STAMP);
        const pub = { id: 'A'.repeat(22), key: 'k'.repeat(43), ownerToken: 'o'.repeat(43), pin: '012345', at: STAMP, version: 1, expiresAt: STAMP };
        let doc = createChecklist(emptyDoc(CONFIG, at), { levels: ['main'] }, CONFIG, at, { id: 'home-other' }).doc;
        doc = createChecklist(doc, { levels: ['main'] }, CONFIG, at, { id: 'home-linked' }).doc;
        doc = setPublication(doc, 'home-linked', { published: { ...pub, sent: contentPrint(findChecklist(doc, 'home-linked')) } }, CONFIG, at).doc;
        doc = setSettings(doc, { activeId: 'home-other', guide: { scene: 'done', reviewed: true } }).doc;
        const replaced = [];
        dom.windowStub.history.replaceState = (_s, _t, url) => replaced.push(url);
        Object.assign(dom.windowStub.location, {
            href: `http://localhost:8000/whitestone/?edit=${pub.id}#k=${pub.key}&o=${pub.ownerToken}`,
            pathname: '/whitestone/', search: `?edit=${pub.id}`, hash: `#k=${pub.key}&o=${pub.ownerToken}`
        });
        const main = await boot({ saved: doc });
        expect(replaced).toEqual(['/whitestone/']);
        expect(main.__test__.active().id).toBe('home-linked');
        // Published with no visit booked (one canceled, say): that is said.
        expect(line()).toBe(`${GUIDE.welcomeEditLink} ${GUIDE.homePublished('Our home')} ${GUIDE.returningLegend}`);
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.chooseTime, GUIDE.seeLink, GUIDE.changeChecklist, GUIDE.illLook]);
    });

    /** A home booked for Friday at 9, its fingerprint as sent unless
     *  `changed` (an edit since). */
    async function bookedHome(changed = false) {
        const { emptyDoc, createChecklist, updateChecklist, setPublication, setSettings, findChecklist, contentPrint } = await import('../www/whitestone/js/store.js');
        const at = new Date(STAMP);
        let doc = createChecklist(emptyDoc(CONFIG, at), { levels: ['main'] }, CONFIG, at, { id: 'home-mine' }).doc;
        doc = setPublication(doc, 'home-mine', {
            published: { id: 'A'.repeat(22), key: 'k'.repeat(43), ownerToken: 'o'.repeat(43), pin: '012345', at: STAMP, version: 1, expiresAt: STAMP, sent: contentPrint(findChecklist(doc, 'home-mine')) },
            booking: { date: '2026-10-16', time: '09:00', minutes: 120, start: '2026-10-16T09:00:00-07:00', end: '2026-10-16T11:00:00-07:00' }
        }, CONFIG, at).doc;
        if (changed) doc = updateChecklist(doc, 'home-mine', { title: 'Maple Street' }, CONFIG, at).doc;
        return setSettings(doc, { activeId: 'home-mine', guide: { scene: 'done', reviewed: true } }).doc;
    }

    test('a booked visit: its day and time, and See my visit first', async () => {
        await boot({ saved: await bookedHome() });
        expect(line()).toBe(`${GUIDE.welcomeBack} ${GUIDE.homeBooked('Friday, October 16', '9:00 am')} ${GUIDE.returningLegend}`);
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.seeVisit, GUIDE.changeChecklist, GUIDE.illLook]);
    });

    test('a booked visit changed since it was sent: said, and Send my changes first', async () => {
        const main = await boot({ saved: await bookedHome(true) });
        expect(line()).toBe(`${GUIDE.welcomeBack} ${GUIDE.homeBooked('Friday, October 16', '9:00 am')} ${GUIDE.homeUnsent} ${GUIDE.returningLegend}`);
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.sendChanges, GUIDE.seeVisit, GUIDE.changeChecklist, GUIDE.illLook]);
        // At a glance in her bubble: when, and that changes wait.
        expect(factValue('visit')).toBe('Friday, October 16, 9:00 am');
        expect(factNote('visit')).toBe(UI.visitChipUnsent);
        expect(main.__test__.active().title).toBe('Maple Street');
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

describe('Maya standing by (QA, 2026-10-14: she should always have something to say)', () => {
    test('tucked away, Need a hand? or a tap on her brings her back with where the home stands', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
        // Tucked only while she has sent the visitor to a card (no look
        // around, QA 2026-10-15).
        const away = () => main.__test__.guideTo({ type: 'away', to: 'booking', was: null });
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'saved' };
        // What was said before is let land first; tucked, nothing more is
        // said aloud.
        await jest.advanceTimersByTimeAsync(500);
        dom.el('ws-live').textContent = 'quiet';
        away();
        expect(dom.el('ws-host').classList.contains('is-minimized')).toBe(true);
        await jest.advanceTimersByTimeAsync((CONFIG.guide.again + 1) * 1000);
        expect(dom.el('ws-live').textContent).toBe('quiet');
        fire(dom.el('host-expand'), 'click');
        expect(dom.el('ws-host').classList.contains('is-minimized')).toBe(false);
        expect(line()).toBe(`${GUIDE.homeEmpty('Our home')} ${GUIDE.returningLegend}`);
        away();
        main.__test__.tapHost();
        expect(main.__test__.ui.guide).toMatchObject({ scene: 'done', minimized: false });
        expect(line()).toBe(`${GUIDE.homeEmpty('Our home')} ${GUIDE.returningLegend}`);
        // Not tucked, a tap on her gives her hint about the house, as before.
        main.__test__.tapHost();
        expect(main.__test__.ui.guide.scene).toBe('hint');
    });

    test('on the example, Build my own; with no home at all, Let\'s start', async () => {
        const main = await boot();
        press('example');
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'done', minimized: false, skipped: false };
        main.__test__.showGuide();
        expect(line()).toBe(GUIDE.example3);
        expect(picks().map((b) => b.id)).toEqual(['host-buildOwn']);
        pick('buildOwn');
        expect(line()).toBe(GUIDE.home);
        main.__test__.startOver();
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'done', minimized: false, skipped: false };
        main.__test__.showGuide();
        expect(line()).toBe(`${GUIDE.noHome} ${GUIDE.returningLegend}`);
        expect(picks().map((b) => b.id)).toEqual(['host-start']);
        pick('start');
        expect(line()).toBe(GUIDE.home);
    });
});

describe('halos on the touch points (QA, 2026-10-14)', () => {
    const ring = () => dom.el('ws-halo');

    test('the first dot of the room just added, ringed until a task is opened; Got it moves on to a floor\'s ring', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        press('kitchen');
        press('next');
        expect(main.__test__.ui.guide.scene).toBe('dots');
        stepFrames(2);
        expect(ring().hidden).toBe(false);
        expect(ring().className).toBe('ws-halo is-dot');
        expect(ring().style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\) translate\(-50%, -50%\)$/);
        // A card over the scene hides it.
        main.__test__.openChecklistView();
        stepFrames(2);
        expect(ring().hidden).toBe(true);
        fire(dom.el('checklist-close'), 'click');
        stepFrames(2);
        expect(ring().hidden).toBe(false);
        // A task opened is the dot used; its floor closed, the dot is gone.
        const c = main.__test__.active();
        const room = c.rooms[0];
        const first = c.items.filter((i) => i.roomId === room.id).sort((a, b) => a.order - b.order)[0];
        main.__test__.selectTo({ scope: 'task', level: room.level, roomId: room.id, itemId: first.id });
        stepFrames(2);
        expect(ring().hidden).toBe(true);
        main.__test__.selectTo({ scope: 'room', level: room.level, roomId: room.id, itemId: null });
        stepFrames(2);
        expect(ring().hidden).toBe(false);
        main.__test__.liftLevel(null);
        stepFrames(2);
        expect(ring().hidden).toBe(true);
        main.__test__.liftLevel(room.level);
        press('gotIt');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        // The rooms step rings a floor while the house is closed; opening one is using it.
        main.__test__.liftLevel(null);
        main.__test__.selectTo(null);
        stepFrames(2);
        expect(ring().className).toBe('ws-halo is-floor');
        expect(ring().hidden).toBe(false);
        main.__test__.tapModel('main');
        stepFrames(2);
        expect(ring().hidden).toBe(true);
    });

    test('Your rooms with the kitchen\'s floor still open: another floor is ringed, and opening it uses the ring', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        main.__test__.onFloor('second', true);
        press('next');
        press('kitchen');
        press('next');
        press('gotIt');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        expect(main.__test__.model().lifted).toBe('main');
        stepFrames(2);
        expect(ring().className).toBe('ws-halo is-floor');
        expect(ring().hidden).toBe(false);
        main.__test__.liftLevel('second');
        stepFrames(2);
        expect(ring().hidden).toBe(true);
    });

    test('a control\'s glow (the quote at review) until it is tapped, and only one halo at a time', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        press('kitchen');
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'review', reached: 4 };
        main.__test__.showGuide();
        const quote = fact('quote');
        expect(quote.classList.contains('has-halo')).toBe(true);
        stepFrames(2);
        expect(ring().hidden).toBe(true);
        fire(quote, 'click');
        expect(quote.classList.contains('has-halo')).toBe(false);
        // A new scene takes the old glow away: the quote's ring, put back
        // at review, is gone at All set.
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'review' };
        main.__test__.showGuide();
        expect(fact('quote').classList.contains('has-halo')).toBe(true);
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'saved' };
        main.__test__.showGuide();
        expect(fact('quote').classList.contains('has-halo')).toBe(false);
    });
});

describe('the home at a glance under Maya\'s name (Steve, 2026-10-14)', () => {
    const facts = () => dom.el('host-facts');

    test('nothing until a task is priced; then the quote, keeping up as rooms come, a tap from its breakdown, and kept while she is tucked', async () => {
        const main = await boot({ sheet: true });
        expect(facts().hidden).toBe(true);
        press('start');
        pick('kind-house');
        expect(facts().hidden).toBe(true);
        press('next');
        press('kitchen');
        expect(facts().hidden).toBe(false);
        expect(facts().children).toHaveLength(1);
        const money = () => fact('quote').children[1].textContent;
        expect(fact('quote').children[0].textContent).toBe(GUIDE.factQuote);
        expect(money()).toMatch(/^\$\d+(\.\d\d)?$/);
        // Every price is labeled an example until launch (PRD 4), and is a
        // tap away from its breakdown.
        expect(factNote('quote')).toBe(UI.examplePrices);
        expect(fact('quote').getAttribute('aria-label')).toMatch(/^Your quote, \d+ dollars, about .+\. Example prices\. Show the breakdown\.$/);
        press('next');
        press('gotIt');
        // Rooms from her chips until the total passes the visit minimum.
        const before = money();
        for (let i = 0; i < 6 && money() === before; i++) {
            const chip = dom.el('host-choices').children[0].children.find((x) => x.id && x.id.startsWith('host-chip-'));
            fire(chip, 'click');
        }
        expect(money()).not.toBe(before);
        fire(fact('quote'), 'click');
        expect(dom.el('quote').hidden).toBe(false);
        expect(dom.el('quote-total').textContent).toContain(money());
        fire(dom.el('quote-close'), 'click');
        // Tucked away (sent to a card), the price is still in view: nothing
        // else shows it.
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'saved' };
        main.__test__.guideTo({ type: 'away', to: 'booking', was: null });
        expect(main.__test__.ui.guide.minimized).toBe(true);
        expect(facts().hidden).toBe(false);
        expect(money()).toMatch(/^\$\d+(\.\d\d)?$/);
    });

    test('the example\'s quote is marked as the example\'s', async () => {
        await boot({ sheet: true });
        press('example');
        expect(fact('quote').children[0].textContent).toBe(GUIDE.factExample);
    });
});

describe('moving along the strip (QA, 2026-10-14)', () => {
    const steps = () => dom.el('host-progress').children;
    const stepButton = (i) => steps()[i].children[0];

    test('back to Home type with a room chosen, Next from the floors goes on past First room to Your rooms (QA, 2026-10-15)', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        press('kitchen');
        press('next');
        press('gotIt');
        expect(line()).toBe(GUIDE.rooms);
        // To Home type on the strip, another kind of home, and on.
        fire(stepButton(0), 'click');
        expect(line()).toBe(GUIDE.homeAgainAsked);
        pick('kind-condo');
        expect(line()).toBe(GUIDE.floors);
        press('next');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        expect(line()).toBe(GUIDE.rooms);
        expect(main.__test__.active().rooms).toHaveLength(1);
        // Without a room, Next is First room, as ever.
        main.__test__.startOver();
        press('start');
        pick('kind-house');
        press('next');
        expect(line()).toBe(GUIDE.firstRoom);
    });

    test('two rooms in, First room is closed on the strip, and Back from Your rooms goes to Floors (QA, 2026-10-15)', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        press('kitchen');
        press('next');
        press('gotIt');
        // One room: First room is still a tap away.
        expect(stepButton(2).textContent).toBe('First room');
        fire(roomChip('primary-bedroom'), 'click');
        expect(main.__test__.active().rooms).toHaveLength(2);
        // Two: its name only, not a button; the steps before it still are.
        expect(steps()[2].children).toHaveLength(0);
        expect(steps()[2].textContent).toBe('First room');
        expect(stepButton(1).textContent).toBe('Floors');
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.floors);
        // Next from Floors goes on to Your rooms (a room is there).
        press('next');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
    });

    test('the steps reached are buttons that go there; the one she is on, and those ahead, are not', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        expect(line()).toBe(GUIDE.firstRoom);
        // Home type and Floors behind, First room here, the rest ahead.
        expect(steps().map((li) => (li.children[0] ? 'button' : 'text'))).toEqual(['button', 'button', 'text', 'text', 'text']);
        expect(stepButton(1).getAttribute('aria-label')).toBe(GUIDE.goToStep('Floors'));
        fire(stepButton(1), 'click');
        expect(line()).toBe(GUIDE.floors);
        // First room is ahead of the floors now, and still a tap away.
        expect(steps()[2].children[0].textContent).toBe('First room');
        fire(steps()[2].children[0], 'click');
        expect(line()).toBe(GUIDE.firstRoom);
        press('kitchen');
        const kitchen = main.__test__.active().rooms[0];
        // Back to the floors, and on again to the First room: the kitchen's
        // line, not a second kitchen.
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.floors);
        fire(steps()[2].children[0], 'click');
        expect(main.__test__.ui.guide).toMatchObject({ scene: 'added', roomId: kitchen.id });
        expect(main.__test__.active().rooms).toHaveLength(1);
    });

    test('Back from Your rooms is the first room\'s line again, not its question', async () => {
        const main = await boot({ sheet: true });
        press('start');
        pick('kind-house');
        press('next');
        press('kitchen');
        press('next');
        press('gotIt');
        expect(main.__test__.ui.guide.scene).toBe('rooms');
        fire(dom.el('host-back'), 'click');
        expect(main.__test__.ui.guide).toMatchObject({ scene: 'added', roomId: main.__test__.active().rooms[0].id });
    });

    test('Back on the First room step, and from the kind of home to the greeting', async () => {
        await boot();
        press('start');
        pick('kind-house');
        press('next');
        expect(dom.el('host-back').hidden).toBe(false);
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.floors);
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.homeAgainAsked);
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.hello);
        expect(dom.el('host-back').hidden).toBe(true);
    });
});

describe('Start over (QA, 2026-10-14)', () => {
    test('asked first on the confirmation card; Cancel keeps everything', async () => {
        const main = await boot();
        press('start');
        pick('kind-condo');
        const before = main.__test__.state.doc;
        fire(dom.el('host-reset'), 'click');
        expect(openCards()).toEqual(['confirm']);
        expect(dom.el('confirm-title').textContent).toBe(HELP.resetTitle);
        expect(dom.el('confirm-detail').textContent).toBe(HELP.resetDetail);
        expect(dom.el('confirm-actions').children.map((b) => b.textContent)).toEqual(['Cancel', HELP.resetConfirm]);
        fire(dom.el('confirm-actions').children[0], 'click');
        expect(main.__test__.state.doc).toBe(before);
        expect(saved()).not.toBeNull();
    });

    test('confirmed, everything is cleared and Maya greets the visitor as on a first visit', async () => {
        const main = await boot();
        press('start');
        pick('kind-townhome');
        pick('attached-end');
        tick('second', true);
        expect(saved().checklists).toHaveLength(1);
        main.__test__.confirmStartOver();
        fire(dom.el('confirm-actions').children[1], 'click');
        expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();
        expect(main.__test__.state.doc.checklists).toEqual([]);
        expect(main.__test__.active()).toBeNull();
        expect(main.__test__.ui.guide).toMatchObject({ scene: 'hello', reached: -1, answered: false });
        expect(line()).toBe(GUIDE.hello);
        expect(main.__test__.model().placed.massing).toEqual([]);
        expect(main.__test__.model().levels()).toEqual(['main']);
        expect(said()).toBe(HELP.resetDone);
        expect(document.activeElement).toBe(dom.el('host-actions').children.find((b) => b.id === 'host-start'));
        // Nothing to undo, and nothing saved until a change.
        ctrlZ();
        expect(main.__test__.state.doc.checklists).toEqual([]);
        expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();
        // And the whole way in again works.
        press('start');
        expect(line()).toBe(GUIDE.home);
        expect(saved().checklists).toHaveLength(1);
    });
});

describe("Maya's → and Start over (QA, 2026-10-15: no Help, no About), and Undo", () => {
    test('Start over sits at her foot once there is a home to clear, asked about first', async () => {
        await boot();
        // The greeting: nothing of their own yet, so nothing to start over.
        expect(dom.el('host-reset').hidden).toBe(true);
        press('start');
        pick('kind-house');
        expect(dom.el('host-reset').hidden).toBe(false);
        fire(dom.el('host-reset'), 'click');
        expect(openCards()).toEqual(['confirm']);
        expect(dom.el('confirm-title').textContent).toBe(HELP.resetTitle);
    });

    test("a tap on Maya repeats the scene's hint, and after the guide a hint about the house", async () => {
        const main = await boot();
        main.__test__.tapHost();
        expect(line()).toBe(GUIDE.helloAgain);
        press('start');
        pick('kind-house');
        // Standing by after the guide.
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'done', minimized: false };
        main.__test__.showGuide();
        main.__test__.tapHost();
        expect(line()).toBe(GUIDE.hint);
        press('close');
        expect(line()).toBe(`${GUIDE.homeEmpty('Our home')} ${GUIDE.returningLegend}`);
    });

    test('hover titles (QA, 2026-10-15): the → names its step, Back where it goes, and every labeled button says on hover what it says aloud', async () => {
        const main = await boot({ sheet: true });
        const next = dom.el('host-next');
        const back = dom.el('host-back');
        expect(next.getAttribute('title')).toBe(GUIDE.continueTo(GUIDE.start));
        press('start');
        expect(back.getAttribute('title')).toBe(GUIDE.backToStart);
        pick('kind-house');
        expect(back.getAttribute('title')).toBe(GUIDE.backTo('Home type'));
        expect(next.getAttribute('title')).toBe(GUIDE.continueTo(GUIDE.next));
        press('next');
        expect(back.getAttribute('title')).toBe(GUIDE.backTo('Floors'));
        press('kitchen');
        press('next');
        press('gotIt');
        // Your rooms: one room, Back is First room; two, Floors.
        expect(back.getAttribute('title')).toBe(GUIDE.backTo('First room'));
        expect(next.getAttribute('title')).toBe(GUIDE.continueTo(GUIDE.reviewIt));
        fire(roomChip('primary-bedroom'), 'click');
        expect(back.getAttribute('title')).toBe(GUIDE.backTo('Floors'));
        // Every button drawn with a label it says aloud says the same on hover.
        main.__test__.tapModel('main');
        const buttons = [];
        const walk = (node) => {
            if (!node || !node.children) return;
            for (const child of node.children) {
                if (child.tagName === 'BUTTON') buttons.push(child);
                walk(child);
            }
        };
        for (const id of ['host-progress', 'host-choices', 'host-facts', 'panel-list', 'panel-chips']) walk(dom.el(id));
        const labeled = buttons.filter((b) => b.getAttribute('aria-label'));
        expect(labeled.length).toBeGreaterThan(5);
        for (const b of labeled) expect(`${b.id}: ${b.getAttribute('title')}`).toBe(`${b.id}: ${b.getAttribute('aria-label')}`);
    });

    test('her → takes her main step from the top of the bubble, and only where there is one (QA, 2026-10-15)', async () => {
        const main = await boot({ sheet: true });
        const next = dom.el('host-next');
        // The greeting: Let's start.
        expect(next.hidden).toBe(false);
        expect(next.getAttribute('aria-label')).toBe(GUIDE.continueTo(GUIDE.start));
        fire(next, 'click');
        expect(line()).toBe(GUIDE.home);
        // The kind of home, asked the first time: the visitor's to choose.
        expect(next.hidden).toBe(true);
        pick('kind-house');
        expect(line()).toBe(GUIDE.floors);
        // Asked again (Back), the answer given goes on.
        fire(dom.el('host-back'), 'click');
        expect(line()).toBe(GUIDE.homeAgainAsked);
        const given = [...picks()].find((b) => b.classList.contains('is-on'));
        expect(next.getAttribute('aria-label')).toBe(GUIDE.continueTo(given.textContent));
        fire(next, 'click');
        expect(line()).toBe(GUIDE.floors);
        fire(next, 'click');
        // The first room is chosen, not defaulted.
        expect(line()).toBe(GUIDE.firstRoom);
        expect(next.hidden).toBe(true);
        press('kitchen');
        fire(next, 'click');
        expect(line()).toBe(GUIDE.dots);
        // Standing by: a home base's first way on.
        main.__test__.ui.guide = { ...main.__test__.ui.guide, scene: 'done', minimized: false };
        main.__test__.showGuide();
        expect(next.hidden).toBe(false);
        expect(next.getAttribute('aria-label')).toBe(GUIDE.continueTo(picks()[0].textContent));
        // Tucked away: none.
        main.__test__.ui.guide = { ...main.__test__.ui.guide, minimized: true };
        main.__test__.showGuide();
        expect(next.hidden).toBe(true);
    });

    test('no About any more: asked for, nothing changes', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
        expect(main.__test__.guideTo({ type: 'about' })).toBe(false);
        expect(line()).toBe(GUIDE.floors);
        expect(GUIDE.about).toBeUndefined();
    });

    test('Undo takes back a floor', async () => {
        const main = await boot();
        press('start');
        pick('kind-house');
        tick('second', true);
        ctrlZ();
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

    test('before the first room the house opens nothing, and Maya\'s next step pulses instead (QA, 2026-10-15)', async () => {
        const main = await boot({ sheet: true });
        // While she greets: nothing starts, nothing opens, Let's start pulses.
        expect(main.__test__.tapModel()).toBe(false);
        expect(main.__test__.tapModel('main')).toBe(false);
        expect(main.__test__.active()).toBeNull();
        expect(openCards()).toEqual([]);
        expect(line()).toBe(GUIDE.hello);
        expect(nudged('start')).toBe(true);
        // The kind of home, then the floors: still hers, the panel closed.
        press('start');
        expect(main.__test__.tapModel('main')).toBe(false);
        expect(line()).toBe(GUIDE.home);
        pick('kind-house');
        expect(main.__test__.tapModel('main')).toBe(false);
        expect(main.__test__.model().lifted).toBeNull();
        expect(panelShown()).toBe(false);
        expect(line()).toBe(GUIDE.floors);
        // The first room, from her chip: now a tap opens the house.
        press('next');
        fire(roomChip('kitchen'), 'click');
        expect(main.__test__.tapModel('main')).toBe(true);
        expect(main.__test__.model().lifted).toBe('main');
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

    test('two fingers move nothing and are never a tap, and lifting one lets the other turn', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        main.__test__.tapModel('main');
        const canvas = dom.el('game-canvas');
        const tt = main.__test__.turntable();
        fire(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
        main.__test__.gesture.grab = true;   // the first finger on the house
        // (A touch ends the arrival, so the view is taken after it.)
        const pose = JSON.stringify(tt.pose(16 / 10));
        fire(canvas, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
        fire(canvas, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 });
        // No zoom (QA, 2026-10-15), and no turn from a pinch either.
        expect(JSON.stringify(tt.pose(16 / 10))).toBe(pose);
        fire(canvas, 'pointerup', { pointerId: 2, clientX: 300, clientY: 100 });
        const yaw = tt.yaw;
        fire(canvas, 'pointermove', { pointerId: 1, clientX: 130, clientY: 100 });
        expect(tt.yaw).toBeGreaterThan(yaw);
        fire(canvas, 'pointerup', { pointerId: 1, clientX: 130, clientY: 100 });
        expect(main.__test__.model().lifted).toBe('main');
    });
});

describe('the closer view of an open floor (QA, 2026-10-15)', () => {
    test('opening a floor eases in close to it and lower, another floor moves to it, and closing eases back out', async () => {
        const main = await boot();
        main.__test__.showExample();
        const tt = main.__test__.turntable();
        const settle = () => { for (let i = 0; i < 120; i++) tt.step(1 / 60, { drift: false }); };
        tt.touch();   // the arrival over
        settle();
        const whole = tt.pose(16 / 10).distance;
        main.__test__.tapModel('main');
        // Eased, not cut to.
        expect(tt.near).toBe(0);
        settle();
        expect(tt.near).toBe(1);
        expect(tt.tilt).toBe(CONFIG.view.tilt.open);
        const main1 = tt.pose(16 / 10);
        expect(main1.distance).toBeLessThan(whole);
        // Framed on the model's own measure of the open floor.
        const model = main.__test__.model();
        expect(main1).toEqual(framePose(16 / 10, main.__test__.frameHeight(), { tilt: CONFIG.view.tilt.open, focus: model.focus(), near: 1 }, CONFIG));
        main.__test__.liftLevel('second');
        settle();
        expect(tt.pose(16 / 10).aim[1]).toBeGreaterThan(main1.aim[1]);
        main.__test__.liftLevel(null);
        settle();
        expect(tt.near).toBe(0);
        expect(tt.tilt).toBe(CONFIG.view.tilt.start);
        expect(tt.pose(16 / 10).distance).toBeCloseTo(whole, 9);
    });

    test('under reduced motion it is there at once, either way', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.showExample();
        const tt = main.__test__.turntable();
        main.__test__.liftLevel('main');
        expect(tt.near).toBe(1);
        expect(tt.tilt).toBe(CONFIG.view.tilt.open);
        main.__test__.liftLevel(null);
        expect(tt.near).toBe(0);
        expect(tt.tilt).toBe(CONFIG.view.tilt.start);
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
        main.__test__.openChecklistView();
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
