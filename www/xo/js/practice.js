// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * practice.js - PRACTICE MODE'S ADDRESS, AND WHO THE VISITOR CAN BE IN IT
 * (Steve, 2026-11-02).
 *
 * Practice Mode is the same ten plays with nobody on the other side of the
 * ball. It is a mode of the page rather than a saved setting, so it lives in
 * the address: `?practice=true` can be copied and pasted to a friend, a reload
 * stays in it, and nothing on this device has to remember it. The canonical
 * link stays /xo/, so search engines see one page.
 *
 * PURE. It takes strings and hands back strings. main.js does the navigating.
 */
import { slotOf, DEFAULT_SLOT } from './playas.min.js';

const PARAM = 'practice';
const ON = 'true';

/** Whether this address asks for Practice Mode. Only `?practice=true` does:
 *  `?practice=false` and a bad address are the real game. */
export function isPracticeUrl(href = '') {
    try {
        return new URL(href).searchParams.get(PARAM) === ON;
    } catch {
        return false;
    }
}

/** The same address in Practice Mode, anything else in it kept (`?qa`). A bad
 *  address comes back as it came. */
export function practiceUrl(href = '') {
    try {
        const url = new URL(href);
        url.searchParams.set(PARAM, ON);
        return url.href;
    } catch {
        return href;
    }
}

/** The same address in the real game. */
export function realGameUrl(href = '') {
    try {
        const url = new URL(href);
        url.searchParams.delete(PARAM);
        return url.href;
    } catch {
        return href;
    }
}

/**
 * WHO THE VISITOR IS IN PRACTICE. A saved choice of a defender would have them
 * wait on the sideline for ten plays, so they take the snap instead. The saved
 * choice itself is left alone: their defender is still there in the real game.
 */
export function practiceSlot(id) {
    const slot = slotOf(id);
    return slot.team === 0 ? slot.id : DEFAULT_SLOT;
}
