// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-pose.test.mjs
 *
 * THE SIX THINGS QA SENT BACK ON 2026-09-10, AS PROPERTIES.
 *
 * Every case here fails against the build reviewed that morning, and each one
 * is a thing a screenshot either could not show or could only show once
 * somebody looked at a 60 pixel crop:
 *
 *   1  the quarterback had no pre-snap hold to snap out of
 *   2  his off arm's elbow was solved to a point inside his own chest
 *   3  38 of 61 receivers spun on the spot at the end of their routes
 *   5  the carrier fell after the tackler had already landed
 *   6  the held ball ignored the body's pitch, so a tackled carrier left it
 *      hanging at standing chest height
 *   4  the jersey mark, which is the one that IS visible in a screenshot, and
 *      is measured here anyway because "at least half the torso" is a number
 *
 * Written as properties rather than as restatements. A test that says
 * `offHand.x === 0.21` catches nothing, because the next person to move the
 * pose moves both. A test that says the upper arm stays outside the ribs keeps
 * failing against any future pose that puts it back through them.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const CONFIG_MODULE = await import(join(scene, 'config.js'));
const { XO_CONFIG: CFG, UNITS_TO_METRES, FIELD, SIM } = CONFIG_MODULE;
const { solveArm, handAt, RIG } = await import(join(scene, 'arm.js'));
const { takedownAt, takedownLength, contactFraction } = await import(join(scene, 'takedown.js'));
const {
    toWorld, carryHold, HEADING_DEADZONE, TURN_RESPONSE,
    syncFigures, beginSnapMotion, resetThrow, throwClock, blockersEngaged,
    beginRelocate, resetRelocate, relocateProgress,
    syncBall, resetBallFlight, ballSpan, turnFor, frontOf, jumpClearance, jumpCommit,
    noteThrow, airborne, intendedReceiver,
} = await import(join(scene, 'view.js'));
const {
    createPlay, lineUp, snap, tick, isDone, settleArrived, throwTo,
    eligibleReceivers, outcome, keepInbounds, markAirborne, OFFENSIVE_PLAYS,
} = await import(join(scene, 'play.js'));
const {
    startRecording, record, rewind, focusAt,
} = await import(join(scene, 'replay.js'));
const { litFor } = await import(join(scene, 'main.js'));
const { keyAction } = await import(join(scene, 'hud.js'));
const { boardColumns } = await import(join(scene, 'field.js'));
const {
    framingFor, applyView, nudgeView, resetView, getView,
    shoulderFor, resetShoulder, replayDriver,
    switchView, viewQuarter, REPLAY_VIEWS,
} = await import(join(scene, 'camera.js'));
const { PLAYS } = await import(join(scene, 'playbook-ui.js'));
const { ladderBands, bandAt } = await import(join(scene, 'scoring.js'));

/**
 * THE TORSO, FROM people-1.0.0's OWN CONSTRUCTOR. Half width, the y span, and
 * half depth, in rig metres before `figureScale`. Repeated here rather than
 * imported because the point of the arm tests below is to catch a pose that
 * has drifted away from the body, and a constant that drifts with it would
 * catch nothing.
 */
const TORSO = { hw: 0.19, lo: 0.75, hi: 1.30, hd: 0.11 };

/**
 * How far INSIDE the torso a point is, in metres. Negative outside.
 *
 * The upper arm is the segment that must never be in there. A forearm crossing
 * the front of the chest is what a folded arm looks like and is not counted,
 * which is why this samples from the shoulder to the elbow and stops.
 */
function upperArmInside(hand, side) {
    const a = solveArm({ x: side * hand.x, y: hand.y, z: hand.z }, side);
    const shoulder = { x: side * RIG.shoulderX, y: RIG.shoulderY, z: 0 };
    const elbow = {
        x: shoulder.x + RIG.upper * Math.sin(a.armZ),
        y: RIG.shoulderY - RIG.upper * Math.cos(a.armZ) * Math.cos(a.armX),
        z: -RIG.upper * Math.cos(a.armZ) * Math.sin(a.armX),
    };
    const depth = (p) => Math.min(
        TORSO.hw - Math.abs(p.x), TORSO.hd - Math.abs(p.z),
        p.y - TORSO.lo, TORSO.hi - p.y
    );
    let worst = -Infinity;
    for (let t = 0.2; t <= 1.001; t += 0.05) {
        worst = Math.max(worst, depth({
            x: shoulder.x + (elbow.x - shoulder.x) * t,
            y: shoulder.y + (elbow.y - shoulder.y) * t,
            z: shoulder.z + (elbow.z - shoulder.z) * t,
        }));
    }
    return { inside: worst, elbow, hand: handAt(a.armX, a.armZ, a.foreX, side) };
}

describe('the quarterback, before and after the snap', () => {
    /**
     * QA ITEM 2, AND IT WAS NEVER AN ANIMATION FAULT.
     *
     * The off hand asked for x 0.02, which is the body's own midline. The rig's
     * shoulder has two degrees of freedom and its elbow one, so a hand can only
     * reach the middle by carrying the elbow across with it: solved, the old
     * target put the elbow at +0.063 on the arm whose shoulder is at -0.2125,
     * which is a horizontal upper arm running from the shoulder to the sternum,
     * 5cm inside the chest. That is "his right arm disappears through his
     * body", and no screenshot from behind could ever have shown it.
     *
     * Asserted for every pose that both arms use, not just the one that was
     * wrong, because the next one will be a different one.
     */
    test('no pose runs a player upper arm through his own chest', () => {
        const poses = {
            'throwHold.hand': [CFG.pose.throwHold.hand, [1]],
            'throwHold.offHand': [CFG.pose.throwHold.offHand, [-1]],
            'underCentre.hand': [CFG.pose.underCentre.hand, [1, -1]],
            'posting.hand': [CFG.pose.posting.hand, [1, -1]],
            'tuck.hand': [CFG.pose.tuck.hand, [1]],
            'block.hand': [CFG.pose.block.hand, [1, -1]],
            'tackle.hand': [CFG.pose.tackle.hand, [1, -1]],
        };
        for (const [name, [hand, sides]] of Object.entries(poses)) {
            for (const side of sides) {
                const { inside } = upperArmInside(hand, side);
                // An arm pressed against the ribs is a real pose and its
                // centre line can sit a little inside the box. An arm ACROSS
                // the chest cannot: the old off hand scored 0.050.
                expect({ name, side, inside }).toMatchObject({ name, side });
                expect(inside).toBeLessThan(0.02);
            }
        }
    });

    /**
     * QA ITEM 1. There was no pre-snap hold at all, so the snap had nothing to
     * move away from and the quarterback stood cocked to throw from the moment
     * the formation appeared.
     *
     * The property is what "under centre" means: the ball is out in FRONT of
     * him and BELOW his shoulders before the snap, and behind and above them
     * after it. Both ends in one assertion, because a snap animation whose two
     * ends are the same pose is not a snap animation.
     */
    test('the ball starts out front and low, and finishes back and high', () => {
        const before = CFG.pose.underCentre.ball;
        const after = CFG.pose.throwHold.ball;
        expect(before.z).toBeGreaterThan(0.2);          // out in front of him
        expect(before.y).toBeLessThan(RIG.shoulderY);   // and below the shoulders
        expect(after.y).toBeGreaterThan(before.y + 0.3);
        expect(CFG.pose.throwHold.hand.z).toBeLessThan(before.z);
        expect(CFG.pose.snap.time).toBeGreaterThan(0.2);
    });

    /**
     * AND THE BALL IS CARRIED BY THE HANDS RATHER THAN ARRIVING WITH THEM.
     *
     * `carryHold` and `poseFigure` both read the same `snapT`, so this asks
     * the only question that could still go wrong: that the ball actually
     * moves across the snap, monotonically, from one hold to the other. A
     * ball that jumps at the end, or that is already at the throwing hold on
     * the first frame, fails.
     */
    test('the held ball travels from one hold to the other across the snap', () => {
        const start = carryHold('throw', 0).ball;
        const end = carryHold('throw', 1).ball;
        expect(start).toMatchObject({ y: CFG.pose.underCentre.ball.y });
        expect(end.y).toBeCloseTo(CFG.pose.throwHold.ball.y, 6);

        let last = -Infinity;
        for (let t = 0; t <= 1.0001; t += 0.1) {
            const y = carryHold('throw', t).ball.y;
            expect(y).toBeGreaterThanOrEqual(last - 1e-9);
            last = y;
        }
        // And a carrier who has tucked it is not doing any of this.
        expect(carryHold('tuck', 0).ball).toMatchObject(
            { y: CFG.pose.tuck.ball.y }
        );
        expect(carryHold('tuck', 1).ball.z).toBeCloseTo(CFG.pose.tuck.ball.z, 6);
    });
});

describe('the ball a figure is holding', () => {
    const figure = (pitch, yaw, at = { x: 0, y: 0, z: 0 }) => ({
        position: { ...at },
        rotation: { x: pitch, y: yaw },
    });

    /**
     * QA ITEM 6, AND THE MISSING TERM IS THE PITCH.
     *
     * The old placement used the yaw and wrote the height flat. That is right
     * for a man standing up and wrong for the two things this game does to a
     * body: the tackle lays the carrier out backwards through `rotation.x`, and
     * the new pre-snap hold tips the quarterback forward the same way. So the
     * ball stayed at standing chest height in the air above a man lying on the
     * grass, which is what "the tackled carrier drops the ball, or it hangs
     * there" was.
     *
     * The property: pitch a figure over and the ball he is holding comes down
     * with him. Measured against the carrier's real lean, not a token one.
     */
    test('a ball held by a man on his back is not left standing in the air', () => {
        const spot = carryHold('tuck', 1).ball;
        const upright = toWorld(figure(0, 0), spot);
        const floored = toWorld(figure(CFG.pose.takedown.carrierLean, 0), spot);
        // He went over backwards, so it comes down and goes behind him.
        expect(floored.y).toBeLessThan(upright.y * 0.5);
        expect(floored.z).toBeLessThan(-0.5);
        // And it stays with the body rather than with the world: the distance
        // from his own origin is the one thing a rotation cannot change.
        const near = (p) => Math.hypot(p.x, p.y, p.z);
        expect(near(floored)).toBeCloseTo(near(upright), 6);
    });

    test('and it rides the quarterback pitching forward over centre', () => {
        const spot = carryHold('throw', 0).ball;
        const level = toWorld(figure(0, 0), spot);
        const over = toWorld(figure(CFG.pose.underCentre.lean, 0), spot);
        expect(over.z).toBeGreaterThan(level.z);
        expect(over.y).toBeLessThan(level.y);
    });

    /**
     * THE TWO ROTATIONS IN THE ORDER THE RIG COMPOSES THEM.
     *
     * `person.rotation.order` is YXZ, so a local point is pitched about x and
     * THEN turned about y. Doing those the other way round is silent and looks
     * plausible from directly behind: it puts the ball out to the side of a man
     * lying on his back instead of underneath him. A figure both pitched and
     * turned is the only case that can tell them apart, which is why this is
     * its own test rather than a line in the one above.
     */
    test('the pitch happens before the yaw, which is the rig own order', () => {
        const spot = { x: 0, y: 1, z: 0.5 };
        const yaw = Math.PI / 2;
        const pitch = 0.9;
        const got = toWorld(figure(pitch, yaw), spot);
        const s = CFG.figureScale;
        // By hand: pitch about x, then turn about y.
        const y = spot.y * Math.cos(pitch) - spot.z * Math.sin(pitch);
        const z = spot.y * Math.sin(pitch) + spot.z * Math.cos(pitch);
        expect(got.y).toBeCloseTo(y * s, 6);
        expect(got.x).toBeCloseTo((spot.x * Math.cos(yaw) + z * Math.sin(yaw)) * s, 6);
        expect(got.z).toBeCloseTo((-spot.x * Math.sin(yaw) + z * Math.cos(yaw)) * s, 6);
    });

    test('a figure carried by the tackle takes the ball with it', () => {
        const spot = carryHold('tuck', 1).ball;
        const home = toWorld(figure(0, 0, { x: 0, y: 0, z: 0 }), spot);
        const away = toWorld(figure(0, 0, { x: 12, y: 3, z: -5 }), spot);
        expect(away.x - home.x).toBeCloseTo(12, 6);
        expect(away.y - home.y).toBeCloseTo(3, 6);
        expect(away.z - home.z).toBeCloseTo(-5, 6);
    });
});

