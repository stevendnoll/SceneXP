// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/buttons.js - the props of Two Buttons (template 14): the box's back
 * wall is a control panel, two big red buttons side by side, a dark plate over
 * each for the visitor's words (where the format has them), and the visitor's
 * own hand reaching up from below, between them, not yet decided (Steve's QA,
 * 2026-11-03), and in the panel under it their sweat flying. Generic (PRD section
 * 7): a red button is a red button.
 *
 * THE PANEL IS ON THE WALL, so the picture's close camera and the stage's
 * view of the whole box show the same thing, as a text tile's wall does. The
 * hand is a prop and not a figure, since a figure would stand in the box with
 * its head in view on the stage, and a panel of no face would offer face chips,
 * but it wears the visitor's skin and sleeve (Steve's QA, 2026-11-03: a glove on
 * a dark pole read as a popsicle), kept in step by `redress`.
 */

import { pressGeometry } from '../../../shared/js/hands-1.0.0.min.js';
import { colorOf } from '../../../shared/js/avatar-1.0.0.min.js';

/**
 * The measures, meters in the box. `x` either side of the middle:
 *
 *   button  its middle `y` up the wall, a dome `r` across standing `rise`
 *           proud, in a `collar` a little wider
 *   plate   `w` by `h` over the button at height `y`, in a lighter `rim`
 *   hand    its middle `at`, the fingers up and leaning `lean` radians toward
 *           the wall, so the arm comes from the camera's side as your own arm
 *           would, turned `turn` to show a little of the thumb's side, `unit`
 *           meters a hand unit (large enough to read at thumbnail size), and a
 *           `sleeve` from `wrist` to `elbow` thick, running down to the floor
 *   drops   flying off the sweating head (the `sweat` builder), `[x, y, z]`
 *           and a size each, a teardrop `r` across, `tall` times that
 */
export const BUTTONS = Object.freeze({
    x: 0.43,
    button: Object.freeze({
        y: 0.88, r: 0.225, rise: 0.13, color: 0xd81f26,
        collar: Object.freeze({ r: 0.27, depth: 0.045, color: 0xc4c9cf })
    }),
    plate: Object.freeze({ y: 1.38, w: 0.76, h: 0.4, depth: 0.02, color: 0x23262b, rim: 0x8d949b, rimWidth: 0.018 }),
    hand: Object.freeze({
        at: Object.freeze([0.03, 0.84, -0.32]), lean: 0.5, turn: 0.3, unit: 0.1,
        sleeve: Object.freeze({ wrist: 0.058, elbow: 0.078 })
    }),
    drops: Object.freeze({
        r: 0.014, tall: 1.7, color: 0x7cc4f2,
        at: Object.freeze([
            Object.freeze([-0.2, 1.71, 0.06, 1.1]), Object.freeze([-0.27, 1.62, 0.03, 0.8]), Object.freeze([0.17, 1.74, 0.05, 1]),
            Object.freeze([0.23, 1.67, 0.03, 1.2]), Object.freeze([0.29, 1.58, 0.01, 0.9]), Object.freeze([0.2, 1.49, 0.06, 1.1]),
            Object.freeze([-0.23, 1.48, 0.05, 0.9])
        ])
    })
});

/** A plate's four front corners on side `s` (-1 the camera's left, +1 its
 *  right) in the box's own meters, for a caption drawn on it (panels.js
 *  `propRects`). `wall` is the back wall's z. */
export function plateCorners(s, wall, K = BUTTONS) {
    const P = K.plate;
    const z = wall + P.depth + 0.001;
    const [cx, hw, hh] = [s * K.x, P.w / 2, P.h / 2];
    return [[cx - hw, P.y + hh, z], [cx + hw, P.y + hh, z], [cx + hw, P.y - hh, z], [cx - hw, P.y - hh, z]];
}

/** The two buttons, their plates and the hand in `box`. Returns the group,
 *  its `userData.surfaces` the plates (`left` and `right`, the camera's). */
