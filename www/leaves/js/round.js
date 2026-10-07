// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * round.js - one round of leaf blowing, as a state machine.
 *
 *   ready     the yard is fresh and the clock is waiting for the first blow
 *   playing   the clock is running
 *   finale    time is up: the result is counted, and the person dives into
 *             the pile before the end card (M3)
 *   done      the end card is up
 *   free      no clock at all, for anybody who only wants to blow leaves
 *
 * THE CLOCK STARTS ON THE FIRST BLOW, not when the welcome card closes, so a
 * visitor who reads the controls, walks over to the far corner and lines up
 * their first blast has not lost a second doing it.
 *
 * TIME UP GOES STRAIGHT TO THE DIVE (Steve's M4 QA, 2026-10-06: "once the time
 * runs out, we can just start the dive celebration animation"). Until then
 * there was a wait for the leaves to land and, when too much of the yard sat
 * on the neighbor's lawn, his "last word" before it, and both were cut. The
 * result is counted the instant the clock runs out, any leaf still in the
 * air counted where it is.
 *
 * PURE. main.js steps it with the frame's time and tells it whether the
 * blower is held. It answers with what just happened, if anything.
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
    return round.phase === 'finale' || round.phase === 'done';
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
 * Advance the round by `dt` seconds. `input` is { blowing, finaleDone }:
 * whether the blower is held this frame, and whether the dive is over.
 * Returns 'start', 'finale' (the clock has run out and the dive begins),
 * 'done' or null. A round without a finale (R.finale false) goes from the
 * clock straight to 'done'.
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
            round.phase = R.finale ? 'finale' : 'done';
            return round.phase;
        }
        return null;
    }
    if (round.phase === 'finale') {
        round.settled += step;
        if (input.finaleDone || round.settled >= R.finaleMax) {
            round.phase = 'done';
            return 'done';
        }
    }
    return null;
}
