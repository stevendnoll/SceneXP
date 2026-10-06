// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the leaf lab (www/leaves), M0 of the leaf blower
 * scene.
 *
 * Under the chainable THREE proxy nothing renders, but every line of a real
 * page load runs: the proof of work, the yard, the leaves and their mesh, the
 * person with the blower, the welcome card, steering by pointer and by keys,
 * the blower running, Escape and the help button, the lab panel, and the 2D
 * fallback. A missing import or a reference left behind by a refactor fails
 * here instead of on the site. The leaves themselves are measured for real in
 * tests/leaves-sim.test.mjs.
 *
 * The stub's address has no hostname, which counts as a QA host, so the lab
 * reads `?leaves=` from it: every boot here asks for a small yard, since
 * Jest's sandbox runs the scatter's math many times slower than a browser.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

const PAGE = new URL('../www/leaves/index.html', import.meta.url);

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
    installThree();
    dom = installDom({ innerWidth: 390, innerHeight: 844 });
    dom.windowStub.location.search = '?leaves=600';
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    dom.uninstall();
});

/** Boot the page and let the loading screen step aside. */
async function boot() {
    const main = await import('../www/leaves/js/main.js');
    await flushAsync(30);
    await jest.advanceTimersByTimeAsync(500);
    return main;
}

/** Step the captured animation loop through `seconds` of frames. */
function frames(main, seconds, fps = 60) {
    const loop = dom.loops[dom.loops.length - 1];
    const start = main.getState().lastTime;
    const spy = jest.spyOn(performance, 'now');
    for (let i = 1; i <= Math.round(seconds * fps); i++) {
        spy.mockReturnValue(start + (i * 1000) / fps);
        loop();
    }
    spy.mockRestore();
}

test('it boots with the lab\'s leaf count and hands the renderer its loop', async () => {
    const main = await boot();
    const state = main.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.isRunning).toBe(true);
    expect(state.count).toBe(600);
    expect(state.qa).toBe(true);
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
    expect(dom.loops.length).toBeGreaterThan(0);
    expect(() => frames(main, 0.5)).not.toThrow();
    // Nobody has touched the yard, so nothing is moving.
    expect(main.getState().active).toBe(0);
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
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
    fire(dom.el('help-btn'), 'click');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
});

test('a finger on the lawn runs the blower, and only once the welcome card is out of the way', async () => {
    const main = await boot();
    const canvas = dom.el('game-canvas');
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 500 });
    expect(main.getState().blowing).toBe(false);
    expect(main.__test__.pointer.id).toBe(null);

    fire(dom.el('blocker'), 'click');
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 500 });
    expect(main.getState().blowing).toBe(true);
    expect(main.getState().blows).toBe(1);
    // A second finger does not take the blower from the first.
    fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(main.__test__.pointer.id).toBe(1);
    expect(() => frames(main, 0.5)).not.toThrow();
    fire(canvas, 'pointerup', { pointerId: 1 });
    expect(main.getState().blowing).toBe(false);
});

test('the keys walk the person and Space runs the blower, never while the welcome card is up', async () => {
    const main = await boot();
    const start = main.getState().operator;
    fire(dom.documentStub, 'keydown', { code: 'KeyD' });
    expect(main.__test__.keys.right).toBe(false);

    fire(dom.el('blocker'), 'click');
    const down = fire(dom.documentStub, 'keydown', { code: 'KeyD' });
    expect(down.defaultPrevented).toBe(true);
    frames(main, 1);
    expect(main.getState().operator.x).toBeGreaterThan(start.x + 1);
    expect(main.getState().steer).toBe('keys');
    fire(dom.documentStub, 'keyup', { code: 'KeyD' });

    fire(dom.documentStub, 'keydown', { code: 'Space' });
    expect(main.getState().blowing).toBe(true);
    frames(main, 0.5);
    fire(dom.documentStub, 'keyup', { code: 'Space' });
    expect(main.getState().blowing).toBe(false);

    // Escape lets go of everything held.
    fire(dom.documentStub, 'keydown', { code: 'ArrowUp' });
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(main.__test__.keys.up).toBe(false);
});

test('Space on the welcome card steps in rather than blowing', async () => {
    const main = await boot();
    fire(dom.documentStub, 'keydown', { code: 'Space' });
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
    expect(main.getState().blowing).toBe(false);
});

test('the aim follows the keys or the pointer, whichever moved last', async () => {
    const main = await import('../www/leaves/js/main.js');
    const held = { left: false, right: true, up: true, down: false };
    expect(main.aimFor('keys', { aim: null }, held)).toEqual({ mode: 'keys', x: 1, z: -1 });
    expect(main.aimFor('point', { aim: { x: 2, z: 3 } }, held)).toEqual({ mode: 'point', x: 2, z: 3 });
    expect(main.aimFor('point', { aim: null }, held)).toBe(null);
});

test('on a QA host the lab panel offers each leaf count and the shadows switch', async () => {
    await boot();
    const panel = dom.el('lab-panel');
    // The panel is built by script, so find it among the body's children.
    const built = dom.documentStub.body.children.find((c) => c.className === 'lab-panel');
    expect(built).toBeTruthy();
    const row = built.children.find((c) => c.className === 'lab-buttons');
    const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
    expect(row.children).toHaveLength(C.leaves.labCounts.length + 1);
    fire(row.children[2], 'click');
    expect(dom.windowStub.location.search).toBe(`?leaves=${C.leaves.labCounts[2]}`);
    expect(panel).toBeTruthy();
});

test('a browser without WebGL 2 is told so and taken to the standard site', async () => {
    delete dom.windowStub.WebGL2RenderingContext;
    await import('../www/leaves/js/main.js');
    await flushAsync();
    expect(dom.el('load-status').textContent).toMatch(/can't run the 3D view/);
    await jest.advanceTimersByTimeAsync(3000);
    expect(dom.replaced).toEqual(['/']);
});

describe('the page', () => {
    let html;
    beforeAll(async () => { html = await readFile(PAGE, 'utf8'); });

    test('names itself, and stays out of search until it is released', () => {
        expect(html).toContain('<title>Leaves | SceneXP</title>');
        expect(html).toContain('<link rel="canonical" href="https://www.scenexp.com/leaves/">');
        expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    });

    test('carries the welcome card and a no-JavaScript fallback', () => {
        expect(html).toContain('id="blocker"');
        expect(html).toMatch(/<noscript>\s*<div class="noscript-fallback">/);
    });
});