describe('the tackle, and when the two of them actually meet', () => {
    const T = CFG.pose.takedown;
    /** The gap the simulation really produces: measured over 84 tackles the
     *  nearest defender at the whistle is a median 1.85m away. */
    const GAP = 1.85;
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: GAP, y: 0, z: 0 };

    /**
     * QA ITEM 5. The carrier's fall used to be clocked from the END of the
     * dive, so the order on screen was: the defender leaves his feet, the
     * defender lands, and only then does the man he hit begin to go over. At
     * the median gap that is 0.28 of a second of a tackler lying on the grass
     * beside somebody who has not been touched.
     */
    test('the carrier is already going over while the tackler is still in the air', () => {
        const hit = contactFraction(GAP) * T.dive;
        const mid = takedownAt(hit + 0.01, from, to);
        expect(mid.contact).toBe(1);
        // He has started to go...
        expect(Math.abs(mid.carrier.lean)).toBeGreaterThan(0);
        // ...and the man who hit him has not landed yet.
        expect(mid.tackler.y).toBeGreaterThan(0.1);
    });

    test('nothing happens to the carrier before contact', () => {
        const hit = contactFraction(GAP) * T.dive;
        const before = takedownAt(hit * 0.5, from, to);
        expect(before.contact).toBe(0);
        expect(before.carrier.lean).toBeCloseTo(0, 12);
        expect(Math.hypot(before.carrier.x, before.carrier.z)).toBe(0);
        // The tackler, meanwhile, is well on his way.
        expect(before.tackler.x).toBeGreaterThan(0);
    });

    /**
     * AND CONTACT IS SOLVED FROM THE GEOMETRY, NOT ASSUMED.
     *
     * The tackler covers the gap on an easing curve, so the moment the bodies
     * meet is not a fixed fraction of the dive: it depends on how far he had to
     * come. A defender who was almost on top of the carrier connects at once, a
     * defender who had ground to make up connects later, and both are clamped
     * inside a window because neither end of a dive is a tackle.
     */
    test('a longer gap is crossed before contact, a shorter one is not', () => {
        expect(contactFraction(1.2)).toBeLessThanOrEqual(contactFraction(4.0));
        for (const gap of [0.6, 1.0, 1.85, 3.0, 6.0]) {
            const u = contactFraction(gap);
            expect(u).toBeGreaterThanOrEqual(T.contactAt.min);
            expect(u).toBeLessThanOrEqual(T.contactAt.max);
        }
    });

    test('the whole thing finishes inside the hold main.js waits for', () => {
        const hold = takedownLength();
        for (const gap of [0.6, 1.85, 6.0]) {
            const end = takedownAt(takedownLength(gap), from, { x: gap, y: 0, z: 0 });
            // Both of them have come to rest: full lean, and back on the floor.
            expect(Math.abs(end.carrier.lean)).toBeCloseTo(Math.abs(T.carrierLean), 6);
            expect(end.tackler.y).toBeCloseTo(0, 6);
            expect(takedownLength(gap)).toBeLessThanOrEqual(hold + 1e-9);
        }
    });

    /**
     * A tackler who stops dead while the man he hit flies backwards has not
     * made a tackle, he has been run into. He is carried along with him.
     */
    test('the tackler is carried along by the man he brought down', () => {
        const end = takedownAt(takedownLength(GAP), from, to);
        const drive = end.carrier.x - (GAP - T.close);
        expect(end.tackler.x).toBeGreaterThan(GAP - T.close);
        expect(end.tackler.x).toBeLessThan(end.carrier.x + GAP);
    });
});

describe('a receiver who has run out of route', () => {
    /**
     * QA ITEM 3, AND IT IS THE SIMULATION RATHER THAN THE ANIMATION.
     *
     * Every route in the ported library steers by comparing a coordinate to a
     * target and accelerating one way or the other, with no deadzone and
     * nothing that ever decelerates. Arriving therefore means overshooting,
     * being accelerated back, and overshooting again: traced frame by frame,
     * jumbo2's wr1 orbits a 0.4m circle at 6 m/s with a 27 frame period and
     * never leaves it. Over the 17 plays, 38 of 61 receivers spend the last
     * second of the play turning through more than 180 degrees while covering
     * under 1.5m of ground.
     *
     * THIS PLAYS REAL PLAYS rather than asserting a threshold, because the
     * threshold is not the property. The property is that receivers stop going
     * round in circles, and the only honest way to ask is to run the game.
     */
    const HZ = CFG.simHz;

    function playOut(name, settle) {
        const play = createPlay();
        lineUp(play, name, 'cover1');
        snap(play);
        const tracks = new Map();
        for (let f = 0; f < HZ * 7 && !isDone(play); f += 1) {
            tick(play);
            for (const o of play.game.objects) {
                const pos = o.settings.position;
                if (o.settings.benched || !/^wr\d$/.test(pos)) continue;
                if (!tracks.has(pos)) tracks.set(pos, []);
                tracks.get(pos).push({
                    x: o.coords.x * UNITS_TO_METRES,
                    z: o.coords.y * UNITS_TO_METRES,
                });
            }
        }
        return tracks;
    }

    /**
     * WHAT THE VISITOR ACTUALLY SEES, WHICH IS THE ONLY THING WORTH ASSERTING.
     *
     * The raw simulation track is the wrong place to measure this and measuring
     * it there is how the first version of this test went wrong. A figure is
     * not drawn where the simulation put him: view.js eases the drawn position
     * toward it over `motionSmooth`, smooths the speed over `speedSmooth`, and
     * only re-aims a heading at all when the drawn speed clears
     * `HEADING_DEADZONE` and the figure is covering ground. A one centimetre
     * zigzag reads as a colossal turn rate on raw coordinates and as nothing at
     * all on screen.
     *
     * So this runs the real simulation and then puts its output through those
     * same four rules, with the constants imported rather than copied, and
     * asks how far the FIGURE turns. It is a measuring instrument rather than a
     * restatement: what is under test is the simulation and the settle, and the
     * instrument is the documented filter that stands between them and a pixel.
     *
     * MEASURED BOTH WAYS BEFORE IT WAS WRITTEN. Of the receivers who end a play
     * going nowhere, the build QA reviewed turned ALL of them through more than
     * 90 degrees in that last second, with a median of 493. With the settle and
     * the standing rule the median is 0 and it is 5 of 39.
     */
    function drawnRotation(track) {
        const dt = 1 / HZ;
        const wrap = (a) => {
            let d = a;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            return d;
        };
        const drawn = { x: track[0].x, z: track[0].z };
        const ring = [];
        const span = Math.round(CFG.pose.standing.window / dt);
        let mps = 0;
        let facing = 0;
        let want;
        const turned = [];
        const seen = [];

        for (const target of track) {
            const was = { x: drawn.x, z: drawn.z };
            const ease = 1 - Math.exp(-dt / CFG.pose.motionSmooth);
            drawn.x += (target.x - drawn.x) * ease;
            drawn.z += (target.z - drawn.z) * ease;
            const stepX = drawn.x - was.x;
            const stepZ = drawn.z - was.z;
            mps += (Math.hypot(stepX, stepZ) / dt - mps)
                * (1 - Math.exp(-dt / CFG.pose.speedSmooth));

            ring.push({ x: drawn.x, z: drawn.z });
            if (ring.length > span + 1) ring.shift();
            const standing = ring.length > span && Math.hypot(
                drawn.x - ring[0].x, drawn.z - ring[0].z
            ) < CFG.pose.standing.net;

            const speed = standing ? 0 : mps;
            if (speed > HEADING_DEADZONE && (stepX || stepZ)) {
                want = Math.atan2(stepX, stepZ);
            }
            if (want !== undefined) {
                const before = facing;
                facing += wrap(want - facing) * (1 - Math.exp(-dt * TURN_RESPONSE));
                turned.push(Math.abs(wrap(facing - before)));
            } else {
                turned.push(0);
            }
            seen.push({ x: drawn.x, z: drawn.z });
        }

        const last = turned.slice(-Math.round(HZ));
        const win = seen.slice(-Math.round(HZ));
        return {
            degrees: last.reduce((a, b) => a + b, 0) * 180 / Math.PI,
            net: Math.hypot(
                win[win.length - 1].x - win[0].x, win[win.length - 1].z - win[0].z
            ),
        };
    }

    test('a receiver who has arrived stands still instead of turning on the spot', () => {
        let spinning = 0;
        let arrived = 0;
        for (const name of OFFENSIVE_PLAYS) {
            for (const [, track] of playOut(name)) {
                if (track.length < HZ * 2) continue;
                const { degrees, net } = drawnRotation(track);
                // A receiver still running at the whistle is entitled to be
                // facing wherever he is going. This is about the other ones.
                if (net >= 1.0) continue;
                arrived += 1;
                if (degrees > 90) spinning += 1;
            }
        }
        expect(arrived).toBeGreaterThan(15);
        // It was 26 of 26 against the build this replaces.
        expect(spinning / arrived).toBeLessThan(0.35);
    });

    /**
     * AND THE MECHANISM, ISOLATED, because the play test above would also pass
     * if somebody deleted the receivers.
     *
     * `settleArrived` caps rather than stops, and that is the whole design: a
     * limit cycle's radius goes as the square of the speed, so a tenth of top
     * speed is a hundredth of the circle, while a receiver who genuinely has
     * somewhere to be still travels and releases himself within one window.
     */
    test('holds a player who is going nowhere and releases one who is not', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const wr = play.game.objects.find((o) => o.settings.position === 'wr1');
        wr.settings.benched = false;
        const window = Math.round(CFG.simHz * CFG.settle.window);
        const cap = CFG.settle.speed * wr.physics.maxSpeed;

        // A man who has not moved for a whole window, at full pelt.
        for (let f = 0; f <= window + 1; f += 1) {
            wr.state.xSpeed = wr.physics.maxSpeed;
            wr.state.ySpeed = 0;
            settleArrived(play);
        }
        expect(wr.state.xSpeed).toBeCloseTo(cap, 6);
        expect(cap).toBeGreaterThan(0);       // held, not frozen

        // And now he covers ground. One window later he has his legs back.
        for (let f = 0; f <= window + 1; f += 1) {
            wr.coords.x += CFG.settle.net / UNITS_TO_METRES / window * 2;
            wr.state.xSpeed = wr.physics.maxSpeed;
            settleArrived(play);
        }
        expect(wr.state.xSpeed).toBeCloseTo(wr.physics.maxSpeed, 6);
    });

    test('the man the ball is on its way to is never held', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const wr = play.game.objects.find((o) => o.settings.position === 'wr1');
        wr.settings.benched = false;
        play.game.throwTo = 'wr1';
        for (let f = 0; f <= Math.round(CFG.simHz * CFG.settle.window) + 2; f += 1) {
            wr.state.xSpeed = wr.physics.maxSpeed;
            settleArrived(play);
        }
        expect(wr.state.xSpeed).toBe(wr.physics.maxSpeed);
    });
});

