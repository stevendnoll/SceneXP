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
/**
 * THE TORSO A MARK HAS TO FIT ON, TAKEN OFF THE FIGURE RATHER THAN ASSUMED.
 *
 * This is the D93 lesson and the helmet's own history: `buildHelmetParts` was
 * measured against a head height written down in this file, the shared part
 * moved the head, and the test went on passing while every player wore a
 * floating hat. So the jersey mark is sized from a Box3 taken over the torso
 * that was actually built.
 *
 * The fallback is not decoration either. The test stub models no geometry, so
 * every Box3 through it is empty, and a mark sized from an empty box is a mark
 * of size zero that no assertion would ever notice. `muscular` is the one
 * thing that changes these numbers, and roster.js already knows who is a
 * lineman, so the fallback can be right rather than merely present.
 */
export function measureTorso(person, muscular = false) {
    const fallback = {
        width: 0.38 * (muscular ? 1.3 : 1),
        height: 0.55,
        depth: 0.22 * (muscular ? 1.18 : 1),
        y: 0.75 + 0.55 / 2,
    };
    const mesh = (person.children || []).find((c) => c && c.isMesh && c.castShadow
        && c.geometry && (c.geometry.type === 'ExtrudeGeometry'
            || c.geometry.type === 'BoxGeometry'));
    if (!mesh || !mesh.geometry.computeBoundingBox) return fallback;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return fallback;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    const depth = box.max.z - box.min.z;
    if (!(width > 0 && height > 0 && depth > 0)) return fallback;
    // The geometry is centred on the mesh, and the mesh is placed up the body.
    return { width, height, depth, y: (mesh.position.y || 0) + (box.max.y + box.min.y) / 2 };
}

/**
 * THE X AND THE O, FRONT AND BACK. QA ITEM 4.
 *
 * DRAWN RATHER THAN PRINTED, and the reason is the torso. It is an extruded
 * rounded profile, not a box, so it has no UV layout anybody here can reason
 * about, and a canvas texture would also need a font, a texture upload per kit
 * and a decision about what happens at 45m. Two crossed bars and a flat ring
 * need none of that, hold their edges at every distance the camera reaches,
 * and are interned by `shareGeometryAndMaterials` along with everything else,
 * so the whole roster costs two geometries and one material.
 *
 * PURE, AND SEPARATED FROM THE FIGURE FOR THE SAME REASON THE HELMET IS. It
 * takes measurements and returns meshes, so a test can build it against a real
 * three in a node:vm and ask whether the mark actually covers half the shirt,
 * which is the only thing QA asked for and the only thing a screenshot of a
 * 40-pixel figure cannot settle.
 *
 * `glyph` is 'X' or 'O'. Anything else gets no mark rather than a wrong one.
 */
export function buildJerseyParts(glyph, torso, material) {
    const J = CFG.jersey;
    const h = torso.height * J.height;
    const w = torso.width * J.width;
    const stroke = h * J.stroke;
    // Front and back. Both sit on the torso's own centre line, out past the
    // shirt by a fraction of its depth: enough that nothing z-fights, little
    // enough that it reads as painted on rather than pinned to him.
    const faces = [1, -1].map((f) => f * torso.depth * (0.5 + J.lift));
    const parts = [];

    for (const z of faces) {
        if (glyph === 'X') {
            /**
             * THE BARS RUN CORNER TO CORNER, which is what makes it an X
             * rather than a cross. A box built along its own y points at
             * (0, 1); rotating it by theta about z sends that to
             * (-sin, cos), and the corner of a w by h box is (w, h), so
             * theta is minus atan(w / h) for one bar and plus it for the
             * other. Their length is the diagonal, not the height, or the
             * arms of the X stop short of its corners.
             */
            const tilt = Math.atan2(w, h);
            const diagonal = Math.hypot(w, h);
            for (const sign of [-1, 1]) {
                const bar = new THREE.Mesh(
                    new THREE.BoxGeometry(stroke, diagonal, stroke * 0.5), material
                );
                bar.position.set(0, torso.y, z);
                bar.rotation.z = sign * tilt;
                bar.name = 'jersey-mark';
                parts.push(bar);
            }
        } else if (glyph === 'O') {
            // A ring, squashed to the mark's own proportions. A torus is
            // already built in the xy plane facing +z, which is the way the
            // rig faces, so nothing has to be turned to stand it up.
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(h / 2 - stroke / 2, stroke / 2, 6, 20), material
            );
            ring.position.set(0, torso.y, z);
            ring.scale.set(w / h, 1, 1);
            ring.name = 'jersey-mark';
            parts.push(ring);
        }
    }
    return parts;
}

