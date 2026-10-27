// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-chip.js - the corner chip on the home page (specs/avatar PRD
 * section 7): a round portrait, bottom left, that links to the avatar page.
 *
 * Every rule lives in shared/js/avatar-1.0.0's installChip: the saved
 * portrait from localStorage where there is one and the default picture
 * otherwise, the "Make your avatar" label on a visitor's first few visits
 * until they fold it away or save, and the swap when another tab saves or
 * forgets. This module only finds the chip's parts in the markup by id and
 * hands them over, so the home page loads no three.js and nothing else of
 * the avatar's.
 *
 * The markup is complete without it: the default picture links to /avatar/
 * and names itself, and the label and its button ship hidden (a hint, not
 * content, so nothing a visitor needs waits on a script).
 *
 * A module, so the suite can import the pieces (tests/avatar-chip.test.mjs).
 * It boots itself only where there is a document.
 */

import { createAvatarStore, installChip } from '../shared/js/avatar-1.0.0.min.js';

/** The ids the page gives the chip's parts. */
export const CHIP_IDS = Object.freeze({
    root: 'avatar-chip',
    link: 'avatar-chip-link',
    img: 'avatar-chip-img',
    label: 'avatar-chip-label',
    hide: 'avatar-chip-hide'
});

/** Where the default portrait is served from. The avatar page's lab saves
 *  it (www/avatar/js/config.js, `defaultPortrait`), and the suite holds the
 *  two paths together. */
export const DEFAULT_PORTRAIT = '/assets/avatar/default.png';

/**
 * Install the chip from the page's markup. Returns installChip's handle
 * (`{ saved, labelShown, refresh, dispose }`), or null where the page has
 * no chip. `store` is a seam for the suite.
 */
export function bootChip(doc = document, { store = createAvatarStore(), ids = CHIP_IDS } = {}) {
    if (!doc || !doc.getElementById(ids.root)) return null;
    return installChip({
        img: doc.getElementById(ids.img),
        label: doc.getElementById(ids.label),
        hide: doc.getElementById(ids.hide),
        link: doc.getElementById(ids.link)
    }, { store, defaultSrc: DEFAULT_PORTRAIT });
}

function boot() {
    bootChip(document);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}
