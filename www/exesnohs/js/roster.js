// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * roster.js - The players on the field, and what they are wearing.
 *
 * Builds one figure per player from the shared people part and hands them back
 * keyed by position, so view.js can move them without knowing how they were
 * made. It knows nothing about the game: it never reads a route, a formation
 * or a score.
 *
 * THE LETTERS WERE TRIED AND DROPPED (2026-09-08, D22). The offense were
 * animated X's and the defense O's, in these same two colours, on the grounds
 * that it is what the game is called and that a bold glyph reads better than a
 * small figure at 45m. Three rounds of animation could not make them look
 * good: too fast, then creepy when the swing flattened the letterform, then
 * floaty. Steve called it and he was right. A game that looks right beats a
 * game that is conceptually tidy.
 *
 * WHAT THE LETTERS DID LEAVE BEHIND is the colour scheme, and it was the best
 * thing about them. These are the 2D game's own team colours, read off
 * exes-and-ohs.class.tsx: the Fighting Mongooses are rgba(255, 153, 44) and
 * The Crows are rgba(155, 207, 255). Two teams that differ in HUE rather than
 * in value stay separable under floodlights and at distance, which the first
 * white-and-red kit did not.
 *
 * THE LINE IS THE CHEAP HALF (D16, and the S2 lever). x1 to x6 are a wall at
 * the line of scrimmage with no routes and no catches, so they are the first
 * place to spend less if 17 figures will not hold frame rate on a phone.
 *
 * NO NECKS. The shared rig has no neck joint, so nobody can turn their head. A
 * quarterback who cannot look at a receiver reads as slightly wrong, and
 * fixing it needs a new joint in the shared part rather than anything here.
 */
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { EXESNOHS_CONFIG as CFG } from './config.min.js';
import { solveArm, calibrate } from './arm.min.js';

/** The 2D game's own team colours and names. */
export const TEAMS = {
    0: { name: 'Fighting Mongooses', glyph: 'X', color: 0xff992c },
    1: { name: 'The Crows', glyph: 'O', color: 0x9bcfff },
};

/**
 * The kits.
 *
 * The helmet and the shirt both carry the team colour because from a camera
 * 30m up they are most of what is visible: the eye gets a coloured head and
 * shoulders and very little else. The trousers stay a dark neutral so a figure
 * reads as a bright top over a dark bottom rather than as a solid lozenge.
 */
const KITS = {
    0: { shirt: 0xff992c, pants: 0x3a2410, helmet: 0xff992c, mask: 0x2a1a0c },
    1: { shirt: 0x9bcfff, pants: 0x1b2c40, helmet: 0x9bcfff, mask: 0x16222f },
};

const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3317];

/* How far the arms swing at a full run now lives in `config.pose.armSwing`,
 * alongside the three carries and the block, because they are one vocabulary
 * and tuning them against each other from two files is how a quarterback ends
 * up cocking an arm further than a lineman can reach. It is still deliberately
 * modest: an over-swung arm reads as flailing, and the previous design was
 * abandoned partly for exactly that. */

let group = null;
const figures = new Map();   // position -> THREE.Group

/**
 * A helmet.
 *
 * The single cheapest thing that turns a low-poly person into a football
 * player rather than a person standing on grass, and at this distance it is
 * also most of the team colour the viewer sees.
 */
/**
 * WHAT THE SHELL HAS TO COVER, TAKEN FROM THE RIG RATHER THAN GUESSED.
 *
 * AND IT WAS NOT TAKEN FROM THE RIG, WHICH IS WHY THE HELMET FLOATED.
 *
 * people-1.0.0 puts the head at `legLength + torsoHeight + neckHeight +
 * headRadius`. That is 0.75 + 0.55 + 0.08 + 0.12, which is 1.50. This said
 * 1.62, because the head's own radius had been added twice, and the whole
 * helmet assembly was built around it: a shell 0.12 too high in a rig whose
 * head is 0.24 across, scaled by 2.2, which is a quarter of a metre of daylight
 * between a helmet and the skull it is supposed to be on.
 *
 * That is the "hat two sizes too small" D117 set out to fix and made worse, and
 * it is visible in every screenshot of this game as a coloured dome sitting
 * above a bare head. Nothing caught it because `buildHelmetParts` is measured
 * against THESE NUMBERS rather than against a person: the test asked whether
 * the shell covered a head at 1.62, and it did.
 *
 * Read off a figure built against a real three: head centre 1.500, radius 0.12,
 * hair spheres centred 1.55 (top), 1.56 (side) and 1.40 (back) at 0.126 across,
 * so the thing a helmet has to hide runs from 1.29 to 1.68.
 */
