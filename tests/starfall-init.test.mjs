// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for Starfall (www/starfall), SceneXP's first scene on the
 * WebGPU renderer.
 *
 * Under the chainable THREE proxy nothing renders and no TSL graph is built
 * for real (tests/starfall-galaxy.test.mjs does that against the real
 * bundle), but every line of a real page load runs: the proof of work, the
 * renderer starting, the galaxy, the welcome card, turning the view by drag
 * and by the arrow keys, Escape and the help button, and the 2D fallback. A missing import or a
 * reference left behind by a refactor fails here instead of on the site.
 *
 * The suite runs in a mobile-sized window so the galaxy is built at the
 * phone count: Jest's sandbox runs the layout's math many times slower than
 * a browser, and the shape is measured in the galaxy suite anyway.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

const PAGE = new URL('../www/starfall/index.html', import.meta.url);

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
    installThree();
    dom = installDom({ innerWidth: 390, innerHeight: 844 });
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    dom.uninstall();
});

/** Boot the page and let the loading screen step aside. */
async function boot() {
    const main = await import('../www/starfall/js/main.js');
    await flushAsync(30);
    await jest.advanceTimersByTimeAsync(500);
    return main;
}

/** Step the captured animation loop through `seconds` of frames. */
function frames(main, seconds, fps = 60) {
    const loop = dom.loops[dom.loops.length - 1];
    // Carry on from the scene's own last frame, so a second call never hands
    // it a clock that runs backwards.
    const start = main.getState().lastTime;
    const spy = jest.spyOn(performance, 'now');
    for (let i = 1; i <= Math.round(seconds * fps); i++) {
        spy.mockReturnValue(start + (i * 1000) / fps);
        loop();
    }
    spy.mockRestore();
}

test('it boots, says what is drawing, and hands the renderer its loop', async () => {
    const main = await boot();
    const state = main.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.isRunning).toBe(true);
    expect(state.backend).toBe('webgpu');
    expect(state.starCount).toBe(main.starCountFor('webgpu', true));
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
    expect(dom.el('renderer-note').textContent).toMatch(/^Drawn live with WebGPU\./);
    expect(dom.el('renderer-note').textContent).toContain(main.formatCount(state.starCount));
    expect(dom.loops.length).toBeGreaterThan(0);
    expect(() => frames(main, 0.5)).not.toThrow();
});

test('the welcome card steps aside on a click and brings the help button with it', async () => {
    await boot();
    expect(dom.el('help-btn').classList.contains('visible')).toBe(false);
    fire(dom.el('blocker'), 'click');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
    expect(dom.el('help-btn').classList.contains('visible')).toBe(true);
});

test('Escape and the help button bring the welcome card back, and Escape steps back in', async () => {
    await boot();
    fire(dom.el('blocker'), 'click');
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
    expect(dom.el('help-btn').classList.contains('visible')).toBe(false);
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
    fire(dom.el('help-btn'), 'click');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
});

