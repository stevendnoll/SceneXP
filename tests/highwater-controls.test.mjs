// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * High Water's player controls: pause, Escape, the pause card, and the scrubber.
 *
 * Added 2026-09-23 after Steve's real-world QA, and moved onto the shared
 * player (shared/js/player-1.0.0.js) on 2026-09-24. The player's rules are
 * proved in shared-player.test.mjs, so this suite proves what this scene hands
 * them: its numbers, its stages and its smoothstep fade, through player.js.
 * The rest checks the two places a seek has to reach that the story clock
 * does not (the sea's own clock and the sand's), and the page furniture the
 * wiring depends on. highwater-begin.test.mjs plays the real page.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';

const CONFIG_URL = '../www/highwater/js/config.js';
const WATER_URL = '../www/highwater/js/water.js';
const STORM_URL = '../www/highwater/js/storm.js';

// Pointed at the sources rather than the builds, matching the sand suite, so a
// stale build cannot pass and the coverage lands on the files people edit.
jest.unstable_mockModule('../www/highwater/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/highwater/js/water.min.js', async () => (
    await import(WATER_URL)
));
jest.unstable_mockModule('../www/highwater/js/storm.min.js', async () => (
    await import(STORM_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);
const P = await import('../www/shared/js/player-1.0.0.js');
const { playerOptions } = await import('../www/highwater/js/player.js');
const storm = await import(STORM_URL);
const water = await import(WATER_URL);
const sand = await import('../www/highwater/js/sand.js');

const OPTS = { ...P.PLAYER_DEFAULTS, ...playerOptions(OCEAN_CONFIG) };
const SECONDS = OCEAN_CONFIG.storm.seconds;
const END = SECONDS - OCEAN_CONFIG.controls.endGuardSeconds;

describe('what High Water hands the shared player', () => {
    test('the story\'s length and every control setting come from config', () => {
        const c = OCEAN_CONFIG.controls;
        expect(OPTS.seconds).toBe(SECONDS);
        expect(OPTS.fadeSeconds).toBe(OCEAN_CONFIG.storm.fadeSeconds);
        expect(OPTS.idleSeconds).toBe(c.idleSeconds);
        expect(OPTS.stepSeconds).toBe(c.stepSeconds);
        expect(OPTS.pageSeconds).toBe(c.pageSeconds);
        expect(OPTS.endGuardSeconds).toBe(c.endGuardSeconds);
        expect(OPTS.flashHoldSeconds).toBe(c.lightningHoldSeconds);
        expect(OPTS.seekReportSeconds).toBe(c.seekReportSeconds);
    });

    test('a seek lands inside the story and never on its last instant', () => {
        expect(P.seekTarget(12.5, OPTS)).toBe(12.5);
        expect(P.seekTarget(-4, OPTS)).toBe(0);
        // Dragging to the far right plays the end of the fade rather than
        // cutting to the ending card under the pointer.
        expect(P.seekTarget(SECONDS, OPTS)).toBe(END);
    });

    test('the arrow keys move this scene\'s step, and Page keys its page', () => {
        const { stepSeconds: step, pageSeconds: page } = OCEAN_CONFIG.controls;
        expect(P.keySeekTarget('ArrowRight', 10, OPTS)).toBe(10 + step);
        expect(P.keySeekTarget('ArrowLeft', 10, OPTS)).toBe(10 - step);
        expect(P.keySeekTarget('PageUp', 10, OPTS)).toBe(10 + page);
        expect(P.keySeekTarget('PageDown', 20, OPTS)).toBe(20 - page);
        expect(P.keySeekTarget('End', 0, OPTS)).toBe(END);
    });

    test('a screen reader hears the story\'s own length', () => {
        expect(P.valueText(24.6, OPTS.seconds)).toBe(`24 seconds of ${SECONDS}`);
    });

    test('THE STAGES ARE THE STORM\'S, reported where storm.js puts them', () => {
        // The player reads start times as `at`, the storm writes them as
        // `from`. Walked frame by frame, the two must agree on every second.
        const names = OCEAN_CONFIG.storm.stages.map((st) => st.name);
        expect(OPTS.stages.map((st) => st.name)).toEqual(names);
        for (let t = 0; t <= SECONDS; t += 1 / 60) {
            const index = P.stageIndexAt(t, OPTS.stages);
            expect([t, OPTS.stages[index].name]).toEqual([t, storm.stageAt(t).name]);
        }
    });

    test('THE FADE IS THE SMOOTHSTEP STEVE QA\'D, not the player\'s straight line', () => {
        const from = SECONDS - OCEAN_CONFIG.storm.fadeSeconds;
        let apart = 0;
        for (let t = 0; t <= SECONDS; t += 1 / 60) {
            expect(OPTS.fadeCurve(t)).toBe(storm.fadeAt(t));
            apart = Math.max(apart, Math.abs(OPTS.fadeCurve(t) - P.fadeAt(t, OPTS)));
        }
        expect(apart).toBeGreaterThan(0.05);
        // The player's contract: nothing before the fade begins, black at the
        // end, which is when the controls step aside and the ending comes up.
        expect(OPTS.fadeCurve(from)).toBe(0);
        expect(OPTS.fadeCurve(from - 1)).toBe(0);
        expect(OPTS.fadeCurve(SECONDS)).toBe(1);
    });
});

describe('THE LIGHTNING IS HELD THROUGH A SEEK', () => {
    // A drag moves the arc clock many times faster than real time, and the
    // lightning's rate cap is written in arc seconds. Held, no scrub can flash
    // faster than the three per second the welcome card is written against.
    test('the hold outlasts the minimum gap between flashes', () => {
        // After a seek the lightning starts from a fresh schedule, which has no
        // memory of the last flash. The hold is what keeps a flash just before
        // the seek and one just after it at least the minimum gap apart.
        expect(OPTS.flashHoldSeconds).toBeGreaterThan(OCEAN_CONFIG.storm.lightning.minGapSeconds);
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

    test('the page loads the shared player\'s sheet between the house sheet and its own', () => {
        const house = html.indexOf('<link rel="stylesheet" href="../shared/css/styles-1.0.0.min.css');
        const shared = html.indexOf('<link rel="stylesheet" href="../shared/css/player-1.0.0.min.css">');
        const own = html.indexOf('<link rel="stylesheet" href="css/experience.min.css');
        expect(house).toBeGreaterThan(-1);
        expect(shared).toBeGreaterThan(house);
        expect(own).toBeGreaterThan(shared);
        expect(html).toContain('<link rel="preload" href="../shared/css/player-1.0.0.min.css" as="style">');
    });

    test('every element the player looks for is on the page', () => {
        // Each is optional to the player, so a renamed one would fail silently:
        // the control would simply never be wired.
        for (const id of Object.values(P.PLAYER_IDS)) {
            expect([id, html.includes(`id="${id}"`)]).toEqual([id, true]);
        }
    });

    test('the controls ship hidden, and nothing on them is nameless', () => {
        expect(html).toMatch(/<div id="player-controls" hidden>/);
        expect(html).toMatch(/<button id="player-pause" type="button" class="menu-btn" aria-label="Pause"/);
        expect(html).toMatch(/<label for="player-scrub" class="sr-only">[^<]+<\/label>/);
        expect(html).toMatch(/<input id="player-scrub" type="range"[^>]*aria-valuetext=/);
        // Not a `.ui-float`: that class is shown once at boot, and these follow
        // the story.
        expect(html).not.toMatch(/id="player-pause"[^>]*ui-float/);
    });

    test('the scrubber\'s max in the markup matches the story', () => {
        // The player writes it from config at boot, and this keeps the
        // no-script first paint honest too.
        const max = html.match(/<input id="player-scrub"[^>]*max="(\d+)"/);
        expect(Number(max[1])).toBe(SECONDS);
        expect(html).toMatch(new RegExp(`aria-valuetext="0 seconds of ${SECONDS}"`));
    });

    test('the pause card is the welcome card, with Resume and Restart', () => {
        const card = html.slice(html.indexOf('id="player-card"'), html.indexOf('id="wash"'));
        expect(card).toMatch(/<p id="player-paused-at"[^>]*hidden>/);
        expect(card).toMatch(/<div id="player-pause-actions"[^>]*hidden>/);
        expect(card).toMatch(/<button id="player-resume"[^>]*class="player-btn player-btn-primary"/);
        expect(card).toMatch(/<button id="player-restart"[^>]*class="player-btn"/);
        // Begin is still the only way in for a first visit.
        expect(card).toMatch(/<button id="player-begin"[^>]*class="player-btn player-btn-primary"/);
    });

    test('the white-out sits under the fade, and the fade under the cards', () => {
        // Same order as before the move: the white-out hands the frame to the
        // black, and the ending sits on the black.
        const at = (id) => html.indexOf(`id="${id}"`);
        expect(at('player-card')).toBeLessThan(at('wash'));
        expect(at('wash')).toBeLessThan(at('player-blackout'));
        expect(at('player-blackout')).toBeLessThan(at('player-ending'));
    });

    test('a capture for the social card still takes the controls out of shot', () => {
        expect(main).toMatch(/document\.body\.classList\.toggle\('hw-capture', !!on\)/);
        expect(css).toMatch(/\.hw-capture #player-controls \{\s*display: none;/);
    });

    test('the loop\'s lightning goes through the player\'s photosensitivity hold', () => {
        const at = main.indexOf('updateLightning(arc, OCEAN_CONFIG)');
        expect(at).toBeGreaterThan(-1);
        const before = main.slice(Math.max(0, at - 120), at);
        expect(before).toMatch(/if \(player && player\.flashAllowed\(\)\)/);
        // And a drag puts out anything mid flash.
        expect(main).toMatch(/onScrubStart: resetLightning/);
    });

    test('THERE IS ONE COPY OF THE PLAYER, and this scene holds none of it', () => {
        // Two copies had to be edited together while they lasted. The rules
        // and the wiring now live only in the shared part.
        expect(main).toContain("from '../../shared/js/player-1.0.0.min.js'");
        for (const gone of ['function pauseArc', 'function seekArc', 'function idleControls',
            'function installControls', "from './controls.min.js'"]) {
            expect([gone, main.includes(gone)]).toEqual([gone, false]);
        }
        expect(css).not.toMatch(/#welcome|#controls\b|#scrub\b|#blackout/);
    });

    test('the copy on the controls keeps house style', () => {
        const copy = [
            ...html.matchAll(/<(?:label|button)[^>]*>([^<]*)</g)
        ].map((m) => m[1]).join(' ');
        expect(copy).not.toMatch(/[—;]/);
    });
});
