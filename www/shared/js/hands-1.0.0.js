// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hands.js - hand shapes for a pose, made for Meme Studio (Steve's QA,
 * 2026-10-28: "a big part of the meme is in the point", then "a custom hand
 * rig that really looks like the avatar is using its index finger") and
 * promoted here the same day for Leaf Blower, whose operator grips the
 * blower's handle in the fist (a second scene customizing the figure's
 * hands: Steve's rule, NPC customization belongs here). The shared rig draws its
 * hand as ONE mesh (people-1.0.0 `handGeometry`: a palm, four fingers and
 * a thumb), so these are second geometries in the same frame, swapped onto
 * the hand mesh of the arm that leads: the hand's middle at the origin,
 * the back of the hand toward +z, the fingers hanging -y (along the
 * forearm), the thumb on the inner side.
 *
 *   fist      the fingers curled into a block under the palm, the thumb
 *             laid over them on the inner side: for a thing held (the
 *             meme's blaster, its barrel out past the knuckles; the leaf
 *             blower's handle, through the curled fingers at `gripPoint`)
 *   pointing  the fist with the index out straight and long, a cartoon's
 *             point, drawn a little larger than the rig's hand
 *   open      the rig's own hand at that larger size, for the other
 *             action poses (a palm out, a hand raised), so the two hands
 *             of Nope / Yep are one size
 *
 * The rig's open hand curled its three fingers in the first cut (the same
 * capsules, bent), which read as a lumpy palm at panel size.
 */

import { HAND, handGeometry, mergeParts } from './people-1.0.0.min.js';

/** The shapes' measures in hand units (people-1.0.0 HAND): the curled
 *  fingers' block `knuckles` wide, `curl` tall and `deep` toward the palm;
 *  the index `reach` long and `indexR` thick; the thumb `thumbR` thick
 *  and `thumbLength` long; the whole hand `scale` times the rig's. */
export const FIST = Object.freeze({
    knuckles: 1.4, curl: 0.95, deep: 0.85, round: 0.42,
    reach: 1.7, indexR: 0.17, thumbR: 0.19, thumbLength: 1.0, scale: 1.15
});

/**
 * A fist's geometry, `unit` meters a hand unit, the thumb on the `inner`
 * side (+1 or -1 along x), with the index out when `index` is true.
 */
