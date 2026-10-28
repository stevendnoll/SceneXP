// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hands.js - hand shapes for a pose (Steve's QA, 2026-10-28: "a big part
 * of the meme is in the point", then "a custom hand rig that really looks
 * like the avatar is using its index finger"). The shared rig draws its
 * hand as ONE mesh (people-1.0.0 `handGeometry`: a palm, four fingers and
 * a thumb), so these are second geometries in the same frame, swapped onto
 * the hand mesh of the arm that leads: the hand's middle at the origin,
 * the back of the hand toward +z, the fingers hanging -y (along the
 * forearm), the thumb on the inner side.
 *
 *   fist      the fingers curled into a block under the palm, the thumb
 *             laid over them on the inner side: for a thing held (the
 *             blaster), the barrel out past the knuckles
 *   pointing  the fist with the index out straight and long, a cartoon's
 *             point, drawn a little larger than the rig's hand
 *
 * The rig's open hand curled its three fingers in the first cut (the same
 * capsules, bent), which read as a lumpy palm at panel size.
 */

import { HAND, mergeParts } from '../../shared/js/people-1.0.0.min.js';

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
