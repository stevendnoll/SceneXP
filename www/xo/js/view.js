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
import { XO_CONFIG as CFG, simToWorld, FIELD, SIM, UNITS_TO_METRES } from './config.min.js';
import { bandAt } from './scoring.min.js';
import { figureFor, poseFigure, THROWING_SIDE, FIGURE_LIFT } from './roster.min.js';
import { getBall, aimBall, placeSpot, BALL_FAT } from './ball.min.js';
import { placeMarker, hideMarker } from './markers.min.js';
import { toRigSpace, RIG } from './arm.min.js';
import { takedownAt } from './takedown.min.js';
import { celebrationAt } from './celebration.min.js';

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
    // ...UNLESS HE IS HOLDING IT UP, which beats all three. Asked here rather
    // than at the two call sites because `syncFigures` and `syncBall` each work
    // the carry out for themselves, and a ball that disagrees with the arm
    // holding it is the one fault this whole path exists to avoid.
    if (raisingBall(obj.settings.position) > 0) return 'raise';
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

/**
 * WHAT EACH DEFENDER WAS TOLD TO DO, latched from his route at the line-up.
 *
 * EXPORTED SO THE FACING RULES CAN BE ASKED A QUESTION. `lookTarget` reads this
 * map, so without it every test of the defense is a test of a defender who has
 * been given no assignment at all, which is the one case that was never the
 * problem.
 */