describe('a replay starts from the snap, not from the last thing that happened', () => {
    /**
     * QA ROUND EIGHT, ITEM 1: "in replays, the QB's arm is not raised to be
     * holding the ball", and the recording shows him with the ball up by his
     * ear and both arms hanging at his sides.
     *
     * `release.at` is seconds since the ball left his hand and nothing was
     * clearing it between a play and its own replay. A play that ended in a
     * pass left it at several seconds, so the throw sweep saturated at 1 and
     * the arm sat in the FOLLOW THROUGH from the first frame of playback until
     * the recorded throw came round again. The ball is placed from the carry
     * rather than from the sweep, so it went on riding correctly beside an arm
     * that had already thrown it.
     *
     * `syncFigures` does the noticing before it touches a single figure, so
     * this drives the real thing with plain objects and no roster at all.
     */
    const qb = (hasBall) => ({
        settings: { position: 'qb', team: 0, benched: false, positionGroup: 'qb' },
        coords: { x: 200, y: 300, z: 0 },
        state: { xSpeed: 0, ySpeed: 0, hasBall },
    });

    test('the throw clock is cleared when the snap motion begins', () => {
        resetThrow();
        expect(throwClock()).toBeLessThan(0);

        // He has it, then he does not: that is a throw, and nothing announces
        // it. The clock starts and runs on.
        syncFigures([qb(true)], 0.1, {});
        syncFigures([qb(false)], 0.1, {});
        expect(throwClock()).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < 30; i += 1) syncFigures([qb(false)], 0.1, {});
        // Well past the sweep, which is where a finished play leaves it.
        expect(throwClock()).toBeGreaterThan(CFG.pose.throwRelease.time);

        // Rewinding to the snap is a play that has not thrown it yet.
        beginSnapMotion();
        expect(throwClock()).toBeLessThan(0);
    });

    test('and the throw is noticed again from the playback own frames', () => {
        beginSnapMotion();
        // Playback opens with him holding it, exactly as the live play did.
        syncFigures([qb(true)], 0.1, {});
        expect(throwClock()).toBeLessThan(0);
        syncFigures([qb(false)], 0.1, {});
        expect(throwClock()).toBeGreaterThanOrEqual(0);
    });
});

describe('the scoring band belongs to the offense', () => {
    /**
     * QA ROUND EIGHT, ITEM 2: the field lit the 50 band when a DEFENDER ran an
     * interception into it, which tells a visitor they have scored fifty points
     * for throwing a pick. The ladder only ever pays the offense, and an
     * interception is minus ten wherever on the field it happens.
     *
     * Two facts are needed and both are asserted here: the recording has to say
     * WHO is holding it, and the rule has to classify every position on the
     * roster correctly. The band itself is a mesh and cannot be asserted (see
     * view.js on the stub), but neither of these is.
     */
    test('the recording says who is carrying, not just where the ball is', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const objects = play.game.objects;
        startRecording(objects);

        const carrier = (position) => {
            for (const o of objects) {
                if (o.state) o.state.hasBall = o.settings.position === position;
            }
            record(objects);
        };
        carrier('qb');       // frame 0
        carrier('wr1');      // frame 1, a catch
        carrier('db3');      // frame 2, taken away
        rewind();

        expect(focusAt(0).holder).toBe('qb');
        expect(focusAt(1).holder).toBe('wr1');
        expect(focusAt(2).holder).toBe('db3');
        // And it is still a point, because the camera follows this.
        expect(Number.isFinite(focusAt(2).x)).toBe(true);
        expect(Number.isFinite(focusAt(2).y)).toBe(true);
    });

    test('every offensive position lights it and no defensive one does', () => {
        for (const position of ['qb', 'wr1', 'wr2', 'wr3', 'wr4',
            'x1', 'x2', 'x3', 'x4', 'x5', 'x6']) {
            expect({ position, lit: litFor(position) })
                .toEqual({ position, lit: true });
        }
        for (const position of ['db1', 'db2', 'db3', 'db4', 'db5', 'db6',
            's1', 's2']) {
            expect({ position, lit: litFor(position) })
                .toEqual({ position, lit: false });
        }
        // A ball nobody is holding lights nothing at all.
        expect(litFor('')).toBe(false);
        expect(litFor(undefined)).toBe(false);
    });
});

describe('catching the ball', () => {
    /**
     * QA ROUND EIGHT, ITEM 3: "a lot of passes have been falling incomplete".
     *
     * It is the same oversight `collisionScale` exists to correct.
     * `motion.checkCatch` builds its boxes by hand, five units either side of
     * the ball against eleven by eighteen around the player, and those were
     * measured for a player DRAWN AS A 20-UNIT LETTER. At `figureScale` 2.2 the
     * figure is 1.45m across and the part of him that can catch is 0.385m, so
     * he can stand squarely under the ball with three quarters of himself
     * outside his own hands.
     *
     * THIS PLAYS REAL PLAYS. A threshold on the config number would assert
     * nothing except that somebody typed it; what matters is the rate a visitor
     * experiences, so this throws 612 passes and counts them. Measured, the
     * port catches 49.8% and the shipped scale catches 67.8%.
     */
    const DEFENCES = ['cover1', 'cover4', 'cover11'];

    function throwGrid() {
        let thrown = 0;
        let caught = 0;
        let picked = 0;
        for (const name of OFFENSIVE_PLAYS) {
            for (const defence of DEFENCES) {
                for (const wait of [1.0, 1.6, 2.4]) {
                    for (let which = 0; which < 4; which += 1) {
                        const play = createPlay();
                        lineUp(play, name, defence);
                        snap(play);
                        const at = Math.round(CFG.simHz * wait);
                        let sent = false;
                        for (let f = 0; f < CFG.simHz * 9 && !isDone(play); f += 1) {
                            tick(play);
                            if (!sent && f >= at) {
                                const open = eligibleReceivers(play);
                                if (open.length) throwTo(play, open[which % open.length]);
                                sent = true;
                            }
                        }
                        if (!sent) continue;
                        thrown += 1;
                        const st = play.playState.state;
                        if (st.ball && st.ball.caught) caught += 1;
                        if ((outcome(play).points || 0) === -10) picked += 1;
                    }
                }
            }
        }
        return { thrown, caught, picked };
    }

    test('a receiver catches the ball more often than not', () => {
        const { thrown, caught, picked } = throwGrid();
        expect(thrown).toBeGreaterThan(500);
        /**
         * THE PORT MANAGED 49.8% OF THESE, which is what QA was playing, and
         * beating that is the entire claim.
         *
         * THE FLOOR CARRIES A REAL MARGIN, and it did not: it was 0.60 against
         * a rate that is not a constant. Re-measured over ten independent runs
         * of this same grid the rate runs 60.5% to 64.9%, and a run in CI came
         * in at 59.9% and failed a test nothing had broken. 612 plays of a
         * stochastic simulation carry about two points of standard error, so a
         * floor three points under the mean fails something like one run in
         * fifteen. 0.55 is still four sigma clear of the port and cannot flake.
         */
        expect(caught / thrown).toBeGreaterThan(0.55);
        // AND THE TURNOVERS DID NOT COME WITH IT. Widening the catch hands the
        // same reach to the secondary unless something stops it, and an
        // interception is the harshest outcome on the ladder. The port's own
        // rate over this grid is 8.5% and ten runs of this one ranged to 9.8%,
        // so the old 0.11 ceiling sat about one sigma away and had the same
        // fault as the floor above.
        expect(picked / thrown).toBeLessThan(0.13);
    });

    /**
     * AND A DEFENDER REACHES LESS FAR THAN THE MAN THE BALL WAS THROWN AT,
     * which is the trade that buys the line above and is worth stating outright
     * rather than leaving as an emergent property of two numbers.
     */
    test('the defender box is smaller than the receiver box', () => {
        const { formationSettings } = CONFIG_MODULE;
        const s = formationSettings();
        expect(s.catchScale).toBeGreaterThan(1);
        expect(s.interceptShare).toBeGreaterThan(0);
        expect(s.interceptShare).toBeLessThan(1);
        // And a defender ends up no better off than the 2D game left him.
        expect(s.catchScale * s.interceptShare).toBeLessThanOrEqual(1);
    });
});

describe('the sideline holds a body, not a coordinate', () => {
    /**
     * QA ROUND NINE, ITEM 3: "there are still some plays where the QB runs off
     * the bottom of the screen, escaping the invisible field boundary wall".
     *
     * He never left it. Measured over 17 plays against three defences, nobody's
     * CENTRE ever crossed the touchline and plenty of them reached it to the
     * centimetre, which is the fault: a figure is 1.45m across at figure scale,
     * so a man pinned to the paint has three quarters of a metre of himself,
     * and all of his shadow, out past the line. Same family as `collisionScale`
     * and the catch box: a number tuned against a letterform is not a number
     * about a person.
     */
    test('a player comes to rest with his whole body inside the paint', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const height = play.playState.state.measurements.height;
        const half = CFG.figureScale * 0.505 / 2;      // half a shoulder width

        for (const obj of play.game.objects) {
            if (obj.settings.position === 'ball' || obj.settings.benched) continue;
            obj.coords.y = -500;
        }
        keepInbounds(play);
        for (const obj of play.game.objects) {
            if (obj.settings.position === 'ball' || obj.settings.benched) continue;
            // His own edge, in metres from the touchline he was shoved through.
            expect(obj.coords.y * UNITS_TO_METRES).toBeGreaterThanOrEqual(half - 1e-9);
        }

        for (const obj of play.game.objects) {
            if (obj.settings.position === 'ball' || obj.settings.benched) continue;
            obj.coords.y = height + 500;
        }
        keepInbounds(play);
        for (const obj of play.game.objects) {
            if (obj.settings.position === 'ball' || obj.settings.benched) continue;
            expect((height - obj.coords.y) * UNITS_TO_METRES)
                .toBeGreaterThanOrEqual(half - 1e-9);
        }
    });

    /**
     * AND THE ENDS OF THE FIELD, WHICH THIS AXIS NEVER HAD.
     *
     * The wall was cross-field only, on the stated grounds that "nobody has
     * ever come close to the ends". Measured against plays where the visitor
     * simply HOLDS the ball, which the game explicitly lets them do, the
     * quarterback's own back edge reaches 15.4m behind the goal line and drags
     * three linemen out with him. The earlier measurement missed it because it
     * always threw or ran at 1.4 seconds: nobody had asked what happens if you
     * never do either, and the drop-back has no end.
     */
    test('nobody can walk out the back or the front of the green', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const width = play.playState.state.measurements.width;
        const half = CFG.figureScale * 0.505 / 2;
        const live = () => play.game.objects.filter((o) => o.settings.position !== 'ball'
            && !o.settings.benched);

        for (const obj of live()) obj.coords.x = -900;
        keepInbounds(play);
        for (const obj of live()) {
            expect(obj.coords.x * UNITS_TO_METRES).toBeGreaterThanOrEqual(half - 1e-9);
        }

        for (const obj of live()) obj.coords.x = width + 900;
        keepInbounds(play);
        for (const obj of live()) {
            expect((width - obj.coords.x) * UNITS_TO_METRES)
                .toBeGreaterThanOrEqual(half - 1e-9);
        }
    });

    /**
     * AND THE WALL DOES NOT COST THE TOUCHDOWN, which had to be checked rather
     * than assumed. `routes.runWrFormation` awards it at `-4 + lineInterval * 4`
     * in field units, and a carrier who can never reach that line can never
     * score the fifty the whole ladder is built around.
     */
    test('a carrier can still reach the line that scores fifty', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const width = play.playState.state.measurements.width;
        const interval = play.playState.state.measurements.lineInterval;
        const crossing = -4 + interval * 4;
        const half = (CFG.figureScale * 0.505 / 2) / UNITS_TO_METRES;
        expect(crossing).toBeLessThan(width - half);
    });

    test('and the ball is not held to it, because a ball has no shoulders', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const ball = { settings: { position: 'ball' }, coords: { x: 0, y: -900 }, state: {} };
        play.game.objects.push(ball);
        keepInbounds(play);
        expect(ball.coords.y).toBe(-900);
    });
});