test('a drag turns the view, and only once the welcome card is out of the way', async () => {
    const main = await boot();
    const { STARFALL_CONFIG: C } = await import('../www/starfall/js/config.js');
    const canvas = dom.el('game-canvas');
    const at = () => main.getState();

    fire(canvas, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    expect(at().turns).toBe(0);
    expect(main.__test__.drag.pointerId).toBe(null);

    fire(dom.el('blocker'), 'click');
    const before = at();
    fire(canvas, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    expect(at().turns).toBe(1);
    // A second finger does not take the turn away from the first.
    fire(canvas, 'pointerdown', { pointerId: 2, clientX: 10, clientY: 10 });
    expect(main.__test__.drag.pointerId).toBe(1);
    fire(canvas, 'pointermove', { pointerId: 2, clientX: 300, clientY: 300 });
    expect(at().azimuth).toBe(before.azimuth);
    fire(canvas, 'pointermove', { pointerId: 1, clientX: 250, clientY: 380 });
    expect(at().azimuth).toBeCloseTo(before.azimuth - 50 * C.view.dragSpeed, 9);
    expect(at().elevation).toBeCloseTo(before.elevation - 20 * C.view.dragSpeed, 9);
    // While the drag is held, the view stays where the finger put it.
    const held = at().azimuth;
    frames(main, 1);
    expect(at().azimuth).toBe(held);
    fire(canvas, 'pointerup', { pointerId: 1 });
    expect(main.__test__.drag.pointerId).toBe(null);
});

test('a flick keeps turning after the finger lifts, then comes to rest', async () => {
    const main = await boot();
    fire(dom.el('blocker'), 'click');
    const canvas = dom.el('game-canvas');
    const t0 = performance.now();
    fire(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 400 });
    main.__test__.moveDrag(140, 400, t0 + 16);
    main.__test__.moveDrag(180, 400, t0 + 32);
    fire(canvas, 'pointerup', { pointerId: 1 });
    const released = main.getState().azimuth;
    frames(main, 0.5);
    const glided = main.getState().azimuth;
    expect(glided).toBeLessThan(released - 0.05);
    frames(main, 4);
    const rested = main.getState().azimuth;
    frames(main, 1);
    // At rest, only the slow drift moves it.
    expect(Math.abs(main.getState().azimuth - rested)).toBeLessThan(0.02);
});

test('the arrow keys turn the view while held, and never while the welcome card is up', async () => {
    const main = await boot();
    const { STARFALL_CONFIG: C } = await import('../www/starfall/js/config.js');
    fire(dom.documentStub, 'keydown', { code: 'ArrowLeft' });
    expect(main.__test__.keys.left).toBe(false);

    fire(dom.el('blocker'), 'click');
    const before = main.getState();
    const down = fire(dom.documentStub, 'keydown', { code: 'ArrowLeft' });
    expect(down.defaultPrevented).toBe(true);   // the page does not scroll
    frames(main, 1);
    expect(main.getState().azimuth).toBeGreaterThan(before.azimuth + C.view.keySpeed * 0.9);
    fire(dom.documentStub, 'keyup', { code: 'ArrowLeft' });
    expect(main.__test__.keys.left).toBe(false);

    fire(dom.documentStub, 'keydown', { code: 'ArrowUp' });
    frames(main, 10);
    expect(main.getState().elevation).toBe(C.view.elevationMax);
    // Escape lets go of a held key along with the view.
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(main.__test__.keys.up).toBe(false);
    expect(main.getState().turns).toBe(2);
});

test('the star count follows what is drawing it', async () => {
    const main = await import('../www/starfall/js/main.js');
    const { STARFALL_CONFIG: C } = await import('../www/starfall/js/config.js');
    expect(main.starCountFor('webgpu', false)).toBe(C.stars.webgpu);
    expect(main.starCountFor('webgpu', true)).toBe(C.stars.webgpuMobile);
    expect(main.starCountFor('webgl', false)).toBe(C.stars.webgl);
    expect(main.starCountFor('webgl', true)).toBe(C.stars.webglMobile);
    expect(main.rendererNote('webgl', 120000)).toMatch(/WebGL 2, since this browser has no WebGPU yet\. All 120,000 stars/);
    expect(main.formatCount(320000)).toBe('320,000');
});

test('WebGPU alone is enough to start, without WebGL 2', async () => {
    delete dom.windowStub.WebGL2RenderingContext;
    globalThis.navigator.gpu = {};
    const main = await boot();
    expect(main.__test__.canDraw()).toBe(true);
    expect(dom.replaced).toEqual([]);
});

test('a browser with neither WebGPU nor WebGL 2 is told so and taken to the standard site', async () => {
    delete dom.windowStub.WebGL2RenderingContext;
    await import('../www/starfall/js/main.js');
    await flushAsync();
    expect(dom.el('load-status').textContent).toMatch(/can't run the 3D view/);
    await jest.advanceTimersByTimeAsync(3000);
    expect(dom.replaced).toEqual(['/']);
});

describe('the page', () => {
    let html;
    beforeAll(async () => { html = await readFile(PAGE, 'utf8'); });

    test('names itself, and stays out of search until it is released', () => {
        expect(html).toContain('<title>Starfall</title>');
        expect(html).toContain('<link rel="canonical" href="https://www.scenexp.com/starfall/">');
        expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    });

    test('carries the welcome card, the renderer note and a no-JavaScript fallback', () => {
        expect(html).toContain('id="blocker"');
        expect(html).toContain('id="renderer-note"');
        expect(html).toMatch(/<noscript>\s*<div class="noscript-fallback">/);
    });

    test('the copy keeps the house style: no em dashes and no semicolons in what visitors read', () => {
        const visible = html
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<script[\s\S]*?<\/script>/g, '')
            .replace(/<head>[\s\S]*?<\/head>/, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/g, ' ');
        expect(visible).not.toMatch(/—/);
        expect(visible).not.toMatch(/;/);
    });
});
