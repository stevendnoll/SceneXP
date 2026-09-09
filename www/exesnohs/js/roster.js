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
 * people-1.0.0 puts the head at `legLength + torsoHeight + neckHeight +
 * headRadius`, which is 1.62, with a radius of 0.12, and then hangs hair off
 * it: `hairTop` at +0.05, `hairSide` at +0.06 and `hairBack` at -0.10, each
 * about 0.125 across. So the thing a helmet has to hide runs from roughly 1.50
 * to 1.70 and is 0.25 wide.
 *
 * THE PREVIOUS SHELL DID NOT REACH, and that is why the second attempt looked
 * WORSE than the first. It stopped at 1.50 on paper and its scale pulled the
 * real edge up above that, so a band of black hair showed all the way round the
 * back below a big pale dome. A gap between a helmet and a head reads as a hat
 * two sizes too small, and no amount of facemask fixes it.
 */
export const HEAD = { y: 1.62, r: 0.12, hairR: 0.128, hairLow: 1.50, hairHigh: 1.70 };

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
    const AT = [0, 1.622, -0.010];
    const SCALE = [1.06, 1.04, 1.16];
    // Where the crown stops and the face opening begins. At 0.42 of a
    // half-turn the join sits at y = 1.66, which is above the eyes, so the
    // opening starts at the brow the way a real shell does.
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
        flap.position.set(side * 0.128, 1.545, 0.016);
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
        [1.610, 0.084, MASK_Z - 0.022],
        [1.563, 0.092, MASK_Z],
        [1.516, 0.080, MASK_Z - 0.012],
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
    centre.position.set(0, 1.562, MASK_Z - 0.004);
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
        stem.position.set(side * 0.086, 1.596, 0.122);
        stem.name = 'helmet-mask';
        parts.push(stem);
    }

    // A chin strap under the jaw, closing the shell between the two flaps.
    const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0105, 0.0105, 0.20, 6), maskMat
    );
    strap.rotation.set(0, 0, Math.PI / 2);
    strap.position.set(0, 1.496, 0.058);
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
 * That makes four poses the entire vocabulary, and it is enough, because each
 * of them answers a question a viewer is actually asking.
 *
 *   running      is he moving, and how fast
 *   throwHold    is the quarterback looking downfield or has he tucked it
 *   tuck         who has the ball right now
 *   block        is my line holding anybody up
 *
 * THE TWO ARMS ARE IN ANTIPHASE WHEN RUNNING, which is the lesson from the
 * letters attempt (D24). Swinging them together, however subtly, reads as a
 * pulse rather than as a stride.
 *
 * NEGATIVE rotation.x IS FORWARD. The arm group hangs down its local -Y, and
 * rotating about +X carries that to -Z while the rig faces +Z. Derived from the
 * axes rather than guessed, because guessing it produces a quarterback throwing
 * over his own back and a lineman blocking the man behind him.
 *
 * `armSide` is -1 on one arm and +1 on the other, and the THROWING ARM is the
 * positive one, chosen once here so the ball and the arm cannot disagree.
 */
export const THROWING_SIDE = 1;

const lerp = (a, b, t) => a + (b - a) * t;

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
 * `act` is what the figure is doing beyond running: `{ carry, throwT, block }`.
 * Anything omitted is simply not applied, so a plain runner costs one lerp.
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
        // running arm carries a little permanent elbow, because a person
        // sprinting with two straight arms reads as a mannequin on wheels.
        let x = rest + (side < 0 ? swing : -swing);
        let z = restZ;
        let fore = 0.16 + effort * 0.55;

        if (act.tackle > 0) {
            // Both arms low and reaching round him. Beats blocking, because a
            // lineman who has arrived at the ball carrier is tackling.
            const T = P.tackle;
            x = lerp(x, T.armX, act.tackle);
            z = lerp(z, side * T.armZ, act.tackle);
            fore = lerp(fore, T.foreX, act.tackle);
        } else if (act.block > 0) {
            // Both arms out at the man in front. Held rather than swung: a
            // blocker's arms are the one part of him that is not running.
            x = lerp(x, P.block.armX, act.block);
            z = lerp(z, side * P.block.armZ, act.block);
            fore = lerp(fore, 0.30, act.block);
        } else if (act.carry === 'throw') {
            const H = P.throwHold;
            if (side === THROWING_SIDE) {
                // Cocked, and swept forward while the elbow straightens, which
                // is what a throw is.
                const t = act.throwT || 0;
                x = lerp(H.armX, P.throwRelease.armX, t);
                z = side * H.armZ * (1 - t * 0.7);
                fore = lerp(H.foreX, P.throwRelease.foreX, t);
            } else {
                x = H.offX;
                z = side * H.offZ;
                fore = H.offFore;
            }
        } else if (act.carry === 'tuck' && side === THROWING_SIDE) {
            // Only the carrying arm folds. The other one still runs, which is
            // what makes a tuck read as a tuck rather than as a shrug.
            x = P.tuck.armX;
            z = side * P.tuck.armZ;
            fore = P.tuck.foreX;
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