describe('a block takes two', () => {
    /**
     * QA ROUND NINE, ITEM 5. Only the offensive lineman was ever posed, so he
     * reached out and the man he was reaching at ran past him with his arms
     * swinging, which reads as neither of them blocking.
     */
    const man = (position, team, x, y) => ({
        settings: { position, team, benched: false, positionGroup: /^x/.test(position) ? 'x' : 'db' },
        coords: { x, y, z: 1 },
        state: { xSpeed: 0, ySpeed: 0 },
    });

    test('both men are in it, and each is pointed at the other', () => {
        const near = 1.0 / UNITS_TO_METRES;        // a metre apart, well inside reach
        const pair = blockersEngaged([
            man('x1', 0, 0, 0),
            man('db1', 1, near, 0),
            // ...and somebody far away, who is in nothing.
            man('x2', 0, 0, 900),
        ]);
        expect(pair.get('x1')).toMatchObject({ against: 'db1' });
        expect(pair.get('db1')).toMatchObject({ against: 'x1' });
        expect(pair.get('x1').amount).toBeGreaterThan(0);
        expect(pair.get('x1').amount).toBe(pair.get('db1').amount);
        expect(pair.has('x2')).toBe(false);
    });

    test('a defender worked by two keeps the one further along', () => {
        const close = 0.6 / UNITS_TO_METRES;
        const far = 2.2 / UNITS_TO_METRES;
        const pair = blockersEngaged([
            man('x1', 0, 0, 0),
            man('x2', 0, 0, far - close),
            man('db1', 1, 0, close),
        ]);
        // x1 is nearer him than x2 is, so that is the engagement he is in.
        expect(pair.get('db1').against).toBe('x1');
        expect(pair.get('db1').amount).toBe(pair.get('x1').amount);
    });

    /**
     * QA ROUND TWENTY-ONE: THE RECEIVERS BLOCK TOO, once somebody is carrying
     * it. That is the visible content of the run and the screen, which are the
     * plays this game is really about: the points depend on how the team blocks
     * for the carrier, and downfield that is the receivers doing it.
     *
     * There is no blocking flag in the ported simulation to read, so it is
     * derived exactly the way the line's is. Measured, there is plenty to
     * derive: while a teammate has the ball, the nearest defender to a receiver
     * is a median 2.20m away, which is inside the lock.
     */
    const carrying = (position) => ({
        settings: { position, team: 0, benched: false, positionGroup: 'wr' },
        coords: { x: 0, y: -900, z: 1 },
        state: { xSpeed: 0, ySpeed: 0, hasBall: true },
    });

    test('a receiver blocks once one of ours is carrying it, and not before', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const field = () => [man('wr1', 0, 0, 0), man('db1', 1, near, 0), carrying('wr2')];

        // Nobody has it: he is running a route, not blocking.
        expect(blockersEngaged(field(), null).has('wr1')).toBe(false);
        // A teammate has it, so he is blocking, and so is the man he is on.
        const live = blockersEngaged(field(), carrying('wr2'));
        expect(live.get('wr1')).toMatchObject({ against: 'db1' });
        expect(live.get('db1')).toMatchObject({ against: 'wr1' });
    });

    test('and the man carrying it is never blocking for himself', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const runner = {
            settings: { position: 'wr1', team: 0, benched: false, positionGroup: 'wr' },
            coords: { x: 0, y: 0, z: 1 },
            state: { xSpeed: 0, ySpeed: 0, hasBall: true },
        };
        const pair = blockersEngaged([runner, man('db1', 1, near, 0)], runner);
        expect(pair.has('wr1')).toBe(false);
    });

    /**
     * ...AND "ONE OF OURS IS CARRYING IT" USED TO INCLUDE THE QUARTERBACK IN
     * THE POCKET, WHICH IS QA'S 2026-09-22 REPORT.
     *
     * He is carrying it from the snap, so every receiver on the field was drawn
     * blocking for the whole of his route. Measured over 1,665,624
     * receiver-frames, a receiver was drawn blocking on 61.6% of them and 48.8%
     * of ALL of them were a block thrown while the ball was still in the
     * quarterback's hands: 79.2% of every block a receiver was ever in.
     *
     * IT SHOWS BECAUSE THE ARMS ARE THE STRIDE. The shared rig's legs are bare
     * meshes with no pivot, so a receiver holding a block is a receiver who has
     * visibly stopped running. QA: "it kind of looks like the players are just
     * floating down the field."
     */
    const quarterback = (running = false) => ({
        settings: { position: 'qb', team: 0, benched: false, positionGroup: 'qb' },
        coords: { x: -300, y: 0, z: 1 },
        state: { xSpeed: 0, ySpeed: 0, hasBall: true, run: running },
    });

    test('a receiver runs his route while the quarterback still has it', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const field = () => [man('wr1', 0, 0, 0), man('db1', 1, near, 0), quarterback()];
        expect(blockersEngaged(field(), quarterback()).has('wr1')).toBe(false);
        // ...and the line is blocking the whole time, which is its one job.
        const line = [man('x1', 0, 0, 0), man('db1', 1, near, 0), quarterback()];
        expect(blockersEngaged(line, quarterback()).has('x1')).toBe(true);
    });

    test('...and blocks the moment he tucks it and runs', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const field = [man('wr1', 0, 0, 0), man('db1', 1, near, 0), quarterback(true)];
        expect(blockersEngaged(field, quarterback(true)).get('wr1'))
            .toMatchObject({ against: 'db1' });
    });

    /**
     * QA, SAME ROUND: "if the receiver gets past a defender then they should
     * resume their usual running motion. The receivers should only put their
     * arms up if the defender is in front of them."
     *
     * Measured, 36.8% of the blocks a receiver was drawn in were against a man
     * already BEHIND him, which is a receiver who beat his cover and then ran
     * the rest of the route holding an imaginary man off his back.
     */
    test('a receiver who has got past his man goes back to running', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const lead = CFG.pose.block.lead / UNITS_TO_METRES;
        const at = (x) => blockersEngaged(
            [man('wr1', 0, 0, 0), man('db1', 1, x, 0), carrying('wr2')],
            carrying('wr2')
        );
        // In front of him, and a full block.
        expect(at(near).get('wr1').amount).toBeCloseTo(
            at(near).get('db1').amount, 10);
        expect(at(lead).get('wr1').amount).toBeGreaterThan(0.99);
        // Level with him, and nothing at all.
        expect(at(0).has('wr1')).toBe(false);
        // Beaten, and still nothing however close he is.
        expect(at(-near).has('wr1')).toBe(false);
    });

    /** IT IS A RAMP AND NOT A TEST, because a boolean read off a distance that
     *  wanders across zero is the oldest way there is to make something
     *  flicker. Half way across the lead is half a block. */
    test('and it eases across the line rather than snapping', () => {
        const half = (CFG.pose.block.lead / 2) / UNITS_TO_METRES;
        const pair = blockersEngaged(
            [man('wr1', 0, 0, 0), man('db1', 1, half, 0), carrying('wr2')],
            carrying('wr2')
        );
        expect(pair.get('wr1').amount).toBeGreaterThan(0.1);
        expect(pair.get('wr1').amount).toBeLessThan(0.9);
    });

    /**
     * AND THE LINE IS LEFT ALONE, DELIBERATELY. A lineman has one job, so being
     * engaged is his resting state and nothing about him has to read as
     * running. A receiver has two, and the block is the pose that says which of
     * them he is doing. Measured, 31.9% of the line's blocks are against a man
     * behind them as well; that is a lineman doing his job badly, not a lineman
     * drawn wrong.
     */
    test('a lineman still holds a man who has slipped past him', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const pair = blockersEngaged(
            [man('x1', 0, 0, 0), man('db1', 1, -near, 0), quarterback()],
            quarterback()
        );
        expect(pair.get('x1')).toMatchObject({ against: 'db1' });
    });

    /**
     * NOT AFTER AN INTERCEPTION. With the ball going the other way a receiver
     * is a tackler, and men who have just lost it putting their arms up to
     * block would read as a team that had not noticed.
     */
    test('a receiver does not block for the man who just intercepted it', () => {
        const near = 1.0 / UNITS_TO_METRES;
        const thief = {
            settings: { position: 'db2', team: 1, benched: false, positionGroup: 'db' },
            coords: { x: 0, y: 500, z: 1 },
            state: { xSpeed: 0, ySpeed: 0, hasBall: true },
        };
        const pair = blockersEngaged([man('wr1', 0, 0, 0), man('db1', 1, near, 0), thief], thief);
        expect(pair.has('wr1')).toBe(false);
        // ...and the line is unchanged, which is deliberate: it is a separate
        // question and round nine's work is not this round's to disturb.
        const withLine = blockersEngaged([man('x1', 0, 0, 0), man('db1', 1, near, 0), thief], thief);
        expect(withLine.has('x1')).toBe(true);
    });

    /**
     * AND THEIR HANDS REACH EACH OTHER. `separation` holds two bodies a body's
     * width apart, so a pose that stops short of that is two men pushing at
     * thin air between them. Stated against the distance the game actually
     * holds them at rather than a number that felt about right.
     */
    test('the pose reaches across the gap the game holds them at', () => {
        const chestGap = CFG.separation - 0.22 * CFG.figureScale;   // torso depth
        const forward = CFG.pose.block.hand.z * CFG.figureScale;
        expect(forward).toBeGreaterThanOrEqual(chestGap);
        // ...and level with the shoulder rather than down at the ribs.
        expect(CFG.pose.block.hand.y).toBeGreaterThanOrEqual(RIG.shoulderY);
    });

    /**
     * THE BLOCK CAN ACTUALLY FINISH, WHICH IT COULD NOT.
     *
     * The ramp ran to full commitment at HALF the reach, 1.30m, and two bodies
     * in this game are never closer than `separation` at 1.45m. So the pose was
     * unreachable by construction: measured over 204 plays, a pair the pose
     * calls engaged sits a median 2.23m apart, at which it was 28% of the way
     * into a block with both men's hands 0.21m short of each other. QA read it
     * as "a blitzer often doesn't get close enough to the blocker for them to
     * lock arms", and they never locked because it never finished.
     */
    test('a block completes at a distance two bodies can actually be', () => {
        const B = CFG.pose.block;
        expect(B.lock).toBeGreaterThan(CFG.separation);
        expect(B.lock).toBeLessThan(B.reach);
        // The measured median engagement, which is where the physics parks a
        // pair, has to be a finished block rather than a quarter of one.
        const at = (d) => Math.min(1, Math.max(0, (B.reach - d) / (B.reach - B.lock)));
        expect(at(2.23)).toBe(1);
        expect(at(B.reach + 0.01)).toBe(0);
    });

    /**
     * AND THE LEAN CLOSES A GAP THE ARMS CANNOT.
     *
     * A lineman's collision box is 2.38m across against a drawn body of 1.45m,
     * so the game holds an engaged pair further apart than two men can reach.
     * The figures close it themselves. The property is that at the distance
     * they are actually held at, leaning, their hands MEET, and that at the
     * closest the physics ever puts them their heads still do not.
     */
    test('leaning into it is what makes their hands meet', () => {
        const B = CFG.pose.block;
        const F = CFG.figureScale;
        // How far forward a hand gets, pitched about the figure's own feet.
        const reachAt = (lean) => (B.hand.z * Math.cos(lean)
            + B.hand.y * Math.sin(lean)) * F;

        expect(reachAt(B.lean) * 2).toBeGreaterThan(2.25);   // the median pair
        expect(reachAt(0) * 2).toBeLessThan(2.25);           // and without it

        // At the closest the physics ever holds a pair, their heads still have
        // room: a shoulder only comes forward by so much.
        const shoulder = RIG.shoulderY * F * Math.sin(B.lean);
        expect(shoulder * 2).toBeLessThan(1.58 - 0.4);
    });
});

