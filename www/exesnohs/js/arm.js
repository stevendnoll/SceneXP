// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * arm.js - Where a hand goes, and what the two joints have to do to put it there.
 *
 * THE ELBOW WAS BENDING THE WRONG WAY, IN EVERY POSE, AND THIS IS THE FIX.
 *
 * people-1.0.0 grew an elbow last round (D120) and every angle written against
 * it was positive. Positive is the wrong sign. The forearm group hangs down its
 * local -Y and rotating it about +X carries the hand to -Z, and the rig FACES
 * +Z, so a positive `foreX` folds the forearm BACKWARD. That is hyperextension:
 * an elbow bending the wrong way. It was in the run cycle, the tuck, the block,
 * the tackle and the throw, which is why every figure on the field read as
 * having its arms on backwards.
 *
 * WHICH MEANS THE POSES CANNOT BE PATCHED BY FLIPPING A SIGN. Three angles
 * composing through two joints do not land the hand anywhere predictable, and
 * D121 already learned that searching them by eye is hopeless: its own sweep
 * looked at one sign only and reported the target unreachable by a quarter of a
 * metre. So the poses are now written as HAND POSITIONS, which are a thing a
 * person can picture and check, and this file turns a hand position into the
 * three angles that reach it.
 *
 * IT IS ALSO WHAT MAKES A RECEIVER CATCH THE BALL. Item 5 of the QA round asks
 * for hands that track the ball in, and a receiver reaching for a pass is the
 * same question as a quarterback holding one by his ear: put the hand HERE.
 * One solver answers both, so a catch cannot drift out of step with a carry.
 *
 * PURE, AND EXACT. No THREE, no DOM, no state beyond the rig's measurements.
 * Checked against a real three in a node:vm by tests/exesnohs-arm.test.mjs: for
 * every reachable target the hand lands within a millimetre of where it was
 * asked for, which is the only claim here worth making and the only one that
 * could have caught the sign.
 */

/**
 * THE RIG'S OWN MEASUREMENTS, CALIBRATED RATHER THAN COPIED.
 *
 * These are people-1.0.0's numbers, and the defaults are here so this module is
 * usable and testable on its own. But `calibrate` lets roster.js read them off
 * a figure it has actually built, which is the D93 lesson: hard-coding a shared
 * part's proportions works right up until the shared part changes one, and then
 * every player develops a fault that nothing in this file explains.
 *
 * `shoulder` is the joint's position in the rig's own local space, for the arm
 * on the positive side. `upper` is shoulder to elbow, `lower` elbow to hand.
 */
export const RIG = {
    shoulderX: 0.2125,
    shoulderY: 1.25,
    upper: 0.275,
    lower: 0.295,
    /** The shoulder's resting outward lean, which every solve is measured
     *  against when it picks between two answers. */
    restZ: 0.15,
};

/** Take the measurements off a figure that was actually built. Silently keeps
 *  the defaults if handed something incomplete, because a scene with no elbow
 *  should still pose an arm rather than throw. */
export function calibrate({ shoulderX, shoulderY, upper, lower, restZ } = {}) {
    if (shoulderX > 0) RIG.shoulderX = shoulderX;
    if (shoulderY > 0) RIG.shoulderY = shoulderY;
    if (upper > 0) RIG.upper = upper;
    if (lower > 0) RIG.lower = lower;
    if (typeof restZ === 'number') RIG.restZ = restZ;
    return { ...RIG };
}

/** How far the hand can get from the shoulder, and how close it can be pulled.
 *  Both are held a hair inside the true limit, because a target exactly at full
 *  stretch is a straight arm and a division by very nearly zero. */
export const reach = () => RIG.upper + RIG.lower - 0.001;
export const fold = () => Math.abs(RIG.upper - RIG.lower) + 0.01;

