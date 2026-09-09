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
 * NOTHING HERE IS TESTABLE BY ASSERTION, and that is by design. The test stub
 * is a Proxy that absorbs every assignment written onto a mesh, so a suite can
 * confirm this module runs without throwing and nothing more. That is why it
 * carries no arithmetic worth getting wrong: the maths is in config.js, which
 * is pure and asserted directly.
 */
import { EXESNOHS_CONFIG as CFG, simToWorld, FIELD, UNITS_TO_METRES } from './config.min.js';
import { figureFor, poseFigure, THROWING_SIDE } from './roster.min.js';
import { getBall, aimBall, placeSpot } from './ball.min.js';
import { placeMarker, hideMarker } from './markers.min.js';

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
const HEADING_DEADZONE = 1.1;    // METRES PER SECOND of measured movement
const TURN_RESPONSE = 7;         // higher turns quicker

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

/** 0 to 1 across the arm sweep, or 0 for anybody not throwing right now. */
function throwProgress(obj) {
    if (release.at < 0 || obj.settings.position !== release.position) return 0;
    const t = release.at / CFG.pose.throwRelease.time;
    return t >= 1 ? 1 : t;
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
function blockersEngaged(objects) {
    const out = new Map();
    const reach = CFG.pose.block.reach;
    const foes = objects.filter((o) => !BENCHED(o) && o.settings.team === 1);
    if (!foes.length) return out;

    for (const obj of objects) {
        if (BENCHED(obj) || !/^x\d$/.test(obj.settings.position)) continue;
        let nearest = Infinity;
        for (const foe of foes) {
            const p = simToWorld(obj.coords.x, obj.coords.y, 0);
            const q = simToWorld(foe.coords.x, foe.coords.y, 0);
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            if (d < nearest) nearest = d;
        }
        // Full commitment at half the reach, nothing at all beyond it.
        const amount = nearest >= reach ? 0
            : Math.min(1, (reach - nearest) / (reach * 0.5));
        if (amount > 0) out.set(obj.settings.position, amount);
    }
    return out;
}

/**
 * Move every figure to where the simulation says its player is.
 *
 * Called once per frame after play.tick(). Benched players are hidden rather
 * than moved, because the library parks them ten thousand units away and a
 * figure out there is both invisible and a waste of a draw call.
 */
export function syncFigures(objects, delta = 1 / 60) {
    const engaged = blockersEngaged(objects);
    const carrier = objects.find((o) => o.state && o.state.hasBall && !BENCHED(o));
    noteThrowRelease(objects, carrier, delta);

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
        const mps = figure.userData.mps < CFG.pose.stillSpeed ? 0 : figure.userData.mps;

        figure.position.set(p.x, 0, p.z);

        const want = targetFacing(stepX, stepZ, mps);
        if (want !== null) figure.userData.facing = want;
        else if (figure.userData.facing === undefined) {
            figure.userData.facing = obj.settings.team === 0 ? Math.PI / 2 : -Math.PI / 2;
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
        poseFigure(figure, mps, figure.userData.phase, {
            carry: carryFor(obj, carrier),
            throwT: throwProgress(obj),
            block: engaged.get(obj.settings.position) || 0,
        }, delta);

        figure.visible = true;

        // The marker slides under the feet. It is NOT a child of the figure,
        // so it keeps its own orientation and a letter stays the right way up
        // however the receiver turns (see markers.js).
        //
        // markers.js does the placing rather than this file writing to a mesh
        // position, because a named marker's ring is not at the centre of its
        // own plane and where the plane has to sit to put the ring on a pair of
        // feet is a fact about the texture layout.
        placeMarker(obj.settings.position, p.x, p.z);
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
const flight = { x: 0, y: 0, z: 0, has: false, spin: 0, dir: { x: 1, y: 0, z: 0 }, height: undefined, span: null };

/** Turns per second of a thrown ball. A real spiral is nearer 10, which at
 *  60Hz aliases into a slow backwards crawl. This is the fastest rate that
 *  still reads as spin rather than as strobing. */
const SPIRAL_HZ = 3.2;

/** Reset between plays, so a new throw does not inherit the last one's
 *  heading for its first frame. */
export function resetBallFlight() {
    flight.has = false;
    flight.spin = 0;
    flight.dir = { x: 1, y: 0, z: 0 };
    flight.height = CFG.ball.release;
    flight.span = null;
    resetThrow();
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

export function syncBall(ballObj, carrier, delta = 1 / 60) {
    const ball = getBall();
    if (!ball) return;

    if (ballObj && !BENCHED(ballObj)) {
        const p = simToWorld(ballObj.coords.x, ballObj.coords.y, 0);
        const y = arcHeight(ballObj, delta);

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

    resetBallFlight();
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
            const spot = mode === 'throw' ? CFG.pose.throwHold.ball : CFG.pose.tuck.ball;

            // The rig faces +z, so forward is (sin y, cos y) and the throwing
            // side is 90 degrees off it. Every offset rides figureScale, or a
            // bigger player holds the ball inside his own chest.
            const yaw = figure.rotation.y;
            const fx = Math.sin(yaw);
            const fz = Math.cos(yaw);
            const s = CFG.figureScale;
            const side = THROWING_SIDE;

            ball.position.set(
                figure.position.x + (fz * side * spot.right + fx * spot.ahead) * s,
                spot.up * s,
                figure.position.z + (-fx * side * spot.right + fz * spot.ahead) * s
            );
            // Held across the body rather than pointing wherever the last throw
            // left it. On the throwing hold it cants up, the way a ball sits
            // when somebody is about to let go of it.
            aimBall(mode === 'throw'
                ? { x: fx * 0.7, y: 0.7, z: fz * 0.7 }
                : { x: fx, y: 0, z: fz }, 0);
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