function addJersey(person, glyph, muscular) {
    const J = CFG.jersey;
    const material = new THREE.MeshStandardMaterial({
        color: J.colour,
        roughness: 0.55,
        metalness: 0.0,
        // Four floodlights and a dark field: a white mark on the shaded side
        // of a player otherwise sits at the same value as the shirt under it,
        // and the letter this game is named after stops being legible exactly
        // when the player turns away from the light.
        emissive: J.colour,
        emissiveIntensity: J.glow,
    });
    const parts = buildJerseyParts(glyph, measureTorso(person, muscular), material);
    for (const part of parts) person.add(part);
    return parts;
}

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

/**
 * WHICH ARM A STIFF-ARM GOES OUT ON, and why it is not simply "the one nearest
 * the defender".
 *
 * The view works out which side the man being shed is on and passes it as
 * `stiffArmSide` (see that function in view.js, whose sign was measured against
 * real three rather than reasoned about). That is the arm that should go out,
 * and half the time it is the arm holding the ball.
 *
 * NAMED `stiffSide` AND NOT `stiffArmSide`, deliberately, because view.js
 * already exports a DIFFERENT function under that name: that one decides which
 * side the defender is on, this one decides which arm may answer. Two functions
 * with one name across two modules is how the call below was written as
 * `stiffSide` while the declaration said `stiffArmSide`, which threw a
 * ReferenceError the first time anybody actually stiff-armed.
 *
 * IT MAY NEVER BE THE BALL ARM. `carryHold` pins the ball to a fixed point on
 * THROWING_SIDE rather than to whatever the hand is doing, so extending that
 * arm would leave the ball hanging in space beside a man reaching past it. A
 * real carrier switches the ball to his other arm; this rig cannot, so the free
 * arm does the work instead and the tuck stays honest. The lean and the sideways
 * travel still say which man he is getting away from.
 */
