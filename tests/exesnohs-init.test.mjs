// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-init.test.mjs - boot smoke for X's and O's.
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
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

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

async function boot() {
    const main = await import('../www/exesnohs/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(1200);
    return main;
}

/** Every button currently in the action row, by its visible text. */
const actionLabels = () => dom.el('hud-actions').children.map((b) => b.textContent);

/** Walk from the welcome card into a live play. Returns the main module. */
async function toLivePlay() {
    const main = await boot();
    dom.el('welcome-actions').children[0].click();   // Take the field
    await flushAsync();
    // The playbook is open. Choosing is what starts a play.
    const { PLAYS } = await import('../www/exesnohs/js/playbook-ui.js');
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

describe('a play, end to end', () => {
    test('reaches the snap button and then the throw row', async () => {
        await toLivePlay();
        expect(actionLabels()).toEqual(['Snap the ball']);

        dom.el('hud-actions').children[0].click();
        await flushAsync();

        const labels = actionLabels();
        expect(labels[labels.length - 1]).toBe('Keep it');
        expect(labels.length).toBeGreaterThan(1);
        for (const label of labels.slice(0, -1)) {
            expect(label).toMatch(/^Throw [ABCD]$/);
        }
    });

    /**
     * THE THROW BUTTONS HAVE TO BE TELLABLE APART, which is the whole finding
     * this batch started from: the letters existed on the buttons and nowhere a
     * visitor could see them. Each button now carries its receiver's colour as
     * a swatch, and no two receivers may share one.
     */
    test('each throw button wears its own receiver\'s colour', async () => {
        const { EXESNOHS_CONFIG: CFG } = await import('../www/exesnohs/js/config.js');
        await toLivePlay();
        dom.el('hud-actions').children[0].click();
        await flushAsync();

        const throws = dom.el('hud-actions').children
            .filter((b) => b.dataset && b.dataset.receiver);
        expect(throws.length).toBeGreaterThan(1);

        const inks = new Set();
        for (const btn of throws) {
            const who = CFG.receivers[btn.dataset.receiver];
            expect(who).toBeTruthy();
            expect(btn.textContent).toContain(who.letter);
            expect(btn.getAttribute('aria-label')).toBe(`Throw to receiver ${who.letter}`);
            expect(btn.style.getPropertyValue('--throw-ink')).toBe(who.ink);
            inks.add(who.ink);
        }
        expect(inks.size).toBe(throws.length);
    });

    test('runs to a whistle and shows what it was worth', async () => {
        await toLivePlay();
        dom.el('hud-actions').children[0].click();     // snap
        await flushAsync();
        dom.el('hud-actions').children[0].click();     // throw to the first target
        await flushAsync();

        // Twelve seconds of frames at 60Hz is past PLAY_TIMEOUT whatever the
        // simulation decides, so this cannot hang on a play that never ends.
        for (let i = 0; i < 900 && dom.el('result').hidden !== false; i += 1) {
            dom.loops[0](i * 16.7);
        }
        expect(dom.el('result').hidden).toBe(false);
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
        dom.el('hud-actions').children[0].click();          // snap
        await flushAsync();
        dom.el('hud-actions').children[0].click();          // throw
        await flushAsync();
        for (let i = 0; i < 900 && dom.el('result').hidden !== false; i += 1) {
            dom.loops[0](i * 16.7);
        }
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
        expect(skip.getAttribute('aria-label')).toBe('Skip the replay and see the result');
        expect(dom.el('game-hud').hidden).toBe(false);
        expect(skip.focused).toBe(true);

        // And pressing it lands back on the result rather than nowhere.
        expect(dom.el('result').hidden).toBe(true);
        skip.click();
        await flushAsync();
        expect(dom.el('result').hidden).toBe(false);
        expect(dom.el('hud-actions').children.length).toBe(0);
        void main;
    });
});

describe('the markup and the stylesheet agree', () => {
    const read = (p) => import('node:fs').then((fs) =>
        fs.readFileSync(new URL(`../www/exesnohs/${p}`, import.meta.url), 'utf8'));

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
