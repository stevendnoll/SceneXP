// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Meme Studio (www/meme, specs/meme M0): the empty studio and the page's boot.
 *
 * What is held here, and why:
 * - THE STUDIO IS MEASURED ON THE REAL THREE. The floor faces up, the camera
 *   looks at where the arrangement will stand, and the stage draws only when
 *   something changed. A stub would pass all of that with nothing on screen.
 * - EVERY ID THE PAGE LOOKS UP IS IN ITS MARKUP. The DOM stub invents any id
 *   it is asked for, so a typo would boot happily here and do nothing in a
 *   browser.
 * - THE CAPTION FACE IS NAMED TWICE, ONCE EACH (PLANNING D1): js/config.js
 *   for the canvas and css/meme.css for the page, and the two must agree, or
 *   the preview and the export would wear different faces.
 * - THE VIEWPORT SCROLLS, NOT THE BODY (the avatar page's phone lesson), so
 *   the sticky stage sticks to the viewport.
 */
import { jest } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { loadRealThree } from './helpers/real-three.mjs';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, flushAsync, fire } from './helpers/dom-stub.mjs';

const HTML = readFileSync('www/meme/index.html', 'utf8');
const MAIN = readFileSync('www/meme/js/main.js', 'utf8');
const CSS = readFileSync('www/meme/css/meme.css', 'utf8');

/** A renderer that draws nothing and counts its frames. */
function fakeRenderer() {
    const r = {
        renders: 0,
        loop: null,
        shadowMap: {},
        setPixelRatio() {},
        setSize() {},
        getPixelRatio: () => 1,
        render() { r.renders++; },
        setAnimationLoop(fn) { r.loop = fn; },
        dispose() { r.disposed = true; }
    };
    return r;
}

function fakeCanvas(w = 800, h = 600) {
    return { clientWidth: w, clientHeight: h };
}

describe('the studio, on the real three', () => {
    let THREE;
    let S;
    let CONFIG;

    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        jest.resetModules();
        S = await import('../www/meme/js/stage.js');
        ({ MEME_PAGE: CONFIG } = await import('../www/meme/js/config.js'));
    });
    afterAll(() => {
        delete globalThis.THREE;
    });

    test('the room has a floor facing up, three lights, and the studio\'s warm white', () => {
        const { scene, floor, lights } = S.buildStudio(CONFIG);
        expect(scene.background.getHexString()).toBe('f1efea');
        floor.updateMatrixWorld();
        const up = new THREE.Vector3(0, 0, 1).applyQuaternion(floor.quaternion);
        expect(up.y).toBeCloseTo(1, 5);
        expect(floor.geometry.parameters.width).toBe(CONFIG.studio.floor.size);
        // Under the boxes, which stand on y = 0, by enough that a box's own
        // floor never fights it for a pixel (Steve's QA, 2026-10-28).
        expect(floor.position.y).toBe(-CONFIG.studio.floor.below);
        expect(CONFIG.studio.floor.below).toBeGreaterThanOrEqual(0.005);
        expect(lights.sky.isHemisphereLight).toBe(true);
        expect(lights.sun.isDirectionalLight).toBe(true);
        expect(lights.fill.isDirectionalLight).toBe(true);
        expect(scene.children).toContain(lights.sun.target);
    });

    test('the camera looks at where the arrangement will stand, from in front and above', () => {
        const stage = S.createStage(CONFIG, { canvas: fakeCanvas(), makeRenderer: fakeRenderer });
        const dir = new THREE.Vector3();
        stage.camera.getWorldDirection(dir);
        const toAim = new THREE.Vector3(...CONFIG.camera.aim).sub(stage.camera.position).normalize();
        expect(dir.dot(toAim)).toBeCloseTo(1, 5);
        expect(stage.camera.position.y).toBeGreaterThan(CONFIG.camera.aim[1]);
        expect(stage.camera.position.z).toBeGreaterThan(0);
    });

    test('it draws once when started, again only when touched or resized, and goes quiet otherwise', () => {
        const canvas = fakeCanvas();
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: fakeRenderer });
        const r = stage.renderer;
        stage.start();
        expect(stage.running).toBe(true);
        expect(typeof r.loop).toBe('function');
        r.loop();
        r.loop();
        r.loop();
        expect(stage.frames).toBe(1);
        stage.touch();
        r.loop();
        expect(stage.frames).toBe(2);
        canvas.clientWidth = 400;
        r.loop();
        expect(stage.frames).toBe(3);
        expect(stage.camera.aspect).toBeCloseTo(400 / 600, 6);
        stage.stop();
        expect(stage.running).toBe(false);
        expect(r.loop).toBeNull();
    });

    test('a hidden canvas (no size) is not drawn, and the phone\'s pixel ratio is capped', () => {
        const canvas = fakeCanvas(0, 0);
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: fakeRenderer });
        expect(stage.fit()).toBe(false);
        stage.start();
        stage.renderer.loop();
        expect(stage.frames).toBe(0);
        const ratios = [];
        const mobile = S.createStage(CONFIG, {
            canvas: fakeCanvas(), mobile: true,
            makeRenderer: () => Object.assign(fakeRenderer(), { setPixelRatio: (r) => ratios.push(r) })
        });
        globalThis.window = { devicePixelRatio: 3 };
        try {
            expect(mobile.fit()).toBe(true);
        } finally {
            delete globalThis.window;
        }
        expect(ratios).toEqual([CONFIG.quality.maxPixelRatioMobile]);
    });

    test('disposing stops the loop and lets the room\'s geometry and materials go', () => {
        const stage = S.createStage(CONFIG, { canvas: fakeCanvas(), makeRenderer: fakeRenderer });
        const geometry = jest.spyOn(stage.floor.geometry, 'dispose');
        const material = jest.spyOn(stage.floor.material, 'dispose');
        stage.start();
        stage.dispose();
        expect(stage.running).toBe(false);
        expect(geometry).toHaveBeenCalled();
        expect(material).toHaveBeenCalled();
        expect(stage.renderer.disposed).toBe(true);
    });
});

