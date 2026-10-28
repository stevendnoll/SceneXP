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
import { readFileSync } from 'node:fs';
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

    test('the page is being built: out of search, with the words and the next step already there', () => {
        const page = HTML.replace(/<!--[\s\S]*?-->/g, '');
        expect(page).toMatch(/<meta name="robots" content="noindex, nofollow">/);
        expect(page).toMatch(/<title>Meme Studio \| SceneXP<\/title>/);
        // Words before scenery: the heading and the one next step are in the
        // markup, so they show before the stage has drawn anything.
        expect(page).toMatch(/<h2 id="mm-heading"[^>]*>Put yourself in the meme<\/h2>/);
        expect(page).toMatch(/id="mm-lede"[^>]*>Your avatar is already standing in the first one\./);
        expect(page).toContain('href="/avatar/"');
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
        // The picker: six templates in order, the first pressed.
        const picks = dom.el('mm-picker').children;
        expect(picks.map((b) => b.dataset.template)).toEqual(['surprised', 'panic', 'nopeYep', 'thenNow', 'galaxyBrain', 'plan']);
        expect(picks.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
        expect(picks[1].children[0].textContent).toBe('Panic / Calm / Panic');
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
        expect(dom.el('mm-picker').children.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false']);
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
        expect(await main.__test__.savePicture()).toBe('saved');
        expect(saves[0].download).toBe('scenexp-meme-surprised-1080x1080.png');
        expect(dom.el('mm-status').textContent).toBe(main.WORDS.pictureSaved);
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
        expect(dom.el('mm-picker').children).toHaveLength(6);
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

    test('every word the page says keeps the house style', async () => {
        const main = await boot();
        for (const w of Object.values(main.WORDS)) {
            expect(w).not.toMatch(/[;—]/);
            expect(w).not.toMatch(/\b(colour|grey|centre|favourite)/i);
        }
    });
});
