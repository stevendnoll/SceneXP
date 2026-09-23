// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * High Water's player controls: pause, Escape, the pause card, and the scrubber.
 *
 * Added 2026-09-23 after Steve's real-world QA. The rules live in controls.js
 * and are pure, so most of this suite drives them directly. The rest checks
 * the two places a seek has to reach that the story clock does not (the sea's
 * own clock and the sand's), and the page furniture the wiring depends on.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';

const CONFIG_URL = '../www/highwater/js/config.js';
const WATER_URL = '../www/highwater/js/water.js';

// Pointed at the sources rather than the builds, matching the sand suite, so a
// stale build cannot pass and the coverage lands on the files people edit.
jest.unstable_mockModule('../www/highwater/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/highwater/js/water.min.js', async () => (
    await import(WATER_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);
const controls = await import('../www/highwater/js/controls.js');
const water = await import(WATER_URL);
const sand = await import('../www/highwater/js/sand.js');

const END = OCEAN_CONFIG.storm.seconds - OCEAN_CONFIG.controls.endGuardSeconds;

describe('Escape', () => {
    const { escapeAction } = controls;

    test('pauses a story in progress and resumes a paused one', () => {
        expect(escapeAction({ begun: true, finished: false, paused: false })).toBe('pause');
        expect(escapeAction({ begun: true, finished: false, paused: true })).toBe('resume');
    });

    test('does nothing on the welcome card or the ending', () => {
        // The welcome card carries the content warning and is dismissed only by
        // Begin. The ending has nothing behind it to go back to.
        expect(escapeAction({ begun: false, finished: false, paused: false })).toBeNull();
        expect(escapeAction({ begun: true, finished: true, paused: false })).toBeNull();
    });

    test('leaves the key to a text field, never to the scrubber', () => {
        const { isEditable } = controls;
        expect(isEditable(null)).toBe(false);
        expect(isEditable({ tagName: 'TEXTAREA' })).toBe(true);
        expect(isEditable({ tagName: 'SELECT' })).toBe(true);
        expect(isEditable({ tagName: 'INPUT' })).toBe(true);
        expect(isEditable({ tagName: 'INPUT', type: 'search' })).toBe(true);
        expect(isEditable({ tagName: 'DIV', isContentEditable: true })).toBe(true);
        // Pausing from the scrubber or a button is exactly right.
        expect(isEditable({ tagName: 'INPUT', type: 'range' })).toBe(false);
        expect(isEditable({ tagName: 'BUTTON' })).toBe(false);
        expect(isEditable({ tagName: 'BODY' })).toBe(false);
    });
});

describe('the scrubber', () => {
    const { seekTarget, keySeekTarget } = controls;

    test('a seek lands inside the story and never on its last instant', () => {
        expect(seekTarget(12.5)).toBe(12.5);
        expect(seekTarget(-4)).toBe(0);
        expect(seekTarget('not a number')).toBe(0);
        // Dragging to the far right plays the end of the fade rather than
        // cutting to the ending card under the pointer.
        expect(seekTarget(OCEAN_CONFIG.storm.seconds)).toBe(END);
        expect(seekTarget(1e6)).toBeLessThan(OCEAN_CONFIG.storm.seconds);
    });

    test('the arrow keys move a visible step, not the slider\'s tenth', () => {
        const step = OCEAN_CONFIG.controls.stepSeconds;
        const page = OCEAN_CONFIG.controls.pageSeconds;
        expect(keySeekTarget('ArrowRight', 10)).toBe(10 + step);
        expect(keySeekTarget('ArrowUp', 10)).toBe(10 + step);
        expect(keySeekTarget('ArrowLeft', 10)).toBe(10 - step);
        expect(keySeekTarget('ArrowDown', 10)).toBe(10 - step);
        expect(keySeekTarget('PageUp', 10)).toBe(10 + page);
        expect(keySeekTarget('PageDown', 20)).toBe(20 - page);
        expect(keySeekTarget('Home', 30)).toBe(0);
        expect(keySeekTarget('End', 0)).toBe(END);
        // Clamped at both ends like any other seek.
        expect(keySeekTarget('ArrowLeft', 2)).toBe(0);
        expect(keySeekTarget('ArrowRight', END)).toBe(END);
        expect(keySeekTarget('ArrowRight', NaN)).toBe(step);
    });

    test('any other key is left alone', () => {
        for (const key of ['Tab', 'Escape', 'Enter', ' ', 'a']) {
            expect(keySeekTarget(key, 10)).toBeNull();
        }
    });

    test('what a visitor reads and what a screen reader hears', () => {
        const { clockLabel, valueText, progressPercent } = controls;
        expect(clockLabel(0)).toBe('0:00');
        // Rounded down, so it never claims a second not yet reached.
        expect(clockLabel(24.9)).toBe('0:24');
        expect(clockLabel(59.99)).toBe('0:59');
        expect(clockLabel(75)).toBe('1:15');
        expect(clockLabel(-3)).toBe('0:00');

        const total = OCEAN_CONFIG.storm.seconds;
        expect(valueText(0)).toBe(`0 seconds of ${total}`);
        expect(valueText(1.4)).toBe(`1 second of ${total}`);
        expect(valueText(24.6)).toBe(`24 seconds of ${total}`);
        expect(valueText(undefined)).toBe(`0 seconds of ${total}`);

        expect(progressPercent(0)).toBe('0.00%');
        expect(progressPercent(total / 2)).toBe('50.00%');
        expect(progressPercent(total * 2)).toBe('100.00%');
        expect(progressPercent(-1)).toBe('0.00%');
    });
});

describe('the controls fade, but never out from under the visitor', () => {
    const { mayIdle } = controls;

    test('idle only when nobody is using them', () => {
        expect(mayIdle({ scrubbing: false, hovering: false, keyboardFocus: false })).toBe(true);
        expect(mayIdle({ scrubbing: true, hovering: false, keyboardFocus: false })).toBe(false);
        expect(mayIdle({ scrubbing: false, hovering: true, keyboardFocus: false })).toBe(false);
        // Fading the element with keyboard focus takes the focus ring with it.
        expect(mayIdle({ scrubbing: false, hovering: false, keyboardFocus: true })).toBe(false);
    });
});

describe('THE LIGHTNING IS HELD THROUGH A SEEK', () => {
    // A drag moves the arc clock many times faster than real time, and the
    // lightning's rate cap is written in arc seconds. Held, no scrub can flash
    // faster than the three per second the welcome card is written against.
    const { lightningAllowed } = controls;

    test('held mid drag and while the hold runs, free otherwise', () => {
        expect(lightningAllowed({ scrubbing: false, holdSeconds: 0 })).toBe(true);
        expect(lightningAllowed({ scrubbing: true, holdSeconds: 0 })).toBe(false);
        expect(lightningAllowed({ scrubbing: false, holdSeconds: 0.2 })).toBe(false);
    });

    test('the hold outlasts the minimum gap between flashes', () => {
        // After a seek the lightning starts from a fresh schedule, which has no
        // memory of the last flash. The hold is what keeps a flash just before
        // the seek and one just after it at least the minimum gap apart.
        expect(OCEAN_CONFIG.controls.lightningHoldSeconds)
            .toBeGreaterThan(OCEAN_CONFIG.storm.lightning.minGapSeconds);
    });
});

describe('A SEEK BRINGS THE TIDE WITH IT', () => {
    // The story clock is only one of the scene's clocks. The tide and the sets
    // run on the sea's, and a storm watched at the wrong tide is visibly weaker
    // (see resetWater). A seek puts both sheets' clocks where a replay would
    // have them at that second. Both of these fail on the old reset, which
    // ignored its argument and always went to zero.

    test('the sea\'s clock lands on the second the story does', () => {
        water.resetWater(23.5);
        expect(water.getElapsed()).toBe(23.5);
        water.resetWater();
        expect(water.getElapsed()).toBe(0);
        water.resetWater(-5);
        expect(water.getElapsed()).toBe(0);
        water.resetWater(Number.NaN);
        expect(water.getElapsed()).toBe(0);
    });

    test('and so does the beach\'s, with nothing left in flight', () => {
        sand.resetSand(23.5);
        expect(sand.__sand.state().elapsed).toBe(23.5);
        expect(sand.__sand.state().swashes).toEqual([]);
        sand.resetSand();
        expect(sand.__sand.state().elapsed).toBe(0);
        sand.resetSand('soon');
        expect(sand.__sand.state().elapsed).toBe(0);
    });
});

describe('the page and the wiring', () => {
    let html;
    let main;
    let css;
    beforeAll(async () => {
        [html, main, css] = await Promise.all([
            readFile(new URL('../www/highwater/index.html', import.meta.url), 'utf8'),
            readFile(new URL('../www/highwater/js/main.js', import.meta.url), 'utf8'),
            readFile(new URL('../www/highwater/css/experience.css', import.meta.url), 'utf8')
        ]);
    });

    test('the controls ship hidden, and nothing on them is nameless', () => {
        expect(html).toMatch(/<div id="controls" hidden>/);
        expect(html).toMatch(/<button id="pause-btn" type="button" class="menu-btn" aria-label="Pause"/);
        expect(html).toMatch(/<label for="scrub" class="sr-only">[^<]+<\/label>/);
        expect(html).toMatch(/<input id="scrub" type="range"[^>]*aria-valuetext=/);
        // Not a `.ui-float`: that class is shown once at boot, and these follow
        // the story.
        expect(html).not.toMatch(/id="pause-btn"[^>]*ui-float/);
    });

    test('the scrubber\'s max in the markup matches the story', () => {
        // main.js writes it from config at boot, and this keeps the no-script
        // first paint honest too.
        const max = html.match(/<input id="scrub"[^>]*max="(\d+)"/);
        expect(Number(max[1])).toBe(OCEAN_CONFIG.storm.seconds);
    });

    test('the pause card is the welcome card, with Resume and Restart', () => {
        const card = html.slice(html.indexOf('id="welcome"'), html.indexOf('id="wash"'));
        expect(card).toMatch(/<p id="paused-at"[^>]*hidden>/);
        expect(card).toMatch(/<div id="pause-actions"[^>]*hidden>/);
        expect(card).toMatch(/<button id="resume"[^>]*class="primary"/);
        expect(card).toMatch(/<button id="restart"/);
        // Begin is still the only way in for a first visit.
        expect(card).toMatch(/<button id="begin"/);
    });

    test('Restart wears the shared pill, which is keyed by id', () => {
        // The same trap that shipped Share as a bare browser button.
        const ruleFor = (needle) => {
            const at = css.indexOf(needle);
            expect(at).toBeGreaterThan(-1);
            return css.slice(css.lastIndexOf('}', at) + 1, at);
        };
        expect(ruleFor('border-radius: 2rem;')).toContain('#restart');
        expect(ruleFor('background: rgba(232, 238, 241, 0.10);')).toContain('#restart:hover');
        expect(ruleFor('outline: 2px solid #9fb0b8;')).toContain('#restart:focus-visible');
    });

    test('Escape, the button, and a hidden tab all pause', () => {
        expect(main).toMatch(/window\.addEventListener\('keydown', onKeyDown\)/);
        expect(main).toMatch(/pauseArc\('key'\)/);
        expect(main).toMatch(/pauseArc\('button'\)/);
        // Coming back to the tab lands on the pause card (Steve, 2026-09-23).
        expect(main).toMatch(/if \(escapeAction\(state\) === 'pause'\) pauseArc\('hidden'\)/);
    });

    test('the lightning in the loop goes through the hold', () => {
        const at = main.indexOf('updateLightning(state.arc, OCEAN_CONFIG)');
        expect(at).toBeGreaterThan(-1);
        const before = main.slice(Math.max(0, at - 200), at);
        expect(before).toMatch(/if \(lightningAllowed\(/);
    });

    test('the new moments are counted', () => {
        for (const event of ['pause', 'resume', 'restart', 'seek']) {
            expect(main).toMatch(new RegExp(`\\btrack\\(\\s*'${event}'`));
        }
        // And a scrubbed watch says so wherever the funnel reads it.
        expect(main).toMatch(/track\('arc-complete', \{[^}]*scrubbed/);
    });

    test('the copy on the controls keeps house style', () => {
        const copy = [
            ...html.matchAll(/<(?:label|button)[^>]*>([^<]*)</g)
        ].map((m) => m[1]).join(' ');
        expect(copy).not.toMatch(/[—;]/);
    });
});
