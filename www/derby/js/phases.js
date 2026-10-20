// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * phases.js - where the visitor is in a visit, and where each action takes
 * them (M1, the bench added in M3, the weigh-in in M5). PLANNING, Phases:
 *
 *   loading -> bench -> checkin -> weighin -> race -> results -> race (Race again)
 *                ^  ^      |          |                  |
 *                |  +------+ (back)   | (fails: back to the bench)
 *                +--------------------+------------------+  (Tune my car)
 *
 * Go at check-in weighs the visitor's cars in first. Race again and the
 * next division up race at once: the car was weighed in already.
 *
 * Every arrival lands at the bench, the visitor's car on it. Escape and the
 * back button step back: from the race to check-in (the race is let go, and
 * Go starts it fresh), from the results to check-in, from check-in to the
 * bench.
 *
 * PURE: the table and one function.
 */

export const PHASES = Object.freeze(['loading', 'bench', 'checkin', 'weighin', 'race', 'results']);

const MOVES = Object.freeze({
    loading: Object.freeze({ loaded: 'bench' }),
    bench: Object.freeze({ race: 'checkin' }),
    checkin: Object.freeze({ go: 'weighin', back: 'bench' }),
    weighin: Object.freeze({ pass: 'race', skip: 'race', fail: 'bench', back: 'checkin' }),
    race: Object.freeze({ finish: 'results', skip: 'results', back: 'checkin' }),
    results: Object.freeze({ again: 'race', another: 'checkin', back: 'checkin', tune: 'bench' })
});

/** The phase an action leads to from `phase`, or `phase` itself when the
 *  action means nothing there. */
export function nextPhase(phase, action) {
    const moves = MOVES[phase];
    return (moves && moves[action]) || phase;
}
