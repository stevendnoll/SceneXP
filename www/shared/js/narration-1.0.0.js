// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * narration.js - A timed story, told to a screen reader (shared engine part).
 *
 * A PASSIVE SCENE IS A PICTURE WITH NO WORDS IN IT. A visitor who cannot see
 * it hears the welcome card, then the whole story in silence, then an ending
 * line about things nobody told them happened. This puts one short sentence
 * into a polite live region as the story reaches each beat. Written for
 * Tornado Alley and High Water in the accessibility pass of 2026-09-23.
 *
 * IT SPEAKS ONLY WHEN THE STORY PLAYS INTO A BEAT. Behind the welcome card,
 * under a scrubber drag, and across a seek or a rewind it keeps its place
 * silently, so sweeping the scrubber is not a burst of sentences and a jump
 * lands quiet. From there it speaks again at the next beat the story plays
 * into. A frame that moves the story more than `jumpSeconds` counts as a jump.
 *
 * The scene owns the words: each beat is `{ at, text }`, or anything else
 * with an `at` plus a `say(beat, index, context)` that turns it into a
 * sentence (Tornado Alley names whatever its tornado carried).
 *
 * The region is a `<p class="sr-only" role="status" aria-live="polite">` on
 * the page, outside every card, so nothing hides it.
 */

/** The index of the last beat reached by second t, or -1 before the first.
 *  Beats are in order of `at`. */
export function beatIndexAt(t, beats) {
    let index = -1;
    for (let i = 0; i < beats.length; i++) if (t >= beats[i].at) index = i;
    return index;
}

/** A beat's own text: the default `say`. */
export function textOf(beat) {
    return beat.text || '';
}

/**
 * A narrator for one live region (or null, which still reports what it would
 * say). Call `update(storySeconds, { begun, scrubbing }, context)` every
 * frame. It returns the sentence it said, or null.
 */
export function createNarrator(region, { beats, say = textOf, jumpSeconds = 0.5 } = {}) {
    let spoken = -1;
    let lastArc = 0;
    return {
        update(arc, info = {}, context) {
            const index = beatIndexAt(arc, beats);
            const played = Boolean(info.begun) && !info.scrubbing && Math.abs(arc - lastArc) <= jumpSeconds;
            lastArc = arc;
            if (!played || index <= spoken) {
                spoken = index;
                return null;
            }
            spoken = index;
            const text = say(beats[index], index, context);
            if (region) {
                // Emptied first, so the same sentence twice (a beat heard, a
                // seek back, the beat again) is still a change to announce.
                region.textContent = '';
                region.textContent = text;
            }
            return text;
        },
        state: () => ({ spoken, lastArc })
    };
}