describe('the keyboard', () => {
    /**
     * QA ROUND NINE, ITEM 7. The letters are the ones already painted on the
     * grass, on the playbook diagram and on the buttons, so the keys are what a
     * visitor has been reading all along rather than a scheme to learn.
     */
    test('the receivers letters throw, and Q, S and space snap', () => {
        for (const key of ['A', 'B', 'C', 'D']) {
            expect(keyAction(key)).toBe(key);
            expect(keyAction(key.toLowerCase())).toBe(key);
        }
        for (const key of [' ', 'S', 's', 'Q', 'q']) expect(keyAction(key)).toBe('snap');
        expect(keyAction('K')).toBe('keep');
        // V switches the replay camera. It reaches nothing at any other time,
        // because the row it presses only exists during a replay.
        expect(keyAction('V')).toBe('view');
        expect(keyAction('v')).toBe('view');
    });

    /**
     * AND NO TWO ACTIONS ANSWER TO THE SAME KEY, which is the property rather
     * than a list: adding a binding that collides with one already there is the
     * mistake, and it would show up as a button somebody could never press.
     */
    test('every binding is its own key', () => {
        const keys = ['A', 'B', 'C', 'D', ' ', 'S', 'Q', 'K', 'V'];
        const seen = new Map();
        for (const key of keys) {
            const act = keyAction(key);
            expect(act).not.toBe('');
            const had = seen.get(key);
            expect(had === undefined || had === act).toBe(true);
            seen.set(key, act);
        }
        // Snap has three keys and the rest have one each, so nine keys reach
        // seven actions.
        expect(new Set(seen.values()).size).toBe(7);
    });

    test('and every letter that means something on screen has a control', () => {
        // A binding that names a receiver the game does not have is a key that
        // does nothing, so the two tables have to agree.
        const letters = Object.values(CFG.receivers).map((r) => r.letter).sort();
        expect(letters).toEqual(['A', 'B', 'C', 'D']);
    });

    test('nothing fires while somebody is typing, or with a modifier held', () => {
        expect(keyAction('A', { inField: true })).toBe('');
        expect(keyAction(' ', { inField: true })).toBe('');
        expect(keyAction('S', { modified: true })).toBe('');
        // Reload, find, and every other browser shortcut stays the browser's.
        expect(keyAction('R', { modified: true })).toBe('');
    });

    /**
     * SPACE PRESSES THE CONTROL IT IS ON, NOT THE SNAP (accessibility sweep,
     * 2026-09-14). Before the snap, a visitor who tabbed to "Change play" or
     * the sound button and pressed Space snapped the ball, because the space
     * bar is a snap key and the handler took it from the focused button.
     */
    test('the space bar is left to a focused control, and only the space bar', () => {
        expect(keyAction(' ', { onControl: true })).toBe('');
        expect(keyAction(' ')).toBe('snap');
        // The letters are nobody else's, so they still work with a button focused.
        expect(keyAction('S', { onControl: true })).toBe('snap');
        expect(keyAction('A', { onControl: true })).toBe('A');
        expect(keyAction('Escape', { onControl: true })).toBe('skip');
    });

    test('and no other key does anything at all', () => {
        // Escape is not on this list any more: it presses whichever Skip is on
        // screen (see xo-milestones.test.mjs).
        for (const key of ['E', 'Z', '1', 'Enter', 'Tab', 'ArrowLeft', '']) {
            expect(keyAction(key)).toBe('');
        }
        expect(keyAction(undefined)).toBe('');
    });
});

describe('the scoreboard is in shot', () => {
    /**
     * QA ROUND TEN, ITEM 1: "could we re-add the scoreboard". It was never
     * removed. D147 traded a 28 degree lens for an 18 degree one, and a longer
     * lens is a narrower frame, so the board's face landed at 1.38 in a frame
     * that ends at 1.0 and went off the top of the screen.
     *
     * The frame's top edge is a ray `fov / 2` below the camera's own pitch, so
     * whether a point is in shot is arithmetic rather than an opinion. This
     * asserts it for the board's HIGHEST corner, which is the one that leaves
     * first, on every screen shape the game solves for.
     */
    const inShot = (aspect, x, y) => {
        const shot = framingFor(aspect);
        const cam = { x: FIELD.lineInterval - shot.back, y: shot.height };
        // The camera aims at the ground, so its pitch is the angle down to the
        // aim point, and the top of the frame is half a field of view above it.
        const pitch = Math.atan2(cam.y, shot.aimX - cam.x);
        const top = pitch - (shot.fov * Math.PI / 180) / 2;
        const toPoint = Math.atan2(cam.y - y, x - cam.x);
        // Larger angle means further below the top edge, so in shot.
        return toPoint > top;
    };

    test('every corner of the board is inside the frame, on every shape', () => {
        const B = CFG.scoreboard;
        const x = FIELD.lineInterval * FIELD.segments + FIELD.endZone + B.beyond;
        for (const aspect of [1196 / 826, 16 / 9, 4 / 3, 393 / 852, 852 / 393]) {
            expect({ aspect, top: inShot(aspect, x, B.standHeight + B.height) })
                .toEqual({ aspect, top: true });
            expect(inShot(aspect, x, B.standHeight)).toBe(true);
        }
    });

    test('and it still stands behind the end line rather than on the field', () => {
        expect(CFG.scoreboard.beyond).toBeGreaterThan(0);
        expect(CFG.scoreboard.standHeight).toBeGreaterThan(0);
    });

    /**
     * ...AND NOW SIDEWAYS TOO, BECAUSE THE BOARD GOT WIDER.
     *
     * The vertical test above is the one that mattered while the board was 13m
     * across: width was never close to anything. It is 18m now, and the frame a
     * phone in PORTRAIT sees is the hard case, because `camera.fov` is VERTICAL
     * and an upright phone therefore sees a fraction of the desktop width.
     *
     * Measured, the tightest shape the game solves for still shows 31m of width
     * where the board stands, so even a full 21m board would clear it. That is
     * exactly why this is worth pinning: the margin is large, nobody would
     * notice it shrinking, and the next person to widen the board has no reason
     * to suspect a limit exists at all.
     */
    test('the whole board is inside the frame sideways, on every shape', () => {
        const B = CFG.scoreboard;
        const x = FIELD.lineInterval * FIELD.segments + FIELD.endZone + B.beyond;
        // The shell is the widest part of the assembly, not the face.
        const halfShell = (B.width + 0.7) / 2;
        for (const aspect of [393 / 852, 0.75, 1, 4 / 3, 16 / 9, 852 / 393]) {
            const shot = framingFor(aspect);
            const cam = { x: FIELD.lineInterval - shot.back, y: shot.height };
            const vHalf = (shot.fov * Math.PI / 180) / 2;
            const hHalf = Math.atan(Math.tan(vHalf) * aspect);
            const range = Math.hypot(x - cam.x, cam.y - (B.standHeight + B.height / 2));
            const halfVisible = Math.tan(hHalf) * range;
            expect({ aspect, fits: halfShell < halfVisible })
                .toEqual({ aspect, fits: true });
        }
    });

    /**
     * ...AND THERE IS NOT AN EIGHTH OF A PHONE SCREEN OF NIGHT ABOVE IT.
     *
     * QA ROUND TWENTY-SIX, ITEM 3: "on mobile in portrait the field could be
     * moved toward the top of the screen, there is a lot of empty space above
     * the scoreboard". Measured on a 390x846 phone the board's top corner sat
     * 13.3% down the frame against 2.8% on every landscape shape, because the
     * solve pins only the BOTTOM edge and a phone needs a 60 degree lens to fit
     * the field's width, which then sees 66 metres of ground down a 42 metre
     * field. All the spare landed at the top.
     *
     * WHERE A POINT SITS IN THE FRAME, rather than merely whether it is in it,
     * which is what the test above asks. Both halves are needed: this one alone
     * would be satisfied by a shot that had pushed the board off the top.
     */
    const frameAt = (aspect, x, y) => {
        const shot = framingFor(aspect);
        const cam = { x: FIELD.lineInterval - shot.back, y: shot.height };
        const pitch = Math.atan2(cam.y, shot.aimX - cam.x);
        const vHalf = (shot.fov * Math.PI / 180) / 2;
        const a = Math.atan2(cam.y - y, x - cam.x);
        // 0 at the top edge of the frame, 1 at the bottom.
        return (Math.tan(a - pitch) / Math.tan(vHalf) + 1) / 2;
    };

    test('the frame above the scoreboard is headroom and no more', () => {
        const B = CFG.scoreboard;
        const x = FIELD.lineInterval * FIELD.segments + FIELD.endZone + B.beyond;
        const room = CFG.camera.solve.headroom;
        for (const aspect of [390 / 846, 393 / 852, 360 / 780, 820 / 1180, 0.75]) {
            const above = frameAt(aspect, x, B.standHeight + B.height);
            // In shot at all, and inside the headroom the config allows. A hair
            // of tolerance because the aim is solved from the board's corner and
            // the shot is only re-aimed when it is currently looser than this.
            expect({ aspect, above: above > 0 && above <= room + 0.005 })
                .toEqual({ aspect, above: true });
        }
    });

    /** ...and the shapes that were already tight are left exactly alone, which
     *  is what keeps this from being a change to the landscape shot. */
    test('a landscape frame is not re-aimed at all', () => {
        for (const aspect of [16 / 9, 4 / 3, 1196 / 826, 852 / 393]) {
            const shot = framingFor(aspect);
            const mid = FIELD.lineInterval * FIELD.segments / 2;
            expect({ aspect, aim: shot.aimX }).toEqual({ aspect, aim: mid });
        }
    });

    /**
     * AND THE WHOLE FIELD IS STILL IN THE PICTURE. Tilting down to fill the top
     * of the frame walks the bottom edge back behind the near end line, and the
     * one thing this must never cost is the ground a play starts on.
     */
    test('both end lines are in shot on every shape', () => {
        const len = FIELD.lineInterval * FIELD.segments;
        for (const aspect of [390 / 846, 393 / 852, 0.75, 1, 4 / 3, 16 / 9]) {
            const near = frameAt(aspect, -FIELD.endZone, 0);
            const far = frameAt(aspect, len + FIELD.endZone, 0);
            expect({ aspect, near: near > 0 && near < 1, far: far > 0 && far < 1 })
                .toEqual({ aspect, near: true, far: true });
        }
    });

    /**
     * THE PANELS, WHICH ARE WEIGHTED RATHER THAN EQUAL. QA asked for the clock
     * to be "roughly the same size as the POINTS area", and PLAY has to stay
     * wider than both because "10 / 10" is seven characters against two.
     */
    test('the clock panel matches the points panel, and PLAY is wider', () => {
        const cols = boardColumns(1024, { play: 10, of: 10, score: -100, clock: '10' });
        const by = (name) => cols.find((c) => c.label === name);
        expect(by('CLOCK').span).toBeCloseTo(by('POINTS').span, 6);
        expect(by('PLAY').span).toBeGreaterThan(by('POINTS').span * 1.2);
    });

    test('the panels tile the whole board with no gap and no overlap', () => {
        const width = 1024;
        const cols = boardColumns(width, { play: 1, of: 10, score: 0, clock: '10' });
        expect(cols.reduce((sum, c) => sum + c.span, 0)).toBeCloseTo(width, 6);
        let edge = 0;
        for (const col of cols) {
            expect(col.centre).toBeCloseTo(edge + col.span / 2, 6);
            edge = col.edge;
        }
        expect(edge).toBeCloseTo(width, 6);
    });

    /**
     * AND THE LONGEST STRING EACH PANEL CAN EVER HOLD STILL FITS ITS OWN SAFE
     * AREA. The old board drew a fixed-size play count into a half that could
     * not hold it and ran off the edge of the panel, which read as the numbers
     * being off-centre. `updateScoreboard` measures and shrinks to fit, so this
     * checks the case that shrinking has to cope with rather than the happy one.
     */
    test('the worst string each panel can hold is not wider than the panel', () => {
        const worst = boardColumns(1024, {
            play: CFG.rules.playsPerGame, of: CFG.rules.playsPerGame,
            // Ten plays at the worst the ladder pays.
            score: -10 * 10, clock: `${CFG.clock.decide}`,
        });
        for (const col of worst) {
            // A rough upper bound on Tahoma bold at the board's own size: no
            // glyph in a numeral string is wider than 0.62 em.
            const em = Math.round(1024 * (CFG.scoreboard.height / CFG.scoreboard.width) * 0.42);
            expect(col.value.length * em * 0.62).toBeGreaterThan(0);
            expect(col.span * 0.78).toBeGreaterThan(em * 0.62);
        }
    });
});

