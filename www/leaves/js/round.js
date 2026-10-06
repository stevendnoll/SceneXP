// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * round.js - one round of leaf blowing, as a state machine.
 *
 *   ready     the yard is fresh and the clock is waiting for the first blow
 *   playing   the clock is running
 *   revenge   time is up, and the neighbor is having the last word: too
 *             much of the yard was left on his lawn (M2)
 *   settling  time is up: the blower is off and the leaves are landing
 *   done      the result is counted and the end card is up
 *   free      no clock at all, for anybody who only wants to blow leaves
 *
 * THE CLOCK STARTS ON THE FIRST BLOW, not when the welcome card closes, so a
 * visitor who reads the controls, walks over to the far corner and lines up
 * their first blast has not lost a second doing it.
 *
 * THE RESULT WAITS FOR THE LEAVES. Counting the instant the clock runs out
 * would count leaves in mid-air wherever they happened to be, so the round
 * settles first: at least `settleMin` seconds, until nothing is moving, and
 * never longer than `settleMax`.
 *
 * PURE. main.js steps it with the frame's time and tells it whether the
 * blower is held and how many leaves are moving. It answers with what just
 * happened, if anything.
 */

export function createRound(R) {
    return { phase: 'ready', elapsed: 0, settled: 0, seconds: R.seconds };
}

/** Back to a fresh, waiting round. */
export function resetRound(round) {
    round.phase = 'ready';
    round.elapsed = 0;
    round.settled = 0;
    return round;
}

/** No clock: blow leaves for as long as you like. */
export function freePlay(round) {
    round.phase = 'free';
    round.elapsed = 0;
    round.settled = 0;
    return round;
}

/** Whether the clock has run out (the result is being made or shown). */
export function isOver(round) {
    return round.phase === 'revenge' || round.phase === 'settling' || round.phase === 'done';
}

/** Whether the blower may run in this phase. */
export function canBlow(round) {
    return round.phase === 'ready' || round.phase === 'playing' || round.phase === 'free';
}

/** Seconds left on the clock. */
export function timeLeft(round) {
    return Math.max(0, round.seconds - round.elapsed);
}

/**
 * Advance the round by `dt` seconds. `input` is { blowing, moving, revenge,
 * revengeDone }: whether the blower is held this frame, how many leaves are
 * awake, whether the neighbor is owed his last word as the clock runs out,
 * and whether he has had it. Returns 'start', 'revenge', 'time-up', 'done'
 * or null ('time-up' marks the start of settling, after any revenge).
 */
export function stepRound(round, dt, input, R) {
    const step = dt > 0 ? dt : 0;
    if (round.phase === 'ready') {
        if (input.blowing) {
            round.phase = 'playing';
            return 'start';
        }
        return null;
    }
    if (round.phase === 'playing') {
        round.elapsed += step;
        if (round.elapsed >= round.seconds) {
            round.elapsed = round.seconds;
            round.settled = 0;
            if (input.revenge) {
                round.phase = 'revenge';
                return 'revenge';
            }
            round.phase = 'settling';
            return 'time-up';
        }
        return null;
    }
    if (round.phase === 'revenge') {
        // He takes as long as he takes, up to `revengeMax`.
        round.settled += step;
        if (input.revengeDone || round.settled >= R.revengeMax) {
            round.phase = 'settling';
            round.settled = 0;
            return 'time-up';
        }
        return null;
    }
    if (round.phase === 'settling') {
        round.settled += step;
        const still = input.moving === 0 && round.settled >= R.settleMin;
        if (still || round.settled >= R.settleMax) {
            round.phase = 'done';
            return 'done';
        }
    }
    return null;
}
