// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/share-1.0.0.js — the native sheet, clipboard,
 * mailto ladder every Share button on this site walks.
 *
 * THIS MODULE EXISTS BECAUSE SEVEN COPIES OF IT DRIFTED, so the properties that
 * matter most here are the two the copies got wrong:
 *
 *   1. A DISMISSED SHARE SHEET STOPS THE LADDER. `navigator.share` rejects with
 *      an AbortError when the visitor backs out, and treating that as a failure
 *      falls through to a clipboard copy nobody asked for. Seven scenes got
 *      this right and it is still the easiest thing to break in a rewrite.
 *   2. NOTHING IS EVER DISABLED. The acknowledgement used to set
 *      `btn.disabled = true`, which throws keyboard focus out of the dialog
 *      onto the document, so the visitor's next Tab starts at the top of the
 *      page. www/xo fixed it in its own copy during the 2026-09-14 sweep and
 *      the fix never travelled. It is now asserted in one place for everybody.
 *
 * There is no THREE here and no DOM library. The module touches `navigator`,
 * `window` and three element methods, so all of it is driven through small
 * recording stubs and every branch is a real branch.
 */
import { jest } from '@jest/globals';

let mod;

function fakeButton(text = 'Share') {
    return {
        textContent: text,
        disabled: false,
        listeners: {},
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        removeEventListener(type, fn) {
            this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
        },
        click() { (this.listeners.click || []).forEach((fn) => fn()); }
    };
}

const fakeStatus = () => ({ textContent: '' });

/** Run every timer the module scheduled. `flash` is the only thing that uses
 *  one, and the message has to be able to come back off the button. */
let timers;

function installEnvironment({ share = undefined, clipboard = undefined, href = 'https://example.test/xo/index.html' } = {}) {
    timers = [];
    globalThis.navigator = {};
    if (share !== undefined) globalThis.navigator.share = share;
    if (clipboard !== undefined) globalThis.navigator.clipboard = clipboard;
    globalThis.window = {
        location: { href },
        setTimeout: (fn) => { timers.push(fn); return timers.length; }
    };
}

const runTimers = () => { const t = timers; timers = []; t.forEach((fn) => fn()); };
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(async () => {
    jest.resetModules();
    installEnvironment();
    mod = await import('../www/shared/js/share-1.0.0.js');
    mod.__test__.resetFlash();
});

afterEach(() => {
    delete globalThis.navigator;
    delete globalThis.window;
});

// ---- The URL ----------------------------------------------------------------

describe('shareUrl', () => {
    test('resolves index.html away, so a share is the directory', () => {
        expect(mod.shareUrl('https://example.test/xo/index.html')).toBe('https://example.test/xo/');
    });

    test('is correct on localhost and on a staging host without configuration', () => {
        expect(mod.shareUrl('http://localhost:8000/earthdefense/')).toBe('http://localhost:8000/earthdefense/');
        expect(mod.shareUrl('https://staging.example.test/highwater/?qa'))
            .toBe('https://staging.example.test/highwater/');
    });

    test('drops a fragment the visitor happened to arrive with', () => {
        expect(mod.shareUrl('https://example.test/steve/#desk')).toBe('https://example.test/steve/');
    });

    test('falls back to what it was given rather than throwing', () => {
        expect(mod.shareUrl('not a url at all')).toBe('not a url at all');
    });

    test('reads the live location when asked for nothing', () => {
        expect(mod.shareUrl()).toBe('https://example.test/xo/');
    });
});

// ---- The ladder -------------------------------------------------------------