export function stiffSide(act = {}) {
    const want = act.stiffArmSide === -1 ? -1 : 1;
    const carrying = (act.carry || 'none') === 'tuck';
    return (carrying && want === THROWING_SIDE) ? -THROWING_SIDE : want;
}

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

    /**
     * CELEBRATING, WHICH IS THE ONE THING THAT HAPPENS AFTER THE WHISTLE.
     *
     * Read once for the figure rather than per arm, because two of the three
     * answers are about the WHOLE man: whether he is holding a ball, and
     * therefore which arm is free to do anything at all.
     *
     * THE BALL ARM MAY NOT LEAVE THE TUCK WHILE IT IS HOLDING THE BALL, and
     * that is the same rule `stiffSide` enforces a few lines up rather than a
     * new one. `carryHold` pins the ball to a fixed point in the rig's own
     * space rather than to the hand, so an arm thrown wide or pointed at
     * somebody would leave the ball hanging in the air beside a man who is
     * plainly not holding it. The one pose that DOES raise it is `raise`, which
     * is a carry of its own with a ball position to match (see `pose.raise`).
     */
    const cel = act.celebrate && act.celebrate.amount > 0 ? act.celebrate : null;
    const carry = act.carry || 'none';
    const raising = carry === 'raise';
    const clamped = carry === 'tuck';
    // Which arm may do the talking in a one-armed pose: the free one, and when
    // both are free the throwing side, so a defender with no ball still points
    // with the arm a carrier would have to use.
    const leadSide = clamped ? -THROWING_SIDE : THROWING_SIDE;

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

        /**
         * AND IT IS FIRST IN THE CHAIN, DELIBERATELY.
         *
         * Everything below this line is a judgement about a LIVE play: is he
         * reaching for a ball, is somebody inside his block, is he about to
         * bring a man down. None of those are still true after the whistle, and
         * several of them go on answering yes anyway, because they are read off
         * distances and the distances do not change once the simulation stops.
         * A defender celebrating an interception was still, by every one of
         * those readings, locked in a block.
         *
         * `celebration.js` decides who is celebrating and what with; this only
         * puts the hand where it says.
         */
        const celebrating = cel && !(clamped && side === THROWING_SIDE);
        if (celebrating) {
            const C = P.celebration;
            const ballArm = raising && side === THROWING_SIDE;
            const hand = ballArm
                ? P.raise.hand
                : (cel.arms === 'point'
                    ? (side === leadSide ? C.hands.point : C.hands.off)
                    : (C.hands[cel.arms] || C.hands.up));
            const a = anglesFor(hand, side);
            /**
             * THE BALL ARM COMES UP OUT OF THE TUCK, NOT OUT OF THE RUN.
             *
             * Everybody else blends out of the stride, because that is the pose
             * they were actually in. The man holding the ball was NOT running
             * with that arm: it was clamped across his ribs, and `carryHold`
             * carries the ball up the same curve this blend follows. Started
             * from the stride instead, the hand and the ball would set off from
             * two different places and only meet at the top.
             */
            const from = ballArm ? anglesFor(P.tuck.hand, side) : null;
            const fx = from ? from.armX : x;
            const fz = from ? from.armZ : z;
            const ff = from ? from.foreX : fore;
            x = lerp(fx, a.armX, cel.amount);
            z = lerp(fz, a.armZ, cel.amount);
            fore = lerp(ff, a.foreX, cel.amount);
        } else if (act.reach > 0 && act.reachAt) {
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
        } else if (act.stiffArm > 0 && side === stiffSide(act)) {
            /**
             * THE STIFF-ARM, AND IT IS ONE ARM, WHICH IS THE WHOLE POINT.
             *
             * Both arms out is a BLOCK, and it is drawn six lines below this
             * one. A carrier fending somebody off is sprinting with one arm
             * locked out and the other still wrapped round the ball, so this
             * branch deliberately does not match the other side: that arm falls
             * through to the tuck and keeps the ball where it is drawn.
             *
             * Above the block and the carries so that a man who has earned a
             * break actually plays it. He is a ball carrier, so without this he
             * would simply tuck and run, which is the animation QA already has.
             */
            const a = anglesFor(P.stiffArm.hand, side);
            x = lerp(x, a.armX, act.stiffArm);
            z = lerp(z, a.armZ, act.stiffArm);
            fore = lerp(fore, a.foreX, act.stiffArm);
        } else if (act.block > 0) {
            // Both arms out at the man in front. Held rather than swung: a
            // blocker's arms are the one part of him that is not running.
            const a = anglesFor(P.block.hand, side);
            x = lerp(x, a.armX, act.block);
            z = lerp(z, a.armZ, act.block);
            fore = lerp(fore, a.foreX, act.block);
        } else if (act.carry === 'throw') {
            /**
             * THE SNAP, AND THEN THE THROW, AS ONE CHAIN OF SOLVED POSES.
             *
             * `snapT` runs 0 to 1 from the moment the ball is snapped, and
             * carries BOTH arms from the under-centre hold up into the cocked
             * one: the ball comes back, the throwing arm goes up, and the off
             * hand comes off the ball and up in front of the chest. `throwT`
             * then takes the throwing arm on from there. Neither is a
             * keyframe. Both are the interpolation between two hand positions
             * that were each solved once, which is what made the throw itself
             * fall out of its two ends (see `throwRelease`).
             */
            const H = P.throwHold;
            const snapped = act.snapT === undefined ? 1 : act.snapT;
            const ready = anglesFor(P.underCentre.hand, side);
            if (side === THROWING_SIDE) {
                // Cocked, and swept forward while the elbow straightens, which
                // is what a throw is. Interpolating the two solved poses runs
                // the hand up over the shoulder, past the ear and down across
                // the body, so the whole motion falls out of its two ends.
                /**
                 * THE SNAP IS THE OUTER BLEND AND THE THROW IS THE INNER ONE,
                 * AND THAT ORDER IS NOT ARBITRARY.
                 *
                 * The throw buttons appear on the frame the ball is snapped, so
                 * a visitor who has already decided can press one well inside
                 * the 0.55 seconds the arm takes to come up. Blended the other
                 * way round, that throw would sweep from a HALF-RAISED hand,
                 * which sits at almost the same place as the release: the arm
                 * would barely move and the most important animation in the
                 * game would play as a twitch.
                 *
                 * This way the inner lerp always travels the full cocked-to-
                 * release arc, and the snap carries the whole sweep out of the
                 * under-centre hold. It reads as a quick release, it lands on
                 * the release pose exactly (the snap finishes first either
                 * way), and at `snapped` of 1, which is every ordinary throw,
                 * it reduces to precisely what it was.
                 */
                const t = act.throwT || 0;
                const cocked = anglesFor(H.hand, side);
                const to = anglesFor(P.throwRelease.hand, side);
                x = lerp(ready.armX, lerp(cocked.armX, to.armX, t), snapped);
                z = lerp(ready.armZ, lerp(cocked.armZ, to.armZ, t), snapped);
                fore = lerp(ready.foreX, lerp(cocked.foreX, to.foreX, t), snapped);
            } else {
                const a = anglesFor(H.offHand, side);
                x = lerp(ready.armX, a.armX, snapped);
                z = lerp(ready.armZ, a.armZ, snapped);
                fore = lerp(ready.foreX, a.foreX, snapped);
            }
        } else if (act.posting > 0 && (act.carry || 'none') === 'none') {
            /**
             * WANTING IT. Both hands up, which is the second half of QA item
             * 3: a receiver who has run out of route turns back to the ball
             * and asks for it rather than milling on the spot.
             *
             * Below the carries deliberately. A man holding the ball is not
             * asking anybody for it.
             */
            const a = anglesFor(P.posting.hand, side);
            x = lerp(x, a.armX, act.posting);
            z = lerp(z, a.armZ, act.posting);
            fore = lerp(fore, a.foreX, act.posting);
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
            /**
             * AND BIG HANDS, WHICH IS QA ROUND TWENTY-SEVEN, ITEM 2.
             *
             * The rig's default hand is a 0.04 sphere squashed to (0.8, 1, 0.5),
             * so at `figureScale` it is about 14cm by 9cm: correct for a person
             * and about two pixels from the play camera. Every pose this scene
             * owns finishes at a hand, the catch, the block, the stiff-arm and
             * the carry, and a pose whose end nobody can see is a pose that
             * reads as an arm waving.
             *
             * `handScale` is the shared part's own knob (www/automan uses 1.4
             * and www/interstate 1.25 for the same reason), so this is a number
             * rather than a change to geometry twelve other rooms draw. 1.9 is
             * a gloved hand: it is the thing the ball arrives in and the thing
             * a lineman puts on somebody's shoulder.
             */
            handScale: 1.9,
        });
        addHelmet(person, kit);
        // THE LETTERS ARE BACK, ON THE SHIRT RATHER THAN INSTEAD OF IT. D22
        // dropped animated X and O figures because three rounds of animation
        // could not make a letterform read as a person. A mark on a jersey is
        // the opposite trade: the person carries the scene and the letter
        // carries the name.
        addJersey(person, TEAMS[team].glyph, isLineman);
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
