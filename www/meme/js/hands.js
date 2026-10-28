// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hands.js - a hand shape for a pose (Steve's QA, 2026-10-28: "a big part
 * of the meme is in the point"). The shared rig draws its hand as ONE mesh
 * (people-1.0.0 `handGeometry`: a palm, four fingers and a thumb), so a
 * pointing hand is a second geometry in the same frame, swapped onto the
 * hand mesh of the arm that leads: the index out straight, the other three
 * curled into the palm, the thumb as it was. The frame is the rig's: the
 * hand's middle at the origin, the back of the hand toward +z, the fingers
 * hanging -y, so the index points where the forearm points.
 */

import { HAND, mergeParts } from '../../shared/js/people-1.0.0.min.js';

/** The point's own measures, in hand units (people-1.0.0 HAND): the index
 *  `reach` long, the curled fingers bent `curl` radians into the palm. */
export const POINT = Object.freeze({ reach: 1.45, curl: 1.35, index: 1 });

/**
 * The pointing hand's geometry, `unit` meters a hand unit, the thumb on
 * the `inner` side (+1 or -1 along x), as `handGeometry` takes them.
 */
export function pointingHandGeometry(unit, inner) {
    const H = HAND;
    const parts = [];
    const place = (geometry, position, rotation = null) => {
        const m = new THREE.Matrix4();
        if (rotation) m.makeRotationFromEuler(rotation);
        m.setPosition(position[0] * unit, position[1] * unit, position[2] * unit);
        parts.push({ geometry, matrix: m });
    };
    const [pw, ph, pd] = H.palm;
    const palmBottom = H.palmTop - ph;
    const outline = new THREE.Shape();
    outline.moveTo(-pw / 2 * unit, palmBottom * unit);
    outline.lineTo(pw / 2 * unit, palmBottom * unit);
    outline.lineTo(H.palmNeck / 2 * unit, H.palmTop * unit);
    outline.lineTo(-H.palmNeck / 2 * unit, H.palmTop * unit);
    outline.closePath();
    place(new THREE.ExtrudeGeometry(outline, { depth: pd * unit, bevelEnabled: false }), [0, 0, -pd / 2]);
    // The index is the finger nearest the thumb; the rig lays the fingers
    // across the palm from -x to +x, so on the inner side that is the last
    // or the first.
    H.finger.lengths.forEach((length, k) => {
        const r = H.finger.radius;
        const slot = inner > 0 ? 3 - k : k;
        const isIndex = slot === POINT.index - 1;
        const c = isIndex ? 0 : POINT.curl;
        const x = ((k + 0.5) / 4 - 0.5) * pw * 0.92;
        const body = Math.max(0.05, (isIndex ? POINT.reach : length * 0.8) - 2 * r);
        const half = body / 2 + r;
        const sink = r * 0.6;
        place(new THREE.CapsuleGeometry(r * unit, body * unit, 3, 8),
            [x, palmBottom + sink - half * Math.cos(c), -half * Math.sin(c)], new THREE.Euler(c, 0, 0));
    });
    {
        const r = H.thumb.radius;
        const body = Math.max(0.05, H.thumb.length - 2 * r);
        const dir = new THREE.Vector3(inner * Math.sin(H.thumb.out), -Math.cos(H.thumb.out), -Math.sin(H.thumb.forward)).normalize();
        const base = new THREE.Vector3(inner * (pw / 2 - r * 0.8), H.palmTop - ph * 0.3, 0);
        const middle = base.clone().addScaledVector(dir, body / 2 + r * 0.6);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        place(new THREE.CapsuleGeometry(r * unit, body * unit, 3, 8), [middle.x, middle.y, middle.z], new THREE.Euler().setFromQuaternion(q));
    }
    return mergeParts(parts);
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

/**
 * The hand on `side` of `figure` made a pointing hand: its geometry
 * replaced (the old one let go), the same unit and thumb side the rig
 * built it with. Returns the hand mesh, or null when there is none.
 */
export function pointWith(figure, side) {
    const hand = handOf(figure, side);
    if (!hand) return null;
    const unit = hand.userData.handUnit || HAND.unit;
    // The rig's inner side is toward the body: -x for the left arm (+x side).
    const inner = side === 'left' ? -1 : 1;
    if (hand.geometry && hand.geometry.dispose) hand.geometry.dispose();
    hand.geometry = pointingHandGeometry(unit, inner);
    hand.userData.pointing = true;
    return hand;
}
