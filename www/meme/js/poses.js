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
 *   shake     the hand at chest height, raised, for a handshake: two
 *             figures facing each other put their right hands half a
 *             meter apart in depth (each hand is on its own right side),
 *             so The Handshake stands each figure 0.23 m to its own left,
 *             and the hands land ON ONE SPOT (re-solved 2026-10-28 for
 *             Steve's QA, "the strong hand grip is the crux", both
 *             figures scored together since their stances are not a
 *             mirror pair, ON THE BROAD, BUFF BUILD the template dresses
 *             them in, whose wider shoulders move the hands: the forearm
 *             rising to the clasp, the hands vertical with the thumbs up,
 *             the visitor's a palm's thickness nearer the camera with its
 *             back to it and the friend's behind it with its back away,
 *             at (-0.14, 1.28, 0.25) and (-0.14, 1.28, 0.19). The twist
 *             here is the visitor's; the friend's hand needs 0.91, which
 *             the template gives as the figure's own `twist`)
 *   point     the arm out to the figure's own side and forward at chest
 *             height, the forearm, and so the index (hands.js), pointing
 *             that way: solved for the left arm, the hand at
 *             (0.62, 1.27, 0.37), the forearm along (0.67, 0.17, 0.72)
 *   aim       the arm straight out in front at shoulder height, a little
 *             across the body, for a thing held: the hand at
 *             (-0.14, 1.39, 0.56), the forearm level along +z
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
    shake: Object.freeze({ z: -0.06, x: -0.84, fore: -1.28, twist: 1.22 }),
    point: Object.freeze({ z: 0.87, x: -1.09, fore: -0.51, twist: 1.48 }),
    aim: Object.freeze({ z: -0.13, x: -1.76, fore: 0.07, twist: 1.14 }),
    lookBack: null
});

/** The poses that swap the leading hand for the pointing one, and for
 *  the fist (hands.js). The twists above were solved so the thumb is up
 *  on each (2026-10-28): the point's index then shows in profile, and a
 *  thing held in the fist stands upright, its barrel past the knuckles. */
export const POINTING = Object.freeze(['point']);
export const FISTED = Object.freeze(['aim']);

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
    point: 0.35,
    aim: 0,
    lookBack: 0.95
});

/** The most a leg swings for a stride, radians, and the arms' swing with
 *  it (the opposite arm forward, as a walk does). */
export const STRIDE = Object.freeze({ most: 0.55, arm: 0.35 });

/** The most the head nods, radians, up (negative about x) or down. */
export const MAX_NOD = 0.6;

/**
 * The legs' swing for a stride of `stride` radians (positive: the figure's
 * right leg forward), as `{ right, left }` rotations about x for the rig's
 * leg groups (a leg hangs -y, so a negative x turn swings it forward),
 * capped at `STRIDE.most`. Zero for none.
 */
export function legsFor(stride) {
    const s = Math.max(-STRIDE.most, Math.min(STRIDE.most, Number(stride) || 0));
    return { right: -s, left: s };
}

/** The head's nod for `nod` radians about x (negative looks up), capped. */
export function nodFor(nod) {
    return Math.max(-MAX_NOD, Math.min(MAX_NOD, Number(nod) || 0));
}

export const POSES = Object.freeze(Object.keys(ARM_POSES));

/** The arm sides a figure may lead with. */
export const SIDES = Object.freeze(['right', 'left']);

/** The `setPose` pose for `id`: the leading arm on `side` ('right' or
 *  'left', the figure's own), the other at rest, the hand's `twist` about
 *  the forearm the pose's own unless given (radians; a template gives one
 *  where two figures share a pose but not a stance, The Handshake). Rest
 *  for `stand` or an unknown id. */
export function armsFor(id, side = 'right', twist = undefined) {
    const lead = ARM_POSES[id];
    const rest = { ...REST };
    if (!lead) return { right: { ...rest }, left: { ...rest } };
    const arm = Number.isFinite(twist) ? { ...lead, twist } : { ...lead };
    return side === 'left' ? { right: rest, left: arm } : { right: arm, left: rest };
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
