// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * jump.js - The visitor's jump: when a receiver may go up, and whether his
 * hands are up to the ball.
 *
 * ADDED 2026-09-23, AND IT CHANGES WHO DECIDES THE CATCH. Until then a
 * receiver jumped on his own, and only once the ball was already over his
 * hands (view.js `updateJump`). Now the visitor sends him up, with the Jump
 * button, by tapping near him, or with J or Space, and a mistimed jump sees
 * the pass sail past or picked off. "Auto jump" in the playbook brings the old
 * behaviour back exactly as it was. See `pose.jump.manual` in config.
 *
 * PURE: NO THREE, NO DOM, apart from the one saved switch at the bottom, which
 * names `localStorage` outright the way colors.js and audio.js do. play.js
 * asks this file whether a leaping man can take the ball, view.js asks it how
 * high he is, and both get the same answer because there is only one copy.
 */

import { XO_CONFIG as CFG, UNITS_TO_METRES } from './config.min.js';

/**
 * HOW FAR OFF THE GROUND A JUMP IS AT `t`, 0 to 1 of its hang, in metres.
 *
 * Up and down once. A sine rather than a parabola, because the hang at the top
 * is the part anybody actually reads. The apex sits at `jump.peakAt` of the
 * hang rather than in the middle: see that key in config for why.
 *
 * Moved here from view.js (which still exports it) when the simulation started
 * needing it too: a hand-timed catch is judged against how high he is.
 */
export function jumpLift(t) {
    const J = CFG.pose.jump;
    if (!(t >= 0) || t >= 1) return 0;
    const raw = typeof J.peakAt === 'number' ? J.peakAt : 0.5;
    const peak = Math.min(0.95, Math.max(0.05, raw));
    const u = t < peak
        ? 0.5 * (t / peak)
        : 0.5 + 0.5 * ((t - peak) / (1 - peak));
    return Math.sin(Math.PI * u) * J.lift;
}

/**
 * A THROW'S START, TARGET AND LENGTH, from the ball's own coordinates, or null
 * before there is a throw.
 *
 * `reach` scales the apex by the length of the pass, so a flick stays a bullet
 * and only a deep ball reaches the top of the arc. view.js caches exactly this
 * for its replays (`flightSpan`), and builds it with this function.
 */
export function spanOf(coords) {
    const c = coords || {};
    if (!(c.startX !== undefined && c.targetX !== undefined)) return null;
    const total = Math.hypot(c.targetX - c.startX, c.targetY - c.startY);
    if (!(total > 0)) return null;
    return {
        sx: c.startX,
        sy: c.startY,
        tx: c.targetX,
        ty: c.targetY,
        total,
        reach: Math.min(1, (total * UNITS_TO_METRES) / CFG.ball.fullArcAt),
    };
}

/**
 * HOW HIGH THE BALL IS DRAWN, in metres, at sim position (x, y) along `span`.
 *
 * The parabola view.js draws: `release` at both ends and `apex` times `reach`
 * at the middle. THE SAME FUNCTION IS THE VIEW'S AND THE CATCH'S, so the ball a
 * visitor times the jump against is the ball the catch is judged against. The
 * view smooths what it draws over a few frames, which is a few centimetres at
 * most and deliberately not modelled.
 */
export function arcHeightAt(span, x, y) {
    const B = CFG.ball;
    const gone = Math.hypot(x - span.sx, y - span.sy);
    const p = Math.min(1, Math.max(0, gone / span.total));
    return B.release + 4 * p * (1 - p) * B.apex * span.reach;
}

/** The ball's drawn height right now, straight from its sim coordinates, or
 *  the release height for a ball with no throw behind it. */
export function ballHeight(ball) {
    if (!ball || !ball.coords) return CFG.ball.release;
    const span = spanOf(ball.coords);
    return span ? arcHeightAt(span, ball.coords.x, ball.coords.y) : CFG.ball.release;
}

/** Whether a jump that has been going for `leapFor` seconds is still off the
 *  ground. */
export function inTheAir(leapFor) {
    return leapFor >= 0 && leapFor < CFG.pose.jump.hang;
}

/** How high his hands are, in metres, `leapFor` seconds into a jump, given
 *  where they are when he is standing. */
export function handsAt(standing, leapFor) {
    const t = leapFor / CFG.pose.jump.hang;
    return standing + jumpLift(t);
}

