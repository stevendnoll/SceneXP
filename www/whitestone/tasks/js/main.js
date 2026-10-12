// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * main.js - The cleaner's page.
 *
 * M0: THE PIN FORM, AND NOTHING BEHIND IT YET. The form ships `hidden` and
 * appears only once this runs, so without JavaScript it can never submit a
 * PIN into a page address. Opening a real checklist needs the server and the
 * sealed link (Whitestone M3 and M4), so a well-formed PIN is answered with a
 * plain preview note for now.
 */

// Every visitor sentence lives in copy.js, where one test sweeps them all.
import { TASKS_PAGE as COPY } from '../../js/copy.min.js';

export { COPY };

/** The digits of a PIN as typed, or null when it is not exactly six of
 *  them. Spaces and dashes are forgiven, since people copy PINs from
 *  messages that group them ("482 913"). */
export function readPin(value) {
    const digits = String(value == null ? '' : value).replace(/[\s-]/g, '');
    return /^\d{6}$/.test(digits) ? digits : null;
}

function setStatus(status, text, problem) {
    status.textContent = text;
    status.classList.toggle('is-problem', Boolean(problem));
}

export function wire(doc) {
    const form = doc.getElementById('pin-form');
    const input = doc.getElementById('pin-input');
    const status = doc.getElementById('pin-status');
    if (!form || !input || !status) return false;

    form.hidden = false;
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const pin = readPin(input.value);
        if (!pin) {
            setStatus(status, COPY.incomplete, true);
            input.focus();
            return;
        }
        setStatus(status, COPY.preview, false);
    });
    return true;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => wire(document));
    } else {
        wire(document);
    }
}
