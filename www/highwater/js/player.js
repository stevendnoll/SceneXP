// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * player.js - High Water's settings for the shared player
 * (shared/js/player-1.0.0.js).
 *
 * THE PLAYER WAS BORN HERE. The pause button, Escape, the pause card, the
 * scrubber and the fading controls were written for this scene on 2026-09-23
 * (the reversal of its "nothing to press after Begin" thesis, after Steve's
 * real-world QA), then lifted into the shared part the same day for Tornado
 * Alley. This scene carried its own copy until 2026-09-24, when it moved onto
 * the shared one. What is left here is the translation from OCEAN_CONFIG's
 * shape into the player's, so the numbers keep living where the rest of the
 * story's numbers do.
 *
 * TWO THINGS DO NOT TRANSLATE ONE FOR ONE, and each is why this is a function
 * rather than a table:
 *
 *   - The stages are start times named `from` here and `at` in the player.
 *   - THE FADE IS A SMOOTHSTEP, which is what Steve QA'd. The player's own
 *     default is a straight line, so the curve is handed over from storm.js
 *     rather than rebuilt from `fadeSeconds`. Both start and finish on the same
 *     second, so only the shape in between would have changed.
 *
 * PURE, like the rest of the rules, so it can be tested without a canvas.
 */

import { OCEAN_CONFIG } from './config.min.js';
import { fadeAt } from './storm.min.js';

/** The options for `createPlayer`, less the hooks main.js supplies. */
export function playerOptions(config = OCEAN_CONFIG) {
    const { storm, controls } = config;
    return {
        seconds: storm.seconds,
        fadeSeconds: storm.fadeSeconds,
        fadeCurve: (arc) => fadeAt(arc, storm),
        stages: storm.stages.map((stage) => ({ at: stage.from, name: stage.name })),
        idleSeconds: controls.idleSeconds,
        stepSeconds: controls.stepSeconds,
        pageSeconds: controls.pageSeconds,
        endGuardSeconds: controls.endGuardSeconds,
        // The photosensitivity hold. Named for the one thing that flashes here.
        flashHoldSeconds: controls.lightningHoldSeconds,
        seekReportSeconds: controls.seekReportSeconds
    };
}