export function build(box, config, { avatarFor = null } = {}) {
    const K = BUTTONS;
    const wall = -config.box.depth / 2;
    const group = new THREE.Group();
    group.name = 'buttons';
    const mat = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const red = mat(K.button.color, 0.3);
    const steel = mat(K.button.collar.color, 0.35, 0.5);
    const dark = mat(K.plate.color, 0.85);
    const rim = mat(K.plate.rim, 0.5, 0.3);
    for (const s of [-1, 1]) {
        const x = s * K.x;
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(K.button.collar.r, K.button.collar.r, K.button.collar.depth, 40), steel);
        collar.name = 'collar';
        // A cylinder stands along y: turned to stand out of the wall.
        collar.rotation.x = Math.PI / 2;
        collar.position.set(x, K.button.y, wall + K.button.collar.depth / 2);
        group.add(collar);
        // The dome: the top half of a ball, turned to face out of the wall.
        const dome = new THREE.Mesh(new THREE.SphereGeometry(K.button.r, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), red);
        dome.name = 'button';
        dome.rotation.x = Math.PI / 2;
        dome.scale.y = K.button.rise / K.button.r;
        dome.position.set(x, K.button.y, wall + K.button.collar.depth);
        group.add(dome);
        const P = K.plate;
        const edge = new THREE.Mesh(new THREE.BoxGeometry(P.w + 2 * P.rimWidth, P.h + 2 * P.rimWidth, P.depth * 0.6), rim);
        edge.name = 'rim';
        edge.position.set(x, P.y, wall + (P.depth * 0.6) / 2);
        group.add(edge);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(P.w, P.h, P.depth), dark);
        plate.name = 'plate';
        plate.position.set(x, P.y, wall + P.depth / 2);
        group.add(plate);
    }
    const H = K.hand;
    const skin = mat(0xc9a07a, 0.7);
    const shirt = mat(0x2f3a46, 0.8);
    // The arm's own frame, its +y up the forearm toward the fingertips, leaning
    // toward the wall: a negative turn about x carries +y toward -z.
    const arm = new THREE.Group();
    arm.name = 'arm';
    arm.position.set(H.at[0], H.at[1], H.at[2]);
    arm.rotation.x = -H.lean;
    group.add(arm);
    const hand = new THREE.Mesh(pressGeometry(H.unit, 1), skin);
    hand.name = 'hand';
    // The hand's fingers run along its -y: a half turn stands them up with the
    // back of the hand still toward the camera, as your own right hand's is.
    hand.rotation.set(0, H.turn, Math.PI);
    arm.add(hand);
    const wrist = -H.unit;
    // Down the arm's line to the floor, so its end is under it, not in the air.
    const length = H.at[1] / Math.cos(H.lean);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(H.sleeve.wrist, H.sleeve.elbow, length, 16), shirt);
    sleeve.name = 'sleeve';
    sleeve.position.y = wrist - length / 2;
    arm.add(sleeve);
    /** The hand in `avatar`'s skin and the sleeve in its shirt. */
    const redress = (avatar) => {
        if (!avatar) return;
        skin.color.setHex(colorOf('skin', avatar.skin));
        shirt.color.setHex(colorOf('shirt', avatar.shirt));
    };
    redress(avatarFor && avatarFor('you'));
    group.userData.redress = (roleId, avatar) => { if (roleId === 'you') redress(avatar); };
    group.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    group.userData.surfaces = { left: plateCorners(-1, wall), right: plateCorners(1, wall) };
    box.add(group);
    return group;
}

/** The sweat flying off the head in `box`, in the panel under the buttons: big
 *  enough to read at thumbnail size, as the face's own drops are not on a phone.
 *  Returns the group. */
export function sweat(box) {
    const D = BUTTONS.drops;
    const group = new THREE.Group();
    group.name = 'flyingSweat';
    const water = new THREE.MeshStandardMaterial({ color: D.color, roughness: 0.15, metalness: 0.1 });
    const ball = new THREE.SphereGeometry(D.r, 12, 10);
    for (const [x, y, z, size] of D.at) {
        const drop = new THREE.Mesh(ball, water);
        drop.name = 'drop';
        drop.position.set(x, y, z);
        drop.scale.set(size, size * D.tall, size * 0.8);
        // Leaning away from the head, as they fly off it.
        drop.rotation.z = -Math.atan2(x, y - 1.3) * 0.7;
        group.add(drop);
    }
    box.add(group);
    return group;
}
