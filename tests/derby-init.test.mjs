// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for Derby Day (www/derby): the whole visit, M3.
 *
 * Under the chainable THREE proxy nothing renders, but every line of a real
 * page load runs: the proof of work, the hall, the track and the workbench,
 * the bench with the visitor's car on it and the host's greeting, Race it,
 * the check-in card built from the events and the garage, Go, a whole race
 * day played frame by frame to the results, Skip, Escape and the back
 * buttons, Race again, Tune my car, a trophy and the harder division, the
 * Time Trial's checkboxes, the Outlaw exhibition, a returning visitor, a
 * browser that refuses storage, reduced motion, and the fallback for a
 * browser without WebGL. A missing import or a reference left behind fails
 * here instead of on the site. The race itself is measured for real in
 * derby-sim and derby-playback, the bench's controls in derby-bench.
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
const open = (id) => !dom.el(id).classList.contains('hidden');
const results = () => open('results-modal');
const host = () => dom.el('bench-host').textContent;
const raceIt = () => fire(dom.el('bench-race'), 'click');
const eventInput = (id) => inputsOf('event-options').find((i) => i.value === id);
/** Go, and past the weigh-in (watched for itself in its own tests). */
const go = () => {
    fire(dom.el('go-btn'), 'click');
    const skip = dom.el('skip-btn');
    if (skip.classList.contains('visible') && skip.textContent === 'Skip the weigh-in') fire(skip, 'click');
};

/** A bench control by its id, found in the panel the bench built. */
function find(root, test) {
    for (const c of root.children || []) {
        if (test(c)) return c;
        const deeper = find(c, test);
        if (deeper) return deeper;
    }
    return null;
}
const control = (id) => find(dom.el('bench-body'), (n) => n.id === id);

test('a first visit lands at the workbench, the car on the turntable and the host introducing it', async () => {
    const main = await boot();
    const state = main.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.phase).toBe('bench');
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
    expect(open('bench')).toBe(true);
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
    expect(host()).toMatch(/^Welcome to Derby Day! This is your car, Blue Wedge, already weighed to 5\.00 oz\./);
    expect(dom.el('bench-summary').textContent).toBe('Blue Wedge · 5.00 oz · balance 0.88 in');
    expect(main.__test__.benchMesh()).not.toBeNull();
    // The car the host introduced is kept from the first moment.
    const kept = JSON.parse(localStorage.getItem('derby-garage'));
    expect(kept.cars).toHaveLength(1);
    expect(kept.bench).toBe(kept.cars[0].id);
    // Nothing of the race shows, and the turntable turns.
    expect(shown('timer')).toBe(false);
    expect(shown('help-btn')).toBe(false);
    const spin = state.spin;
    frames(main, 1);
    expect(state.spin).toBeGreaterThan(spin);
});

test('Race it opens check-in with the five events and the garage\'s car, and Go races the whole day to the results', async () => {
    const main = await boot();
    const state = main.getState();
    raceIt();
    expect(state.phase).toBe('checkin');
    expect(open('bench')).toBe(false);
    expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
    expect(inputsOf('event-options').map((i) => i.value)).toEqual(['easy', 'medium', 'hard', 'trial', 'outlaw']);
    expect(eventInput('easy').checked).toBe(true);
    const cars = inputsOf('car-options');
    expect(cars.map((i) => i.type)).toEqual(['radio']);
    expect(cars[0].checked).toBe(true);
    expect(dom.el('car-options').children[0].textContent).toBe('Blue WedgeWedge · 5.00 oz · Standard');
    expect(main.__test__.meshes()).toHaveLength(4);
    choose(eventInput('hard'));
    // Go weighs the car in first: on the scale, through the gauge box.
    fire(dom.el('go-btn'), 'click');
    expect(state.phase).toBe('weighin');
    expect(dom.el('caption').textContent).toBe('Blue Wedge on the scale…');
    expect(shown('skip-btn')).toBe(true);
    expect(dom.el('skip-btn').textContent).toBe('Skip the weigh-in');
    frames(main, state.weigh.plan.total * 0.5);
    frames(main, state.weigh.plan.total * 0.5 + 0.1);
    expect(dom.el('race-status').textContent).toBe('Blue Wedge weighs 5.00 oz and passes the gauge box.');
    expect(state.phase).toBe('race');
    expect(dom.el('skip-btn').textContent).toBe('Skip to results');
    expect(shown('timer')).toBe(true);
    frames(main, 0.2);
    expect(dom.el('caption').textContent).toMatch(/Lane 4 runs a hair slow/);
    const first = state.day.plan.heats[0];
    frames(main, first.end - 0.4);
    expect(dom.el('race-status').textContent).toMatch(/^Heat 1: /);
    expect(shown('skip-btn')).toBe(true);
    frames(main, state.day.plan.total);
    expect(state.phase).toBe('results');
    expect(results()).toBe(true);
    expect(dom.el('results-event').textContent).toBe('Hard division');
    const body = dom.el('results-table').children[1];
    expect(body.children).toHaveLength(4);
    expect(body.children.filter((r) => r.classList.contains('is-mine'))).toHaveLength(1);
    expect(dom.el('results-why').children.length).toBeGreaterThan(0);
    // A car with its axles as they came does not win the Hard division.
    expect(dom.el('results-trophy').hidden).toBe(true);
    expect(dom.el('results-harder').hidden).toBe(true);
    // The result is in the garage.
    const last = main.__test__.garage().last();
    expect(last.event).toBe('hard');
    expect(last.place).toBe(state.day.race.standings.indexOf(0) + 1);
    expect(JSON.parse(localStorage.getItem('derby-garage')).last.event).toBe('hard');
});

