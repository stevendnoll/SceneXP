// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Boot-and-drive smoke for Whitestone Home Care, plus the page-level
 * rules no unit test can see: the house boots behind its loading screen
 * and then draws only when asked, arrives with a push-in (none under
 * reduced motion), turns under a drag, and frames itself to the screen and
 * the house, the cleaner's PIN form never accepts less than a PIN, and
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

/** Boot, then put the example on the turntable, as Show me an example
 *  does. */
async function bootExample() {
    const main = await boot();
    main.__test__.showExample();
    // The frame eases to the taller house.
    stepFrames(Math.ceil((CONFIG.view.subject.ease * 1000) / 16) + 2);
    return main;
}

/** Long enough for Maya to have greeted, waved and said her line, after
 *  which a page left alone draws nothing (cast.js speakSeconds). */
const SETTLE_MS = (CONFIG.guide.delay + 9 + 1) * 1000;

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

test('a still house draws no frames, and a change draws exactly one', async () => {
    const main = await boot();
    // Past the push-in and Maya's greeting, and touched so it does not drift.
    stepFrames(Math.ceil(SETTLE_MS / 100), 100);
    main.__test__.turntable().touch();
    stepFrames(2);
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

// ---- The turntable ------------------------------------------------------------

describe('the turntable', () => {
    const aspectNow = () => window.innerWidth / window.innerHeight;

    test('the house arrives from farther out, eases in, and goes quiet', async () => {
        const main = await boot();
        const tt = main.__test__.turntable();
        expect(tt.arriving).toBe(true);
        const start = main.getState().pose.distance;
        stepFrames(30);
        expect(main.getState().pose.distance).toBeLessThan(start);
        stepFrames(Math.ceil((CONFIG.view.arrival.seconds * 1000) / 16) + 2);
        expect(tt.arriving).toBe(false);
        expect(main.getState().pose).toEqual(tt.pose(aspectNow()));
        // Once Maya has said her line, nothing more is drawn.
        stepFrames(Math.ceil(SETTLE_MS / 100), 100);
        tt.touch();
        stepFrames(2);
        const landed = main.getState().frames;
        stepFrames(20);
        expect(main.getState().frames).toBe(landed);
    });

    test('under reduced motion there is no push-in', async () => {
        dom.windowStub.matchMedia = (media) => ({ matches: /reduce/.test(media), addEventListener() {}, removeEventListener() {} });
        const main = await boot();
        expect(main.__test__.turntable().arriving).toBe(false);
    });

    test('a drag turns the house and the turntable with it, and a tap is not a drag', async () => {
        const main = await boot();
        main.__test__.turntable().touch();
        stepFrames(2);
        const canvas = dom.el('game-canvas');
        const tt = main.__test__.turntable();
        const yaw = tt.yaw;
        // A drag on the studio around the turntable turns nothing (QA,
        // 2026-10-15). The stub's rays meet nothing, so every press here is
        // on the studio unless the test says it took hold of the turntable.
        fire(canvas, 'pointerdown', { pointerId: 1, clientX: 300, clientY: 300 });
        expect(main.__test__.gesture.grab).toBe(false);
        fire(canvas, 'pointermove', { pointerId: 1, clientX: 340, clientY: 300 });
        fire(canvas, 'pointermove', { pointerId: 1, clientX: 400, clientY: 300 });
        expect(tt.yaw).toBe(yaw);
        fire(canvas, 'pointerup', { pointerId: 1, clientX: 400, clientY: 300 });
        expect(tt.step(1 / 60, { drift: false })).toBe(false);
        // A press on the house or its stone takes hold, and the drag turns it.
        fire(canvas, 'pointerdown', { pointerId: 1, clientX: 300, clientY: 300 });
        main.__test__.gesture.grab = true;
        fire(canvas, 'pointermove', { pointerId: 1, clientX: 340, clientY: 300 });
        fire(canvas, 'pointermove', { pointerId: 1, clientX: 400, clientY: 300 });
        expect(tt.yaw).toBeGreaterThan(yaw);
        stepFrames(1);
        // The turntable is drawn at the house's turn (the stub keeps no
        // rotation, so the turn main.js last set is asked instead).
        expect(main.__test__.drawnYaw()).toBe(tt.yaw);
        const before = main.__test__.model().lifted;
        fire(canvas, 'pointerup', { pointerId: 1, clientX: 400, clientY: 300 });
        // The end of a drag opens nothing.
        expect(main.__test__.model().lifted).toBe(before);
        expect(main.__test__.gesture.pointers.size).toBe(0);
        expect(main.__test__.gesture.grab).toBe(false);
    });

    test('the left and right arrows turn the house; the wheel, + and -, and up and down move nothing (QA, 2026-10-15); never from a field or over a card', async () => {
        const main = await boot();
        const tt = main.__test__.turntable();
        tt.touch();
        const pose = () => JSON.stringify(tt.pose(16 / 10));
        const before = pose();
        let prevented = false;
        fire(dom.el('game-canvas'), 'wheel', { deltaY: 200, cancelable: true, preventDefault() { prevented = true; } });
        // Held back from the page all the same, so a trackpad's pinch never
        // zooms the page itself.
        expect(prevented).toBe(true);
        for (const key of ['+', '-', '=', 'ArrowUp', 'ArrowDown']) {
            expect(main.__test__.lookKey(key)).toBe(false);
            fire(dom.documentStub, 'keydown', { key, target: dom.el('game-canvas'), preventDefault() {} });
        }
        expect(pose()).toBe(before);
        const y = tt.yaw;
        fire(dom.documentStub, 'keydown', { key: 'ArrowRight', target: dom.el('game-canvas'), preventDefault() {} });
        expect(tt.yaw).toBeCloseTo(y + CONFIG.view.turn.key, 12);
        fire(dom.documentStub, 'keydown', { key: 'ArrowRight', target: { tagName: 'INPUT' }, preventDefault() {} });
        expect(tt.yaw).toBeCloseTo(y + CONFIG.view.turn.key, 12);
        main.__test__.openMine();
        fire(dom.documentStub, 'keydown', { key: 'ArrowRight', target: dom.el('game-canvas'), preventDefault() {} });
        expect(tt.yaw).toBeCloseTo(y + CONFIG.view.turn.key, 12);
        expect(main.__test__.lookKey('q')).toBe(false);
    });

    test('a resize reframes for the new screen, a phone with the house above the sheet', async () => {
        const main = await boot();
        main.__test__.turntable().touch();
        dom.windowStub.innerWidth = 390;
        dom.windowStub.innerHeight = 844;
        fire(dom.windowStub, 'resize');
        expect(main.getState().pose).toEqual(main.__test__.turntable().pose(390 / 844));
        expect(main.getState().pose.offset).toEqual(CONFIG.view.tall.shift);
    });

    test('the look is held while a card is open', async () => {
        const main = await boot();
        expect(main.__test__.lookLocked()).toBe(false);
        main.__test__.openMine();
        expect(main.__test__.lookLocked()).toBe(true);
        // A drag over a card turns nothing.
        const tt = main.__test__.turntable();
        const yaw = tt.yaw;
        fire(dom.el('game-canvas'), 'pointerdown', { pointerId: 1, clientX: 300, clientY: 300 });
        main.__test__.gesture.grab = true;
        fire(dom.el('game-canvas'), 'pointermove', { pointerId: 1, clientX: 400, clientY: 300 });
        expect(tt.yaw).toBe(yaw);
    });

    test('the console helper turns the house and says how it is turned', async () => {
        const main = await boot();
        const yaw = window.whitestone.look().yaw;
        expect(window.whitestone.turn(0.5)).toBeCloseTo(yaw + 0.5, 12);
        expect(window.whitestone.look()).toEqual({ yaw: yaw + 0.5, tilt: main.__test__.turntable().tilt, near: 0 });
    });
});

// ---- The house model ---------------------------------------------------------------

describe('the model', () => {
    test('a first visit shows a plain one-story house, and the example when asked, framed to its height', async () => {
        const main = await boot();
        const model = main.__test__.model();
        expect(model.placed.slabs.length).toBe(1);
        expect(model.placed.tiles.length).toBe(0);
        expect(main.__test__.active()).toBeNull();
        const plain = model.height;
        main.__test__.showExample();
        expect(model.placed.tiles.length).toBe(13);
        expect(model.placed.markers.length).toBe(27);
        stepFrames(Math.ceil((CONFIG.view.subject.ease * 1000) / 16) + 2);
        expect(main.__test__.turntable().height).toBeCloseTo(model.height, 12);
        expect(model.height).toBeGreaterThan(plain);
        // Looked at, not kept: nothing is saved for a look at the example.
        expect(localStorage.getItem(CONFIG.storage.key)).toBeNull();
    });

    test("whatever is shiny mirrors the stage: the turntable's stone and the model's", async () => {
        const main = await boot();
        const shiny = main.__test__.reflective();
        expect(shiny).toEqual(expect.arrayContaining(main.__test__.model().shiny));
        expect(shiny).toEqual(expect.arrayContaining(main.__test__.stage().shiny));
        expect(shiny.length).toBe(main.__test__.model().shiny.length + main.__test__.stage().shiny.length);
    });

    test('clearing the example leaves one empty floor, and the frame eases down to it', async () => {
        const main = await bootExample();
        const tall = main.__test__.turntable().height;
        main.__test__.clearExample();
        expect(main.__test__.model().placed.tiles.length).toBe(0);
        expect(main.__test__.model().placed.slabs.length).toBe(1);
        stepFrames(Math.ceil((CONFIG.view.subject.ease * 1000) / 16) + 2);
        expect(main.__test__.turntable().height).toBeLessThan(tall);
        expect(main.__test__.turntable().height).toBeCloseTo(main.__test__.model().height, 12);
    });

    test('opening a floor says so, turns its open front to the visitor, and names its rooms over them', async () => {
        const main = await bootExample();
        const tt = main.__test__.turntable();
        expect(main.__test__.liftLevel('second')).toBe(true);
        jest.advanceTimersByTime(40);   // announce speaks a beat later
        expect(dom.el('ws-live').textContent).toBe('Opened the second floor of the house.');
        stepFrames(Math.ceil((Math.max(CONFIG.view.turn.face, CONFIG.view.arrival.seconds) * 1000) / 16) + 5);
        expect(Math.abs(tt.yaw % (Math.PI * 2))).toBeLessThan(1e-9);
        expect(tt.tilt).toBeLessThanOrEqual(CONFIG.view.tilt.open + 1e-12);
        const list = dom.el('ws-rooms');
        expect(list.hidden).toBe(false);
        expect(list.getAttribute('aria-label')).toBe('Rooms of the second floor');
        const names = list.children.map((li) => li.textContent).sort();
        expect(names).toEqual(["Emma's room", 'Guest room', 'Hall bath', "Noah's room", 'Primary bathroom', 'Primary bedroom']);
        expect(list.children.every((li) => /^translate\(/.test(li.style.transform))).toBe(true);
        // A card over the house hides them, and closing it brings them back.
        main.__test__.openMine();
        stepFrames(2);
        expect(list.hidden).toBe(true);
        // The page's own instance: main.js imports the built cards module.
        const { closeCard } = await import('../www/whitestone/js/cards.min.js');
        closeCard('my-checklists');
        stepFrames(2);
        expect(list.hidden).toBe(false);
        // The frame stepped back to hold the lifted floors too.
        const model = main.__test__.model();
        expect(tt.height).toBeCloseTo(model.height + CONFIG.model.lift.open * model.scale, 9);
        // Closed: the names go.
        main.__test__.liftLevel(null);
        jest.advanceTimersByTime(40);
        expect(dom.el('ws-live').textContent).toBe('The house is back together.');
        stepFrames(Math.ceil((Math.max(CONFIG.model.lift.seconds, CONFIG.view.subject.ease) * 1000) / 16) + 2);
        expect(list.hidden).toBe(true);
        expect(list.children).toHaveLength(0);
        expect(tt.height).toBeCloseTo(model.height, 9);
    });

    test('the house never drifts while a floor is open', async () => {
        const main = await boot();
        main.__test__.state.reducedMotion = true;
        main.__test__.liftLevel('main');
        stepFrames(2);
        main.__test__.state.reducedMotion = false;
        const yaw = main.__test__.turntable().yaw;
        stepFrames(Math.ceil(((CONFIG.view.idle.after + 2) * 1000) / 100), 100);
        expect(main.__test__.turntable().yaw).toBe(yaw);
        main.__test__.liftLevel(null);
        stepFrames(Math.ceil(((CONFIG.view.idle.after + 2) * 1000) / 100), 100);
        expect(main.__test__.turntable().yaw).toBeGreaterThan(yaw);
    });

    test('a lift draws every frame while it moves, then goes quiet', async () => {
        const main = await boot();
        stepFrames(Math.ceil(SETTLE_MS / 100), 100);
        main.__test__.state.reducedMotion = true;
        main.__test__.turntable().touch();
        main.__test__.liftLevel('main');
        stepFrames(2);
        main.__test__.liftLevel(null);
        stepFrames(2);
        main.__test__.state.reducedMotion = false;
        const before = main.getState().frames;
        main.__test__.liftLevel('main');
        const frames = Math.ceil((CONFIG.model.lift.seconds * 1000) / 16);
        stepFrames(frames);
        expect(main.getState().frames - before).toBeGreaterThanOrEqual(frames - 1);
        expect(main.__test__.model().moving).toBe(false);
        stepFrames(Math.ceil((CONFIG.view.turn.face * 1000) / 16) + 2);
        const landed = main.getState().frames;
        stepFrames(20);
        expect(main.getState().frames).toBe(landed);
    });

    test('under reduced motion the lift is instant, and a level the home lacks is refused', async () => {
        const main = await bootExample();
        main.__test__.state.reducedMotion = true;
        main.__test__.liftLevel('basement');
        expect(main.__test__.model().moving).toBe(false);
        expect(main.__test__.model().lifted).toBe('basement');
        expect(main.__test__.liftLevel('attic')).toBe(false);
        expect(window.whitestone.lift('main')).toBe(true);
    });
});

test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CONFIG)).toBe(true);
    expect(Object.isFrozen(CONFIG.stage.turntable)).toBe(true);
    expect(Object.isFrozen(CONFIG.view.wide.shift)).toBe(true);
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
