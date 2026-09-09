// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scoring.js - What a play was worth, and what to call it.
 *
 * PURE. No THREE, no DOM, no clock. Values in, values out, which is what makes
 * the most consequential arithmetic in the game (did that count, and for how
 * much) assertable with plain numbers (PLANNING D1).
 *
 * THE LADDER AND THE VERDICTS ARE THE 2D GAME'S, read off checkGamePoints and
 * handleFinish in exes-and-ohs.class.tsx. Nothing here is invented, including
 * the -5 for a sack, which the PRD did not mention.
 */

/** The origin the ladder measures from. It is not the goal line: the 2D game
 *  uses -4 and every threshold is relative to it. */
const LADDER_ORIGIN = -4;

/** Distance thresholds, in whole lineIntervals from LADDER_ORIGIN, richest
 *  first so the first match wins. */
const LADDER = [
    { intervals: 4, points: 50 },
    { intervals: 3, points: 30 },
    { intervals: 2, points: 15 },
    { intervals: 1, points: 5 },
];

export const SACK = -5;
export const INTERCEPTION = -10;

/**
 * What a carrier at `x` is worth.
 *
 * `x` and `lineInterval` are both in simulation field units, because this is
 * simulation arithmetic and converting to metres first would only introduce a
 * rounding difference between the score and the thing that produced it.
 */
export function pointsForPosition(x, lineInterval) {
    for (const step of LADDER) {
        if (x >= LADDER_ORIGIN + lineInterval * step.intervals) return step.points;
    }
    return 0;
}

/**
 * The ladder as a list of BANDS, nearest the offense first.
 *
 * `{ from, to, points }` in the same field units `lineInterval` came in, where
 * `to` is Infinity for the last one. The first band is the one worth nothing,
 * which is not a rung of the ladder but is a stretch of the field, and the
 * field is what this is for.
 *
 * IT EXISTS SO THE PAINT CANNOT LIE. field.js writes these numbers onto the
 * turf and main.js lights the band the carrier is standing in, and if either of
 * them carried its own copy of the thresholds it would be one edit away from
 * telling a visitor they had reached a rung the scoring did not award. Both ask
 * here, and `pointsForPosition` above is still the only thing that decides.
 */
export function ladderBands(lineInterval) {
    const rungs = [...LADDER].reverse().map((step) => ({
        from: LADDER_ORIGIN + lineInterval * step.intervals,
        points: step.points,
    }));
    // Each band runs to where the next one starts, and the richest runs on.
    const bands = rungs.map((rung, i) => ({
        from: rung.from,
        to: i + 1 < rungs.length ? rungs[i + 1].from : Infinity,
        points: rung.points,
    }));
    return [{ from: -Infinity, to: bands[0].from, points: 0 }, ...bands];
}

/**
 * The band a carrier at `x` is standing in.
 *
 * Never null: somebody behind their own goal line is in the band worth nothing,
 * which is a true and useful answer.
 */
export function bandAt(x, lineInterval) {
    const bands = ladderBands(lineInterval);
    return bands.find((b) => x >= b.from && x < b.to) || bands[0];
}

/**
 * Classify a finished play.
 *
 * Reads the same five facts the 2D game reads: whether the quarterback ran,
 * whether a throw was made, whether the ball was caught, by which team, and by
 * whom. Everything else follows.
 *
 * Returns `{ result, points, headline, detail }` where `result` is the 2D
 * game's own slug so nothing downstream has to invent a vocabulary.
 */
export function classifyPlay({ ranWithBall, threwTo, ball, carrierX, lineInterval, reached50 }) {
    if (!ranWithBall && !threwTo) {
        return {
            result: 'sack',
            points: SACK,
            headline: 'Sacked',
            detail: 'Nobody got the ball away in time.',
        };
    }

    if (!ranWithBall) {
        if (!ball || !ball.caught) {
            return {
                result: 'incomplete',
                points: 0,
                headline: 'Incomplete',
                detail: 'The pass fell to the turf.',
            };
        }
        if (ball.team !== 0) {
            return {
                result: 'interception',
                points: INTERCEPTION,
                headline: 'Intercepted',
                detail: 'The Crows read it and took the ball away.',
            };
        }
        const points = pointsForPosition(carrierX, lineInterval);
        return {
            result: 'catch',
            points,
            headline: points === 50 ? 'All the way' : 'Caught',
            detail: points === 50
                ? 'Caught and carried the whole way across.'
                : `Caught and brought down for ${points}.`,
        };
    }

    const points = pointsForPosition(carrierX, lineInterval);
    return {
        result: reached50 ? 'run-50' : 'run',
        points,
        headline: points === 50 ? 'All the way' : 'Kept it',
        detail: points === 50
            ? 'Tucked it and ran the whole way across.'
            : `Tucked it and ran for ${points}.`,
    };
}

/** A whole game, once the last play is in. */
export function summarise(plays) {
    const total = plays.reduce((sum, p) => sum + p.points, 0);
    const best = plays.reduce((b, p) => (p.points > b.points ? p : b), plays[0] || { points: 0 });
    return {
        total,
        plays: plays.length,
        best: best ? best.points : 0,
        scored: plays.filter((p) => p.points > 0).length,
        gaveAway: plays.filter((p) => p.points < 0).length,
    };
}

/** Something to say about a finished game, sized to what actually happened
 *  rather than to a scale nobody has calibrated. */
export function verdictFor(total) {
    if (total >= 300) return 'A clinic.';
    if (total >= 200) return 'A very good afternoon.';
    if (total >= 120) return 'Solid work.';
    if (total >= 60) return 'Moved the ball.';
    if (total > 0) return 'Hard yards.';
    return 'One of those games.';
}