test('Skip goes straight to the results, and Race again runs the same race', async () => {
    const main = await boot();
    raceIt();
    go();
    frames(main, 1);
    fire(dom.el('skip-btn'), 'click');
    const state = main.getState();
    expect(state.phase).toBe('results');
    const before = state.day.race.average.slice();
    fire(dom.el('results-again'), 'click');
    expect(state.phase).toBe('race');
    expect(results()).toBe(false);
    // The same car posts the same times: nothing random.
    expect(state.day.race.average).toEqual(before);
});

test('Escape and the back buttons step back: the race and the results to check-in, check-in to the bench', async () => {
    const main = await boot();
    const state = main.getState();
    // Escape at the bench does nothing.
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('bench');
    raceIt();
    go();
    frames(main, 2);
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('checkin');
    expect(shown('timer')).toBe(false);
    go();
    fire(dom.el('help-btn'), 'click');
    expect(state.phase).toBe('checkin');
    go();
    main.__test__.finishRace('skip');
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('checkin');
    expect(results()).toBe(false);
    go();
    main.__test__.finishRace('skip');
    fire(dom.el('results-another'), 'click');
    expect(state.phase).toBe('checkin');
    // From check-in, Escape and the back button both go to the bench.
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
    expect(state.phase).toBe('bench');
    expect(open('bench')).toBe(true);
    expect(host()).toBe('Here’s Blue Wedge on the bench, ready for another change or another race.');
    raceIt();
    fire(dom.el('checkin-back'), 'click');
    expect(state.phase).toBe('bench');
});

test('Tune my car brings the car back to the bench, the host pointing at what would help it most', async () => {
    const main = await boot();
    const state = main.getState();
    raceIt();
    go();
    main.__test__.finishRace('skip');
    fire(dom.el('results-tune'), 'click');
    expect(state.phase).toBe('bench');
    expect(results()).toBe(false);
    // A car with stock axles: the axles are worth the most, and their
    // section opens.
    expect(host()).toMatch(/^Here’s Blue Wedge back on the bench\. Polished axles and graphite would save 0\.\d{3} seconds\. You’ll find that under Axles and wheels\.$/);
    expect(dom.el('bench-body').children.find((c) => c.id === 'bench-axles-box').open).toBe(true);
});

test('a win puts a trophy on the shelf, and the next division is one tap away', async () => {
    const main = await boot();
    const state = main.getState();
    // The full axle treatment on the bench, a tap a step (M5).
    fire(control('bench-deburr'), 'click');
    for (let i = 0; i < 5; i++) fire(control('bench-polish'), 'click');
    fire(control('bench-graphite'), 'click');
    fire(control('bench-align'), 'click');
    expect(main.__test__.garage().bench().tune).toEqual({ deburr: true, polish: 5, graphite: true, align: true, sand: 0 });
    raceIt();
    go();
    main.__test__.finishRace('skip');
    expect(state.day.race.standings[0]).toBe(0);
    expect(dom.el('results-trophy').hidden).toBe(false);
    expect(dom.el('results-trophy').textContent).toBe('First place! A trophy for the Easy division is waiting on your workbench shelf.');
    expect(main.__test__.garage().trophies().easy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(localStorage.getItem('derby-trophies')).easy).toMatch(/^\d{4}-/);
    const harder = dom.el('results-harder');
    expect(harder.hidden).toBe(false);
    expect(harder.textContent).toBe('Try the Medium division');
    fire(harder, 'click');
    expect(state.phase).toBe('race');
    expect(state.event).toBe('medium');
    main.__test__.finishRace('skip');
    // Winning again says so, without a second trophy.
    fire(dom.el('results-another'), 'click');
    choose(eventInput('easy'));
    go();
    main.__test__.finishRace('skip');
    expect(dom.el('results-trophy').textContent).toBe('First place in the Easy division again!');
});

