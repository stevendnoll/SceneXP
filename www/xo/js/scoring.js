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

/**
 * WHAT A FINISHED PLAY SOUNDS LIKE.
 *
 * The 2D game's `handleFinish` is one if/else: `points === 50 ? whistle :
 * grunt`, plus a whistle for the two turnovers. The port spelled the else out
 * as a list of result slugs and dropped the condition that mattered, so a fifty
 * carried across the line, which is a 'catch' with nobody left to tackle him,
 * matched the grunt. The best thing that can happen in this game sounded like a
 * man being hit, with the whistle going over the top of it (QA round
 * twenty-seven, item 1).
 *
 * `hadTackle` is whether a takedown is being animated. The grunt belongs to the
 * HIT, so when there is one it is played at the moment the two bodies meet
 * rather than here; this is the case with no takedown to hang it on, which is a
 * man who ran out of bounds or was sacked.
 *
 * ...AND `expired` IS THE PLAY CLOCK HAVING RUN OUT, WHICH IS A SACK WITH
 * NOBODY IN IT.
 *
 * `classifyPlay` calls a play where nobody threw it and nobody ran with it a
 * sack, which is the right verdict and the wrong sound: the commonest way to
 * reach it is the ten second clock reaching zero with the quarterback standing
 * untouched in the pocket. Nobody hit him. QA heard the game play the sound of
 * a man being driven into the turf over a play in which not one body met
 * another.
 *
 * A REAL SACK IS ALREADY COVERED BY `hadTackle`: a quarterback brought down
 * holding the ball sets `state.tackled`, gets a takedown, and grunts on the
 * frame of contact like any other tackle. So this only ever silences the
 * grunt for a play that nothing physical ended, and the whistle is left alone,
 * because a clock running out is exactly when a referee blows one.
 *
 * PURE, AND HERE RATHER THAN IN main.js, because it is a rule about a result
 * and this is the file that decides what results are.
 */
export function endSounds(result, hadTackle = false, expired = false) {
    const points = (result && result.points) || 0;
    const slug = (result && result.result) || '';
    const scored = points === 50;
    return {
        whistle: scored || slug === 'interception' || slug === 'sack',
        grunt: !hadTackle && !expired && !scored
            && (slug === 'sack' || slug === 'run' || slug === 'catch'),
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

/**
 * HOW THE GAME IS GOING, AS ONE SIGNED RUN OF PLAYS.
 *
 * The 2D game kept a count of successful or unsuccessful plays in a row and
 * leaned on the difficulty accordingly, which is the right instinct for a game
 * you mostly WATCH: somebody scoring fifty every play has stopped being
 * surprised, and somebody who cannot move the ball has stopped watching.
 *
 * ONE SIGNED NUMBER RATHER THAN TWO COUNTERS. Positive is a run of good plays
 * and negative a run of bad ones, so a success after a bad run does not have to
 * clear one counter and start another: it crosses zero on its own.
 *
 * A MIDDLING PLAY DECAYS IT RATHER THAN BREAKING IT. Five points is neither a
 * triumph nor a disaster, and a game that reset its whole reading on every
 * ordinary play would never build a run at all. It steps one toward zero, so a
 * streak fades if the visitor stops repeating themselves.
 */
export function nextStreak(streak, points, { good = 30, bad = 0 } = {}) {
    const was = Number.isFinite(streak) ? streak : 0;
    if (points >= good) return was >= 0 ? was + 1 : 1;
    if (points <= bad) return was <= 0 ? was - 1 : -1;
    if (was > 0) return was - 1;
    if (was < 0) return was + 1;
    return 0;
}

/** The whole game so far, for a visitor coming back to a saved one. */
export function streakOver(results, options) {
    let streak = 0;
    for (const result of results || []) {
        streak = nextStreak(streak, (result && result.points) || 0, options);
    }
    return streak;
}

/**
 * ...AND WHAT THAT IS WORTH AS A DIFFICULTY, from -1 to +1.
 *
 * Positive means the visitor is dominating and the game should lean back. It
 * saturates at `run` plays, because "three fifties in a row" and "seven fifties
 * in a row" want the same answer: the game is already as hard as this dial
 * makes it, and a longer run should not keep making it worse.
 */
export function difficultyFor(streak, { run = 3 } = {}) {
    if (!(run > 0) || !Number.isFinite(streak)) return 0;
    const t = streak / run;
    return t > 1 ? 1 : (t < -1 ? -1 : t);
}