export const HEAD = { y: 1.50, r: 0.12, hairR: 0.128, hairLow: 1.395, hairHigh: 1.671 };

/**
 * EVERY PART OF THE HELMET IS WRITTEN RELATIVE TO THE HEAD, so a measurement
 * that moves takes the whole assembly with it rather than leaving the crown
 * behind. That is the only real protection against this happening again: the
 * previous version wrote seven absolute y values against a head height that was
 * wrong, and moving the head meant finding all seven.
 *
 * The offsets are derived from the envelope, measured against a real three: the
 * head sphere runs 1.380 to 1.620 and the hair group 1.395 to 1.671, so a shell
 * centred 0.020 above the head with a half-height of 0.158 reaches 1.678 over
 * the hair and, sweeping 0.92 of a half-turn, drops to 1.367 at the back, which
 * is below the ears at 1.482.
 */
const HELMET = {
    up: 0.020,          // the shell's centre, just above the head's
    flap: -0.030,       // the ear flaps, over ears that sit at -0.02 to +0.02
    mask: [-0.020, -0.065, -0.110],
    bridge: -0.062,
    stem: -0.024,
    strap: -0.124,
};

/**
 * The helmet, as a list of parts.
 *
 * SEPARATED FROM `addHelmet` SO IT CAN BE MEASURED. The test stub models no
 * geometry, so every Box3 taken against it is empty and nothing about a shape
 * can be asserted through it. Handing back plain meshes lets a suite build them
 * against a real three in a `node:vm` and ask the only questions that matter:
 * does the shell actually cover the head, and is the facemask in front of the
 * face or buried inside the shell. Both were wrong, and neither was visible in
 * a screenshot until somebody looked at a 60-pixel crop.
 */
