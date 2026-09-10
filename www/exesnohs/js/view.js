// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * view.js - THE ADAPTER. Simulation numbers in, mesh transforms out.
 *
 * This is the only module in the project that touches both halves, and it is
 * deliberately thin. The simulation does not know it is being drawn, and the
 * figures do not know there is a game (PLANNING D1). Everything interesting
 * lives on one side or the other, and this is the seam.
 *
 * IT IS ALSO THE ONLY PLACE UNITS CHANGE. `simToWorld` in config.js converts
 * field units to metres, and nothing else in the codebase multiplies by a
 * scale factor (D17). If a player is in the wrong place, there are exactly two
 * files to read: the route that positioned them, and this one.
 *
 * MOST OF IT IS NOT TESTABLE BY ASSERTION, and that is by design. The test stub
 * is a Proxy that absorbs every assignment written onto a mesh, so a suite can
 * confirm this module runs without throwing and nothing more. That is why it
 * carries as little arithmetic as it can: the maths belongs in config.js, which
 * is pure and asserted directly.
 *
 * WHAT COULD NOT BE KEPT OUT IS `toWorld` AND `carryHold`, and both are
 * exported precisely because of that rule rather than in spite of it. Placing
 * the held ball needs the figure's PITCH as well as its yaw, and getting that
 * wrong is the fault QA reported as a tackled carrier leaving the ball hanging
 * in the air above him. Neither function touches a mesh: they take numbers and
 * return numbers, so they are asserted like anything else pure.
 */
import { EXESNOHS_CONFIG as CFG, simToWorld, FIELD, UNITS_TO_METRES } from './config.min.js';
import { figureFor, poseFigure, THROWING_SIDE, FIGURE_LIFT } from './roster.min.js';
import { getBall, aimBall, placeSpot, BALL_FAT } from './ball.min.js';
import { placeMarker, hideMarker } from './markers.min.js';
import { toRigSpace, RIG } from './arm.min.js';
import { takedownAt } from './takedown.min.js';

/** Is this player sitting out this formation?
 *
 *  READ FROM A FLAG, NEVER FROM A COORDINATE. play.js records the answer at
 *  line-up. Testing the distance instead looks like it works and then fails
 *  mid-play, because the library keeps running a benched player's route and
 *  they drift roughly a thousand units back toward the field over seven
 *  seconds, eventually crossing any threshold you pick. */
const BENCHED = (o) => o.settings.benched === true;

/** Kept so main.js need not change when the camera work lands at M5. The
 *  figures no longer billboard: that existed only because a flat letterform
 *  turned edge-on is nothing, and a person is legible from any angle. */
let viewCamera = null;
export function setViewCamera(camera) { viewCamera = camera; }

/**
 * Which way a player is facing, and how fast they are allowed to get there.
 *
 * THE RAW VELOCITY HEADING IS UNUSABLE ON ITS OWN. Measured over 112,942
 * simulation frames, 13.7% of them turned the heading by more than 30 degrees
 * and 4.4% by more than 90, with a worst case of a full 180 in a single frame.
 * That is not noise in the data, it is what the ported motion model does: it
 * accelerates and decelerates on two independent axes, so the direction of the
 * velocity vector flips every time one of them crosses zero, however slowly
 * the player is actually moving. Feeding that straight into rotation.y makes
 * everyone spin on the spot.
 *
 * Two guards. A DEADZONE, so a heading is only re-aimed when somebody is
 * genuinely moving rather than drifting through a rounding error. And a
 * RESPONSE RATE, so the figure turns toward the new heading over time instead
 * of snapping to it. The rate is per second, not per frame, so the turn looks
 * the same on a 120Hz display as on a struggling phone.
 */
export const HEADING_DEADZONE = 1.1;    // METRES PER SECOND of measured movement
export const TURN_RESPONSE = 7;         // higher turns quicker

const wrapAngle = (a) => {
    let d = a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
};

/**
 * The heading a player WANTS, from the movement that was actually DRAWN.
 *
 * THE RAW FIELDS WERE STILL BEING READ HERE, and that is what was left of the
 * glitch. The two guards above were added when the heading came from
 * `state.xSpeed` and `state.ySpeed`, and they were not enough on their own:
 * measured over 700,000 steps, 5.6% of consecutive frames REVERSE direction
 * outright, because the ported model accelerates two axes independently and
 * either one crossing zero flips the velocity vector. A deadzone stops a
 * drifting player spinning and a turn rate slows the swing, but a target that
 * is 180 degrees out for three frames at a time still drags the figure round
 * and back, forty times a second.
 *
 * The DRAWN movement has already been through the position smoother, so it
 * carries none of that: it is where the figure visibly went. Same lesson as the
 * stride, the ball's heading and the collision scale, which is that a field the
 * simulation keeps is not the same thing as what is on screen.
 *
 * The deadzone is now in metres per second rather than sim units per frame,
 * which also means it stopped silently changing every time `simHz` moved.
 */
function targetFacing(moveX, moveZ, mps) {
    if (mps > HEADING_DEADZONE && (moveX || moveZ)) {
        // The rig's forward is +z, and world x is downfield.
        return Math.atan2(moveX, moveZ);
    }
    return null;      // keep whatever we were facing
}

/**
 * WHICH OF THE THREE CARRIES THIS PLAYER IS USING.
 *
 * Straight off the 2D game's `drawFrame`, which picks between them by draw
 * order: a quarterback with the ball and `state.run` unset gets it drawn ON TOP
 * of him, which on a plan view is how you say it is held up; with `state.run`
 * set he gets it drawn UNDER him, tucked; and anybody else carrying it gets it
 * drawn under and offset to the hip. Same flag, same three cases (D29: nothing
 * invented that the source does not already say).
 */
function carryFor(obj, carrier) {
    if (!carrier || carrier !== obj) return 'none';
    if (obj.settings.position !== 'qb') return 'tuck';
    return obj.state.run ? 'tuck' : 'throw';
}

/**
 * THE RELEASE, TIMED FROM THE FRAME THE BALL LEFT HIS HAND.
 *
 * Nothing in the simulation announces a throw to the view, and nothing needs
 * to: the quarterback holds the ball on one frame and does not on the next,
 * and a ball object exists that did not before. That is the release, and
 * reading it here rather than being told means the sweep also plays during a
 * REPLAY, where the whole world is rebuilt from a recording and no button is
 * ever pressed.
 */
const release = { at: -1, position: '' };

export function resetThrow() {
    release.at = -1;
    release.position = '';
    // AND FORGET WHETHER HE WAS HOLDING IT, so the next play or the next
    // playback re-seeds from its own first frame. Left set, the last thing the
    // previous play did to the ball is still what this one starts from.
    release.held = undefined;
}

function noteThrowRelease(objects, carrier, delta) {
    if (release.at >= 0) release.at += delta;

    const qb = objects.find((o) => o.settings.position === 'qb' && !BENCHED(o));
    const held = !!(qb && qb.state && qb.state.hasBall);
    if (release.held === undefined) release.held = held;

    // Held last frame, not held now, and he did not simply hand it to himself
    // by taking off with it: that is a throw.
    if (release.held && !held && (!carrier || carrier.settings.position !== 'qb')) {
        release.at = 0;
        release.position = 'qb';
    }
    release.held = held;
}