describe('the ball arrives where hands are', () => {
    /**
     * QA ROUND TEN, ITEM 2 turned out to rest on this. `ball.release` was 0.28m
     * and its own comment said why: "the same value has to leave a hand and then
     * lie on the turf". A hand is 3.5m up at this figure scale. Measured over
     * 612 throws, the ball was a median 0.60m off the ground at the frame a
     * receiver was closest to it, so every pass in the game arrived below his
     * knee, and nobody jumps for that.
     */
    test('the arc starts and ends above a receiver waist, not at his feet', () => {
        const waist = 0.9 * CFG.figureScale;
        expect(CFG.ball.release).toBeGreaterThan(waist);
    });

    test('and the peak stays a sane height over a player', () => {
        const player = 1.75 * CFG.figureScale;
        const peak = CFG.ball.release + CFG.ball.apex;
        expect(peak).toBeGreaterThan(player);
        expect(peak).toBeLessThan(player * 2.2);
    });

    /**
     * AND THE JUMP ONLY HAPPENS FOR A BALL THAT IS GENUINELY OVER HIS HEAD.
     *
     * This is the number the whole feature turns on. Everything else was swept
     * and none of it separated: at a ball merely level with his hands a receiver
     * leaves his feet on 86% of throws, whatever the range and whether or not
     * the closest approach is solved for. Requiring real clearance takes it to
     * 22%, and one step further takes it to never.
     */
    test('a jump asks for clearance over his own fingertips', () => {
        const J = CFG.pose.jump;
        expect(J.clearance).toBeGreaterThan(0);
        // And the band it opens is reachable: there is no point asking for
        // clearance a jump of this size could never cover.
        expect(J.clearance).toBeLessThan(J.lift);
        expect(J.hang).toBeGreaterThan(0.3);
        expect(J.range).toBeGreaterThan(0);
    });
});

describe('looking round a replay', () => {
    /**
     * QA ROUND TEN, ITEM 4. The adjustment is an OFFSET on the director's shot
     * rather than a takeover, so the replay goes on establishing, tracking and
     * settling underneath it. That is the interesting property and it is the one
     * that can go wrong: an orbit that quietly changes the distance, or a zoom
     * that walks the camera into the ground, are both invisible in a screenshot.
     */
    const shot = () => ({
        position: { x: 10, y: 6, z: 8 },
        target: { x: 0, y: 1, z: 0 },
        fov: 40,
    });
    const radius = (s) => Math.hypot(
        s.position.x - s.target.x, s.position.y - s.target.y, s.position.z - s.target.z
    );

    test('an untouched view is the director shot, to the last decimal', () => {
        resetView();
        expect(applyView(shot())).toEqual(shot());
    });

    test('orbiting turns around the subject without moving nearer to it', () => {
        const before = shot();
        const after = applyView(before, { yaw: 0.9, lift: 0, zoom: 1 });
        expect(radius(after)).toBeCloseTo(radius(before), 6);
        // It has genuinely moved, and it still points at the same place.
        expect(after.position.x).not.toBeCloseTo(before.position.x, 3);
        expect(after.target).toEqual(before.target);
        expect(after.fov).toBe(before.fov);
    });

    test('zooming moves along the line to the subject, not past it', () => {
        const before = shot();
        const closer = applyView(before, { yaw: 0, lift: 0, zoom: 0.5 });
        expect(radius(closer)).toBeCloseTo(radius(before) * 0.5, 6);
        const further = applyView(before, { yaw: 0, lift: 0, zoom: 2 });
        expect(radius(further)).toBeCloseTo(radius(before) * 2, 6);
    });

    test('and it can never end up under the pitch', () => {
        // All the way down, and all the way in, which is the corner a visitor
        // finds by dragging until it stops.
        for (const zoom of [0.45, 1, 2.4]) {
            const under = applyView(shot(), { yaw: 0, lift: -3, zoom });
            expect(under.position.y).toBeGreaterThan(0);
        }
    });

    test('the limits hold however hard somebody drags', () => {
        resetView();
        for (let i = 0; i < 200; i += 1) nudgeView({ lift: 0.5, zoom: 0.5 });
        const hard = getView();
        expect(hard.zoom).toBeGreaterThan(0);
        expect(Number.isFinite(hard.lift)).toBe(true);
        const s = applyView(shot(), hard);
        expect(Number.isFinite(s.position.x)).toBe(true);
        expect(s.position.y).toBeGreaterThan(0);
        resetView();
        expect(getView()).toMatchObject({ yaw: 0, lift: 0, zoom: 1 });
    });
});

describe('the playbook opens on the play you just called', () => {
    /**
     * QA ROUND TEN, ITEM 3, and it is what the 2D game does: the play you just
     * called is the FIRST card in the book and is still in its own place, so
     * running it again is one press and browsing the book is unchanged.
     */
    test('the repeat card is a second card, not a moved one', () => {
        // The property, stated against the play list rather than the DOM: every
        // play still has exactly one home, so the grid cannot develop a hole.
        const slugs = PLAYS.map((p) => p.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        expect(slugs.length).toBeGreaterThan(10);
    });
});

describe('walking to a new formation', () => {
    /**
     * QA ROUND ELEVEN. Changing the play before the snap moves every figure on
     * the field, sometimes right across it. The drawn position normally eases
     * toward the simulated one over `motionSmooth`, which is fifty milliseconds
     * and exists to smooth a stepped simulation feed: run a ten metre
     * relocation through it and everybody teleports.
     *
     * THE JOG IS NOT ANIMATED, IT IS A CONSEQUENCE. Every part of how a figure
     * looks while moving is already derived from the position that was DRAWN,
     * so carrying him along a curve makes him run along it. What the test can
     * assert is the curve.
     */
    const qb = () => [{
        settings: { position: 'qb', team: 0, benched: false, positionGroup: 'qb' },
        coords: { x: 200, y: 300, z: 0 },
        state: { xSpeed: 0, ySpeed: 0, hasBall: true },
    }];

    test('it runs for the time the config says and then stops', () => {
        resetRelocate();
        expect(relocateProgress()).toBe(-1);

        beginRelocate();
        expect(relocateProgress()).toBe(0);

        const step = 0.05;
        let elapsed = 0;
        let last = 0;
        // Halfway, and it should be halfway: a smoothstep is symmetric.
        while (elapsed < CFG.pose.relocate.time / 2 - step) {
            syncFigures(qb(), step, { presnap: true });
            elapsed += step;
            const now = relocateProgress();
            expect(now).toBeGreaterThanOrEqual(last);      // never goes backwards
            last = now;
        }
        expect(relocateProgress()).toBeGreaterThan(0.3);
        expect(relocateProgress()).toBeLessThan(0.7);

        while (elapsed < CFG.pose.relocate.time + step * 2) {
            syncFigures(qb(), step, { presnap: true });
            elapsed += step;
        }
        expect(relocateProgress()).toBe(-1);
    });

    /**
     * AND IT EASES AT BOTH ENDS, which is the difference between a team getting
     * set and seventeen figures launched across the field. An exponential ease
     * starts at full speed, which is why this is a timed smoothstep instead.
     */
    test('it starts slowly and arrives slowly', () => {
        resetRelocate();
        beginRelocate();
        const step = CFG.pose.relocate.time / 20;
        const samples = [];
        for (let i = 0; i < 20; i += 1) {
            syncFigures(qb(), step, { presnap: true });
            samples.push(relocateProgress());
        }
        const speeds = samples.slice(1).map((v, i) => v - samples[i]);
        const middle = speeds[Math.floor(speeds.length / 2)];
        // The first and last steps cover less ground than the middle one.
        expect(speeds[0]).toBeLessThan(middle);
        expect(speeds[speeds.length - 2]).toBeLessThan(middle);
        resetRelocate();
    });

    test('and a new play cancels a walk that was still running', () => {
        resetRelocate();
        beginRelocate();
        expect(relocateProgress()).toBe(0);
        resetRelocate();
        expect(relocateProgress()).toBe(-1);
    });
});

describe('a replay draws the same arc the play did', () => {
    /**
     * QA ROUND THIRTEEN: a receiver jumps for the ball live and never jumps in
     * the replay of the same catch.
     *
     * THE JUMP IS DERIVED FROM THE DRAWN BALL, so a replay that draws a
     * different ball gets a different answer. `flight.span` is the throw's
     * start, target and length, cached the first time the ball is seen in the
     * air, and it exists precisely because the recorder stores none of it:
     * `frameAt` rebuilds each object from six floats, so in playback the ball
     * has no idea where it was aimed.
     *
     * `endFlight` was clearing that cache, and it runs on every frame the ball
     * is HELD, which includes every frame of a replay before the recorded
     * throw. So it was reliably wiped a second before the only moment it was
     * needed, `arcHeight` fell back to the index, and the index is the clamped
     * ramp the span exists to replace: it saturates a third of the way up and
     * cruises flat across the top, well ABOVE the jump's band.
     *
     * The property: a throw's span survives the ball being in somebody's hands,
     * and does not survive the next play.
     */
    const flying = () => ({
        settings: { position: 'ball', benched: false },
        coords: {
            x: 300, y: 300, z: 2,
            startX: 200, startY: 300, targetX: 800, targetY: 300,
        },
        state: { xSpeed: 4, ySpeed: 0 },
    });
    const holder = (position) => ({
        settings: { position, team: 0, benched: false },
        coords: { x: 800, y: 300, z: 1 },
        state: { xSpeed: 0, ySpeed: 0, hasBall: true },
    });

    beforeAll(async () => {
        // THE MIN BUILD, DELIBERATELY. view.js imports `./ball.min.js`, so that
        // is the module instance holding the mesh it reads: initialising the
        // source file builds a ball in a different copy of the module and
        // `syncBall` goes on returning early because it can still see nothing
        // to draw. Same family as config defaults coming from the min build.
        const { initBall } = await import(join(scene, 'ball.min.js'));
        initBall({ add() {} });
    });

    test('the throw is remembered once the ball is in somebody hands', () => {
        resetBallFlight();
        expect(ballSpan()).toBeFalsy();

        // In the air: the span is cached from the ball's own aim.
        syncBall(flying(), null, 1 / 60);
        const span = ballSpan();
        expect(span).toBeTruthy();
        expect(span.total).toBeGreaterThan(0);

        // Caught, and then carried for a while, which is what a replay spends
        // its first second or two doing.
        for (let i = 0; i < 60; i += 1) syncBall(null, holder('wr1'), 1 / 60);
        expect(ballSpan()).toBe(span);
    });

    test('and it is forgotten when the next play lines up', () => {
        resetBallFlight();
        syncBall(flying(), null, 1 / 60);
        expect(ballSpan()).toBeTruthy();
        resetBallFlight();
        expect(ballSpan()).toBeFalsy();
    });

    /**
     * AND WITHOUT IT THE ARC IS A DIFFERENT SHAPE, which is the part that
     * actually reached QA. Stated against the two heights rather than against
     * the code: the index fallback is flat across the top, and a ball parked up
     * there is above anything a receiver can jump to.
     */
    test('the fallback arc sits above the jump band, which is why it mattered', () => {
        const B = CFG.ball;
        const J = CFG.pose.jump;
        const reach = (RIG.shoulderY + RIG.upper + RIG.lower) * CFG.figureScale
            + 0.055 * CFG.figureScale;
        // The index fallback at its ceiling, which is where it spends most of a
        // flight once it saturates.
        const flat = B.release + B.apex;
        expect(flat).toBeGreaterThan(reach + J.lift);
    });
});

describe('the replay camera keeps its shoulder', () => {
    /**
     * QA ROUND FOURTEEN: during a replay the camera toggles between two angles
     * rapidly, which reads as flickering.
     *
     * The shot rounds the shoulder AWAY from the carrier so its arc crosses the
     * middle of the field, and that was `focus.z > 0 ? -1 : 1`, read fresh every
     * frame. A carrier anywhere near the middle makes the sign of his own z
     * chatter, and the camera cut 180 degrees every time it did. Measured over
     * 102 recorded plays: a mean of 1.6 swaps per replay, a worst case of 16,
     * and 137 of the 160 arriving less than a second after the one before.
     */
    const R = () => CFG.camera.replay;
    const step = 1 / 60;

    /** Run a track of z positions through it and collect the side each frame. */
    const play = (track) => {
        resetShoulder();
        return track.map((z, i) => shoulderFor(z, i === 0 ? 0 : step));
    };

    test('a carrier hovering on the middle never swaps at all', () => {
        // The chatter that caused it: a hair either side of the centre line.
        const track = [];
        for (let i = 0; i < 60 * 6; i += 1) track.push(i % 2 ? 0.4 : -0.4);
        const sides = play(track);
        // He started on one side and he is still on it six seconds later.
        expect(Math.sign(sides[0])).toBe(Math.sign(sides[sides.length - 1]));
        for (const side of sides) expect(Math.abs(side)).toBeGreaterThan(0.9);
    });

    test('it opens on the side the carrier asks for, with no swing', () => {
        expect(play([6])[0]).toBe(-1);
        expect(play([-6])[0]).toBe(1);
    });

    /**
     * AND WHEN IT DOES CHANGE IT SWINGS, which is the difference between a
     * camera move and a cut. Halfway through, `side` is near zero, which puts
     * the camera straight behind the carrier: a real shot on the way through.
     */
    test('a genuine change is a swing rather than a cut', () => {
        resetShoulder();
        shoulderFor(-6, 0);                       // settled on one side
        for (let i = 0; i < 60 * (R().shoulderHold + 0.2); i += 1) shoulderFor(-6, step);
        const before = shoulderFor(-6, step);
        expect(before).toBeCloseTo(1, 3);

        // Four time constants, which is where an exponential ease has all but
        // arrived. It never arrives exactly, and that is fine: what matters is
        // that it is committed to the other side long before then.
        const swing = [];
        const frames = Math.round(60 * R().shoulderEase * 4);
        for (let i = 0; i < frames; i += 1) swing.push(shoulderFor(6, step));
        expect(swing[swing.length - 1]).toBeLessThan(-0.9);
        // ...and it passes through the middle rather than jumping.
        expect(swing.some((s) => Math.abs(s) < 0.3)).toBe(true);
        // No single frame moves it more than a fraction of the way.
        for (let i = 1; i < swing.length; i += 1) {
            expect(Math.abs(swing[i] - swing[i - 1])).toBeLessThan(0.15);
        }
    });

    test('and it cannot change more often than the hold allows', () => {
        resetShoulder();
        shoulderFor(-6, 0);
        // Ask it to swap sides as fast as it possibly can, for ten seconds.
        let changes = 0;
        let last = 1;
        for (let i = 0; i < 60 * 10; i += 1) {
            const z = Math.floor(i / 30) % 2 ? 6 : -6;   // flip every half second
            const side = shoulderFor(z, step);
            const now = side > 0.05 ? 1 : (side < -0.05 ? -1 : 0);
            if (now !== 0 && now !== last) { changes += 1; last = now; }
        }
        // Ten seconds at a four second hold is two, and the ease costs some of
        // the third. QA asked for one change every three to five seconds.
        expect(changes).toBeLessThanOrEqual(Math.ceil(10 / R().shoulderHold));
    });

    /**
     * AND THE DRIVER STILL TAKES THE SIDE AS AN ARGUMENT, so the shot itself
     * stays pure and the memory lives in one place.
     */
    test('the two shoulders are mirror images of each other', () => {
        const focus = { x: 14, y: 0, z: 0 };
        const near = replayDriver(0.5, focus, 1);
        const far = replayDriver(0.5, focus, -1);
        expect(near.position.z).toBeCloseTo(-far.position.z, 6);
        expect(near.position.x).toBeCloseTo(far.position.x, 6);
        expect(near.position.y).toBeCloseTo(far.position.y, 6);
    });
});

describe('the view tells the simulation who is in the air', () => {
    /**
     * QA ROUND FIFTEEN. The jump is decided by the view, because it is the only
     * half that knows where the ball really is: it reads the drawn parabola
     * against the man's real reach, where the simulation has only `getZIndex`,
     * a clamped ramp view.js itself stopped believing. A catch that then refused
     * him is a receiver leaving his feet with the ball half a metre away and
     * coming down with nothing.
     *
     * IT CROSSES AS A PLAIN FLAG ON A PLAIN OBJECT, which is what keeps
     * PLANNING D1 intact: play.js and motion.js still never import THREE, and
     * neither knows why anybody is airborne.
     */
    /**
     * WHAT CROSSES IS WHO HAS LEFT HIS FEET. Whether the ball has reached him
     * yet is the simulation's call on its own clock (`play.landLeaps`), so the
     * catch box is not handed over here.
     */
    test('the flag lands on the named men and comes off everybody else', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        const named = new Set(['wr1', 'wr3']);

        expect(markAirborne(play, named)).toBe(2);
        for (const obj of play.game.objects) {
            if (!obj.state) continue;
            expect({ p: obj.settings.position, up: obj.state.leaping })
                .toEqual({ p: obj.settings.position, up: named.has(obj.settings.position) });
        }

        // And it is cleared rather than left behind, which is the failure that
        // would leave somebody permanently able to catch anything.
        for (const obj of play.game.objects) {
            if (obj.state && named.has(obj.settings.position)) obj.state.airborne = true;
        }
        expect(markAirborne(play, new Set())).toBe(0);
        for (const obj of play.game.objects) {
            if (!obj.state) continue;
            expect(obj.state.airborne).toBe(false);
            expect(obj.state.leaping).toBe(false);
        }
    });

    test('an empty set is what a play with nobody up looks like', () => {
        const play = createPlay();
        lineUp(play, 'pass2', 'cover1');
        expect(markAirborne(play)).toBe(0);
    });

    /**
     * AND ONLY THE MAN IT WAS THROWN AT LEAVES HIS FEET.
     *
     * Measured with anybody allowed to go up: 47 of 47 jumps that ended in no
     * catch were a receiver who was NOT the target. The ported rule lets only
     * the intended man catch a pass, so everyone else was leaving his feet for
     * a ball he could never have. With the jump restricted to him, every jump
     * ends in a catch, and there are fewer of them.
     *
     * The view finds him from the throw's own target, which `flight.span`
     * carries, so it answers the same in a replay: playback has no `throwTo`
     * and the span survives the play.
     */
    test('the throw remembers where it was aimed, not just how far', () => {
        resetBallFlight();
        syncBall({
            settings: { position: 'ball', benched: false },
            coords: {
                x: 300, y: 300, z: 2,
                startX: 200, startY: 300, targetX: 800, targetY: 420,
            },
            state: { xSpeed: 4, ySpeed: 0 },
        }, null, 1 / 60);
        const span = ballSpan();
        expect(span.tx).toBe(800);
        expect(span.ty).toBe(420);
        resetBallFlight();
    });
});

