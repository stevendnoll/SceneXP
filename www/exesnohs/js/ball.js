// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * ball.js - The football.
 *
 * A prop, not a figure. Its flight arc is not computed here and never will be:
 * `routes.getZIndex` already produces it, rising to the midpoint of a throw and
 * falling after, and view.js turns that into a world Y. This module owns the
 * mesh, how it is pointed, and how it spins.
 *
 * IT POINTS ALONG ITS OWN VELOCITY, WHICH IT DID NOT USED TO. The old version
 * set `rotation.y` from the simulation's horizontal speeds and nothing else, so
 * a ball climbing to the top of a 4m arc and dropping again stayed resolutely
 * level the whole way. A thrown ball that does not tip its nose up and then
 * down reads as a bead sliding along a wire.
 *
 * IT SPIRALS, WHICH IS THE PART THAT MAKES IT LOOK THROWN. A real pass rotates
 * about its long axis several times a second. The spin is only visible because
 * of the two white bands: a smooth brown ellipsoid rotating about its own axis
 * of symmetry is, to the eye, completely motionless.
 *
 * AND IT CASTS A SPOT ON THE GRASS while it is up. From the play camera a ball
 * in flight is a dozen pixels against a dark field and, with no contact with
 * the ground, no fixed idea of how high or how far away it is. The spot is the
 * cheapest possible depth cue and it is what makes the arc readable.
 */

import { EXESNOHS_CONFIG as CFG } from './config.min.js';

let mesh = null;      // the ball itself
let spot = null;      // the shadow on the grass under it

/** Half the long axis and the radius at the waist, in metres before ballScale.
 *  A real ball is about 11 inches by 6.7, or 1.64:1, and this is 1.70. */
export const BALL_HALF = 0.238;
export const BALL_FAT = 0.14;

/**
 * THE OUTLINE OF A FOOTBALL, AND THE EXPONENT IS THE WHOLE POINT.
 *
 * This was a sphere scaled along one axis, which is an ellipsoid, and an
 * ellipsoid's end is ROUNDED: its profile is `r = R·(1 - t²)^0.5`, and near the
 * tip that falls off as the SQUARE ROOT of the distance from the end, so the
 * radius is still substantial a hair from the pole and the shape closes as a
 * dome. A football closes as a point.
 *
 * Raising the exponent is the fix. At 1.0 the tip is a straight cone, at 0.5 it
 * is an egg, and 0.78 sits where a football does: the same fat middle, and a
 * last centimetre that comes to a nose. Pure, and exported, because "is the end
 * of this ball pointy" is a question with an arithmetic answer and no amount of
 * looking at a fourteen-pixel object in a screenshot settles it.
 */
export const BALL_TAPER = 0.78;

/** The radius of the leather at a distance `x` from the middle, which is the
 *  one question the laces have to ask and the old straight seam bar never did. */
export function radiusAt(x) {
    const t = x / BALL_HALF;
    return BALL_FAT * Math.pow(Math.max(0, 1 - t * t), BALL_TAPER);
}

/**
 * WHERE THE LACES SIT, AND WHY THIS IS A FUNCTION.
 *
 * There used to be a straight bar here as well, one box the length of the lace
 * panel at a CONSTANT height, and the ball's surface is a curve. At the ends of
 * the panel the leather has already fallen from 0.140 to 0.088 while the bar was
 * still at 0.134, so it stood five centimetres proud of the ball, read as a rod
 * driven through it, and covered the very stitches it was meant to sit under.
 *
 * Every stitch now takes its height FROM the profile, so it cannot float
 * whatever anybody changes about the shape of the ball, and a test can say so.
 */
export function lacePositions(count = 9, span = 0.60) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
        const x = (i / (count - 1) - 0.5) * span * BALL_HALF * 2;
        out.push({ x, y: radiusAt(x) - 0.003 });
    }
    return out;
}

/** Where the two stripes sit and how wide they are, as a fraction of the half
 *  length, so they follow the ball rather than a remembered number. */
export const BAND_AT = 0.125;
export const BAND_HALF = 0.026;

/**
 * A STRIPE THAT FOLLOWS THE LEATHER.
 *
 * Same rule as `lacePositions`: the ball's surface is a curve, so anything
 * sitting on it has to take its radius from `radiusAt` rather than carry its
 * own. `lift` is the hair of clearance that keeps the two surfaces from
 * fighting over the same pixels, and it is tiny against a ball 0.28 thick.
 */
