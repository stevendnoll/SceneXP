// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for Derby Day (www/derby), M1: the graybox race.
 *
 * Under the chainable THREE proxy nothing renders, but every line of a real
 * page load runs: the proof of work, the hall and the track, the check-in
 * card built from the events and presets, Go, a whole race day played frame
 * by frame to the results, Skip, Escape and the back button, Race again,
 * the Time Trial's checkboxes, reduced motion, and the fallback for a
 * browser without WebGL. A missing import or a reference left behind fails
 * here instead of on the site. The race itself is measured for real in
 * derby-sim and derby-playback.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

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

async function boot() {
    const main = await import('../www/derby/js/main.js');
    await flushAsync(30);
    await jest.advanceTimersByTimeAsync(500);
    return main;
}

/** Step the captured animation loop through `seconds` of frames. */
function frames(main, seconds, fps = 30) {
    const loop = dom.loops[dom.loops.length - 1];
    const spy = jest.spyOn(performance, 'now');
    let now = main.getState().lastTime;
    for (let i = 1; i <= Math.round(seconds * fps); i++) {
        now += 1000 / fps;
        spy.mockReturnValue(now);
        loop();
    }
    spy.mockRestore();
}

/** The inputs a choices box holds (each label's first child). */
const inputsOf = (id) => dom.el(id).children.map((label) => label.children[0]);
const choose = (input, on = true) => {
    input.checked = on;
    fire(input, 'change');
};
const shown = (id) => dom.el(id).classList.contains('visible');
const results = () => !dom.el('results-modal').classList.contains('hidden');

test('it boots to check-in with the four events and the four cars, and hands the renderer its loop', async () => {
    const main = await boot();
    const state = main.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.phase).toBe('checkin');
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
    expect(dom.loops.length).toBeGreaterThan(0);
    const events = inputsOf('event-options');
    expect(events.map((i) => i.value)).toEqual(['easy', 'medium', 'hard', 'trial']);
    expect(events.map((i) => i.checked)).toEqual([true, false, false, false]);
    const cars = inputsOf('car-options');
    expect(cars.map((i) => i.type)).toEqual(['radio', 'radio', 'radio', 'radio']);
    expect(cars.find((i) => i.checked).value).toBe('weekend');
    // The visitor's car and the Easy division wait at the pin.
    expect(main.__test__.meshes()).toHaveLength(4);
    // Nothing of the race shows behind the card.
    expect(shown('timer')).toBe(false);
    expect(shown('help-btn')).toBe(false);
    expect(() => frames(main, 0.5)).not.toThrow();
});

test('Go races the whole day, heat by heat, to the results', async () => {
    const main = await boot();
    choose(inputsOf('event-options')[2]);
    choose(inputsOf('car-options')[3]);
    fire(dom.el('go-btn'), 'click');
    const state = main.getState();
    expect(state.phase).toBe('race');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
    expect(shown('timer')).toBe(true);
    expect(shown('help-btn')).toBe(true);
    // The first heat's staging: the announcer names the slow lane.
    frames(main, 0.2);
    expect(dom.el('caption').textContent).toMatch(/Lane 4 runs a hair slow/);
    expect(shown('skip-btn')).toBe(false);
    // Through the first heat: its times are spoken, and Skip appears.
    const first = state.day.plan.heats[0];
    frames(main, first.end - 0.4);
    expect(dom.el('race-status').textContent).toMatch(/^Heat 1: /);
    expect(shown('skip-btn')).toBe(true);
    // To the end of the day.
    frames(main, state.day.plan.total);
    expect(state.phase).toBe('results');
    expect(results()).toBe(true);
    expect(shown('timer')).toBe(false);
    expect(dom.el('results-event').textContent).toBe('Hard division');
    const body = dom.el('results-table').children[1];
    expect(body.children).toHaveLength(4);
    expect(body.children.filter((r) => r.classList.contains('is-mine'))).toHaveLength(1);
    expect(dom.el('results-lanes').children).toHaveLength(4);
    expect(dom.el('results-why').children.length).toBeGreaterThan(0);
    expect(dom.el('results-status').textContent).toMatch(/^Hard division results\. 1st, /);
});

