// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * phases.js - where the visitor is in a race day, and where each action
 * takes them (M1). PLANNING, Phases:
 *
 *   loading -> checkin -> race -> results -> race (Race again)
 *                ^                    |
 *                +--------------------+  (Choose another race)
 *
 * Escape and the help button step back: from the race to check-in (the
 * race is let go, and Go starts it fresh), from the results to check-in.
 * The workshop (M3) will sit before check-in.
 *
 * PURE: the table and one function.
 */

export const PHASES = Object.freeze(['loading', 'checkin', 'race', 'results']);

const MOVES = Object.freeze({
    loading: Object.freeze({ loaded: 'checkin' }),
    checkin: Object.freeze({ go: 'race' }),
    race: Object.freeze({ finish: 'results', skip: 'results', back: 'checkin' }),
    results: Object.freeze({ again: 'race', another: 'checkin', back: 'checkin' })
});

/** The phase an action leads to from `phase`, or `phase` itself when the
 *  action means nothing there. */
export function nextPhase(phase, action) {
    const moves = MOVES[phase];
    return (moves && moves[action]) || phase;
}