export function buildHelmetParts(shellMat, maskMat) {
    const parts = [];

    /**
     * THE SHELL IS A SPHERE WITH A HOLE IN THE FRONT, and that hole is the
     * difference between a helmet and a swimming cap: a helmet WRAPS, and what
     * you see of the head is a face looking out of an opening.
     *
     * Three has no boolean and does not need one, because `SphereGeometry`
     * takes a phi sweep. Which way is forward is DERIVED from Three's own
     * parameterisation (`z = r·sin(phi)·sin(theta)`, so phi = PI/2 is +Z, and
     * +Z is the way the rig faces) rather than guessed, because guessing puts
     * the face opening over one ear.
     *
     * IT IS SMALLER AND LONGER THAN THE LAST ONE. 0.145 against a 0.128 head
     * with hair is a helmet's worth of padding; 0.158 was a bubble. And it now
     * sweeps 0.92 of a half-turn instead of 0.86, which is what finally takes
     * the back edge below the hair.
     */
    /**
     * IN TWO PIECES, AND THAT IS THE FIX FOR THE PIE SLICE.
     *
     * A phi sweep removes a wedge of longitude, and longitudes MEET AT THE
     * POLE, so a gap left for the face runs all the way up and takes a slice
     * out of the crown with it. Reported exactly that way: a pie-slice cutout
     * in the front top centre.
     *
     * So the crown is its own cap with the full sweep, closed all the way
     * round, and only the band below it carries the opening. They share a
     * radius, a scale and a centre, so they meet seamlessly at the join.
     */
    const GAP = 1.40;                  // radians of face opening, about 80 degrees
    const R = 0.145;
    const AT = [0, HEAD.y + HELMET.up, -0.010];
    // TALLER THAN IT WAS, and that is the other half of the floating shell. At
    // 1.04 the half-height was 0.151 and the hair reaches 0.171 above the head's
    // centre, so even a correctly placed shell of that size left the top of the
    // hair outside it. 1.09 covers the lot with 3mm to spare.
    const SCALE = [1.06, 1.09, 1.16];
    // Where the crown stops and the face opening begins. At 0.42 of a
    // half-turn the join sits at y = 1.56, which is above the eyes at 1.52, so
    // the opening starts at the brow the way a real shell does.
    const CROWN = Math.PI * 0.42;

    const crown = new THREE.Mesh(
        new THREE.SphereGeometry(R, 22, 8, 0, Math.PI * 2, 0, CROWN), shellMat
    );
    crown.position.set(...AT);
    crown.scale.set(...SCALE);
    crown.name = 'helmet-crown';
    parts.push(crown);

    const shell = new THREE.Mesh(
        new THREE.SphereGeometry(
            R, 22, 10,
            Math.PI / 2 + GAP / 2, Math.PI * 2 - GAP,
            CROWN, Math.PI * 0.92 - CROWN
        ),
        shellMat
    );
    shell.position.set(...AT);
    // Wider than tall and longer than wide, which is the proportion that stops
    // a helmet reading as a ball.
    shell.scale.set(...SCALE);
    shell.name = 'helmet-shell';
    parts.push(shell);

    /**
     * THE EAR FLAPS ARE MOST OF THE SILHOUETTE. A football helmet is not round
     * at the bottom: it drops in front of each ear into a flap that carries the
     * chin strap, and from the side that step is what says "helmet" before the
     * facemask is even legible.
     */
    for (const side of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), shellMat);
        flap.position.set(side * 0.128, HEAD.y + HELMET.flap, 0.016);
        flap.scale.set(0.62, 1.02, 1.05);
        flap.name = 'helmet-flap';
        parts.push(flap);
    }

    /**
     * THE FACEMASK HAS TO STAND CLEAR OF THE SHELL. The first version put its
     * bars at z = 0.132 against a shell reaching 0.152, so they were buried
     * inside it and all that showed was a few dark specks near the chin. A cage
     * sits PROUD of the face on stems, and the gaps between its bars are as
     * much of the silhouette as the bars are.
     */
    const MASK_Z = 0.185;
    for (const [y, halfWidth, z] of [
        [HEAD.y + HELMET.mask[0], 0.084, MASK_Z - 0.022],
        [HEAD.y + HELMET.mask[1], 0.092, MASK_Z],
        [HEAD.y + HELMET.mask[2], 0.080, MASK_Z - 0.012],
    ]) {
        const bar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0115, 0.0115, halfWidth * 2, 6), maskMat
        );
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, y, z);
        bar.name = 'helmet-mask';
        parts.push(bar);
    }
    const centre = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0105, 0.0105, 0.11, 6), maskMat
    );
    centre.position.set(0, HEAD.y + HELMET.bridge, MASK_Z - 0.004);
    centre.rotation.x = 0.10;
    centre.name = 'helmet-mask';
    parts.push(centre);

    // The stems that carry the cage back to the shell, which are what make it
    // read as bolted on rather than floating in front of a face.
    for (const side of [-1, 1]) {
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0095, 0.0095, 0.125, 6), maskMat
        );
        stem.rotation.set(Math.PI / 2 - 0.26, 0, 0);
        stem.position.set(side * 0.086, HEAD.y + HELMET.stem, 0.122);
        stem.name = 'helmet-mask';
        parts.push(stem);
    }

    // A chin strap under the jaw, closing the shell between the two flaps.
    const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0105, 0.0105, 0.20, 6), maskMat
    );
    strap.rotation.set(0, 0, Math.PI / 2);
    strap.position.set(0, HEAD.y + HELMET.strap, 0.058);
    strap.name = 'helmet-strap';
    parts.push(strap);

    return parts;
}

function addHelmet(person, kit) {
    const shellMat = new THREE.MeshStandardMaterial({
        color: kit.helmet, roughness: 0.28, metalness: 0.2,
    });
    // DOUBLE SIDED ON THE CONSTRUCTOR, not assigned afterwards. The shell has a
    // hole cut in the front, so a viewer in front of a player is looking at the
    // INSIDE of the back of it, and a single-sided shell simply is not there.
    shellMat.side = THREE.DoubleSide;
    const maskMat = new THREE.MeshStandardMaterial({
        color: kit.mask, roughness: 0.45, metalness: 0.45,
    });

    const parts = buildHelmetParts(shellMat, maskMat);
    for (const part of parts) person.add(part);
    return parts[0];      // the shell
}

/**
 * A contact shadow.
 *
 * THE CHEAPEST CURE FOR FLOATING. A figure with nothing under it reads as
 * hovering, because the eye judges contact from the ground rather than from
 * the pose. One flat disc per player, round so the figure's yaw cannot disturb
 * it, unlit and writing no depth. This survived from the letters experiment
 * and it was worth keeping.
 */