/**
 * CAN A LEAPING MAN TAKE THE BALL AT THIS HEIGHT, RIGHT NOW?
 *
 * Only while he is off the ground, and only if the ball is no further above
 * his hands than `manual.slack`. A ball at or below them is always his: a man
 * in the air can reach down, and a jump should never cost a catch he would
 * have made standing. So the jump only ever RAISES the ceiling, and what it
 * raises it by depends on when it was pressed. Early, and he is on his way
 * back down when the ball arrives. Late, and he has not got up yet.
 *
 * `standing` null means the view has not said how tall the figures are, in
 * which case the old answer holds: a man in the air is excused the height.
 */
export function leapCatches(standing, leapFor, ballY) {
    if (!inTheAir(leapFor)) return false;
    if (!(typeof standing === 'number')) return true;
    return ballY <= handsAt(standing, leapFor) + CFG.pose.jump.manual.slack;
}

/**
 * THE HIGHEST BALL ANY JUMP CAN TAKE, in metres: his hands at the top of the
 * jump plus the catch's own slack above them, which is exactly the most
 * `leapCatches` will ever say yes to. A ball above this as it passes a man is
 * not coming to him, whatever its shadow does at his feet. Infinity without a
 * standing height, which is the view not having said how tall the figures are,
 * and then the grass alone decides, as it always did.
 */
export function jumpCeiling(standing) {
    if (!(typeof standing === 'number' && standing > 0)) return Infinity;
    const J = CFG.pose.jump;
    return handsAt(standing, J.peakAt * J.hang) + J.manual.slack;
}

/**
 * WHO THE JUMP BUTTON SENDS UP (Steve's QA, 2026-10-30): of the receivers who
 * can still go up (handed in already sifted), the one the ball reaches soonest
 * along its written path, which is usually but not always the man it was
 * thrown to: a pass thrown behind him can be another receiver's to go up for.
 * A ball coming to nobody, and a tie, go to whoever stands nearest it now.
 * Null when there is nobody. Pure, so main.js hands in plain objects.
 *
 * `ceiling` is `jumpCeiling`, and it is what keeps a deep ball from being the
 * shallow man's (Steve's QA, 2026-10-30): a pass led well across the field
 * sails over another receiver on more than half of such throws, a median 4.6 m
 * up, and the grass alone called that "reached" and lit him up for most of the
 * flight. Measured over 54 of them the cue pointed away from the man it was
 * thrown to for a median 38% of the flight.
 */
export function nearestToBall(ball, receivers, reach, ceiling = Infinity) {
    let best = null;
    for (const r of receivers || []) {
        if (!r || !r.coords) continue;
        const when = arrivalIn(ball, r, reach, ceiling);
        const now = ball && ball.coords
            ? Math.hypot(r.coords.x - ball.coords.x, r.coords.y - ball.coords.y) : Infinity;
        if (!best || when < best.when || (when === best.when && now < best.now)) best = { r, when, now };
    }
    return best ? best.r : null;
}

/**
 * HOW SOON THE BALL GETS TO HIM, in seconds, or Infinity if it is not coming.
 *
 * THE BALL'S PATH IS ALREADY WRITTEN DOWN. The ported routes give a thrown
 * ball its whole flight up front, one point per simulation step in
 * `coords.list`, so this does not have to guess from a speed: it walks the
 * points still to come and finds the first one inside his airborne reach. He
 * is carried along his own current velocity while it looks, which is close
 * enough over the half second the cue cares about. Zero once the ball is
 * already inside that reach.
 *
 * AND INSIDE IT MEANS IN THE AIR TOO. The path is a line on the grass, and the
 * ball is on an arc over it (`arcHeightAt`, the same one the view draws and the
 * catch is judged against), so a point of the path within his reach on the
 * grass only counts if the ball is no higher there than `ceiling`. A ball
 * passing over his head right now is not here yet either: it may come down to
 * him further along, and the walk says whether it does. No ceiling, or a ball
 * with no written throw behind it, and every point is low enough, which is the
 * grass-only answer this gave before.
 */
export function arrivalIn(ball, receiver, reach, ceiling = Infinity) {
    if (!ball || !receiver || !ball.coords || !receiver.coords) return Infinity;
    const r = reach || 0;
    const rx = receiver.coords.x;
    const ry = receiver.coords.y;
    const low = lowEnough(ball.coords, ceiling);
    if (Math.hypot(rx - ball.coords.x, ry - ball.coords.y) <= r && low(ball.coords.x, ball.coords.y)) return 0;
    const list = Array.isArray(ball.coords.list) ? ball.coords.list : [];
    // Carried along WHERE HE IS GOING, which is his windowed heading when the
    // simulation keeps one (play.js `markHeading`), and this frame's speed when
    // it does not. The frame's speed is the steer's own square wave, and read
    // raw it said "not coming to him" on frames he was running straight at the
    // spot. Measured over 54 deep crossing throws the heading took the cue's
    // wrong first lights from 2 to 0 (see `buttonTarget`).
    const s = receiver.state || {};
    const h = s.heading;
    const vx = h ? (Number(h.x) || 0) : (s.xSpeed || 0);
    const vy = h ? (Number(h.y) || 0) : (s.ySpeed || 0);
    for (let i = 0; i < list.length; i += 1) {
        const p = list[i];
        const k = i + 1;
        if (Math.hypot(rx + vx * k - p[0], ry + vy * k - p[1]) <= r && low(p[0], p[1])) return k / CFG.simHz;
    }
    return Infinity;
}