test('Time Trial races the garage\'s own cars against each other, and says so when none is picked', async () => {
    const main = await boot();
    const state = main.getState();
    fire(control('bench-new'), 'click');
    expect(main.__test__.garage().cars()).toHaveLength(2);
    raceIt();
    choose(eventInput('trial'));
    const cars = inputsOf('car-options');
    expect(cars.map((i) => i.type)).toEqual(['checkbox', 'checkbox']);
    expect(dom.el('car-legend').textContent).toBe('Your cars, up to four');
    for (const c of cars) choose(c, false);
    expect(dom.el('checkin-note').hidden).toBe(false);
    go();
    expect(state.phase).toBe('checkin');
    for (const c of cars) choose(c, true);
    go();
    expect(state.phase).toBe('race');
    expect(main.__test__.meshes()).toHaveLength(2);
    frames(main, state.day.plan.total + 1);
    expect(state.phase).toBe('results');
    expect(dom.el('results-event').textContent).toBe('Time Trial');
    expect(dom.el('results-why-heading').textContent).toBe('How your cars compared');
    const body = dom.el('results-table').children[1];
    expect(body.children.filter((r) => r.classList.contains('is-mine'))).toHaveLength(0);
    // Both cars' averages are kept.
    for (const c of main.__test__.garage().cars()) expect(main.__test__.garage().results(c.id).trial.average).toBeGreaterThan(3);
});

test('an Outlaw car races only the Time Trial and the Outlaw exhibition, and the board says which it was', async () => {
    const main = await boot();
    const state = main.getState();
    choose(control('bench-class-outlaw'));
    expect(main.__test__.garage().bench().rules).toBe('outlaw');
    expect(dom.el('bench-summary').textContent).toMatch(/16\.00 oz/);
    raceIt();
    // Easy is still chosen: the car is listed but cannot enter.
    const car = inputsOf('car-options')[0];
    expect(car.disabled).toBe(true);
    expect(dom.el('car-options').children[0].textContent).toMatch(/Outlaw cars race in the Time Trial and the Outlaw exhibition/);
    expect(dom.el('checkin-note').textContent).toMatch(/None of your cars can enter/);
    go();
    expect(state.phase).toBe('checkin');
    choose(eventInput('outlaw'));
    expect(inputsOf('car-options')[0].disabled).toBe(false);
    go();
    expect(state.phase).toBe('race');
    main.__test__.finishRace('skip');
    expect(dom.el('results-event').textContent).toBe('Outlaw exhibition');
    // In the Time Trial, its name carries the class.
    fire(dom.el('results-another'), 'click');
    choose(eventInput('trial'));
    go();
    expect(state.day.entries[0].name).toBe('Blue Wedge (Outlaw)');
});

test('a returning visitor hears where things stand, and Race again races the same event at once', async () => {
    let main = await boot();
    raceIt();
    choose(eventInput('medium'));
    go();
    main.__test__.finishRace('skip');
    const kept = Object.fromEntries(['derby-garage', 'derby-settings', 'derby-trophies'].map((k) => [k, localStorage.getItem(k)]));
    const place = main.getState().day.race.standings.indexOf(0) + 1;
    // A new visit, the same browser.
    dom.uninstall();
    jest.resetModules();
    installThree();
    dom = installDom({ innerWidth: 390, innerHeight: 844 });
    for (const [k, v] of Object.entries(kept)) if (v !== null) localStorage.setItem(k, v);
    main = await boot();
    const state = main.getState();
    expect(state.phase).toBe('bench');
    const words = ['1st', '2nd', '3rd', '4th'][place - 1];
    expect(host()).toBe(`Welcome back! Your car, Blue Wedge, finished ${words} in the Medium division. Would you like to tune it, or race again?`);
    const actions = dom.el('bench-host-actions').children;
    expect(actions.map((b) => b.textContent)).toEqual(['Race again', 'Tune it']);
    fire(actions[0], 'click');
    // Weighed in first: the car may have changed since.
    expect(state.phase).toBe('weighin');
    fire(dom.el('skip-btn'), 'click');
    expect(state.phase).toBe('race');
    expect(state.event).toBe('medium');
});

