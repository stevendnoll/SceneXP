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
    // A second finger on the lawn does not take the steering from the first.
    fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(main.__test__.pointer.id).toBe(1);

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

test('the aim follows the keys or the pointer, whichever moved last', async () => {
    const main = await import('../www/leaves/js/main.js');
    const held = { left: false, right: true, up: true, down: false };
    expect(main.aimFor('keys', { aim: null }, held)).toEqual({ mode: 'keys', x: 1, z: -1 });
    expect(main.aimFor('point', { aim: { x: 2, z: 3 } }, held)).toEqual({ mode: 'point', x: 2, z: 3 });
    expect(main.aimFor('point', { aim: null }, held)).toBe(null);
});

test('on a QA host the lab panel offers each leaf count, the shadows switch, and the M6 switches', async () => {
    await boot();
    const panel = dom.el('lab-panel');
    // The panel is built by script, so find it among the body's children.
    const built = dom.documentStub.body.children.find((c) => c.className === 'lab-panel');
    expect(built).toBeTruthy();
    const row = built.children.find((c) => c.className === 'lab-buttons');
    const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
    // The counts, shadows, Halloween week, and the finds showing.
    expect(row.children).toHaveLength(C.leaves.labCounts.length + 3);
    expect(row.children.map((b) => b.textContent).slice(-2)).toEqual(['Halloween week off', 'Finds hidden']);
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

describe('the round', () => {
    /** Step in, start the clock with Space, and play the minute through at a
     *  low frame rate (the sandbox is slow) until the end card is up. */
    async function playARound(main) {
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        expect(main.getState().round.phase).toBe('playing');
        // The minute, the leaves landing, and the dive into the pile.
        frames(main, 60 + C0.round.finaleMax, 20);
        expect(main.getState().endShown).toBe(true);
    }

    test('the HUD waits for the first blow, and the clock starts with it', async () => {
        const main = await boot();
        fire(dom.el('blocker'), 'click');
        expect(dom.el('round-hud').classList.contains('visible')).toBe(true);
        frames(main, 2, 20);
        expect(main.getState().round.phase).toBe('ready');
        expect(dom.el('hud-clock').textContent).toBe('1:00');
        expect(dom.el('hud-hint').hidden).toBe(false);
        expect(dom.el('hud-hint').textContent).toBe('Blow to start the clock');

        fire(dom.documentStub, 'keydown', { code: 'Space' });
        // The frame that starts the clock does not count toward it, so 2.5
        // seconds of frames leaves 57.55 seconds, which the clock rounds up.
        frames(main, 2.5, 20);
        expect(main.getState().round.phase).toBe('playing');
        expect(dom.el('hud-clock').textContent).toBe('0:58');
        expect(dom.el('hud-hint').hidden).toBe(true);
        expect(dom.el('round-status').textContent).toMatch(/clock is running/);
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
        const main = await boot();
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
        const main = await boot();
        await playARound(main);
        fire(dom.el('end-again'), 'click');
        const s = main.getState();
        expect(s.endShown).toBe(false);
        expect(s.round.phase).toBe('ready');
        expect(s.counted.lawn).toBe(s.counted.total);
        expect(dom.el('round-hud').classList.contains('visible')).toBe(true);
        expect(dom.el('hud-clock').textContent).toBe('1:00');
    });

    test('Keep blowing (or Escape) leaves the yard as it is, with no clock and a way back to a round', async () => {
        const main = await boot();
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

    test('the welcome card offers the yard with no clock', async () => {
        const main = await boot();
        fire(dom.el('free-btn'), 'click');
        expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
        expect(main.getState().round.phase).toBe('free');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 70, 20);
        expect(main.getState().endShown).toBe(false);
    });

    test('Share sends the result sentence', async () => {
        const main = await boot();
        await playARound(main);
        fire(dom.el('end-share'), 'click');
        await flushAsync();
        // No share sheet and no clipboard here, so the ladder ends at a mail.
        const sent = decodeURIComponent(dom.windowStub.location.href);
        expect(sent).toMatch(/^mailto:/);
        expect(sent).toMatch(/I cleared \d{1,3}% of my yard in 60 seconds\./);
        expect(main.getState().result).not.toBe(null);
    });
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
    });
});

describe('the finale (M3)', () => {
    /** Step in, blow once, and run the clock out, stopping at the finale. */
    async function toTheFinale(main) {
        fire(dom.el('blocker'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 0.2, 20);
        fire(dom.documentStub, 'keyup', { code: 'Space' });
        for (let s = 0; s < 70 && main.getState().round.phase !== 'finale'; s++) frames(main, 1, 20);
        expect(main.getState().round.phase).toBe('finale');
    }

    test('with nothing on the tarp, the dive finds the lawn, and the card and the share say so', async () => {
        const main = await boot();
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
        const main = await boot();
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
        const main = await boot();
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
        for (let s = 0; s < 70 && main.getState().round.phase !== 'finale'; s++) frames(main, 1, 20);
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
    });
});

describe('the character card (M4)', () => {
    /** The radio button for `id` in the group hosted by `host`. */
    function option(host, id) {
        const label = dom.el(host).children.find((l) => l.children[0].value === id);
        return label.children[0];
    }

    test('opens from the welcome card, beside a paused yard, with the current choice ticked', async () => {
        const main = await boot();
        expect(dom.el('cast-name').textContent).toBe('Playing as the weekend warrior.');
        fire(dom.el('cast-btn'), 'click');
        const s = main.getState();
        expect(s.castShown).toBe(true);
        expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
        expect(dom.el('round-hud').classList.contains('visible')).toBe(false);
        expect(dom.el('cast-presets').children).toHaveLength(6);
        expect(dom.el('cast-length').children).toHaveLength(4);
        expect(option('cast-presets', 'weekend').checked).toBe(true);
        // Nothing moves and no clock runs while it is open.
        fire(dom.documentStub, 'keydown', { code: 'Space' });
        frames(main, 1, 20);
        expect(main.getState().round.phase).toBe('ready');
        expect(main.getState().blowing).toBe(false);
    });

    test('each choice changes the person at once, and Done keeps it and goes back to the welcome card', async () => {
        const main = await boot();
        fire(dom.el('cast-btn'), 'click');
        const runner = option('cast-presets', 'runner');
        runner.checked = true;
        fire(runner, 'change');
        const gray = option('cast-hair', 'gray');
        gray.checked = true;
        fire(gray, 'change');
        expect(main.getState().cast).toMatchObject({ preset: 'runner', hair: 'gray' });
        expect(dom.el('cast-status').textContent).toBe('Gray');
        expect(() => frames(main, 0.5, 20)).not.toThrow();
        fire(dom.el('cast-done'), 'click');
        expect(main.getState().castShown).toBe(false);
        expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
        expect(dom.el('cast-name').textContent).toBe('Playing as the runner.');
        expect(JSON.parse(globalThis.localStorage.getItem('leaves-character'))).toMatchObject({ preset: 'runner', hair: 'gray' });
    });

    test('a kept choice is who turns up next visit, and Escape is Done', async () => {
        globalThis.localStorage.setItem('leaves-character', JSON.stringify({ preset: 'gardener', skin: 'brown', hair: 'blond', length: 'bald' }));
        const main = await boot();
        expect(main.getState().cast).toEqual({ preset: 'gardener', skin: 'brown', hair: 'blond', length: 'bald' });
        expect(dom.el('cast-name').textContent).toBe('Playing as the gardener.');
        fire(dom.el('cast-btn'), 'click');
        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(main.getState().castShown).toBe(false);
        expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
    });

    test('Forget my choice clears what was kept and brings back the default person', async () => {
        globalThis.localStorage.setItem('leaves-character', JSON.stringify({ preset: 'executive', skin: 'deep', hair: 'gray', length: 'long' }));
        const main = await boot();
        fire(dom.el('cast-btn'), 'click');
        fire(dom.el('cast-forget'), 'click');
        expect(globalThis.localStorage.getItem('leaves-character')).toBe(null);
        expect(main.getState().cast).toEqual({ preset: 'weekend', skin: 'fair', hair: 'darkBrown', length: 'short' });
        expect(option('cast-presets', 'weekend').checked).toBe(true);
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
    });

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
            const main = await boot();
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
            for (let k = 0; k < 90 && !main.getState().endShown; k++) frames(main, 1, 20);
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
        });

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
