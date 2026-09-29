// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * marks.js - The pulsing markers that say the room answers a tap (QA,
 * 2026-09-29: Steve, after www/automan's halos: "a floating pulsing circle
 * over the computer on the desk ... could disappear after a few clicks").
 *
 * A FEW, NOT EVERYTHING. A ring over every piece of furniture turns a
 * composed room into a diagram. So there are two: the computer, which is
 * where the office's work is, and the binoculars, which nobody would find
 * otherwise. The rest of the room is discovered from those, the toolbar and
 * Places.
 *
 * THEY RETIRE, WHICH AUTOMAN'S DO NOT. Automan's halos are the only way to
 * the page's one card and stay for the whole visit. Here the toolbar and
 * Places reach everything, so the markers are an arrival device: each goes
 * once its own thing has been opened, and all of them once the visitor has
 * opened `retireAfter` different things in the office, by any route. What
 * has been opened is remembered in the office's own settings (`coached`, a
 * bit for each thing), so a returning visitor is not coached again.
 *
 * Pure: numbers in, numbers out. main.js places the buttons.
 */

/** The markers: what each opens (a main.js actOn key) and what it says to a
 *  screen reader, the words a sighted visitor gets from the picture. */
export const MARKS = [
    { key: 'computer', label: 'Open the computer' },
    { key: 'binoculars', label: 'Look through the binoculars' }
];

/** How many different things opened retire every marker, and how long
 *  before a marker's pulse slows (a ring strobing over a room somebody is
 *  happily looking at is a nuisance: www/automan's lesson). */
export const COACHING = { retireAfter: 3, calmSeconds: 30 };

/** A bit for each thing in the office that opens, for settings.coached. */
export const OPENED = {
    computer: 1, binoculars: 2, printer: 4, wastebasket: 8, lamp: 16, cabinet: 32, board: 64,
    whiteboard: 128, calendar: 256, rolodex: 512, notes: 1024, today: 2048, window: 4096
};

/** How many different things the bits say have been opened. */
export function openedCount(bits) {
    let n = 0;
    for (let b = bits >>> 0; b; b &= b - 1) n++;
    return n;
}

/** The bits with `key` opened too (unchanged for a key with no bit). */
export function noteOpened(bits, key) {
    return OPENED[key] ? (bits | OPENED[key]) >>> 0 : bits >>> 0;
}

/** The markers still coaching: none once `retireAfter` things have been
 *  opened, else each whose own thing has not been. */
export function marksShown(bits, coaching = COACHING) {
    if (openedCount(bits) >= coaching.retireAfter) return [];
    return MARKS.filter((m) => !(bits & OPENED[m.key])).map((m) => m.key);
}