/** Seconds since the ball left his hand, or -1 when nobody has thrown one.
 *  Exported for the same reason `takedownClock` is: it is the one piece of
 *  state a caller has to be able to ask about, and a replay starting with it
 *  still running is what put a quarterback's arm at his side through the whole
 *  of playback. */
export function throwClock() {
    return release.at;
}

/** 0 to 1 across the arm sweep, or 0 for anybody not throwing right now. */
function throwProgress(obj) {
    if (release.at < 0 || obj.settings.position !== release.position) return 0;
    const t = release.at / CFG.pose.throwRelease.time;
    return t >= 1 ? 1 : t;
}

/**
 * THE SNAP, WHICH IS QA ITEM 1 AND HAS ITS OWN CLOCK.
 *
 * Before it, the quarterback waits under centre with the ball out in front in
 * both hands. After it, he brings it back and the arm up as he looks
 * downfield. `snapT` runs 0 to 1 across `pose.snap.time` and both the arms and
 * the ball read it, so the ball can never arrive at a hand the hand has not
 * reached yet.
 *
 * TOLD, NOT DETECTED, and it is the one animation here that is. The throw and
 * the ball's landing are both inferred from the world changing under them,
 * because nothing announces either. The snap is different: main.js already has
 * a function called `onSnap` that exists because a visitor pressed a button,
 * and a replay rewinds to a recording that begins ON the snap. Both of those
 * are the cue itself, so asking for it is honest and it means the motion plays
 * in a replay for free.
 */
const snapAt = { t: -1 };

/**
 * Start the snap motion. Called on the visitor's own press, and again when a
 * replay rewinds to the first recorded frame, which is the same instant.
 *
 * IT CLEARS THE THROW TOO, AND THAT IS THE FIX FOR A REPLAY DRAWING A
 * QUARTERBACK WITH HIS ARM AT HIS SIDE.
 *
 * `release.at` is seconds since the ball left his hand, and nothing was
 * resetting it between a play and its own replay: a play that ended in a pass
 * left it at several seconds, so `throwProgress` saturated at 1 and the arm sat
 * in the FOLLOW THROUGH from the first frame of playback until the recorded
 * throw came round again. The ball, meanwhile, is placed from the carry rather
 * than from the sweep, so it hung correctly up by his ear beside an arm that
 * had already finished throwing it. QA saw exactly that and called it the arm
 * not being raised.
 *
 * It belongs here rather than in main.js because these are one fact, not two:
 * a play that is starting from the snap has not thrown the ball yet. Both
 * callers get it, and neither has to remember.
 */
export function beginSnapMotion() {
    snapAt.t = 0;
    resetThrow();
}

/** Hold him under centre. A new line-up, and the presnap frames. */
export function resetSnapMotion() {
    snapAt.t = -1;
}

/** 0 while he is still waiting for it, easing to 1 once it is away. */
export function snapProgress() {
    if (snapAt.t < 0) return 0;
    const T = CFG.pose.snap.time;
    if (!(T > 0)) return 1;
    const t = Math.min(1, snapAt.t / T);
    return t * t * (3 - 2 * t);
}

/**
 * WHO IS BLOCKING SOMEBODY, DERIVED RATHER THAN DECLARED.
 *
 * The ported simulation has no blocking flag. It has linemen, it has routes
 * that walk them into defenders, and it has collision responses, but nothing
 * anywhere says "this man is engaged". So the view infers it, which is fair:
 * blocking is what the position group is FOR, and on a running play it is the
 * entire visible content of the frame.
 *
 * Returns a 0-to-1 amount per position rather than a boolean, so a lineman
 * reaches out as a defender closes rather than snapping into a pose at a
 * threshold. Costs six players against eight opponents, once a frame.
 */
/**
 * WHO A DEFENDER IS WATCHING, AND THE LIBRARY ALREADY SAYS SO.
 *
 * Every defensive route carries a `type` and, for the man-coverage ones, the
 * name of the receiver being shadowed:
 *
 *     cover   33 of them, each naming wr1 to wr4 in `route.cover`
 *     blitz   30, coming for the quarterback
 *     zone    51, minding a patch of grass
 *
 * So a defender facing the way he happens to be running is throwing that away.
 * A corner running backwards down the sideline with his eyes on his receiver is
 * one of the most recognisable pictures in the sport, and the data for it was
 * sitting in the formation library the whole time (D29: nothing invented).
 *
 * CACHED AT LINE-UP, because `replay.frameAt` rebuilds objects from six floats
 * and carries no routes at all. The replay follows the play it recorded, so the
 * assignments are still the right ones. Same technique as the ball's flight
 * span, and cleared by `resetAssignments` when a new play lines up.
 */
const watching = new Map();      // position -> { type, cover }

export function resetAssignments() {
    watching.clear();
}

function noteAssignments(objects) {
    for (const obj of objects) {
        const route = obj.settings.route;
        if (!route || !route.type) continue;
        watching.set(obj.settings.position, { type: route.type, cover: route.cover || '' });
    }
}

/**
 * The world point a player should be looking at, or null to face his running.
 *
 * Converging on the ball beats any assignment: once a defender is close enough
 * to make the tackle he is looking at the man with the ball, whatever he was
 * told to do before the snap.
 */
function lookTarget(obj, objects, carrier, here, standing, blocking) {
    const at = (o) => (o ? simToWorld(o.coords.x, o.coords.y, 0) : null);

    // A BLOCK BEATS EVERY OTHER REASON TO BE LOOKING SOMEWHERE, on both sides
    // of it. Two men with their hands on each other are looking at each other,
    // and a lineman facing the way he last happened to move while wrestling
    // somebody beside him is most of why the line did not read as a line.
    if (blocking) {
        const foe = at(objects.find((o) => o.settings.position === blocking && !BENCHED(o)));
        if (foe) return foe;
    }

    if (obj.settings.team !== 1) {
        // A RECEIVER WHO HAS ARRIVED LOOKS BACK FOR THE BALL. QA item 3 asks
        // for exactly this, and it is also the only thing that makes standing
        // still read as waiting rather than as having given up: he faces
        // whoever has it, which before a throw is the quarterback.
        if (!standing || !carrier || carrier === obj) return null;
        if (!/^wr\d$/.test(obj.settings.position)) return null;
        return at(carrier);
    }

    if (carrier && carrier !== obj) {
        const c = at(carrier);
        if (Math.hypot(c.x - here.x, c.z - here.z) < CFG.pose.tackle.reach * 2.4) return c;
    }

    const job = watching.get(obj.settings.position);
    if (!job) return null;
    if (job.type === 'cover' && job.cover) {
        return at(objects.find((o) => o.settings.position === job.cover && !BENCHED(o)));
    }
    if (job.type === 'blitz') {
        return at(objects.find((o) => o.settings.position === 'qb' && !BENCHED(o)));
    }
    // A zone defender watches the ball, which before a throw is the
    // quarterback. That is what standing in a zone actually looks like.
    return carrier && carrier !== obj ? at(carrier) : null;
}

