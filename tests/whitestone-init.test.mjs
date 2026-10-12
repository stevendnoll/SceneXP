// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Boot-and-drive smoke for Whitestone Home Care at M0, plus the page-level
 * rules no unit test can see: the empty studio boots behind its loading
 * screen and then draws only when asked, the shell is a room with its glass
 * side open, the cleaner's PIN form never accepts less than a PIN, and
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
// Imported here, before any test installs a `document`, so this copy never
// boots. Each boot below imports a fresh copy after jest.resetModules.
import { shellSurfaces } from '../www/whitestone/js/main.js';

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

// ---- The shell (pure) -------------------------------------------------------

describe('the studio shell', () => {
    /** Where a plane's face points: its +z normal turned by the Euler angles
     *  three.js applies (XYZ order). Worked out here rather than read back
     *  from the code, so the test checks the room, not the arithmetic. */
    function normalOf([rx, ry, rz]) {
        let v = [0, 0, 1];
        const rot = (a, i, j) => {
            const c = Math.cos(a);
            const s = Math.sin(a);
            const out = [...v];
            out[i] = v[i] * c - v[j] * s;
            out[j] = v[i] * s + v[j] * c;
            v = out;
        };
        // Matrix XYZ = Rx * Ry * Rz, applied to a vector: z first, then y, then x.
        rot(rz, 0, 1);
        rot(ry, 2, 0);
        rot(rx, 1, 2);
        return v.map((n) => Math.round(n * 1e9) / 1e9);
    }

    const surfaces = shellSurfaces(CONFIG.room);

    test('every surface faces into the room', () => {
        const center = [0, CONFIG.room.height / 2, 0];
        for (const s of surfaces) {
            const n = normalOf(s.rotation);
            const toCenter = center.map((c, i) => c - s.position[i]);
            const facing = n.reduce((sum, x, i) => sum + x * toCenter[i], 0);
            expect(`${s.name} faces in: ${facing > 0}`).toBe(`${s.name} faces in: true`);
        }
    });

    test('the room is closed on every side but the street glass', () => {
        const { width: w, depth: d, height: h } = CONFIG.room;
        const at = (name) => surfaces.find((s) => s.name === name);
        expect(at('floor').position[1]).toBe(0);
        expect(at('ceiling').position[1]).toBe(h);
        expect(at('back').position[2]).toBe(-d / 2);
        expect(at('left').position[0]).toBe(-w / 2);
        expect(at('right').position[0]).toBe(w / 2);
        // Nothing stands on the +z long wall, which becomes the glass in M2.
        expect(surfaces.some((s) => s.position[2] === d / 2)).toBe(false);
        // And each piece spans its whole side.
        expect(at('floor').size).toEqual([w, d]);
        expect(at('back').size).toEqual([w, h]);
        expect(at('left').size).toEqual([d, h]);
    });

    test('the arrival camera stands inside the room, looking at the back wall', () => {
        const { width: w, depth: d, height: h } = CONFIG.room;
        const [x, y, z] = CONFIG.camera.position;
        expect(Math.abs(x)).toBeLessThan(w / 2);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(h);
        expect(Math.abs(z)).toBeLessThan(d / 2);
        expect(CONFIG.camera.lookAt[2]).toBeLessThan(z);
    });
});

test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CONFIG)).toBe(true);
    expect(Object.isFrozen(CONFIG.room)).toBe(true);
    expect(Object.isFrozen(CONFIG.camera.position)).toBe(true);
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
