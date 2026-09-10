// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-pose.test.mjs
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
import { describe, test, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'exesnohs', 'js');

installThree();

const CONFIG_MODULE = await import(join(scene, 'config.js'));
const { EXESNOHS_CONFIG: CFG, UNITS_TO_METRES } = CONFIG_MODULE;
const { solveArm, handAt, RIG } = await import(join(scene, 'arm.js'));
const { takedownAt, takedownLength, contactFraction } = await import(join(scene, 'takedown.js'));
const {
    toWorld, carryHold, HEADING_DEADZONE, TURN_RESPONSE,
    syncFigures, beginSnapMotion, resetThrow, throwClock,
} = await import(join(scene, 'view.js'));
const {
    createPlay, lineUp, snap, tick, isDone, settleArrived, throwTo,
    eligibleReceivers, outcome, OFFENSIVE_PLAYS,
} = await import(join(scene, 'play.js'));
const {
    startRecording, record, rewind, focusAt,
} = await import(join(scene, 'replay.js'));
const { litFor } = await import(join(scene, 'main.js'));

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
        // The port managed 49.8% of these, which is what QA was playing.
        expect(caught / thrown).toBeGreaterThan(0.60);
        // AND THE TURNOVERS DID NOT COME WITH IT. Widening the catch hands the
        // same reach to the secondary unless something stops it, and an
        // interception is the harshest outcome on the ladder. The port's own
        // rate over this grid is 8.5%.
        expect(picked / thrown).toBeLessThan(0.11);
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