/**
 * WHO IS MAKING THE TACKLE, as a 0-to-1 amount.
 *
 * The ported model counts `state.tackle` up over consecutive frames of contact
 * and blows the whistle when it reaches the carrier's own threshold, so contact
 * is a thing the simulation knows about and never showed. Anybody from the
 * other side inside `reach` of the ball carrier is going in, and how far in
 * scales with how close they are, so an arriving defender reaches rather than
 * snapping into a pose at a threshold.
 */
function tacklersOn(objects, carrier) {
    const out = new Map();
    if (!carrier) return out;
    const reach = CFG.pose.tackle.reach;
    const c = simToWorld(carrier.coords.x, carrier.coords.y, 0);
    for (const obj of objects) {
        if (BENCHED(obj) || obj === carrier) continue;
        if (obj.settings.team === carrier.settings.team) continue;
        if (obj.settings.position === 'ball') continue;
        const p = simToWorld(obj.coords.x, obj.coords.y, 0);
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < reach) out.set(obj.settings.position, Math.min(1, (reach - d) / (reach * 0.6)));
    }
    return out;
}

/**
 * A BLOCK TAKES TWO, AND ONLY ONE OF THEM WAS IN IT.
 *
 * This used to pose the offensive lineman alone: he reached out and the man he
 * was reaching at ran past him with his arms swinging. A block is two players
 * with their hands on each other's shoulders, and half of that reads as neither.
 *
 * So the pairing is returned rather than a list of blockers, and BOTH ends get
 * the pose and, more importantly, get turned to face each other. A lineman
 * facing the way he last moved while wrestling somebody beside him is most of
 * why the line never looked like a line.
 *
 * ONE PARTNER EACH, and the nearest wins. A defender worked by two blockers
 * keeps whichever engagement is further along, because he can only be leaning
 * on one man at a time and the closer one is the one he is leaning on.
 */
export function blockersEngaged(objects) {
    const out = new Map();
    const reach = CFG.pose.block.reach;
    const foes = objects.filter((o) => !BENCHED(o) && o.settings.team === 1);
    if (!foes.length) return out;

    const hold = (position, amount, against) => {
        const had = out.get(position);
        if (!had || amount > had.amount) out.set(position, { amount, against });
    };

    for (const obj of objects) {
        if (BENCHED(obj) || !/^x\d$/.test(obj.settings.position)) continue;
        let nearest = Infinity;
        let partner = null;
        const p = simToWorld(obj.coords.x, obj.coords.y, 0);
        for (const foe of foes) {
            const q = simToWorld(foe.coords.x, foe.coords.y, 0);
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            if (d < nearest) { nearest = d; partner = foe; }
        }
        // Full commitment at half the reach, nothing at all beyond it.
        const amount = nearest >= reach ? 0
            : Math.min(1, (reach - nearest) / (reach * 0.5));
        if (amount <= 0 || !partner) continue;
        hold(obj.settings.position, amount, partner.settings.position);
        hold(partner.settings.position, amount, obj.settings.position);
    }
    return out;
}

/**
 * WHO IS GOING UP FOR THE BALL, AND HOW COMMITTED THEY ARE.
 *
 * QA ITEM 5: a receiver should put his hands on a pass rather than have it
 * arrive at his hip. The pose itself is in roster.js and the arithmetic is in
 * arm.js; this decides who is doing it and by how much.
 *
 * A RECEIVER GOES FOR ANY BALL IN THE AIR NEAR HIM, on the grounds that the
 * only ball in the air was thrown at somebody, and a defender only goes for one
 * he could plausibly get to. That difference is what stops a whole secondary
 * waving its arms at a pass sailing over their heads on the far hash.
 *
 * Read from the ball's DRAWN position rather than its simulated one, which is
 * the same lesson as the stride: `flight` carries the arc the visitor can
 * actually see, including its height, and the simulation's `coords.z` is an
 * index that was never a height (see `arcHeight`).
 */
function reachersFor(objects) {
    const out = new Map();
    const C = CFG.pose.catching;
    if (!flight.has) return out;

    for (const obj of objects) {
        if (BENCHED(obj) || obj.settings.position === 'ball') continue;
        if (obj.state && obj.state.hasBall) continue;
        const receiver = obj.settings.team === 0 && /^wr\d$/.test(obj.settings.position);
        const defender = obj.settings.team === 1;
        if (!receiver && !defender) continue;

        const p = simToWorld(obj.coords.x, obj.coords.y, 0);
        // Measured to the chest, because a ball six metres over a defender's
        // head is not a ball he is going up for.
        const chest = 1.0 * CFG.figureScale;
        const d = Math.hypot(p.x - flight.x, flight.y - chest, p.z - flight.z);
        const range = receiver ? C.range : C.defenderRange;
        if (d >= range) continue;
        out.set(obj.settings.position,
            Math.min(1, Math.max(0, (range - d) / Math.max(0.01, range - C.close))));
    }
    return out;
}

/**
 * THE TACKLE, WHICH IS AN EVENT AND HAS ITS OWN CLOCK.
 *
 * Started by main.js at the whistle rather than inferred from a distance,
 * because the distance never arrives: measured, the nearest defender at the
 * whistle is a median 1.85m away and the old proximity trigger fired on none of
 * 84 tackles (see takedown.js). The names are positions, so the same call works
 * on a live play and on a frame rebuilt from the recording.
 */
const takedown = { at: -1, tackler: '', carrier: '', from: null, to: null };

export function beginTakedown(tacklerPos, carrierPos) {
    if (!tacklerPos || !carrierPos) return false;
    if (takedown.tackler === tacklerPos && takedown.carrier === carrierPos
        && takedown.at >= 0) return false;
    takedown.at = 0;
    takedown.tackler = tacklerPos;
    takedown.carrier = carrierPos;
    // Where each of them was standing when it started. Held, so the dive runs
    // from a fixed point even though `syncFigures` keeps being handed the
    // simulation's last frame over and over.
    takedown.from = null;
    takedown.to = null;
    return true;
}

/** Where the two of them were standing when it started, latched on the first
 *  frame. The simulation has stopped by then, so these never change, but
 *  reading them once means the dive cannot be restarted by a caller that hands
 *  over the same frame twice. */
function takedownFrom(objects) {
    if (!takedown.from) {
        const o = objects.find((x) => x.settings.position === takedown.tackler);
        takedown.from = o ? simToWorld(o.coords.x, o.coords.y, 0) : { x: 0, y: 0, z: 0 };
    }
    return takedown.from;
}

function takedownTo(objects) {
    if (!takedown.to) {
        const o = objects.find((x) => x.settings.position === takedown.carrier);
        takedown.to = o ? simToWorld(o.coords.x, o.coords.y, 0) : { x: 0, y: 0, z: 0 };
    }
    return takedown.to;
}

export function resetTakedown() {
    takedown.at = -1;
    takedown.tackler = '';
    takedown.carrier = '';
    takedown.from = null;
    takedown.to = null;
}

/** How far into the tackle we are, in seconds, or -1 when there is not one. */
export function takedownClock() {
    return takedown.at;
}