/** The height test `arrivalIn` applies at each point of the path: the ball's
 *  drawn height there against `ceiling`. Built once a call, because the span
 *  does not change along the path. */
function lowEnough(coords, ceiling) {
    const top = typeof ceiling === 'number' ? ceiling : Infinity;
    const span = top < Infinity ? spanOf(coords) : null;
    if (!span) return () => true;
    return (x, y) => arcHeightAt(span, x, y) <= top;
}

/**
 * WHO THE JUMP BUTTON SENDS UP, THE MAN IT WAS THROWN TO FIRST (Steve's QA,
 * 2026-10-30, the second round on the button).
 *
 * `nearestToBall` alone sends up the man the ball reaches soonest, and once the
 * quarterback led his receivers that was the wrong man on nearly half of the
 * deep crossing throws measured: the ball passed over the shallow receiver,
 * within a jump's reach by this game's generous arc, on its way to the man it
 * was thrown to. The ceiling barely helped (24 of 54 wrong first lights to 23),
 * because the figures leap to 5.7 m and the ball over him was lower than that.
 *
 * So the man it was thrown to comes first: if the ball is coming to him at all,
 * he is the one. Only a ball that is NOT coming to him, thrown behind him or
 * past him, goes to whoever it does reach, which is what the first round asked
 * for and keeps. `coming` is a latch the caller hands back each frame: once the
 * ball has been coming to him this flight it stays his, because the frame-by-
 * frame question flickers while he closes on the spot, and a cue that changes
 * its mind sends the wrong man up. Measured: wrong first lights 24 of 54, to 7
 * with the preference, to 0 with the latch and the heading.
 *
 * A BALL COMING TO NOBODY IS HIS TOO, while he can still go up. The first round
 * sent it to whoever stood nearest the ball, which with the ball in the air
 * over the shallow man was the shallow man. The man it was thrown to is the
 * only one who can catch it, and a prediction that says it reaches nobody is a
 * prediction, so the button stays his until the ball is really reaching
 * somebody else.
 *
 * Returns `{ who, coming }`: the man to send up (null for nobody) and the latch
 * to hand back. Pure, like everything else here.
 */
export function buttonTarget(ball, receivers, reach, ceiling, thrownTo, coming = false) {
    const list = receivers || [];
    const target = list.find((r) => r && r.settings && r.settings.position === thrownTo) || null;
    if (target && (coming || arrivalIn(ball, target, reach, ceiling) < Infinity)) {
        return { who: target, coming: true };
    }
    const other = nearestToBall(ball, list, reach, ceiling);
    const reached = !!other && arrivalIn(ball, other, reach, ceiling) < Infinity;
    return { who: reached || !target ? other : target, coming: !!coming };
}

/** Whether the Jump button should be lit: the ball is on its way to him and
 *  no more than `cueLead` seconds out. */
export function cueLit(ball, receiver, reach, ceiling = Infinity) {
    return arrivalIn(ball, receiver, reach, ceiling) <= CFG.pose.jump.manual.cueLead;
}

// ---- The saved switch ------------------------------------------------------

let auto = null;

/**
 * WHETHER THE RECEIVER JUMPS BY HIMSELF, which is the "Auto jump" switch.
 *
 * OFF UNLESS THE VISITOR TURNED IT ON. A timed press is the game now, and the
 * switch is there for anybody who cannot make one. Read once and remembered,
 * so a broken or blocked storage just means the default.
 */
export function autoJump() {
    if (auto === null) {
        auto = false;
        try {
            const raw = localStorage.getItem(CFG.storage.jump);
            if (raw) auto = JSON.parse(raw).auto === true;
        } catch { /* no storage, or not ours: the default holds */ }
    }
    return auto;
}

export function setAutoJump(on) {
    auto = !!on;
    try {
        localStorage.setItem(CFG.storage.jump, JSON.stringify({ auto }));
    } catch { /* the switch still works for this visit */ }
    return auto;
}

/** Test seam: forget what was read, so the next read goes to storage. */
export function resetAutoJump() {
    auto = null;
}