function addContactShadow(person) {
    const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 12),
        new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
        })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    person.add(disc);
    return disc;
}

/**
 * WHERE THE ARMS GO, AND IT IS THE WHOLE BODY LANGUAGE THIS RIG HAS.
 *
 * The shared rig groups each arm at the shoulder and tags it, so the arms are
 * the one limb that can be animated: the legs are bare meshes with no pivot.
 * That makes six poses the entire vocabulary, and it is enough, because each of
 * them answers a question a viewer is actually asking.
 *
 *   running      is he moving, and how fast
 *   throwHold    is the quarterback looking downfield or has he tucked it
 *   tuck         who has the ball right now
 *   block        is my line holding anybody up
 *   catching     is he going to get to this ball
 *   tackle       is somebody about to bring him down
 *
 * THE TWO ARMS ARE IN ANTIPHASE WHEN RUNNING, which is the lesson from the
 * letters attempt (D24). Swinging them together, however subtly, reads as a
 * pulse rather than as a stride.
 *
 * EVERY POSE BUT THE RUN IS A HAND POSITION, NOT AN ANGLE, and that is this
 * round's change. Angles are how the elbow ended up hyperextended in all five
 * of them at once: the sign that folds a forearm forward is not the sign it
 * looks like it should be (see arm.js), and no amount of looking at a
 * screenshot of a 40-pixel figure settles which one is in front. A hand
 * position can be pictured, argued about and measured, and arm.js turns it into
 * the three angles that reach it.
 *
 * A pose's `hand` is written for the arm on the POSITIVE side and mirrored in x
 * for the other one, which is why there is only one number for both.
 *
 * `armSide` is -1 on one arm and +1 on the other, and the THROWING ARM is the
 * positive one, chosen once here so the ball and the arm cannot disagree.
 */
export const THROWING_SIDE = 1;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The three angles for a fixed hand position, worked out once.
 *
 * The solve is a handful of trig calls and could run every frame for every arm
 * without anybody noticing, but a constant target has a constant answer and
 * caching it says so. The catch pose deliberately does NOT come through here:
 * its target is the ball, which is somewhere different on every frame.
 */
const solved = new Map();
function anglesFor(hand, side) {
    const key = `${hand.x},${hand.y},${hand.z},${side}`;
    let got = solved.get(key);
    if (!got) {
        got = solveArm({ x: side * hand.x, y: hand.y, z: hand.z }, side);
        solved.set(key, got);
    }
    return got;
}

/** Dropped when the rig's measurements change under us, which only happens in
 *  a test that calibrates twice. */
export function forgetSolvedPoses() {
    solved.clear();
}

/**
 * Pose one figure for this frame.
 *
 * `speed` is METRES PER SECOND, measured from how far the figure actually
 * moved, and `phase` is a stride angle advanced by DISTANCE covered. Both of
 * those are the caller's job and both used to be neither: the old version took
 * the simulation's own speed field and advanced the phase once per rendered
 * frame, so the arms ran at double rate on a 120Hz display and kept swinging
 * after the whistle because nothing zeroes those fields when a play ends.
 *
 * `act` is what the figure is doing beyond running:
 * `{ carry, throwT, block, tackle, down, reach, reachAt }`. Anything omitted is
 * simply not applied, so a plain runner costs one lerp.
 */
