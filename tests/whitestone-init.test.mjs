// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Boot-and-drive smoke for Whitestone Home Care, plus the page-level
 * rules no unit test can see: the studio boots behind its loading screen
 * and then draws only when asked, the camera glides between its stations
 * (or cuts under reduced motion), the cleaner's PIN form never accepts less than a PIN, and
 * nothing under either js folder writes markup from strings.
 *
 * Under Node, importing main.js is side-effect-free unless a `document`
 * exists, so this installs the browser stand-ins FIRST and then imports: the
 * module auto-boots the way a real page load does, and setAnimationLoop lands
 * in dom.loops so frames can be stepped by hand.
 *
 * A HEADLESS BOOT IS NOT A WORKING PAGE. These tests say that every function
 * a page load calls actually runs, and nothing about pixels. Steve's
 * screenshot round is the other half.
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { readPin, wire, COPY } from '../www/whitestone/tasks/js/main.js';
import { poseFor } from '../www/whitestone/js/stations.js';

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
    const main = await import('../www/whitestone/js/main.js');
    await flushAsync();
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

// ---- Boot -------------------------------------------------------------------

test('auto-boots through the loading screen into a running loop', async () => {
    const main = await boot();
    const state = main.getState();
    expect(state.running).toBe(true);
    expect(state.loaded).toBe(true);
    expect(dom.el('load-progress').style.width).toBe('100%');
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
    expect(dom.replaced).toHaveLength(0);
    expect(typeof window.whitestone.quality).toBe('function');
    stepFrames(10);
    expect(main.getState().frames).toBeGreaterThan(0);
});

test('without WebGL the page says so and goes to the standard site', async () => {
    dom.windowStub.WebGL2RenderingContext = undefined;
    await import('../www/whitestone/js/main.js');
    await flushAsync();
    jest.advanceTimersByTime(3000);
    expect(dom.replaced).toEqual(['/']);
});

// ---- Frames -----------------------------------------------------------------

test('an idle studio draws no frames, and a change draws exactly one', async () => {
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

test('a hidden tab stops, and comes back running', async () => {
    const main = await boot();
    dom.documentStub.visibilityState = 'hidden';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(false);
    dom.documentStub.visibilityState = 'visible';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(true);
});

test('page hide stops the loop for good', async () => {
    const main = await boot();
    fire(dom.windowStub, 'pagehide');
    expect(main.getState().running).toBe(false);
    dom.documentStub.visibilityState = 'visible';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(false);
});

// ---- Stations ---------------------------------------------------------------

describe('stations', () => {
    test('the studio opens at the overview, composed for the screen', async () => {
        const main = await boot();
        const pose = main.getState().pose;
        expect(main.__test__.ui.station).toBe('overview');
        expect(pose).toEqual(poseFor('overview', window.innerWidth / window.innerHeight, CONFIG));
    });

    test('a glide takes its time, draws every frame on the way, and lands on the station', async () => {
        const main = await boot();
        stepFrames(3);
        const before = main.getState().frames;
        expect(main.__test__.goTo('menu')).toBe(true);
        expect(main.__test__.glide()).not.toBeNull();
        stepFrames(30, 16);
        expect(main.__test__.glide()).not.toBeNull();
        expect(main.getState().frames - before).toBeGreaterThanOrEqual(30);
        stepFrames(Math.ceil((CONFIG.view.glideSeconds * 1000) / 16), 16);
        expect(main.__test__.glide()).toBeNull();
        expect(main.getState().pose).toEqual(poseFor('menu', window.innerWidth / window.innerHeight, CONFIG));
        // Landed, it goes quiet again.
        const landed = main.getState().frames;
        stepFrames(20);
        expect(main.getState().frames).toBe(landed);
    });

    test('under reduced motion it cuts', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.goTo('board');
        stepFrames(1);
        expect(main.__test__.glide()).toBeNull();
        expect(main.getState().pose).toEqual(poseFor('board', window.innerWidth / window.innerHeight, CONFIG));
    });

    test('a station that does not exist goes nowhere', async () => {
        const main = await boot();
        expect(main.__test__.goTo('basement')).toBe(false);
        expect(main.__test__.glide()).toBeNull();
        expect(main.__test__.ui.station).toBe('overview');
    });

    test('a resize recomposes the station for the new screen', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.goTo('model');
        stepFrames(1);
        dom.windowStub.innerWidth = 390;
        dom.windowStub.innerHeight = 844;
        fire(dom.windowStub, 'resize');
        expect(main.getState().pose).toEqual(poseFor('model', 390 / 844, CONFIG));
        expect(main.getState().pose.fov).toBeGreaterThan(CONFIG.stations.model.fov);
    });

    test('the look is held while a card is open', async () => {
        const main = await boot();
        expect(main.__test__.lookLocked()).toBe(false);
        main.__test__.openMine();
        expect(main.__test__.lookLocked()).toBe(true);
    });

    test('the console helper goes to stations too', async () => {
        await boot();
        expect(window.whitestone.stations().all).toContain('printer');
        expect(window.whitestone.goTo('printer')).toBe(true);
        expect(window.whitestone.stations().at).toBe('printer');
    });
});

