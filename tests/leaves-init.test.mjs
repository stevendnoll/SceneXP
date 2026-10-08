// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the leaf lab (www/leaves), M0 of the leaf blower
 * scene.
 *
 * Under the chainable THREE proxy nothing renders, but every line of a real
 * page load runs: the proof of work, the yard, the leaves and their mesh, the
 * person with the blower, the welcome card, steering by pointer and by keys,
 * the blower running, Escape and the help button, the address options, and the 2D
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
const { LEAVES_CONFIG: C0 } = await import('../www/leaves/js/config.js');

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
    // A fixed day outside the Halloween season (M6): the decorations and the
    // trick-or-treaters follow the visitor's calendar, so a suite run on the
    // real date would change with the time of year. Tests of the season set
    // their own day.
    jest.setSystemTime(new Date(2026, 8, 15, 12));
    installThree();
    dom = installDom({ innerWidth: 390, innerHeight: 844 });
    dom.windowStub.location.search = '?leaves=600';
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    dom.uninstall();
});

// THE ROUND IS FIVE MINUTES (2026-10-08), far too long to play through in
// the sandbox, so suites that play one to its end ask for the lab's short
// clock (?clock=, a QA host's address), as Steve can to try the finish.
const SHORT = 20;
// A test that plays a whole round, a dive or a clear lawn through, frame by
// frame, gets this long rather than Jest's five seconds: a busy machine, or
// coverage's instrumentation, can take twice as long as a quiet run.
const LONG = 20000;

/** Boot the page and let the loading screen step aside. `clock` asks for a
 *  round that many seconds long. */