export function poseFigure(figure, speed = 0, phase = 0, act = {}, delta = 1 / 60) {
    const arms = figure.userData.arms;
    if (!arms || !arms.length) return;
    const P = CFG.pose;

    // A MAN ON HIS BACK IS NOT RUNNING. Without this the legs and arms keep
    // striding while the body is horizontal, which is the one thing that would
    // make a knockdown funny rather than final.
    const upright = 1 - Math.min(1, (act.down || 0) * 1.6);
    const effort = Math.min(speed / P.fullEffort, 1) * upright;
    const swing = Math.sin(phase) * effort * P.armSwing;

    // NOTHING SNAPS, AND THAT IS MOST OF WHAT "GLITCHY" MEANT. Every input here
    // is a per-frame judgement about a world that is still moving: whether a
    // defender is inside a blocker's reach, whether the ball is still in a
    // hand. Applied directly, a defender hovering at the edge of the reach
    // flips a lineman between running and blocking on alternate frames, and a
    // carry that changes state moves an arm through a right angle in one frame.
    // The pose is a target and the arm eases toward it.
    const ease = 1 - Math.exp(-delta / P.blend);

    for (const arm of arms) {
        const side = arm.userData.armSide;
        const rest = arm.userData.restX !== undefined ? arm.userData.restX : 0.1;
        const restZ = arm.userData.restZ !== undefined ? arm.userData.restZ : side * 0.15;

        // The stride, which every pose below overrides or blends against. A
        // running arm carries a real elbow, because a person sprinting with two
        // straight arms reads as a mannequin on wheels. Written as an amount of
        // FLEXION and applied as a negative angle, which is the one direction
        // an elbow bends.
        let x = rest + (side < 0 ? swing : -swing);
        let z = restZ;
        let fore = -(P.runElbow.rest + effort * P.runElbow.sprint);

        if (act.reach > 0 && act.reachAt) {
            /**
             * GOING UP FOR THE BALL, AND THE TARGET IS THE BALL ITSELF.
             *
             * The two hands cradle it rather than both stabbing at its centre,
             * which is why the split is applied along the arm's own side. A
             * target further away than the arm can stretch is not an error and
             * not clamped away: arm.js points the limb at it and extends, so a
             * receiver who cannot quite get there is visibly reaching for it,
             * which is most of what makes a catch look like a catch.
             */
            const target = {
                x: act.reachAt.x + side * P.catching.split,
                y: act.reachAt.y,
                z: act.reachAt.z,
            };
            const a = solveArm(target, side);
            x = lerp(x, a.armX, act.reach);
            z = lerp(z, a.armZ, act.reach);
            fore = lerp(fore, a.foreX, act.reach);
        } else if (act.tackle > 0) {
            // Both arms low and reaching round him. Beats blocking, because a
            // lineman who has arrived at the ball carrier is tackling.
            const a = anglesFor(P.tackle.hand, side);
            x = lerp(x, a.armX, act.tackle);
            z = lerp(z, a.armZ, act.tackle);
            fore = lerp(fore, a.foreX, act.tackle);
        } else if (act.block > 0) {
            // Both arms out at the man in front. Held rather than swung: a
            // blocker's arms are the one part of him that is not running.
            const a = anglesFor(P.block.hand, side);
            x = lerp(x, a.armX, act.block);
            z = lerp(z, a.armZ, act.block);
            fore = lerp(fore, a.foreX, act.block);
        } else if (act.carry === 'throw') {
            const H = P.throwHold;
            if (side === THROWING_SIDE) {
                // Cocked, and swept forward while the elbow straightens, which
                // is what a throw is. Interpolating the two solved poses runs
                // the hand up over the shoulder, past the ear and down across
                // the body, so the whole motion falls out of its two ends.
                const t = act.throwT || 0;
                const from = anglesFor(H.hand, side);
                const to = anglesFor(P.throwRelease.hand, side);
                x = lerp(from.armX, to.armX, t);
                z = lerp(from.armZ, to.armZ, t);
                fore = lerp(from.foreX, to.foreX, t);
            } else {
                const a = anglesFor(H.offHand, side);
                x = a.armX;
                z = a.armZ;
                fore = a.foreX;
            }
        } else if (act.carry === 'tuck' && side === THROWING_SIDE) {
            // Only the carrying arm folds. The other one still runs, which is
            // what makes a tuck read as a tuck rather than as a shrug.
            const a = anglesFor(P.tuck.hand, side);
            x = a.armX;
            z = a.armZ;
            fore = a.foreX;
        }

        // THE SWEEP OF A THROW IS THE ONE THING THAT MAY SNAP. It is already a
        // timed animation with its own easing, and blending it a second time
        // would slow the release into a wave.
        const snap = act.carry === 'throw' && side === THROWING_SIDE
            && act.throwT > 0 && act.throwT < 1;
        arm.rotation.x = snap ? x : arm.rotation.x + (x - arm.rotation.x) * ease;
        arm.rotation.z = snap ? z : arm.rotation.z + (z - arm.rotation.z) * ease;

        // THE ELBOW, which the rig did not have until this round. A scene that
        // never asks for one still gets the straight arm it always drew,
        // because `foreX` of zero IS that arm.
        const forearm = arm.userData.forearm;
        if (forearm) {
            forearm.rotation.x = snap
                ? fore : forearm.rotation.x + (fore - forearm.rotation.x) * ease;
        }
    }
}

