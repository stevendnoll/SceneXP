// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * roster.js - The players on the field, and what they are wearing.
 *
 * Builds one figure per player from the shared people part and hands them back
 * keyed by position, so view.js can move them without knowing how they were
 * made. It knows nothing about the game: it never reads a route, a formation
 * or a score.
 *
 * THE LETTERS WERE TRIED AND DROPPED (2026-09-08, D22). The offence were
 * animated X's and the defence O's, in these same two colours, on the grounds
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

/** How far the arms swing, in radians, at a full run. Deliberately modest:
 *  an over-swung arm reads as flailing, and the previous design was abandoned
 *  partly for exactly that. */
const ARM_SWING = 0.55;

let group = null;
const figures = new Map();   // position -> THREE.Group

/**
 * A helmet.
 *
 * The single cheapest thing that turns a low-poly person into a football
 * player rather than a person standing on grass, and at this distance it is
 * also most of the team colour the viewer sees.
 */
function addHelmet(person, kit) {
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
        new THREE.MeshStandardMaterial({ color: kit.helmet, roughness: 0.35, metalness: 0.15 })
    );
    // The shared rig is 1.75 tall with the head centred near 1.62.
    helmet.position.set(0, 1.63, 0);
    person.add(helmet);

    const bar = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.012, 5, 10, Math.PI),
        new THREE.MeshStandardMaterial({ color: kit.mask, roughness: 0.5, metalness: 0.4 })
    );
    bar.rotation.set(Math.PI / 2, 0, Math.PI);
    bar.position.set(0, 1.575, 0.085);
    person.add(bar);
    return helmet;
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
 * Swing the arms.
 *
 * The rig groups each arm at the shoulder and tags it, so the arms are the one
 * limb that can be animated: the legs are bare meshes with no pivot. Arms
 * alone are still the strongest running cue available, and unlike the letters
 * they cannot break the silhouette however far they go.
 *
 * THE TWO ARMS ARE IN ANTIPHASE, WHICH IS THE LESSON FROM THE LETTERS. Swinging
 * them together, however subtly, reads as a pulse rather than as a stride.
 */
export function poseFigure(figure, speed = 0, phase = 0) {
    const arms = figure.userData.arms;
    if (!arms || !arms.length) return;
    const effort = Math.min(speed / 3.0, 1);
    const swing = Math.sin(phase) * effort * ARM_SWING;
    for (const arm of arms) {
        arm.rotation.x = arm.userData.armSide < 0 ? swing : -swing;
    }
}

/**
 * Wind up and release, for the quarterback.
 *
 * `t` runs 0 to 1 across the throw: the near arm goes back, then whips
 * forward. M4 drives this; nothing calls it yet.
 */
export function poseThrow(figure, t) {
    const arms = figure.userData.arms;
    if (!arms || !arms.length) return;
    const arm = arms[arms.length - 1];
    arm.rotation.x = t < 0.45
        ? -1.6 * (t / 0.45)
        : -1.6 + 3.4 * ((t - 0.45) / 0.55);
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

        person.name = `player-${position}`;
        person.userData.position = position;
        person.userData.team = team;
        person.userData.phase = Math.random() * Math.PI * 2;  // nobody in step
        // The arms, found once at build time rather than searched every frame.
        person.userData.arms = person.children.filter((c) => c.userData && c.userData.isArm);

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
