// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-init.test.mjs - boot smoke for X's and O's.
 *
 * Under the chainable THREE proxy nothing renders, so this cannot say the
 * scene LOOKS right. What it can say is that every function a real page load
 * calls actually runs: the turf painter with its numerals and its yellow line,
 * the marker textures, the scoreboard face, the playbook's palette proxy, the
 * hand-built SVG on the sound toggle, and a whole play from the snap to the
 * whistle to the result card.
 *
 * THAT IS WORTH MORE HERE THAN IT LOOKS. This scene ran at 0% coverage while
 * its checks lived in a gitignored specs/ folder, so nothing in CI had ever
 * imported a line of it. A reference left behind by a refactor threw on the
 * live site and nowhere else.
 *
 * The assertions are about SHAPE rather than pixels: which controls exist,
 * what they are named, and that the ones a visitor has to tell apart are
 * actually told apart.
 */
import { jest } from '@jest/globals';
import { installThree, keepPropRecords } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { readFile } from 'node:fs/promises';

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    globalThis.localStorage = {
        store: new Map(),
        getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
        setItem(k, v) { this.store.set(k, String(v)); },
        removeItem(k) { this.store.delete(k); },
    };
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.localStorage;
});

/**
 * Boot the page. The opening plays first on every load, so unless a test is
 * about the opening itself it presses Skip, which lands on the welcome card
 * every other test starts from.
 */