/**
 * Intern every geometry and material across the whole roster.
 *
 * `createPerson` builds each figure from scratch, so seventeen players arrive
 * with seventeen copies of the same head, the same torso and the same shoe,
 * each its own GPU buffer and its own shader compile. They are identical: the
 * rig varies colour and a couple of scale flags, not the shapes.
 *
 * This walks the finished roster and replaces every geometry and material with
 * the first one of its kind, keyed by type and parameters. Nothing about the
 * scene changes visually. What changes is that the renderer stops uploading and
 * binding the same buffers over and over.
 *
 * It runs ONCE, after building, rather than being threaded through the shared
 * part. That keeps `people-1.0.0.js` untouched and out of this scene's
 * business, which matters because it is shared with twelve other rooms.
 */
function shareGeometryAndMaterials(root) {
    const geometries = new Map();
    const materials = new Map();
    let meshes = 0;
    let geomBefore = new Set();
    let matBefore = new Set();

    const geomKey = (g) => `${g.type}:${JSON.stringify(g.parameters || {})}`;
    const matKey = (m) => [
        m.type, m.color && m.color.getHexString(), m.roughness, m.metalness,
        m.emissive && m.emissive.getHexString(), m.emissiveIntensity,
        m.transparent, m.opacity, m.depthWrite, m.side,
    ].join('|');

    root.traverse((obj) => {
        if (!obj.isMesh) return;
        meshes += 1;
        if (obj.geometry) {
            geomBefore.add(obj.geometry.uuid);
            // Only geometries built from parameters can be safely shared: one
            // without them may have been modified vertex by vertex.
            if (obj.geometry.parameters) {
                const key = geomKey(obj.geometry);
                const kept = geometries.get(key);
                if (kept && kept !== obj.geometry) {
                    obj.geometry.dispose();
                    obj.geometry = kept;
                } else if (!kept) {
                    geometries.set(key, obj.geometry);
                }
            }
        }
        if (obj.material && !Array.isArray(obj.material)) {
            matBefore.add(obj.material.uuid);
            const key = matKey(obj.material);
            const kept = materials.get(key);
            if (kept && kept !== obj.material) {
                obj.material.dispose();
                obj.material = kept;
            } else if (!kept) {
                materials.set(key, obj.material);
            }
        }
    });

    return {
        meshes,
        geometries: { before: geomBefore.size, after: geometries.size },
        materials: { before: matBefore.size, after: materials.size },
    };
}

/** What the last build cost, for the performance pass. */
let lastShareStats = null;
export function getRosterStats() {
    return lastShareStats;
}

/**
 * HOW HIGH A FIGURE'S OWN ORIGIN HAS TO SIT, which is not zero.
 *
 * `createPerson` finishes by placing itself at y = 0.055, because its shoes
 * hang below its origin and that is what puts them on the floor. view.js writes
 * `position.set(x, 0, z)` and threw that away, so every player on this field has
 * been standing 12cm deep in the turf: small on a 1.75m person and a visible
 * ankle on one scaled to 3.85m.
 *
 * Measured off the rig rather than copied, and multiplied by `figureScale`
 * because it is a length like any other.
 */
export let FIGURE_LIFT = 0.055 * CFG.figureScale;

/** Take the arm's geometry off a real figure and hand it to the solver. */
function measureArm(person) {
    const arm = (person.userData.arms || [])[0];
    if (!arm || !arm.userData || !arm.userData.forearm) return;
    const hand = arm.userData.forearm.children.find(
        (c) => c.isMesh && c.geometry && c.geometry.type === 'SphereGeometry'
            && c.geometry.parameters && c.geometry.parameters.radius < 0.045
    );
    calibrate({
        shoulderX: Math.abs(arm.position.x),
        shoulderY: arm.position.y,
        upper: Math.abs(arm.userData.forearm.position.y),
        lower: hand ? Math.abs(hand.position.y) : 0,
        restZ: Math.abs(arm.userData.restZ),
    });
    forgetSolvedPoses();
}