test('Skip goes straight to the results, and Race again runs the same race', async () => {
    const main = await boot();
    fire(dom.el('go-btn'), 'click');
    frames(main, 1);
    fire(dom.el('skip-btn'), 'click');
    const state = main.getState();
    expect(state.phase).toBe('results');
    expect(results()).toBe(true);
    const before = state.day.race.average.slice();
    fire(dom.el('results-again'), 'click');
    expect(state.phase).toBe('race');
    expect(results()).toBe(false);
    // The same cars post the same times: nothing random.
    expect(state.day.race.average).toEqual(before);
});

test('Escape and the back button step back to check-in, from the race and from the results', async () => {
    const main = await boot();
    const state = main.getState();
    fire(dom.el('go-btn'), 'click');
    frames(main, 2);
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('checkin');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
    expect(shown('timer')).toBe(false);
    fire(dom.el('go-btn'), 'click');
    fire(dom.el('help-btn'), 'click');
    expect(state.phase).toBe('checkin');
    fire(dom.el('go-btn'), 'click');
    main.__test__.finishRace('skip');
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('checkin');
    expect(results()).toBe(false);
    fire(dom.el('go-btn'), 'click');
    main.__test__.finishRace('skip');
    fire(dom.el('results-another'), 'click');
    expect(state.phase).toBe('checkin');
    // Escape at check-in does nothing.
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('checkin');
});

test('Time Trial takes one to four of the visitor\'s own cars, and says so when none is picked', async () => {
    const main = await boot();
    const state = main.getState();
    choose(inputsOf('event-options')[3]);
    const cars = inputsOf('car-options');
    expect(cars.map((i) => i.type)).toEqual(['checkbox', 'checkbox', 'checkbox', 'checkbox']);
    expect(dom.el('car-legend').textContent).toBe('Your cars, up to four');
    for (const c of cars) choose(c, false);
    expect(dom.el('checkin-note').hidden).toBe(false);
    fire(dom.el('go-btn'), 'click');
    expect(state.phase).toBe('checkin');
    choose(cars[0]);
    choose(cars[2]);
    fire(dom.el('go-btn'), 'click');
    expect(state.phase).toBe('race');
    expect(main.__test__.meshes()).toHaveLength(2);
    frames(main, state.day.plan.total + 1);
    expect(state.phase).toBe('results');
    expect(dom.el('results-why-heading').textContent).toBe('How your cars compared');
    expect(dom.el('results-why').children[0].textContent).toMatch(/beat/);
    // No row is lit when every car is the visitor's.
    const body = dom.el('results-table').children[1];
    expect(body.children.filter((r) => r.classList.contains('is-mine'))).toHaveLength(0);
    // Back to a division: one car again, by radio.
    fire(dom.el('results-another'), 'click');
    choose(inputsOf('event-options')[0]);
    expect(inputsOf('car-options').map((i) => i.type)).toEqual(['radio', 'radio', 'radio', 'radio']);
});

test('reduced motion: no slow replays and no chase camera', async () => {
    dom.windowStub.matchMedia = (q) => ({
        media: q, matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    const main = await boot();
    const state = main.getState();
    expect(state.reducedMotion).toBe(true);
    choose(inputsOf('event-options')[2]);
    choose(inputsOf('car-options')[3]);
    fire(dom.el('go-btn'), 'click');
    expect(state.day.plan.heats.every((h) => h.segments.every((s) => s.kind !== 'replay'))).toBe(true);
    frames(main, state.day.plan.total + 1);
    expect(state.phase).toBe('results');
});

test('a browser without WebGL 2 is taken to the main site with a note', async () => {
    delete dom.windowStub.WebGL2RenderingContext;
    await import('../www/derby/js/main.js');
    await flushAsync(5);
    expect(dom.el('load-status').textContent).toMatch(/can’t run the 3D view/);
    await jest.advanceTimersByTimeAsync(2600);
    expect(dom.replaced).toContain('/');
});
