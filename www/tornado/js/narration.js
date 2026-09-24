// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * narration.js - Tornado Alley's story, told to a screen reader.
 *
 * The narrator itself is the shared part (shared/js/narration-1.0.0.js),
 * which speaks one sentence as the story plays into each beat and keeps
 * quiet behind the welcome card, under a drag and across a seek. What is
 * this scene's is the words (config.narration) and one beat that depends on
 * the run: the landing, told for whatever this run's tornado carried, with
 * the rainbow that comes out as it does.
 */
import { TORNADO_CONFIG } from './config.min.js';
import * as N from '../../shared/js/narration-1.0.0.min.js';

/** How far the story has got through the beats at second t: the index of the
 *  last one reached, or -1 before the first. */
export function beatIndexAt(t, config = TORNADO_CONFIG) {
    return N.beatIndexAt(t, config.narration.beats);
}

/** What beat i says, on a run that carried `payload`. */
export function beatText(i, payload = 'cow', config = TORNADO_CONFIG) {
    const beat = config.narration.beats[i];
    if (!beat) return '';
    if (!beat.landed) return beat.text;
    const carried = config.payloads[payload] || config.cow;
    return `${carried.landed} ${config.narration.rainbow}`;
}

/** A narrator for the page's live region. `update(arc, info, payload)`. */
export function createNarrator(region, config = TORNADO_CONFIG) {
    return N.createNarrator(region, {
        beats: config.narration.beats,
        say: (_beat, i, payload = 'cow') => beatText(i, payload, config)
    });
}