async function boot({ watch = false } = {}) {
    const main = await import('../www/xo/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(1200);
    if (!watch) {
        const skip = dom.el('hud-actions').children.find((b) => b.id === 'skip-opening-btn');
        if (skip) skip.click();
        await flushAsync();
    }
    return main;
}

test('falls back to the 2D site when WebGL 2 is unavailable', async () => {
    // Three (r163 on) needs WebGL 2. Until 2026-10-01 this page had no check
    // at all, so a browser without it got a blank canvas and nothing else.
    delete dom.windowStub.WebGL2RenderingContext;
    await import('../www/xo/js/main.js');
    await flushAsync();
    expect(dom.el('load-status').textContent).toMatch(/can't run the 3D view/);
    await jest.advanceTimersByTimeAsync(3000);
    expect(dom.replaced).toEqual(['/']);
});

/** Every button currently in the action row, by its visible text. */
const actionLabels = () => dom.el('hud-actions').children.map((b) => b.textContent);

/** Drive frames until the play's result card is up, and insist that it is.
 *
 *  ONE HELPER BECAUSE 900 FRAMES WAS WRITTEN OUT FIVE TIMES AND FIXED ONCE.
 *  Every loop in this file that waits for a result card used to stop at 900,
 *  which is 15.0 s, under a comment saying that was well past the play timeout.
 *  It was, once: the play clock is `clock.decide`, 10 s. Then `clock.backstop`
 *  grew to 18 s and a celebration of up to `pose.celebration.cap` was added on
 *  the end, so the real worst case is 32 s. A rare long play therefore ran out
 *  of frames before its card, at about one run in seventy-five.
 *
 *  That was found and fixed in ONE of the five loops. The other four kept the
 *  900, and one of them is how Steve saw this fail on 2026-09-17. So the budget
 *  now lives in a single place and is derived from the config rather than
 *  written down, and every waiter goes through it.
 *
 *  IT ASSERTS THE CARD RATHER THAN LEAVING THAT TO THE CALLER, which is the
 *  other half of the same bug. The test that failed went straight from this
 *  loop to looking for the replay button, so what it reported was an empty
 *  button row on a line that looks like it should always hold. The real cause
 *  was one screen earlier and the message never said so.
 *
 *  `frame` is passed in because the callers do not share a clock convention:
 *  some drive `i * 16.7` from zero and some carry a running `now`, and that is
 *  deliberate in both cases. It is handed the frame index for the first kind
 *  and may ignore it. */
const runToResult = async (frame) => {
    const { XO_CONFIG: CFG } = await import('../www/xo/js/config.min.js');
    const budget = (CFG.clock.decide + CFG.clock.backstop + CFG.pose.celebration.cap + 2) * 60;
    for (let i = 0; i < budget && dom.el('result').hidden !== false; i += 1) frame(i);
    expect(dom.el('result').hidden).toBe(false);
};

/** The commonest shape of it: a fresh clock counted off the frame index. */
const runToResultFromZero = () => runToResult((i) => dom.loops[0](i * 16.7));

/** Walk from the welcome card into a live play. Returns the main module. */
async function toLivePlay() {
    const main = await boot();
    dom.el('welcome-actions').children[0].click();   // Take the field
    await flushAsync();
    // The playbook is open. Choosing is what starts a play.
    const { PLAYS } = await import('../www/xo/js/playbook-ui.js');
    // The stub's querySelector memoises a stand-in child rather than putting it
    // in `children`, so the grid is reached the same way playbook-ui reached
    // it: by the same selector, which returns the same node.
    const body = dom.el('playbook').querySelector('.playbook-body');
    const card = deep(body).find((n) => n.dataset && n.dataset.slug);
    expect(card).toBeTruthy();
    expect(PLAYS.some((p) => p.slug === card.dataset.slug)).toBe(true);
    card.click();
    await flushAsync();
    return main;
}

/** Every descendant of a node, the stub having no querySelectorAll worth using. */
function deep(node) {
    if (!node || !node.children) return [node];
    return [node, ...node.children.flatMap(deep)];
}

describe('booting', () => {
    test('runs to a ready state and retires the loading screen', async () => {
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        expect(main.getState().isRunning).toBe(true);
        expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
        expect(dom.loops.length).toBeGreaterThan(0);
    });

    test('survives a full frame with nothing to draw yet', async () => {
        await boot();
        // The frame loop reaches the band fade, the marker pulse and the camera
        // on the very first tick, before a play exists. All three used to be
        // reached only after a snap.
        expect(() => dom.loops[0](16)).not.toThrow();
        expect(() => dom.loops[0](32)).not.toThrow();
    });

    test('opens on the welcome card, with the target to beat on it', async () => {
        await boot();
        expect(dom.el('welcome').hidden).toBe(false);
        expect(dom.el('welcome-actions').children[0].textContent).toBe('Take the field');
    });
});

describe('the opening', () => {
    const skipButton = () => dom.el('hud-actions').children.find((b) => b.id === 'skip-opening-btn');
    // The stub makes elements on demand without the page's own `hidden`
    // attributes, so "the card is not up yet" is "the card has no buttons yet".
    const welcomeUp = () => dom.el('welcome').hidden === false && dom.el('welcome-actions').children.length > 0;
    let now = 0;
    const run = (seconds) => {
        for (let i = 0; i < Math.ceil(seconds * 10); i += 1) dom.loops[0](now += 100);
    };
    beforeEach(() => { now = 0; });

    test('plays before the welcome card, with Skip in focus', async () => {
        await boot({ watch: true });
        expect(welcomeUp()).toBe(false);
        expect(dom.el('game-hud').hidden).toBe(false);
        const skip = skipButton();
        expect(skip).toBeTruthy();
        expect(skip.textContent).toBe('Skip');
        expect(globalThis.document.activeElement).toBe(skip);
        // Escape is bound to it the way every other Skip is.
        expect(skip.dataset.keys).toBe('Escape');
    });

    /**
     * QA, 2026-09-22: "only the Skip button should be visible while the intro
     * animation is running."
     *
     * The HUD is two things stacked: a bar that REPORTS and a row that ACTS.
     * Through the opening the row carries one button and the bar was answering
     * questions the game has not asked yet, so a visitor watching the intro was
     * told they were on play 1 of 10 with a score of 0 and offered a mute
     * button over the top of it.
     */
    test('only the Skip button is on screen, and the readout is put away', async () => {
        await boot({ watch: true });
        expect(dom.el('game-hud').hidden).toBe(false);
        expect(dom.el('hud-bar').hidden).toBe(true);
        expect(dom.el('hud-actions').children.map((b) => b.textContent)).toEqual(['Skip']);
    });

    /** ...and it comes straight back, however the opening ended, or the game
     *  itself would be played without a score on it. */
    test('and the readout is back for the game', async () => {
        await boot({ watch: true });
        skipButton().click();
        await flushAsync();
        expect(dom.el('hud-bar').hidden).toBe(false);
    });

    test('the camera is flying the opening\'s own shots, not holding the play camera', async () => {
        await boot({ watch: true });
        const camera = await import('../www/xo/js/camera.min.js');
        const { shotAt } = await import('../www/xo/js/opening.min.js');
        run(1);
        expect(camera.getDriver()).toBe('show');
        const wide = shotAt(0, { aspect: 1280 / 800 });
        const play = camera.playDriver(1280 / 800);
        // A second in, it is nowhere near the play camera: it opened wide.
        const at = camera.update(0, { shot: shotAt(1, { aspect: 1280 / 800 }) }).position;
        expect(Math.hypot(at.x - play.position.x, at.y - play.position.y)).toBeGreaterThan(5);
        expect(wide.fov).not.toBeCloseTo(play.fov, 3);
    });

    test('Skip lands on exactly the welcome state', async () => {
        await boot({ watch: true });
        const props = await import('../www/xo/js/opening-props.min.js');
        run(3);
        expect(props.openingPropsShowing()).toBe(true);
        skipButton().click();
        await flushAsync();
        // The cooler, its table and the puddle are cleared with it.
        expect(props.openingPropsShowing()).toBe(false);
        expect(dom.el('welcome').hidden).toBe(false);
        expect(dom.el('welcome-actions').children[0].textContent).toBe('Take the field');
        expect(dom.el('game-hud').hidden).toBe(true);
        expect(dom.el('opening-title').hidden).toBe(true);
        run(0.2);
        const camera = await import('../www/xo/js/camera.min.js');
        expect(camera.getDriver()).toBe('play');
    });

    test('watched to the end, the card comes up over the shot the camera already holds', async () => {
        await boot({ watch: true });
        const camera = await import('../www/xo/js/camera.min.js');
        const { XO_CONFIG: CFG } = await import('../www/xo/js/config.min.js');
        run(CFG.opening.length - 0.25);
        expect(welcomeUp()).toBe(false);
        run(0.5);
        expect(welcomeUp()).toBe(true);
        expect(dom.el('game-hud').hidden).toBe(true);
        // The play camera, and the opening's last frame was the play camera.
        expect(camera.getDriver()).toBe('play');
    });

    test('a tap on the field does not skip it', async () => {
        await boot({ watch: true });
        run(1);
        fire(dom.el('game-canvas'), 'pointerdown', {
            clientX: 400, clientY: 300, pointerId: 1, button: 0, preventDefault() {},
        });
        await flushAsync();
        run(0.5);
        expect(welcomeUp()).toBe(false);
        expect(skipButton()).toBeTruthy();
    });

    test('the title arrives once, and is said once, with no team named', async () => {
        await boot({ watch: true });
        const { XO_CONFIG: CFG } = await import('../www/xo/js/config.min.js');
        run(CFG.opening.title[0] + 0.6);
        await jest.advanceTimersByTimeAsync(100);
        expect(dom.el('opening-title').hidden).toBe(false);
        expect(dom.el('hud-live').textContent).toBe(CFG.opening.copy.spoken);
        dom.el('hud-live').textContent = '';
        run(0.5);
        await jest.advanceTimersByTimeAsync(100);
        expect(dom.el('hud-live').textContent).toBe('');
    });

    test('a game left unfinished still gets the opening, then the card offers it back', async () => {
        localStorage.setItem('exes-n-ohs-game', JSON.stringify({
            v: 1, playNumber: 3, total: 20,
            results: [{ points: 5 }, { points: 15 }, { points: 0 }],
        }));
        await boot({ watch: true });
        expect(welcomeUp()).toBe(false);
        skipButton().click();
        await flushAsync();
        expect(dom.el('welcome').hidden).toBe(false);
        expect(dom.el('welcome-actions').children[0].textContent).toBe('Back to the game');
    });

    test('the console hook plays it again from the welcome card', async () => {
        await boot();
        expect(dom.el('welcome').hidden).toBe(false);
        expect(window.xo.opening()).toBe('Playing the opening.');
        expect(dom.el('welcome').hidden).toBe(true);
        expect(skipButton()).toBeTruthy();
        expect(window.xo.show(100)).toMatch(/^Not during the opening/);
        skipButton().click();
        await flushAsync();
        expect(dom.el('welcome').hidden).toBe(false);
    });
});

describe('team colors', () => {
    const colorsButton = (root) => deep(root)
        .find((n) => (n.textContent || '').trim() === 'Team colors');

    test('the Team colors button sits between How to play and the sound, and the card comes back to the book', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();   // Take the field
        await flushAsync();
        const head = dom.el('playbook').querySelector('.playbook-head');
        const row = head.children.find((n) => n.className === 'playbook-controls');
        const colors = colorsButton(head);
        expect(colors).toBeTruthy();
        expect((row.children[0].textContent || '').trim()).toBe('How to play');
        expect(row.children[1]).toBe(colors);
        expect(row.children[2].className).toContain('playbook-mute');

        colors.click();
        // One dialog at a time, as with How to play.
        expect(dom.el('playbook').hidden).toBe(true);
        expect(dom.el('colors').hidden).toBe(false);
        expect(dom.el('colors-panel').focused).toBe(true);

        dom.el('colors-x-jersey').value = '#241773';
        fire(dom.el('colors-x-jersey'), 'change');
        const C = await import('../www/xo/js/colors.min.js');
        expect(C.jerseyOf(0)).toBe('#241773');

        dom.el('colors-done').click();
        expect(dom.el('colors').hidden).toBe(true);
        expect(dom.el('playbook').hidden).toBe(false);
        expect(colors.focused).toBe(true);
        expect(JSON.parse(localStorage.getItem('exes-n-ohs-team-colors')).teams[0].jersey).toBe('#241773');
    });

    test('saved colors are in place before anything is built, so the opening wears them', async () => {
        localStorage.setItem('exes-n-ohs-team-colors', JSON.stringify({
            v: 1, teams: { 0: { jersey: '#4b2e83', helmet: null }, 1: { jersey: '#ffb612', helmet: '#000000' } },
            field: '#1f5c2e',
        }));
        await boot({ watch: true });
        const C = await import('../www/xo/js/colors.min.js');
        expect(C.jerseyOf(0)).toBe('#4b2e83');
        expect(C.helmetOf(1)).toBe('#000000');
    });

    test('the console hook dresses the teams, keeps it, and puts it all back', async () => {
        await boot();
        const C = await import('../www/xo/js/colors.min.js');
        expect(JSON.parse(window.xo.colors()).teams[0].jersey).toBe('#ff992c');
        window.xo.colors({ x: '#241773', o: '#ffb612', oHelmet: '#000000' });
        expect(C.jerseyOf(0)).toBe('#241773');
        expect(C.helmetOf(1)).toBe('#000000');
        const saved = JSON.parse(localStorage.getItem('exes-n-ohs-team-colors'));
        expect(saved.teams[1]).toEqual({ jersey: '#ffb612', helmet: '#000000' });
        // The field too, with the warning the card will show.
        const answer = JSON.parse(window.xo.colors({ field: '#ffb612' }));
        expect(C.fieldColor()).toBe('#ffb612');
        expect(answer.warnings).toEqual([
            "The O's jerseys are close to the field color, so those players may be hard to see.",
        ]);
        expect(JSON.parse(localStorage.getItem('exes-n-ohs-team-colors')).field).toBe('#ffb612');
        window.xo.colors('reset');
        expect(C.isDefault()).toBe(true);
        expect(localStorage.getItem('exes-n-ohs-team-colors')).toBeNull();
    });
});

describe('the opening for somebody who asked not to be moved about', () => {
    test('is the shorter, held version, and still ends on the welcome card', async () => {
        const plain = globalThis.window.matchMedia;
        globalThis.window.matchMedia = (q) => ({
            matches: /reduce/.test(q), media: q,
            addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
        });
        await boot({ watch: true });
        const { XO_CONFIG: CFG } = await import('../www/xo/js/config.min.js');
        let now = 0;
        for (let i = 0; i < Math.ceil((CFG.opening.calm.length + 0.3) * 10); i += 1) {
            dom.loops[0](now += 100);
        }
        expect(dom.el('welcome').hidden).toBe(false);
        expect(CFG.opening.calm.length).toBeLessThan(CFG.opening.length);
        globalThis.window.matchMedia = plain;
    });
});

describe('the sound toggle is a control', () => {
    test('carries a drawn icon and a label, not just a phrase', async () => {
        await boot();
        const btn = dom.el('mute-btn');
        const svg = btn.children.find((c) => c.tagName === 'SVG');
        expect(svg).toBeTruthy();
        expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
        // Two paths: the cone, and either the waves or the cross.
        expect(svg.children.filter((c) => c.tagName === 'PATH').length).toBe(2);
        expect(btn.children.some((c) => c.textContent === 'Sound on'
            || c.textContent === 'Sound off')).toBe(true);
    });

    test('announces its state through aria-pressed, and it changes', async () => {
        await boot();
        const btn = dom.el('mute-btn');
        const before = btn.getAttribute('aria-pressed');
        btn.click();
        await flushAsync();
        expect(btn.getAttribute('aria-pressed')).not.toBe(before);
        // And the icon was rebuilt rather than left showing the old state.
        expect(btn.children.find((c) => c.tagName === 'SVG')).toBeTruthy();
    });
});

/**
 * PRESS A CONTROL BY ITS NAME, NOT BY WHERE IT SITS.
 *
 * These used to press `children[0]`, which was the snap button right up until
 * the pre-snap row grew a "Change play" beside it, at which point four tests
 * started snapping by pressing the wrong control. A test that knows the order
 * of a row is a test that has to be edited every time the row changes, and it
 * fails in a way that says nothing about what actually broke.
 */
const press = (label) => {
    const btn = dom.el('hud-actions').children
        .find((b) => (b.textContent || '').includes(label));
    if (!btn) throw new Error(`no control labelled ${label}: ${actionLabels().join(', ')}`);
    btn.click();
};

describe('a play, end to end', () => {
    test('reaches the snap button and then the throw row', async () => {
        await toLivePlay();
        expect(actionLabels()).toEqual(['Change play', 'Snap the ball']);

        press('Snap the ball');
        await flushAsync();

        const labels = actionLabels();
        expect(labels[labels.length - 1]).toBe('Keep it');
        expect(labels.length).toBeGreaterThan(1);
        for (const label of labels.slice(0, -1)) {
            expect(label).toMatch(/^Throw [ABCD]$/);
        }
    });

    /**
     * THE NAME A SCREEN READER HEARS BEGINS WITH THE WORDS ON THE BUTTON.
     *
     * WCAG 2.5.3, Label in Name, from the 2026-09-14 accessibility sweep. Seven
     * buttons in this game were named by an aria-label written as a separate
     * sentence ("Keep it" was "Keep the ball and run"), so a voice control user
     * saying "click Keep it" matched nothing. Checked on both rows a visitor
     * meets on every play, and with the text read from the button rather than
     * a list here, so a new control is covered the day it lands.
     */
    test('every control in the action row is named by the words it shows', async () => {
        const check = () => {
            const row = dom.el('hud-actions').children;
            expect(row.length).toBeGreaterThan(0);
            for (const b of row) {
                const shown = (b.textContent || '').trim();
                const name = b.getAttribute('aria-label') ?? shown;
                expect({ shown, startsWithIt: name.startsWith(shown) })
                    .toEqual({ shown, startsWithIt: true });
            }
        };
        await toLivePlay();
        check();                    // Change play, Snap the ball
        press('Snap the ball');
        await flushAsync();
        check();                    // Throw A to D, Keep it
    });

    /**
     * THE THROW BUTTONS HAVE TO BE TELLABLE APART, which is the whole finding
     * this batch started from: the letters existed on the buttons and nowhere a
     * visitor could see them. Each button now carries its receiver's colour as
     * a swatch, and no two receivers may share one.
     */
    test('each throw button wears its own receiver\'s colour', async () => {
        const { XO_CONFIG: CFG } = await import('../www/xo/js/config.js');
        await toLivePlay();
        press('Snap the ball');
        await flushAsync();

        const throws = dom.el('hud-actions').children
            .filter((b) => b.dataset && b.dataset.receiver);
        expect(throws.length).toBeGreaterThan(1);

        const inks = new Set();
        for (const btn of throws) {
            const who = CFG.receivers[btn.dataset.receiver];
            expect(who).toBeTruthy();
            expect(btn.textContent).toContain(who.letter);
            // Named by its own words, so voice control can say what it sees.
            expect(btn.getAttribute('aria-label')).toBeNull();
            expect(btn.textContent).toBe(`Throw ${who.letter}`);
            expect(btn.style.getPropertyValue('--throw-ink')).toBe(who.ink);
            inks.add(who.ink);
        }
        expect(inks.size).toBe(throws.length);
    });

    test('runs to a whistle and shows what it was worth', async () => {
        await toLivePlay();
        press('Snap the ball');
        await flushAsync();
        press('Throw');
        await flushAsync();

        // PAST THE BACKSTOP AND THE LONGEST PARTY, whatever the simulation
        // decides, so this cannot hang on a play that never ends. See
        // `runToResult`, which is where that budget lives now.
        await runToResultFromZero();
        expect(dom.el('result-headline').textContent).toBeTruthy();
        expect(dom.el('result-running').textContent).toMatch(/Score -?\d+ after 1 of 10/);
        // The card sits low and lets the field through, which is a class the
        // markup carries rather than something JS adds.
    });
});

describe('the ball is drawn wherever it is', () => {
    /**
     * THIS IS THE BUG THAT WAS REPORTED TWICE. The replay path found the ball
     * object and handed it over; both LIVE paths passed a hard-coded `null` and
     * only ever offered a carrier. So from the frame the quarterback let go
     * until somebody caught it, nobody was carrying and the ball was simply
     * switched off, while the replay of the same play showed the arc perfectly.
     *
     * One function now serves all three call sites, and these assert its
     * choice. They would both pass against the old replay path and the second
     * one fails against the old live path, which is the whole point.
     */
    const ball = (x, y) => ({ settings: { position: 'ball', benched: false },
        coords: { x, y, z: 4 }, state: { xSpeed: 3, ySpeed: 1 } });
    const man = (position, carrying) => ({ settings: { position, benched: false },
        coords: { x: 200, y: 300, z: 0 }, state: { xSpeed: 0, ySpeed: 0, hasBall: carrying } });

    test('in the air, with nobody holding it, it is still drawn', async () => {
        const main = await boot();
        expect(main.showBall([man('qb', false), man('wr1', false), ball(500, 400)], 0.016))
            .toBe('flying');
    });

    test('once caught, the catcher holds it and it stops flying', async () => {
        const main = await boot();
        // The ball object survives a catch with its coordinates intact, which
        // is why asking "is there a ball object" first left it on the turf.
        expect(main.showBall([man('qb', false), man('wr1', true), ball(500, 400)], 0.016))
            .toBe('carried');
    });

    test('before the snap it rides in the quarterback\'s hands', async () => {
        const main = await boot();
        expect(main.showBall([man('qb', true), man('wr1', false)], 0.016)).toBe('carried');
        // And even with no hasBall recorded at all, which is the pre-throw
        // shape of an older recording.
        expect(main.showBall([man('qb', undefined)], 0.016)).toBe('carried');
    });
});

describe('a replay can be got out of', () => {
    /**
     * THE GAME PLAYS THE HIGHLIGHTS UNASKED (D36), which is a good default and
     * was a dead end: the HUD was hidden for the duration, so a replay that
     * started on its own could only be waited out. The default stays and the
     * dead end goes.
     */
    test('the button is there while a replay is running, and it takes focus', async () => {
        const main = await toLivePlay();
        press('Snap the ball');
        await flushAsync();
        press('Throw');
        await flushAsync();
        await runToResultFromZero();
        // Ask for the replay from the result card.
        //
        // THE PLAY ITSELF IS RANDOMISED, so this button is the one thing here
        // that is not guaranteed: `showResult` only offers it when a recording
        // exists, and a play that somehow ended before a single tick would have
        // none. Saying so explicitly beats an occasional mystery failure on a
        // line that looks like it should always hold.
        const watch = dom.el('result-actions').children
            .find((b) => b.textContent === 'Watch the replay');
        // If this is ever missing it means the play recorded no frames, which
        // is the only state in which the card withholds the button.
        expect(dom.el('result-actions').children.map((b) => b.textContent))
            .toContain('Watch the replay');
        watch.click();
        await flushAsync();
        dom.loops[0](50000);

        const skip = dom.el('hud-actions').children
            .find((b) => b.textContent === 'Skip replay');
        expect(skip).toBeTruthy();
        expect(skip.getAttribute('aria-label')).toBe('Skip replay and see the result');
        expect(dom.el('game-hud').hidden).toBe(false);
        expect(skip.focused).toBe(true);

        /**
         * AND A WAY TO SEE IT FROM SOMEWHERE ELSE, QA ROUND TWENTY-TWO. The
         * drag it replaces was "too hard to control", and the reason a button
         * beats it is that a button cannot be got wrong.
         *
         * IT DOES NOT TAKE FOCUS. The skip still does, because it is the way
         * out of something that started on its own, which is the case that
         * matters most for somebody on a keyboard.
         */
        const swap = dom.el('hud-actions').children
            .find((b) => b.textContent === 'Switch view');
        expect(swap).toBeTruthy();
        expect(swap.getAttribute('aria-label'))
            .toBe('Switch view to see the replay from another side of the field');
        expect(swap.getAttribute('aria-keyshortcuts')).toBe('V');
        expect(swap.focused).not.toBe(true);
        // Pressing it changes the camera and leaves the replay running.
        // THE MIN BUILD, because main.js imports that one: asking `camera.js`
        // would be holding a second copy of the module's state and it would
        // answer 0 forever however many times the button was pressed.
        const camera = await import('../www/xo/js/camera.min.js');
        // AND NOTHING UNDER THEM EXPLAINING THEM. A labelled button is not a
        // gesture: it says what it does on its face, so the line that used to
        // sit here was repeating the button and taking a strip of the picture
        // to do it (QA round twenty-three).
        expect(dom.el('hud-actions').children.map((n) => n.tagName))
            .not.toContain('P');
        const before = camera.viewQuarter();
        swap.click();
        await flushAsync();
        expect(camera.viewQuarter()).not.toBe(before);
        expect(dom.el('result').hidden).toBe(true);
        // The hint going away is NOT asserted here, and deliberately: it is
        // removed through `document.getElementById`, and the stub's lookup only
        // knows the ids the fixture declares, so it hands back a fresh detached
        // node and the removal is a no-op that proves nothing either way.

        // And pressing it lands back on the result rather than nowhere.
        expect(dom.el('result').hidden).toBe(true);
        skip.click();
        await flushAsync();
        expect(dom.el('result').hidden).toBe(false);
        expect(dom.el('hud-actions').children.length).toBe(0);
        void main;
    });

    /**
     * THE STANDS CHEER IN THE REPLAY TOO (QA, 2026-09-14). The cheer was a
     * one-off call on the live whistle's frame, and the replay only re-ran the
     * tackle and the celebration when its recording reached the whistle, so the
     * second look ended in stands that sat perfectly still.
     *
     * TWO HALVES, and the first matters as much as the second: a replay rewinds
     * to the snap, so a cheer still running from the live play has to be sat
     * down, or the fans are frozen mid-hop through the whole replay.
     *
     * Read through `cheerState` from the MIN build, which is the copy main.js
     * imports and so the one holding the state.
     */
    test('the stands sit down for the rewind and go up again at the whistle', async () => {
        const spectacle = await import('../www/xo/js/spectacle.min.js');
        const main = await toLivePlay();
        press('Snap the ball');
        await flushAsync();
        press('Throw');
        await flushAsync();
        // ONE CLOCK FOR THE WHOLE TEST, for the reason the test below gives.
        let now = 0;
        const frame = () => { now += 16.7; dom.loops[0](now); };
        await runToResult(frame);

        const watch = dom.el('result-actions').children
            .find((b) => b.textContent === 'Watch the replay');
        expect(watch).toBeTruthy();
        watch.click();
        await flushAsync();
        expect(spectacle.cheerState()).toBeNull();
        const rewoundAt = main.getState().elapsed;

        let raised = null;
        for (let i = 0; i < 2000 && dom.el('result').hidden !== false; i += 1) {
            frame();
            raised = raised || spectacle.cheerState();
        }
        expect(dom.el('result').hidden).toBe(false);
        expect(raised).not.toBeNull();
        // Raised during THIS replay, at its whistle, not left over from the play.
        // STRICTLY AFTER THE REWIND, AND NO MARGIN. The play is rolled with
        // Math.random, and a quick one reaches its whistle 14 frames (0.234s)
        // into the replay, so the old `+ 0.3` failed about one run in three.
        // Strict is still enough: a leftover cheer started before the rewind,
        // and one wrongly raised on the replay's first frame starts exactly at
        // it, because the cycle steps before the frame's delta is added.
        expect(raised.start).toBeGreaterThan(rewoundAt);
    });

    /**
     * QA ROUND TWENTY-THREE: A SECOND LOOK AT THE SAME PLAY KEEPS THE ANGLE.
     *
     * Somebody who switches the view and then presses "Watch the replay" again
     * is asking for THAT play from THAT angle, and handing them the default
     * back makes the button they just pressed look broken. The next play is a
     * new question and opens on the shot the director composed.
     */
    test('a second look at the same play opens where the first one left off', async () => {
        const camera = await import('../www/xo/js/camera.min.js');
        // ONE CLOCK FOR THE WHOLE TEST. The frame loop reads its timestamp, so
        // restarting the count for the second play hands it a jump backwards
        // and nothing advances: the second replay would sit on frame one and
        // the test would be measuring the wrong thing while passing.
        let now = 0;
        const frames = (n) => { for (let i = 0; i < n; i += 1) dom.loops[0](now += 16.7); };
        const toResult = () => runToResult(() => frames(1));
        const watch = async () => {
            const b = dom.el('result-actions').children
                .find((x) => x.textContent === 'Watch the replay');
            expect(b).toBeTruthy();
            b.click();
            await flushAsync();
            frames(2);
        };
        const pressIn = (label) => {
            const b = dom.el('hud-actions').children.find((x) => x.textContent === label);
            expect(b).toBeTruthy();
            b.click();
        };

        await toLivePlay();
        press('Snap the ball');
        await flushAsync();
        press('Throw');
        await flushAsync();
        await toResult();

        await watch();
        expect(camera.viewQuarter()).toBe(0);
        pressIn('Switch view');
        pressIn('Switch view');
        const chosen = camera.viewQuarter();
        expect(chosen).not.toBe(0);
        pressIn('Skip replay');
        await flushAsync();

        // Same play, second look: the angle they chose is still there.
        await watch();
        expect(camera.viewQuarter()).toBe(chosen);
        pressIn('Skip replay');
        await flushAsync();

        // On to play two, which is a new question and opens on the shot the
        // director composed.
        dom.el('result-actions').children
            .find((b) => b.textContent === 'Next play').click();
        await flushAsync();
        // The playbook is open again, reached the way `toLivePlay` reaches it.
        const body = dom.el('playbook').querySelector('.playbook-body');
        deep(body).find((n) => n.dataset && n.dataset.slug).click();
        await flushAsync();
        press('Snap the ball');
        await flushAsync();
        press('Throw');
        await flushAsync();
        await toResult();

        await watch();
        expect(camera.viewQuarter()).toBe(0);
    });
});

describe('the markup and the stylesheet agree', () => {
    const read = (p) => import('node:fs').then((fs) =>
        fs.readFileSync(new URL(`../www/xo/${p}`, import.meta.url), 'utf8'));

    test('every class the result card relies on is defined', async () => {
        const html = await read('index.html');
        const css = await read('css/experience.css');
        expect(html).toContain('card-overlay-low');
        expect(css).toContain('.card-overlay-low');
        expect(css).toContain('.throw-dot');
        expect(css).toContain('.hud-mute-icon');
        expect(css).toContain('.welcome-target');
    });

    /**
     * A STYLESHEET EDIT WITHOUT A VERSION BUMP SHIPS NEW MARKUP TO A CACHED OLD
     * SHEET, which on this page would leave the throw swatches and the low
     * result card unstyled for every returning visitor. The preload link counts
     * too, and it is the one that gets forgotten.
     */
    test('the stylesheet link and its preload carry the same version', async () => {
        const html = await read('index.html');
        const versions = [...html.matchAll(/experience\.min\.css\?v=(\d+)/g)].map((m) => m[1]);
        expect(versions.length).toBe(2);
        expect(new Set(versions).size).toBe(1);
    });

    /**
     * AMERICAN ENGLISH, and for a football game it is not a nicety. "Offence"
     * and "defence" shipped across the markup, the stylesheet and nine modules.
     */
    test('nothing on the page is spelled the British way', async () => {
        for (const path of ['index.html', 'css/experience.css']) {
            expect(await read(path)).not.toMatch(/\b(offence|defence)\b/i);
        }
    });
});

describe('changing the play before the snap', () => {
    /**
     * QA ROUND ELEVEN. The snap is the visitor's rather than a timer's precisely
     * so they can read the formation for as long as they like, and reading a
     * formation is how somebody works out they called the wrong play. Offering
     * only one way forward from there makes the reading pointless.
     *
     * THE PROPERTY THAT MATTERS IS THE PLAY NUMBER. A change of mind is not a
     * play: a visitor who re-reads the formation and picks again has not used
     * one of their ten, and getting that wrong is a bug nobody would notice
     * until the game ended two plays early.
     */
    const openBook = async () => {
        press('Change play');
        await flushAsync();
    };
    const anyCard = () => {
        const body = dom.el('playbook').querySelector('.playbook-body');
        return deep(body).find((n) => n.dataset && n.dataset.slug);
    };

    test('the pre-snap row offers it, and it opens the book', async () => {
        await toLivePlay();
        expect(actionLabels()).toContain('Change play');
        expect(dom.el('playbook').hidden).toBe(true);
        await openBook();
        expect(dom.el('playbook').hidden).toBe(false);
    });

    test('picking again does not spend a play', async () => {
        await toLivePlay();
        const before = dom.el('hud-play').textContent;
        await openBook();
        anyCard().click();
        await flushAsync();
        expect(dom.el('hud-play').textContent).toBe(before);
        // And it comes back to a formation waiting on a snap, not to a live play.
        expect(actionLabels()).toEqual(['Change play', 'Snap the ball']);
        expect(dom.el('playbook').hidden).toBe(true);
    });

    test('snapping after a change still starts exactly one play', async () => {
        await toLivePlay();
        const before = Number(dom.el('hud-play').textContent);
        await openBook();
        anyCard().click();
        await flushAsync();
        press('Snap the ball');
        await flushAsync();
        expect(Number(dom.el('hud-play').textContent)).toBe(before);
        // The throw row, which is what being live looks like.
        expect(actionLabels().some((l) => /^Throw /.test(l))).toBe(true);
    });

    /**
     * AND THERE IS A WAY BACK OUT. A second thought has to be allowed to be a
     * third one. Between plays the book still has no exit, because a play has to
     * be called.
     */
    test('the book opened for a change can be backed out of', async () => {
        await toLivePlay();
        await openBook();
        const head = dom.el('playbook').querySelector('.playbook-head');
        const cancel = deep(head).find((n) => (n.textContent || '') === 'Keep this play');
        expect(cancel).toBeTruthy();
        cancel.click();
        await flushAsync();
        expect(dom.el('playbook').hidden).toBe(true);
        expect(actionLabels()).toEqual(['Change play', 'Snap the ball']);
    });

    test('and the book opened between plays has no way out', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        const head = dom.el('playbook').querySelector('.playbook-head');
        const cancel = deep(head).find((n) => (n.textContent || '') === 'Keep this play');
        expect(cancel).toBeFalsy();
    });

    /**
     * THE SOUND CAN BE TURNED OFF FROM THE PLAYBOOK, which is QA round
     * twenty-seven item 3.
     *
     * The HUD bar holds the only mute in the game and the playbook covers it,
     * so the screen a visitor sits on between plays, and the first one they see
     * after the welcome card, was the one screen where the sound could not be
     * turned off.
     */
    const soundButton = (root) => deep(root)
        .find((n) => /^Sound (on|off)$/.test((n.textContent || '').trim()));

    test('the playbook has a sound control of its own', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        const head = dom.el('playbook').querySelector('.playbook-head');
        expect(soundButton(head)).toBeTruthy();
    });

    /**
     * ...AND IT IS THE SAME SETTING, SAYING THE SAME THING. Two buttons on one
     * setting is two chances to tell a visitor it did not take: turning the
     * sound off in the playbook and then reading "Sound on" in the HUD is a
     * control that looks broken.
     */
    test('and it stays in step with the one in the HUD bar', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        const head = dom.el('playbook').querySelector('.playbook-head');
        const inBook = soundButton(head);
        const inHud = dom.el('mute-btn');
        expect(inBook).toBeTruthy();
        expect(inHud.getAttribute('aria-pressed')).toBe(inBook.getAttribute('aria-pressed'));

        const before = inBook.getAttribute('aria-pressed');
        inBook.click();
        expect(inBook.getAttribute('aria-pressed')).not.toBe(before);
        expect(inHud.getAttribute('aria-pressed')).toBe(inBook.getAttribute('aria-pressed'));
        expect(inHud.textContent).toContain(inBook.textContent.trim());

        // ...and back, so the test leaves the setting where it found it.
        inBook.click();
        expect(inBook.getAttribute('aria-pressed')).toBe(before);
    });

    /**
     * THE RULES CAN BE READ AGAIN. The welcome card was seen once a page load,
     * so a visitor who pressed "Take the field" before reading had no way back
     * to the rules or to the directory link short of reloading the tab.
     */
    const helpButton = (root) => deep(root)
        .find((n) => (n.textContent || '').trim() === 'How to play');
    const welcomeLabels = () => dom.el('welcome-actions').children.map((b) => b.textContent);
    const escape = () => fire(dom.documentStub, 'keydown', { key: 'Escape' });

    test('How to play reopens the welcome card in place of the book, and comes back', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();   // Take the field
        await flushAsync();
        const head = dom.el('playbook').querySelector('.playbook-head');
        const help = helpButton(head);
        expect(help).toBeTruthy();
        // It leads the row of game controls, ahead of the sound.
        const row = head.children.find((n) => n.className === 'playbook-controls');
        expect(row.children[0]).toBe(help);

        help.click();
        // One dialog at a time: the focus trap wraps whichever it finds last.
        expect(dom.el('playbook').hidden).toBe(true);
        expect(dom.el('welcome').hidden).toBe(false);
        expect(welcomeLabels()).toEqual(['Back to the playbook']);
        expect(dom.el('welcome-resume').hidden).toBe(true);
        expect(dom.el('welcome-actions').children[0].focused).toBe(true);

        dom.el('welcome-actions').children[0].click();
        expect(dom.el('welcome').hidden).toBe(true);
        expect(dom.el('playbook').hidden).toBe(false);
        expect(help.focused).toBe(true);
    });

    /**
     * ...AND THE CAMERA HOLDS STILL WHILE THEY ARE READ. Behind the playbook the
     * idle camera slides across the field, and under a card of rules that is a
     * moving background. It freezes where it is rather than cutting to another
     * shot, and carries on from there.
     */
    test('the idle camera stops under the rules card and resumes from the same spot', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();   // Take the field
        await flushAsync();
        // THE MIN BUILD, the copy main.js imports. `update(0)` reads the shot
        // without moving the camera's clock.
        const camera = await import('../www/xo/js/camera.min.js');
        let now = 0;
        const frames = (n) => { for (let i = 0; i < n; i += 1) dom.loops[0](now += 100); };
        const sway = () => camera.update(0).position.z;

        frames(20);
        expect(camera.getDriver()).toBe('idle');
        const before = sway();
        frames(20);
        expect(sway()).not.toBeCloseTo(before, 3);      // it is moving

        helpButton(dom.el('playbook').querySelector('.playbook-head')).click();
        const held = sway();
        frames(40);
        expect(sway()).toBeCloseTo(held, 9);

        dom.el('welcome-actions').children[0].click();   // Back to the playbook
        frames(1);
        // No jump on the way out: one frame's worth of drift, not a cut.
        expect(Math.abs(sway() - held)).toBeLessThan(0.2);
        frames(20);
        expect(sway()).not.toBeCloseTo(held, 3);
    });

    test('opened during a change of play, Escape steps back one card at a time', async () => {
        await toLivePlay();
        await openBook();
        const head = dom.el('playbook').querySelector('.playbook-head');
        helpButton(head).click();
        expect(dom.el('welcome').hidden).toBe(false);

        // The first press closes the rules and nothing else: the change of play
        // is still open, with its way out intact.
        escape();
        await flushAsync();
        expect(dom.el('welcome').hidden).toBe(true);
        expect(dom.el('playbook').hidden).toBe(false);
        expect(actionLabels()).toEqual([]);
        expect(deep(head).some((n) => (n.textContent || '') === 'Keep this play')).toBe(true);

        // The second keeps the play, exactly as it would have without the detour.
        escape();
        await flushAsync();
        expect(dom.el('playbook').hidden).toBe(true);
        expect(actionLabels()).toEqual(['Change play', 'Snap the ball']);
    });
});

