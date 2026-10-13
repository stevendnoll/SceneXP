// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * intro.js - The arrival (PLANNING 4.1): which home is on the plinth, and
 * the slim panel along the bottom that says what the studio is.
 *
 * NO WELCOME CARD. The studio is in view from the first frame, with a home
 * already on the plinth: the example on a first visit, the visitor's own
 * latest checklist on a return (`arrivalId`). Over it, Auto Man's intro
 * panel, adapted: the tagline, one sentence on what the studio does, the
 * honesty line, and two buttons, Start your own and Explore the example.
 *
 * IT NEVER BLOCKS THE STUDIO. It collapses to a small handle on its close
 * button, on either of its buttons, and on the first tap in the studio, and
 * the handle brings it back for the whole visit. While it is open the
 * toolbar steps aside (its two buttons are the toolbar's first two), so the
 * bottom of a phone is never covered twice.
 *
 * `arrivalId` is pure. `createIntro` drives the panel's markup in
 * index.html and calls back into main.js for what its buttons do.
 */

import { STUDIO } from './copy.min.js';

/**
 * The checklist on the plinth when the visitor arrives: the one open when
 * they left, else their own most recently changed, else the example, else
 * none. Only live checklists count.
 */
export function arrivalId(doc) {
    const live = (doc.checklists || []).filter((c) => !c.deletedAt);
    const current = live.find((c) => c.id === doc.settings.activeId);
    if (current) return current.id;
    const own = live.filter((c) => !c.sample)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (own.length) return own[0].id;
    const example = live.find((c) => c.sample);
    return example ? example.id : null;
}

/** The panel's hint for the visitor's device: tap and pinch on a touch
 *  screen, click and scroll with a mouse. */
export function introHint(mobile) {
    return mobile ? STUDIO.hintTouch : STUDIO.hintPointer;
}

/**
 * Drive the panel. `on` holds start(), explore() and change(open), the
 * last told whenever the panel opens or collapses. Returns
 * { arrive, collapse, expand, showExplore, open, arrived }.
 */
export function createIntro({ mobile = false, on = {}, signal } = {}) {
    const byId = (id) => document.getElementById(id);
    const panel = byId('ws-intro');
    const handle = byId('intro-handle');
    const hint = byId('intro-hint');
    if (hint) hint.textContent = introHint(mobile);
    let arrived = false;
    let open = false;
    const listen = (id, fn) => {
        const node = byId(id);
        if (node) node.addEventListener('click', fn, { signal });
    };

    function show(isOpen) {
        open = isOpen;
        if (panel) panel.classList.toggle('is-out', !isOpen);
        if (handle) {
            handle.classList.toggle('is-out', isOpen);
            handle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
        if (typeof on.change === 'function') on.change(isOpen);
    }

    const api = {
        /** The loading screen has gone: the panel comes up. */
        arrive() {
            if (arrived) return;
            arrived = true;
            show(true);
        },
        /** Down to the handle. Safe to call when already collapsed, or
         *  before the panel has arrived (then it does nothing). */
        collapse() {
            if (!arrived || !open) return false;
            show(false);
            return true;
        },
        /** Back from the handle, focus on the panel so its close button
         *  and its two buttons are the next Tab stops. */
        expand() {
            if (!arrived || open) return false;
            show(true);
            if (panel && typeof panel.focus === 'function') panel.focus();
            return true;
        },
        /** Explore the example is offered only while there is one. */
        showExplore(shown) {
            const b = byId('intro-explore');
            if (b) b.hidden = !shown;
        },
        get open() {
            return open;
        },
        get arrived() {
            return arrived;
        }
    };

    listen('intro-close', () => api.collapse());
    listen('intro-handle', () => api.expand());
    listen('intro-start', () => {
        api.collapse();
        if (typeof on.start === 'function') on.start();
    });
    listen('intro-explore', () => {
        api.collapse();
        if (typeof on.explore === 'function') on.explore();
    });
    return api;
}