/**
 * HOW HIGH A STANDING RECEIVER'S FINGERTIPS GET, in world metres.
 *
 * Measured off the rig rather than written down, so it follows the shared part
 * if its proportions ever move: the shoulder's own height plus both arm
 * segments, at figure scale, plus the lift that puts his shoes on the grass.
 * That is a man standing with his hands straight up, which is the line a ball
 * has to be above before leaving the ground is worth anything.
 */
function standingReach() {
    return (RIG.shoulderY + RIG.upper + RIG.lower) * CFG.figureScale + FIGURE_LIFT;
}

/**
 * GOING UP FOR THE BALL. Returns the metres this figure is off the ground.
 *
 * KEYED TO THE DRAWN BALL AND NOTHING ELSE, which is the whole difference
 * between this and the version that was built and thrown away (D149). `flight`
 * carries where the ball really is and how high it really is, because view.js
 * solves the arc from the throw's own start and target rather than trusting the
 * simulation's index. So the question this asks is the one a person would: is
 * the ball close, and is it over my hands.
 *
 * IT REPRODUCES IN A REPLAY FOR FREE. Playback rebuilds the ball from the
 * recording and this file recomputes the same arc from it, so the same receiver
 * leaves the ground on the same frame without anything having been stored.
 *
 * ONCE HE HAS GONE HE IS COMMITTED, because a jump you can call off is not a
 * jump. The pose needs no help: `catching` already solves his hands onto the
 * ball, so the arms follow it up on their own.
 */
function updateJump(figure, reach, at, live, delta) {
    const J = CFG.pose.jump;
    const u = figure.userData;
    if (u.jumpAt === undefined) u.jumpAt = -1;

    if (u.jumpAt >= 0) {
        u.jumpAt += delta;
        const t = u.jumpAt / J.hang;
        if (t >= 1) { u.jumpAt = -1; return 0; }
        // Up and down once. A sine rather than a parabola, because the hang at
        // the top is the part anybody actually reads.
        return Math.sin(Math.PI * t) * J.lift;
    }

    // FULLY COMMITTED, NOT MERELY INTERESTED. `reachersFor` ramps from
    // `catching.range` at 8m, which on a field with four receivers means
    // somebody is always mildly interested in the ball.
    if (!live || !(reach >= 1) || !flight.has) return 0;
    if (Math.hypot(flight.x - at.x, flight.z - at.z) > J.range) return 0;
    const top = standingReach();
    // Clearly OVER HIS HEAD, and not so far over that no jump would get there.
    // The clearance is what makes this rare: see the note in config.
    if (flight.y < top + J.clearance || flight.y > top + J.lift) return 0;
    u.jumpAt = 0;
    return 0;
}

/** Nobody is in the air between plays. */
function clearJump(figure) {
    figure.userData.jumpAt = -1;
}

/**
 * HAS THIS FIGURE STOPPED GETTING ANYWHERE?
 *
 * NOT "IS HE SLOW", WHICH IS THE QUESTION `mps` ANSWERS AND THE WRONG ONE. A
 * receiver at the end of his route orbits a small circle at full speed, so his
 * speed clears the heading deadzone comfortably the whole time he is going
 * nowhere. That is why the deadzone never stopped the spin. NET displacement
 * over a window can tell the two apart, and it is measured on the position
 * actually DRAWN, so it reads the same during a replay, where the objects are
 * rebuilt from six floats a frame and nothing knows what a route was.
 *
 * The history is a flat array of x, z pairs on the figure's own userData,
 * trimmed to the window, so it costs one push and one compare a frame.
 */
function updateStanding(figure, delta) {
    const S = CFG.pose.standing;
    const span = Math.max(1, Math.round(S.window / Math.max(delta, 1e-4)));
    const ring = figure.userData.track || (figure.userData.track = []);
    const at = figure.userData.at;
    ring.push(at.x, at.z);
    while (ring.length > (span + 1) * 2) ring.splice(0, 2);
    if (ring.length <= span * 2) return false;
    return Math.hypot(at.x - ring[0], at.z - ring[1]) < S.net;
}

/**
 * Move every figure to where the simulation says its player is.
 *
 * Called once per frame after play.tick(). Benched players are hidden rather
 * than moved, because the library parks them ten thousand units away and a
 * figure out there is both invisible and a waste of a draw call.
 *
 * `opts.presnap` freezes everybody facing the other team, which is QA item 12
 * and is what a huddle breaking actually looks like. `opts.live` says the play
 * is running, and it gates the standing pose: after the whistle everybody is
 * standing, and a receiver putting his hands up over a finished play would be
 * asking for a ball nobody is going to throw.
 */