describe('a milestone show', () => {
    /**
     * DRIVEN THROUGH THE SEAM RATHER THAN BY PLAYING TO 100, because reaching
     * 100 takes two fifties in a row and no suite should depend on the
     * simulation obliging. Everything after the seam is the real path: the HUD,
     * the frame loop, the title, the live region and the hand back.
     */
    test('plays with one way out, says what it was for, and hands the game back', async () => {
        const main = await boot();
        dom.el('welcome-actions').children[0].click();   // Take the field
        await flushAsync();
        let carriedOn = 0;
        main.beginMilestone(100, () => { carriedOn += 1; });

        const skip = dom.el('hud-actions').children.find((b) => b.id === 'skip-show-btn');
        expect(skip).toBeTruthy();
        expect(skip.focused).toBe(true);
        expect(skip.dataset.keys).toContain('Escape');
        expect(dom.el('hud-actions').children.length).toBe(1);

        let titled = false;
        // A tenth of a second a frame, which is the loop's own cap on a delta.
        for (let i = 0; i < 200 && !carriedOn; i += 1) {
            dom.loops[0](i * 100);
            if (dom.el('milestone').hidden === false) titled = true;
        }
        await jest.advanceTimersByTimeAsync(100);
        expect(carriedOn).toBe(1);
        expect(titled).toBe(true);
        expect(dom.el('milestone-number').textContent).toBe('100');
        expect(dom.el('hud-live').textContent).toMatch(/^100 points\./);
        // ...and it is all put away again.
        expect(dom.el('milestone').hidden).toBe(true);
        expect(dom.el('hud-actions').children.some((b) => b.id === 'skip-show-btn')).toBe(false);
    });

    /**
     * THE THREE SHOWS THAT MOVE THE PLAYERS, run to the end through the real
     * loop. Under the stub nothing is drawn, so this is the smoke test for every
     * path they add: the staging, the team celebration, the blimp, the bulbs, the
     * crowd, the cards, the confetti and the trophy, none of which a pure suite
     * ever calls.
     */
    test('300, 400 and 500 each play through to the end and hand the game back once', async () => {
        const main = await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        let frame = 0;
        for (const level of [300, 400, 500]) {
            let carriedOn = 0;
            main.beginMilestone(level, () => { carriedOn += 1; });
            for (let i = 0; i < 400 && !carriedOn; i += 1) {
                frame += 1;
                dom.loops[0](frame * 100);
            }
            expect(carriedOn).toBe(1);
            await jest.advanceTimersByTimeAsync(100);
            expect(dom.el('hud-live').textContent).toMatch(new RegExp(`^${level} points\\.`));
            // And the stadium carries on ticking afterwards without it.
            for (let i = 0; i < 5; i += 1) { frame += 1; dom.loops[0](frame * 100); }
        }
    });

    test('skipping it carries on straight away, exactly once', async () => {
        const main = await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        let carriedOn = 0;
        main.beginMilestone(200, () => { carriedOn += 1; });
        dom.loops[0](0);
        dom.loops[0](16.7);
        dom.el('hud-actions').children.find((b) => b.id === 'skip-show-btn').click();
        expect(carriedOn).toBe(1);
        for (let i = 2; i < 30; i += 1) dom.loops[0](i * 16.7);
        expect(carriedOn).toBe(1);
        expect(dom.el('milestone').hidden).toBe(true);
    });
});

