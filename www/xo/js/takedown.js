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
import { XO_CONFIG as CFG } from './config.min.js';

/** Ease in, ease out. A dive that starts at full speed is a teleport. */
const smooth = (t) => t * t * (3 - 2 * t);
/** Fast out of the blocks and slowing into the hit, which is a lunge. */
const launch = (t) => 1 - (1 - t) * (1 - t);

/** Where in the fall the ground is: the rest is the settle. */
const LAND = 0.82;

/**
 * GRAVITY, NOT A SMOOTHSTEP (Steve's QA, 2026-10-30: "more fluid and
 * violent"). A smoothstep eased a man over gently and stopped him dead,
 * which is a lean. This accelerates him into the ground, lands him a little
 * past flat and settles him back. `u` is 0 to 1 across the fall, `bounce` how
 * far past flat he lands as a fraction of his lean. 1 past the end, so the
 * pose holds however long it is asked for.
 */
export function landing(u, bounce = 0) {
    if (!(u > 0)) return 0;
    if (u >= 1) return 1;
    if (u < LAND) {
        const v = u / LAND;
        return v * v;
    }
    return 1 + bounce * Math.sin((Math.PI * (u - LAND)) / (1 - LAND));
}

/**
 * WHEN THE TWO OF THEM MEET, as a fraction of the dive. QA ITEM 5.
 *
 * The carrier used to be knocked over on a clock that started at the END of
 * the dive, so the order a visitor saw was: the defender leaves his feet, the
 * defender lands, and THEN the man he was tackling begins to fall. Reported
 * exactly that way.
 *
 * The gap is not crossed at a constant rate, so the moment of contact is not a
 * constant fraction either: `launch` covers most of the distance early. This
 * solves the crossing outright. The tackler's remaining distance at dive
 * fraction u is
 *
 *     gap - travel · launch(u),   launch(u) = 1 - (1 - u)²
 *
 * and setting that equal to `contact` gives launch(u) directly, which inverts
 * to u = 1 - sqrt(1 - launch). Clamped into `contactAt`, because a hit on the
 * first frame is the whistle knocking a man down by itself and a hit at the
 * very end is the fault this replaces.
 *
 * Exported because it is the interesting number and a test should be able to
 * ask for it without reconstructing the algebra.
 */
export function contactFraction(gap) {
    const T = CFG.pose.takedown;
    const travel = Math.max(0, gap - T.close);
    const need = travel > 0 ? (gap - T.contact) / travel : 0;
    // Out of reach in either direction: nothing to solve, take the window.
    if (!(need > 0)) return T.contactAt.min;
    if (need >= 1) return T.contactAt.max;
    const u = 1 - Math.sqrt(1 - need);
    return Math.min(T.contactAt.max, Math.max(T.contactAt.min, u));
}

/**
 * How long the whole thing lasts, which is what main.js has to wait for
 * before it puts a card over the top of it.
 *
 * IT DEPENDS ON THE GAP NOW, because the carrier's fall starts at contact
 * rather than after the dive, and contact moves with how far the tackler had
 * to come. The tackler is still travelling until `dive` whatever happens, so
 * the answer is whichever of the two finishes last. Called with no gap it
 * assumes the worst case, which is what a caller wanting a safe hold wants.
 */
