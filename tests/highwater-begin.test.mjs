// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * High Water's Begin, pressed for real: the page boots under the DOM stub and
 * the button is clicked the way a keyboard clicks it (detail 0) and the way a
 * pointer does.
 *
 * THE BUTTON HIDES WITH ITS CARD, so before the accessibility pass of
 * 2026-09-23 a keyboard visitor who pressed it was left with focus on
 * nothing. Resume, Restart and Replay already moved focus to the pause
 * button; Begin now does too, and a pointer press leaves no ring behind.
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';
import { installDom, flushAsync, fire } from './helpers/dom-stub.mjs';

describe('Begin', () => {
    let dom;

    beforeEach(async () => {
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
        installThree();
        dom = installDom();
        jest.resetModules();
        await import('../www/highwater/js/main.js');
        await flushAsync(30);
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
        uninstallAll();
    });

    test('FROM THE KEYBOARD, focus lands on the pause button', () => {
        const begin = dom.el('begin');
        begin.focus();
        fire(begin, 'click', { detail: 0 });
        expect(document.activeElement).toBe(dom.el('pause-btn'));
    });

    test('from a pointer, focus is dropped rather than left on a hidden button', () => {
        const begin = dom.el('begin');
        begin.focus();
        fire(begin, 'click', { detail: 1 });
        expect(document.activeElement).not.toBe(dom.el('pause-btn'));
        expect(begin.focused).toBe(false);
    });
});