describe('playing a milestone show from the console, for QA', () => {
    test('the hook is there on a local server or with ?qa, and nowhere else', async () => {
        const { qaEnabled } = await boot();
        expect(qaEnabled('http://localhost:8000/xo/')).toBe(true);
        expect(qaEnabled('http://127.0.0.1:8000/xo/')).toBe(true);
        expect(qaEnabled('https://www.scenexp.com/xo/?qa')).toBe(true);
        expect(qaEnabled('https://www.scenexp.com/xo/')).toBe(false);
        expect(qaEnabled('https://www.scenexp.com/xo/?quality=1')).toBe(false);
        expect(qaEnabled('not a url')).toBe(false);
    });

    test('it waits for the field, refuses a level with no show, and plays one from the playbook', async () => {
        await boot();
        expect(globalThis.window.xo).toBeTruthy();
        expect(globalThis.window.xo.show(400)).toMatch(/^Take the field first/);

        dom.el('welcome-actions').children[0].click();   // Take the field
        await flushAsync();
        expect(globalThis.window.xo.show(450)).toMatch(/^Choose one of 100, 200, 300, 400, 500/);
        expect(globalThis.window.xo.show(400)).toBe('Playing the 400 show.');
        expect(dom.el('hud-actions').children.some((b) => b.id === 'skip-show-btn')).toBe(true);
        // A second one on top of it is refused rather than tangled into it.
        expect(globalThis.window.xo.show(500)).toMatch(/^Not during "show"/);
    });
});

describe('the usage log', () => {
    /**
     * WHAT ACTUALLY LEAVES THE PAGE, captured at the Image the shared part
     * sends it through, across a real play from arrival to the whistle.
     *
     * Matched on the beacons rather than on `track(` in the source, because a
     * source match passes as long as the words are in the file, whether or not
     * anything is ever sent, and because the thing worth pinning is the SHAPE of
     * the play record: the 2D game's fields, in one decodable `outcome`.
     */
    test('a play from arrival to the whistle sends the 2D game\'s play record', async () => {
        const { DEFENSES } = await import('../www/xo/js/playbook-ui.js');
        const sent = [];
        globalThis.Image = class { set src(url) { sent.push(url); } };
        try {
            await toLivePlay();
            press('Snap the ball');
            await flushAsync();
            press('Throw');
            await flushAsync();
            await runToResultFromZero();

            const hits = sent.map((url) => new URL(url, 'http://localhost:8000/xo/'));
            const actions = hits.map((u) => u.searchParams.get('action'));
            // In the order a visitor does them.
            const order = ['session-start', 'take-field', 'call-play', 'snap', 'throw', 'play-result'];
            expect(actions.filter((a) => order.includes(a))).toEqual(order);
            // Every one of them to the site's own endpoint, and tagged with the
            // scene the shared part reads off the path.
            for (const u of hits) expect(u.pathname).toBe('/api.html');

            const hit = (action) => hits.find((u) => u.searchParams.get('action') === action);
            const detail = (action) => Object.fromEntries(
                new URLSearchParams(hit(action).searchParams.get('outcome') || ''));

            // The defense was left to chance, so the snap names the one the
            // library ROLLED, not the word "random".
            const snapped = detail('snap');
            expect(DEFENSES).toContain(snapped.defense);
            expect(snapped.playCount).toBe('1');

            const thrown = hit('throw');
            expect(thrown.searchParams.get('kind')).toMatch(/^wr[1-4]$/);
            expect(Number(thrown.searchParams.get('seconds'))).toBeGreaterThanOrEqual(0);

            const record = detail('play-result');
            expect(Object.keys(record).slice(0, 5))
                .toEqual(['defense', 'offense', 'orientation', 'points', 'result']);
            expect(record.defense).toBe(snapped.defense);
            expect(record.offense).toBe(snapped.offense);
            expect(record.orientation).toBe('landscape');
            expect(record.throwTo).toBe(thrown.searchParams.get('kind'));
            expect(record.playCount).toBe('1');
            expect(record.games).toBe('0');
            expect(['true', 'false']).toContain(record.muted);
            expect(record.currentScore).toBe(record.points);
            expect(hit('play-result').searchParams.get('kind')).toBe(record.result);
            // And nothing that fingerprints, whatever the 2D game used to send.
            for (const key of ['width', 'height', 't']) {
                expect({ key, sent: key in record }).toEqual({ key, sent: false });
            }
        } finally {
            delete globalThis.Image;
        }
    });
});

/** THE SUMMARY CARD NOW SAYS WHAT ELSE IS HERE.
 *
 *  Somebody who arrived straight at this game has no way of knowing SceneXP
 *  hosts fourteen other experiences, and the end of a game is the one moment
 *  they have an opinion about whether they want another. The card itself is
 *  built by shared/js/promo-1.0.0.js and tested there; this is the wiring. */
describe('what comes after the final score', () => {
    test('the summary card has somewhere to put the recommendation', async () => {
        const page = await readFile(new URL('../www/xo/index.html', import.meta.url), 'utf8');
        expect(page).toMatch(/id="summary-promo"/);
        // BELOW the actions and below the status line, so the reading order is
        // the score, the plays, what to do about it, then what else there is.
        expect(page.indexOf('summary-promo')).toBeGreaterThan(page.indexOf('summary-actions'));
        expect(page.indexOf('summary-promo')).toBeGreaterThan(page.indexOf('summary-status'));
    });

    test('summary.js builds it through the shared part', async () => {
        const src = await readFile(new URL('../www/xo/js/summary.js', import.meta.url), 'utf8');
        expect(src).toContain("from '../../shared/js/promo-1.0.0.min.js'");
        expect(src).toMatch(/createPromoCard\('xo'\)/);
        expect(src).toMatch(/createDirectoryLink\(\)/);
    });

    test('it recommends Earth Defense, which is the curated pair', async () => {
        const { nextSlug } = await import('../www/shared/js/promo-1.0.0.js');
        expect(nextSlug('xo')).toBe('earthdefense');
    });
});

describe("the visitor's avatar at quarterback (specs/avatar M7, 2026-10-26)", () => {
    const PNG = `data:image/png;base64,${'iVBORw0KGgo'.repeat(10)}AAA=`;

    test('without a saved avatar: the usual quarterback, and a quiet pointer to the avatar page', async () => {
        const main = await boot();
        expect(main.getState().avatarQb).toBe(false);
        expect(main.getState().avatarSaved).toBe(false);
        // The usual quarterback throws right-handed, and the simulation is
        // told so (the ball starts at his throwing hand).
        expect(main.getState().throwHand).toBe('right');
        expect(dom.el('avatar-playing-img').hidden).toBe(true);
        expect(dom.el('avatar-playing-text').textContent).toBe('Take the snap at quarterback as yourself.');
        expect(dom.el('avatar-playing-link').textContent).toBe('Make your avatar');
        // Nothing is counted toward the home page's label by looking.
        expect(globalThis.localStorage.getItem('scenexp-avatar-chip')).toBeNull();
        const page = await readFile(new URL('../www/xo/index.html', import.meta.url), 'utf8');
        expect(page).toMatch(/<a id="avatar-playing-link" class="welcome-explore" href="\.\.\/avatar\/\?return=\/xo\/">Make your avatar<\/a>/);
        expect(page).toMatch(/<img id="avatar-playing-img" src="\.\.\/assets\/avatar\/default\.png" width="28" height="28" alt=""[^>]*hidden>/);
        expect(page).toContain('shared/css/avatar-1.0.0.min.css');
    });

    test('with one: the visitor takes the snap, with their portrait on the card, and another tab\'s forget takes it off', async () => {
        const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
        const store = createAvatarStore({ win: null });
        store.save({ skin: 'deep', shirt: 'teal', handedness: 'left' });
        store.savePortrait(PNG, 1);
        const main = await boot();
        expect(main.getState().avatarQb).toBe(true);
        // A left-handed avatar's throws start on his left.
        expect(main.getState().throwHand).toBe('left');
        expect(main.getState().avatarSaved).toBe(true);
        expect(dom.el('avatar-playing-img').hidden).toBe(false);
        expect(dom.el('avatar-playing-img').src).toBe(PNG);
        expect(dom.el('avatar-playing-img').alt).toBe('');
        expect(dom.el('avatar-playing-text').textContent).toBe('You take the snap at quarterback as your avatar.');
        expect(dom.el('avatar-playing-link').textContent).toBe('Change your avatar');
        store.forget();
        fire(dom.windowStub, 'storage', { key: 'scenexp-avatar' });
        expect(main.getState().avatarSaved).toBe(false);
        expect(dom.el('avatar-playing-img').hidden).toBe(true);
        expect(dom.el('avatar-playing-link').textContent).toBe('Make your avatar');
        // The quarterback on the field changes on the next load, not mid-game.
        expect(main.getState().avatarQb).toBe(true);
    });
});