export function syncFigures(objects, delta = 1 / 60, opts = {}) {
    // The snap's own clock, advanced once a frame whatever else is happening.
    if (snapAt.t >= 0) snapAt.t += delta;
    const snapped = snapProgress();
    const engaged = blockersEngaged(objects);
    const carrier = objects.find((o) => o.state && o.state.hasBall && !BENCHED(o));
    noteAssignments(objects);
    const tacklers = tacklersOn(objects, carrier);
    const reaching = reachersFor(objects);
    noteThrowRelease(objects, carrier, delta);

    // The tackle's own clock, advanced once whatever else is happening.
    if (takedown.at >= 0) takedown.at += delta;
    const hit = takedown.at >= 0
        ? takedownAt(takedown.at, takedownFrom(objects), takedownTo(objects))
        : null;

    for (const obj of objects) {
        const figure = figureFor(obj.settings.position);
        if (!figure) continue;
        if (BENCHED(obj)) {
            figure.visible = false;
            // A benched player's letter must not sit on the grass with nobody
            // standing on it.
            hideMarker(obj.settings.position);
            continue;
        }

        // THE DRAWN POSITION EASES TOWARD THE SIMULATED ONE, and that is what
        // turns stepped motion into movement. The simulation advances on a
        // fixed clock while this runs once per rendered frame, so a figure held
        // one position for two or three frames and then jumped: correct, and it
        // reads as a slideshow. Fifty milliseconds of lag is invisible from
        // sixty metres and the judder is not.
        //
        // A figure arriving for the first time, or one coming back off the
        // bench, is PLACED rather than eased, or it slides across the field
        // from wherever the last play left it.
        const target = simToWorld(obj.coords.x, obj.coords.y, 0);
        const held = figure.visible ? figure.userData.at : null;
        // A figure arriving for a new play brings no history with it. Keeping
        // the last play's would have him judged to be standing still on the
        // strength of where he was when the last whistle went.
        if (!held) { figure.userData.track = null; clearJump(figure); }
        const ease = 1 - Math.exp(-delta / CFG.pose.motionSmooth);
        const p = held
            ? { x: held.x + (target.x - held.x) * ease, z: held.z + (target.z - held.z) * ease }
            : { x: target.x, z: target.z };

        // HOW FAST HE IS ACTUALLY GOING, MEASURED FROM WHERE HE ACTUALLY WENT.
        //
        // Reading `state.xSpeed` and `state.ySpeed` cannot work, because those
        // are the simulation's own fields and stop being true the moment it
        // stops ticking: at the whistle fourteen of fifteen players still carry
        // a speed above the stride threshold while standing perfectly still.
        // Differencing the position cannot lie about that.
        //
        // BUT THE RAW DIFFERENCE IS UNUSABLE, AND THAT IS WHAT MADE THE ARMS
        // GLITCH. The simulation steps at 45Hz on a fixed clock while this runs
        // once per RENDERED frame, so on a 60Hz display a quarter of frames see
        // no step at all and on a 120Hz display three fifths of them do not.
        // Those frames measure zero movement, so the swing amplitude collapsed
        // to nothing and sprang back on the next frame, forty times a second.
        // The stride PHASE was fine, because distance accumulates correctly
        // however it arrives; it was the amplitude that strobed.
        //
        // So the distance is exact and the SPEED is smoothed. A tenth of a
        // second is long enough to bridge two missing steps at 120Hz and short
        // enough that a player who stops still drops his arms within a stride.
        const prev = figure.userData.at;
        const stepX = prev ? p.x - prev.x : 0;
        const stepZ = prev ? p.z - prev.z : 0;
        const moved = Math.hypot(stepX, stepZ);
        figure.userData.at = { x: p.x, z: p.z };

        const raw = delta > 0 ? moved / delta : 0;
        if (figure.userData.mps === undefined) figure.userData.mps = 0;
        figure.userData.mps += (raw - figure.userData.mps)
            * (1 - Math.exp(-delta / CFG.pose.speedSmooth));

        // AND WHETHER HE IS GETTING ANYWHERE, WHICH IS A DIFFERENT QUESTION.
        // A man circling a half-metre patch is fast and stationary at the same
        // time (see `updateStanding`). Standing beats speed: his legs stop and
        // his heading holds, because both of those are asking whether he is
        // travelling rather than how quickly he is moving.
        // A formation waiting on the snap carries no history into the play. It
        // would otherwise be the LAST play's, and a receiver would spend the
        // first half second of this one being judged against where he was
        // standing when the last whistle went.
        if (opts.presnap) figure.userData.track = null;
        const standing = !opts.presnap && updateStanding(figure, delta);
        const mps = (standing || figure.userData.mps < CFG.pose.stillSpeed)
            ? 0 : figure.userData.mps;

        // THE TACKLE MOVES HIM, AND NOTHING ELSE IN THIS FILE DOES. Every other
        // figure is drawn exactly where the simulation put him; these two are
        // drawn where the tackle is carrying them, which is the only motion in
        // the game the simulation does not own (see takedown.js for why).
        const isTackler = !!hit && obj.settings.position === takedown.tackler;
        const isFloored = !!hit && obj.settings.position === takedown.carrier;
        const role = isTackler ? hit.tackler : (isFloored ? hit.carrier : null);

        // GOING UP FOR IT, which is the one other thing that lifts a figure off
        // the grass. Offensive receivers only: a whole secondary leaving its
        // feet on every pass is a different game.
        const airborne = (obj.settings.team === 0
            && /^wr\d$/.test(obj.settings.position) && !role)
            ? updateJump(figure, reaching.get(obj.settings.position) || 0,
                { x: p.x, z: p.z }, opts.live, delta)
            : 0;

        // AND HIS FEET GO ON THE GRASS, NOT THROUGH IT. The rig stands itself
        // at y = 0.055 because its shoes hang below its own origin, and writing
        // a flat zero here buried every player on the field to the ankle.
        figure.position.set(
            p.x + (role ? role.x : 0),
            FIGURE_LIFT + (role && role.y ? role.y : 0) + airborne,
            p.z + (role ? role.z : 0)
        );

        // WATCHING SOMEBODY BEATS RUNNING SOMEWHERE. A corner shadowing his
        // receiver has his eyes on the receiver, not on his own feet, and the
        // library says who that is.
        // A QUARTERBACK READING COVERAGE NEVER TURNS HIS BACK ON IT. He drops
        // back, which is movement AWAY from the receivers, so facing the way he
        // is going spins him round to look at his own end zone at exactly the
        // moment the visitor needs to see him looking downfield. He backpedals
        // instead: pinned downfield for as long as he is holding it and still
        // looking to throw. The moment he tucks it and runs he is a runner
        // again and faces where he is going like everybody else.
        //
        // AND BEFORE THE SNAP EVERYBODY FACES THE OTHER TEAM, which is QA item
        // 12 and is simply what a football team lining up looks like. It needed
        // saying because nothing else here would ever say it: a figure standing
        // still is not moving, so `targetFacing` declines to re-aim him and he
        // keeps whatever heading the LAST play left him with. Two plays in, the
        // pre-snap formation was eleven men looking in eleven directions.
        //
        // A defender's coverage assignment is a fine thing to face DURING a
        // play and wrong before one: it had corners standing at the line with
        // their backs to the ball.
        const downfield = obj.settings.team === 0 ? Math.PI / 2 : -Math.PI / 2;
        const surveying = carrier === obj && carryFor(obj, carrier) === 'throw';
        const engagement = engaged.get(obj.settings.position) || null;
        const look = (opts.presnap || surveying)
            ? null
            : lookTarget(obj, objects, carrier, p, standing,
                engagement ? engagement.against : '');
        const want = opts.presnap ? downfield
            : (surveying ? Math.PI / 2
                : (look ? Math.atan2(look.x - p.x, look.z - p.z)
                    // A MAN GOING NOWHERE KEEPS THE HEADING HE HAD. Passing a
                    // zeroed `mps` here is what stops the spin: the deadzone
                    // was never crossed by a slow player, it was crossed by a
                    // fast one running in a circle.
                    : targetFacing(stepX, stepZ, mps)));
        if (want !== null) figure.userData.facing = want;
        else if (figure.userData.facing === undefined) {
            figure.userData.facing = downfield;
        }
        if (!figure.visible) {
            // First placement after a line-up: arrive facing the right way
            // rather than swinging round from wherever the last play left them.
            figure.rotation.y = figure.userData.facing;
        } else {
            const turn = wrapAngle(figure.userData.facing - figure.rotation.y);
            figure.rotation.y += turn * (1 - Math.exp(-delta * TURN_RESPONSE));
        }

        // STRIDE ADVANCES WITH DISTANCE COVERED, and now it genuinely does.
        //
        // The old line claimed exactly this and then wrote
        // `phase += 0.02 + speed * 0.103` once per RENDERED FRAME, which is a
        // rate per frame rather than per metre. Two faults fell out of it. A
        // 120Hz display swung the arms at twice the rate of a 60Hz one for the
        // same run, which is why they looked too fast on a Mac. And the
        // constant 0.02 plus a stale speed field kept the phase turning while
        // a player stood still after the whistle.
        //
        // Multiplying the metres actually travelled is frame-rate independent
        // for free, and a player who has not moved advances no phase at all.
        figure.userData.phase += moved * CFG.pose.stridePerMetre;
        const lunge = tacklers.get(obj.settings.position) || 0;

        /**
         * GOING DOWN, WHICH IS NOW SOMETHING THAT HAPPENED RATHER THAN
         * SOMETHING INFERRED.
         *
         * The previous version watched how close the nearest defender was and
         * knocked the carrier over past a threshold. It never fired: measured
         * over 84 tackles the nearest defender at the whistle was a median of
         * 1.85m away against a trigger that needed 1.25m, and it crossed it on
         * NONE of them. The lean was nine degrees. That is QA item 3, twice
         * reported, and it was never going to be visible.
         *
         * `takedown.js` owns it now, driven off the whistle, and it applies to
         * exactly two men. Everybody else stands where they stopped.
         */
        const down = isFloored
            ? Math.min(1, Math.abs(role.lean) / Math.abs(CFG.pose.takedown.carrierLean))
            : 0;

        // The hands go to the ball, as a point in this figure's own space. Done
        // here rather than in roster.js because it is the one pose that needs
        // to know where the figure is standing and which way it is facing.
        const reach = reaching.get(obj.settings.position) || 0;
        const reachAt = reach > 0
            ? toRigSpace({ x: flight.x, y: flight.y, z: flight.z },
                figure.position, figure.rotation.y, CFG.figureScale)
            : null;

        // ASKING FOR IT. A receiver who has stopped getting anywhere while the
        // play is still running has finished his route, so he turns back to
        // whoever has the ball (above) and puts his hands up. Gated on the
        // play being live, or every receiver would raise his arms over a
        // finished play while the result card opened.
        const posting = (opts.live && standing && obj.settings.team === 0
            && /^wr\d$/.test(obj.settings.position) && carrier !== obj) ? 1 : 0;

        poseFigure(figure, mps, figure.userData.phase, {
            carry: carryFor(obj, carrier),
            throwT: throwProgress(obj),
            snapT: snapped,
            block: engagement ? engagement.amount : 0,
            tackle: isTackler ? 1 : lunge,
            reach,
            reachAt,
            posting,
            down,
        }, delta);

        // THE LEAN, WHICH IS THE WHOLE FIGURE, because the rig has no waist.
        // A tackler pitches forward into the hit and the man being hit goes
        // over backwards. `rotation.order` is YXZ so this happens on the
        // figure's own axis AFTER the yaw: on the default XYZ a defender facing
        // across the field would tip sideways instead of forward.
        //
        // A TACKLE IS APPLIED WHOLE, AND EVERYTHING ELSE EASES. The takedown is
        // already a timed animation with its own easing, so blending it a
        // second time turns a hit into a lean, which is exactly what the last
        // version looked like. A defender merely closing still eases.
        if (role) {
            figure.rotation.x = role.lean;
        } else {
            // AND A QUARTERBACK UNDER CENTRE IS BENT OVER THE BALL. The rig
            // has no waist, so this is the whole figure tipping about its own
            // feet, which is the same thing the tackle does with a much bigger
            // number. It unwinds across the snap along with the arms.
            const ready = surveying
                ? CFG.pose.underCentre.lean * (1 - snapped) : 0;
            const pitch = lunge > 0 ? CFG.pose.tackle.lean * lunge : ready;
            const rate = lunge > 0 ? CFG.pose.tackle.snap : CFG.pose.blend;
            figure.rotation.x += (pitch - figure.rotation.x)
                * (1 - Math.exp(-delta / rate));
        }

        figure.visible = true;

        // The marker slides under the feet. It is NOT a child of the figure,
        // so it keeps its own orientation and a letter stays the right way up
        // however the receiver turns (see markers.js).
        //
        // markers.js does the placing rather than this file writing to a mesh
        // position, because a named marker's ring is not at the centre of its
        // own plane and where the plane has to sit to put the ring on a pair of
        // feet is a fact about the texture layout.
        //
        // It follows a man being tackled, because a letter left standing on the
        // spot he was hit at while he goes over backwards reads as him having
        // left his own shadow behind.
        placeMarker(obj.settings.position,
            p.x + (role ? role.x : 0), p.z + (role ? role.z : 0));
    }
}