describe('he turns to the ball rather than reaching out of his own back', () => {
    /**
     * QA ROUND NINETEEN. A ball passing close behind a player put both his arms
     * straight out BACKWARDS, through his own back, and two short recordings of
     * it made the shape unmistakable.
     *
     * Nothing was broken. `reachAt` is the ball expressed in the figure's own
     * space, arm.js solves for whatever target it is handed, and no part of
     * that chain had ever been told that the ball could be behind him. So the
     * fix is two rules, and they are separate because they answer different
     * questions: WHICH WAY IS HE FACING, and WHERE WILL AN ARM GO.
     */
    const deg = (r) => (r * 180) / Math.PI;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    test('a runner turns toward it and no further than his stride allows', () => {
        // Running straight down the field, ball dead behind him.
        expect(deg(turnFor(Math.PI, 0))).toBeCloseTo(deg(CFG.pose.turnLimit), 6);
        expect(deg(turnFor(-Math.PI, 0))).toBeCloseTo(-deg(CFG.pose.turnLimit), 6);
        // ...and a ball he could already see does not move him off his line by
        // one degree more than it takes to look at it.
        expect(turnFor(0.4, 0)).toBeCloseTo(0.4, 6);
        expect(turnFor(-1.2, 0)).toBeCloseTo(-1.2, 6);
    });

    test('the cap is measured against his line, not against the field', () => {
        // The same ball, the same man, running the other way: the cap has to
        // travel with him or it is a rule about the stadium.
        // Dead behind him, so which shoulder he looks over is a coin toss and
        // only the size of the turn is a claim worth making.
        const running = 2.5;
        const want = wrap(running + Math.PI);
        expect(Math.abs(wrap(turnFor(want, running) - running)))
            .toBeCloseTo(CFG.pose.turnLimit, 6);
        // Off one shoulder, where the side is not a coin toss at all.
        const off = wrap(running + 2.6);
        expect(wrap(turnFor(off, running) - running))
            .toBeCloseTo(CFG.pose.turnLimit, 6);
    });

    /**
     * A MAN WHO HAS STOPPED HAS NO STRIDE TO PROTECT. The cap exists so a
     * receiver is not drawn sprinting backwards down the field, which is not a
     * risk for somebody standing still waiting on the ball, and turning him
     * only part of the way would leave him watching it over his shoulder with
     * nowhere to go.
     */
    test('a man standing still turns the whole way round', () => {
        expect(turnFor(Math.PI, null)).toBe(Math.PI);
        expect(turnFor(-2.9, null)).toBe(-2.9);
    });

    test('an arm does not go out the back of the shoulder it hangs from', () => {
        const behind = { x: 0.1, y: 1.9, z: -0.62 };
        const held = frontOf(behind);
        // Stated as a fact about a shoulder rather than as whatever the config
        // happens to say: a hand goes past square and it does not go round to
        // the shoulder blade. Reading the limit back out of the config here
        // would make the test agree with any number somebody put in it.
        expect(Math.abs(Math.atan2(held.x, held.z))).toBeLessThan(2.0);
        expect(Math.abs(Math.atan2(held.x, held.z)))
            .toBeLessThanOrEqual(CFG.pose.catching.armLimit + 1e-9);
        // AND IT KEEPS ITS DISTANCE AND ITS HEIGHT. Clamping the coordinate
        // instead would drag the hand in toward the chest as the ball went
        // further behind, so a receiver would visibly lose interest exactly as
        // it arrived. Swung round the limit, the arm stays at full stretch.
        expect(Math.hypot(held.x, held.z))
            .toBeCloseTo(Math.hypot(behind.x, behind.z), 9);
        expect(held.y).toBe(behind.y);
    });

    test('and a ball in front of him is left exactly where it is', () => {
        const front = { x: -0.24, y: 2.1, z: 0.45 };
        const held = frontOf(front);
        expect(held.x).toBe(front.x);
        expect(held.y).toBe(front.y);
        expect(held.z).toBe(front.z);
    });

    /**
     * THE TWO NUMBERS HAVE TO AGREE WITH EACH OTHER, and this is the assertion
     * worth having. Once the turn has finished, the ball is inside the arm's
     * own limit for every bearing there is, so the clamp above is only ever
     * catching the half second he is still turning. Lower the turn without
     * raising the arm limit and a receiver goes back to reaching sideways at a
     * ball he has already turned to face.
     */
    test('a man who has finished turning can always reach it', () => {
        for (let b = -180; b <= 180; b += 5) {
            const want = (b * Math.PI) / 180;
            const left = Math.abs(wrap(want - turnFor(want, 0)));
            expect(left).toBeLessThanOrEqual(CFG.pose.catching.armLimit + 1e-9);
        }
    });
});