test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CONFIG)).toBe(true);
    expect(Object.isFrozen(CONFIG.room)).toBe(true);
    expect(Object.isFrozen(CONFIG.stations.overview.eye)).toBe(true);
});

// ---- The cleaner's page -----------------------------------------------------

describe("the cleaner's PIN form", () => {
    test('a PIN is exactly six digits, with the spaces and dashes of a message forgiven', () => {
        expect(readPin('482913')).toBe('482913');
        expect(readPin(' 482 913 ')).toBe('482913');
        expect(readPin('482-913')).toBe('482913');
        expect(readPin('48291')).toBeNull();
        expect(readPin('4829130')).toBeNull();
        expect(readPin('48291a')).toBeNull();
        expect(readPin('')).toBeNull();
        expect(readPin(null)).toBeNull();
        expect(readPin('٤٨٢٩١٣')).toBeNull();   // Arabic-Indic digits are not \d in JavaScript
    });

    function fakePage() {
        const listeners = {};
        const classes = new Set();
        const page = {
            form: { hidden: true, addEventListener: (type, fn) => { listeners[type] = fn; } },
            input: { value: '', focused: 0, focus() { this.focused++; } },
            status: {
                textContent: '',
                classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) }
            },
            classes,
            submit() {
                const event = { prevented: false, preventDefault() { this.prevented = true; } };
                listeners.submit(event);
                return event;
            }
        };
        const ids = { 'pin-form': page.form, 'pin-input': page.input, 'pin-status': page.status };
        page.doc = { getElementById: (id) => ids[id] || null };
        return page;
    }

    test('the form appears only once the script runs, and never submits a page address', () => {
        const page = fakePage();
        expect(wire(page.doc)).toBe(true);
        expect(page.form.hidden).toBe(false);
        page.input.value = '12345';
        expect(page.submit().prevented).toBe(true);
        expect(page.status.textContent).toBe(COPY.incomplete);
        expect(page.classes.has('is-problem')).toBe(true);
        expect(page.input.focused).toBe(1);

        page.input.value = '123 456';
        expect(page.submit().prevented).toBe(true);
        expect(page.status.textContent).toBe(COPY.preview);
        expect(page.classes.has('is-problem')).toBe(false);
    });

    test('a page without the form is left alone', () => {
        expect(wire({ getElementById: () => null })).toBe(false);
    });

    test('the markup ships the form hidden, so it cannot work without the script', () => {
        const html = readFileSync(join(process.cwd(), 'www', 'whitestone', 'tasks', 'index.html'), 'utf8');
        expect(html).toMatch(/<form id="pin-form"[^>]*\bhidden\b/);
        expect(html).not.toMatch(/three(\.webgpu)?\.min\.js/);
    });

    test('the copy keeps house style', () => {
        for (const line of Object.values(COPY)) {
            expect(line).not.toMatch(/—|;/);
        }
    });
});

// ---- Source rules -----------------------------------------------------------

describe('source rules', () => {
    const dirs = [
        join(process.cwd(), 'www', 'whitestone', 'js'),
        join(process.cwd(), 'www', 'whitestone', 'tasks', 'js')
    ];
    const sources = dirs.flatMap((dir) => readdirSync(dir)
        .filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))
        .map((f) => [`${dir.split('www/')[1]}/${f}`, dir, f]));

    test('the sweep has files to sweep', () => {
        expect(sources.map(([rel]) => rel)).toEqual(expect.arrayContaining([
            'whitestone/js/main.js', 'whitestone/js/config.js', 'whitestone/tasks/js/main.js'
        ]));
    });

    test.each(sources)('%s never writes markup from a string', (_rel, dir, file) => {
        // EVERY VISITOR STRING REACHES THE PAGE THROUGH textContent. A
        // checklist carries what customers and cleaners typed.
        const src = readFileSync(join(dir, file), 'utf8');
        expect(src).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/);
    });

    test.each(sources)('%s carries the Whitestone license line', (_rel, dir, file) => {
        const src = readFileSync(join(dir, file), 'utf8');
        expect(src.split('\n')[0]).toBe('// © 2026 Continuum Commerce LLC. All rights reserved.');
    });

    test.each(sources)('%s is built, so the page is not running stale code', (_rel, dir, file) => {
        expect(readdirSync(dir)).toContain(file.replace(/\.js$/, '.min.js'));
    });
});
