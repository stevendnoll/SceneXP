// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * lead.js - LEADING THE RECEIVER (Steve's QA, 2026-10-30): where a thrown ball
 * lands, so the man it is thrown to catches it in stride.
 *
 * THE FAULT WAS IN THE 2D GAME FROM THE START. The ported throw lands the ball
 * at the receiver's position plus a lead made of hand-tuned multipliers: his
 * downfield speed times a share of the throw's length, and his crossing speed
 * times a constant that depends on which side of the quarterback he stands.
 * Neither has anything to do with how long the ball is in the air, so the
 * downfield lead came out generous and the crossing lead short, and a receiver
 * crossing the field saw the ball land upfield of him and barely across. He
 * does what the port tells him once the ball is up, which is to run to where
 * it will land, so he turned off his route and ran straight upfield. MEASURED
 * over every play, every receiver, two moments each (122 throws): on crossing
 * routes the ball landed a median 1.24 m from where he would have been in
 * stride, 10.2 m at worst, and he had to turn a median 25 degrees off his
 * route, over 45 degrees on 14 of 72.
 *
 * A QUARTERBACK SOLVES FOR WHERE THE MAN WILL BE. The ported ball travels a
 * fixed number of field units DOWNFIELD a tick along a straight line
 * (playstate.js `getLineCoords` samples the line every `throttle` units of x),
 * so its flight is the downfield distance over that speed whatever the
 * sideways distance, and the receiver's position when it lands is his position
 * plus his heading times that time. That is one linear equation, solved here.
 * The heading is the windowed one `play.markHeading` keeps (net travel over
 * `lead.window`), so a man who has stopped on a comeback gets the ball where he
 * stands and a man crossing at full speed gets it in stride.
 *
 * PURE: field units in, field units out, no clamps (the caller knows the
 * field). formations.js `generateBallObject` calls it when `lead.intercept` is
 * on, and keeps the port's multipliers when it is off, for QA to compare.
 */
import { XO_CONFIG as CFG } from './config.min.js';

/**
 * THE INTERCEPT.
 *
 *     land.x = at.x + v.x * t,   t = (land.x - start.x) / throttle
 *  => land.x = (at.x * throttle - v.x * start.x) / (throttle - v.x)
 *     land.y = at.y + v.y * t
 *
 * `start` is where the ball leaves the hand, `at` where the receiver is now,
 * `heading` his velocity in units a tick (null or zero for a man standing
 * still, who gets the ball where he is), `throttle` the ball's downfield units
 * a tick. `extra` ticks of lead (a defender on his heels) carry the spot
 * further along his line, so he runs onto the ball and away from the man
 * behind him. The flight is held to `maxTicks`: a receiver outrunning the
 * ball downfield gets it as far as it goes. A landing behind the thrower is
 * the receiver's own spot, as the port had it (its line cannot run backwards).
 * Returns `{ x, y, ticks }`, `ticks` the flight the solve assumed.
 */
export function interceptTarget({ start, at, heading = null, throttle, extra = 0, maxTicks = CFG.lead.maxTicks } = {}) {
    const vx = heading ? Number(heading.x) || 0 : 0;
    const vy = heading ? Number(heading.y) || 0 : 0;
    const speed = Math.max(0.01, Number(throttle) || 0);
    let ticks = Infinity;
    if (speed - vx > 1e-6) {
        const lx = (at.x * speed - vx * start.x) / (speed - vx);
        ticks = (lx - start.x) / speed;
    }
    if (!(ticks >= 0)) ticks = 0;
    const cap = Number.isFinite(maxTicks) && maxTicks >= 0 ? maxTicks : Infinity;
    ticks = Math.min(ticks, cap);
    const lead = ticks + Math.max(0, Number(extra) || 0);
    return { x: at.x + vx * lead, y: at.y + vy * lead, ticks };
}

/**
 * HOW FAR A LANDING SPOT IS FROM IN STRIDE, for the suite and for QA: where
 * the receiver would be when the ball lands if he kept running as he was,
 * against where it lands, in field units. `flightTicks` is the ball's own
 * flight (its path's length). 0 is a catch in stride.
 */
export function strideError({ at, heading, land, flightTicks }) {
    const vx = heading ? Number(heading.x) || 0 : 0;
    const vy = heading ? Number(heading.y) || 0 : 0;
    const t = Math.max(0, Number(flightTicks) || 0);
    return Math.hypot(land.x - (at.x + vx * t), land.y - (at.y + vy * t));
}