describe('the ladder', () => {
    test('takes the native sheet when there is one', async () => {
        const share = jest.fn(async () => {});
        installEnvironment({ share });
        expect(await mod.shareLink({ title: 'X', text: 'Y' })).toBe('native');
        expect(share).toHaveBeenCalledWith({ title: 'X', text: 'Y', url: 'https://example.test/xo/' });
    });

    /** THE ONE THE COPIES ALL HAD TO GET RIGHT. */
    test('a dismissed sheet STOPS, and does not copy anything', async () => {
        const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
        const writeText = jest.fn(async () => {});
        installEnvironment({ share: jest.fn(async () => { throw abort; }), clipboard: { writeText } });

        expect(await mod.shareLink({ title: 'X', text: 'Y' })).toBe('cancelled');
        expect(writeText).not.toHaveBeenCalled();
    });

    test('a sheet that fails for any OTHER reason falls through to the clipboard', async () => {
        const writeText = jest.fn(async () => {});
        installEnvironment({
            share: jest.fn(async () => { throw new Error('no sheet after all'); }),
            clipboard: { writeText }
        });
        expect(await mod.shareLink({ title: 'X', text: 'Y' })).toBe('copy');
        expect(writeText).toHaveBeenCalledWith('Y https://example.test/xo/');
    });

    test('the clipboard gets the SENTENCE as well as the link', async () => {
        // A bare URL arriving in somebody's messages says nothing about what it
        // is. Six scenes copied the url alone until they moved onto this.
        const writeText = jest.fn(async () => {});
        installEnvironment({ clipboard: { writeText } });
        await mod.shareLink({ title: 'High Water', text: 'Sixty seconds at the water\'s edge.' });
        expect(writeText).toHaveBeenCalledWith(
            'Sixty seconds at the water\'s edge. https://example.test/xo/');
    });

    test('a clipboard that refuses falls through to a mailto', async () => {
        installEnvironment({ clipboard: { writeText: async () => { throw new Error('denied'); } } });
        expect(await mod.shareLink({ title: 'Earth Defense', text: 'I held the line.' })).toBe('mail');
        expect(globalThis.window.location.href).toMatch(/^mailto:\?subject=Earth%20Defense&body=/);
        expect(decodeURIComponent(globalThis.window.location.href)).toContain('https://example.test/xo/');
    });

    test('no sheet and no clipboard at all is still a mailto', async () => {
        installEnvironment({});
        expect(await mod.shareLink({ title: 'T', text: 'B' })).toBe('mail');
        expect(globalThis.window.location.href.startsWith('mailto:')).toBe(true);
    });

    test('an explicit url is used instead of the page it is on', async () => {
        const share = jest.fn(async () => {});
        installEnvironment({ share });
        await mod.shareLink({ title: 'T', text: 'B', url: 'https://elsewhere.test/' });
        expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://elsewhere.test/' }));
    });

    test('a payload with nothing in it still sends the page', async () => {
        const share = jest.fn(async () => {});
        installEnvironment({ share });
        await mod.shareLink({});
        expect(share).toHaveBeenCalledWith({ title: '', text: '', url: 'https://example.test/xo/' });
    });

    test('onCopied fires on the clipboard rung and on no other', async () => {
        const onCopied = jest.fn();
        installEnvironment({ share: jest.fn(async () => {}) });
        await mod.shareLink({ text: 'x' }, { onCopied });
        expect(onCopied).not.toHaveBeenCalled();

        installEnvironment({ clipboard: { writeText: async () => {} } });
        await mod.shareLink({ text: 'x' }, { onCopied });
        expect(onCopied).toHaveBeenCalledTimes(1);
    });
});

// ---- The acknowledgement ----------------------------------------------------

describe('flash', () => {
    /** THE DEFECT THIS MODULE WAS EXTRACTED TO KILL. */
    test('NEVER disables the button', () => {
        const btn = fakeButton();
        mod.flash(btn, null);
        expect(btn.disabled).toBe(false);
        runTimers();
        expect(btn.disabled).toBe(false);
    });

    test('says it on the button and puts it back afterwards', () => {
        const btn = fakeButton('Share');
        expect(mod.flash(btn, null)).toBe(true);
        expect(btn.textContent).toBe('Link copied');
        runTimers();
        expect(btn.textContent).toBe('Share');
    });

    test('says it out loud too, and clears the region afterwards', () => {
        const btn = fakeButton();
        const status = fakeStatus();
        mod.flash(btn, status);
        expect(status.textContent).toBe('Link copied');
        runTimers();
        expect(status.textContent).toBe('');
    });

    test('a second press during the message is ignored, not stacked', () => {
        // Two timers would restore the wrong label: the second would put back
        // "Link copied" rather than "Share".
        const btn = fakeButton('Share');
        expect(mod.flash(btn, null)).toBe(true);
        expect(mod.flash(btn, null)).toBe(false);
        expect(timers).toHaveLength(1);
        runTimers();
        expect(btn.textContent).toBe('Share');
    });

    test('takes its own words', () => {
        const btn = fakeButton();
        mod.flash(btn, null, 'Copied to your clipboard');
        expect(btn.textContent).toBe('Copied to your clipboard');
    });

    test('no button is not an error', () => {
        expect(mod.flash(null, fakeStatus())).toBe(false);
    });

    test('with no window to schedule on, it restores immediately', () => {
        // A headless boot, or a scene torn down mid-flash. Better to say nothing
        // than to leave a button stuck reading "Link copied" for ever.
        const btn = fakeButton('Share');
        delete globalThis.window;
        mod.flash(btn, null);
        expect(btn.textContent).toBe('Share');
        expect(mod.__test__.isFlashing()).toBe(false);
    });
});

