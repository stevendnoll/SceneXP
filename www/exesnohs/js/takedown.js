// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * takedown.js - The tackle, as an animation rather than as a coincidence.
 *
 * WHY THIS EXISTS, IN ONE MEASUREMENT. The knockdown used to be inferred from
 * how close the nearest defender was: he committed fully inside 1.25m and the
 * carrier went over at 0.72 of that. Measured over 84 tackles the nearest
 * defender AT THE WHISTLE was a median of 1.85m away, the commitment came out
 * at a median of 0.31, and it crossed the trigger on none of them. Not on most
 * of them. On none. The lean was nine degrees, the carrier had never once been
 * knocked over, and the play simply stopped with two men standing two metres
 * apart, which is exactly what QA reported twice.
 *
 * THE GAP IS NOT A BUG TO CLOSE, IT IS WHAT THE PORTED MODEL DOES. It blows the
 * whistle when two COLLISION BOXES overlap, and those boxes are drawn around a
 * figure 2.2 times life size, so a tackle in this simulation genuinely happens
 * two metres apart. Shrinking the boxes to make bodies touch would change how
 * every play ends. So the last two metres are covered by the ANIMATION: the
 * whistle is the cue, and the defender crosses the gap himself.
 *
 * PURE, so the whole thing can be checked without a renderer: given a clock and
 * two positions it returns where each figure should be drawn and how far over
 * he should be leaning. view.js does nothing but apply it.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';

/** Ease in, ease out. A dive that starts at full speed is a teleport. */
const smooth = (t) => t * t * (3 - 2 * t);
/** Fast out of the blocks and slowing into the hit, which is a lunge. */
const launch = (t) => 1 - (1 - t) * (1 - t);

/** How long the whole thing lasts, which is what main.js has to wait for
 *  before it puts a card over the top of it. */
export function takedownLength() {
    const T = CFG.pose.takedown;
    return T.dive + T.fall + T.settle;
}

/**
 * Where the two of them are at time `t`, in seconds since the whistle.
 *
 * `from` is where the tackler was standing and `to` where the carrier was, both
 * in world metres. Everything comes back as an OFFSET from those, so a caller
 * that has the recording rather than the simulation gets the same answer: the
 * two positions are the only input, and after the whistle neither of them
 * moves on its own.
 *
 *   tackler.x/y/z   metres to add to where he was standing
 *   tackler.lean    radians of forward pitch, positive is face first
 *   carrier.x/z     metres, driven backwards along the line of the hit
 *   carrier.lean    radians, negative is onto his back
 *   contact         0 before the hit, 1 after it, for anything that has to
 *                   know whether the two have met yet
 */
export function takedownAt(t, from, to) {
    const T = CFG.pose.takedown;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const gap = Math.hypot(dx, dz) || 1e-6;
    // The unit vector from the tackler to the carrier, which is the line
    // everything else happens along: he dives down it and the carrier is driven
    // back along it.
    const ux = dx / gap;
    const uz = dz / gap;

    // HE COVERS THE GAP LESS `close`, because a tackler who ends up standing
    // exactly where the carrier is has walked through him rather than hit him.
    const travel = Math.max(0, gap - T.close);

    const dive = Math.min(1, Math.max(0, t / T.dive));
    const after = Math.min(1, Math.max(0, (t - T.dive) / T.fall));

    // AND HE LEAVES HIS FEET. A dive is airborne: up on the way in and down on
    // the way through, which is a single arc rather than a jump and a landing.
    const air = Math.sin(Math.PI * dive) * T.leap;
    const settled = Math.max(0, 1 - after * 1.6);

    return {
        tackler: {
            x: ux * travel * launch(dive),
            y: air * settled,
            z: uz * travel * launch(dive),
            lean: T.tacklerLean * smooth(dive),
        },
        carrier: {
            // Driven backwards along the same line, and only once he has been
            // hit: before that he is standing exactly where the play left him.
            x: ux * T.driven * smooth(after),
            z: uz * T.driven * smooth(after),
            lean: T.carrierLean * smooth(after),
        },
        contact: dive >= 1 ? 1 : 0,
    };
}

/**
 * Who is making this tackle.
 *
 * The nearest opponent, and nothing cleverer: at the whistle he is the man the
 * collision boxes fired on, and picking anybody else would put the dive in from
 * the wrong direction. Returns a position name, or '' when there is nobody, in
 * which case there is no tackle to draw.
 *
 * IT TAKES A LIST OF PLAIN OBJECTS rather than a play, so the replay can ask it
 * the same question about a recorded frame and get the same answer.
 */
export function tacklerFor(objects, carrier) {
    if (!carrier) return '';
    let best = '';
    let nearest = Infinity;
    for (const obj of objects) {
        if (obj === carrier) continue;
        if (obj.settings.benched) continue;
        if (obj.settings.position === 'ball') continue;
        if (obj.settings.team === carrier.settings.team) continue;
        const d = Math.hypot(obj.coords.x - carrier.coords.x,
            obj.coords.y - carrier.coords.y);
        if (d < nearest) { nearest = d; best = obj.settings.position; }
    }
    return best;
}