/**
 * PLAY AS ANY PLAYER (specs/xo-photos-plan, Step 1). The slot is stored with
 * the play settings and read at boot, before the playbook is built. The
 * playbook row and the pick come in Step 2, so here the console hook drives
 * it, through the same `playAs` the row will call.
 */
describe('the visitor plays as the player they chose', () => {
    const PLAY_KEY = 'exes-n-ohs-play-settings';

    async function saveAvatar(look = { skin: 'deep', shirt: 'teal', handedness: 'left' }) {
        const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
        createAvatarStore({ win: null }).save(look);
    }
    const roster = () => import('../www/xo/js/roster.min.js');
    /** Which slots the visitor's avatar is drawn in. */
    async function visitorSlots() {
        const r = await roster();
        const { SLOTS } = await import('../www/xo/js/playas.min.js');
        return SLOTS.map((s) => s.id).filter((id) => r.isVisitorFigure(r.figureFor(id)));
    }

    test('a stored choice is read at boot: the avatar at receiver C, the usual quarterback throwing right-handed', async () => {
        await saveAvatar();
        globalThis.localStorage.setItem(PLAY_KEY, JSON.stringify({ lastPlay: 'pass1', playAs: 'wr3' }));
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        expect(main.getState().playAs).toBe('wr3');
        expect(await visitorSlots()).toEqual(['wr3']);
        // The avatar is left-handed, and it is not the one throwing.
        expect(main.getState().avatarQb).toBe(false);
        expect(main.getState().throwHand).toBe('right');
        expect(dom.el('avatar-playing-text').textContent).toBe('You line up at receiver C as your avatar.');
    });

    test('the console hook moves them before the snap, says why not during a play, and remembers', async () => {
        await saveAvatar();
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        const xo = globalThis.window.xo;
        expect(xo.playAs()).toBe('qb');
        expect(await visitorSlots()).toEqual(['qb']);
        expect(main.getState().throwHand).toBe('left');

        // On the welcome card.
        expect(xo.playAs('wr2')).toBe('wr2');
        expect(await visitorSlots()).toEqual(['wr2']);
        expect(main.getState().throwHand).toBe('right');
        expect(dom.el('avatar-playing-text').textContent).toBe('You line up at receiver B as your avatar.');
        expect(JSON.parse(globalThis.localStorage.getItem(PLAY_KEY)).playAs).toBe('wr2');

        // Nobody by that name, and nothing moves.
        expect(xo.playAs('db6')).toMatch(/^No player "db6"/);
        expect(xo.playAs('captain')).toMatch(/One of: qb, wr1, wr2/);
        expect(await visitorSlots()).toEqual(['wr2']);

        // Before the snap, on the defense.
        dom.el('welcome-actions').children[0].click();   // Take the field
        await flushAsync();
        const body = dom.el('playbook').querySelector('.playbook-body');
        deep(body).find((n) => n.dataset && n.dataset.slug).click();
        await flushAsync();
        expect(xo.playAs('s1')).toBe('s1');
        expect(await visitorSlots()).toEqual(['s1']);

        // During the play, refused.
        press('Snap the ball');
        await flushAsync();
        expect(xo.playAs('wr1')).toMatch(/^Not now/);
        expect(await visitorSlots()).toEqual(['s1']);
        expect(main.getState().playAs).toBe('s1');

        // Back to the quarterback, which stores nothing at all.
        await runToResultFromZero();
        dom.el('result-actions').children
            .find((b) => b.textContent === 'Next play').click();
        await flushAsync();
        // The playbook is open over the field the play finished on.
        expect(xo.playAs('qb')).toBe('qb');
        expect(main.getState().throwHand).toBe('left');
        expect('playAs' in JSON.parse(globalThis.localStorage.getItem(PLAY_KEY))).toBe(false);
    });

    test('without an avatar the choice is kept, and nobody on the field is the visitor', async () => {
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        expect(globalThis.window.xo.playAs('wr4')).toBe('wr4');
        expect(main.getState().playAs).toBe('wr4');
        expect(await visitorSlots()).toEqual([]);
        expect(main.getState().throwHand).toBe('right');
        expect(dom.el('avatar-playing-text').textContent).toBe('Take the snap at quarterback as yourself.');
    });

    test('a play that sits the visitor out has them on the sideline, and every other benched player out of sight', async () => {
        // Real `visible` flags on every Group, which the plain stub swallows.
        keepPropRecords();
        await saveAvatar();
        // Jumbo Split benches receivers C and D. It is the play behind the
        // welcome card because it was the last one called, which is only true
        // if the stored settings are read before the line-up.
        globalThis.localStorage.setItem(PLAY_KEY, JSON.stringify({ lastPlay: 'jumbo1', playAs: 'wr3' }));
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        const r = await roster();
        expect(r.isVisitorFigure(r.figureFor('wr3'))).toBe(true);
        expect(r.figureFor('wr4').visible).toBe(false);
        expect(r.figureFor('wr3').visible).toBe(true);
        expect(r.figureFor('wr1').visible).toBe(true);
        // Change to a player who IS in this formation and the sideline empties.
        globalThis.window.xo.playAs('wr1');
        expect(r.figureFor('wr3').visible).toBe(false);
        expect(r.figureFor('wr1').visible).toBe(true);
        expect(r.isVisitorFigure(r.figureFor('wr1'))).toBe(true);
    });
});

/**
 * THE PHOTO MOMENTS OF A PLAY (specs/xo-photos-plan, Step 3). A real play's
 * outcome is a random roll, so each event is SET on the live play through
 * `__test__` and the page is left to notice it: who held the ball, the
 * whistle's tackle, the fifty. What is asserted is the wiring, that each one
 * becomes a moment of the right kind and is taken on a LATER frame than the
 * one it happened on. moments.js and snapshot.js have their own suite.
 */
describe('the moments worth a photo', () => {
    let now = 200000;
    const frames = (n) => { for (let i = 0; i < n; i += 1) dom.loops[0](now += 16.7); };
    const kinds = (main) => main.__test__.moments().map((m) => `${m.kind}:${m.hero}:${m.partner || ''}`);
    const find = (main, position) => main.__test__.play().game.objects.find((o) => o.settings.position === position);

    async function snapped() {
        const main = await toLivePlay();
        press('Snap the ball');
        await flushAsync();
        frames(3);
        return main;
    }

    test('a throw, then a catch: both taken, a frame or more after they happened', async () => {
        const main = await snapped();
        press('Throw A');
        await flushAsync();
        // Noted, not yet taken: the throw is photographed mid-sweep.
        expect(main.__test__.pending().map((m) => m.kind)).toEqual(['release']);
        expect(main.__test__.moments()).toEqual([]);
        // The ball arrives in receiver A's hands before the next frame, as a
        // short pass does on a slow phone, and before the real flight can
        // land it (which it does, a dozen frames on).
        find(main, 'wr1').state.hasBall = true;
        frames(1);
        expect(main.__test__.pending().map((m) => `${m.kind}:${m.hero}`)).toEqual(['release:qb', 'catch:wr1']);
        expect(main.__test__.moments()).toEqual([]);
        frames(15);
        expect(kinds(main)).toEqual(expect.arrayContaining(['catch:wr1:', 'release:qb:wr1']));
        // Neither is still waiting. (The real play may have gone on to a
        // tackle, which is its own moment.)
        expect(main.__test__.pending().filter((m) => m.kind === 'catch' || m.kind === 'release')).toEqual([]);
        const moment = main.__test__.moments().find((m) => m.kind === 'catch');
        expect(moment.at).toBeGreaterThan(0);
        expect(moment.snapshot).toBeTruthy();
    });

    test('a ball in an O\'s hands is a pick', async () => {
        const main = await snapped();
        press('Throw B');
        await flushAsync();
        find(main, 'db2').state.hasBall = true;
        frames(15);
        expect(kinds(main)).toContain('pick:db2:');
        expect(kinds(main).some((k) => k.startsWith('catch'))).toBe(false);
    });

    test('a tackle at the whistle is the carrier with the man who brought him down, and a sack when nobody threw', async () => {
        const main = await snapped();
        const play = main.__test__.play();
        // The quarterback still has it, nobody threw, and he is down.
        play.playState.state.tackled = true;
        play.playState.state.anim.done = true;
        frames(120);
        const sack = main.__test__.moments().find((m) => m.kind === 'sack');
        expect(sack).toBeTruthy();
        expect(sack.hero).toBe('qb');
        expect(['db1', 'db2', 'db3', 'db4', 's1', 's2']).toContain(sack.partner);
        // Taken after the contact, not at the whistle.
        expect(sack.at).toBeGreaterThan(0);
    });

    test('crossing into the fifty is the whistle, and it is the carrier\'s', async () => {
        const main = await snapped();
        press('Keep it');
        await flushAsync();
        const play = main.__test__.play();
        play.playState.state.anim.run50 = true;
        play.playState.state.anim.done = true;
        frames(30);
        expect(kinds(main)).toContain('fifty:qb:');
    });

    test('the console lists them on the result card, shows one with the card out of the way, and puts the field back', async () => {
        const main = await boot();
        const xo = globalThis.window.xo;
        expect(xo.moments()).toMatch(/^No moments yet/);
        expect(xo.moment(1)).toBe('On the result card only, after a play.');
        await expect(xo.photo(1)).resolves.toBe('On the result card only, after a play.');

        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        const body = dom.el('playbook').querySelector('.playbook-body');
        deep(body).find((n) => n.dataset && n.dataset.slug).click();
        await flushAsync();
        press('Snap the ball');
        await flushAsync();
        press('Throw A');
        await flushAsync();
        await runToResult(() => dom.loops[0](now += 16.7));
        // Watch the replay is offered on the card, so the card is the screen.
        const lines = xo.moments().split('\n');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.length).toBeLessThanOrEqual(3);
        for (const [i, line] of lines.entries()) {
            expect(line).toMatch(new RegExp(`^${i + 1}\\. (Fifty|Interception|Catch|Sack|Tackle|Throw): [a-z]`));
            expect(line).toMatch(/\d\.\d s after the snap$/);
        }

        const camera = await import('../www/xo/js/camera.min.js');
        expect(xo.moment(1)).toMatch(/^Showing /);
        expect(dom.el('result').hidden).toBe(true);
        frames(1);
        expect(camera.getDriver()).toBe('show');
        expect(xo.moment(9)).toMatch(/^No moment 9\. This play has \d\.$/);
        expect(xo.moment()).toBe('Back to the field as it was.');
        expect(dom.el('result').hidden).toBe(false);
        frames(1);
        expect(camera.getDriver()).toBe('play');

        // The photo is drawn on the next frame, in the frame loop. The stub's
        // canvas cannot encode a file, which is the answer a browser without
        // toBlob gets, and the page carries on.
        const photo = xo.photo(1);
        frames(1);
        await expect(photo).resolves.toBe("This browser couldn't make the picture.");
        await expect(xo.photo(9)).resolves.toMatch(/^No moment 9\./);
        expect(dom.el('result').hidden).toBe(false);

        // Shown and left up, the next play takes it down with it, and the next
        // snap starts the list again.
        xo.moment(1);
        dom.el('result-actions').children.find((b) => b.textContent === 'Next play').click();
        await flushAsync();
        frames(1);
        expect(camera.getDriver()).toBe('idle');
        deep(body).find((n) => n.dataset && n.dataset.slug).click();
        await flushAsync();
        press('Snap the ball');
        await flushAsync();
        expect(xo.moments()).toMatch(/^No moments yet/);
        expect(main.getState().isLoaded).toBe(true);
    });
});

/**
 * A thrown ball caught by receiver A, then whatever the play does; with
 * `downed`, he is brought down at once too. Leaves the result card up.
 * `frames(n)` is the caller's own clock, so a describe's `now` keeps counting.
 */
async function catchToResult(frames, { downed = false } = {}) {
    const main = await toLivePlay();
    const find = (position) => main.__test__.play().game.objects.find((o) => o.settings.position === position);
    press('Snap the ball');
    await flushAsync();
    frames(3);
    press('Throw A');
    await flushAsync();
    find('wr1').state.hasBall = true;
    frames(2);
    if (downed) {
        const st = main.__test__.play().playState.state;
        st.tackled = true;
        st.anim.done = true;
    }
    await runToResult(() => frames(1));
    return main;
}

