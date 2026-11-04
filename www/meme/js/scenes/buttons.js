// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/buttons.js - the props of Two Buttons (template 14): the box's back
 * wall is a control panel, two big red buttons side by side, a dark plate
 * under each for the visitor's words, and a gloved finger coming down between
 * them, not yet decided. Generic (PRD section 7): a red button is a red
 * button.
 *
 * THE PANEL IS ON THE WALL, so the picture's close camera and the stage's
 * view of the whole box show the same thing, as a text tile's wall does. The
 * hand is a prop and not the visitor's arm: a figure would stand in the box
 * with its head in view on the stage, and a panel of no face would offer face
 * chips. A glove has no skin tone to keep in step with the avatar.
 */

import { pointingHandGeometry } from '../../../shared/js/hands-1.0.0.min.js';

/**
 * The measures, meters in the box. `x` either side of the middle:
 *
 *   button  its middle `y` up the wall, a dome `r` across standing `rise`
 *           proud, in a `collar` a little wider
 *   plate   `w` by `h` under the button at height `y`, in a lighter `rim`
 *   hand    its middle `at`, `unit` meters a hand unit (large enough to read
 *           at thumbnail size), and a `cuff` of radius `r` from the wrist up
 *           to the ceiling
 */
export const BUTTONS = Object.freeze({
    x: 0.43,
    button: Object.freeze({
        y: 1.3, r: 0.225, rise: 0.13, color: 0xd81f26,
        collar: Object.freeze({ r: 0.27, depth: 0.045, color: 0xc4c9cf })
    }),
    plate: Object.freeze({ y: 0.82, w: 0.76, h: 0.4, depth: 0.02, color: 0x23262b, rim: 0x8d949b, rimWidth: 0.018 }),
    hand: Object.freeze({
        at: Object.freeze([0, 1.46, -0.3]), unit: 0.11, color: 0xe8c33a,
        cuff: Object.freeze({ r: 0.052, color: 0x2f3a46 })
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
export function build(box, config) {
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
    const hand = new THREE.Mesh(pointingHandGeometry(H.unit, 1), mat(H.color, 0.55));
    hand.name = 'hand';
    hand.position.set(H.at[0], H.at[1], H.at[2]);
    group.add(hand);
    const wrist = H.at[1] + H.unit;
    const length = config.box.height - wrist;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(H.cuff.r, H.cuff.r, length, 16), mat(H.cuff.color, 0.8));
    cuff.name = 'cuff';
    cuff.position.set(H.at[0], wrist + length / 2, H.at[2]);
    group.add(cuff);
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