describe('he goes up for it sooner in the scoring zones', () => {
    /**
     * QA ROUND TWENTY: too many passes into the 15 and 30 point zones are
     * overthrown. Measured, they are, and the ball's target is a median 1.5m
     * past the man it was aimed at.
     *
     * WHAT DOES NOT FIX IT IS A HIGHER JUMP. Across 612 throws, not one
     * incompletion in any band failed the gate that asks whether the ball is
     * further up than a jump would get: raising `lift` to 1.9m moved every
     * measured figure by nothing at all. It is the OTHER end of the same
     * window. The ball comes over him early in its arc, while it is still up,
     * and he declines to leave his feet unless it clears his fingertips by
     * 0.4m. Ask for half that in the painted zones and he goes up as it
     * arrives, and the jump carries the rest: a man in the air is excused the
     * ported height gate and reaches the same distance in every direction.
     */
    test('a throw into the 15 or 30 band lowers the bar, and nothing else does', () => {
        const middle = (b) => (b.to === Infinity ? b.from + 100 : (b.from + b.to) / 2);
        const gate = {};
        for (const band of ladderBands(SIM.lineInterval)) {
            gate[band.points] = jumpClearance({ tx: middle(band), ty: 0 });
        }
        // Named rather than read back out of the config, which is the whole
        // claim: THESE two bands, and not the short game or the hail mary.
        expect(gate[15]).toBeLessThan(gate[5]);
        expect(gate[30]).toBeLessThan(gate[5]);
        expect(gate[50]).toBe(gate[5]);
        expect(gate[0]).toBe(gate[5]);
        expect(gate[15]).toBe(gate[30]);
    });

    test('and it is a lower bar, not merely a different one', () => {
        expect(CFG.pose.jump.zoneClearance).toBeLessThan(CFG.pose.jump.clearance);
        // ...and still a bar. At or below his own fingertips it stops being a
        // jump for a ball over his head and becomes how he catches everything.
        expect(CFG.pose.jump.zoneClearance).toBeGreaterThan(0);
    });

    /**
     * THE ZONES ARE NAMED BY THEIR POINTS, so a typo would not fail: it would
     * silently match no band and quietly restore the old behaviour, which is
     * the kind of regression a QA round finds a month later.
     */
    test('every zone named is a band the ladder actually pays', () => {
        const paid = ladderBands(SIM.lineInterval).map((b) => b.points);
        expect(CFG.pose.jump.zones.length).toBeGreaterThan(0);
        for (const points of CFG.pose.jump.zones) expect(paid).toContain(points);
    });

    /**
     * KEYED ON WHERE THE BALL WAS AIMED, NOT ON WHERE THE MAN IS STANDING, and
     * that is not a detail. A receiver catching a fifty is usually still short
     * of the target when the ball comes over him, so keying on his own feet
     * would hand the same help to the hail mary: measured that way the 50 band
     * went 50% to 61%, which is round seventeen coming undone.
     */
    test('a hail mary keeps the hard gate even as it crosses the 30 band', () => {
        const bands = ladderBands(SIM.lineInterval);
        const deep = bands.find((b) => b.points === 50);
        const mid = bands.find((b) => b.points === 30);
        // The man is standing in the 30 band; the ball is aimed past him.
        expect(bandAt(mid.from + 1, SIM.lineInterval).points).toBe(30);
        expect(jumpClearance({ tx: deep.from + 1, ty: 0 })).toBe(CFG.pose.jump.clearance);
    });

    test('and with no throw on record he uses the ordinary gate', () => {
        expect(jumpClearance(null)).toBe(CFG.pose.jump.clearance);
        expect(jumpClearance({})).toBe(CFG.pose.jump.clearance);
    });
});

describe('a short pass into the 15 zone does not sail over a man who never jumped', () => {
    /**
     * QA, 2026-09-15: short passes into the 15 zone fall incomplete. A jump
     * needs him FULLY committed, which `reachersFor` measures from his chest,
     * so a ball more than about half a metre over his fingertips never sent
     * him up whatever `jump.lift` allowed. In the 15 zone any reach at all is
     * enough: 78% to 88% complete there, with the 30 and 50 bands unmoved.
     */
    const middle = (b) => (b.to === Infinity ? b.from + 100 : (b.from + b.to) / 2);
    const commitIn = () => {
        const out = {};
        for (const band of ladderBands(SIM.lineInterval)) {
            out[band.points] = jumpCommit({ tx: middle(band), ty: 0 });
        }
        return out;
    };

    test('a throw into the 15 band only needs him reaching, and no other band changes', () => {
        const gate = commitIn();
        // Named rather than read back out of the config: THIS band, and not
        // the deep ball round seventeen made hard.
        expect(gate[15]).toBeGreaterThan(0);
        expect(gate[15]).toBeLessThan(1e-6);
        for (const points of [0, 5, 30, 50]) expect(gate[points]).toBe(1);
    });

    test('every reach zone named is a band the ladder actually pays', () => {
        const paid = ladderBands(SIM.lineInterval).map((b) => b.points);
        expect(CFG.pose.jump.reachZones.length).toBeGreaterThan(0);
        for (const points of CFG.pose.jump.reachZones) expect(paid).toContain(points);
    });

    test('with no throw on record he has to be fully committed', () => {
        expect(jumpCommit(null)).toBe(1);
        expect(jumpCommit({})).toBe(1);
    });
});

describe('four ways to watch a replay', () => {
    /**
     * QA ROUND TWENTY-TWO. Looking round a replay was a one-finger drag, and a
     * drag asks somebody to fly a camera around a moving subject while watching
     * something else: "too hard to control", which it was. It is four fixed
     * vantage points now, one press each.
     *
     * THEY ARE AN OFFSET ON THE DIRECTOR'S SHOT, not four camera positions, and
     * that is what makes them right rather than merely cheap: `applyView` turns
     * the shot about its own target, so every one of the four is at the same
     * height and looks down at the same angle BY CONSTRUCTION. There is no
     * second set of numbers that could drift out of step with the first, and
     * the camera goes on establishing, tracking and settling in all of them.
     */
    const shot = () => ({
        position: { x: 18, y: 9, z: 6 },
        target: { x: 4, y: 1.2, z: -2 },
        fov: 32,
        progress: 0.5,
    });
    const radius = (s) => Math.hypot(
        s.position.x - s.target.x, s.position.y - s.target.y, s.position.z - s.target.z
    );
    const elevation = (s) => Math.asin((s.position.y - s.target.y) / radius(s));

    test('every view is the same height and the same angle down', () => {
        resetView();
        const first = applyView(shot(), getView());
        const seen = new Set();
        for (let i = 0; i < REPLAY_VIEWS; i += 1) {
            const s = applyView(shot(), getView());
            expect(radius(s)).toBeCloseTo(radius(first), 6);
            expect(elevation(s)).toBeCloseTo(elevation(first), 6);
            expect(s.position.y).toBeCloseTo(first.position.y, 6);
            // ...and it is still pointed at the same place.
            expect(s.target).toEqual(shot().target);
            seen.add(`${s.position.x.toFixed(3)},${s.position.z.toFixed(3)}`);
            switchView();
        }
        // Four presses, four DIFFERENT places to stand.
        expect(seen.size).toBe(REPLAY_VIEWS);
    });

    test('and the fourth press brings it home', () => {
        resetView();
        expect(viewQuarter()).toBe(0);
        for (let i = 1; i < REPLAY_VIEWS; i += 1) {
            switchView();
            expect(viewQuarter()).toBe(i);
        }
        switchView();
        expect(viewQuarter()).toBe(0);
        expect(applyView(shot(), getView())).toEqual(shot());
    });

    /**
     * THE FIRST PRESS IS THE BIGGEST CHANGE, which is the whole reason the
     * order is not 0, 90, 180, 270. Somebody pressing "switch view" wants a
     * different picture rather than a nudge, so the opposite end of the field
     * comes first and the two touchlines follow.
     */
    test('the first press is the opposite side of the field', () => {
        resetView();
        const before = applyView(shot(), getView());
        switchView();
        const across = applyView(shot(), getView());
        // Straight through the subject: the two camera positions and the target
        // are collinear, with the target between them.
        const t = shot().target;
        const a = Math.atan2(before.position.z - t.z, before.position.x - t.x);
        const b = Math.atan2(across.position.z - t.z, across.position.x - t.x);
        const apart = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
        expect(apart).toBeCloseTo(Math.PI, 6);
        // ...and it really is the far side, not the same side mirrored: the
        // target sits between the two of them.
        expect(Math.sign(before.position.x - t.x)).toBe(-Math.sign(across.position.x - t.x));
        expect(Math.sign(before.position.z - t.z)).toBe(-Math.sign(across.position.z - t.z));
    });

    test('it can be walked backwards, which is what the left arrow does', () => {
        resetView();
        switchView(-1);
        expect(viewQuarter()).toBe(REPLAY_VIEWS - 1);
        switchView(1);
        expect(viewQuarter()).toBe(0);
    });

    /** A new replay opens on the director's own shot rather than on whatever
     *  the last one was left showing. */
    test('a new replay starts back on the default view', () => {
        switchView();
        switchView();
        expect(viewQuarter()).not.toBe(0);
        resetView();
        expect(viewQuarter()).toBe(0);
    });
});

describe('only the man it was thrown to leaves his feet', () => {
    /**
     * QA ROUND TWENTY-FOUR, AND ONE CAUSE UNDER THREE REPORTS.
     *
     * "A receiver sometimes jumps as soon as the ball is thrown", "a receiver
     * who already has the ball randomly jumps while running", and "non-targeted
     * receivers still seem to jump". All three are the same fault.
     *
     * The view worked out who the ball was thrown to by finding the receiver
     * NEAREST THE AIM POINT, and it asked again on every frame. Measured over
     * 202 flights, the answer changed during 21% of them and 11% of all jumps
     * were started by a man the ball was not thrown to. Worse, `updateJump`
     * advances a figure's own jump clock, so a man who stopped being the answer
     * while he was in the air kept that clock FROZEN: he dropped to the grass
     * on the spot, and when the answer came back round to him it picked up
     * where it left off and he popped into the air again, out of context and
     * sometimes with the ball in his hands.
     *
     * main.js knew the answer outright the whole time.
     */
    const onField = (position, x, y) => ({
        settings: { position, team: 0, benched: false }, coords: { x, y, z: 1 }, state: {},
    });
    const throwOnRecord = () => {
        resetBallFlight();
        syncBall({
            settings: { position: 'ball', benched: false },
            coords: {
                x: 300, y: 300, z: 2,
                startX: 200, startY: 300, targetX: 800, targetY: 420,
            },
            state: { xSpeed: 4, ySpeed: 0 },
        }, null, 1 / 60);
        expect(ballSpan()).toBeTruthy();
    };

    test('being told beats working it out', () => {
        throwOnRecord();
        // wr1 is standing exactly on the aim point and wr3 is nowhere near it,
        // so the derivation would name wr1. It went to wr3.
        const field = [onField('wr1', 800, 420), onField('wr3', 100, -400)];
        expect(intendedReceiver(field)).toBe('wr1');      // ...told nothing
        noteThrow('wr3');
        expect(intendedReceiver(field)).toBe('wr3');
        resetBallFlight();
    });

    /**
     * AND WHEN NOBODY TELLS IT, THE ANSWER IS LATCHED. A wrong answer held is a
     * receiver going up for a ball he will not get, which is one bad jump. A
     * wrong answer that keeps CHANGING leaves the man it abandons frozen in
     * mid-air, which is three of them.
     */
    test('the fallback answers once and then stops changing its mind', () => {
        throwOnRecord();
        const field = [onField('wr1', 800, 420), onField('wr3', 100, -400)];
        expect(intendedReceiver(field)).toBe('wr1');
        // wr3 runs onto the aim point and wr1 leaves it. The answer holds.
        const moved = [onField('wr1', -900, -900), onField('wr3', 800, 420)];
        expect(intendedReceiver(moved)).toBe('wr1');
        resetBallFlight();
    });

    test('and nobody is named before there is a throw to name one for', () => {
        resetBallFlight();
        expect(intendedReceiver([onField('wr1', 800, 420)])).toBe('');
    });

    /**
     * AND THE NOTE IS THE PLAY'S. The replay of that same play still needs it,
     * because playback carries no throw, and the next line-up must not inherit
     * it: a receiver going up for last play's ball is the fault this round is
     * about, one play later.
     */
    test('the note lives as long as the play does', () => {
        resetBallFlight();
        noteThrow('wr2');
        // Whatever else happens, a line-up clears it. `resetBallFlight` is what
        // startPlay calls, and it is the only place the span goes too.
        resetBallFlight();
        expect(ballSpan()).toBeFalsy();
    });
});

/**
 * WHY THE ESCAPE IS NOT COVERED FROM `syncFigures`, AND THE TEST THAT WAS
 * WRITTEN HERE AND DELETED.
 *
 * `play.breakContact` writes `state.escape` and the view turns it into a pose
 * and a lean. That path shipped a crash: `poseFigure` called a name that did not
 * exist, and the game died the first time a carrier fought somebody off.
 *
 * THE OBVIOUS TEST HERE DOES NOT WORK, AND IT PASSES, WHICH IS WORSE. Driving
 * `syncFigures` with a man mid-escape and asserting it does not throw was
 * written, and it went green with the bug REINTRODUCED. Nothing was being drawn:
 * `syncFigures` opens with `figureFor(position)` and `continue`s when there is no
 * figure, and a headless run has built no roster at all, so the loop body never
 * executes. On top of that the Three stub is a Proxy that swallows assignments,
 * so even a figure that did exist could not be posed or measured.
 *
 * The real guard is one level down, in xo-gameplay.test.mjs, where
 * `poseFigure` is driven directly against a figure made of plain objects through
 * every branch it has. That one does fail against the bug.
 */