async function boot({ clock = null } = {}) {
    if (clock) dom.windowStub.location.search += `&clock=${clock}`;
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

// STEVE'S QA, 2026-10-08: "The initial Welcome card screen is not
// responsive - I can't scroll vertically." The card scrolls (experience.css),
// and a finger that scrolls it must not step in when it lifts.
test('a finger scrolling the welcome card does not step in, and a tap still does', async () => {
    const main = await boot();
    const blocker = dom.el('blocker');
    fire(blocker, 'touchstart', { touches: [{ clientX: 200, clientY: 600 }] });
    fire(blocker, 'touchmove', { touches: [{ clientX: 202, clientY: 520 }] });
    fire(blocker, 'touchend', { touches: [] });
    expect(blocker.classList.contains('hidden')).toBe(false);
    // A tap, a few pixels of wobble at most.
    fire(blocker, 'touchstart', { touches: [{ clientX: 200, clientY: 600 }] });
    fire(blocker, 'touchmove', { touches: [{ clientX: 203, clientY: 604 }] });
    const lift = fire(blocker, 'touchend', { touches: [], cancelable: true });
    expect(lift.defaultPrevented).toBe(true);
    expect(blocker.classList.contains('hidden')).toBe(true);
    expect(main.isTap({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(true);
    expect(main.isTap({ x: 0, y: 0 }, { x: 0, y: 11 })).toBe(false);
});

test('the welcome card scrolls when it is taller than the screen, and centers when it fits', async () => {
    const css = await readFile(new URL('../www/leaves/css/experience.css', import.meta.url), 'utf8');
    const rule = (sel) => (css.match(new RegExp(`${sel.replace(/[#]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
    expect(rule('#blocker')).toMatch(/overflow-y:\s*auto/);
    expect(rule('#blocker')).toMatch(/align-items:\s*flex-start/);
    expect(rule('#blocker')).toMatch(/touch-action:\s*pan-y/);
    expect(rule('#blocker #instructions')).toMatch(/margin:\s*auto 0/);
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

test('a mouse pressed on the lawn runs the blower, and only once the welcome card is out of the way', async () => {
    const main = await boot();
    const canvas = dom.el('game-canvas');
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 500 });
    expect(main.getState().blowing).toBe(false);
    expect(main.__test__.pointer.id).toBe(null);

    fire(dom.el('blocker'), 'click');
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 500 });
    expect(main.getState().blowing).toBe(true);
    expect(main.getState().blows).toBe(1);
    expect(() => frames(main, 0.5)).not.toThrow();
    fire(canvas, 'pointerup', { pointerId: 1 });
    expect(main.getState().blowing).toBe(false);
});

// STEVE'S PHONE QA, 2026-10-06: a finger on the lawn both walked and blew,
// so a visitor could not move without scattering the leaves they meant to
// reach. A finger now only steers, and the blow button blows.
test('on a touch screen a finger walks without blowing, and the blow button blows', async () => {
    const main = await boot();
    const canvas = dom.el('game-canvas');
    const btn = dom.el('blow-btn');
    fire(dom.el('blocker'), 'click');
    // The suite's window is phone-sized, so the button is up from the start.
    expect(btn.classList.contains('visible')).toBe(true);

    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 500 });
    expect(main.__test__.pointer.id).toBe(1);
    expect(main.getState().blowing).toBe(false);
    expect(main.getState().blows).toBe(0);
    // A thumb on the blow button runs the blower while the finger steers.
    fire(btn, 'pointerdown', { pointerId: 3, pointerType: 'touch' });
    expect(main.getState().blowing).toBe(true);
    expect(btn.classList.contains('held')).toBe(true);
    expect(main.getState().blows).toBe(1);
    expect(() => frames(main, 0.5)).not.toThrow();
    // Lifting the steering finger leaves the blower running.
    fire(canvas, 'pointerup', { pointerId: 1 });
    expect(main.getState().blowing).toBe(true);
    // Another finger's lift is not this one's.
    fire(btn, 'pointerup', { pointerId: 9 });
    expect(main.getState().blowing).toBe(true);
    fire(btn, 'pointercancel', { pointerId: 3 });
    expect(main.getState().blowing).toBe(false);
    expect(btn.classList.contains('held')).toBe(false);

    // The welcome card takes the button away, and lets go of a held one.
    fire(btn, 'pointerdown', { pointerId: 4, pointerType: 'touch' });
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(btn.classList.contains('visible')).toBe(false);
    expect(main.getState().blowing).toBe(false);
});

test('the blow button answers a held Space or Enter, for anybody who tabs to it', async () => {
    const main = await boot();
    const btn = dom.el('blow-btn');
    fire(dom.el('blocker'), 'click');
    const down = fire(btn, 'keydown', { code: 'Enter', target: btn });
    expect(down.defaultPrevented).toBe(true);
    expect(main.getState().blowing).toBe(true);
    fire(btn, 'keyup', { code: 'Enter', target: btn });
    expect(main.getState().blowing).toBe(false);
    // Holding it down repeats the key, and that is still one blow.
    fire(btn, 'keydown', { code: 'Space', target: btn });
    fire(btn, 'keydown', { code: 'Space', target: btn, repeat: true });
    expect(main.getState().blows).toBe(2);
    fire(btn, 'keyup', { code: 'Space', target: btn });
    expect(main.getState().blowing).toBe(false);
});

test('a desktop screen shows no blow button until a finger touches the lawn', async () => {
    dom.uninstall();
    installThree();
    dom = installDom({ innerWidth: 1280, innerHeight: 800 });
    dom.windowStub.location.search = '?leaves=600';
    const main = await boot();
    fire(dom.el('blocker'), 'click');
    expect(dom.el('blow-btn').classList.contains('visible')).toBe(false);
    fire(dom.el('game-canvas'), 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 500 });
    expect(dom.el('blow-btn').classList.contains('visible')).toBe(true);
    expect(main.getState().blowing).toBe(false);
});

test('the blower runs for a pressed mouse, Space or the button, and never behind the welcome card', async () => {
    const main = await import('../www/leaves/js/main.js');
    const idle = { down: false, blows: false };
    const none = { id: null, key: false };
    expect(main.isBlowing(true, idle, { blow: false }, none)).toBe(false);
    expect(main.isBlowing(true, { down: true, blows: false }, { blow: false }, none)).toBe(false);
    expect(main.isBlowing(true, { down: true, blows: true }, { blow: false }, none)).toBe(true);
    expect(main.isBlowing(true, idle, { blow: true }, none)).toBe(true);
    expect(main.isBlowing(true, idle, { blow: false }, { id: 5, key: false })).toBe(true);
    expect(main.isBlowing(true, idle, { blow: false }, { id: null, key: true })).toBe(true);
    expect(main.isBlowing(false, { down: true, blows: true }, { blow: true }, { id: 5, key: true })).toBe(false);
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

// STEVE'S M6 QA: with the neighbor out he could not walk to the hedge. The
// zoomed out lawn sits higher on the screen, and a cursor crossing the lab's
// panel (or any button) left the lawn, which dropped the aim and stopped the
// person dead. Now the person still goes where it last pointed.
test('a mouse leaving the lawn stops steering from the screen, but the person still goes where it pointed', async () => {
    const main = await boot();
    const canvas = dom.el('game-canvas');
    fire(dom.el('blocker'), 'click');
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 600 });
    expect(main.__test__.pointer.client).toEqual({ x: 100, y: 600 });
    // The stub's camera meets no ground (tests/leaves-view does that on the
    // real three.js), so the spot it pointed at is set here.
    const aim = { x: -6, z: 2 };
    main.__test__.pointer.aim = { ...aim };
    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'mouse' });
    expect(main.getState().aim).toEqual(aim);
    expect(main.__test__.pointer.client).toBe(null);
    // A finger lifted still leaves nothing to steer by.
    fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 600 });
    fire(canvas, 'pointerup', { pointerId: 2 });
    expect(main.getState().aim).toBe(null);
});

// STEVE'S QA, 2026-10-08: "Could we add zoom support so the user can zoom in
// and out while playing?" The framing itself is measured on the real
// three.js in tests/leaves-view.
describe('zoom', () => {
    const Z = C0.camera.zoom;

    test('the wheel zooms the yard, not the page, and never behind the welcome card', async () => {
        const main = await boot();
        const canvas = dom.el('game-canvas');
        const before = fire(canvas, 'wheel', { deltaY: -100, deltaMode: 0, cancelable: true });
        expect(before.defaultPrevented).toBe(false);
        expect(main.getState().zoom).toBe(1);

        fire(dom.el('blocker'), 'click');
        const wheel = fire(canvas, 'wheel', { deltaY: -100, deltaMode: 0, cancelable: true });
        expect(wheel.defaultPrevented).toBe(true);
        expect(main.getState().zoom).toBeGreaterThan(1);
        // A wheel that counts in lines, rolled back the same way, comes back.
        fire(canvas, 'wheel', { deltaY: 100 / 16, deltaMode: 1, cancelable: true });
        expect(main.getState().zoom).toBeCloseTo(1, 6);
        // A trackpad's pinch (a wheel with Control) moves faster.
        fire(canvas, 'wheel', { deltaY: -20, deltaMode: 0, ctrlKey: true, cancelable: true });
        expect(main.getState().zoom).toBeCloseTo(Math.exp(20 * Z.pinchWheel), 6);
        // However far it is rolled, it stops at the ends of the range.
        for (let i = 0; i < 40; i++) fire(canvas, 'wheel', { deltaY: -300, deltaMode: 0, cancelable: true });
        expect(main.getState().zoom).toBe(Z.max);
        for (let i = 0; i < 40; i++) fire(canvas, 'wheel', { deltaY: 300, deltaMode: 0, cancelable: true });
        expect(main.getState().zoom).toBe(Z.min);
        expect(() => frames(main, 0.5)).not.toThrow();
    });

    test('+ and - zoom a step at a time and 0 goes back, leaving Control and Command to the browser', async () => {
        const main = await boot();
        fire(dom.documentStub, 'keydown', { key: '+', code: 'Equal' });
        expect(main.getState().zoom).toBe(1);
        fire(dom.el('blocker'), 'click');
        const press = fire(dom.documentStub, 'keydown', { key: '=', code: 'Equal' });
        expect(press.defaultPrevented).toBe(true);
        expect(main.getState().zoom).toBeCloseTo(Z.step, 6);
        fire(dom.documentStub, 'keydown', { key: '+', code: 'NumpadAdd' });
        expect(main.getState().zoom).toBeCloseTo(Z.step * Z.step, 6);
        fire(dom.documentStub, 'keydown', { key: '-', code: 'Minus' });
        expect(main.getState().zoom).toBeCloseTo(Z.step, 6);
        fire(dom.documentStub, 'keydown', { key: '0', code: 'Digit0' });
        expect(main.getState().zoom).toBe(1);
        const browsers = fire(dom.documentStub, 'keydown', { key: '=', code: 'Equal', ctrlKey: true });
        expect(browsers.defaultPrevented).toBe(false);
        const mac = fire(dom.documentStub, 'keydown', { key: '-', code: 'Minus', metaKey: true });
        expect(mac.defaultPrevented).toBe(false);
        expect(main.getState().zoom).toBe(1);
        // And below the usual view, standing back.
        fire(dom.documentStub, 'keydown', { key: '-', code: 'Minus' });
        expect(main.getState().zoom).toBeCloseTo(1 / Z.step, 6);
    });

    test('two fingers on the lawn pinch, the steering finger stops steering, and neither steers again until lifted', async () => {
        const main = await boot();
        const canvas = dom.el('game-canvas');
        fire(dom.el('blocker'), 'click');
        fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 500 });
        expect(main.__test__.pointer.id).toBe(1);
        fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 500 });
        expect(main.__test__.pointer.id).toBe(null);
        expect(main.getState().aim).toBe(null);
        expect(main.getState().pinching).toBe(true);
        // Spread from 100 to 150 pixels apart: half again as close.
        fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 500 });
        expect(main.getState().zoom).toBeCloseTo(1.5, 6);
        // Together again to 75 apart, from 1 when the pinch began.
        fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 225, clientY: 500 });
        expect(main.getState().zoom).toBeCloseTo(Math.max(Z.min, 0.75), 6);
        // One finger lifted ends the pinch, and the other does not steer.
        fire(canvas, 'pointerup', { pointerId: 2 });
        expect(main.getState().pinching).toBe(false);
        fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 400 });
        expect(main.__test__.pointer.id).toBe(null);
        expect(main.__test__.pointer.client).toBe(null);
        fire(canvas, 'pointerup', { pointerId: 1 });
        // A fresh finger steers as before.
        fire(canvas, 'pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 500 });
        expect(main.__test__.pointer.id).toBe(3);
        expect(main.getState().blowing).toBe(false);
    });

    test('a key press is read as zoom by the character typed or the number pad', async () => {
        const main = await import('../www/leaves/js/main.js');
        expect(main.zoomKeyOf({ key: '+', code: 'Equal' })).toBe('in');
        expect(main.zoomKeyOf({ key: '+', code: 'BracketRight' })).toBe('in');
        expect(main.zoomKeyOf({ key: '+', code: 'NumpadAdd' })).toBe('in');
        expect(main.zoomKeyOf({ key: '_', code: 'Minus' })).toBe('out');
        expect(main.zoomKeyOf({ key: '-', code: 'NumpadSubtract' })).toBe('out');
        expect(main.zoomKeyOf({ key: '0', code: 'Numpad0' })).toBe('reset');
        expect(main.zoomKeyOf({ key: '=', code: 'Equal', altKey: true })).toBe(null);
        expect(main.zoomKeyOf({ key: 'd', code: 'KeyD' })).toBe(null);
    });
});

test('the aim follows the keys or the pointer, whichever moved last', async () => {
    const main = await import('../www/leaves/js/main.js');
    const held = { left: false, right: true, up: true, down: false };
    expect(main.aimFor('keys', { aim: null }, held)).toEqual({ mode: 'keys', x: 1, z: -1 });
    expect(main.aimFor('point', { aim: { x: 2, z: 3 } }, held)).toEqual({ mode: 'point', x: 2, z: 3 });
    expect(main.aimFor('point', { aim: null }, held)).toBe(null);
});

// STEVE'S QA, 2026-10-08: "Can we please remove the control panel that lets
// me adjust the environment? I think we're set on the current settings." The
// address options stay, with no panel (Steve: "please keep the hidden
// address options").
test('on a QA host there is no lab panel, and the address still sets the leaves, the clock and the finds', async () => {
    dom.windowStub.location.search = '?leaves=600&clock=45&finds=1';
    const main = await boot();
    expect(dom.documentStub.body.children.some((c) => /lab/.test(c.className || ''))).toBe(false);
    const s = main.getState();
    expect(s.qa).toBe(true);
    expect(s.count).toBe(600);
    expect(s.round.seconds).toBe(45);
    expect(s.showFinds).toBe(true);
});

test('a browser without WebGL 2 is told so and taken to the standard site', async () => {
    delete dom.windowStub.WebGL2RenderingContext;
    await import('../www/leaves/js/main.js');
    await flushAsync();
    expect(dom.el('load-status').textContent).toMatch(/can't run the 3D view/);
    await jest.advanceTimersByTimeAsync(3000);
    expect(dom.replaced).toEqual(['/']);
});

describe('the round', () => {
    /** Step in, start the clock with Space, and play the round through at a
     *  low frame rate (the sandbox is slow) until the end card is up. Boot
     *  with the short clock first. */
    async function playARound(main) {
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        expect(main.getState().round.phase).toBe('playing');
        // The clock, and the dive into the pile.
        frames(main, SHORT + C0.round.finaleMax, 20);
        expect(main.getState().endShown).toBe(true);
    }

    test('the HUD waits for the first blow, and the clock starts with it', async () => {
        const main = await boot();
        fire(dom.el('blocker'), 'click');
        expect(dom.el('round-hud').classList.contains('visible')).toBe(true);
        frames(main, 2, 20);
        expect(main.getState().round.phase).toBe('ready');
        expect(dom.el('hud-clock').textContent).toBe('5:00');
        expect(dom.el('hud-hint').hidden).toBe(false);
        expect(dom.el('hud-hint').textContent).toBe('Blow to start the clock');

        fire(dom.documentStub, 'keydown', { code: 'Space' });
        // The frame that starts the clock does not count toward it, so 2.5
        // seconds of frames leaves 297.55 seconds, which the clock rounds up.
        frames(main, 2.5, 20);
        expect(main.getState().round.phase).toBe('playing');
        expect(dom.el('hud-clock').textContent).toBe('4:58');
        expect(dom.el('hud-hint').hidden).toBe(true);
        expect(dom.el('round-status').textContent).toBe('The clock is running. You have 5 minutes.');
    });

    test('the clock holds still behind the welcome card', async () => {
        const main = await boot();
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 1, 20);
        const before = main.getState().round.elapsed;
        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(dom.el('round-hud').classList.contains('visible')).toBe(false);
        frames(main, 5, 20);
        expect(main.getState().round.elapsed).toBe(before);
    });

    test('at the end of the minute the blower stops and the end card says how it went', async () => {
        const main = await boot({ clock: SHORT });
        await playARound(main);
        const s = main.getState();
        expect(s.round.phase).toBe('done');
        expect(s.blowing).toBe(false);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(dom.el('end-title').textContent).toBe(s.result.verdict.title);
        expect(dom.el('end-percent').textContent).toMatch(/^\d{1,3}%$/);
        const t = s.result.tally;
        expect(t.lawn + t.tarp + t.street + t.neighbor + t.porch).toBe(t.total);
        expect(dom.el('end-lawn').textContent).toBe(String(t.lawn).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
        // The chrome steps aside for the card, and Play again has focus.
        expect(dom.el('round-hud').classList.contains('visible')).toBe(false);
        expect(dom.el('help-btn').classList.contains('visible')).toBe(false);
        expect(dom.documentStub.activeElement).toBe(dom.el('end-again'));
        // Space on the card does not reach the blower.
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        expect(main.getState().blowing).toBe(false);
        // The directory link is under the card.
        expect(dom.el('end-promo').children.length).toBeGreaterThan(0);
    });

    test('Play again lays the yard back down and waits for the first blow', async () => {
        const main = await boot({ clock: SHORT });
        await playARound(main);
        fire(dom.el('end-again'), 'click');
        const s = main.getState();
        expect(s.endShown).toBe(false);
        expect(s.round.phase).toBe('ready');
        expect(s.counted.lawn).toBe(s.counted.total);
        expect(dom.el('round-hud').classList.contains('visible')).toBe(true);
        // The clock back at the round's whole length (the short one here).
        expect(dom.el('hud-clock').textContent).toBe('0:20');
    });

    test('Keep blowing (or Escape) leaves the yard as it is, with no clock and a way back to a round', async () => {
        const main = await boot({ clock: SHORT });
        await playARound(main);
        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(main.getState().endShown).toBe(false);
        expect(main.getState().round.phase).toBe('free');
        expect(dom.el('hud-clock').hidden).toBe(true);
        expect(dom.el('hud-new').hidden).toBe(false);
        expect(dom.el('hud-hint').textContent).toBe('No clock, just leaves');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        expect(main.getState().blowing).toBe(true);
        frames(main, 3, 20);
        expect(main.getState().round.phase).toBe('free');
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        fire(dom.el('hud-new'), 'click');
        expect(main.getState().round.phase).toBe('ready');
        expect(dom.el('hud-new').hidden).toBe(true);
    });

    // STEVE'S QA, 2026-10-08: a celebration at 100% "even if there is no
    // time limit", focused on the person and the clean yard, not the neighbor.
    // And bigger since (2026-10-08: "Could we increase the celebration"): a
    // banner, leaves thrown up, three hops and a spin.
    test('in free play, the last leaf off the lawn is celebrated: arms up, the blower stopped, the neighbor kept in, a banner, leaves thrown up, hops and a spin', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        fire(dom.el('free-btn'), 'click');
        frames(main, 1, 20);
        expect(main.getState().cheer.armed).toBe(true);
        // Holding the blower as the last leaf goes.
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        let k = 0;
        for (let i = 0; i < sim.count; i++) {
            if (sim.hanging[i] || sim.falling[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -8 + (k % 60) * 0.3, 9.6 + Math.floor(k / 60) * 0.3);
            k++;
        }
        frames(main, 0.5, 20);
        let s = main.getState();
        expect(s.cheer.phase).toBe('cheer');
        expect(s.blowing).toBe(false);
        expect(main.__test__.keys.blow).toBe(false);
        expect(dom.el('cheer-banner').classList.contains('visible')).toBe(true);
        expect(dom.el('cheer-banner').classList.contains('timed')).toBe(false);
        expect(dom.el('cheer-big').textContent).toBe('Spotless!');
        expect(dom.el('cheer-small').textContent).toBe('Not a leaf in sight. The lawn is spotless.');
        expect(dom.el('round-status').textContent).toMatch(/The lawn is clear/);
        // Leaves thrown up all round (never in the sim: tests/leaves-celebrate).
        expect(s.confetti).toBeGreaterThan(C0.cheer.confetti.count * 0.9);
        // The neighbor stays in, whatever is on his lawn.
        expect(s.neighbor.state).toBe('inside');
        // A hop, and turned toward the street.
        frames(main, 0.3, 20);
        s = main.getState();
        expect(s.operator.lift).toBeGreaterThan(0);
        expect(Math.abs(s.operator.heading)).toBeLessThan(0.05);
        // Part way through the spin, turned well away from the street.
        const mid = C0.cheer.spin.from + C0.cheer.spin.time / 2;
        for (let k = 0; k < 100 && main.getState().cheer.t < mid; k++) frames(main, 0.05, 20);
        expect(Math.abs(main.getState().operator.heading)).toBeGreaterThan(2.5);
        // It ends by itself, back on the lawn, and does not come again.
        frames(main, C0.cheer.seconds, 20);
        // The banner gone, and every leaf thrown up.
        expect(dom.el('cheer-banner').classList.contains('visible')).toBe(false);
        expect(main.getState().confetti).toBe(0);
        s = main.getState();
        expect(s.cheer.phase).toBe('idle');
        expect(s.cheer.done).toBe(true);
        expect(s.operator.lift).toBe(0);
        frames(main, 2, 20);
        expect(main.getState().cheer.phase).toBe('idle');
        expect(main.getState().round.phase).toBe('free');
    });

    test('at 99% the HUD counts down the last few leaves', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        fire(dom.el('free-btn'), 'click');
        frames(main, 0.5, 20);
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        // All but three into the street (600 leaves allow none on a clear lawn).
        let kept = 0;
        for (let i = 0; i < sim.count; i++) {
            if (sim.hanging[i] || sim.falling[i]) continue;
            if (kept < 3) { kept++; continue; }
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -8 + (i % 60) * 0.3, 9.6 + Math.floor(i / 60) * 0.3);
        }
        frames(main, 0.5, 20);
        expect(main.getState().counted.lawn).toBe(3);
        expect(dom.el('hud-cleared').textContent).toBe('99%, 3 leaves to go');
        expect(main.getState().cheer.phase).toBe('idle');
    });

    test('a key ends the celebration early, and the yard is theirs again', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        fire(dom.el('free-btn'), 'click');
        frames(main, 1, 20);
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        for (let i = 0; i < sim.count; i++) {
            if (sim.hanging[i] || sim.falling[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -8 + (i % 60) * 0.3, 9.6 + Math.floor(i / 60) * 0.3);
        }
        frames(main, 0.5, 20);
        expect(main.getState().cheer.phase).toBe('cheer');
        const press = fire(dom.documentStub, 'keydown', { code: 'Enter' });
        expect(press.defaultPrevented).toBe(true);
        expect(main.getState().cheer.phase).toBe('idle');
        expect(main.getState().operator.lift).toBe(0);
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        expect(main.getState().blowing).toBe(true);
    });

    // STEVE'S QA, 2026-10-08: "Are we recording the user's fastest time in
    // localStorage? I think we should", with a Forget button, and "a new
    // personal best" in the share.
    test('a clear keeps the best time, the cards say so, a faster one is shared as a new personal best, and Forget clears it', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        const Sim = await import('../www/leaves/js/sim.min.js');
        expect(dom.el('best-line').hidden).toBe(true);
        /** Blow once, wait `wait` seconds, clear the lawn, and see the dive through. */
        const clearIn = (wait) => {
            fire(dom.documentStub, 'keydown', { code: 'Space' });
            frames(main, 0.2, 20);
            fire(dom.documentStub, 'keyup', { code: 'Space' });
            frames(main, wait, 20);
            const sim = main.__test__.sim();
            for (let i = 0; i < sim.count; i++) {
                if (sim.hanging[i] || sim.falling[i]) continue;
                Sim.hangLeaf(sim, i, 0, 5, 0);
                Sim.layDown(sim, i, -8 + (i % 60) * 0.3, 9.6 + Math.floor(i / 60) * 0.3);
            }
            for (let k = 0; k < 6 && main.getState().round.phase === 'playing'; k++) frames(main, 0.5, 20);
            // Straight past the celebration and the dive (a key skips them).
            fire(dom.documentStub, 'keydown', { code: 'Space' });
            fire(dom.documentStub, 'keyup', { code: 'Space' });
            frames(main, 0.5, 20);
            expect(main.getState().endShown).toBe(true);
        };
        fire(dom.el('blocker'), 'click');
        clearIn(6);
        let s = main.getState();
        const first = s.result.seconds;
        expect(dom.el('end-kicker').textContent).toBe('The lawn is clear');
        expect(dom.el('end-best').textContent).toMatch(/^Your first clear, in 0:0\d\. Now you have a time to beat\.$/);
        expect(JSON.parse(globalThis.localStorage.getItem('leaves-best'))).toEqual({ 600: first });
        expect(s.best).toBe(first);
        // No brag for a first clear.
        fire(dom.el('end-share'), 'click');
        await flushAsync();
        expect(decodeURIComponent(dom.windowStub.location.href)).not.toMatch(/personal best/);

        // Faster the second time.
        fire(dom.el('end-again'), 'click');
        clearIn(1);
        s = main.getState();
        expect(s.result.seconds).toBeLessThan(first);
        expect(dom.el('end-best').textContent).toMatch(/^A new best time, 0:0\d, down from 0:0\d\.$/);
        fire(dom.el('end-share'), 'click');
        await flushAsync();
        expect(decodeURIComponent(dom.windowStub.location.href)).toMatch(/I cleared 100% of my yard in \d seconds?, a new personal best\./);

        // The welcome card shows it, and forgets it.
        fire(dom.el('end-again'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
        expect(dom.el('best-line').hidden).toBe(false);
        expect(dom.el('best-text').textContent).toMatch(/^Your best time to clear the lawn is 0:0\d\. Can you beat it\?$/);
        fire(dom.el('best-forget'), 'click');
        expect(dom.el('best-line').hidden).toBe(true);
        expect(globalThis.localStorage.getItem('leaves-best')).toBe(null);
        expect(dom.el('round-status').textContent).toBe('Your best time is forgotten.');
        // Forgetting does not start the round behind the card.
        expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
    }, LONG);

    // STEVE'S QA, 2026-10-08: "a rotating 3D view of a pile of leaves, and
    // the pile's size is dynamic based on how the user did". The pile itself
    // is measured in tests/leaves-trophy.
    test('the results card raises a pile as big as the result, and its percent counts up to the score', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        const Sim = await import('../www/leaves/js/sim.min.js');
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        const sim = main.__test__.sim();
        for (let i = 0; i < sim.count; i++) {
            if (sim.hanging[i] || sim.falling[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -8 + (i % 60) * 0.3, 9.6 + Math.floor(i / 60) * 0.3);
        }
        for (let k = 0; k < 400 && !main.getState().endShown; k++) frames(main, 0.05, 20);
        expect(main.getState().endShown).toBe(true);
        frames(main, 0.1, 20);
        let s = main.getState();
        expect(s.pile.count).toBe(C0.trophy.max);
        // Counting up, not there yet.
        expect(s.endPercent).toBeGreaterThanOrEqual(0);
        expect(s.endPercent).toBeLessThan(100);
        expect(dom.el('end-percent').textContent).toBe(`${s.endPercent}%`);
        frames(main, C0.trophy.rain + C0.trophy.fall + 0.2, 20);
        s = main.getState();
        expect(s.endPercent).toBe(100);
        expect(dom.el('end-percent').textContent).toBe('100%');
        // Play again puts it away.
        fire(dom.el('end-again'), 'click');
        expect(main.getState().pile).toBe(null);
    }, LONG);

    // Found 2026-10-08 by a test that failed now and then: the round ended
    // on a clear count, the dive counted again, and a leaf landing between
    // the two made the result 99%.
    test('a round that ended on a clear lawn keeps that count, whatever lands a moment later', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        const Sim = await import('../www/leaves/js/sim.min.js');
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        const sim = main.__test__.sim();
        let spare = -1;
        for (let i = 0; i < sim.count; i++) {
            if (sim.hanging[i] || sim.falling[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -8 + (i % 60) * 0.3, 9.6 + Math.floor(i / 60) * 0.3);
            spare = i;
        }
        // Frame by frame to the one whose count first reads clear, the round
        // still running (it ends on the next).
        for (let k = 0; k < 40 && main.getState().counted.lawn > 0; k++) frames(main, 0.05, 20);
        expect(main.getState().counted.lawn).toBe(0);
        expect(main.getState().round.phase).toBe('playing');
        // A leaf comes down on the lawn in that moment.
        Sim.hangLeaf(sim, spare, 0, 5, 0);
        Sim.layDown(sim, spare, 0, 2);
        frames(main, 0.05, 20);
        expect(main.getState().round.phase).toBe('finale');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        // The card's percent counts up as its pile rains down.
        frames(main, 0.5 + C0.trophy.rain + C0.trophy.fall, 20);
        const end = main.getState();
        expect(end.result.tally.lawn).toBe(0);
        expect(end.result.verdict.key).toBe('perfect');
        expect(dom.el('end-percent').textContent).toBe('100%');
    });

    test('a round the clock runs out on keeps no time, and its card says so plainly', async () => {
        const main = await boot({ clock: SHORT });
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        frames(main, SHORT + C0.round.finaleMax, 20);
        expect(main.getState().endShown).toBe(true);
        expect(dom.el('end-kicker').textContent).toBe('Time is up');
        // The plain card: no gold, no ribbon.
        expect(dom.el('end-modal').classList.contains('perfect')).toBe(false);
        expect(dom.el('end-ribbon').hidden).toBe(true);
        expect(dom.el('end-best').textContent).toBe('');
        expect(globalThis.localStorage.getItem('leaves-best')).toBe(null);
    });

    test('the lab\'s short clock is the round\'s length on a QA host', async () => {
        const main = await boot({ clock: 30 });
        fire(dom.el('blocker'), 'click');
        expect(main.getState().round.seconds).toBe(30);
        expect(dom.el('hud-clock').textContent).toBe('0:30');
    });

    test('the welcome card offers the yard with no clock', async () => {
        const main = await boot();
        fire(dom.el('free-btn'), 'click');
        expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
        expect(main.getState().round.phase).toBe('free');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 70, 20);
        expect(main.getState().endShown).toBe(false);
    }, LONG);

    test('Share sends the result sentence', async () => {
        const main = await boot({ clock: SHORT });
        await playARound(main);
        fire(dom.el('end-share'), 'click');
        await flushAsync();
        // No share sheet and no clipboard here, so the ladder ends at a mail.
        const sent = decodeURIComponent(dom.windowStub.location.href);
        expect(sent).toMatch(/^mailto:/);
        expect(sent).toMatch(/I cleared \d{1,3}% of my yard in 20 seconds\./);
        expect(main.getState().result).not.toBe(null);
    });

    // STEVE'S QA, 2026-10-08: "a timed round should end early if the user
    // reaches 100%".
    test('every leaf off the lawn ends the round early, into the dive, and the share says how fast', async () => {
        const main = await boot();
        // Bare trees first: no leaf still to come down to spoil a clear lawn.
        main.__test__.bareTrees();
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        frames(main, 10, 20);
        expect(main.getState().round.phase).toBe('playing');
        // Every leaf lifted out of the yard and laid in the street, as a
        // visitor's blower would leave them (never teleported).
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        let k = 0;
        for (let i = 0; i < sim.count; i++) {
            if (sim.hanging[i] || sim.falling[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -8 + (k % 60) * 0.3, 9.6 + Math.floor(k / 60) * 0.3);
            k++;
        }
        for (let s = 0; s < 5 && main.getState().round.phase === 'playing'; s++) frames(main, 0.5, 20);
        const s = main.getState();
        expect(s.round.phase).toBe('finale');
        expect(s.round.spotless).toBe(true);
        expect(s.round.elapsed).toBeLessThan(15);
        expect(dom.el('round-status').textContent).toMatch(/The lawn is clear/);
        // ITS OWN CELEBRATION before the dive (Steve's QA, 2026-10-08: "a
        // separate and more elaborate celebration"): the gold banner with the
        // time, the clock stopped and flashing, leaves thrown up, the dance.
        const time = `0:${String(Math.round(s.round.elapsed)).padStart(2, '0')}`;
        expect(dom.el('cheer-banner').classList.contains('visible')).toBe(true);
        expect(dom.el('cheer-banner').classList.contains('timed')).toBe(true);
        expect(dom.el('cheer-big').textContent).toBe('Lawn clear!');
        expect(dom.el('cheer-small').textContent).toBe(`in ${time}`);
        expect(dom.el('cheer-extra').textContent).toBe('Your first clear!');
        expect(dom.el('hud-clock').classList.contains('clear')).toBe(true);
        expect(dom.el('hud-hint').textContent).toBe('Lawn clear!');
        expect(s.confetti).toBeGreaterThan(C0.cheer.confetti.count);
        frames(main, 0.3, 20);
        expect(main.getState().finale.arms).toBe('up');
        // The dive after it, within the finale's cap.
        frames(main, C0.cheer.timed.beat, 20);
        expect(main.getState().finale.t).toBeGreaterThan(C0.cheer.timed.beat);
        // A key skips the rest of the dive, and the card's percent counts up
        // as its pile rains down.
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.5 + C0.trophy.rain + C0.trophy.fall, 20);
        const end = main.getState();
        // The gold card, the time on its ribbon, glints over the pile.
        expect(dom.el('end-modal').classList.contains('perfect')).toBe(true);
        expect(dom.el('end-ribbon').hidden).toBe(false);
        expect(dom.el('end-ribbon').textContent).toBe(`Lawn clear in ${time}`);
        expect(end.pile.glints).toBe(true);
        expect(end.endShown).toBe(true);
        expect(end.result.verdict.key).toBe('perfect');
        expect(dom.el('end-title').textContent).toBe('Not a leaf in sight');
        expect(dom.el('end-percent').textContent).toBe('100%');
        expect(end.result.seconds).toBe(Math.round(s.round.elapsed));
        fire(dom.el('end-share'), 'click');
        await flushAsync();
        expect(decodeURIComponent(dom.windowStub.location.href)).toMatch(/I cleared 100% of my yard in 1\d seconds\./);
    }, LONG);
});

describe('the neighbor', () => {
    /** Lay `n` of the yard's resting leaves on the neighbor's lawn, by the
     *  fence: each lifted out of the yard (hangLeaf) and laid down there, so
     *  the sim files it where it now lies. */
    async function sendOver(main, n) {
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        let k = 0;
        for (let i = 0; i < sim.count && k < n; i++) {
            if (sim.awake[i] || sim.hanging[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, 10.4 + (k % 10) * 0.3, -1 + Math.floor(k / 10) * 0.3);
            k++;
        }
    }

    test('leaves on his lawn bring him out, and the visitor hears about it', async () => {
        const main = await boot();
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 1, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        expect(main.getState().neighbor.state).toBe('inside');
        await sendOver(main, 80);
        frames(main, 1, 20);
        expect(main.getState().neighbor.state).not.toBe('inside');
        expect(dom.el('round-status').textContent).toMatch(/neighbor has noticed/);
        // He goes about his visit without anything throwing.
        expect(() => frames(main, 15, 20)).not.toThrow();
        expect(main.getState().counted.sent).toBeGreaterThanOrEqual(80);
    }, LONG);
});

describe('the finale (M3)', () => {
    /** Step in, blow once, and run the clock out, stopping at the finale. */
    async function toTheFinale(main) {
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        for (let s = 0; s < SHORT + 10 && main.getState().round.phase !== 'finale'; s++) frames(main, 1, 20);
        expect(main.getState().round.phase).toBe('finale');
    }

    test('with nothing on the tarp, the dive finds the lawn, and the card and the share say so', async () => {
        const main = await boot({ clock: SHORT });
        await toTheFinale(main);
        expect(main.getState().finale.success).toBe(false);
        expect(dom.el('hud-hint').textContent).toBe('Here goes nothing');
        expect(main.getState().endShown).toBe(false);
        frames(main, C0.round.finaleMax, 20);
        const s = main.getState();
        expect(s.endShown).toBe(true);
        expect(s.finale.burst).toBe(true);
        expect(s.result.landed).toBe(false);
        expect(dom.el('end-dive').textContent).toMatch(/found the lawn/);
        fire(dom.el('end-share'), 'click');
        await flushAsync();
        expect(decodeURIComponent(dom.windowStub.location.href)).toMatch(/I threw my back out diving into the pile\./);
    });

    test('a key skips straight to the end of it, burst and all', async () => {
        const main = await boot({ clock: SHORT });
        await toTheFinale(main);
        expect(main.getState().finale.burst).toBe(false);
        const down = fire(dom.documentStub, 'keydown', { code: 'Space' });
        expect(down.defaultPrevented).toBe(true);
        const f = main.getState().finale;
        expect(f.t).toBeGreaterThanOrEqual(f.total);
        expect(f.burst).toBe(true);
        frames(main, 0.5, 20);
        expect(main.getState().endShown).toBe(true);
        // The blower never ran during it.
        expect(main.getState().blowing).toBe(false);
    });

    test('a tall pile on the tarp is landed in, and Keep blowing stands them back up', async () => {
        const main = await boot({ clock: SHORT });
        // Heap the yard's leaves in the tarp's corner before the clock runs out.
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        // Heap them leaf on leaf, the way leaves arriving one after another
        // build a pile. (Dropped all at once they would all land on the bare
        // tarp together and come to rest as one flat mat, since a leaf only
        // joins the pile's surface once it is still.) At about 1.4 cm a
        // leaf, a pile 35 cm tall at its natural slope takes some 460.
        let laid = 0;
        for (let i = 0; i < sim.count && laid < 560; i++) {
            if (sim.awake[i] || sim.hanging[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, -9.55, -5.55);
            laid++;
        }
        for (let s = 0; s < SHORT + 10 && main.getState().round.phase !== 'finale'; s++) frames(main, 1, 20);
        expect(main.getState().finale.success).toBe(true);
        frames(main, C0.round.finaleMax, 20);
        expect(main.getState().result.landed).toBe(true);
        expect(dom.el('end-dive').textContent).toMatch(/it caught you/);
        // The score was counted before the dive scattered the pile. (A few
        // of the 560 slid off, and a tree's leaf in the air over the tarp is
        // not counted until it lands, M6.)
        expect(main.getState().result.tally.tarp).toBeGreaterThanOrEqual(440);
        fire(dom.el('end-free'), 'click');
        const op = main.getState().operator;
        expect(op.pitch).toBe(0);
        expect(op.lift).toBe(0);
        expect(op.hideBlower).toBe(false);
        // And they can walk again.
        fire(dom.documentStub, 'keydown', { code: 'KeyD' });
        frames(main, 1, 20);
        expect(main.getState().operator.x).toBeGreaterThan(op.x + 1);
    }, LONG);
});

describe('the character card (M4)', () => {
    /** The radio button for `id` in the group hosted by `host`. */
    function option(host, id) {
        const label = dom.el(host).children.find((l) => l.children[0].value === id);
        return label.children[0];
    }

    test('opens from the welcome card, beside a paused yard, with the current choice ticked', async () => {
        const main = await boot();
        expect(dom.el('cast-name').textContent).toBe('Playing in a rust red shirt and navy pants.');
        fire(dom.el('cast-btn'), 'click');
        const s = main.getState();
        expect(s.castShown).toBe(true);
        expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
        expect(dom.el('round-hud').classList.contains('visible')).toBe(false);
        // Shirts and pants as swatches, no outfits (Steve's QA, 2026-10-08).
        expect(dom.el('cast-shirts').children).toHaveLength(8);
        expect(dom.el('cast-pants').children).toHaveLength(6);
        expect(await readFile(PAGE, 'utf8')).not.toMatch(/cast-presets|<legend>Outfit<\/legend>/);
        expect(dom.el('cast-length').children).toHaveLength(4);
        expect(option('cast-shirts', 'rust').checked).toBe(true);
        expect(option('cast-pants', 'navy').checked).toBe(true);
        // Nothing moves and no clock runs while it is open.
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 1, 20);
        expect(main.getState().round.phase).toBe('ready');
        expect(main.getState().blowing).toBe(false);
    });

    test('each choice changes the person at once, and Done keeps it and goes back to the welcome card', async () => {
        const main = await boot();
        fire(dom.el('cast-btn'), 'click');
        for (const [host, id] of [['cast-shirts', 'pumpkin'], ['cast-pants', 'denim'], ['cast-hair', 'gray']]) {
            const input = option(host, id);
            input.checked = true;
            fire(input, 'change');
        }
        expect(main.getState().cast).toMatchObject({ shirt: 'pumpkin', pants: 'denim', hair: 'gray' });
        expect(dom.el('cast-status').textContent).toBe('Gray');
        expect(() => frames(main, 0.5, 20)).not.toThrow();
        fire(dom.el('cast-done'), 'click');
        expect(main.getState().castShown).toBe(false);
        expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
        expect(dom.el('cast-name').textContent).toBe('Playing in a pumpkin orange shirt and denim blue pants.');
        expect(JSON.parse(globalThis.localStorage.getItem('leaves-character'))).toEqual({ shirt: 'pumpkin', pants: 'denim', skin: 'fair', hair: 'gray', length: 'short' });
    });

    test('a kept choice is who turns up next visit, and Escape is Done', async () => {
        globalThis.localStorage.setItem('leaves-character', JSON.stringify({ shirt: 'teal', pants: 'black', skin: 'brown', hair: 'blond', length: 'bald' }));
        const main = await boot();
        expect(main.getState().cast).toEqual({ shirt: 'teal', pants: 'black', skin: 'brown', hair: 'blond', length: 'bald' });
        expect(dom.el('cast-name').textContent).toBe('Playing in a teal shirt and black pants.');
        fire(dom.el('cast-btn'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(main.getState().castShown).toBe(false);
        expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
    });

    test('an outfit kept before shirts and pants turns up in its colors', async () => {
        globalThis.localStorage.setItem('leaves-character', JSON.stringify({ preset: 'runner', skin: 'tan', hair: 'black', length: 'buzz' }));
        const main = await boot();
        expect(main.getState().cast).toEqual({ shirt: 'teal', pants: 'black', skin: 'tan', hair: 'black', length: 'buzz' });
        expect(dom.el('cast-name').textContent).toBe('Playing in a teal shirt and black pants.');
    });

    test('Forget my choice clears what was kept and brings back the default person', async () => {
        globalThis.localStorage.setItem('leaves-character', JSON.stringify({ shirt: 'white', pants: 'charcoal', skin: 'deep', hair: 'gray', length: 'long' }));
        const main = await boot();
        fire(dom.el('cast-btn'), 'click');
        fire(dom.el('cast-forget'), 'click');
        expect(globalThis.localStorage.getItem('leaves-character')).toBe(null);
        expect(main.getState().cast).toEqual({ shirt: 'rust', pants: 'navy', skin: 'fair', hair: 'darkBrown', length: 'short' });
        expect(option('cast-shirts', 'rust').checked).toBe(true);
        expect(dom.el('cast-status').textContent).toMatch(/forgotten/);
    });
});

describe('delights and surprises (M6)', () => {
    /** A recording AudioContext: just enough for sound.js to build on. Its
     *  gains are kept in `made.gains`, in the order they were made. */
    function installAudio() {
        const made = [];
        made.gains = [];
        const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
        const node = () => ({ connect: (t) => t, disconnect() {}, addEventListener() {} });
        dom.windowStub.AudioContext = class {
            constructor() { made.push(this); this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
            createGain() { const g = { ...node(), gain: param() }; made.gains.push(g); return g; }
            createOscillator() { return { ...node(), frequency: param(), start() {}, stop() {} }; }
            createBiquadFilter() { return { ...node(), frequency: param(), Q: param() }; }
            createStereoPanner() { return { ...node(), pan: param() }; }
            createBufferSource() { return { ...node(), start() {}, stop() {} }; }
            createBuffer(c, frames) { const d = new Float32Array(frames); return { getChannelData: () => d }; }
            resume() { return Promise.resolve(); }
            suspend() { return Promise.resolve(); }
            close() { return Promise.resolve(); }
        };
        return made;
    }

    // STEVE'S M6 QA, 2026-10-07: "Let's have the sound on by default."
    test('the sound is on from the start, begins with the first key or tap, and the speaker or M turns it off and on', async () => {
        const made = installAudio();
        const main = await boot();
        const btn = dom.el('sound-btn');
        expect(main.getState().sound).toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.title).toBe('Sound on (M)');
        expect(btn.classList.contains('visible')).toBe(false);
        // Nothing is made before a gesture: a browser would refuse it.
        expect(made).toHaveLength(0);
        fire(dom.el('blocker'), 'click');
        expect(btn.classList.contains('visible')).toBe(true);
        // The first key anywhere starts it.
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        expect(made).toHaveLength(1);
        expect(() => frames(main, 0.5, 20)).not.toThrow();
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        fire(btn, 'click');
        expect(main.getState().sound).toBe(false);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.title).toBe('Sound off (M)');
        expect(dom.el('round-status').textContent).toBe('Sound off.');
        // A browser shortcut with M in it is the browser's.
        fire(dom.documentStub, 'keydown', { code: 'KeyM', metaKey: true });
        expect(main.getState().sound).toBe(false);
        // M works on the welcome card too, and still makes only one context.
        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        fire(dom.documentStub, 'keydown', { code: 'KeyM' });
        expect(main.getState().sound).toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(made).toHaveLength(1);
        // The only thing this scene keeps is the character.
        expect(globalThis.localStorage.length || 0).toBe(0);
    });

    // Steve's M6 QA: "I didn't hear the blowing sound while the neighbor was
    // outside blowing."
    test('with the neighbor out blowing and us not, his blower is heard', async () => {
        const made = installAudio();
        const main = await boot();
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.3, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        expect(made).toHaveLength(1);
        // Our leaves on his lawn, by the fence.
        const Sim = await import('../www/leaves/js/sim.min.js');
        const sim = main.__test__.sim();
        let k = 0;
        for (let i = 0; i < sim.count && k < 80; i++) {
            if (sim.awake[i] || sim.hanging[i]) continue;
            Sim.hangLeaf(sim, i, 0, 5, 0);
            Sim.layDown(sim, i, 10.4 + (k % 10) * 0.3, -1 + Math.floor(k / 10) * 0.3);
            k++;
        }
        let heard = 0;
        for (let t = 0; t < 15 && !heard; t += 0.25) {
            frames(main, 0.25, 20);
            if (main.getState().neighbor.blowing) {
                // The gains are made master first, then each voice's body
                // and output: ours at 2, his at 4.
                heard = made.gains[4].gain.value;
                expect(made.gains[2].gain.value).toBe(0);
            }
        }
        expect(main.getState().neighbor.state).not.toBe('inside');
        // Nearly as loud as ours.
        expect(heard).toBeGreaterThanOrEqual(0.75);
    });

    test('it is Halloween week from October 24 by the date, with trick-or-treaters on the sidewalk', async () => {
        jest.setSystemTime(new Date(2026, 9, 28, 15));
        const main = await boot();
        const s = main.getState();
        expect(s.halloween).toBe(true);
        expect(s.decor).toBe(true);
        expect(s.treaters).not.toBe(null);
        fire(dom.el('free-btn'), 'click');
        // Both groups come by early, each in its own lane, both out at once.
        let most = 0;
        for (let k = 0; k < 4; k++) {
            // 20 frames a second: the scene steps them by the sim's step,
            // which is never more than a twentieth of a second.
            frames(main, 5, 20);
            most = Math.max(most, main.getState().treaters.out);
        }
        expect(main.getState().treaters.walks).toBeGreaterThanOrEqual(2);
        expect(most).toBe(2);
        expect(dom.el('round-status').textContent.length).toBeGreaterThan(0);
    });

    // It boots the page four times, each a whole yard: slow in the sandbox
    // with coverage on, so it has longer than the usual five seconds.
    test('the decorations are up all October, the week\'s extras are not, and the lab can ask for either', async () => {
        jest.setSystemTime(new Date(2026, 9, 7, 15));
        let main = await boot();
        expect(main.getState().decor).toBe(true);
        expect(main.getState().halloween).toBe(false);
        // The trick-or-treaters come with the decorations (M6 QA).
        expect(main.getState().treaters).not.toBe(null);
        fire(dom.el('blocker'), 'click');
        expect(() => frames(main, 1, 20)).not.toThrow();
        dom.uninstall();
        jest.resetModules();
        installThree();
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
        dom.windowStub.location.search = '?leaves=600&halloween=1';
        main = await boot();
        expect(main.getState().halloween).toBe(true);
        dom.uninstall();
        jest.resetModules();
        installThree();
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
        dom.windowStub.location.search = '?leaves=600&halloween=0';
        main = await boot();
        expect(main.getState().decor).toBe(false);
        // And come November they are down.
        dom.uninstall();
        jest.resetModules();
        installThree();
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
        dom.windowStub.location.search = '?leaves=600';
        jest.setSystemTime(new Date(2026, 10, 3, 15));
        main = await boot();
        expect(main.getState().decor).toBe(false);
    }, 20000);

    describe('a find', () => {
        // Enough leaves to bury the lawn, so the finds can be hidden.
        beforeEach(() => { dom.windowStub.location.search = '?leaves=9000'; });

        /** Move every resting leaf near (x, z) onto the tarp, as a blower
         *  would, so the lawn there shows. */
        async function clearAround(main, x, z, r) {
            const Sim = await import('../www/leaves/js/sim.min.js');
            const sim = main.__test__.sim();
            for (let i = 0; i < sim.count; i++) {
                if (sim.awake[i] || sim.hanging[i]) continue;
                if (Math.hypot(sim.px[i] - x, sim.pz[i] - z) > r) continue;
                Sim.hangLeaf(sim, i, 0, 5, 0);
                Sim.layDown(sim, i, -9 + (i % 30) * 0.12, -5.5 + (i % 7) * 0.4);
            }
        }

        test('is hidden under the leaves, found by clearing it, named on the end card and in the share', async () => {
            const main = await boot({ clock: SHORT });
            const hidden = main.getState().finds;
            expect(hidden.map((f) => f.id)).toEqual(['keys', 'gnome', 'ball', 'bill']);
            expect(hidden.every((f) => !f.found)).toBe(true);
            fire(dom.el('blocker'), 'click');
            fire(dom.documentStub, 'keydown', { code: 'Space' });
            frames(main, 0.2, 20);
            fire(dom.documentStub, 'keyup', { code: 'Space' });
            // A few seconds of play, and nothing turns up by itself.
            frames(main, 2, 20);
            expect(main.getState().found).toEqual([]);
            const bill = hidden.find((f) => f.id === 'bill');
            await clearAround(main, bill.x, bill.z, 0.5);
            frames(main, 0.5, 20);
            expect(main.getState().found).toEqual(['a $20 bill']);
            expect(dom.el('find-toast').classList.contains('visible')).toBe(true);
            expect(dom.el('find-toast').textContent).toMatch(/\$20 bill/);
            expect(dom.el('round-status').textContent).toMatch(/You found a \$20 bill/);
            expect(main.getState().finds.find((f) => f.id === 'bill').found).toBe(true);
            // The line under the HUD goes after a few seconds.
            frames(main, C0.finds.toastSeconds + 0.5, 20);
            expect(dom.el('find-toast').classList.contains('visible')).toBe(false);
            // Through the round to the end card.
            for (let k = 0; k < SHORT + 30 && !main.getState().endShown; k++) frames(main, 1, 20);
            expect(dom.el('end-finds').textContent).toBe('Under the leaves you found a $20 bill.');
            expect(main.getState().result.found).toEqual(['a $20 bill']);
            fire(dom.el('end-share'), 'click');
            await flushAsync();
            expect(decodeURIComponent(dom.windowStub.location.href)).toMatch(/I found a \$20 bill under the leaves\./);
            // Play again hides them all again, somewhere new, and forgets them.
            const before = main.getState().finds.map((f) => [f.x, f.z]);
            fire(dom.el('end-again'), 'click');
            const after = main.getState();
            expect(after.found).toEqual([]);
            expect(after.finds.every((f) => !f.found)).toBe(true);
            expect(after.finds.map((f) => [f.x, f.z])).not.toEqual(before);
        }, LONG);

        test('the lab\'s ?finds=1 shows every one from the start, for a look at them', async () => {
            dom.windowStub.location.search = '?leaves=9000&finds=1';
            const main = await boot();
            // (The models' visibility is measured on the real three.js in
            // tests/leaves-finds; the stub absorbs the assignment.)
            expect(main.getState().finds.map((f) => f.found)).toEqual([true, true, true, true]);
            // Shown is not found: nothing is claimed on the end card.
            expect(main.getState().found).toEqual([]);
        });
    });
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