test('a browser that refuses storage still gets a whole visit', async () => {
    const refuse = () => { throw new Error('SecurityError'); };
    globalThis.localStorage = { getItem: refuse, setItem: refuse, removeItem: refuse };
    const main = await boot();
    const state = main.getState();
    expect(state.phase).toBe('bench');
    expect(host()).toMatch(/^Welcome to Derby Day!/);
    fire(control('bench-new'), 'click');
    expect(main.__test__.garage().cars()).toHaveLength(2);
    raceIt();
    go();
    main.__test__.finishRace('skip');
    expect(state.phase).toBe('results');
});

test('the sound is remembered: on as it was left, and the choice kept', async () => {
    localStorage.setItem('derby-settings', JSON.stringify({ units: 'us', sound: true }));
    const main = await boot();
    expect(dom.el('sound-btn').getAttribute('aria-pressed')).toBe('true');
    fire(dom.documentStub, 'keydown', { key: 'm' });
    expect(dom.el('sound-btn').getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('derby-settings')).sound).toBe(false);
    expect(main.__test__.sound.isOn()).toBe(false);
});

test('reduced motion: no slow replays, no chase camera, and the turntable stands still', async () => {
    dom.windowStub.matchMedia = (q) => ({
        media: q, matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    const main = await boot();
    const state = main.getState();
    expect(state.reducedMotion).toBe(true);
    frames(main, 1);
    expect(state.spin).toBe(0);
    // A drag still turns it, by hand.
    fire(dom.el('game-canvas'), 'pointerdown', { clientX: 100 });
    fire(dom.windowStub, 'pointermove', { clientX: 150 });
    fire(dom.windowStub, 'pointerup', {});
    expect(state.spin).toBeCloseTo(0.6, 6);
    raceIt();
    choose(eventInput('hard'));
    go();
    expect(state.day.plan.heats.every((h) => h.segments.every((s) => s.kind !== 'replay'))).toBe(true);
    frames(main, state.day.plan.total + 1);
    expect(state.phase).toBe('results');
});

test('the Cut plays on the turntable: the old car until the saw is through, then the cut one, then the host', async () => {
    const main = await boot();
    const state = main.getState();
    for (let i = 0; i < 6; i++) fire(control('bench-top-3'), 'keydown', { key: 'ArrowDown' });
    const before = main.__test__.benchMesh();
    fire(control('bench-cut'), 'click');
    expect(host()).toBe('Cutting along your line…');
    expect(main.__test__.garage().bench().carve).not.toBeNull();
    // The car turns side on and the saw runs: still the old car.
    state.spin = 1;
    frames(main, 1);
    expect(main.__test__.benchMesh()).toBe(before);
    expect(Math.abs(state.spin - 2 * Math.PI * Math.round(state.spin / (2 * Math.PI)))).toBeLessThan(0.01);
    // Through the saw: the cut car, the offcuts falling, then the host.
    frames(main, 2.2);
    expect(main.__test__.benchMesh()).not.toBe(before);
    frames(main, 1);
    expect(host()).toMatch(/^Cut! Auto-weigh moved the weights/);
    // Leaving the bench mid-cut finishes it.
    for (let i = 0; i < 2; i++) fire(control('bench-top-4'), 'keydown', { key: 'ArrowDown' });
    fire(control('bench-cut'), 'click');
    raceIt();
    expect(state.phase).toBe('checkin');
    expect(host()).toMatch(/^Cut!/);
});

test('a bulky car is told to carve some wood out to make room for its weight (M4.6)', async () => {
    const main = await boot();
    const block = control('bench-design-block');
    block.checked = true;
    fire(block, 'change');
    raceIt();
    go();
    main.__test__.finishRace('skip');
    const why = dom.el('results-why').children.map((li) => li.textContent).join(' ');
    expect(why).toMatch(/this body has no room for it there\. Carve some wood out of the middle/);
});

test('reduced motion: the Cut is a before and after', async () => {
    dom.windowStub.matchMedia = (q) => ({
        media: q, matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    const main = await boot();
    fire(control('bench-top-3'), 'keydown', { key: 'PageDown' });
    const before = main.__test__.benchMesh();
    fire(control('bench-cut'), 'click');
    expect(main.__test__.benchMesh()).not.toBe(before);
    expect(host()).toMatch(/^Cut!/);
});

test('a browser without WebGL 2 is taken to the main site with a note', async () => {
    delete dom.windowStub.WebGL2RenderingContext;
    await import('../www/derby/js/main.js');
    await flushAsync(5);
    expect(dom.el('load-status').textContent).toMatch(/can’t run the 3D view/);
    await jest.advanceTimersByTimeAsync(2600);
    expect(dom.replaced).toContain('/');
});