describe('the page', () => {
    let dom;

    afterEach(() => {
        if (dom) dom.uninstall();
        dom = null;
    });

    /** The overlay's 2D context, recording what is drawn (the stub makes a
     *  fresh context each call, so the page is handed this one). */
    function overlayContext() {
        const drawn = [];
        const ctx = { drawn, measureText: (s) => ({ width: s.length * 2 }), fillText: (text) => drawn.push(text) };
        for (const m of ['setTransform', 'clearRect', 'scale', 'strokeText']) ctx[m] = () => {};
        dom.el('mm-overlay').getContext = () => ctx;
        return ctx;
    }

    async function boot({ saved = null, webgl = true } = {}) {
        installThree();
        dom = installDom();
        Object.assign(dom.windowStub.location, { hostname: 'localhost', pathname: '/meme/' });
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        if (!webgl) delete dom.windowStub.WebGL2RenderingContext;
        if (saved) globalThis.localStorage.setItem('scenexp-avatar', JSON.stringify(saved));
        jest.resetModules();
        const main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        return main;
    }

    test('every id the page looks up is in its markup, once', () => {
        const ids = [...MAIN.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(3);
        for (const id of new Set(ids)) {
            const count = HTML.split(`id="${id}"`).length - 1;
            expect(`${id}: ${count}`).toBe(`${id}: 1`);
        }
        expect(MAIN).toMatch(/document\.getElementById\('meme-app'\)/);
        expect(HTML).toContain('id="meme-app"');
    });

    test('the caption face is one stack, named in config and in the stylesheet alike (D1)', async () => {
        const { MEME_PAGE } = await import('../www/meme/js/config.js');
        const token = CSS.match(/--mm-caption-font:\s*([^;]+);/);
        expect(token).not.toBeNull();
        expect(token[1].trim()).toBe(MEME_PAGE.caption.font);
        expect(MEME_PAGE.caption.font).toMatch(/^Impact,/);
        // Nothing is fetched: no font file and no @font-face anywhere.
        expect(CSS).not.toMatch(/@font-face/);
        expect(HTML).not.toMatch(/\.woff2?/);
        expect(MEME_PAGE.caption).toMatchObject({ maxChars: 60, maxSlots: 6, maxLines: 2 });
    });

    test('the stage sticks to the viewport on a phone: the body is not a scroll container', () => {
        const rule = (selector) => [...CSS.matchAll(new RegExp(`(?:^|\\n)${selector} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
        expect(rule('html')).toMatch(/overflow:\s*auto/);
        expect(rule('body\\.mm-body')).toMatch(/overflow:\s*visible/);
        expect(rule('body\\.mm-body')).not.toMatch(/overflow(-[xy])?:\s*(auto|scroll|hidden)/);
        expect(rule('\\.mm-stage')).toMatch(/position:\s*sticky/);
        const phone = CSS.slice(CSS.indexOf('@media (max-width: 760px)'));
        expect(phone.match(/\.mm-stage \{([^}]*)\}/)[1]).not.toMatch(/position/);
    });

    test('the page is released: in search, with the words and the next step already there', () => {
        const page = HTML.replace(/<!--[\s\S]*?-->/g, '');
        // Released 2026-10-28 (M7): no robots tag at all, the directory
        // suite's rule for a listed page.
        expect(page).not.toMatch(/<meta\s+name="robots"/i);
        expect(page).not.toMatch(/noindex/i);
        expect(page).toMatch(/<title>Meme Studio \| SceneXP<\/title>/);
        // Words before scenery: the heading and the one next step are in the
        // markup, so they show before the stage has drawn anything.
        expect(page).toMatch(/<h2 id="mm-heading"[^>]*>Put yourself in the meme<\/h2>/);
        expect(page).toMatch(/id="mm-lede"[^>]*>Your avatar is already standing in the first one\./);
    });

    test('both ways to the avatar page come back here, and the avatar page takes the way back', async () => {
        // The avatar page's Back button follows `?return=` only for the home
        // page and the promo catalog's scenes (no open redirect), so this
        // link worked only once Meme Studio joined the catalog at release.
        const page = HTML.replace(/<!--[\s\S]*?-->/g, '');
        expect(page).toMatch(/<a id="mm-make-avatar" class="mm-link" href="\/avatar\/\?return=\/meme\/">/);
        expect(page).toMatch(/<p id="mm-incoming-note"[^>]*>[^<]*<a class="mm-link" href="\/avatar\/\?return=\/meme\/">/);
        const { returnTarget } = await import('../www/avatar/js/transfer.js');
        expect(returnTarget('?return=/meme/')).toEqual({ path: '/meme/', name: 'Meme Studio' });
        // The card for a visitor with no avatar names that page as the page
        // names itself, with its own card's art, and the same way back.
        const { MEME_PAGE } = await import('../www/meme/js/config.js');
        const avatar = MEME_PAGE.next.avatar;
        expect(readFileSync('www/avatar/index.html', 'utf8')).toContain(`<meta property="og:title" content="${avatar.title}">`);
        expect(existsSync(`www${avatar.art.replace(/\?.*$/, '')}`)).toBe(true);
        expect(avatar.href).toBe('/avatar/?return=/meme/');
    });

    test('it boots: the page shown, the first template standing with a stand-in, the stage started, nothing written', async () => {
        const main = await boot();
        const { state } = main.__test__;
        expect(dom.el('meme-app').hidden).toBe(false);
        expect(state.stage).toBeTruthy();
        expect(state.stage.running).toBe(true);
        expect(dom.loops.length).toBeGreaterThan(0);
        expect(dom.el('mm-stage-status').hidden).toBe(true);
        expect(state.avatar).toBeNull();
        expect(state.standIn).toBeTruthy();
        expect(state.template.id).toBe('surprised');
        expect(state.stage.panels).toHaveLength(1);
        expect(state.stage.panels[0].figures).toHaveLength(1);
        expect(main.avatarForRole('you')).toBe(state.standIn);
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.noAvatar);
        expect(globalThis.localStorage.getItem('scenexp-avatar')).toBeNull();
        // One caption field, capped, counted, and the live caption hidden
        // until something is typed.
        const fields = dom.el('mm-captions').children;
        expect(fields).toHaveLength(1);
        const input = fields[0].children[1];
        expect(input.id).toBe('mm-caption-0');
        expect(input.getAttribute('maxlength')).toBe('60');
        expect(fields[0].children[2].textContent).toBe('0 / 60');
        expect(dom.el('mm-picture-save').hidden).toBe(false);
        expect(dom.el('mm-picture-save').textContent).toBe('Save picture');
        expect(dom.el('mm-hint').hidden).toBe(false);
        // The picker: ten templates in order, the first pressed.
        const picks = dom.el('mm-picker').children;
        expect(picks.map((b) => b.dataset.template)).toEqual(['surprised', 'panic', 'nopeYep', 'thenNow', 'galaxyBrain', 'plan', 'headTurn', 'handshake', 'alwaysHasBeen', 'everythingIsFine']);
        expect(picks.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', ...Array(9).fill('false')]);
        // A glyph of the grid, then the words.
        expect(picks[1].children[0].tagName.toLowerCase()).toBe('svg');
        expect(picks[1].children[0].children).toHaveLength(6);
        expect(picks[1].children[1].children[0].textContent).toBe('Panic / Calm / Panic');
        // Every tab and panel the page wires is in the markup, once.
        for (const { tab, panel } of main.TABS) {
            expect(HTML.split(`id="${tab}"`).length - 1).toBe(1);
            expect(HTML.split(`id="${panel}"`).length - 1).toBe(1);
            expect(HTML).toContain(`aria-controls="${panel}"`);
        }
    });

    test('picking a template rebuilds the panels and the fields, keeps typed captions by slot, and pings once', async () => {
        const main = await boot();
        const { state } = main.__test__;
        const input = dom.el('mm-captions').children[0].children[1];
        input.value = 'first';
        fire(input, 'input');
        fire(dom.el('mm-picker').children[1], 'click');
        expect(state.template.id).toBe('panic');
        expect(state.stage.panels).toHaveLength(6);
        expect(state.stage.panels.filter((p) => p.figures.length)).toHaveLength(3);
        const fields = dom.el('mm-captions').children;
        expect(fields).toHaveLength(3);
        expect(fields.map((f) => f.children[0].textContent)).toEqual(['Panel 1: Caption', 'Panel 2: Caption', 'Panel 3: Caption']);
        expect(fields[0].children[1].value).toBe('first');
        expect(state.captions).toEqual(['first', '', '']);
        expect(dom.el('mm-picker').children.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', ...Array(8).fill('false')]);
        // The same template again is nothing.
        const panels = state.stage.panels;
        expect(main.pickTemplate('panic').id).toBe('panic');
        expect(state.stage.panels).toBe(panels);
        // Then vs Now changes the build on both figures.
        main.pickTemplate('thenNow');
        expect(state.stage.panels.map((p) => p.figures[0].avatar.build)).toEqual(['slim', 'broad']);
        expect(state.stage.panels.map((p) => p.figures[0].avatar.muscles)).toEqual(['standard', 'buff']);
    });

    test('the captions are laid over the stage where the panels are, and the picture\'s size follows the radios', async () => {
        const main = await boot();
        const { state } = main.__test__;
        // The stage's frame says where the panels are; the overlay draws there.
        const { drawn } = overlayContext();
        main.pickTemplate('panic');
        const input = dom.el('mm-captions').children[1].children[1];
        input.value = 'kalm';
        fire(input, 'input');
        expect(drawn).toContain('KALM');
        expect(state.rects).toHaveLength(6);
        // Stepping into a panel is counted once.
        state.stage.view(3);
        for (const fn of dom.loops) fn();
        expect(state.pinged.stepped).toBe(true);
        expect(state.stage.viewing).toBe(3);
        // Escape steps out, unless a caption field has the focus.
        input.tagName = 'INPUT';
        document.activeElement = input;
        main.__test__.onKey({ key: 'Escape' });
        expect(state.stage.viewing).toBe(3);
        document.activeElement = null;
        main.__test__.onKey({ key: 'Escape' });
        expect(state.stage.viewing).toBeNull();
        main.__test__.onKey({ key: 'Escape' });
        // The size radios.
        expect(main.readSize()).toBe('square');
        dom.el('mm-size-portrait').checked = true;
        fire(dom.el('mm-size-portrait'), 'change');
        expect(state.sizeId).toBe('portrait');
        expect(main.readSize()).toBe('portrait');
    });

    test('typing a caption draws it over the stage, counts it, redraws the preview, and pings once a slot', async () => {
        const main = await boot();
        const { state } = main.__test__;
        const input = dom.el('mm-captions').children[0].children[1];
        const { drawn } = overlayContext();
        // The boot asked for a preview frame: let it draw, so the next
        // keystroke asks for a frame of its own.
        for (const fn of dom.loops) fn();
        const before = dom.loops.length;
        input.value = 'when the tests pass';
        fire(input, 'input');
        expect(state.captions).toEqual(['when the tests pass']);
        // Drawn over the stage in capitals (the stub's camera projects no
        // real rect, so the wrapping is not judged here: compose's suite does).
        expect(drawn.join(' ')).toMatch(/^WHEN\b/);
        expect(dom.el('mm-captions').children[0].children[2].textContent).toBe('19 / 60');
        // The preview waits for a frame, then is drawn once however many
        // keystrokes came in.
        expect(dom.loops.length).toBe(before + 1);
        input.value = 'when the tests pass!';
        fire(input, 'input');
        expect(dom.loops.length).toBe(before + 1);
        const rendered = state.exporter.rendered;
        dom.loops[before]();
        expect(state.exporter.rendered).toBe(rendered + 1);
        expect(state.pinged.typed.has(0)).toBe(true);
        // Over the cap, cut.
        input.value = 'x'.repeat(70);
        fire(input, 'input');
        expect(state.captions[0]).toHaveLength(60);
        // Restored captions go through the same path.
        state.fields.set(['again']);
        expect(input.value).toBe('again');
        expect(state.captions[0]).toBe('again');
    });

    test('the picture goes to the downloads folder and the sheet says so, or says it could not be made', async () => {
        const main = await boot();
        const create = document.createElement;
        document.createElement = (tag) => {
            const el = create(tag);
            if (tag === 'canvas') el.toBlob = (cb, type) => cb(new Blob(['picture'], { type: type || 'image/png' }));
            return el;
        };
        window.URL = { createObjectURL: () => 'blob:meme', revokeObjectURL: () => {} };
        window.setTimeout = () => 0;   // the revoke timer, never left running
        const saves = [];
        document.body.appendChild = (el) => saves.push(el);
        expect(dom.el('mm-next').children).toHaveLength(0);
        expect(await main.__test__.savePicture()).toBe('saved');
        expect(saves[0].download).toBe('scenexp-meme-surprised-1080x1080.png');
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.pictureSaved);
        // Finished, so what comes next: with no avatar, the avatar page.
        expect(dom.el('mm-next').hidden).toBe(false);
        expect(dom.el('mm-next').children[0].href).toBe('/avatar/?return=/meme/');
        fire(dom.el('mm-picture-save'), 'click');
        await flushAsync(10);
        expect(saves).toHaveLength(2);
        document.createElement = create;
        expect(await main.__test__.savePicture()).toBe('failed');
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.pictureFailed);
    });

    test('a saved avatar is found and said so, wears the lead role, and is never changed', async () => {
        const saved = { v: 1, skin: 'deep', shirt: 'teal' };
        const main = await boot({ saved });
        expect(main.__test__.state.avatar).toMatchObject({ skin: 'deep', shirt: 'teal' });
        expect(main.avatarForRole('you')).toBe(main.__test__.state.avatar);
        expect(main.avatarForRole('nobody')).toBe(main.__test__.state.avatar);
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.withAvatar);
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar'))).toEqual(saved);
    });

    test('without WebGL 2 the sheet still shows with its caption field, the picture button is gone, and the stage says why it is empty', async () => {
        const main = await boot({ webgl: false });
        expect(main.__test__.state.stage).toBeNull();
        expect(main.__test__.state.exporter).toBeNull();
        expect(dom.el('meme-app').hidden).toBe(false);
        expect(dom.el('mm-captions').children).toHaveLength(1);
        expect(dom.el('mm-picker').children).toHaveLength(10);
        expect(dom.el('mm-picture-save').hidden).toBe(true);
        expect(dom.el('mm-hint').hidden).toBe(true);
        // No stage, no panels on it: the overlay has nothing to draw.
        const { drawn } = overlayContext();
        main.drawOverlay();
        expect(drawn).toEqual([]);
        expect(main.__test__.state.rects).toEqual([]);
        expect(dom.el('mm-stage-status').textContent).toBe(main.WORDS.noStage);
        expect(dom.el('mm-stage-status').hidden).not.toBe(true);
        expect(main.refreshPreview()).toBe(false);
        expect(await main.__test__.savePicture()).toBe('failed');
    });

    test('a hidden page stops drawing and a shown one starts again, and the visit ends once', async () => {
        const main = await boot();
        const { state, endVisit } = main.__test__;
        dom.documentStub.hidden = true;
        fire(dom.documentStub, 'visibilitychange');
        expect(state.stage.running).toBe(false);
        expect(state.session.ended).toBe(true);
        dom.documentStub.hidden = false;
        fire(dom.documentStub, 'visibilitychange');
        expect(state.stage.running).toBe(true);
        endVisit();
        expect(state.session.ended).toBe(true);
    });

    test('the tabs switch panels by click and by arrow keys, and only the chosen tab is in the tab order', async () => {
        const main = await boot();
        const { state } = main.__test__;
        const tabs = ['mm-tab-meme', 'mm-tab-captions', 'mm-tab-people'].map((id) => dom.el(id));
        const panels = ['mm-panel-meme', 'mm-panel-captions', 'mm-panel-people'].map((id) => dom.el(id));
        expect(state.tabs.selected).toBe('mm-tab-meme');
        expect(panels.map((p) => p.hidden)).toEqual([false, true, true]);
        fire(tabs[1], 'click');
        expect(state.tabs.selected).toBe('mm-tab-captions');
        expect(panels.map((p) => p.hidden)).toEqual([true, false, true]);
        expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
        expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
        fire(tabs[1], 'keydown', { key: 'ArrowRight' });
        expect(state.tabs.selected).toBe('mm-tab-people');
        expect(tabs[2].focused).toBe(true);
        fire(tabs[2], 'keydown', { key: 'ArrowRight' });
        expect(state.tabs.selected).toBe('mm-tab-meme');
        fire(tabs[0], 'keydown', { key: 'End' });
        expect(state.tabs.selected).toBe('mm-tab-people');
        fire(tabs[2], 'keydown', { key: 'Tab' });
        expect(state.tabs.selected).toBe('mm-tab-people');
        expect(state.tabs.select('nope')).toBe(false);
        // The people: the visitor, standing in, and the way to an avatar.
        expect(dom.el('mm-people').children).toHaveLength(1);
        expect(dom.el('mm-people').children[0].textContent).toContain(main.WORDS.personStandIn);
        expect(dom.el('mm-make-avatar').hidden).toBe(false);
    });

    test('a face chip rebuilds that panel\'s figure, the meme\'s own face is null, and arrows move along the row', async () => {
        const main = await boot();
        const { state } = main.__test__;
        main.pickTemplate('panic');
        const rows = dom.el('mm-faces').children;
        expect(rows).toHaveLength(3);
        expect(rows[0].children[0].textContent).toBe('Panel 1: Face');
        const chips = rows[1].children[1].children;
        expect(chips).toHaveLength(11);
        expect(chips.map((c) => c.getAttribute('aria-checked')).filter((v) => v === 'true')).toHaveLength(1);
        const own = chips.find((c) => c.dataset.value === 'deadpan');
        expect(own.getAttribute('aria-checked')).toBe('true');
        expect(own.textContent).toBe("Deadpan (the meme's own)");
        const before = state.stage.panels[3].figures[0];
        fire(chips.find((c) => c.dataset.value === 'rage'), 'click');
        expect(state.expressions).toEqual([null, null, null, 'rage', null, null]);
        expect(state.stage.panels[3].figures[0]).not.toBe(before);
        expect(state.stage.panels[3].figures[0].spec.expression).toBe('rage');
        expect(state.pinged.faced).toBe(true);
        // Back to the meme's own: null again, the figure its own face.
        fire(own, 'click');
        expect(state.expressions[3]).toBeNull();
        expect(state.stage.panels[3].figures[0].spec.expression).toBe('deadpan');
        // An arrow from the chosen chip moves and chooses.
        fire(own, 'keydown', { key: 'ArrowRight' });
        const after = chips.findIndex((c) => c.getAttribute('aria-checked') === 'true');
        expect(after).toBe(chips.indexOf(own) + 1);
        expect(chips[after].focused).toBe(true);
        expect(state.expressions[3]).toBe(chips[after].dataset.value);
        fire(own, 'keydown', { key: 'Tab' });
        // A text cell has no chips, and a cell with no figure takes no face.
        expect(state.stage.setExpression(0, 'rage')).toBeNull();
        expect(state.stage.setExpression(99, 'rage')).toBeNull();
    });

    test('the view buttons step into a panel and out by keyboard, following the stage too', async () => {
        const main = await boot();
        const { state } = main.__test__;
        main.pickTemplate('nopeYep');
        const buttons = dom.el('mm-view').children;
        expect(buttons.map((b) => b.textContent)).toEqual(['All panels', 'Panel 1', 'Panel 2', 'Panel 3', 'Panel 4']);
        expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
        fire(buttons[3], 'click');
        expect(state.stage.viewing).toBe(2);
        expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false']);
        // The stage changing its view (a tap, Escape) presses the right button.
        state.stage.view(null);
        expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
        state.stage.view(1);
        expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
        // A new template steps out.
        main.pickTemplate('plan');
        expect(state.stage.viewing).toBeNull();
        expect(dom.el('mm-view').children[0].getAttribute('aria-pressed')).toBe('true');
    });

    test('the meme is kept in this browser on every change and restored on return, and Start over clears it', async () => {
        let main = await boot();
        let { state } = main.__test__;
        expect(state.restored).toBe(false);
        main.pickTemplate('thenNow');
        const input = dom.el('mm-captions').children[1].children[1];
        input.value = 'now';
        fire(input, 'input');
        main.__test__.onExpression(0, 'rage');
        const kept = JSON.parse(globalThis.localStorage.getItem('scenexp-meme'));
        expect(kept).toEqual({ v: 1, template: 'thenNow', captions: ['', 'now'], expressions: ['rage', null], tint: null, friend: null, cast: {} });
        // Back again: the same meme, said so, the chip and the figure right.
        dom.uninstall();
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        globalThis.localStorage.setItem('scenexp-meme', JSON.stringify(kept));
        jest.resetModules();
        main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        ({ state } = main.__test__);
        expect(state.restored).toBe(true);
        expect(state.template.id).toBe('thenNow');
        expect(state.captions).toEqual(['', 'now']);
        expect(state.expressions).toEqual(['rage', null]);
        expect(state.stage.panels[0].figures[0].spec.expression).toBe('rage');
        expect(dom.el('mm-captions').children[1].children[1].value).toBe('now');
        expect(dom.el('mm-faces').children[0].children[1].children.find((c) => c.dataset.value === 'rage').getAttribute('aria-checked')).toBe('true');
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.welcomeBack);
        expect(main.currentMeme()).toEqual(kept);
        // Start over: the first meme, nothing kept.
        fire(dom.el('mm-start-over'), 'click');
        expect(state.template.id).toBe('surprised');
        expect(state.captions).toEqual(['']);
        expect(globalThis.localStorage.getItem('scenexp-meme')).toBeNull();
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.cleared);
        expect(state.tabs.selected).toBe('mm-tab-meme');
        // Rubbish in the store is the first meme, not a return.
        dom.uninstall();
        installThree();
        dom = installDom();
        globalThis.localStorage.setItem('scenexp-meme', '{"template":"castle","captions":[]}');
        jest.resetModules();
        main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        expect(main.__test__.state.restored).toBe(false);
        expect(main.__test__.state.template.id).toBe('surprised');
    });

    test('Galaxy Brain offers a background color: a swatch or any color recolors its walls, is kept, travels, comes back, and Start over clears it (M8)', async () => {
        let main = await boot();
        let { state } = main.__test__;
        const { MEME_PAGE } = await import('../www/meme/js/config.js');
        const { encodeMeme } = await import('../www/meme/js/remix.js');
        // A meme with no color to pick shows nothing.
        expect(dom.el('mm-tint').hidden).toBe(true);
        expect(dom.el('mm-tint').children).toHaveLength(0);
        main.pickTemplate('galaxyBrain');
        const row = () => dom.el('mm-tint').children[0].children[1].children;
        const radios = () => row().slice(0, -1).map((label) => label.children[0]);
        const custom = () => row()[row().length - 1].children[0];
        expect(dom.el('mm-tint').hidden).toBe(false);
        expect(dom.el('mm-tint').children[0].children[0].textContent).toBe('Background color');
        // The meme's own, each swatch, then any color; the own one chosen,
        // its dot the meme's deepest wall.
        expect(radios().map((r) => r.value)).toEqual(['', ...MEME_PAGE.tint.swatches.map((w) => w.color.toLowerCase())]);
        expect(radios().map((r) => r.checked)).toEqual([true, ...MEME_PAGE.tint.swatches.map(() => false)]);
        expect(row()[0].children[1].children[0].style.getPropertyValue('--mm-dot')).toBe('#4B2E99');
        expect(custom().type).toBe('color');
        expect(custom().getAttribute('aria-label')).toBe('Any color for the background');
        expect(state.tint).toBeNull();
        const setTint = jest.spyOn(state.stage, 'setTint');
        // A swatch.
        const teal = radios()[3];
        teal.checked = true;
        fire(teal, 'change');
        expect(state.tint).toBe(MEME_PAGE.tint.swatches[2].color.toLowerCase());
        expect(setTint).toHaveBeenLastCalledWith(state.tint);
        expect(state.pinged.tinted).toBe(true);
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-meme')).tint).toBe(state.tint);
        // Any color: the radios let go and the picker is shown chosen.
        custom().value = '#336699';
        fire(custom(), 'change');
        expect(state.tint).toBe('#336699');
        expect(radios().every((r) => !r.checked)).toBe(true);
        expect(custom().classList.contains('is-chosen')).toBe(true);
        expect(encodeMeme(main.currentMeme())).toMatch(/\/336699$/);
        // A meme without a color hides the row and keeps none; back on
        // Galaxy Brain the color picked this visit is still there.
        main.pickTemplate('panic');
        expect(dom.el('mm-tint').hidden).toBe(true);
        expect(main.currentMeme().tint).toBeNull();
        main.pickTemplate('galaxyBrain');
        expect(setTint).toHaveBeenCalledTimes(2);
        expect(custom().classList.contains('is-chosen')).toBe(true);
        expect(custom().value).toBe('#336699');
        const kept = JSON.parse(globalThis.localStorage.getItem('scenexp-meme'));
        expect(kept.tint).toBe('#336699');
        // Back again: the color restored, a change worth welcoming back.
        dom.uninstall();
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        globalThis.localStorage.setItem('scenexp-meme', JSON.stringify({ ...kept, captions: [] }));
        jest.resetModules();
        main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        ({ state } = main.__test__);
        expect(state.restored).toBe(true);
        expect(state.tint).toBe('#336699');
        expect(custom().classList.contains('is-chosen')).toBe(true);
        // The meme's own again is null.
        radios()[0].checked = true;
        fire(radios()[0], 'change');
        expect(state.tint).toBeNull();
        expect(custom().classList.contains('is-chosen')).toBe(false);
        // Start over forgets it.
        main.__test__.onTint('#121214');
        fire(dom.el('mm-start-over'), 'click');
        expect(state.tint).toBeNull();
    });

    test('a browser that keeps nothing is told so, once, and the page works on', async () => {
        installThree();
        dom = installDom();
        globalThis.localStorage.setItem = () => { throw new Error('denied'); };
        jest.resetModules();
        const main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.notKept);
        main.pickTemplate('panic');
        expect(main.__test__.state.template.id).toBe('panic');
    });

    const LINK = (captions = ['from+a+friend'], avatar = 'a=1.deep.black') => `#m=1/panic/${captions.join('|')}/-,rage,-,-,-,-&${avatar}`;

    test('a meme in the address is shown as made, the maker in the lead, asked about, and the fragment dropped', async () => {
        const replaced = [];
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        dom.windowStub.location.hash = LINK();
        dom.windowStub.location.pathname = '/meme/';
        dom.windowStub.location.search = '';
        dom.windowStub.history = { replaceState: (s, t, url) => replaced.push(url) };
        jest.resetModules();
        const main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        const { state } = main.__test__;
        expect(state.incoming).toBe(true);
        expect(state.template.id).toBe('panic');
        expect(state.captions).toEqual(['from a friend', '', '']);
        expect(state.expressions).toEqual([null, 'rage', null, null, null, null]);
        expect(state.maker).toMatchObject({ skin: 'deep' });
        expect(main.avatarForRole('you')).toBe(state.maker);
        expect(state.stage.panels[1].figures[0].avatar.skin).toBe('deep');
        expect(dom.el('mm-incoming').hidden).toBe(false);
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.fromFriend);
        expect(dom.el('mm-people').children[0].textContent).toContain(main.WORDS.personMaker);
        expect(replaced).toEqual(['/meme/']);
        // No avatar of their own: the way to make one, and the meme kept.
        fire(dom.el('mm-make-mine'), 'click');
        expect(state.incoming).toBe(true);
        expect(dom.el('mm-incoming-note').hidden).toBe(false);
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.mineNoAvatar);
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-meme')).captions).toEqual(['from a friend', '', '']);
        // Kept as it is: the maker stays in the lead, the card goes.
        fire(dom.el('mm-keep-theirs'), 'click');
        expect(state.incoming).toBe(false);
        expect(dom.el('mm-incoming').hidden).toBe(true);
        expect(main.avatarForRole('you')).toBe(state.maker);
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.keptTheirs);
        expect(main.makeItMine()).toBe(false);
        expect(main.keepTheirs()).toBe(false);
        // Start over puts the visitor's own figure back.
        fire(dom.el('mm-start-over'), 'click');
        expect(state.maker).toBeNull();
        expect(main.avatarForRole('you')).toBe(state.standIn);
    });

    test('with an avatar of their own, Make it mine puts it in the lead and keeps the meme, and a bad link is nothing', async () => {
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        globalThis.localStorage.setItem('scenexp-avatar', JSON.stringify({ v: 1, skin: 'fair', shirt: 'teal' }));
        dom.windowStub.location.hash = LINK(['hello']);
        jest.resetModules();
        const main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        const { state } = main.__test__;
        expect(state.stage.panels[1].figures[0].avatar.skin).toBe('deep');
        fire(dom.el('mm-make-mine'), 'click');
        expect(state.incoming).toBe(false);
        expect(state.maker).toBeNull();
        expect(state.friend).toBeNull();   // no friend's role in this template (M5)
        expect(main.avatarForRole('you')).toBe(state.avatar);
        expect(state.stage.panels[1].figures[0].avatar.skin).toBe('fair');
        expect(state.captions).toEqual(['hello', '', '']);
        expect(state.expressions[1]).toBe('rage');
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.mine);
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-meme')).template).toBe('panic');
        // A link that is not a meme changes nothing.
        dom.windowStub.location.hash = '#m=9/panic//';
        expect(main.readLink()).toBe(false);
        expect(state.incoming).toBe(false);
        // A link arriving later (hashchange) is read the same way.
        dom.windowStub.location.hash = '#m=1/surprised/again/-';
        fire(dom.windowStub, 'hashchange');
        expect(state.incoming).toBe(true);
        expect(state.template.id).toBe('surprised');
        expect(state.maker).toBeNull();
        expect(main.__test__.leadAvatar()).toBe(state.avatar);
    });

    test('Share link hands the meme and the lead\'s avatar to the shared ladder, and says when it was copied', async () => {
        const main = await boot();
        const { state } = main.__test__;
        main.pickTemplate('thenNow');
        main.__test__.onCaption(0, 'then');
        const copied = [];
        globalThis.navigator.clipboard = { writeText: async (text) => { copied.push(text); } };
        window.setTimeout = (fn) => { fn(); return 0; };
        fire(dom.el('mm-link'), 'click');
        await flushAsync(20);
        expect(copied).toHaveLength(1);
        expect(copied[0]).toContain(main.WORDS.linkText);
        expect(copied[0]).toMatch(/#m=1\/thenNow\/then\|\/-,-&a=1\./);
        // The page's own directory (the stub's is /test/), never a path
        // written down.
        expect(copied[0]).toContain(`${dom.windowStub.location.href}#m=`);
        delete globalThis.navigator.clipboard;
        expect(state.template.id).toBe('thenNow');
        // A link copied is a meme finished: what comes next appears.
        expect(dom.el('mm-next').children[0].href).toBe('/avatar/?return=/meme/');
    });

    test('what comes next is built once, on a finish only: X\'s and O\'s for a visitor with an avatar, then the directory', async () => {
        const main = await boot({ saved: { v: 1, skin: 'deep', shirt: 'teal' } });
        const { showNext } = main.__test__;
        const host = dom.el('mm-next');
        // A dismissed sheet or a failure is not a finish.
        for (const how of ['cancelled', 'failed', undefined]) expect(showNext(how)).toBe(false);
        expect(host.children).toHaveLength(0);
        expect(showNext('shared')).toBe(true);
        expect(host.hidden).toBe(false);
        expect(host.children).toHaveLength(2);
        // The catalog's pick for a meme (promo PAIRS), the directory under it.
        expect(host.children[0].href).toBe('/xo/');
        expect(host.children[0].dataset.slug).toBe('xo');
        expect(host.children[1].href).toBe('/');
        // Once: a second finish adds nothing.
        for (const how of ['saved', 'native', 'copy', 'mail']) expect(showNext(how)).toBe(false);
        expect(host.children).toHaveLength(2);
    });

    test('the People tab fills a friend by link or file, reshuffles the crowd, names the labels, and keeps the friend', async () => {
        const main = await boot();
        const { state } = main.__test__;
        main.pickTemplate('headTurn');
        const rows = dom.el('mm-people').children;
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.children[0].textContent)).toEqual(['You', 'A Friend', 'Someone']);
        expect(rows[1].children[1].textContent).toBe(main.WORDS.personRandom);
        expect(dom.el('mm-captions').children.map((f) => f.children[0].textContent)).toEqual(['Label on You', 'Label on A Friend', 'Label on Someone']);
        // The crowd member is kept for the visit, and a reshuffle changes them.
        // (The stub does not find a built element by id: the rows are walked,
        // the buttons sitting in a row of their own since M8's Customize.)
        const someone = main.avatarForRole('other');
        expect(main.avatarForRole('other')).toBe(someone);
        const wasFigure = state.stage.panels[0].figures[2];
        const reshuffleOf = (row) => row.children.flatMap((c) => [c, ...(c.children || [])]).find((c) => c.id && c.id.startsWith('mm-reshuffle-'));
        fire(reshuffleOf(dom.el('mm-people').children[2]), 'click');
        expect(main.avatarForRole('other')).not.toBe(someone);
        expect(state.stage.panels[0].figures[2]).not.toBe(wasFigure);
        expect(dom.el('mm-people-status').textContent).toBe(main.WORDS.reshuffled);
        // A friend's link, pasted whole or as its fragment.
        const friendRow = () => dom.el('mm-people').children[1];
        const linkInput = () => friendRow().children[2].children[1];
        const useButton = () => friendRow().children[3].children[0];
        expect(linkInput().id).toBe('mm-friend-link');
        expect(useButton().textContent).toBe('Use this link');
        linkInput().value = 'nonsense';
        fire(useButton(), 'click');
        expect(state.friend).toBeNull();
        expect(dom.el('mm-people-status').textContent).toBe(main.WORDS.friendBadLink);
        linkInput().value = 'https://www.scenexp.com/avatar/#a=1.deep.black';
        fire(useButton(), 'click');
        expect(state.friend).toMatchObject({ skin: 'deep' });
        expect(state.stage.panels[0].figures[1].avatar.skin).toBe('deep');
        expect(dom.el('mm-people').children[1].children[1].textContent).toBe(main.WORDS.personFriend);
        expect(dom.el('mm-people-status').textContent).toBe(main.WORDS.friendAdded);
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-meme')).friend.skin).toBe('deep');
        // A friend's file: too large, unreadable, not an avatar, and right.
        expect(await main.useFriendFile(null)).toBe(false);
        expect(await main.useFriendFile({ size: 99999 })).toBe(false);
        expect(dom.el('mm-people-status').textContent).toBe(main.WORDS.friendFileLarge);
        expect(await main.useFriendFile({ size: 10, text: async () => { throw new Error('no'); } })).toBe(false);
        expect(dom.el('mm-people-status').textContent).toBe(main.WORDS.friendFileUnreadable);
        expect(await main.useFriendFile({ size: 10, text: async () => '{"x":1}' })).toBe(false);
        expect(dom.el('mm-people-status').textContent).toBe(main.WORDS.friendNotAvatar);
        const file = { size: 80, text: async () => JSON.stringify({ scenexp: 'avatar', v: 1, avatar: { skin: 'light' } }) };
        expect(await main.useFriendFile(file)).toBe(true);
        expect(state.friend.skin).toBe('light');
        expect(state.stage.panels[0].figures[1].avatar.skin).toBe('light');
        // The file input's change goes the same way.
        dom.el('mm-friend-file').files = [{ size: 80, text: async () => JSON.stringify({ scenexp: 'avatar', v: 1, avatar: { skin: 'medium' } }) }];
        fire(dom.el('mm-friend-file'), 'change', { target: dom.el('mm-friend-file') });
        await flushAsync(10);
        expect(state.friend.skin).toBe('medium');
        // Someone else in the friend's role lets the friend go.
        fire(reshuffleOf(friendRow()), 'click');
        expect(state.friend).toBeNull();
        // A restored meme brings its friend back.
        state.friend = { skin: 'deep' };
        main.showTemplate(state.template, main.currentMeme());
        expect(state.stage.panels[0].figures[1].avatar.skin).toBe('deep');
    });

    // The People tab's rows (the stub does not find a built element by id,
    // so the rows are walked).
    const people = () => dom.el('mm-people').children;
    const all = (el) => [el, ...(el.children || []).flatMap(all)];
    const buttonIn = (row, text) => all(row).find((c) => c.tagName && c.tagName.toLowerCase() === 'button' && c.textContent === text);
    const spaceOf = (row) => row.children.find((c) => c.className === 'mm-customize');

    test('Customize dresses anyone but you with the avatar editor: live on the stage, kept, carried in the link, and given back to the crowd by Someone else (M8)', async () => {
        let main = await boot();
        let { state } = main.__test__;
        main.pickTemplate('headTurn');
        // You have no Customize: the lead is your own avatar, changed on the
        // avatar page.
        expect(buttonIn(people()[0], 'Customize')).toBeUndefined();
        expect(buttonIn(people()[1], 'Customize')).toBeTruthy();
        const open = buttonIn(people()[2], 'Customize');
        expect(buttonIn(people()[2], 'Someone else')).toBeTruthy();
        expect(open.getAttribute('aria-expanded')).toBe('false');
        expect(open.getAttribute('aria-controls')).toBe('mm-customize-other');
        expect(spaceOf(people()[2]).hidden).toBe(true);
        const someone = main.avatarForRole('other');
        fire(open, 'click');
        expect(state.customizing).toBe('other');
        expect(buttonIn(people()[2], 'Customize').getAttribute('aria-expanded')).toBe('true');
        expect(spaceOf(people()[2]).hidden).toBe(false);
        // The stage looks into the panel Someone stands in.
        expect(state.stage.viewing).toBe(0);
        // The whole editor, its ids its own, seeded with whoever stands
        // there; the face the meme sets and the handedness no meme reads
        // are left out, with a line saying so.
        const space = spaceOf(people()[2]);
        const tablist = space.children.find((c) => c.getAttribute && c.getAttribute('role') === 'tablist');
        expect(tablist.children.map((b) => b.textContent)).toEqual(['Face', 'Eyes', 'Hair', 'Build', 'Clothes', 'Layers']);
        expect(tablist.children[0].id).toBe('mm-cz-tab-face');
        expect(tablist.getAttribute('aria-label')).toBe('Choices for Someone');
        expect(space.children[0].textContent).toBe(main.WORDS.customizeNote);
        expect(Object.keys(state.editor.inputs).filter((key) => key === 'mouth' || key === 'handedness')).toEqual([]);
        expect(state.editor.inputs.skin.find((i) => i.checked).value).toBe(someone.skin);
        // A choice dresses them at once, in the panel, and the row says so.
        const was = state.stage.panels[0].figures[2];
        const pick = state.editor.inputs.skin.find((i) => i.value !== someone.skin);
        pick.checked = true;
        fire(pick, 'change');
        expect(main.avatarForRole('other').skin).toBe(pick.value);
        expect(main.avatarForRole('other').shirt).toBe(someone.shirt);
        expect(state.stage.panels[0].figures[2]).not.toBe(was);
        expect(state.stage.panels[0].figures[2].avatar.skin).toBe(pick.value);
        expect(people()[2].children[1].textContent).toBe(main.WORDS.personDressed);
        expect(state.pinged.dressed).toBe(true);
        // The tab chosen stays chosen when the tab is drawn again.
        fire(tablist, 'keydown', { key: 'ArrowRight' });
        expect(state.customizeTab).toBe('eyes');
        // Kept with the meme, and carried in its link.
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-meme')).cast.other.skin).toBe(pick.value);
        const { encodeRemix } = await import('../www/meme/js/remix.js');
        expect(encodeRemix(main.currentMeme())).toContain(`&other=1.${pick.value}.`);
        // Opening the friend's closes Someone's; Done closes it, the stage
        // steps back out, and the focus goes back to the button.
        fire(buttonIn(people()[1], 'Customize'), 'click');
        expect(state.customizing).toBe('friend');
        expect(spaceOf(people()[2]).hidden).toBe(true);
        expect(state.customizeTab).toBeNull();
        fire(buttonIn(people()[1], 'Done'), 'click');
        expect(state.customizing).toBeNull();
        expect(state.stage.viewing).toBeNull();
        expect(buttonIn(people()[1], 'Customize').focused).toBe(true);
        expect(buttonIn(people()[1], 'Customize').getAttribute('aria-expanded')).toBe('false');
        expect(main.closeCustomize()).toBe(false);
        // Customize again closes it; nobody dresses the lead.
        expect(main.toggleCustomize('other')).toBe(true);
        expect(main.toggleCustomize('other')).toBe(false);
        expect(main.toggleCustomize('you')).toBe(false);
        expect(main.dress('you', { skin: 'deep' })).toBe(false);
        // The friend dressed by hand is still the friend.
        expect(main.dress('friend', { ...main.avatarForRole('friend'), skin: 'light' })).toBe(true);
        expect(state.friend.skin).toBe('light');
        expect(people()[1].children[1].textContent).toBe(main.WORDS.personDressed);
        // Another meme keeps them; one without Someone closes the editor.
        main.toggleCustomize('other');
        main.pickTemplate('handshake');
        expect(state.customizing).toBeNull();
        main.pickTemplate('headTurn');
        expect(main.avatarForRole('other').skin).toBe(pick.value);
        // Someone else gives them back to the crowd, the open editor seeded
        // with the stranger who stepped in.
        main.toggleCustomize('other');
        // Pressed from the keyboard: the row is drawn again and the focus
        // lands on the new Someone else, not on the page.
        buttonIn(people()[2], 'Someone else').focus();
        fire(buttonIn(people()[2], 'Someone else'), 'click');
        expect(buttonIn(people()[2], 'Someone else').focused).toBe(true);
        expect(people()[2].children[1].textContent).toBe(main.WORDS.personRandom);
        expect(main.currentMeme().cast).toEqual({});
        expect(state.customizing).toBe('other');
        expect(state.editor.inputs.skin.find((i) => i.checked).value).toBe(main.avatarForRole('other').skin);
        // Dressed again and back another day: there, and said so.
        main.dress('other', { ...main.avatarForRole('other'), skin: 'deep' });
        const kept = JSON.parse(globalThis.localStorage.getItem('scenexp-meme'));
        dom.uninstall();
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        globalThis.localStorage.setItem('scenexp-meme', JSON.stringify(kept));
        jest.resetModules();
        main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        ({ state } = main.__test__);
        expect(state.restored).toBe(true);
        expect(main.avatarForRole('other').skin).toBe('deep');
        expect(people()[2].children[1].textContent).toBe(main.WORDS.personDressed);
        // Start over gives everyone back to the crowd.
        fire(dom.el('mm-start-over'), 'click');
        main.pickTemplate('headTurn');
        expect(main.currentMeme().cast).toEqual({});
        expect(main.currentMeme().friend).toBeNull();
        expect(people()[2].children[1].textContent).toBe(main.WORDS.personRandom);
    });

    test('the editor leaves out what the meme sets for that person: the Handshake\'s build and shirt, the spacesuit (M8)', async () => {
        const main = await boot();
        const { state } = main.__test__;
        main.pickTemplate('handshake');
        expect(main.setByMeme(state.template, 'friend').sort()).toEqual(['build', 'handedness', 'mouth', 'muscles', 'shirt', 'sleeves']);
        main.toggleCustomize('friend');
        // Compared by field name: a failure prints the names, not elements.
        const offered = () => [...Object.keys(state.editor.inputs), ...Object.keys(state.editor.customs)];
        expect(offered().filter((key) => ['build', 'muscles', 'shirt', 'sleeves', 'handedness', 'mouth'].includes(key))).toEqual([]);
        expect(['skin', 'bottom', 'hat'].filter((key) => !offered().includes(key))).toEqual([]);
        // Still open on another meme with a friend, the editor drawn for it.
        main.pickTemplate('alwaysHasBeen');
        expect(state.customizing).toBe('friend');
        expect(offered().filter((key) => ['shirt', 'sleeves', 'bottom', 'bottomColor', 'hat', 'hatColor'].includes(key))).toEqual([]);
        // Gazing at the Earth with the face the avatar has, so its mouth is
        // offered.
        expect(offered()).toContain('mouth');
        // A dressed person in a spacesuit still wears the meme's suit.
        main.dress('friend', { ...main.avatarForRole('friend'), shirt: 'teal', skin: 'deep' });
        expect(state.stage.panels[0].figures[1].avatar.skin).toBe('deep');
        expect(state.stage.panels[0].figures[1].avatar.shirt).toBe('white');
    });

    test('a link\'s people arrive as the maker chose them, said so, and stay through Make it mine (M8)', async () => {
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        globalThis.localStorage.setItem('scenexp-avatar', JSON.stringify({ v: 1, skin: 'fair' }));
        dom.windowStub.location.hash = '#m=1/headTurn/me|them|you/-&a=1.deep.black&friend=1.medium.black&other=1.light.black';
        jest.resetModules();
        const main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        const { state } = main.__test__;
        expect(state.stage.panels[0].figures.map((f) => f.avatar.skin)).toEqual(['deep', 'medium', 'light']);
        expect(people().map((r) => r.children[1].textContent)).toEqual([main.WORDS.personMaker, main.WORDS.personSent, main.WORDS.personSent]);
        // Make it mine: the visitor leads, the maker becomes the friend, and
        // Someone stays as sent, kept and carried on.
        fire(dom.el('mm-make-mine'), 'click');
        expect(state.stage.panels[0].figures.map((f) => f.avatar.skin)).toEqual(['fair', 'deep', 'light']);
        expect(people().map((r) => r.children[1].textContent)).toEqual([main.WORDS.personYou, main.WORDS.personMaker, main.WORDS.personSent]);
        expect(main.currentMeme().cast.other.skin).toBe('light');
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-meme')).cast.other.skin).toBe('light');
        // Dressed by hand after that, they are the visitor's own doing.
        main.dress('other', { ...main.avatarForRole('other'), skin: 'brown' });
        expect(people()[2].children[1].textContent).toBe(main.WORDS.personDressed);
    });

    test('Make it mine keeps both of us when the template has a friend\'s role (D5)', async () => {
        installThree();
        dom = installDom();
        Object.assign(dom.el('mm-canvas'), { clientWidth: 800, clientHeight: 600 });
        globalThis.localStorage.setItem('scenexp-avatar', JSON.stringify({ v: 1, skin: 'fair' }));
        dom.windowStub.location.hash = '#m=1/handshake/me|you|deal/-&a=1.deep.black';
        jest.resetModules();
        const main = await import('../www/meme/js/main.js');
        await flushAsync(30);
        const { state } = main.__test__;
        expect(state.stage.panels[0].figures.map((f) => f.avatar.skin)).toEqual(['deep', expect.any(String)]);
        fire(dom.el('mm-make-mine'), 'click');
        expect(state.friend).toMatchObject({ skin: 'deep' });
        expect(state.friendIsMaker).toBe(true);
        expect(state.stage.panels[0].figures.map((f) => f.avatar.skin)).toEqual(['fair', 'deep']);
        expect(dom.el('mm-people').children[1].children[1].textContent).toBe(main.WORDS.personMaker);
        expect(state.captions).toEqual(['me', 'you', 'deal']);
    });

    test('there is no video at launch: no section, no recorder fetched, and nowhere promises one', () => {
        // Held back by Steve on 2026-10-28 (the clip is whole in commit
        // 21f3068). A HALF-REMOVAL is the failure here: a button wired to
        // nothing, a recorder every phone downloads for a feature that is
        // not there, or a card that still offers a video.
        expect(HTML).not.toMatch(/id="mm-clip/);
        // The preload list is the page's import graph, written by the build.
        expect(HTML).not.toContain('recorder-1.0.0');
        expect(MAIN).not.toMatch(/makeClip|mm-clip/);
        expect(HTML.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/video/i);
        // What the rest of the site says about this page.
        const home = readFileSync('www/index.html', 'utf8');
        const cards = [...home.matchAll(/data-slug="meme"[\s\S]*?<\/li>/g)].map((m) => m[0]);
        expect(cards).toHaveLength(2);     // the Featured slide and the card
        for (const card of cards) expect(card).not.toMatch(/video/i);
        const bullet = readFileSync('www/llms.txt', 'utf8').split('\n').find((l) => l.includes('(https://www.scenexp.com/meme/)'));
        expect(bullet).toBeTruthy();
        expect(bullet).not.toMatch(/video/i);
        const privacy = readFileSync('www/privacy.html', 'utf8').match(/<li><strong>Your last meme in Meme Studio\.[\s\S]*?<\/li>/);
        expect(privacy).not.toBeNull();
        expect(privacy[0]).not.toMatch(/video/i);
    });

    test('every word the page says keeps the house style', async () => {
        const main = await boot();
        for (const w of Object.values(main.WORDS)) {
            expect(w).not.toMatch(/[;—]/);
            expect(w).not.toMatch(/\b(colour|grey|centre|favourite)/i);
        }
    });
});