/**
 * THE SHARE SHEET (specs/xo-photos-plan, Step 7): offered on the result card
 * whenever there is a recording, opened over the field with the card out of
 * the way, the clip made as it opens (a take in the page's own loop, recorded
 * by a MediaRecorder the suite fakes), played back when it is done, switched
 * round the four views, and handed to the share sheet or the downloads folder.
 * The picture of the play's best moment rides along as before. Modelled on
 * Derby Day's share card tests (tests/derby-share.test.mjs).
 */
describe('the share sheet', () => {
    const PLAY_KEY = 'exes-n-ohs-play-settings';
    let now = 300000;
    const frames = (n) => { for (let i = 0; i < n; i += 1) dom.loops[0](now += 16.7); };
    const aCatch = (opts) => catchToResult(frames, opts);
    const resultLabels = () => dom.el('result-actions').children.map((b) => b.textContent);
    const shareBtn = () => dom.el('result-actions').children.find((b) => b.id === 'result-share-btn');
    const stage = () => dom.el('clip-stage');
    const share = () => dom.el('clip-share');
    const picture = () => dom.el('clip-picture');
    const progress = () => dom.el('clip-progress').textContent;
    const status = () => dom.el('clip-status').textContent;

    /** The names nginx keeps from a beacon (specs/nginx-config.txt); any other
     *  is sent and silently dropped, so none may carry anything. */
    const LOGGED = ['action', 'mobile', 'scene', 'lang', 'hash', 'kind', 'outcome', 'seconds', 'saved', 'destroyed', 'timestamp'];

    /** Canvases that encode a picture and capture a stream, videos that play,
     *  and download links that write down what they saved. */
    function encodingCanvases() {
        const saved = [];
        const make = dom.documentStub.createElement;
        dom.documentStub.createElement = (tag) => {
            const e = make(tag);
            if (tag === 'canvas') {
                e.captureStream = () => ({});
                e.toBlob = (cb, type) => cb({ size: 2048, type });
            }
            if (tag === 'a') e.click = () => saved.push(e.download);
            if (tag === 'video') e.play = () => Promise.resolve();
            return e;
        };
        return saved;
    }

    /** A browser that records (WebM, as an older Chrome does), on top of the
     *  canvases above. */
    function recordingBrowser() {
        class FakeRecorder {
            static isTypeSupported(t) { return t === 'video/webm'; }

            constructor(stream, options) { this.mimeType = options.mimeType; FakeRecorder.starts += 1; FakeRecorder.last = this; }

            start() {}

            stop() {
                this.ondataavailable({ data: new Blob(['clip']) });
                this.onstop();
            }
        }
        FakeRecorder.starts = 0;
        const Canvas = function () {};
        Canvas.prototype.captureStream = () => ({});
        Object.assign(dom.windowStub, { MediaRecorder: FakeRecorder, HTMLCanvasElement: Canvas, Blob });
        return { FakeRecorder, saved: encodingCanvases() };
    }

    /** Object URLs written down rather than made. */
    function objectUrls() {
        const made = [];
        const revoked = [];
        const realCreate = globalThis.URL.createObjectURL;
        const realRevoke = globalThis.URL.revokeObjectURL;
        globalThis.URL.createObjectURL = (blob) => { made.push(blob); return `blob:clip-${made.length}`; };
        globalThis.URL.revokeObjectURL = (url) => { revoked.push(url); };
        return {
            made,
            revoked,
            restore() { globalThis.URL.createObjectURL = realCreate; globalThis.URL.revokeObjectURL = realRevoke; },
        };
    }

    /** The usage pings, as URLs. */
    function beacons() {
        const sent = [];
        globalThis.Image = class { set src(url) { sent.push(new URL(url, 'http://localhost:8000/xo/')); } };
        return sent;
    }
    const of = (sent, action) => sent.filter((u) => u.searchParams.get('action') === action);
    const kinds = (sent, action) => of(sent, action).map((u) => u.searchParams.get('kind'));

    /** Step frames until `pred` holds, within a budget of frames. */
    async function settle(pred, budget = 3000) {
        for (let i = 0; i < budget && !pred(); i += 1) {
            frames(1);
            await flushAsync(2);
        }
        expect(pred()).toBe(true);
    }

    async function ranked(main, visitor = null) {
        const { rankMoments } = await import('../www/xo/js/moments.min.js');
        return rankMoments(main.__test__.moments(), visitor);
    }

    test('offered on the card, the clip made as the sheet opens, counted down, played back, and shared with the address', async () => {
        const { FakeRecorder } = recordingBrowser();
        const urls = objectUrls();
        const sent = beacons();
        const handed = [];
        globalThis.navigator.canShare = () => true;
        globalThis.navigator.share = async (data) => { handed.push(data); };
        dom.windowStub.File = class { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } };
        try {
            const main = await aCatch();
            expect(resultLabels()).toEqual(['Watch the replay', 'Share the play', 'Next play']);
            expect(shareBtn().getAttribute('aria-label')).toBe('Share the play as a video');

            shareBtn().click();
            await flushAsync();
            expect(dom.el('clip').hidden).toBe(false);
            expect(dom.el('result').hidden).toBe(true);
            expect(dom.el('clip-panel').focused).toBe(true);
            // The take began at once, from the director's own view, into a
            // canvas in the stage, with the recorder on it.
            expect(main.__test__.phase()).toBe('clip');
            expect(main.__test__.taking().quarter).toBe(0);
            expect(FakeRecorder.starts).toBe(1);
            expect(stage().children).toHaveLength(1);
            expect(stage().children[0].tagName).toMatch(/canvas/i);
            expect(stage().children[0].classList.contains('is-unseen')).toBe(false);
            expect(dom.el('clip-view-count').textContent).toBe('View 1 of 4');
            expect(progress()).toBe('Making your clip…');
            expect(dom.el('clip-tools').hidden).toBe(false);
            // Share waits, busy rather than disabled, named for what this browser can do.
            expect(share().hidden).toBe(false);
            expect(share().textContent).toBe('Share video');
            expect(share().getAttribute('aria-disabled')).toBe('true');
            expect(share().disabled).toBe(false);
            // The picture is offered and developing.
            expect(picture().hidden).toBe(false);
            expect(picture().textContent).toBe('Share a picture');
            expect(picture().getAttribute('aria-disabled')).toBe('true');
            // No avatar, so the nudge, in the moment's own words.
            const best = (await ranked(main))[0];
            const words = await import('../www/xo/js/moments.min.js');
            expect(dom.el('clip-nudge').hidden).toBe(false);
            expect(dom.el('clip-nudge-text').textContent).toBe(words.photoNudge(best.kind));

            frames(2);
            await flushAsync();
            await flushAsync();
            expect(progress()).toMatch(/^Making your clip… \d+ seconds? to go$/);
            expect(picture().getAttribute('aria-disabled')).toBe('false');
            // Pressed early: said so, nothing sent.
            const ui = await import('../www/xo/js/clip-ui.min.js');
            await expect(ui.shareClip()).resolves.toBe('');
            expect(status()).toBe('Your clip is still being made.');
            expect(handed).toEqual([]);

            // The take runs out: the video in the stage, playing, Share lit.
            await settle(() => main.__test__.phase() === 'result');
            await flushAsync();
            await flushAsync();
            expect(stage().children).toHaveLength(1);
            const video = stage().children[0];
            expect(video.tagName).toMatch(/video/i);
            expect(video.src).toBe('blob:clip-1');
            expect(urls.made[0].type).toBe('video/webm');
            expect(video.muted).toBe(true);
            expect(video.loop).toBe(true);
            expect(video.autoplay).toBe(true);
            expect(video.controls).toBe(true);
            expect(video.getAttribute('aria-label')).toBe('Your clip of the play');
            expect(progress()).toMatch(/^Your clip is ready, \d+ seconds? long\.$/);
            expect(status()).toBe('Your clip is ready to share.');
            expect(share().getAttribute('aria-disabled')).toBe('false');
            expect(dom.el('game-canvas').classList.contains('is-recording')).toBe(false);

            // Share: the file, named for the result, with the words and the address.
            await expect(ui.shareClip()).resolves.toBe('shared');
            expect(handed).toHaveLength(1);
            expect(handed[0].files[0].name).toMatch(/^scenexp-xo-(catch|incomplete|interception|sack|run|run-50)-1080x1920\.webm$/);
            expect(handed[0].files[0].type).toBe('video/webm');
            expect(handed[0].title).toBe("X's and O's");
            expect(handed[0].text).toMatch(/X's and O's[!.] http:\/\/.+\/$/);
            expect(status()).toBe('Shared.');
            // A dismissed share sheet is the visitor's decision.
            globalThis.navigator.share = async () => { const e = new Error('closed'); e.name = 'AbortError'; throw e; };
            await expect(ui.shareClip()).resolves.toBe('cancelled');
            expect(status()).toBe('Shared.');
            // The picture goes the same way.
            globalThis.navigator.share = async (data) => { handed.push(data); };
            await expect(ui.sharePicture()).resolves.toBe('shared');
            expect(handed[1].files[0].name).toBe(`scenexp-xo-${best.kind}-1080x1350.jpg`);
            expect(handed[1].files[0].type).toBe('image/jpeg');

            // The pings: opened, made (the format and the view, the length on
            // its own where the log keeps it), then how each hand-off went,
            // and the picture's own. Only names the log keeps.
            const clip = of(sent, 'clip');
            expect(clip.map((u) => u.searchParams.get('kind'))).toEqual(['opened', 'made', 'shared', 'cancelled']);
            expect(clip[0].searchParams.get('outcome')).toMatch(/^result=[a-z0-9-]+&view=1$/);
            expect(clip[1].searchParams.get('outcome')).toBe('format=webm&view=1');
            expect(Number(clip[1].searchParams.get('seconds'))).toBeGreaterThan(0);
            expect(clip[2].searchParams.get('outcome')).toBe('format=webm&view=1');
            expect(clip[2].searchParams.get('seconds')).toBe(clip[1].searchParams.get('seconds'));
            expect(kinds(sent, 'photo')).toEqual(['shared']);
            for (const u of sent) {
                for (const key of u.searchParams.keys()) expect(LOGGED).toContain(key);
            }

            // Close: back to the card with focus on its button, the clip's address let go.
            dom.el('clip-close').click();
            await flushAsync();
            expect(dom.el('clip').hidden).toBe(true);
            expect(dom.el('result').hidden).toBe(false);
            expect(shareBtn().focused).toBe(true);
            expect(urls.revoked).toEqual(['blob:clip-1']);
            expect(stage().children).toHaveLength(0);
            // Escape closes it too.
            shareBtn().click();
            await flushAsync();
            expect(dom.el('clip').hidden).toBe(false);
            fire(dom.documentStub, 'keydown', { key: 'Escape' });
            expect(dom.el('clip').hidden).toBe(true);
            expect(main.__test__.phase()).toBe('result');
            expect(main.getState().isLoaded).toBe(true);
        } finally {
            urls.restore();
            delete globalThis.Image;
        }
    });

    test('Switch view, and V, make the clip again from the next vantage point, and a closed sheet lets a take go', async () => {
        recordingBrowser();
        const urls = objectUrls();
        const sent = beacons();
        try {
            const main = await aCatch();
            shareBtn().click();
            await flushAsync();
            expect(main.__test__.taking().quarter).toBe(0);
            frames(3);
            dom.el('clip-view').click();
            await flushAsync();
            expect(main.__test__.phase()).toBe('clip');
            expect(main.__test__.taking().quarter).toBe(1);
            expect(main.__test__.taking().frames).toBe(0);
            expect(dom.el('clip-view-count').textContent).toBe('View 2 of 4');
            expect(status()).toBe('View 2 of 4. Making the clip again from here.');
            expect(progress()).toBe('Making your clip…');
            expect(stage().children).toHaveLength(1);
            // V, as in the replay, but not with a modifier held.
            fire(dom.documentStub, 'keydown', { key: 'v' });
            await flushAsync();
            expect(main.__test__.taking().quarter).toBe(2);
            fire(dom.documentStub, 'keydown', { key: 'V', metaKey: true });
            await flushAsync();
            expect(main.__test__.taking().quarter).toBe(2);
            // Round the four and back to the director's own.
            fire(dom.documentStub, 'keydown', { key: 'V' });
            fire(dom.documentStub, 'keydown', { key: 'v' });
            await flushAsync();
            expect(main.__test__.taking().quarter).toBe(0);
            expect(dom.el('clip-view-count').textContent).toBe('View 1 of 4');

            // Let it finish, then switch: the finished clip is let go and a new take begins.
            await settle(() => main.__test__.phase() === 'result');
            await flushAsync();
            await flushAsync();
            expect(stage().children[0].tagName).toMatch(/video/i);
            expect(urls.made).toHaveLength(1);
            dom.el('clip-view').click();
            await flushAsync();
            expect(urls.revoked).toEqual(['blob:clip-1']);
            expect(main.__test__.phase()).toBe('clip');
            expect(main.__test__.taking().quarter).toBe(1);
            expect(share().getAttribute('aria-disabled')).toBe('true');
            expect(stage().children[0].tagName).toMatch(/canvas/i);

            // Closing mid-take cancels it and gives the field back.
            frames(2);
            dom.el('clip-close').click();
            await flushAsync();
            expect(dom.el('clip').hidden).toBe(true);
            expect(main.__test__.phase()).toBe('result');
            expect(main.__test__.taking()).toBeNull();
            expect(dom.el('game-canvas').classList.contains('is-recording')).toBe(false);
            expect(dom.el('result').hidden).toBe(false);
            // No ping for a take nobody finished, one for every switch.
            expect(kinds(sent, 'clip')).toEqual(['opened', 'view', 'view', 'view', 'view', 'made', 'view']);
            expect(of(sent, 'clip')[1].searchParams.get('outcome')).toBe('view=2');
        } finally {
            urls.restore();
            delete globalThis.Image;
        }
    });

    test('where a file cannot be shared, Save video and Save a picture put them in the downloads folder', async () => {
        const { saved } = recordingBrowser();
        const urls = objectUrls();
        delete globalThis.navigator.share;
        delete globalThis.navigator.canShare;
        try {
            const main = await aCatch();
            shareBtn().click();
            await flushAsync();
            expect(share().textContent).toBe('Save video');
            expect(picture().textContent).toBe('Save a picture');
            await settle(() => main.__test__.phase() === 'result');
            await flushAsync();
            await flushAsync();
            const ui = await import('../www/xo/js/clip-ui.min.js');
            await expect(ui.shareClip()).resolves.toBe('saved');
            expect(saved).toHaveLength(1);
            expect(saved[0]).toMatch(/^scenexp-xo-[a-z0-9-]+-1080x1920\.webm$/);
            expect(status()).toBe('Your clip is in your downloads.');
            await expect(ui.sharePicture()).resolves.toBe('saved');
            expect(saved[1]).toMatch(/^scenexp-xo-[a-z]+-1080x1350\.jpg$/);
            expect(status()).toBe('Your picture is in your downloads.');
            // The clip is saved from the address it plays from: one for it, one for the picture.
            expect(urls.made).toHaveLength(2);
        } finally {
            urls.restore();
        }
    });

    test('a browser that cannot record is offered the picture alone, and told kindly', async () => {
        encodingCanvases();
        const sent = beacons();
        try {
            const main = await aCatch();
            shareBtn().click();
            await flushAsync();
            expect(main.__test__.phase()).toBe('result');
            expect(progress()).toBe("This browser can't make a video, but you can save a picture of the play.");
            expect(share().hidden).toBe(true);
            expect(dom.el('clip-tools').hidden).toBe(true);
            expect(picture().hidden).toBe(false);
            expect(stage().children).toHaveLength(0);
            frames(1);
            await flushAsync();
            await flushAsync();
            expect(picture().getAttribute('aria-disabled')).toBe('false');
            const ui = await import('../www/xo/js/clip-ui.min.js');
            expect(ui.switchClipView()).toBe(false);
            await expect(ui.shareClip()).resolves.toBe('');
            expect(kinds(sent, 'clip')).toEqual(['unsupported']);
            dom.el('clip-close').click();
            await flushAsync();
            expect(dom.el('result').hidden).toBe(false);
            // Where the share sheet takes a picture, the words say share.
            globalThis.navigator.canShare = (data) => data.files[0].type === 'image/jpeg';
            dom.windowStub.File = class { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } };
            shareBtn().click();
            await flushAsync();
            expect(progress()).toBe("This browser can't make a video, but you can share a picture of the play.");
            expect(picture().textContent).toBe('Share a picture');
        } finally {
            delete globalThis.Image;
        }
    });

    test('with an avatar there is no nudge, and the clip opens on the view the replay was watched from', async () => {
        recordingBrowser();
        const urls = objectUrls();
        try {
            const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
            createAvatarStore({ win: null }).save({ skin: 'deep', shirt: 'teal' });
            globalThis.localStorage.setItem(PLAY_KEY, JSON.stringify({ playAs: 'wr1' }));
            const main = await aCatch({ downed: true });
            const camera = await import('../www/xo/js/camera.min.js');
            // Watch the replay from the third view, then come back to the card.
            dom.el('result-actions').children.find((b) => b.textContent === 'Watch the replay').click();
            await flushAsync();
            frames(1);
            press('Switch view');
            press('Switch view');
            expect(camera.viewQuarter()).toBe(2);
            press('Skip replay');
            await flushAsync();
            expect(main.__test__.phase()).toBe('result');
            shareBtn().click();
            await flushAsync();
            expect(dom.el('clip-nudge').hidden).toBe(true);
            expect(main.__test__.taking().quarter).toBe(2);
            expect(dom.el('clip-view-count').textContent).toBe('View 3 of 4');
            dom.el('clip-close').click();
            await flushAsync();
            expect(main.__test__.phase()).toBe('result');
        } finally {
            urls.restore();
        }
    });

    test('reduced motion: the take is recorded unseen, and the finished clip waits for its play button', async () => {
        dom.windowStub.matchMedia = (q) => ({
            media: q, matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
        });
        recordingBrowser();
        const urls = objectUrls();
        try {
            const main = await aCatch();
            shareBtn().click();
            await flushAsync();
            expect(stage().children[0].classList.contains('is-unseen')).toBe(true);
            await settle(() => main.__test__.phase() === 'result');
            await flushAsync();
            await flushAsync();
            const video = stage().children[0];
            expect(video.tagName).toMatch(/video/i);
            expect(video.autoplay).toBe(false);
            expect(video.controls).toBe(true);
        } finally {
            urls.restore();
        }
    });
});