/**
 * Place the ball.
 *
 * Before a throw it rides in the carrier's hands, which is a fixed offset off
 * that figure rather than anything the simulation models. In flight it uses
 * its own sim object, whose `coords.z` is the arc getZIndex produced.
 */
/**
 * The ball's own state between frames.
 *
 * THE VELOCITY IS MEASURED, NOT READ. The obvious source is the sim object's
 * `xSpeed` and `ySpeed`, and that is what the old version used, but those are
 * the two HORIZONTAL components only. The whole vertical arc lives in
 * `coords.z`, produced by `routes.getZIndex`, and there is no `zSpeed` to go
 * with it. So a ball aimed from the state fields is always dead level, however
 * steeply it is climbing, which is the reported "slope and angle do not match
 * the trajectory".
 *
 * Differencing the world position picks up all three axes and needs nothing
 * from the simulation, which also means it works unchanged during a replay,
 * where the objects are rebuilt from a recording and their speed fields are
 * whatever they were when recorded.
 */
const flight = {
    x: 0, y: 0, z: 0, has: false, spin: 0, dir: { x: 1, y: 0, z: 0 },
    height: undefined, span: null,
    /** Seconds the ball has not moved for, and the clock on its landing.
     *  THE LANDING IS DETECTED, NOT SIGNALLED, for the same reason the throw
     *  release is (D90): nothing in the simulation announces it, the ball
     *  simply stops, and reading it here means it also happens in a replay. */
    still: 0, rest: -1, restFrom: 0, restHeading: null,
};

/** Where the ball is on its way from a catch into the tuck. A caught ball that
 *  teleports to a hip is a ball nobody saw anyone catch. */
const gather = { at: -1, from: { x: 0, y: 0, z: 0 } };

/** Turns per second of a thrown ball. A real spiral is nearer 10, which at
 *  60Hz aliases into a slow backwards crawl. This is the fastest rate that
 *  still reads as spin rather than as strobing. */
const SPIRAL_HZ = 3.2;

/** The end of one flight, which happens every frame the ball is in somebody's
 *  hands. Kept separate from the per-play reset below so a catch does not wipe
 *  the gather it just started. */
function endFlight() {
    flight.has = false;
    flight.spin = 0;
    flight.dir = { x: 1, y: 0, z: 0 };
    flight.height = CFG.ball.release;
    flight.span = null;
    flight.still = 0;
    flight.rest = -1;
    flight.restHeading = null;
}

/** Reset between plays, so a new throw does not inherit the last one's
 *  heading for its first frame. */
export function resetBallFlight() {
    endFlight();
    gather.at = -1;
    resetThrow();
    // And put the quarterback back under centre, or the next formation lines
    // up with a man already wound up to throw.
    resetSnapMotion();
}

/**
 * HOW HIGH A BALL THAT HAS ALREADY LANDED IS, which is QA item 6.
 *
 * An incomplete pass used to finish its flight at `release` height and simply
 * stop there, still pointing wherever it was last travelling, still spiralling.
 * Its last measured heading is nearly straight down, so what a visitor saw was
 * a football standing on its nose in mid-air, turning. That is the screenshot.
 *
 * A real one hits, takes a bounce or two off the point, and finishes lying on
 * its side. This is that, in one curve: a fall under gravity rather than a
 * lerp, two bounces each shorter than the last, and then nothing.
 */