/** Build every figure. Nothing is positioned here: view.js owns placement. */
export function initRoster(scene, objects) {
    disposeRoster();
    group = new THREE.Group();
    group.name = 'roster';

    objects.forEach((obj, i) => {
        const { team, positionGroup, position } = obj.settings;
        const kit = KITS[team];
        const isLineman = positionGroup === 'x';

        const person = createPerson({
            role: 'customer',
            shirtColor: kit.shirt,
            // LONG SLEEVES, AND THEY ARE NOT DECORATION. Bare forearms are the
            // rig's default, and under floodlights on dark ground a dark skin
            // tone makes the lower arm vanish while a pale one makes it read as
            // a separate stick. Either way the limb stops being one limb, and
            // swinging it is what got reported as glitchy arms. A sleeve in the
            // team colour carries the arm from shoulder to wrist at any
            // distance, and it is what a player in pads actually wears.
            sleeveColor: kit.shirt,
            pantsColor: kit.pants,
            skinTone: SKIN[(i * 7 + team * 3) % SKIN.length],
            hairColor: 0x2b1d14,
            muscular: isLineman,
            // ROUNDED SHOULDERS ON EVERYONE, because this scene rotates arms.
            // The upper arm is a flat-topped cylinder pinned at the joint, so
            // swinging it opens a disc-shaped hole at the shoulder unless the
            // ball is there to fill it. The shared part's own note says so.
            shoulderRound: 0.35,
        });
        addHelmet(person, kit);
        addContactShadow(person);
        // Read before anything overwrites it, and only when it is a real
        // number: under the test stub every property is a proxy.
        if (Number.isFinite(person.position.y) && person.position.y > 0) {
            FIGURE_LIFT = person.position.y * CFG.figureScale;
        }
        // Scaled as a whole, so the helmet, the contact shadow and every limb
        // pivot move together. Scaling the rig's parts individually would put
        // the helmet through the head.
        person.scale.setScalar(CFG.figureScale);

        person.name = `player-${position}`;
        person.userData.position = position;
        person.userData.team = team;
        person.userData.phase = Math.random() * Math.PI * 2;  // nobody in step
        // YXZ, SO A LEAN HAPPENS ON THE FIGURE'S OWN AXIS. The tackle pitch is
        // applied to rotation.x alongside the yaw in rotation.y, and on the
        // default XYZ order the pitch is taken about the WORLD x axis first,
        // which tips a player facing across the field sideways instead of
        // forward.
        person.rotation.order = 'YXZ';
        // The arms, found once at build time rather than searched every frame.
        // THE RESTING ANGLES ARE CAPTURED, NOT ASSUMED. The shared rig sets a
        // slight natural pose on every shoulder, and every pose below starts
        // from it. Hard-coding the numbers here would work until people-1.0.0
        // changed one of them, at which point every player would develop a
        // permanent lean that nothing in this file explains.
        person.userData.arms = person.children.filter((c) => c.userData && c.userData.isArm);
        for (const arm of person.userData.arms) {
            arm.userData.restX = arm.rotation.x;
            arm.userData.restZ = arm.rotation.z;
        }
        // AND THE ARM'S MEASUREMENTS GO THE SAME WAY, for the same reason.
        // arm.js has to know where the shoulder is and how long the two
        // segments are to put a hand anywhere, and reading them off a figure
        // that was actually built means a change in the shared part arrives
        // here rather than quietly moving every pose in the game.
        measureArm(person);

        person.visible = false;
        group.add(person);
        figures.set(position, person);
    });

    lastShareStats = shareGeometryAndMaterials(group);

    scene.add(group);
    return figures;
}

export function figureFor(position) {
    return figures.get(position) || null;
}

export function getRosterGroup() {
    return group;
}

export function disposeRoster() {
    if (!group) return;
    // ONCE EACH, because geometries and materials are now shared across the
    // roster. Calling dispose on the same buffer seventeen times is not an
    // error in three, but it is a lie about what this function does, and the
    // set is what makes it true.
    const seen = new Set();
    group.traverse((obj) => {
        if (obj.geometry && !seen.has(obj.geometry.uuid)) {
            seen.add(obj.geometry.uuid);
            obj.geometry.dispose();
        }
        if (obj.material) {
            const list = Array.isArray(obj.material) ? obj.material : [obj.material];
            list.forEach((m) => {
                if (seen.has(m.uuid)) return;
                seen.add(m.uuid);
                m.dispose();
            });
        }
    });
    if (group.parent) group.parent.remove(group);
    group = null;
    figures.clear();
}