/**
 * THE CLIP'S TAKE (specs/xo-photos-plan, Step 6): the last seconds of the
 * recording re-run for a recorder, drawn frame by frame into a stage canvas
 * through the clip's own camera while the game's canvas is hidden, and
 * everything given back at the end or on a cancel. The sheet that will drive
 * it is Step 7, so the take is reached through `__test__` and the console
 * hook `xo.clip(view)`.
 */
describe('the clip\'s take', () => {
    let now = 400000;
    const frames = (n) => { for (let i = 0; i < n; i += 1) dom.loops[0](now += 16.7); };
    const aCatch = (opts) => catchToResult(frames, opts);
    const canvas = () => dom.el('game-canvas');

    /** A stage canvas whose context writes down what is drawn on it. */
    function recordingStage() {
        const drawn = [];
        const stage = dom.documentStub.createElement('canvas');
        stage.getContext = () => new Proxy({}, {
            get: (t, k) => (k in t ? t[k] : (...args) => drawn.push([k, ...args])),
            set: (t, k, v) => { t[k] = v; return true; },
        });
        return { stage, drawn };
    }

    /** Step frames until `promise` settles, within a budget of frames. */
    async function settle(promise, budget = 3000) {
        let done = false;
        let value;
        promise.then((v) => { done = true; value = v; });
        for (let i = 0; i < budget && !done; i += 1) {
            frames(1);
            await flushAsync(2);
        }
        expect(done).toBe(true);
        return value;
    }

    /** What the stamp should say, from the card. */
    function stampOnCard() {
        const headline = dom.el('result-headline').textContent;
        const points = dom.el('result-points').textContent;
        return points === '0' ? headline : `${headline} ${points}`;
    }

    test('a take re-runs the last seconds of the play for the recorder, with the field hidden, and gives everything back', async () => {
        const main = await aCatch();
        const { XO_CONFIG: CFG } = await import('../www/xo/js/config.min.js');
        const Clip = await import('../www/xo/js/clip.min.js');
        const R = await import('../www/xo/js/replay.min.js');
        const camera = await import('../www/xo/js/camera.min.js');
        const { stage, drawn } = recordingStage();

        // A stage with no context is refused, and nothing changes.
        const bare = dom.documentStub.createElement('canvas');
        bare.getContext = () => null;
        await expect(main.__test__.take(bare)).resolves.toBeNull();
        expect(main.__test__.phase()).toBe('result');

        // The playhead is left at the end of the recording, so the take has to
        // put it where the clip starts.
        R.seek(R.frameCount() - 1);
        const p = main.__test__.take(stage, { quarter: 1 });
        expect(main.__test__.phase()).toBe('clip');
        const t = main.__test__.taking();
        expect(t.quarter).toBe(1);
        expect([t.w, t.h]).toEqual([CFG.clip.width, CFG.clip.height]);
        expect([stage.width, stage.height]).toEqual([CFG.clip.width, CFG.clip.height]);
        expect(canvas().classList.contains('is-recording')).toBe(true);
        // The plan starts the clip's seconds before the whistle, and the
        // playhead is put there, where the camera opens.
        expect(t.plan.start).toBe(Clip.clipStart(R.frameCount()));
        expect(t.plan.ticks).toBe(R.frameCount());
        expect(R.playheadFrame()).toBe(t.plan.start);
        expect(t.plan.total).toBeGreaterThan(t.plan.play + CFG.clip.hold - 1e-9);
        expect(t.shoulder).toEqual({ side: 1, want: 1, held: 0, seeded: false });
        expect(Number.isFinite(t.anchor.x) && Number.isFinite(t.anchor.z)).toBe(true);
        // A second take while one runs is refused.
        await expect(main.__test__.take(stage, { quarter: 2 })).resolves.toBeNull();
        expect(main.__test__.taking().quarter).toBe(1);

        // Every frame goes to the stage with the wordmark on it, and the
        // frame's own render is skipped: the shoulder memory has been asked.
        frames(1);
        expect(drawn.filter((c) => c[0] === 'drawImage')).toHaveLength(1);
        expect(drawn.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual([CFG.clip.wordmark]);
        expect(main.__test__.taking().shoulder.seeded).toBe(true);
        expect(main.__test__.taking().frames).toBe(1);

        const value = await settle(p);
        expect(value.cancelled).toBe(false);
        // The renderer was given its size and ratio back.
        expect(value.released).toBe(true);
        expect(value.seconds).toBeCloseTo(t.plan.total, 9);
        const draws = drawn.filter((c) => c[0] === 'drawImage').length;
        expect(value.frames).toBe(draws);
        // About the plan's length of frames, at sixty a second.
        expect(Math.abs(draws - t.plan.total / 0.0167)).toBeLessThan(4);
        // The stamp was on the final hold's frames only.
        const stamp = stampOnCard();
        const stamped = drawn.filter((c) => c[0] === 'fillText' && c[1] === stamp).length;
        expect(stamped).toBeGreaterThan(0);
        expect(stamped).toBeLessThan(draws);
        expect(Math.abs(stamped - CFG.clip.hold / 0.0167)).toBeLessThan(4);
        // The wordmark was on every one.
        expect(drawn.filter((c) => c[0] === 'fillText' && c[1] === CFG.clip.wordmark)).toHaveLength(draws);

        // Everything back: the phase, the canvas, the card, and the replay's own camera after.
        expect(main.__test__.phase()).toBe('result');
        expect(main.__test__.taking()).toBeNull();
        expect(canvas().classList.contains('is-recording')).toBe(false);
        expect(dom.el('result').hidden).toBe(false);
        frames(1);
        expect(drawn.filter((c) => c[0] === 'drawImage')).toHaveLength(draws);
        dom.el('result-actions').children.find((b) => b.textContent === 'Watch the replay').click();
        await flushAsync();
        frames(1);
        expect(camera.getDriver()).toBe('replay');
        expect(R.playheadFrame()).toBeLessThan(5);
    });

    test('a cancelled take gives the field back at once, the next play lets one go, and off the card a take is refused', async () => {
        const main = await aCatch();
        const { stage, drawn } = recordingStage();
        const p = main.__test__.take(stage, {});
        frames(5);
        expect(drawn.filter((c) => c[0] === 'drawImage')).toHaveLength(5);
        expect(main.__test__.cancelTake()).toBe(true);
        await expect(p).resolves.toEqual({ cancelled: true, frames: 5, seconds: expect.any(Number), released: true });
        expect(main.__test__.phase()).toBe('result');
        expect(canvas().classList.contains('is-recording')).toBe(false);
        expect(main.__test__.cancelTake()).toBe(false);
        // Nothing more is drawn into a stage whose take is over.
        frames(2);
        expect(drawn.filter((c) => c[0] === 'drawImage')).toHaveLength(5);

        // Next play lets a running take go on its way out.
        const p2 = main.__test__.take(stage, { quarter: 3 });
        frames(2);
        dom.el('result-actions').children.find((b) => b.textContent === 'Next play').click();
        await expect(p2).resolves.toMatchObject({ cancelled: true, frames: 2 });
        await flushAsync();
        expect(main.__test__.phase()).toBe('playbook');
        expect(canvas().classList.contains('is-recording')).toBe(false);
        // Off the result card there is nothing to take.
        await expect(main.__test__.take(stage, {})).resolves.toBeNull();
    });

    test('xo.clip(view) records a take and saves the file, named for the result, the size and the format', async () => {
        class FakeRecorder {
            static isTypeSupported(t) { return t === 'video/webm'; }

            constructor(stream, options) { this.mimeType = options.mimeType; FakeRecorder.starts += 1; }

            start() {}

            stop() {
                this.ondataavailable({ data: new Blob(['clip']) });
                this.onstop();
            }
        }
        FakeRecorder.starts = 0;
        const Canvas = function () {};
        Canvas.prototype.captureStream = () => ({});
        Object.assign(dom.windowStub, { MediaRecorder: FakeRecorder, HTMLCanvasElement: Canvas, Blob });
        const saved = [];
        const make = dom.documentStub.createElement;
        dom.documentStub.createElement = (tag) => {
            const e = make(tag);
            if (tag === 'canvas') e.captureStream = () => ({});
            if (tag === 'a') e.click = () => saved.push(e.download);
            return e;
        };
        const made = [];
        const realCreate = globalThis.URL.createObjectURL;
        const realRevoke = globalThis.URL.revokeObjectURL;
        globalThis.URL.createObjectURL = (blob) => { made.push(blob); return 'blob:clip'; };
        globalThis.URL.revokeObjectURL = () => {};
        try {
            const main = await aCatch();
            const xo = globalThis.window.xo;
            const p = xo.clip(2);
            await flushAsync();
            expect(main.__test__.phase()).toBe('clip');
            expect(FakeRecorder.starts).toBe(1);
            expect(main.__test__.taking().quarter).toBe(1);
            const line = await settle(p);
            expect(line).toMatch(/^Saved scenexp-xo-[a-z0-9-]+-1080x1920\.webm \(\d+ KB, \d+\.\d s, \d+ frames, view 2 of 4\)\.$/);
            expect(saved).toHaveLength(1);
            expect(saved[0]).toMatch(/^scenexp-xo-(catch|incomplete|interception|sack|run|run-50)-1080x1920\.webm$/);
            expect(made[0].type).toBe('video/webm');
            expect(main.__test__.phase()).toBe('result');

            // A view past the four goes round; the browser without a recorder is told.
            const p2 = xo.clip(5);
            await flushAsync();
            expect(main.__test__.taking().quarter).toBe(0);
            main.__test__.cancelTake();
            await expect(p2).resolves.toBe('The clip could not be made.');
            delete dom.windowStub.MediaRecorder;
            await expect(xo.clip()).resolves.toBe("This browser can't record a video.");
            dom.el('result-actions').children.find((b) => b.textContent === 'Next play').click();
            await flushAsync();
            await expect(xo.clip()).resolves.toBe('On the result card only, after a play.');
        } finally {
            globalThis.URL.createObjectURL = realCreate;
            globalThis.URL.revokeObjectURL = realRevoke;
        }
    });

    test('a moment put on the field never touches the milestone level, and after a show the replay keeps its camera', async () => {
        const main = await aCatch();
        const camera = await import('../www/xo/js/camera.min.js');
        expect(main.__test__.level()).toBe(0);
        let carried = 0;
        main.beginMilestone(100, () => { carried += 1; });
        dom.el('hud-actions').children.find((b) => b.id === 'skip-show-btn').click();
        await flushAsync();
        expect(carried).toBe(1);
        expect(main.__test__.level()).toBe(100);
        expect(main.__test__.phase()).toBe('result');
        // The console shows a moment and puts the field back: the level stays.
        const xo = globalThis.window.xo;
        expect(xo.moment(1)).toMatch(/^Showing /);
        frames(1);
        expect(camera.getDriver()).toBe('show');
        expect(xo.moment()).toBe('Back to the field as it was.');
        expect(main.__test__.level()).toBe(100);
        // The card has the play camera, and the replay its own, show or no show.
        frames(1);
        expect(camera.getDriver()).toBe('play');
        dom.el('result-actions').children.find((b) => b.textContent === 'Watch the replay').click();
        await flushAsync();
        frames(1);
        expect(camera.getDriver()).toBe('replay');
        expect(main.__test__.level()).toBe(100);
    });
});

/**
 * CHOOSING WHO TO PLAY AS (specs/xo-photos-plan, Step 2): the playbook's row,
 * the tags on the plays that sit the visitor out, and the pre-snap "Play as…"
 * that asks for a player on the field.
 */
describe('choosing who to play as', () => {
    const PLAY_KEY = 'exes-n-ohs-play-settings';

    async function saveAvatar() {
        const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
        createAvatarStore({ win: null }).save({ skin: 'deep', shirt: 'teal' });
    }
    const body = () => dom.el('playbook').querySelector('.playbook-body');
    const byId = (id) => deep(body()).find((n) => n && n.id === id);
    const cardsFor = (slug) => deep(body()).filter((n) => n && n.dataset && n.dataset.slug === slug);
    const tagged = (button) => button.children.some((c) => c.classList && c.classList.contains('play-out'));
    const visitorAt = async () => {
        const r = await import('../www/xo/js/roster.min.js');
        const { SLOTS } = await import('../www/xo/js/playas.min.js');
        return SLOTS.map((s) => s.id).filter((id) => r.isVisitorFigure(r.figureFor(id)));
    };
    async function takeTheField() {
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
    }
    /** Call the first play in the book, which leaves the formation waiting on
     *  the snap. */
    async function callAPlay(slug = null) {
        const cards = deep(body()).filter((n) => n && n.dataset && n.dataset.slug);
        (slug ? cards.find((n) => n.dataset.slug === slug) : cards[0]).click();
        await flushAsync();
    }
    /** Frames on a running clock, for anything timed in game seconds. */
    let now = 100000;
    const frames = (n) => { for (let i = 0; i < n; i += 1) dom.loops[0](now += 16.7); };

    test('with an avatar: a list in two groups, without the linemen who mostly sit out, and it moves the avatar', async () => {
        await saveAvatar();
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        await takeTheField();
        const select = byId('play-as-select');
        expect(select).toBeTruthy();
        expect(select.children.map((g) => g.label)).toEqual(['Offense', 'Defense']);
        const values = select.children.flatMap((g) => g.children.map((o) => o.value));
        expect(values).toEqual(['qb', 'wr1', 'wr2', 'wr3', 'wr4', 'x1', 'x2', 'x3',
            'db1', 'db2', 'db3', 'db4', 's1', 's2']);
        expect(select.children[0].children[2].textContent).toBe('Receiver B');
        expect(select.value).toBe('qb');
        // Labelled, for a screen reader and a click on the words.
        const label = deep(body()).find((n) => n && n.htmlFor === 'play-as-select');
        expect(label.textContent).toBe('Play as');
        // Nobody sits out as the quarterback.
        expect(cardsFor('jumbo1').some(tagged)).toBe(false);

        select.value = 'wr3';
        fire(select, 'change');
        expect(main.getState().playAs).toBe('wr3');
        expect(await visitorAt()).toEqual(['wr3']);
        expect(JSON.parse(globalThis.localStorage.getItem(PLAY_KEY)).playAs).toBe('wr3');
        // Receiver C sits out the two jumbo sets and Screen Left, and nothing else.
        for (const slug of ['jumbo1', 'jumbo2', 'screen1']) {
            expect(cardsFor(slug).length).toBeGreaterThan(0);
            expect(`${slug} ${cardsFor(slug).every(tagged)}`).toBe(`${slug} true`);
        }
        for (const slug of ['pass1', 'pass2', 'run1', 'screen2', 'slant1']) {
            expect(`${slug} ${cardsFor(slug).some(tagged)}`).toBe(`${slug} false`);
        }
        const tag = cardsFor('jumbo1')[0].children.find((c) => c.classList && c.classList.contains('play-out'));
        expect(tag.textContent).toBe('You sit this one out');
        // And back: the tags come off, they do not pile up.
        select.value = 'wr1';
        fire(select, 'change');
        expect(cardsFor('jumbo1').some(tagged)).toBe(false);
        select.value = 'wr4';
        fire(select, 'change');
        select.value = 'wr4';
        fire(select, 'change');
        expect(cardsFor('screen2')[0].children.filter((c) => c.classList && c.classList.contains('play-out'))).toHaveLength(1);
    });

    test('without an avatar the row points to the avatar page, and no play says anybody sits out', async () => {
        globalThis.localStorage.setItem(PLAY_KEY, JSON.stringify({ playAs: 'wr3' }));
        await boot();
        await takeTheField();
        expect(byId('play-as-select')).toBeUndefined();
        const row = deep(body()).find((n) => n && n.classList && n.classList.contains('playbook-playas'));
        expect(row.textContent).toBe('Play any position as yourself.Make your avatar');
        const link = row.children.find((c) => c.tagName === 'A');
        expect(link.href).toBe('../avatar/?return=/xo/');
        expect(link.textContent).toBe('Make your avatar');
        for (const slug of ['jumbo1', 'jumbo2', 'screen1']) expect(cardsFor(slug).some(tagged)).toBe(false);
        // And nothing before the snap but the two buttons it has always had.
        await callAPlay();
        expect(actionLabels()).toEqual(['Change play', 'Snap the ball']);
    });

    test('a lineman chosen on the field is in the list too, so it never disagrees with the field', async () => {
        await saveAvatar();
        globalThis.localStorage.setItem(PLAY_KEY, JSON.stringify({ playAs: 'x5' }));
        await boot();
        await takeTheField();
        const select = byId('play-as-select');
        const values = select.children.flatMap((g) => g.children.map((o) => o.value));
        expect(values.filter((v) => /^x[4-6]$/.test(v))).toEqual(['x5']);
        expect(select.value).toBe('x5');
        // Chosen away from him, he leaves the list.
        select.value = 'db2';
        fire(select, 'change');
        expect(select.children.flatMap((g) => g.children.map((o) => o.value)).some((v) => /^x[4-6]$/.test(v))).toBe(false);
    });

    test('"Play as…" before the snap asks for a player, and the arrows and the button choose one', async () => {
        await saveAvatar();
        const main = await boot();
        await takeTheField();
        await callAPlay('pass1');
        expect(actionLabels()).toEqual(['Change play', 'Play as…', 'Snap the ball']);
        const asBtn = dom.el('hud-actions').children.find((b) => b.id === 'play-as-btn');
        expect(asBtn.dataset.keys).toBe('P');
        expect(asBtn.getAttribute('aria-label')).toBe('Play as… another player');

        press('Play as…');
        await flushAsync();
        const prompt = 'Click any player to play as them, or use the arrow keys.';
        expect(actionLabels()).toEqual([prompt, 'Cancel', 'Play as Quarterback']);
        await jest.advanceTimersByTimeAsync(100);
        expect(dom.el('hud-live').textContent).toBe(prompt);
        const choose = () => dom.el('hud-actions').children.find((b) => b.id === 'pick-choose-btn');
        expect(choose().focused).toBe(true);
        expect(choose().getAttribute('aria-describedby')).toBe('pick-prompt');

        const key = (k) => fire(dom.documentStub, 'keydown', { key: k });
        key('ArrowRight');
        expect(choose().textContent).toBe('Play as Receiver A');
        key('ArrowLeft');
        key('ArrowLeft');
        // Round from the first to the last player on the field: Pass 1 has no
        // lineman 4 to 6, and the defense ends with the safeties.
        expect(choose().textContent).toBe('Play as Safety 2');
        // Nothing has moved yet.
        expect(main.getState().playAs).toBe('qb');

        choose().click();
        await flushAsync();
        expect(main.getState().playAs).toBe('s2');
        expect(await visitorAt()).toEqual(['s2']);
        expect(actionLabels()).toEqual(['Change play', 'Play as…', 'Snap the ball']);
        await jest.advanceTimersByTimeAsync(100);
        expect(dom.el('hud-live').textContent).toBe('You are playing as safety 2.');

        // And the playbook says so next time it opens.
        press('Change play');
        await flushAsync();
        expect(byId('play-as-select').value).toBe('s2');
    });

    test('Cancel keeps the player, Escape is its key, and the arrows do nothing once it is closed', async () => {
        await saveAvatar();
        const main = await boot();
        await takeTheField();
        await callAPlay('pass1');
        press('Play as…');
        await flushAsync();
        const cancel = dom.el('hud-actions').children.find((b) => b.id === 'pick-cancel-btn');
        expect(cancel.dataset.keys).toBe('Escape');
        expect(cancel.getAttribute('aria-label')).toBe('Cancel and keep your player');
        fire(dom.documentStub, 'keydown', { key: 'ArrowRight' });
        cancel.click();
        await flushAsync();
        expect(main.getState().playAs).toBe('qb');
        expect(actionLabels()).toEqual(['Change play', 'Play as…', 'Snap the ball']);
        const after = fire(dom.documentStub, 'keydown', { key: 'ArrowRight' });
        expect(after.defaultPrevented).toBe(false);
        expect(main.getState().playAs).toBe('qb');
    });

    test('while choosing, a tap chooses instead of snapping, and the tap straight after does not snap either', async () => {
        await saveAvatar();
        const main = await boot();
        await takeTheField();
        await callAPlay('pass1');
        const tap = () => fire(dom.el('game-canvas'), 'pointerdown', {
            clientX: 400, clientY: 300, pointerId: 1, button: 0, pointerType: 'touch',
        });
        // Start somewhere other than the quarterback, so a tap choosing him is
        // a change. (Under the stub every player projects to the same point, so
        // the nearest is the first in the list, the quarterback.)
        globalThis.window.xo.playAs('wr2');
        frames(5);
        press('Play as…');
        await flushAsync();
        tap();
        await flushAsync();
        expect(main.getState().playAs).toBe('qb');
        expect(actionLabels()).toEqual(['Change play', 'Play as…', 'Snap the ball']);
        // A second tap at once is the same gesture, not a snap.
        tap();
        await flushAsync();
        expect(actionLabels()).toEqual(['Change play', 'Play as…', 'Snap the ball']);
        // Once the guard has passed, a tap snaps the ball as it always has.
        frames(40);
        tap();
        await flushAsync();
        expect(actionLabels()).toContain('Keep it');
    });
});
