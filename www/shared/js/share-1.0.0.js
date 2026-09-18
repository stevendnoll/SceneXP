// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * share.js - Handing a link to somebody (shared engine part).
 *
 * ONE LADDER, THREE RUNGS: the device's own share sheet, then a clipboard copy,
 * then a mailto. Every scene on this site that offers a Share button walks the
 * same three, and until this file existed every scene walked them in its own
 * copy of the same forty lines.
 *
 * THIS EXISTS BECAUSE THE COPIES DRIFTED, which is the whole argument for it
 * and is worth writing down rather than asserting. The ladder was pasted into
 * automan, dad, family, interstate, roqui, seedtoseed and steve, and then
 * www/xo fixed a real accessibility defect in its own copy during the
 * 2026-09-14 sweep. The fix never travelled. Seven scenes still did this:
 *
 *     btn.textContent = 'Link copied';
 *     btn.disabled = true;
 *
 * Disabling the element that currently has focus throws focus out of the dialog
 * and onto the document, so the visitor's next Tab starts from the top of the
 * page, and a screen reader is not reliably told that a word changed on a
 * button it has already read. `flash` below does what xo's version does
 * instead: it swaps the label, writes the same words to a status line INSIDE
 * the dialog (content outside an aria-modal dialog may not be spoken at all),
 * disables nothing, and ignores a second press while the message is up.
 *
 * A DISMISSED SHARE SHEET IS NOT A FAILURE, and that is the other thing worth
 * not losing. `navigator.share` rejects with an AbortError when the visitor
 * backs out, and treating that like an error falls straight through to a
 * clipboard copy nobody asked for. The visitor who closed the sheet has
 * decided; the ladder stops there.
 *
 * THE URL IS DERIVED, NEVER WRITTEN DOWN. `new URL('.', location.href)`
 * resolves away an explicit index.html and gives the directory the page is
 * actually being served from, so a share is correct on localhost, on a staging
 * host and in production with nothing to remember.
 *
 * NOTHING HERE TOUCHES THE NETWORK and nothing is logged from inside it. The
 * caller is told HOW the share went and decides whether that is worth
 * recording, which keeps this module free of the telemetry part and means a
 * usage log that fails cannot cost a visitor their share.
 */

/** How long the "Link copied" acknowledgement stays up, in milliseconds. */
const FLASH_MS = 1800;

/** Whether a flash is currently up, so a second press during it is ignored
 *  rather than stacking two timers that restore the wrong label. */
let flashing = false;

/** The page's own directory URL, which is what every share sends.
 *
 *  Exported because two scenes want it for something other than a share (a
 *  QR code, a "copy link" row), and because a test can assert it resolves
 *  index.html away without driving a share sheet. */
export function shareUrl(href = (typeof window !== 'undefined' ? window.location.href : '')) {
    try {
        return new URL('.', href).href;
    } catch (e) {
        return href || '';
    }
}

/** Walk the ladder, and say which rung it stopped on.
 *
 *  Returns 'native', 'cancelled', 'copy' or 'mail'. The caller is told after
 *  the fact and is free to do nothing with it.
 *
 *  `onCopied` is called only on the clipboard rung, because that is the only
 *  one with no acknowledgement of its own: a share sheet is plainly a share
 *  sheet and a mail client opening is plainly a mail client opening, but a
 *  silent clipboard write is indistinguishable from a button that did nothing.
 */
export async function shareLink(data, { onCopied = null } = {}) {
    const payload = {
        title: data.title || '',
        text: data.text || '',
        url: data.url || shareUrl()
    };
    const nav = typeof navigator !== 'undefined' ? navigator : null;

    if (nav && typeof nav.share === 'function') {
        try {
            await nav.share(payload);
            return 'native';
        } catch (e) {
            // BACKING OUT IS A DECISION, NOT AN ERROR. Falling through here
            // would copy a link the visitor just declined to send.
            if (e && e.name === 'AbortError') return 'cancelled';
        }
    }

    const line = `${payload.text} ${payload.url}`.trim();
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        try {
            await nav.clipboard.writeText(line);
            if (onCopied) onCopied();
            return 'copy';
        } catch (e) { /* fall through to the last rung */ }
    }

    if (typeof window !== 'undefined') {
        window.location.href = `mailto:?subject=${encodeURIComponent(payload.title)}`
            + `&body=${encodeURIComponent(line)}`;
    }
    return 'mail';
}

/** Say the link was copied, on the button and out loud.
 *
 *  NOTHING IS DISABLED. See the note at the top of this file: disabling the
 *  focused element is what the seven older copies of this got wrong, and it
 *  costs a keyboard visitor their place in the dialog.
 *
 *  `status` should be an element INSIDE the same dialog as the button. Content
 *  outside an aria-modal dialog may not be announced at all, so a live region
 *  parked at the bottom of the page would be silent exactly when it matters. */
export function flash(button, status, message = 'Link copied', ms = FLASH_MS) {
    if (!button || flashing) return false;
    flashing = true;
    const was = button.textContent;
    button.textContent = message;
    if (status) status.textContent = message;
    const done = () => {
        button.textContent = was;
        if (status) status.textContent = '';
        flashing = false;
    };
    if (typeof window !== 'undefined' && window.setTimeout) window.setTimeout(done, ms);
    else done();
    return true;
}

/** Wire a button to the ladder, acknowledgement and all.
 *
 *  `buildData` is a FUNCTION rather than an object, because the interesting
 *  shares carry a result: a score, a time, a count, and the button is wired
 *  once while the number changes every run. Asking for it at press time means
 *  no scene has to remember to re-wire.
 *
 *  Returns a function that removes the listener, for a scene that rebuilds its
 *  end card rather than reusing it. */
export function installShare(button, buildData, {
    status = null, onShare = null, message = 'Link copied', signal = null
} = {}) {
    if (!button || typeof button.addEventListener !== 'function') return () => {};
    const onClick = () => {
        let data;
        try {
            data = typeof buildData === 'function' ? buildData() : buildData;
        } catch (e) {
            return;   // a scene that cannot describe itself should not throw at a visitor
        }
        shareLink(data, { onCopied: () => flash(button, status, message) })
            .then((how) => { if (onShare) onShare(how); })
            .catch(() => {});
    };
    button.addEventListener('click', onClick, signal ? { signal } : undefined);
    return () => {
        if (typeof button.removeEventListener === 'function') {
            button.removeEventListener('click', onClick);
        }
    };
}

export const __test__ = {
    FLASH_MS,
    isFlashing: () => flashing,
    resetFlash: () => { flashing = false; }
};
