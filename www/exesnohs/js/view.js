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
import { simToWorld, FIELD } from './config.min.js';
import { figureFor, poseFigure } from './roster.min.js';
import { getBall } from './ball.min.js';

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
const HEADING_DEADZONE = 0.25;   // sim units per frame, about 0.6 m/s
const TURN_RESPONSE = 7;         // higher turns quicker

const wrapAngle = (a) => {
    let d = a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
};

/** The heading a player WANTS. Standing players face the play: the offence
 *  downfield, the defence back at them. */
function targetFacing(obj, speed) {
    if (speed > HEADING_DEADZONE) {
        // world x = sim x and world z = sim y, so a heading in the simulation
        // plane maps straight through. The rig's forward is +z.
        return Math.atan2(obj.state.xSpeed, obj.state.ySpeed);
    }
    return null;      // keep whatever we were facing
}

/**
 * Move every figure to where the simulation says its player is.
 *
 * Called once per frame after play.tick(). Benched players are hidden rather
 * than moved, because the library parks them ten thousand units away and a
 * figure out there is both invisible and a waste of a draw call.
 */
export function syncFigures(objects, delta = 1 / 60) {
    for (const obj of objects) {
        const figure = figureFor(obj.settings.position);
        if (!figure) continue;
        if (BENCHED(obj)) { figure.visible = false; continue; }

        const p = simToWorld(obj.coords.x, obj.coords.y, 0);
        figure.position.set(p.x, 0, p.z);

        const speed = Math.hypot(obj.state.xSpeed || 0, obj.state.ySpeed || 0);
        const want = targetFacing(obj, speed);
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

        // Stride phase advances with distance covered, not with time, so a
        // player who slows takes slower steps instead of running on the spot.
        //
        // THE COEFFICIENT IS THE WHOLE THING. An early version used 0.55,
        // which at a top speed of 3.4 units per frame advanced 2.15 radians
        // EVERY FRAME, or nearly eighteen strides a second. The limbs aliased
        // and the field looked like it was full of insects. A running human is
        // about 2.5 strides a second, which at 45Hz is 0.35 radians a frame,
        // so the coefficient is 0.35 / 3.4.
        figure.userData.phase += 0.02 + speed * 0.103;
        poseFigure(figure, speed, figure.userData.phase);

        figure.visible = true;
    }
}

/**
 * Place the ball.
 *
 * Before a throw it rides in the carrier's hands, which is a fixed offset off
 * that figure rather than anything the simulation models. In flight it uses
 * its own sim object, whose `coords.z` is the arc getZIndex produced.
 */
export function syncBall(ballObj, carrier) {
    const ball = getBall();
    if (!ball) return;

    if (ballObj && !BENCHED(ballObj)) {
        const p = simToWorld(ballObj.coords.x, ballObj.coords.y, ballObj.coords.z || 0);
        ball.position.set(p.x, Math.max(p.y, 0.2), p.z);
        ball.rotation.y = Math.atan2(
            ballObj.state?.xSpeed || 1, ballObj.state?.ySpeed || 0
        );
        ball.visible = true;
        return;
    }

    if (carrier) {
        const figure = figureFor(carrier.settings.position);
        if (figure) {
            // Chest height, slightly to the figure's right, carried rather
            // than thrown.
            ball.position.set(
                figure.position.x + Math.cos(figure.rotation.y) * 0.18,
                1.15,
                figure.position.z - Math.sin(figure.rotation.y) * 0.18
            );
            ball.rotation.y = figure.rotation.y;
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
