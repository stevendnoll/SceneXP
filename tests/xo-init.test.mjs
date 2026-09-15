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
    const main = await import('../www/xo/js/main.js');
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
        press('Snap the ball');
        await flushAsync();
        press('Throw');
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
        const toResult = () => {
            for (let i = 0; i < 900 && dom.el('result').hidden !== false; i += 1) frames(1);
        };
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
        toResult();

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
        toResult();

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