export function fistGeometry(unit, inner, { index = false } = {}) {
    const H = HAND;
    const Fi = FIST;
    const parts = [];
    const place = (geometry, position, rotation = null) => {
        const m = new THREE.Matrix4();
        if (rotation) m.makeRotationFromEuler(rotation);
        m.setPosition(position[0] * unit, position[1] * unit, position[2] * unit);
        parts.push({ geometry, matrix: m });
    };
    const [pw, ph] = H.palm;
    const pd = Fi.deep * 0.7;
    const palmBottom = H.palmTop - ph;
    // The palm: the rig's own outline (so the wrist join is the same),
    // deeper, since a fist is thick.
    const outline = new THREE.Shape();
    outline.moveTo(-pw / 2 * unit, palmBottom * unit);
    outline.lineTo(pw / 2 * unit, palmBottom * unit);
    outline.lineTo(H.palmNeck / 2 * unit, H.palmTop * unit);
    outline.lineTo(-H.palmNeck / 2 * unit, H.palmTop * unit);
    outline.closePath();
    place(new THREE.ExtrudeGeometry(outline, { depth: pd * unit, bevelEnabled: false }), [0, 0, -pd / 2]);
    // The curled fingers: a block under the palm, its front rounded by a
    // cylinder lying across it (the knuckles), bulging toward the palm.
    const curlMid = palmBottom - Fi.curl / 2 + 0.15;
    place(new THREE.BoxGeometry(Fi.knuckles * unit, Fi.curl * unit, Fi.deep * unit), [0, curlMid, -Fi.deep / 2 + pd / 2]);
    place(new THREE.CylinderGeometry(Fi.round * unit, Fi.round * unit, Fi.knuckles * unit, 10),
        [0, curlMid - Fi.curl / 2 + Fi.round * 0.35, -Fi.deep / 2 + pd / 2 - Fi.round * 0.3], new THREE.Euler(0, 0, Math.PI / 2));
    // The index: a long capsule straight down from the thumb side of the
    // knuckles, so it points where the forearm points.
    if (index) {
        const r = Fi.indexR;
        const body = Fi.reach - 2 * r;
        const x = inner * (Fi.knuckles / 2 - r * 1.6);
        place(new THREE.CapsuleGeometry(r * unit, body * unit, 3, 8), [x, curlMid - Fi.curl / 2 - body / 2 + r * 0.5, -Fi.deep / 2 + pd / 2 + r * 0.2]);
    }
    // The thumb: laid over the curled fingers from the palm's inner top
    // corner, down and across toward the middle.
    {
        const r = Fi.thumbR;
        const body = Math.max(0.05, Fi.thumbLength - 2 * r);
        const dir = new THREE.Vector3(-inner * 0.55, -1, -0.35).normalize();
        const base = new THREE.Vector3(inner * (pw / 2 - r * 0.6), H.palmTop - ph * 0.35, -pd / 2 - r * 0.6);
        const middle = base.clone().addScaledVector(dir, body / 2 + r * 0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        place(new THREE.CapsuleGeometry(r * unit, body * unit, 3, 8), [middle.x, middle.y, middle.z], new THREE.Euler().setFromQuaternion(q));
    }
    return mergeParts(parts);
}

/**
 * Where a bar held in the fist passes, in the hand's own frame (`unit`
 * meters a hand unit, as `fistGeometry` was built): the middle of the
 * curled fingers' block. A bar through it runs along the hand's x, the
 * knuckles' line (Leaf Blower's handle, 2026-10-28).
 */
export function gripPoint(unit) {
    const pd = FIST.deep * 0.7;
    const palmBottom = HAND.palmTop - HAND.palm[1];
    const curlMid = palmBottom - FIST.curl / 2 + 0.15;
    return new THREE.Vector3(0, curlMid * unit, (-FIST.deep / 2 + pd / 2) * unit);
}

/**
 * A rig hand (the mesh people-1.0.0 tags `isHand`) closed into a fist at
 * `scale` times its own size, the thumb on the rig's inner side, found from
 * the arm it hangs from: for a scene that has the person, not an avatar
 * figure (Leaf Blower's operator). Returns `{ hand, unit, open() }`, `open`
 * giving back the rig's own hand, or null for a mesh that is not one.
 */
export function closeHand(hand, { scale = 1 } = {}) {
    if (!hand || !hand.userData || !hand.userData.isHand) return null;
    let arm = hand.parent;
    while (arm && !(arm.userData && arm.userData.isArm)) arm = arm.parent;
    const inner = arm && arm.userData.armSide > 0 ? -1 : 1;
    const unit = (hand.userData.handUnit || HAND.unit) * scale;
    const own = hand.geometry;
    const fist = fistGeometry(unit, inner);
    hand.geometry = fist;
    hand.userData.shape = 'fist';
    return {
        hand,
        unit,
        open() {
            if (hand.geometry === fist) {
                hand.geometry = own;
                fist.dispose();
            }
            hand.userData.shape = 'open';
        }
    };
}

/** The pointing hand's geometry: the fist with the index out. */
export function pointingHandGeometry(unit, inner) {
    return fistGeometry(unit, inner, { index: true });
}

/** The hand mesh of `figure`'s arm on `side` ('right' or 'left'), by the
 *  rig's tag, or null. */
export function handOf(figure, side) {
    let hand = null;
    const arm = figure.arms && figure.arms[side];
    if (!arm) return null;
    arm.traverse((o) => { if (!hand && o.userData && o.userData.isHand) hand = o; });
    return hand;
}

/** The hand on `side` of `figure` given `geometry` (built with the hand's
 *  own unit times `FIST.scale`, the thumb on the rig's inner side), the
 *  old geometry let go and the shape named in `userData.shape`. */
function swapHand(figure, side, shape, build) {
    const hand = handOf(figure, side);
    if (!hand) return null;
    const unit = (hand.userData.handUnit || HAND.unit) * FIST.scale;
    // The rig's inner side is toward the body: -x for the left arm (+x side).
    const inner = side === 'left' ? -1 : 1;
    if (hand.geometry && hand.geometry.dispose) hand.geometry.dispose();
    hand.geometry = build(unit, inner);
    hand.userData.shape = shape;
    return hand;
}

/** The hand on `side` of `figure` made a pointing hand. Returns the hand
 *  mesh, or null when there is none. */
export function pointWith(figure, side) {
    const hand = swapHand(figure, side, 'pointing', pointingHandGeometry);
    if (hand) hand.userData.pointing = true;
    return hand;
}

/** The hand on `side` of `figure` made a fist. Returns the hand mesh, or
 *  null when there is none. */
export function fistWith(figure, side) {
    return swapHand(figure, side, 'fist', (unit, inner) => fistGeometry(unit, inner));
}

/** The hand on `side` of `figure` the rig's own open hand, drawn at the
 *  fist's larger size, so an action hand is one size whatever its shape.
 *  Returns the hand mesh, or null when there is none. */
export function openWith(figure, side) {
    return swapHand(figure, side, 'open', (unit, inner) => handGeometry(unit, inner));
}
