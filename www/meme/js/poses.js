// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * poses.js - what a figure does with its arms and its head in a panel
 * (specs/meme PLANNING 5.2). The arms are the shared figure's own pose
 * (`setPose`: each arm's swing out `z`, swing forward `x` (negative is
 * forward), elbow bend `fore` (negative bends forward) and the hand's
 * `twist`), and the head is the head group turned about its own middle.
 *
 * EVERY POSE WAS SOLVED ON THE REAL RIG, NOT TYPED IN BY EYE (the avatar
 * work's lesson): the hand's landing place was measured for each
 * (2026-10-27, the figure facing +z, its right arm):
 *
 *   dismiss   the hand at chest height, 0.45 m forward, palm out
 *             (-0.37, 1.37, 0.45)
 *   approve   the hand at head height, forward (-0.37, 1.58, 0.46)
 *   present   the hand out to the side toward a chart (-0.70, 1.24, 0.22)
 *   shake     the hand forward at the waist, the elbow bent, for a
 *             handshake: two figures facing each other put their right
 *             hands half a meter apart in depth (each hand is on its own
 *             right side), so The Handshake stands each figure 0.23 m to
 *             its own left, and the hands land about a hand's width apart
 *             (measured 2026-10-27: 0.07 m across, the same height)
 *
 * tests/meme-poses.test.mjs holds the hands to those regions, so a rig edit
 * that moves them is caught.
 *
 * The rig has no neck, so a head turn is the head group turned, capped at
 * `MAX_HEAD_TURN` where the face would leave the shoulders.
 *
 * THE MEME DECIDES THE SIDE, NOT THE AVATAR (QA 2026-10-28): a left-handed
 * avatar used to lead with its left arm and look the other way, which
 * mirrored Nope / Yep and pointed The Plan's figure away from its chart.
 * Handedness is never read here. A template names the arm (`side`) and the
 * way the head turns (`look`), in the FIGURE'S OWN sides: a figure facing
 * the camera has its right on the camera's left.
 */

import { REST } from '../../shared/js/avatar-figure-1.0.0.min.js';

/** The most the head turns from the body, radians. */
export const MAX_HEAD_TURN = 1.1;

/** The leading arm's angles for each pose; the other arm rests. `stand` is
 *  the rig's rest. */
export const ARM_POSES = Object.freeze({
    stand: null,
    dismiss: Object.freeze({ z: 0.4, x: -1.1, fore: -1.1, twist: Math.PI }),
    approve: Object.freeze({ z: 0.3, x: -1.9, fore: -0.4, twist: 0 }),
    present: Object.freeze({ z: 1.25, x: -0.5, fore: -0.6, twist: 0 }),
    shake: Object.freeze({ z: 0.1, x: -1.0, fore: -0.7, twist: 0 }),
    lookBack: null
});

/** Where The Handshake stands its two figures: `gap` apart across, each
 *  `aside` toward its own left (so the right hands meet), turned `turn`
 *  radians from facing each other toward the camera. */
export const HANDSHAKE = Object.freeze({ gap: 0.8, aside: 0.23, turn: 0.5 });

/** How far the head turns for each pose, radians (a figure that turns its
 *  back looks back over its shoulder). Which way is the figure's `look`. */
export const HEAD_TURNS = Object.freeze({
    stand: 0,
    dismiss: 0.45,
    approve: 0,
    present: 0.25,
    shake: 0,
    lookBack: 0.95
});

export const POSES = Object.freeze(Object.keys(ARM_POSES));

/** The arm sides a figure may lead with. */
export const SIDES = Object.freeze(['right', 'left']);

/** The `setPose` pose for `id`: the leading arm on `side` ('right' or
 *  'left', the figure's own), the other at rest. Rest for `stand` or an
 *  unknown id. */
export function armsFor(id, side = 'right') {
    const lead = ARM_POSES[id];
    const rest = { ...REST };
    if (!lead) return { right: { ...rest }, left: { ...rest } };
    return side === 'left' ? { right: rest, left: { ...lead } } : { right: { ...lead }, left: rest };
}

/**
 * The head's turn for pose `id`, radians about +y, capped. `look` is the
 * figure's own side to turn toward, 'right' (-x on the rig, a negative
 * turn) or 'left' (positive), by the pose's measure in `HEAD_TURNS`; or a
 * number of radians of its own, positive toward the figure's left.
 */
export function headTurnFor(id, look = 'right') {
    const cap = (t) => Math.max(-MAX_HEAD_TURN, Math.min(MAX_HEAD_TURN, t));
    if (typeof look === 'number') return Number.isFinite(look) ? cap(look) : 0;
    const turn = cap(Math.max(0, HEAD_TURNS[id] || 0));
    if (turn === 0) return 0;
    return look === 'left' ? turn : -turn;
}