export function noteAssignments(objects) {
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
/**
 * WHERE THIS MAN IS LOOKING, or null for "the way he is going".
 *
 * EXPORTED BECAUSE IT IS PURE AND THE RULES IN IT ARE THE INTERESTING PART. It
 * takes plain simulation objects and returns a world point, so every branch can
 * be asked a question with numbers rather than being inferred from a rendered
 * frame, which is the only place any of this used to be visible.
 */
export function lookTarget(obj, objects, carrier, here, standing, blocking) {
    const at = (o) => (o ? simToWorld(o.coords.x, o.coords.y, 0) : null);

    /**
     * IS SOMEBODY RUNNING WITH IT? That is a different question from "does
     * somebody have it", and the difference is the quarterback: he holds the
     * ball from the line-up onward, so "has it" is true for most of a play
     * that has not committed to anything yet. `carryFor` already tells the two
     * apart for the carry pose, and a quarterback reading the field comes back
     * 'throw' while a man running with it comes back 'tuck'.
     *
     * Written here rather than inside the defense's branch because it is true
     * of both sides: after an interception it is the OFFENSE chasing.
     */
    const chasing = !!carrier && carrier !== obj
        && carrier.settings.team !== obj.settings.team
        && carryFor(carrier, carrier) === 'tuck';

    // A BLOCK BEATS EVERY OTHER REASON TO BE LOOKING SOMEWHERE, on both sides
    // of it. Two men with their hands on each other are looking at each other,
    // and a lineman facing the way he last happened to move while wrestling
    // somebody beside him is most of why the line did not read as a line.
    if (blocking) {
        const foe = at(objects.find((o) => o.settings.position === blocking && !BENCHED(o)));
        if (foe) return foe;
    }

    /**
     * AND A MAN RUNNING WITH THE BALL BEATS EVERY OTHER REASON TO BE LOOKING
     * SOMEWHERE. QA ROUND TWENTY-EIGHT.
     *
     * Once the play has committed, every man on the other side is watching the
     * carrier, at any distance, whatever he was told to do before the snap. It
     * used to take an assignment to beat, and only from six metres: a corner
     * covering B went on watching B while the ball was carried past him by
     * somebody else, and a blitzer went on staring at a quarterback who had
     * handed it off a second ago.
     *
     * The only thing that outranks it is the block above, which is right: a man
     * with his hands on somebody is looking at the man he has hold of.
     */
    if (chasing) {
        const c = at(carrier);
        if (c) return c;
    }

    if (obj.settings.team !== 1) {
        /**
         * A LINEMAN'S EYES ARE ON THE NEAREST DEFENDER, ALWAYS, EVEN A DISTANT
         * ONE. QA ROUND TWENTY-SEVEN, ITEM 5: "while blocking for the QB,
         * offensive linemen will sometimes turn and face toward the QB. This
         * would never happen in real NFL football."
         *
         * They did, and the cause is that an unengaged lineman fell through
         * every branch here and was left facing the way he was MOVING. Pass
         * protection is a drop back toward the quarterback, so the direction he
         * travels is the one thing he must never face: the line turned its back
         * on the rush and looked at the man it was protecting.
         *
         * `blocking` above already covers a lineman with his hands on somebody.
         * This is the other nine tenths of the job, the seconds of a play where
         * the nearest rusher is two metres away and coming, which is exactly
         * when a lineman is most obviously watching him.
         *
         * IT IS DELIBERATELY NOT CAPPED BY `turnFor`. A blocker backpedalling
         * while facing the rusher is what pass protection LOOKS like, and the
         * cap exists to stop a man being drawn sprinting backwards, which is a
         * different thing: he is not sprinting, he is retreating at walking
         * pace, and the pose is only right if he is square to the man.
         */
        if (/^x\d$/.test(obj.settings.position)) {
            let near = null;
            let best = Infinity;
            for (const foe of objects) {
                if (BENCHED(foe) || foe.settings.team !== 1) continue;
                const q = at(foe);
                const d = Math.hypot(q.x - here.x, q.z - here.z);
                if (d < best) { best = d; near = q; }
            }
            if (near) return near;
        }

        // A RECEIVER WHO HAS ARRIVED LOOKS BACK FOR THE BALL. QA item 3 asks
        // for exactly this, and it is also the only thing that makes standing
        // still read as waiting rather than as having given up: he faces
        // whoever has it, which before a throw is the quarterback.
        if (!standing || !carrier || carrier === obj) return null;
        if (!/^wr\d$/.test(obj.settings.position)) return null;
        return at(carrier);
    }

    /**
     * ...AND A MAN CLOSE ENOUGH TO MAKE THE TACKLE IS ALREADY MAKING IT, even
     * on a quarterback who is still reading and is therefore not being chased
     * by the rule above. `tacklersOn` gives him the pose at `tackle.reach`; this
     * keeps his eyes with it, because a defender lunging at somebody while
     * looking at his own receiver is the pose and the facing disagreeing.
     */
    if (carrier && carrier !== obj) {
        const c = at(carrier);
        if (c && Math.hypot(c.x - here.x, c.z - here.z) < CFG.pose.tackle.reach * 2.4) return c;
    }

    const job = watching.get(obj.settings.position);
    if (job && job.type === 'cover' && job.cover) {
        const man = at(objects.find((o) => o.settings.position === job.cover && !BENCHED(o)));
        if (man) return man;
    }

    // Whoever has it. Before a throw that is the quarterback, and a blitzer
    // wants the same answer as everybody else: he is running at the man with
    // the ball, which is what his route already does.
    if (carrier && carrier !== obj) return at(carrier);

    /**
     * ...OR THE BALL ITSELF, WHICH NOBODY WATCHED. Between the throw and the
     * catch there is no carrier at all, so a zone defender fell through every
     * branch here to `null` and faced the way his feet happened to be pointing,
     * and a blitzer went on staring at a quarterback who no longer had it.
     * Read off the ball OBJECT rather than the drawn flight so a replay, where
     * every object is rebuilt from six floats a frame, answers the same way.
     */
    const ball = objects.find((o) => o.settings.position === 'ball' && !BENCHED(o));
    if (ball) return at(ball);

    // Nothing is in the air and nobody is carrying: the play has not started.
    // He looks at the man who is about to have it.
    return at(objects.find((o) => o.settings.position === 'qb' && !BENCHED(o)));
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
 *
 * AND ONCE SOMEBODY IS CARRYING IT, THE RECEIVERS ARE BLOCKERS TOO. QA round
 * twenty-one, and it is the visible content of the run and screen plays: the
 * points depend on how the team blocks for the carrier, and downfield that is
 * the receivers doing it. There is no blocking flag in the ported simulation to
 * read, so it is derived the same way the line's is, and measured there is
 * plenty to derive: while a teammate has the ball, the nearest defender to a
 * receiver is a median 2.20m away, which is inside the lock.
 *
 * NOT AFTER AN INTERCEPTION. The carrier has to be one of ours: with the ball
 * going the other way a receiver is a tackler, and men who have just lost it
 * putting their arms up to block would read as a team that had not noticed.
 */
export function blockersEngaged(objects, carrier, presnap = false) {
    const out = new Map();
    /**
     * NOBODY HAS THEIR HANDS ON ANYBODY BEFORE THE BALL IS SNAPPED. QA ROUND
     * TWENTY-SEVEN, ITEM 4.
     *
     * This is a pure distance question, `reach` is 2.7m and `lock` is 2.3m, and
     * the line-up holds bodies about 1.45m apart. So every lineman standing
     * across from a defender came back FULLY engaged before the snap: arms out,
     * hands on each other, both men turned to face each other and leaning in. A
     * line waiting on the snap was drawn mid-block.
     *
     * The gate is the PHASE and not a distance, because the distances are
     * right: the same pair a tenth of a second later, with the ball in the air,
     * is a block and should look like one.
     */
    if (presnap) return out;
    const reach = CFG.pose.block.reach;
    const foes = objects.filter((o) => !BENCHED(o) && o.settings.team === 1);
    if (!foes.length) return out;

    const ours = !!carrier && carrier.settings.team === 0;
    const blocks = (obj) => /^x\d$/.test(obj.settings.position)
        || (ours && obj !== carrier && /^wr\d$/.test(obj.settings.position));

    const hold = (position, amount, against) => {
        const had = out.get(position);
        if (!had || amount > had.amount) out.set(position, { amount, against });
    };

    for (const obj of objects) {
        if (BENCHED(obj) || !blocks(obj)) continue;
        let nearest = Infinity;
        let partner = null;
        const p = simToWorld(obj.coords.x, obj.coords.y, 0);
        for (const foe of foes) {
            const q = simToWorld(foe.coords.x, foe.coords.y, 0);
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            if (d < nearest) { nearest = d; partner = foe; }
        }
        // FULLY LOCKED BY `lock`, NOTHING AT ALL BEYOND `reach`. It used to
        // ramp to full at half the reach, which is 1.30m, and two bodies in
        // this game are never closer than 1.45m: the pose could not finish, so
        // an engaged pair stood at 28% of a block with their hands short of
        // each other. See the note in config.
        const span = Math.max(0.01, reach - CFG.pose.block.lock);
        const amount = nearest >= reach ? 0
            : Math.min(1, (reach - nearest) / span);
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
 * THE ARM STAYS IN FRONT OF THE SHOULDER IT HANGS FROM.
 *
 * QA: a ball passing close behind a player put both his arms straight out
 * BACKWARDS, through his own back. Nothing was broken. `reachAt` is the ball
 * expressed in the figure's own space, arm.js solves for the target it is
 * handed, and no part of that chain had ever been told that a shoulder does not
 * open past square.
 *
 * The cure is a limit on the target's BEARING and not on its coordinates. A
 * clamped `z` would drag the hand in toward the chest as the ball went further
 * behind, so a receiver would appear to lose interest exactly as the ball got
 * close. Swinging the target round the limit instead keeps its distance and its
 * height, so the arm goes out to the side and stays at full stretch, which is
 * the trailing-arm reach it should have been all along.
 *
 * Mostly it does not bind: `syncFigures` turns the man toward the ball first,
 * and this catches the half second he is still turning and the man who is
 * pinned by something else.
 */
/**
 * HOW FAR ROUND HE WILL ACTUALLY TURN TO ATTEND TO SOMEBODY.
 *
 * `want` is where the thing he is attending to is, and `running` is the line he
 * is running, or null for a man who has stopped getting anywhere.
 *
 * A receiver tracking a ball over his shoulder, and a blocker squaring up to
 * the man he is on, both KEEP RUNNING THE LINE THEY WERE RUNNING. Everything
 * about how a figure looks while moving hangs off its yaw, so turning either of
 * them the whole way round would draw him travelling backwards at six metres a
 * second. Capping the turn against his running line leaves him looking hard
 * over one shoulder with his legs still carrying him along, and it costs the
 * simulation nothing: his path was never this file's to change.
 *
 * A MAN WHO HAS STOPPED TURNS ALL THE WAY ROUND, because the cap exists to
 * protect a stride and he does not have one. That is a receiver at the end of
 * his route waiting on the ball, or a lineman wrestling somebody, and both
 * should look like it.
 */
export function turnFor(want, running) {
    if (want === null || running === null) return want;
    const limit = CFG.pose.turnLimit;
    const off = wrapAngle(want - running);
    return running + (off < -limit ? -limit : (off > limit ? limit : off));
}

export function frontOf(target) {
    const limit = CFG.pose.catching.armLimit;
    const bearing = Math.atan2(target.x, target.z);
    if (Math.abs(bearing) <= limit) return target;
    const held = bearing < 0 ? -limit : limit;
    const out = Math.hypot(target.x, target.z);
    return { x: out * Math.sin(held), y: target.y, z: out * Math.cos(held) };
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
 * THE CELEBRATION, WHICH IS THE OTHER EVENT WITH ITS OWN CLOCK.
 *
 * Built exactly like the tackle above, and for the same three reasons. It is
 * STARTED by main.js at the whistle rather than inferred, because nothing in a
 * frozen world announces itself. It is keyed by POSITION, so the same plan
 * drives a live play and a replay rebuilt from six floats a frame. And its
 * offsets are applied on top of where the simulation left each man, so nothing
 * it does can disturb where the play actually finished.
 *
 * `party` is the per-frame answer, rebuilt once in `syncFigures` and read by
 * every figure in the loop plus `carryFor`.
 */
const celebration = { at: -1, plan: null };
let party = null;

export function beginCelebration(plan) {
    if (!plan || !plan.parts || !plan.parts.length) return false;
    celebration.at = 0;
    celebration.plan = plan;
    party = null;
    return true;
}

export function resetCelebration() {
    celebration.at = -1;
    celebration.plan = null;
    party = null;
}

/** How far into it we are, in seconds, or -1 when there is not one. */
export function celebrationClock() {
    return celebration.at;
}

/**
 * A TACKLER'S PITCH AND ARMS, WHICH A SACK'S CELEBRATION TAKES BACK OFF HIM.
 *
 * `lean` is the takedown's, and it holds him face down for as long as anybody
 * asks. `cheer` is his part in the party, or null. Its `stand` runs 0 to 1 as
 * he gets up, and both the pitch and the dive's arms unwind by it. Once he is
 * up, a pointing sacker's jab is his like anybody else's.
 *
 * A PURE FUNCTION rather than three lines in `syncFigures`, because the Three
 * stub swallows every assignment written onto a figure and a test could never
 * see him get up.
 */
export function sackerRise(lean, cheer) {
    const stand = cheer && typeof cheer.stand === 'number'
        ? Math.min(1, Math.max(0, cheer.stand)) : 0;
    return {
        stand,
        pitch: lean * (1 - stand) + (stand > 0 ? (cheer.lean || 0) : 0),
        tackle: 1 - stand,
    };
}

/**
 * HOW FAR THIS MAN HAS THE BALL OVER HIS HEAD, 0 to 1.
 *
 * AN AMOUNT RATHER THAN A FLAG, and that is the whole of why the ball does not
 * jump. It is the same number the ARM is being blended by, so `carryHold` can
 * carry the ball up the same curve the hand goes up. Asked by `carryFor`, which
 * is the one place both `syncFigures` and `syncBall` decide what a carry is.
 */
function raisingBall(position) {
    if (!party) return 0;
    const got = party.get(position);
    return got && got.raised === true ? (got.amount || 0) : 0;
}

/**
 * WALKING TO A NEW FORMATION, WHICH IS QA'S "CHANGE PLAY".
 *
 * Re-lining up before the snap moves every figure on the field, sometimes right
 * across it. The drawn position normally EASES toward the simulated one over
 * `motionSmooth`, which is fifty milliseconds and exists to turn a stepped 45Hz
 * feed into movement: run a ten metre relocation through it and every player
 * teleports.
 *
 * So a relocation is a TIMED transition instead, from wherever each figure was
 * actually drawn to wherever the new formation puts him, on a smoothstep so it
 * eases out of the old spot and into the new one rather than starting at full
 * speed.
 *
 * AND THE JOG COMES FOR FREE, which is the reason to do it here rather than by
 * lengthening the ease. Everything about how a figure looks while moving is
 * already derived from the position that was DRAWN: the stride phase advances
 * with distance covered, the arm swing scales with measured speed, and the
 * heading follows the movement. Move him along a curve and he runs along it.
 */
const relocate = { at: -1 };

/** Start one. Every visible figure remembers where it is standing now, and
 *  `syncFigures` carries it to wherever the new line-up put it. */
export function beginRelocate() {
    relocate.at = 0;
}

export function resetRelocate() {
    relocate.at = -1;
}

/**
 * A SHOW SENDING THE PLAYERS SOMEWHERE, which is the relocation above with the
 * destinations chosen by milestones.js rather than by a formation.
 *
 * `spots` is a Map of position to world { x, z }. Every figure named in it runs
 * from WHERE IT IS DRAWN, celebration offsets and all, to its spot, starting
 * `delay` seconds in and taking `walk` seconds, and then stays there until the
 * next line-up (`resetStaging`). Nothing in the simulation moves: this is the
 * view's own answer, the same way the tackle and the party are.
 *
 * A walk of zero is a cut, which is what somebody who asked not to be moved
 * about gets, timed to land on the camera's own cut.
 */
const staging = { at: -1, spots: null, delay: 0, walk: 0, from: new Map() };

export function beginStaging(spots, { delay = 0, walk = 0 } = {}) {
    staging.at = 0;
    staging.spots = spots instanceof Map ? spots : new Map();
    staging.delay = Math.max(0, delay);
    staging.walk = Math.max(0, walk);
    staging.from.clear();
}

export function resetStaging() {
    staging.at = -1;
    staging.spots = null;
    staging.from.clear();
}

/** 0 to 1 across the walk, eased, or -1 when there is no staging. */
export function stagingProgress() {
    if (staging.at < 0) return -1;
    if (!(staging.walk > 0)) return staging.at >= staging.delay ? 1 : 0;
    const t = Math.min(1, Math.max(0, (staging.at - staging.delay) / staging.walk));
    return t * t * (3 - 2 * t);
}

/** Where every visible figure is drawn right now, for a show to plan from. */
export function drawnSpots(objects) {
    const out = [];
    for (const obj of objects || []) {
        if (!obj || !obj.settings || obj.settings.position === 'ball' || obj.settings.benched) continue;
        const figure = figureFor(obj.settings.position);
        if (!figure || !figure.visible) continue;
        out.push({
            position: obj.settings.position,
            team: obj.settings.team,
            x: Number(figure.position.x) || 0,
            z: Number(figure.position.z) || 0,
        });
    }
    return out;
}

/** 0 to 1 across the walk, or -1 when nobody is walking. */
export function relocateProgress() {
    if (relocate.at < 0) return -1;
    const T = CFG.pose.relocate.time;
    if (!(T > 0)) return 1;
    const t = Math.min(1, relocate.at / T);
    return t * t * (3 - 2 * t);
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
/**
 * WHO THE BALL WAS THROWN AT, WHICH IS THE ONLY MAN WHO MAY JUMP FOR IT.
 *
 * MEASURED: with anybody allowed to go up, 47 of 47 jumps that ended in no
 * catch were a receiver who was not the target. The ported rule lets only the
 * intended man catch a pass, so everyone else was leaving his feet for a ball
 * he could never have, which is precisely the picture QA reported.
 *
 * It reads the throw's own target out of `flight.span` rather than being told,
 * which means it answers identically in a replay: playback carries no
 * `throwTo`, but the span survives the play and it does.
 */
let aimedAt = '';

/**
 * WHO IT WAS ACTUALLY THROWN TO, WHICH BEATS ANY AMOUNT OF INFERENCE.
 *
 * QA round twenty-four. Deriving it from the aim point was wrong 13% of the
 * time and, worse, it was derived EVERY FRAME: measured over 202 flights the
 * answer changed during 18% of them. main.js knows the answer outright, and it
 * still knows it during the replay, because the replay is always of the play
 * that just finished. `resetBallFlight` drops it at the next line-up.
 */
export function noteThrow(position) {
    aimedAt = position || '';
}

export function intendedReceiver(objects) {
    if (!flight.span || flight.span.tx === undefined) return '';
    if (aimedAt) return aimedAt;
    // NOTHING TOLD US, so fall back to the nearest man to the aim point. LATCHED
    // on the first frame of the flight rather than asked again every frame: an
    // answer that changes mid-flight is the fault this exists to avoid, and a
    // wrong answer held is a receiver jumping for a ball he will not get, while
    // a wrong answer that keeps changing leaves jumps frozen in mid-air.
    if (flight.aimed) return flight.aimed;
    const aim = simToWorld(flight.span.tx, flight.span.ty, 0);
    let best = '';
    let near = Infinity;
    for (const obj of objects) {
        if (BENCHED(obj) || obj.settings.team !== 0) continue;
        if (!/^wr\d$/.test(obj.settings.position)) continue;
        const p = simToWorld(obj.coords.x, obj.coords.y, 0);
        const d = Math.hypot(p.x - aim.x, p.z - aim.z);
        if (d < near) { near = d; best = obj.settings.position; }
    }
    flight.aimed = best;
    return best;
}

/**
 * HOW FAR OVER HIS FINGERTIPS THE BALL HAS TO BE, WHICH DEPENDS ON WHERE THE
 * PASS WAS AIMED.
 *
 * QA ROUND TWENTY: too many passes into the 15 and 30 point zones are
 * overthrown. In those bands he goes up for a ball that has only just cleared
 * his hands rather than one clearly above them, and since a man in the air is
 * excused the ported height gate, going up for it is most of the way to
 * catching it. See the measured table in config.
 *
 * IT ASKS THE LADDER RATHER THAN CARRYING ITS OWN THRESHOLDS, for the same
 * reason field.js does: two copies of where the 30 band starts is one edit away
 * from a receiver leaping in a place the paint says is worth something else.
 *
 * The target comes off `flight.span`, so a replay answers the same: playback
 * carries no throw, and the span survives the play.
 */
export function jumpClearance(span) {
    const J = CFG.pose.jump;
    const aim = span === undefined ? flight.span : span;
    if (!aim || aim.tx === undefined) return J.clearance;
    if (!Array.isArray(J.zones) || typeof J.zoneClearance !== 'number') return J.clearance;
    const band = bandAt(aim.tx, SIM.lineInterval);
    return J.zones.indexOf(band.points) === -1 ? J.clearance : J.zoneClearance;
}

/**
 * HOW FAR OFF THE GROUND A JUMP IS AT `t`, 0 to 1 of its hang, in metres.
 *
 * Up and down once. A sine rather than a parabola, because the hang at the top
 * is the part anybody actually reads.
 *
 * THE APEX IS NOT IN THE MIDDLE, AND THAT IS THE WHOLE OF QA ITEM 6. The ball
 * is inside a receiver's reach for a median of 75 milliseconds (see
 * `jump.peakAt` for the measurement), so a leaping catch in this game is always
 * taken in the first frames of the jump. With the peak halfway, that is a man
 * catching the ball at ground level and then rising for a third of a second
 * holding it. Warping the clock so the rise is short and the descent long puts
 * the catch a third of the way up instead, and the rest of the jump carries him
 * to the top and back down with it.
 *
 * The two halves are mapped onto the two halves of the same sine, so the height
 * at the apex, the height at each end and the total hang are all unchanged.
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
 * ...AND WHETHER THE SIMULATION MAY HAND HIM THE BALL YET.
 *
 * QA ROUND TWENTY-SEVEN, ITEM 6. `motion.checkCatch` gives an airborne receiver
 * a box as wide as the jump's own range in every direction and excuses him the
 * height gate, and the jump only fires when the ball is ALREADY inside that
 * range. So a man reported airborne on his first frame has the ball before he
 * has left the grass, and the rest of the hang plays out afterwards: a receiver
 * catching a pass and then leaping.
 *
 * HE WAITS FOR THE BALL TO ARRIVE RATHER THAN FOR A CLOCK. A fixed delay was
 * measured and refused (see `jump.arriveFirst`); the ball's CLOSEST APPROACH
 * costs nothing, because the nearest point of a path that came inside the box
 * is inside the box. `gap` is this frame's distance from the ball and `was` is
 * last frame's, so "it has stopped getting closer" is the whole test, and
 * `lift` carries the backstop for an arc that never turns over.
 *
 * PURE, AND THE LATCH IS THE CALLER'S. Once he is airborne he stays airborne
 * for the rest of the jump: an answer re-derived every frame would drop him out
 * of the sky the moment the ball moved away again.
 */
export function ballArrived(gap, was, lift) {
    const J = CFG.pose.jump;
    if (J.arriveFirst === false) return true;
    const back = typeof J.backstop === 'number' ? J.backstop : 1;
    if (lift >= J.lift * back) return true;
    if (!(was >= 0) || !(gap >= 0)) return false;
    return gap >= was;
}

function updateJump(figure, reach, at, live, delta) {
    const J = CFG.pose.jump;
    const u = figure.userData;
    if (u.jumpAt === undefined) u.jumpAt = -1;

    if (u.jumpAt >= 0) {
        u.jumpAt += delta;
        const t = u.jumpAt / J.hang;
        if (t >= 1) { u.jumpAt = -1; return 0; }
        return jumpLift(t);
    }

    // FULLY COMMITTED, NOT MERELY INTERESTED. `reachersFor` ramps from
    // `catching.range` at 8m, which on a field with four receivers means
    // somebody is always mildly interested in the ball.
    if (!live || !(reach >= 1) || !flight.has) return 0;
    if (Math.hypot(flight.x - at.x, flight.z - at.z) > J.range) return 0;
    const top = standingReach();
    // Clearly OVER HIS HEAD, and not so far over that no jump would get there.
    // The clearance is what makes this rare, and it is gentler in the scoring
    // zones: see `jumpClearance` and the measured table in config.
    if (flight.y < top + jumpClearance() || flight.y > top + J.lift) return 0;
    u.jumpAt = 0;
    return 0;
}

/** Nobody is in the air between plays. */
function clearJump(figure) {
    figure.userData.jumpAt = -1;
    figure.userData.upFor = false;
    figure.userData.ballGap = -1;
}

/**
 * HOW FAR INTO A BREAK HE IS, 0 to 1, WITH AN ATTACK AND A RELEASE.
 *
 * The simulation owns the clock (`play.breakContact` writes `state.escape` and
 * advances it), so this is only a shape over it. It snaps in over `snap`
 * seconds, holds, and snaps back out over the same, finishing before the grace
 * does: a man should be upright and running again before the freedom his move
 * bought him runs out, or the move reads as a stumble he never recovered from.
 *
 * `snap` is a good deal shorter than `pose.blend` on purpose. A stiff-arm that
 * eases in over a tenth of a second is a man slowly raising his hand.
 */
export function escapeAmount(escape, grace, snap) {
    if (!escape || !(grace > 0)) return 0;
    const s = Math.max(snap, 1e-4);
    const rise = escape.at / s;
    const fall = (grace - escape.at) / s;
    return Math.max(0, Math.min(1, rise, fall));
}

/**
 * WHICH WAY A JUKE LEANS, in radians on the figure's own Z.
 *
 * THE SIGN IS MEASURED, NOT REASONED ABOUT, because getting it backwards draws
 * a man leaning into the defender he is supposed to be leaving and there is no
 * way to see that from a unit test of the simulation. Checked against real
 * three r160 with `rotation.order` YXZ:
 *
 *   - local +X maps to world (cos yaw, -sin yaw)
 *   - a POSITIVE rotation.z tilts the head toward local -X
 *
 * `away` is the direction he broke in, in SIMULATION y, and sim y is world z.
 * So the break direction along his own left-right axis is -away*sin(yaw), and
 * leaning that way needs the opposite sign of rotation.z, which comes out as
 * away*sin(yaw). A runner leans INTO his cut, so this tilts him the way he is
 * going and away from the man he has just beaten.
 */
export function jukeRoll(away, facing, roll) {
    return roll * away * Math.sin(facing);
}

/** ...and which arm a stiff-arm goes out on, as an `armSide`. The defender is
 *  on the side he is NOT breaking toward, so it is the opposite sign. */
export function stiffArmSide(away, facing) {
    const at = away * Math.sin(facing);
    return at >= 0 ? 1 : -1;
}

/**
 * WHO IS OFF THE GROUND RIGHT NOW, by position.
 *
 * THE SIMULATION HAS TO KNOW, AND THIS IS HOW IT FINDS OUT WITHOUT LEARNING
 * WHAT A MESH IS. A jump that the catch does not honour is a receiver leaving
 * his feet with the ball half a metre away and coming down with nothing, which
 * is exactly what QA reported. But the decision belongs here: it is made from
 * the ball's real drawn arc and the man's real reach, neither of which the
 * simulation has.
 *
 * So the view reports and main.js carries it across as a plain flag on a plain
 * object, which keeps PLANNING D1 intact: play.js and motion.js still never
 * import THREE, and neither of them knows why somebody is airborne.
 */
const inTheAir = new Set();

export function airborne() {
    return inTheAir;
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
    if (ring.length <= span * 2) { figure.userData.still = false; return false; }
    const net = Math.hypot(at.x - ring[0], at.z - ring[1]);

    /**
     * AND IT LATCHES, WHICH IS QA ROUND TWENTY-SEVEN, ITEM 8: "when a receiver
     * puts his hands up for the ball his arms twitch up and down".
     *
     * This is a BOOLEAN READ OFF A NOISY SCALAR, which is the oldest way there
     * is to make something flicker. A receiver at the end of his route is not
     * still, he orbits a small patch (see the note above), so his net
     * displacement over the window sits right on the threshold and crosses it
     * repeatedly. Three things downstream flip with it: `posting` puts his
     * hands up, `lookTarget` turns him back toward the ball, and `turnFor`
     * stops capping his turn. The hands are simply the one you can see.
     *
     * One number cannot be both the question and its own answer, so there are
     * two: he settles at `net` and has to travel `release` before he counts as
     * going somewhere again. The gap is the whole fix, and it is a gap in
     * DISTANCE rather than in time, so a man who genuinely sets off is still
     * running within a stride.
     */
    const still = stillFor(net, figure.userData.still === true);
    figure.userData.still = still;
    return still;
}

/**
 * HAS HE STOPPED, GIVEN HOW FAR HE HAS TRAVELLED AND WHETHER HE HAD STOPPED?
 *
 * The latch itself, pure, so the property can be asserted without a figure: a
 * net displacement wandering either side of one threshold must not flip the
 * answer. Everything else about the twitch follows from this one boolean.
 */
export function stillFor(net, was) {
    const S = CFG.pose.standing;
    const leave = typeof S.release === 'number' ? S.release : S.net;
    return net < (was ? leave : S.net);
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
    // The carrier is found first because the blocks depend on him: once one of
    // ours has it, the receivers are blocking for him too.
    const carrier = objects.find((o) => o.state && o.state.hasBall && !BENCHED(o));
    const engaged = blockersEngaged(objects, carrier, !!opts.presnap);
    noteAssignments(objects);
    const tacklers = tacklersOn(objects, carrier);
    const reaching = reachersFor(objects);
    noteThrowRelease(objects, carrier, delta);

    // ...and the walk to a new formation, which has its own too.
    if (relocate.at >= 0) {
        relocate.at += delta;
        if (relocate.at > CFG.pose.relocate.time) relocate.at = -1;
    }
    // ...and a show's staging, which is held at its end rather than dropped.
    if (staging.at >= 0) staging.at += delta;
    const walking = relocateProgress();
    inTheAir.clear();
    // Only the man it was thrown at goes up for it. See `intendedReceiver`.
    const intended = intendedReceiver(objects);

    // The tackle's own clock, advanced once whatever else is happening.
    if (takedown.at >= 0) takedown.at += delta;
    const hit = takedown.at >= 0
        ? takedownAt(takedown.at, takedownFrom(objects), takedownTo(objects))
        : null;

    // ...and the celebration's, which is the same arrangement one ending over.
    // Solved ONCE for the whole field rather than per figure, because every
    // answer comes out of one clock and a plan that does not change.
    if (celebration.at >= 0) {
        celebration.at += delta;
        party = celebrationAt(celebration.at, celebration.plan);
    }

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

        // What, if anything, this man is doing about the play having just
        // ended well for his side. Null on every frame of every live play,
        // which is all but four seconds of the game.
        const cheer = party ? (party.get(obj.settings.position) || null) : null;

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
        if (!held) { figure.userData.track = null; figure.userData.still = false; clearJump(figure); }

        // WHERE HE STARTED WALKING FROM, latched on the first frame of the
        // relocation rather than read every frame: reading it every frame would
        // make the walk a chase of its own tail and never arrive.
        if (walking >= 0 && held && !figure.userData.walkFrom) {
            figure.userData.walkFrom = { x: held.x, z: held.z };
        } else if (walking < 0 && figure.userData.walkFrom) {
            figure.userData.walkFrom = null;
        }

        const from = figure.userData.walkFrom;
        const ease = 1 - Math.exp(-delta / CFG.pose.motionSmooth);
        let p;
        if (from) {
            p = {
                x: from.x + (target.x - from.x) * walking,
                z: from.z + (target.z - from.z) * walking,
            };
        } else {
            p = held
                ? { x: held.x + (target.x - held.x) * ease, z: held.z + (target.z - held.z) * ease }
                : { x: target.x, z: target.z };
        }

        // A MILESTONE SHOW HAS SENT HIM SOMEWHERE, which outranks the
        // simulation until the next line-up. See `beginStaging`.
        const spot = staging.at >= 0 && staging.spots ? (staging.spots.get(obj.settings.position) || null) : null;
        let stagedMoving = false;
        if (spot && figure.visible) {
            if (!staging.from.has(obj.settings.position)) {
                // FROM WHERE HE IS DRAWN, offsets and all, and his measured
                // position is moved there too, or the first frame of the walk
                // measures a jump and swings his arms at a sprint.
                const start = { x: figure.position.x, z: figure.position.z };
                staging.from.set(obj.settings.position, start);
                figure.userData.at = start;
            }
            const start = staging.from.get(obj.settings.position);
            const k = stagingProgress();
            p = { x: start.x + (spot.x - start.x) * k, z: start.z + (spot.z - start.z) * k };
            stagedMoving = k < 1 && Math.hypot(spot.x - start.x, spot.z - start.z) > 0.05;
        }

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

        /**
         * A CELEBRATION IS THE ONE OFFSET THAT IS REAL TRAVEL.
         *
         * The tackle moves two men and they are posed explicitly while it
         * happens, so nothing downstream needs to know they covered ground. A
         * defense breaking for the end zone is eleven men RUNNING, and the run
         * cycle in this file is derived entirely from measured movement: the
         * stride phase advances with distance and the arm swing scales with
         * speed. Measured off the simulation alone, which stopped at the
         * whistle, every one of them would glide thirteen metres with his arms
         * at his sides.
         *
         * So the offset's own step is measured the same way the simulated one
         * is, and added. It is the same lesson as `figure.userData.mps` itself:
         * measure what is DRAWN, not what is stored.
         */
        const wasCheer = figure.userData.cheerAt;
        const cheerMoved = cheer && wasCheer
            ? Math.hypot(cheer.x - wasCheer.x, cheer.z - wasCheer.z) : 0;
        figure.userData.cheerAt = cheer ? { x: cheer.x, z: cheer.z } : null;
        const travelled = moved + cheerMoved;

        const raw = delta > 0 ? travelled / delta : 0;
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
        if (opts.presnap) { figure.userData.track = null; figure.userData.still = false; }
        // A MAN RUNNING TO THE END ZONE IS NOT STANDING STILL, however little
        // the simulation thinks he has moved. `updateStanding` measures net
        // displacement of the SIMULATED position, which is frozen after the
        // whistle, so it would answer "still" for every celebrant and zero the
        // speed that the stride and the arm swing are both scaled by.
        const standing = !opts.presnap && !(cheer && cheer.running) && !stagedMoving
            && updateStanding(figure, delta);
        const mps = (standing || figure.userData.mps < CFG.pose.stillSpeed)
            ? 0 : figure.userData.mps;

        // THE TACKLE MOVES HIM, AND NOTHING ELSE IN THIS FILE DOES. Every other
        // figure is drawn exactly where the simulation put him; these two are
        // drawn where the tackle is carrying them, which is the only motion in
        // the game the simulation does not own (see takedown.js for why).
        const isTackler = !!hit && obj.settings.position === takedown.tackler;
        const isFloored = !!hit && obj.settings.position === takedown.carrier;
        const role = isTackler ? hit.tackler : (isFloored ? hit.carrier : null);
        /**
         * ...UNTIL A SACKER GETS BACK UP.
         *
         * The takedown's clock runs on after it finishes and holds him face
         * down on the quarterback for as long as anybody asks, which is right
         * for every tackle but one: after a sack his team celebrates, and he is
         * the one being celebrated. `stand` is the celebration saying how far
         * up he has got, and it unwinds the dive's pitch and the dive's arms
         * together. Nobody else has both a tackle and a party.
         */
        const rise = isTackler ? sackerRise(role.lean, cheer) : null;
        const risen = rise ? rise.stand : 0;

        // GOING UP FOR IT, which is the one other thing that lifts a figure off
        // the grass. Offensive receivers only: a whole secondary leaving its
        // feet on every pass is a different game.
        /**
         * AND NOBODY ELSE EVEN HOLDS A CLOCK.
         *
         * `clearJump` on the way past is not tidiness, it is the fix for QA
         * round twenty-four's second and third items. `updateJump` advances a
         * figure's own jump clock, so a figure that stops being eligible while
         * he is in the air keeps that clock FROZEN at whatever it held: he
         * drops to the grass on the spot, and the moment he becomes eligible
         * again it picks up where it left off and he pops back into the air,
         * out of context and sometimes with the ball already in his hands.
         * Measured before the latch above, 20 clocks a hundred plays were left
         * frozen like that.
         */
        const mayJump = obj.settings.team === 0
            && obj.settings.position === intended && !role;
        if (!mayJump) clearJump(figure);
        const airborne = mayJump
            ? updateJump(figure, reaching.get(obj.settings.position) || 0,
                { x: p.x, z: p.z }, opts.live, delta)
            : 0;
        /**
         * ...AND THE SIMULATION IS NOT TOLD HE IS UP UNTIL THE BALL GETS THERE.
         *
         * `inTheAir` feeds the ported catch box and nothing about how he is
         * drawn: the lift is applied below whatever this says, so he leaves the
         * ground on the first frame either way. What waits is the CATCH. See
         * `ballArrived`, and note the latch: once he is up he stays up for the
         * rest of the jump.
         */
        if (airborne > 0) {
            const gap = flight.has
                ? Math.hypot(flight.x - p.x, flight.z - p.z) : -1;
            if (!figure.userData.upFor) {
                figure.userData.upFor = ballArrived(gap, figure.userData.ballGap, airborne);
            }
            figure.userData.ballGap = gap;
            if (figure.userData.upFor) inTheAir.add(obj.settings.position);
        } else {
            figure.userData.upFor = false;
            figure.userData.ballGap = -1;
        }

        // AND HIS FEET GO ON THE GRASS, NOT THROUGH IT. The rig stands itself
        // at y = 0.055 because its shoes hang below its own origin, and writing
        // a flat zero here buried every player on the field to the ankle.
        figure.position.set(
            p.x + (role ? role.x : 0) + (cheer ? cheer.x : 0),
            FIGURE_LIFT + (role && role.y ? role.y : 0) + airborne
                + (cheer ? cheer.y : 0),
            p.z + (role ? role.z : 0) + (cheer ? cheer.z : 0)
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
        // A MAN WALKING TO A NEW SPOT FACES THE WAY HE IS WALKING. The pre-snap
        // rule turns everybody to face the other team, which is right for a
        // formation and wrong for the seconds it takes to get into one.
        const relocating = !!from && walking < 1;
        const downfield = obj.settings.team === 0 ? Math.PI / 2 : -Math.PI / 2;
        const surveying = carrier === obj && carryFor(obj, carrier) === 'throw';
        /**
         * AND A CELEBRATION OUTRANKS EVERY LIVE-PLAY READING.
         *
         * `blockersEngaged`, `tacklersOn` and `reachersFor` are all distances,
         * and distances do not change once the simulation stops, so a defender
         * enjoying an interception went on being measured as locked in a block
         * with his hands on somebody. Left in, the block's lean fought the
         * celebration's and the tackler's pitch won outright. Cleared here
         * rather than guarded at each of the four places they are read, because
         * missing one is how a pose ends up half applied.
         */
        // A man a show has sent somewhere is off the play the same way a
        // celebrant is: no block, no reach, no lunge.
        const offPlay = !!cheer || !!spot;
        const engagement = offPlay ? null : (engaged.get(obj.settings.position) || null);
        // A MAN WITH HIS HANDS ON SOMEBODY IS NOT CATCHING A PASS. The ball
        // leaves at chest height over a line of men who are 3.85m tall, so it
        // passes inside a defensive lineman's `defenderRange` on most throws,
        // and without this the reach beat the block in both the pose and the
        // facing: two men locked together sprang apart to look up at it.
        const reach = (engagement || offPlay) ? 0 : (reaching.get(obj.settings.position) || 0);

        // A MAN GOING FOR THE BALL IS LOOKING AT THE BALL, and it beats every
        // other reason to be facing somewhere: his coverage, his block, and the
        // way his own feet happen to be pointing. Read from the DRAWN flight
        // for the same reason `reachersFor` is, which is that the arc the
        // visitor can see is the only one worth turning toward.
        const going = (!opts.presnap && !surveying && reach > 0 && flight.has)
            ? { x: flight.x, z: flight.z } : null;
        const look = (opts.presnap || surveying)
            ? null
            : going || lookTarget(obj, objects, carrier, p, standing,
                engagement ? engagement.against : '');
        // A MAN GOING NOWHERE KEEPS THE HEADING HE HAD. Passing a zeroed `mps`
        // here is what stops the spin: the deadzone was never crossed by a slow
        // player, it was crossed by a fast one running in a circle.
        const running = targetFacing(stepX, stepZ, mps);
        let want = (opts.presnap && relocating) ? running
            : opts.presnap ? downfield
            : (surveying ? Math.PI / 2
                : (look ? Math.atan2(look.x - p.x, look.z - p.z) : running));
        // Running to a show's spot, he faces the way he is running.
        if (stagedMoving) want = running;

        // ...BUT HE DOES NOT STOP RUNNING TO DO IT. See `turnFor`.
        //
        // A BLOCKER IS CAPPED THE SAME WAY, and it started to matter when the
        // receivers began blocking: a lineman wrestling somebody is barely
        // travelling, so the cap never bound, but a receiver blocking downfield
        // is doing a median 3.7 metres a second and a tenth of them are at a
        // full sprint. Squared up without the cap, those are drawn sprinting
        // backwards.
        if (going || engagement) want = turnFor(want, running);
        if (want !== null) figure.userData.facing = want;
        else if (figure.userData.facing === undefined) {
            figure.userData.facing = downfield;
        }
        if (cheer) {
            /**
             * A CELEBRANT'S YAW IS TWO NUMBERS ADDED, AND THEY HAVE TO STAY
             * APART.
             *
             * The base is where he is TURNED: the way he is running, or the man
             * he has come to look at. That eases exactly like everybody else's,
             * or a defender snaps a hundred and eighty degrees on the frame the
             * whistle goes.
             *
             * The spin is a DANCE, already a timed animation with its own
             * easing, and easing it a second time is the fault the takedown
             * documents: at two turns in a second and a half the follower runs a
             * radian and a sixth behind, and then goes on turning for half a
             * second after the music stops. So it is added whole.
             *
             * Which means the eased base cannot live in `rotation.y` any more,
             * because `rotation.y` now has a spin in it and next frame's ease
             * would read the spin as part of the heading. `yaw0` is that base,
             * seeded from wherever he was actually drawn on the first frame of
             * the party so nothing jumps.
             */
            const base = cheer.face !== null && cheer.face !== undefined
                ? cheer.face
                : (cheer.watch
                    ? Math.atan2(cheer.watch.x - p.x, cheer.watch.z - p.z)
                    : figure.userData.facing);
            figure.userData.facing = base;
            if (!wasCheer || figure.userData.yaw0 === undefined) {
                figure.userData.yaw0 = figure.rotation.y;
            }
            const turn = wrapAngle(base - figure.userData.yaw0);
            figure.userData.yaw0 += turn * (1 - Math.exp(-delta * TURN_RESPONSE));
            figure.rotation.y = figure.userData.yaw0 + (cheer.spin || 0);
        } else if (!figure.visible) {
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
        figure.userData.phase += travelled * CFG.pose.stridePerMetre;
        const lunge = offPlay ? 0 : (tacklers.get(obj.settings.position) || 0);

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
        // Taken AFTER the yaw above has been eased, so the target follows him
        // round as he turns, and held in front of his shoulders by `frontOf`.
        const reachAt = reach > 0
            ? frontOf(toRigSpace({ x: flight.x, y: flight.y, z: flight.z },
                figure.position, figure.rotation.y, CFG.figureScale))
            : null;

        // ASKING FOR IT. A receiver who has stopped getting anywhere while the
        // play is still running has finished his route, so he turns back to
        // whoever has the ball (above) and puts his hands up. Gated on the
        // play being live, or every receiver would raise his arms over a
        // finished play while the result card opened.
        const posting = (opts.live && standing && obj.settings.team === 0
            && /^wr\d$/.test(obj.settings.position) && carrier !== obj) ? 1 : 0;

        /**
         * BREAKING FREE, WHICH IS THE ONE POSE THE SIMULATION ASKS FOR.
         *
         * Everything else in this file is the view's own reading of the world.
         * This one is not a judgement: `play.breakContact` decides that a man
         * has had somebody hanging on him for two seconds and gives him a way
         * out, and the figure has to show the move that actually happened, on
         * the frame it happened. So the flag travels the same way
         * `state.airborne` travels in the other direction, as a plain field on
         * a plain object, and nothing here re-decides it.
         *
         * A CARRIER STIFF-ARMS AND A ROUTE RUNNER JUKES. They are drawn
         * completely differently on purpose: one is an arm, the other is the
         * whole body, and from a camera raked this far over the field a
         * one-armed pose and a hard roll are the two things that read.
         */
        /**
         * A DEAD PLAY AND A MAN ON THE FLOOR HOLD NO POSE.
         *
         * QA watched a tackled carrier lie there with his stiff-arm still locked
         * out. `state.escape` is cleared by its own clock inside `breakContact`,
         * `breakContact` runs only from `tick`, and `tick` returns immediately
         * once the play is dead, so the flag survived the whistle: measured, 0.64
         * players a play were still holding one. `play.clearEscapes` fixes it at
         * the source, and this is the second latch, because the view must also
         * be right during a REPLAY, where the objects are rebuilt from six floats
         * a frame and nothing re-runs the simulation at all.
         *
         * `role` is the takedown, so `isFloored` is the man going over. He is
         * not stiff-arming anybody on his way down.
         */
        const posed = opts.live && !isFloored;
        const esc = (posed && obj.state && obj.state.escape) || null;
        const E = CFG.escape;
        // Always numbers, never null: both are multiplied into a lean below and
        // handed to `poseFigure`, and a null that happens to coerce to zero is
        // an accident waiting for somebody to add a comparison.
        const stiff = esc && esc.kind !== 'shove'
            ? escapeAmount(esc, E.grace, CFG.pose.stiffArm.snap) : 0;
        const shoving = esc && esc.kind === 'shove'
            ? escapeAmount(esc, E.grace, CFG.pose.juke.snap) : 0;

        poseFigure(figure, mps, figure.userData.phase, {
            carry: carryFor(obj, carrier),
            throwT: throwProgress(obj),
            snapT: snapped,
            block: engagement ? engagement.amount : 0,
            tackle: rise ? rise.tackle : lunge,
            reach,
            reachAt,
            posting,
            down,
            // A SHOVE IS AN ARM TOO. QA asked for the receiver to "push the
            // defender back", and a push is one arm out at the man, which is
            // the pose the stiff-arm already solves. The two differ in what
            // they do to the LEGS: a carrier drives forward, a route runner
            // pushes off and leans away, which is the roll below.
            stiffArm: Math.max(stiff, shoving),
            stiffArmSide: esc ? stiffArmSide(esc.away, figure.userData.facing) : 1,
            // WHAT HIS ARMS ARE SAYING ABOUT THE PLAY BEING OVER. `roster.js`
            // reads this first of everything, because every pose below it is a
            // judgement about a play that is no longer running.
            celebrate: cheer && cheer.arms
                ? { arms: cheer.arms, amount: cheer.amount } : null,
        }, delta);

        // THE JUKE IS A ROLL, and it is the only thing in the game that uses
        // this axis. `rotation.order` is YXZ, so it happens in the figure's own
        // frame after the yaw and the pitch: he leans out of his cut rather
        // than tipping sideways in world space. Eased back to upright rather
        // than cleared, or a man finishing a juke snaps vertical in one frame.
        // A SHIMMY IS THE SAME AXIS, which is why it is here rather than in a
        // branch of its own: the roll is the only sideways lean this rig has,
        // and a man swinging his shoulders and a man cutting away from a
        // defender are asking it for the same thing.
        const wantRoll = cheer ? (cheer.roll || 0)
            : (shoving > 0
                ? jukeRoll(esc.away, figure.userData.facing, CFG.pose.juke.roll) * shoving
                : 0);
        figure.rotation.z += (wantRoll - figure.rotation.z)
            * (1 - Math.exp(-delta / CFG.pose.juke.snap));

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
            figure.rotation.x = rise ? rise.pitch : role.lean;
        } else {
            // AND A QUARTERBACK UNDER CENTRE IS BENT OVER THE BALL. The rig
            // has no waist, so this is the whole figure tipping about its own
            // feet, which is the same thing the tackle does with a much bigger
            // number. It unwinds across the snap along with the arms.
            const ready = surveying
                ? CFG.pose.underCentre.lean * (1 - snapped) : 0;
            // AND A MAN IN A BLOCK LEANS INTO IT. The game holds an engaged
            // pair further apart than two men can reach, so without this their
            // arms finish short of each other however far out they go. Whoever
            // is leaning hardest wins: a lineman who has become a tackler is
            // tackling.
            const blocking = engagement
                ? CFG.pose.block.lean * engagement.amount : 0;
            // AND A MAN STIFF-ARMING LEANS INTO IT TOO, a little less than a
            // blocker: he is running through the contact rather than settling
            // into it, and the arm is doing most of the talking.
            const driving = CFG.pose.stiffArm.lean * stiff;
            // AND A CELEBRATION IS A PITCH TOO: the jab of a man pointing at
            // whoever threw it, and the bowed head of whoever did. It wins
            // outright rather than joining the `max` below, because a quarterback
            // with his hands on his helmet is leaning FORWARD over a play he has
            // no part in, and the readings that would otherwise compete are
            // already cleared for celebrants above.
            const pitch = cheer ? (cheer.lean || 0)
                : (lunge > 0
                    ? CFG.pose.tackle.lean * lunge
                    : Math.max(ready, blocking, driving));
            const rate = lunge > 0 ? CFG.pose.tackle.snap
                : (stiff > 0 ? CFG.pose.stiffArm.snap : CFG.pose.blend);
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
        // ...and a man who has run thirteen metres to the end zone for the same
        // reason: a letter left standing where the whistle went belongs to
        // nobody.
        placeMarker(obj.settings.position,
            p.x + (role ? role.x : 0) + (cheer ? cheer.x : 0),
            p.z + (role ? role.z : 0) + (cheer ? cheer.z : 0));
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
    height: undefined, span: null, aimed: '',
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
/**
 * The end of one flight, which happens every frame the ball is in somebody's
 * hands.
 *
 * IT USED TO THROW THE SPAN AWAY, AND THAT IS WHY NOBODY EVER JUMPED IN A
 * REPLAY.
 *
 * `flight.span` is the throw's start, target and length, cached the first time
 * the ball is seen in the air, and it exists precisely BECAUSE the recorder
 * does not store any of it: `frameAt` rebuilds each object from six floats, so
 * during playback the ball has no idea where it was aimed. The cache is what
 * lets a replay draw the same parabola the live play drew.
 *
 * But this runs on every frame the ball is HELD, which includes every frame of
 * a replay before the recorded throw. So the cache was reliably wiped a second
 * or two before the only moment it was needed, `arcHeight` fell back to the
 * index, and the index is the crude clamped ramp the whole span mechanism was
 * built to replace: it saturates a third of the way up and cruises flat across
 * the top. The replay's ball therefore sat ABOVE the jump's band for the whole
 * flight, and a receiver who had leapt for it live never left his feet again.
 *
 * A play has exactly one throw, `throwTo` refuses a second, so the span belongs
 * to the PLAY and is cleared with the play, below.
 */
function endFlight() {
    flight.has = false;
    flight.spin = 0;
    flight.dir = { x: 1, y: 0, z: 0 };
    flight.height = CFG.ball.release;
    flight.still = 0;
    flight.rest = -1;
    flight.restHeading = null;
}

/** Reset between plays, so a new throw does not inherit the last one's
 *  heading for its first frame. */
export function resetBallFlight() {
    endFlight();
    // THE SPAN IS THE PLAY'S, and this is the only place it goes. See above.
    // So is who it was thrown to, which the replay of that same play still
    // needs and the next line-up must not inherit.
    flight.span = null;
    flight.aimed = '';
    aimedAt = '';
    gather.at = -1;
    resetThrow();
    // And put the quarterback back under centre, or the next formation lines
    // up with a man already wound up to throw.
    resetSnapMotion();
}

/** The throw this play, or null before one. Exported because it is the piece of
 *  state a replay depends on and cannot rebuild, which makes it worth being
 *  able to ask about. */
export function ballSpan() {
    return flight.span;
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
        // WHERE IT WAS AIMED, kept for the same reason the rest of this is: the
        // recorder stores none of it, so without the cache a replay has no idea
        // who the ball was thrown at (see `intendedReceiver`).
        tx: c.targetX,
        ty: c.targetY,
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
export function carryHold(mode, snapped, lift = 1) {
    const P = CFG.pose;
    const side = THROWING_SIDE;
    const put = (spot, aim) => ({
        ball: { x: side * spot.x, y: spot.y, z: spot.z },
        aim: { x: side * aim.x, y: aim.y, z: aim.z },
    });
    const mix = (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    });

    /**
     * HELD OVER HIS HEAD, which is the celebration's own carry. A fourth case
     * rather than a special path precisely so the ball and the arm keep reading
     * the same picture: `pose.raise` carries both the hand the arm is solved to
     * and the point the ball sits at, a few centimetres above it.
     *
     * AND IT IS A BLEND, NOT A SWITCH, for the same reason the snap is. The arm
     * takes `celebration.blend` to come up and a mode is a step change, so a
     * hard case here would fire the ball from his ribs to over his head on one
     * frame and leave it hanging there waiting for the hand to arrive. `lift`
     * is the same 0 to 1 the ARM is being blended by, so the two travel
     * together.
     */
    if (mode === 'raise') {
        const t = Math.min(1, Math.max(0, lift));
        return put(mix(P.tuck.ball, P.raise.ball, t), mix(P.tuck.aim, P.raise.aim, t));
    }
    if (mode !== 'throw') return put(P.tuck.ball, P.tuck.aim);

    const t = Math.min(1, Math.max(0, snapped));
    return put(mix(P.underCentre.ball, P.throwHold.ball, t),
        mix(P.underCentre.aim, P.throwHold.aim, t));
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
            const hold = carryHold(mode, snapProgress(),
                raisingBall(carrier.settings.position));

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