export function bandProfile(centre, halfWidth = BAND_HALF, lift = 0.004, steps = 6) {
    const out = [];
    for (let i = 0; i <= steps; i += 1) {
        const y = centre - halfWidth + (2 * halfWidth * i) / steps;
        out.push({ r: radiusAt(y) + lift, y });
    }
    return out;
}

export function ballProfile(rings = 16) {
    const out = [];
    for (let i = 0; i <= rings; i += 1) {
        const t = -1 + (2 * i) / rings;      // -1 at one tip, +1 at the other
        out.push({
            r: BALL_FAT * Math.pow(Math.max(0, 1 - t * t), BALL_TAPER),
            y: t * BALL_HALF,
        });
    }
    return out;
}

/** An ellipsoid with a seam and two bands. Small enough at the play camera's
 *  distance that the laces would be a waste of triangles, but the long axis
 *  reads clearly when it is in the air, which is the only time anyone is
 *  looking at it. */
export function initBall(scene) {
    disposeBall();
    mesh = new THREE.Group();
    mesh.name = 'ball';

    // LIGHTER THAN A REAL FOOTBALL, ON PURPOSE, AND LIGHTER AGAIN SINCE.
    //
    // The field is dark green under floodlights at night and the sky behind the
    // arc is nearly black, so a regulation dark brown ball is invisible for the
    // whole of its flight, which was the original complaint.
    //
    // IT CAME BACK FOR PHONES, AND THE MEASUREMENT SAYS IT IS STILL VALUE.
    // Sampled off a real screenshot, the ball rendered at a relative luminance
    // of 0.095 against turf at 0.019, which is 2.1:1. A graphical object that
    // has to be followed wants 3:1, and this one is a dozen pixels across on a
    // phone. 0xb4642c to this is worth about 4:1 against the same grass.
    //
    // AND IT IS THE ONLY LEVER THAT WORKS IN BOTH PLACES. Against the offense's
    // own kit the ball measured 1.15:1, because their shirts render at 0.117
    // and their heads at 0.116, which is the ball's colour almost exactly: in a
    // pack, the ball IS an X player's head. Nothing short of leaving the brown
    // family fixes that, and going lighter is the direction that also helps the
    // half of the job that matters most, which is the flight.
    //
    // A LATHE, NOT A SCALED SPHERE, AND THE DIFFERENCE IS THE ENDS. A sphere
    // stretched along one axis is an ellipsoid, and an ellipsoid's tip is
    // ROUNDED: near the end its radius falls off as the square root of the
    // distance, so it comes to a dome. A football comes to a point. Profiling
    // the radius as `(1 - t²)^0.78` instead of `(1 - t²)^0.5` keeps the same
    // middle and takes the last centimetre to a tip, which is the whole
    // silhouette difference between a football and an egg.
    const leather = new THREE.Mesh(
        new THREE.LatheGeometry(
            ballProfile().map((pt) => new THREE.Vector2(pt.r, pt.y)), 14
        ),
        new THREE.MeshStandardMaterial({ color: 0xd0813f, roughness: 0.62, metalness: 0 })
    );
    // The lathe spins about Y, and everything that aims this ball assumes the
    // long axis is local X, so lay it over once here rather than in aimBall.
    leather.rotation.z = Math.PI / 2;
    mesh.add(leather);

    const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.55 });

    // THE TWO BANDS ARE WHAT MAKE THE SPIRAL VISIBLE. Without a mark off the
    // axis, spinning a solid of revolution about that axis changes nothing on
    // screen, and the ball would rotate correctly and look completely still.
    // These are the stripes near each end of a real ball, and they encircle the
    // long axis, which is what a torus about local X does.
    //
    // WIDER THAN THEY WERE, AND NO LONGER A RING FLOATING OVER THE LEATHER.
    //
    // They were a torus 0.013 across, which is 5% of the ball's length: a real
    // ball's stripe, and under a pixel on a phone. These are 11%, the broad
    // pair a college ball carries, exaggerated the way everything else at this
    // scale is. They are also the brightest thing on the ball, and white
    // renders near 0.45 against grass at 0.019, so whatever the leather is
    // doing the stripes separate the ball from the field on their own.
    //
    // A LATHE OFF THE BALL'S OWN PROFILE, for exactly the reason the laces are:
    // widening a torus grows it outward as well as sideways, and at this
    // position the leather is only 0.108 from the axis, so a 0.020 tube would
    // have stood 8mm proud of a ball 0.28 thick and read as a hoop hung round
    // it. `bandProfile` takes its radius FROM the surface, so the stripe is
    // painted on however the shape changes.
    for (const side of [-1, 1]) {
        const band = new THREE.Mesh(
            new THREE.LatheGeometry(
                bandProfile(side * BAND_AT).map((pt) => new THREE.Vector2(pt.r, pt.y)), 14
            ),
            white
        );
        band.rotation.z = Math.PI / 2;
        mesh.add(band);
    }

    // THE LACES RUN ALONG THE BALL, NOT AROUND IT.
    //
    // What was here was a third partial ring encircling the long axis, offset
    // upward: a seam going the wrong way, which is what the last round of QA
    // reported. Real laces are a short row of cross stitches lying ALONG the
    // length, on one panel, and they are the only mark that tells you which way
    // up a football is. Eight small bars on the top surface, spaced down the
    // long axis, which is also a better spin cue than a ring because a ring
    // about the axis of rotation does not appear to move at all.
    // NO STRAIGHT SEAM BAR. There was one, a single box the length of the
    // laces sitting at a CONSTANT height, and the ball's surface is a curve:
    // at the ends of the lace panel the leather has dropped to 0.088 while the
    // bar was still at 0.134, so it stood almost five centimetres proud of the
    // ball and read as a rod driven through it, covering the very stitches it
    // was meant to sit under. The stitches carry the laces on their own.
    const laces = new THREE.Group();
    for (const seat of lacePositions()) {
        const stitch = new THREE.Mesh(
            new THREE.BoxGeometry(0.016, 0.010, 0.060), white
        );
        stitch.position.set(seat.x, seat.y, 0);
        // Lie each one along the surface rather than flat, so the row follows
        // the curve of the panel instead of tilting off it at the ends.
        stitch.rotation.z = Math.atan2(
            radiusAt(seat.x + 0.02) - radiusAt(seat.x), 0.02
        );
        laces.add(stitch);
    }
    mesh.add(laces);

    // Bigger than life, on purpose: the ball is the one thing the visitor is
    // actually following and it is the smallest object on the field.
    mesh.scale.setScalar(CFG.ballScale);
    mesh.visible = false;
    scene.add(mesh);

    spot = new THREE.Mesh(
        new THREE.CircleGeometry(0.3, 16),
        new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.34,
            depthWrite: false, toneMapped: false,
        })
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.03;
    spot.renderOrder = 1;
    spot.visible = false;
    spot.name = 'ball-spot';
    scene.add(spot);

    return mesh;
}

