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
 *   grip      a hand on a ball (X's and O's quarterback, 2026-11-01): the
 *             hand turned about the forearm to face the ball, the fingers
 *             bent down onto its surface, the thumb round its inner side
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

/**
 * A HAND ON A BALL (X's and O's, Steve's QA 2026-11-01 from the new
 * over-the-shoulder replay view: "the QB's fingers are going through the
 * ball"). Measured on the real rig, the held ball's centre sat 2.5 hand units
 * off the THUMB side of the throwing hand, at palm level, for a ball 2.2 units
 * in radius: the palm faced his head, and the thumb and the palm's inner edge
 * were inside the ball. So the hand is turned to face the ball (`gripHand`)
 * and given this shape for it.
 *
 * `radius` is the ball's radius and `at` its centre, both in hand units, the
 * centre in the hand's own frame with x 0 and z negative (the palm side). The
 * palm is the rig's own. Each finger is bent at the knuckle by the angle that
 * lands its tip on the ball, solved per finger (a bigger or further ball means
 * a straighter finger, and one it cannot reach bends as far as a finger
 * bends), and the four are spread a little across it. The thumb comes round
 * the inner side toward the ball and stops at its surface. Nothing of it is
 * inside the ball, which the shared test holds vertex by vertex.
 */
export const GRIP = Object.freeze({ spread: 0.14, touch: 0.9, minCurl: 0.15, maxCurl: 1.6 });

export function gripGeometry(unit, inner, { radius = 2.2, at = { y: 0.4, z: -2.65 } } = {}) {
    const H = HAND;
    const G = GRIP;
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
    const cy = Number.isFinite(at && at.y) ? at.y : 0.4;
    const cz = -Math.abs(Number.isFinite(at && at.z) ? at.z : radius + 0.45);
    // The fingers: each from its knuckle at the palm's bottom, bent toward the
    // palm (-z) by the angle that puts its tip on the ball, and splayed.
    H.finger.lengths.forEach((length, k) => {
        const r = H.finger.radius;
        const x = ((k + 0.5) / 4 - 0.5) * pw * 0.92;
        const body = Math.max(0.05, length - 2 * r);
        const half = body / 2 + r;
        const top = palmBottom + r * 0.6;
        const gap = (c) => Math.hypot(top - 2 * half * Math.cos(c) - cy, -2 * half * Math.sin(c) - cz) - (radius + r * G.touch);
        let lo = G.minCurl;
        let hi = G.maxCurl;
        let c;
        if (gap(lo) <= 0) c = lo;
        else if (gap(hi) >= 0) c = hi;
        else {
            for (let i = 0; i < 24; i += 1) {
                const mid = (lo + hi) / 2;
                if (gap(mid) > 0) lo = mid; else hi = mid;
            }
            c = (lo + hi) / 2;
        }
        const s = G.spread * ((k - 1.5) / 1.5);
        place(new THREE.CapsuleGeometry(r * unit, body * unit, 3, 8),
            [x + half * Math.sin(s), top - half * Math.cos(s) * Math.cos(c), -half * Math.cos(s) * Math.sin(c)],
            new THREE.Euler(c, 0, s));
    });
    // The thumb: from the palm's inner top corner toward the ball's inner
    // side, a little below its middle, as long as the rig's or as long as the
    // way to the ball, whichever is shorter.
    {
        const r = H.thumb.radius;
        const base = new THREE.Vector3(inner * (pw / 2 - r * 0.8), H.palmTop - ph * 0.3, -pd / 2);
        const centre = new THREE.Vector3(0, cy, cz);
        const dir = centre.clone().add(new THREE.Vector3(inner * radius * 0.55, -radius * 0.15, 0)).sub(base).normalize();
        const reach = radius + r * G.touch;
        const toCentre = centre.clone().sub(base);
        const along = toCentre.dot(dir);
        const off2 = toCentre.lengthSq() - along * along;
        const hit = reach * reach - off2;
        const way = hit >= 0 ? along - Math.sqrt(hit) : Infinity;
        const length = Math.max(2 * r + 0.05, Math.min(H.thumb.length, way));
        const body = length - 2 * r;
        const middle = base.clone().addScaledVector(dir, body / 2 + r * 0.6);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        place(new THREE.CapsuleGeometry(r * unit, body * unit, 3, 8), [middle.x, middle.y, middle.z], new THREE.Euler().setFromQuaternion(q));
    }
    return mergeParts(parts);
}

/**
 * A rig hand (tagged `isHand`) put on a ball of `radius` metres whose centre
 * is `ball`, a Vector3 in the hand's PARENT frame (the forearm's), metres:
 * turned about the forearm so its palm faces the ball, and given
 * `gripGeometry` for it. Returns `{ hand, unit, roll, at, open() }`, `open`
 * giving back the rig's own hand and its resting turn, or null for a mesh
 * that is not a hand or a ball that is nowhere.
 */
export function gripHand(hand, { radius, ball } = {}) {
    if (!hand || !hand.userData || !hand.userData.isHand || !ball) return null;
    let arm = hand.parent;
    while (arm && !(arm.userData && arm.userData.isArm)) arm = arm.parent;
    const inner = arm && arm.userData.armSide > 0 ? -1 : 1;
    const unit = hand.userData.handUnit || HAND.unit;
    const bx = Number(ball.x) - (Number(hand.position.x) || 0);
    const by = Number(ball.y) - (Number(hand.position.y) || 0);
    const bz = Number(ball.z) - (Number(hand.position.z) || 0);
    if (![bx, by, bz, radius].every(Number.isFinite) || !(radius > 0)) return null;
    // The turn about the forearm (the hand's own y) that puts the ball straight
    // in front of the palm: at x 0, z negative, in the hand's frame.
    const roll = Math.atan2(bx, bz) + Math.PI;
    const at = { y: by / unit, z: -Math.hypot(bx, bz) / unit };
    const own = hand.geometry;
    const rest = hand.rotation.y;
    let grip = gripGeometry(unit, inner, { radius: radius / unit, at });
    hand.geometry = grip;
    hand.rotation.y = roll;
    hand.userData.shape = 'grip';
    const held = {
        hand,
        unit,
        roll,
        at,
        /**
         * The ball moved in the forearm's frame (the arm still settling into
         * its pose, a pose eased frame by frame): the hand turns to keep
         * facing it every call, and is reshaped only when the ball has moved
         * more than a tenth of a unit toward or along the palm, since the
         * fingers were solved for where it was.
         */
        follow(next) {
            if (!next || hand.geometry !== grip) return held;
            const nx = Number(next.x) - (Number(hand.position.x) || 0);
            const ny = Number(next.y) - (Number(hand.position.y) || 0);
            const nz = Number(next.z) - (Number(hand.position.z) || 0);
            if (![nx, ny, nz].every(Number.isFinite)) return held;
            held.roll = Math.atan2(nx, nz) + Math.PI;
            hand.rotation.y = held.roll;
            const there = { y: ny / unit, z: -Math.hypot(nx, nz) / unit };
            if (Math.abs(there.y - held.at.y) > 0.1 || Math.abs(there.z - held.at.z) > 0.1) {
                held.at = there;
                const fresh = gripGeometry(unit, inner, { radius: radius / unit, at: there });
                grip.dispose();
                grip = fresh;
                hand.geometry = grip;
            }
            return held;
        },
        open() {
            if (hand.geometry === grip) {
                hand.geometry = own;
                grip.dispose();
            }
            hand.rotation.y = rest;
            hand.userData.shape = 'open';
        }
    };
    return held;
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