export function takedownLength(gap = Infinity) {
    const T = CFG.pose.takedown;
    const hit = Number.isFinite(gap)
        ? contactFraction(gap) : T.contactAt.max;
    return Math.max(T.dive, hit * T.dive + T.fall) + T.settle;
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
 *   carrier.x/z     metres: on into the hit at his own speed, then driven
 *                   along the line of it and carried on by his own momentum
 *   carrier.lean    radians, negative is onto his back
 *   carrier.roll    radians onto a shoulder, positive toward his right
 *   contact         0 before the hit, 1 after it, for anything that has to
 *                   know whether the two have met yet
 *
 * `motion` is the carrier's own at the whistle, optional: `{ velocity: { x, z }
 * }` in world metres a second and `facing` in radians (the figure's yaw).
 * Without it he was standing, which is a sack, and every caller that says
 * nothing gets that. WITH IT THE HIT IS FLUID AND VIOLENT (Steve's QA,
 * 2026-10-30): he runs into the hit rather than standing still for the tenths
 * of a second the dive takes to reach him, the tackler dives at where he will
 * be, his momentum carries him on through the hit so a man hit from the side
 * goes sideways AND forward, the drive skids out into the settle instead of
 * stopping dead, both men fall under gravity and land a little past flat, and
 * he rolls onto the shoulder the hit sent him to.
 */
export function takedownAt(t, from, to, motion = null) {
    const T = CFG.pose.takedown;
    const M = T.momentum;
    const vx = motion && motion.velocity ? (Number(motion.velocity.x) || 0) : 0;
    const vz = motion && motion.velocity ? (Number(motion.velocity.z) || 0) : 0;
    const speed = Math.hypot(vx, vz);
    const moving = speed > M.still;
    const hx = moving ? vx / speed : 0;
    const hz = moving ? vz / speed : 0;

    // WHEN THEY MEET, solved on the gap at the whistle (`contactFraction`).
    // THE FALL IS CLOCKED FROM THE HIT, NOT FROM THE END OF THE DIVE. That one
    // line is QA item 5: the carrier starts going over on the frame the two
    // of them meet, while the tackler is still in the air and still driving
    // through him.
    const gap0 = Math.hypot(to.x - from.x, to.z - from.z) || 1e-6;
    const hit = contactFraction(gap0) * T.dive;

    // HE RUNS INTO THE HIT. The recording stops at the whistle with him at
    // full stride, and a man standing still for the dive's first tenths of a
    // second read as a stutter. He keeps his speed until contact...
    const run = moving ? Math.min(Math.max(0, t), hit) : 0;
    const runX = vx * run;
    const runZ = vz * run;
    // ...so the tackler dives at where he will be when they meet. The unit
    // vector from the tackler to that point is the line everything else
    // happens along: he dives down it and the carrier is driven along it.
    const dx = to.x + vx * (moving ? hit : 0) - from.x;
    const dz = to.z + vz * (moving ? hit : 0) - from.z;
    const gap = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / gap;
    const uz = dz / gap;

    // HE COVERS THE GAP LESS `close`, because a tackler who ends up standing
    // exactly where the carrier is has walked through him rather than hit him.
    const travel = Math.max(0, gap - T.close);

    const dive = Math.min(1, Math.max(0, t / T.dive));
    const after = Math.min(1, Math.max(0, (t - hit) / T.fall));
    // THE SKID. The drive and the momentum run on past the fall into the
    // settle, fast then slowing (`launch`), where a smoothstep eased out and
    // stopped both men dead. `skid` stays inside `settle`, so the card never
    // opens over a body still sliding.
    const slide = launch(Math.min(1, Math.max(0, (t - hit) / (T.fall + T.skid))));

    // AND HE LEAVES HIS FEET. A dive is airborne: up on the way in and down on
    // the way through, which is a single arc rather than a jump and a landing.
    const air = Math.sin(Math.PI * dive) * T.leap;
    const settled = Math.max(0, 1 - after * 1.6);

    // WHERE THE HIT SENDS HIM: driven along the line of it by `driven`, and
    // carried on along his own heading by `momentum.keep` of his speed for the
    // fall's length. A man hit from the side goes sideways and forward; a man
    // hit head on is stopped in his tracks. BOTH of them ride it: the tackler
    // is carried along with the man he has hold of, or he stops dead while
    // his own tackle flies away from him.
    const keep = moving ? M.keep * speed * T.fall : 0;
    const sendX = ux * T.driven + hx * keep;
    const sendZ = uz * T.driven + hz * keep;
    const movedX = sendX * slide;
    const movedZ = sendZ * slide;

    // ONTO A SHOULDER: as far as the hit sends him sideways to the way he was
    // facing, so he is not a plank on his back. A positive `rotation.z` tilts
    // the figure's head toward its right (local -X), so a man sent to his
    // right lands on his right shoulder. Nothing without a facing.
    let roll = 0;
    const facing = motion && Number.isFinite(motion.facing) ? motion.facing : null;
    if (facing !== null) {
        const sent = Math.hypot(sendX, sendZ) || 1;
        const sideways = (sendX * -Math.cos(facing) + sendZ * Math.sin(facing)) / sent;
        roll = T.roll * sideways * smooth(after);
    }

    return {
        tackler: {
            x: ux * travel * launch(dive) + movedX * T.carry,
            y: air * settled,
            z: uz * travel * launch(dive) + movedZ * T.carry,
            // Laid out on the way in, landing a little past flat and settling.
            lean: T.tacklerLean * landing(dive, T.bounce),
        },
        carrier: {
            // Into the hit at his own speed, then sent, and only once he has
            // been hit: before that he is where the play left him, running.
            x: runX + movedX,
            z: runZ + movedZ,
            // Gravity from the hit, not a smoothstep.
            lean: T.carrierLean * landing(after, T.bounce),
            roll,
        },
        contact: t >= hit ? 1 : 0,
    };
}

/**
 * WHERE THE TWO OF THEM END UP, IN WORLD METRES, AND HOW LONG IT TAKES.
 *
 * Asked by a sack's celebration, which starts where this finishes: the sacker
 * gets up from the spot he landed on, and his team-mates must not be sent to
 * stand on the quarterback lying behind him. Solved from `takedownAt` at its
 * own end rather than re-derived, so the two can never disagree about where a
 * man is lying.
 *
 *   tackler   { x, z } where his feet are once he has landed
 *   carrier   { x, z } where the carrier's feet are, driven back
 *   length    seconds, the same number `takedownLength` gives for this gap
 *
 * `motion` is the carrier's, as `takedownAt` takes it, so a quarterback who
 * was moving lands where the view draws him landing.
 */
export function takedownRest(from, to, motion = null) {
    const gap = Math.hypot(to.x - from.x, to.z - from.z);
    const length = takedownLength(gap);
    const end = takedownAt(length, from, to, motion);
    return {
        tackler: { x: from.x + end.tackler.x, z: from.z + end.tackler.z },
        carrier: { x: to.x + end.carrier.x, z: to.z + end.carrier.z },
        length,
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