/**
 * Point the ball along a heading and roll it about that axis.
 *
 * `dir` is a world-space direction, not necessarily normalised, and may be
 * anything at all when the ball is at rest, so a degenerate one leaves the
 * current attitude alone rather than snapping the ball flat.
 *
 * The rotation is built by hand rather than with `lookAt`, because lookAt aims
 * an object's -Z and this ball's long axis is +X.
 */
const AIM = { axis: null, quat: null, roll: null, forward: null };
export function aimBall(dir, spin) {
    if (!mesh) return;
    if (!AIM.quat) {
        // Built on first use rather than at module scope, because THREE is a
        // global this module does not import and is not guaranteed to exist
        // when the file is first evaluated.
        AIM.quat = new THREE.Quaternion();
        AIM.roll = new THREE.Quaternion();
        AIM.axis = new THREE.Vector3();
        AIM.forward = new THREE.Vector3(1, 0, 0);
    }
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-4) return;      // at rest: keep the attitude it already has
    AIM.axis.set(dir.x / len, dir.y / len, dir.z / len);
    AIM.quat.setFromUnitVectors(AIM.forward, AIM.axis);
    // The spiral, about the ball's own long axis, applied after the aim so it
    // stays a roll rather than becoming a wobble.
    AIM.roll.setFromAxisAngle(AIM.forward, spin);
    AIM.quat.multiply(AIM.roll);
    mesh.quaternion.copy(AIM.quat);
}

/**
 * Show or hide the spot on the grass, and put it under the ball.
 *
 * It fades and spreads with height, the way a real shadow does, so the arc's
 * apex is legible from the spot alone.
 */
export function placeSpot(x, y, z, visible) {
    if (!spot) return;
    spot.visible = visible;
    if (!visible) return;
    spot.position.set(x, 0.03, z);
    const lift = Math.max(0, Math.min(y / 4, 1));
    const spread = 1 + lift * 1.5;
    spot.scale.set(spread, spread, 1);
    spot.material.opacity = 0.36 * (1 - lift * 0.55);
}

export function getBall() {
    return mesh;
}

export function disposeBall() {
    for (const obj of [mesh, spot]) {
        if (!obj) continue;
        obj.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        if (obj.parent) obj.parent.remove(obj);
    }
    mesh = null;
    spot = null;
}