export function landingHeight(t, fromY) {
    const L = CFG.ball.landing;
    const rest = BALL_FAT * CFG.ballScale;
    if (t < L.drop) {
        const u = t / L.drop;
        return fromY + (rest - fromY) * u * u;
    }
    let after = t - L.drop;
    let amp = L.hop;
    let span = L.bounce;
    for (let i = 0; i < 2; i += 1) {
        if (after < span) return rest + Math.sin(Math.PI * (after / span)) * amp;
        after -= span;
        amp *= 0.38;
        span *= 0.62;
    }
    return rest;
}

/** How long a landing takes, so a caller can hold the frame for it. */
export function landingLength() {
    const L = CFG.ball.landing;
    return L.drop + L.bounce * (1 + 0.62);
}

/**
 * HOW HIGH THE BALL IS, FROM AN INDEX THAT WAS NEVER A HEIGHT.
 *
 * `routes.getZIndex` climbs 1, 1.5, 2 ... to a ceiling of 7 and back down, and
 * the 2D renderer used it to SCALE a drawn ellipse, which is how a flat plan
 * view fakes altitude. This module was handing it to `simToWorld` as though 7
 * meant seven field units, and seven field units is 0.245 metres. The entire
 * arc of a pass was twenty-four centimetres, and a `Math.max(p.y, 0.2)` floor
 * then squeezed it to four. That is why the ball could not be seen in the air
 * and why it appeared to travel in a straight line: it was skimming the grass
 * behind everybody's legs, and it was straight.
 *
 * THE TRIANGLE BECOMES A PARABOLA IN CLOSED FORM, without moving a frame.
 * routes.js asks for exactly this: "keep its timing when the crude ramp is
 * eventually replaced by a real parabola, so catches land on the frame they
 * land on today." Normalise the index to u = (z - 1) / 6 and it is a triangle
 * over the flight, u = 2p going up and 2(1 - p) coming down. A real arc is
 * 4p(1 - p); substituting p = u / 2 gives 2u - u², which is 1 - (1 - u)². So
 * the shape is a function of the index the simulation already produces, every
 * catch still lands on its own frame, and routes.js was not touched.
 *
 * Smoothed on the way out because the index steps in halves at 45Hz, and an
 * unsmoothed climb is a visible staircase.
 */
function arcHeight(ballObj, delta) {
    const B = CFG.ball;
    let want;

    // THE BALL KNOWS WHERE IT WAS THROWN FROM AND WHERE IT IS GOING, which is
    // better than the index for two reasons. The index CLAMPS at 7, so on 73 of
    // 99 measured throws it saturates a third of the way up and the ball cruises
    // dead level across the top of its own arc. And it says nothing about how
    // far the pass is: real progress does, so a flick stays a bullet and a deep
    // ball climbs, which is what routes.js says the ramp was reaching for.
    //
    // A CATCH STILL LANDS ON ITS OWN FRAME, because progress reaches 1 exactly
    // when the ball reaches the target, and the target is where the catch is
    // tested. Nothing in routes.js moved.
    const c = ballObj.coords;
    const span = flightSpan(c);
    if (span) {
        const gone = Math.hypot(c.x - span.sx, c.y - span.sy);
        const p = Math.min(1, Math.max(0, gone / span.total));
        want = B.release + 4 * p * (1 - p) * B.apex * span.reach;
    } else {
        // No span means a replay frame whose recording predates the throw being
        // seen, so fall back to the index. Correct shape, flat top.
        const u = Math.min(1, Math.max(0,
            ((c.z || B.indexFloor) - B.indexFloor) / (B.indexCeil - B.indexFloor)));
        want = B.release + (1 - (1 - u) * (1 - u)) * B.apex;
    }

    if (flight.height === undefined) flight.height = want;
    const rate = B.smooth > 0 ? 1 - Math.exp(-delta / B.smooth) : 1;
    flight.height += (want - flight.height) * rate;
    return flight.height;
}

/**
 * The throw's start, target and length, cached the first time it is seen.
 *
 * THE RECORDER DOES NOT STORE THEM. `replay.frameAt` rebuilds each object from
 * six floats, which is position and speed and nothing else, so during playback
 * the ball has no idea where it was aimed. Caching the live values means a
 * replay draws the same arc as the play it recorded, without widening a buffer
 * that is already 260KB a play. `resetBallFlight` clears it between plays.
 */
function flightSpan(c) {
    if (flight.span) return flight.span;
    if (!(c.startX !== undefined && c.targetX !== undefined)) return null;
    const total = Math.hypot(c.targetX - c.startX, c.targetY - c.startY);
    if (!(total > 0)) return null;
    flight.span = {
        sx: c.startX,
        sy: c.startY,
        total,
        // HOW HIGH THIS PARTICULAR THROW GOES. Measured, the library's passes
        // run from 1.5m to 13.5m with a median of 7.2m, and its own ramp keeps
        // the shortest six of ninety-nine flat on the deck. Scaling the apex by
        // length keeps that: a flick is a bullet and only a genuinely deep ball
        // reaches the top of the arc.
        reach: Math.min(1, (total * UNITS_TO_METRES) / CFG.ball.fullArcAt),
    };
    return flight.span;
}

/**
 * A POINT IN A FIGURE'S OWN SPACE, PUT WHERE THAT FIGURE ACTUALLY IS.
 *
 * THIS IS QA ITEM 6, AND THE MISSING TERM IS THE PITCH. The held ball used to
 * be placed with the figure's YAW and nothing else, and its height written
 * flat as `FIGURE_LIFT + y * scale`. That is correct for a man standing up and
 * wrong for every other thing this game does to a body. A tackled carrier goes
 * over backwards through `rotation.x`, so the ball stayed at standing chest
 * height in the air above him while he lay on the grass, which is exactly the
 * "he drops the ball, or it hangs there" report. The quarterback's new
 * under-centre lean would have done the same thing on every single snap.
 *
 * The rig's rotation order is YXZ, so a local point is pitched about x FIRST
 * and then turned about y, and doing those two the other way round puts the
 * ball out to the side of a man lying on his back. `figure.position` carries
 * the lift and the tackler's leap, so it is read rather than reconstructed.
 *
 * `direction` skips the translation, for aiming rather than placing.
 */
export function toWorld(figure, v, direction = false) {
    const s = CFG.figureScale;
    const pitch = figure.rotation.x || 0;
    const yaw = figure.rotation.y || 0;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y = v.y * cp - v.z * sp;
    const z = v.y * sp + v.z * cp;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (direction) {
        return { x: v.x * fz + z * fx, y, z: -v.x * fx + z * fz };
    }
    return {
        x: figure.position.x + (v.x * fz + z * fx) * s,
        y: figure.position.y + y * s,
        z: figure.position.z + (-v.x * fx + z * fz) * s,
    };
}