const wrap = (t) => {
    let a = t;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
};
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * One of the two answers.
 *
 * THE WHOLE LIMB LIES IN ONE PLANE, which is what makes this closed form
 * possible at all. The elbow's only freedom is `foreX`, so the forearm can only
 * swing in the arm's own YZ plane, and the shoulder's two angles then turn that
 * plane to face the target. Written out:
 *
 *     hand (in the arm's frame) = (0, -upper - lower·cos f, -lower·sin f)
 *
 * so its distance from the shoulder depends ONLY on the elbow angle, and the
 * law of cosines gives that angle outright. What is left is a rotation of the
 * pair (a, b) onto the target in the YZ plane, and an `asin` for the sideways
 * component. The `asin` is where the second answer comes from: PI minus it is
 * just as valid, and puts the elbow somewhere else entirely.
 *
 * `foreX` IS ALWAYS NEGATIVE, and that is not a convention, it is the joint.
 * An elbow flexes one way. The old poses all asked for the other one.
 */
function branch(target, side, flip) {
    const ux = target.x - side * RIG.shoulderX;
    const uy = target.y - RIG.shoulderY;
    const uz = target.z;
    const raw = Math.hypot(ux, uy, uz) || 1e-6;
    // OUT OF REACH IS NOT AN ERROR, IT IS AN ARM AT FULL STRETCH. A receiver
    // reaching for a ball he cannot quite get is a picture worth having, so a
    // distant target straightens the arm and points it rather than failing.
    const d = clamp(raw, fold(), reach());

    const cosElbow = (RIG.upper * RIG.upper + RIG.lower * RIG.lower - d * d)
        / (2 * RIG.upper * RIG.lower);
    const foreX = -(Math.PI - Math.acos(clamp(cosElbow, -1, 1)));

    const a = -RIG.upper - RIG.lower * Math.cos(foreX);
    const b = -RIG.lower * Math.sin(foreX);

    // Aim at the direction of the target, at the distance the arm can manage.
    const s = d / raw;
    const vx = ux * s;
    const vy = uy * s;
    const vz = uz * s;

    let armZ = Math.asin(clamp(-vx / a, -1, 1));
    if (flip) armZ = Math.PI - armZ;
    const c = a * Math.cos(armZ);
    const armX = Math.atan2(vz, vy) - Math.atan2(b, c);

    return { armX: wrap(armX), armZ: wrap(armZ), foreX };
}

/**
 * The three angles that put this hand here.
 *
 * `target` is a point in the rig's own local space, in rig metres before
 * `figureScale`. `side` is the arm's own `armSide`, -1 or +1.
 *
 * WHICH OF THE TWO ANSWERS, AND WHY IT MATTERS. Both put the hand in exactly
 * the same place and they put the ELBOW in wildly different ones: for a hand
 * raised overhead, one lifts the arm forward past the ear and the other rotates
 * the whole limb 180 degrees about its own hanging axis. The second is correct
 * and unusable, because these angles are blended frame to frame and sweeping
 * `armZ` through three radians to reach the same pose is a shoulder dislocating
 * rather than an arm going up.
 *
 * So the tie is broken on `armZ` closest to the shoulder's RESTING lean, which
 * keeps elevation in `armX` where it blends cleanly, and leaves `armZ` for the
 * genuine sideways poses: a quarterback's cocked arm solves to a right angle
 * out from the body because there is no other way to hold a ball out there.
 */
export function solveArm(target, side = 1) {
    const rest = side * RIG.restZ;
    const a = branch(target, side, false);
    const b = branch(target, side, true);
    const cost = (c) => Math.abs(wrap(c.armZ - rest));
    return cost(b) < cost(a) ? b : a;
}

/**
 * Where the hand ends up for a given set of angles, which is the solver run
 * backwards.
 *
 * Only the test needs this against a real rig, but having it here means the two
 * halves are written from the same four numbers rather than from a Three scene
 * graph that has to be built before anything can be asked.
 */
/**
 * WHERE THE ELBOW ENDS UP, WHICH IS THE HALF OF A POSE NOBODY CHECKS.
 *
 * A pose in this project is written as a hand position, because a hand position
 * can be pictured and argued about. What it does NOT say is where the rest of
 * the limb went, and the limb is most of what a viewer sees: a figure is about
 * 34 pixels tall, so the upper arm is a bigger part of the outline than the
 * hand on the end of it.
 *
 * TWICE NOW A POSE HAS BEEN CORRECT AT THE HAND AND WRONG AT THE ELBOW. The
 * quarterback's off hand was reachable and carried the elbow through his own
 * sternum (see `throwHold` in config.js). The dejected pose put the hand at the
 * waist, which is exactly where it was wanted, and the elbow two centimetres
 * ABOVE the shoulder and 0.23m behind it, which reads as arms held out
 * backwards and was reported as such.
 *
 * It takes the same two shoulder angles `handAt` does, because the elbow is
 * where the upper arm ends and the forearm has nothing to do with it.
 */
export function elbowAt(armX, armZ, side = 1) {
    const a = -RIG.upper;
    const y0 = a * Math.cos(armZ);
    return {
        x: side * RIG.shoulderX - a * Math.sin(armZ),
        y: RIG.shoulderY + y0 * Math.cos(armX),
        z: y0 * Math.sin(armX),
    };
}

export function handAt(armX, armZ, foreX, side = 1) {
    const a = -RIG.upper - RIG.lower * Math.cos(foreX);
    const b = -RIG.lower * Math.sin(foreX);
    // Rz first and Rx second, which is the order three composes an 'XYZ' Euler
    // in. Getting that backwards is silent and puts the arm somewhere plausible.
    const y0 = a * Math.cos(armZ);
    return {
        x: side * RIG.shoulderX - a * Math.sin(armZ),
        y: RIG.shoulderY + y0 * Math.cos(armX) - b * Math.sin(armX),
        z: y0 * Math.sin(armX) + b * Math.cos(armX),
    };
}

/**
 * A point in world metres, expressed in one figure's own local space.
 *
 * THE CATCH NEEDS THIS AND NOTHING ELSE DOES. A receiver's hands go to the
 * ball, the ball is in world metres, and the arm solver works in the rig's own
 * space before `figureScale` and before the figure's yaw. Getting either of
 * those backwards puts a receiver's hands somewhere on the far sideline, and it
 * is exactly the kind of mistake that looks like an animation fault.
 *
 * `yaw` is the figure's rotation about Y, and the rig faces +Z.
 */
export function toRigSpace(point, at, yaw, scale) {
    const dx = (point.x - at.x) / scale;
    const dy = (point.y - (at.y || 0)) / scale;
    const dz = (point.z - at.z) / scale;
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    // Undo the yaw: rotating a world offset by -yaw about Y.
    return {
        x: dx * c + dz * s,
        y: dy,
        z: -dx * s + dz * c,
    };
}