// ---- The button -------------------------------------------------------------

describe('installShare', () => {
    test('wires a press to the ladder and reports how it went', async () => {
        installEnvironment({ share: jest.fn(async () => {}) });
        const btn = fakeButton();
        const onShare = jest.fn();
        mod.installShare(btn, () => ({ title: 'T', text: 'B' }), { onShare });

        btn.click();
        await flush();
        expect(onShare).toHaveBeenCalledWith('native');
    });

    /** THE DATA IS ASKED FOR AT PRESS TIME, which is the whole reason it is a
     *  function. The end card is wired once and reused, and the score is
     *  different every game. */
    test('asks for the payload on every press, not when it was wired', async () => {
        const share = jest.fn(async () => {});
        installEnvironment({ share });
        const btn = fakeButton();
        let score = 100;
        mod.installShare(btn, () => ({ title: 'T', text: `I scored ${score}` }));

        btn.click();
        await flush();
        score = 300;
        btn.click();
        await flush();

        expect(share.mock.calls[0][0].text).toBe('I scored 100');
        expect(share.mock.calls[1][0].text).toBe('I scored 300');
    });

    test('takes a plain object too', async () => {
        const share = jest.fn(async () => {});
        installEnvironment({ share });
        const btn = fakeButton();
        mod.installShare(btn, { title: 'T', text: 'B' });
        btn.click();
        await flush();
        expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: 'B' }));
    });

    test('flashes the button on the clipboard path', async () => {
        installEnvironment({ clipboard: { writeText: async () => {} } });
        const btn = fakeButton('Share');
        const status = fakeStatus();
        mod.installShare(btn, () => ({ text: 'B' }), { status });

        btn.click();
        await flush();
        expect(btn.textContent).toBe('Link copied');
        expect(status.textContent).toBe('Link copied');
        expect(btn.disabled).toBe(false);
    });

    test('a scene that cannot describe itself does not throw at a visitor', async () => {
        installEnvironment({ share: jest.fn(async () => {}) });
        const btn = fakeButton();
        const onShare = jest.fn();
        mod.installShare(btn, () => { throw new Error('no config'); }, { onShare });

        expect(() => btn.click()).not.toThrow();
        await flush();
        expect(onShare).not.toHaveBeenCalled();
    });

    test('a rejected ladder is swallowed rather than surfacing unhandled', async () => {
        installEnvironment({});
        const btn = fakeButton();
        // No window, so the mailto rung throws inside the promise.
        delete globalThis.window;
        mod.installShare(btn, () => ({ text: 'B' }));
        expect(() => btn.click()).not.toThrow();
        await flush();
    });

    test('hands back a way to unwire it', () => {
        const btn = fakeButton();
        const off = mod.installShare(btn, () => ({}));
        expect(btn.listeners.click).toHaveLength(1);
        off();
        expect(btn.listeners.click).toHaveLength(0);
    });

    test('no button is not an error, and unwiring it is not either', () => {
        const off = mod.installShare(null, () => ({}));
        expect(typeof off).toBe('function');
        expect(() => off()).not.toThrow();
    });

    test('passes an AbortSignal through when one is given', () => {
        const btn = fakeButton();
        let sawOptions = null;
        btn.addEventListener = (type, fn, options) => { sawOptions = options; };
        const signal = {};
        mod.installShare(btn, () => ({}), { signal });
        expect(sawOptions).toEqual({ signal });
    });

    test('a button with no removeEventListener does not break unwiring', () => {
        const btn = fakeButton();
        const off = mod.installShare(btn, () => ({}));
        delete btn.removeEventListener;
        expect(() => off()).not.toThrow();
    });
});