/**
 * WHERE THE BALL SITS AND WHICH WAY IT POINTS, in the rig's own space.
 *
 * THE SNAP IS AN INTERPOLATION AND NOT A SWITCH, which is QA item 1. Before
 * it, the quarterback holds it out in front in both hands; after it, back and
 * up beside his ear. Both ends are written in `config.pose`, both are read
 * through the same `snapT` the ARMS are read through, so the ball is carried
 * by the hands rather than merely arriving at the same time as them.
 *
 * `x` is mirrored onto the throwing side here, once, in the same way the poses
 * in roster.js mirror a hand.
 */
export function carryHold(mode, snapped) {
    const P = CFG.pose;
    const side = THROWING_SIDE;
    const put = (spot, aim) => ({
        ball: { x: side * spot.x, y: spot.y, z: spot.z },
        aim: { x: side * aim.x, y: aim.y, z: aim.z },
    });
    if (mode !== 'throw') return put(P.tuck.ball, P.tuck.aim);

    const from = P.underCentre;
    const to = P.throwHold;
    const t = Math.min(1, Math.max(0, snapped));
    const mix = (a, b) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    });
    return put(mix(from.ball, to.ball), mix(from.aim, to.aim));
}

export function syncBall(ballObj, carrier, delta = 1 / 60) {
    const ball = getBall();
    if (!ball) return;

    if (ballObj && !BENCHED(ballObj)) {
        const p = simToWorld(ballObj.coords.x, ballObj.coords.y, 0);

        // HAS IT STOPPED? A ball still travelling covers ground every frame;
        // one that has arrived and not been caught covers none, because the
        // simulation has blown its whistle and is no longer ticking. Two
        // frames' worth of stillness is the cue, and it reads identically
        // during playback, where the playhead simply runs out.
        const moved = flight.has ? Math.hypot(p.x - flight.x, p.z - flight.z) : 1;
        flight.still = moved < CFG.ball.landing.stillStep
            ? flight.still + delta : 0;
        if (flight.rest < 0 && flight.still > CFG.ball.landing.stillFor) {
            flight.rest = 0;
            flight.restFrom = flight.y;
            // The way it was going, flattened. A ball lands on the heading it
            // arrived on and then lies along it, which is also why it must be
            // taken before the fall starts: by the time it is down, its only
            // measured movement is vertical.
            const h = Math.hypot(flight.dir.x, flight.dir.z);
            flight.restHeading = h > 1e-4
                ? { x: flight.dir.x / h, y: 0, z: flight.dir.z / h }
                : { x: 1, y: 0, z: 0 };
        }

        let y;
        if (flight.rest >= 0) {
            flight.rest += delta;
            y = landingHeight(flight.rest, flight.restFrom);
            // It creeps forward as it bounces, and the spiral becomes a roll
            // about the axis it is now lying on, decaying to a stop.
            const L = CFG.ball.landing;
            const crept = Math.min(1, flight.rest / Math.max(0.01, landingLength()));
            const decay = Math.exp(-flight.rest / L.roll);
            flight.spin += delta * SPIRAL_HZ * Math.PI * 2 * decay;
            ball.position.set(
                p.x + flight.restHeading.x * L.creep * crept, y,
                p.z + flight.restHeading.z * L.creep * crept
            );
            aimBall(flight.restHeading, flight.spin);
            ball.visible = true;
            placeSpot(0, 0, 0, false);
            return;
        }

        y = arcHeight(ballObj, delta);
        if (flight.has) {
            const d = { x: p.x - flight.x, y: y - flight.y, z: p.z - flight.z };
            // Below a threshold the difference is rounding noise, and
            // normalising noise points the ball in a random direction every
            // frame. Under it, the last good heading is kept.
            if (Math.hypot(d.x, d.y, d.z) > 0.004) flight.dir = d;
        }
        flight.x = p.x; flight.y = y; flight.z = p.z; flight.has = true;

        flight.spin += delta * SPIRAL_HZ * Math.PI * 2;
        ball.position.set(p.x, y, p.z);
        aimBall(flight.dir, flight.spin);
        ball.visible = true;
        // Only while it is genuinely up. A ball rolling on the grass with a
        // shadow pinned under it just looks like it has a hole beneath it.
        placeSpot(p.x, y, p.z, y > 0.6);
        return;
    }

    // A CATCH IS A HANDOVER AND NOT A TELEPORT, so where the ball was in the
    // air on the last frame is worth keeping for a quarter of a second.
    const caughtFrom = flight.has ? { x: flight.x, y: flight.y, z: flight.z } : null;
    endFlight();
    placeSpot(0, 0, 0, false);

    if (carrier) {
        const figure = figureFor(carrier.settings.position);
        if (figure) {
            // WHICH CARRY, AND IT IS THE 2D GAME'S OWN THREE (see `carryFor`).
            // A quarterback surveying the field holds it up by his ear with the
            // throwing arm cocked. A quarterback who has taken off, and anybody
            // who caught it, tucks it at the hip. The pose and this offset read
            // the same answer, so the ball is always in the hand that is posed
            // to be holding it.
            const mode = carryFor(carrier, carrier);
            const hold = carryHold(mode, snapProgress());

            // THE OFFSET IS THE SAME RIG SPACE THE POSES ARE WRITTEN IN, so the
            // ball's `x` runs along the throwing side and its `z` is the way he
            // is facing, exactly as `pose.tuck.hand` does. That is what keeps a
            // ball in the hand that is posed to be holding it: the two numbers
            // are read off the same picture rather than converted between two.
            const want = toWorld(figure, hold.ball);
            const aim = toWorld(figure, hold.aim, true);

            // GATHERING IT IN. On the frame a pass is caught the ball is still
            // out in front of the receiver's hands, and jumping it to his ribs
            // is the moment the catch stops being visible. A quarter of a second
            // carries it in along the path his arms are already following.
            if (caughtFrom) { gather.at = 0; gather.from = caughtFrom; }
            let at = want;
            if (gather.at >= 0) {
                gather.at += delta;
                const t = Math.min(1, gather.at / CFG.pose.catching.gather);
                const e = t * t * (3 - 2 * t);
                at = {
                    x: gather.from.x + (want.x - gather.from.x) * e,
                    y: gather.from.y + (want.y - gather.from.y) * e,
                    z: gather.from.z + (want.z - gather.from.z) * e,
                };
                if (t >= 1) gather.at = -1;
            }

            ball.position.set(at.x, at.y, at.z);
            // AIMED IN THE SAME SPACE IT IS PLACED IN, so the heading comes
            // out of `config.pose` alongside the position rather than being a
            // second opinion assembled from the yaw. It cants up on the
            // throwing hold, lies across both hands under centre, and points
            // where the carrier is going in the tuck: three pictures, one
            // number each, all carried by the body's pitch and yaw.
            aimBall(aim, 0);
            ball.visible = true;
            return;
        }
    }
    ball.visible = false;
}

/** Where the ball is in world metres, for the camera to follow. Falls back to
 *  the middle of the field so a caller never has to null-check. */
export function focusPoint(objects) {
    const carrier = objects.find((o) => o.state && o.state.hasBall && !BENCHED(o));
    if (!carrier) return { x: FIELD.lineInterval, y: 0, z: 0 };
    const p = simToWorld(carrier.coords.x, carrier.coords.y, 0);
    return { x: p.x, y: 0, z: p.z };
}
