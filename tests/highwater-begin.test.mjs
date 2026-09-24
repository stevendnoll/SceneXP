// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * High Water, booted for real: the page starts under the DOM stub, runs on the
 * shared player (shared/js/player-1.0.0.js), and is played a frame at a time.
 *
 * THE PLAYER'S OWN RULES ARE PROVED IN shared-player.test.mjs. What this suite
 * proves is what only this scene can get wrong in moving onto it (2026-09-24):
 * that its page is wired to the player's ids, that a seek and a replay reach
 * the sea's own clocks, and that the closing fade is still this scene's
 * smoothstep rather than the player's straight line.
 *
 * THE BUTTON HIDES WITH ITS CARD, so before the accessibility pass of
 * 2026-09-23 a keyboard visitor who pressed Begin was left with focus on
 * nothing. Resume, Restart and Replay already moved focus to the pause
 * button; Begin now does too, and a pointer press leaves no ring behind.
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';
import { installDom, flushAsync, fire } from './helpers/dom-stub.mjs';

describe('High Water on the shared player', () => {
    let dom;
    let now;
    let ran;
    let water;
    let sand;
    let storm;
    let END;
    let FADE_FROM;
    let FADE_FOR;

    /** Run every animation-frame callback queued since the last step. */
    function step(ms = 16, times = 1) {
        for (let n = 0; n < times; n++) {
            now += ms;
            const end = dom.loops.length;
            for (let i = ran; i < end; i++) dom.loops[i](now);
            ran = end;
        }
    }

    function begin() {
        fire(dom.el('player-begin'), 'click', { detail: 1 });
        step(16);
        step(16, 10);
    }

    /** Press a key on the scrubber, the way the keyboard seeks. */
    function scrubKey(key) {
        fire(dom.el('player-scrub'), 'keydown', { key });
    }

    beforeEach(async () => {
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
        installThree();
        dom = installDom();
        now = 1000;
        ran = 0;
        jest.resetModules();
        await import('../www/highwater/js/main.js');
        await flushAsync(30);
        // The same module instances the page is running.
        water = await import('../www/highwater/js/water.min.js');
        sand = await import('../www/highwater/js/sand.min.js');
        storm = await import('../www/highwater/js/storm.min.js');
        const { OCEAN_CONFIG } = await import('../www/highwater/js/config.min.js');
        // Where the End key lands: never quite the end, so the fade plays out.
        END = OCEAN_CONFIG.storm.seconds - OCEAN_CONFIG.controls.endGuardSeconds;
        FADE_FROM = OCEAN_CONFIG.storm.seconds - OCEAN_CONFIG.storm.fadeSeconds;
        FADE_FOR = OCEAN_CONFIG.storm.fadeSeconds;
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
        uninstallAll();
    });

    test('FROM THE KEYBOARD, Begin hands focus to the pause button', () => {
        const button = dom.el('player-begin');
        button.focus();
        fire(button, 'click', { detail: 0 });
        expect(document.activeElement).toBe(dom.el('player-pause'));
    });

    test('from a pointer, focus is dropped rather than left on a hidden button', () => {
        const button = dom.el('player-begin');
        button.focus();
        fire(button, 'click', { detail: 1 });
        expect(document.activeElement).not.toBe(dom.el('player-pause'));
        expect(button.focused).toBe(false);
    });

    test('the story waits behind the card, then plays once Begin is pressed', () => {
        step(16, 20);
        expect(Number(dom.el('player-scrub').value)).toBe(0);
        begin();
        expect(dom.el('player-controls').hidden).toBe(false);
        step(100, 10);
        expect(Number(dom.el('player-scrub').value)).toBeGreaterThan(0.5);
    });

    test('A SEEK BRINGS THE TIDE AND THE BEACH WITH IT', () => {
        // The sea's clock has been running since the page loaded, so without
        // the player's onSeek reaching resetWater and resetSand it would sit
        // near zero, and the storm at the end would be watched at the wrong
        // tide (see resetWater).
        begin();
        scrubKey('End');
        expect(water.getElapsed()).toBeCloseTo(END, 6);
        expect(sand.__sand.state().elapsed).toBeCloseTo(END, 6);
    });

    test('THE CLOSING FADE IS STILL THIS SCENE\'S SMOOTHSTEP, not the player\'s straight line', () => {
        begin();
        scrubKey('End');
        // The first frame after a seek carries no time, so the story is held
        // exactly where the seek landed.
        step(16);
        const opacity = Number(dom.el('player-blackout').style.opacity);
        expect(opacity).toBeCloseTo(storm.fadeAt(END), 3);
        // And measurably not the straight line, or this proves nothing.
        const linear = (END - FADE_FROM) / FADE_FOR;
        expect(Math.abs(opacity - linear)).toBeGreaterThan(0.03);
    });

    test('the ending comes up on black, and Watch it again rewinds the sea', () => {
        begin();
        scrubKey('End');
        step(100, 10);
        expect(dom.el('player-ending').hidden).toBe(false);
        expect(dom.el('player-controls').hidden).toBe(true);
        expect(water.getElapsed()).toBeGreaterThan(59);

        fire(dom.el('player-replay'), 'click', { detail: 1 });
        expect(dom.el('player-ending').hidden).toBe(true);
        expect(water.getElapsed()).toBe(0);
        expect(sand.__sand.state().elapsed).toBe(0);
        expect(dom.el('wash').style.opacity).toBe('0');
        expect(dom.el('player-blackout').style.opacity).toBe('0');
    });

    test('A PAUSE FREEZES THE SEA TOO, so the tide cannot drift from the story', () => {
        begin();
        fire(dom.el('player-pause'), 'click', { detail: 1 });
        expect(dom.el('player-card').hidden).toBe(false);
        const held = water.getElapsed();
        step(100, 20);
        expect(water.getElapsed()).toBe(held);
    });
});
