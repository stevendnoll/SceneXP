// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The poses (www/meme/js/poses.js, specs/meme PLANNING 5.2), measured on
 * the REAL rig: each pose puts the leading hand where it was solved to go
 * (2026-10-27), the other arm rests, the template's side leads (never the
 * avatar's handedness, QA 2026-10-28), and the head turns the template's
 * way, no further than the cap. A rig edit that moves a hand is caught
 * here, not in a browser.
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let P;
let F;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    P = await import('../www/meme/js/poses.js');
    F = await import('../www/shared/js/avatar-figure-1.0.0.min.js');
});

afterAll(() => {
    delete globalThis.THREE;
});

/** Where an arm's hand is, in the figure's own meters. */
function handOf(figure, side) {
    figure.group.updateMatrixWorld(true);
    let hand = null;
    figure.arms[side].traverse((o) => { if (o.userData && o.userData.isHand && !hand) hand = o; });
    return hand.getWorldPosition(new THREE.Vector3());
}

test('the handshake: two figures stood as The Handshake stands them clasp right hands on one spot, chest high', () => {
    const H = P.HANDSHAKE;
    // The template's costume: the pose is solved on this build.
    const BUFF = { build: 'broad', muscles: 'buff', sleeves: 'short' };
    const a = F.createAvatar(BUFF);
    const b = F.createAvatar(BUFF);
    a.group.position.set(-H.gap / 2, 0, -H.aside);
    a.group.rotation.y = Math.PI / 2 - H.turn;
    b.group.position.set(H.gap / 2, 0, H.aside);
    b.group.rotation.y = -Math.PI / 2 + H.turn;
    // The friend's hand has a twist of its own (the template's), as the
    // stances are not a mirror pair.
    const FRIEND_TWIST = 0.91;
    a.setPose(P.armsFor('shake'));
    b.setPose(P.armsFor('shake', 'right', FRIEND_TWIST));
    const ha = handOf(a, 'right');
    const hb = handOf(b, 'right');
    // A clasp (Steve, 2026-10-28): the hands vertical, thumbs up, the
    // visitor's a palm's thickness nearer the camera with its back to it,
    // the friend's just behind with its back away, the same height.
    const d = hb.clone().sub(ha);
    expect(Math.abs(d.x)).toBeLessThan(0.03);
    expect(Math.abs(d.y)).toBeLessThan(0.02);
    expect(d.z).toBeLessThan(-0.03);
    expect(d.z).toBeGreaterThan(-0.1);
    const axesOf = (figure) => {
        let hand = null;
        figure.arms.right.traverse((o) => { if (o.userData && o.userData.isHand && !hand) hand = o; });
        const at = hand.getWorldPosition(new THREE.Vector3());
        const dir = (v) => v.applyMatrix4(hand.matrixWorld).sub(at).normalize();
        return { thumb: dir(new THREE.Vector3(1, 0, 0)), back: dir(new THREE.Vector3(0, 0, 1)) };
    };
    expect(axesOf(a).back.z).toBeGreaterThan(0.8);
    expect(axesOf(b).back.z).toBeLessThan(-0.8);
    expect(axesOf(a).thumb.y).toBeGreaterThan(0.7);
    expect(axesOf(b).thumb.y).toBeGreaterThan(0.7);
    // Chest high, between the two, the forearms rising to the clasp.
    expect(ha.y).toBeGreaterThan(1.18);
    expect(ha.y).toBeLessThan(1.4);
    expect(Math.abs((ha.x + hb.x) / 2)).toBeLessThan(0.2);
    const elbow = a.arms.right.userData.forearm.getWorldPosition(new THREE.Vector3());
    expect(ha.y).toBeGreaterThan(elbow.y + 0.08);
    // On the standard build the shoulders are narrower, so the hands cross
    // a little: still a clasp at panel size.
    const c = F.createAvatar({});
    const e = F.createAvatar({});
    c.group.position.copy(a.group.position);
    c.group.rotation.y = a.group.rotation.y;
    e.group.position.copy(b.group.position);
    e.group.rotation.y = b.group.rotation.y;
    c.setPose(P.armsFor('shake'));
    e.setPose(P.armsFor('shake', 'right', FRIEND_TWIST));
    expect(handOf(c, 'right').distanceTo(handOf(e, 'right'))).toBeLessThan(0.25);
    // A twist asked for is the hand's; none asked keeps the pose's own.
    expect(P.armsFor('shake', 'right', 0.5).right.twist).toBe(0.5);
    expect(P.armsFor('shake', 'left', 0.5).left.twist).toBe(0.5);
    expect(P.armsFor('shake').right.twist).toBe(P.ARM_POSES.shake.twist);
    expect(P.armsFor('shake', 'right', NaN).right.twist).toBe(P.ARM_POSES.shake.twist);
    for (const f of [a, b, c, e]) f.dispose();
});

test('the list names every pose once, stand and lookBack moving no arm', () => {
    expect(P.POSES).toEqual(['stand', 'dismiss', 'approve', 'present', 'shake', 'point', 'aim', 'lookBack']);
    expect(P.POINTING).toEqual(['point']);
    expect(P.ARM_POSES.stand).toBeNull();
    expect(P.ARM_POSES.lookBack).toBeNull();
    const rest = P.armsFor('stand');
    expect(rest.right).toEqual(F.REST);
    expect(rest.left).toEqual(F.REST);
    expect(P.armsFor('nope')).toEqual(rest);
});

test('each pose lands the leading hand where it was solved, and rests the other', () => {
    const figure = F.createAvatar({});
    const shoulder = figure.arms.right.getWorldPosition(new THREE.Vector3());
    figure.setPose(P.armsFor('stand'));
    const restLeft = handOf(figure, 'left');
    // Dismiss: the hand at chest height, well forward, out of the way.
    figure.setPose(P.armsFor('dismiss'));
    let hand = handOf(figure, 'right');
    expect(hand.y).toBeGreaterThan(shoulder.y - 0.05);
    expect(hand.y).toBeLessThan(shoulder.y + 0.2);
    expect(hand.z).toBeGreaterThan(0.3);
    expect(handOf(figure, 'left').distanceTo(restLeft)).toBeLessThan(1e-6);
    // Approve: the hand up by the head, forward.
    figure.setPose(P.armsFor('approve'));
    hand = handOf(figure, 'right');
    expect(hand.y).toBeGreaterThan(figure.head().y - 0.1);
    expect(hand.z).toBeGreaterThan(0.3);
    // Present: the hand out to the figure's right, toward a chart.
    figure.setPose(P.armsFor('present'));
    hand = handOf(figure, 'right');
    expect(hand.x).toBeLessThan(-0.55);
    expect(hand.y).toBeGreaterThan(shoulder.y - 0.2);
    expect(hand.z).toBeGreaterThan(0.1);
    // Aim: the arm straight out in front at shoulder height, the forearm
    // level (solved 2026-10-28), for a thing held.
    figure.setPose(P.armsFor('aim'));
    hand = handOf(figure, 'right');
    expect(hand.z).toBeGreaterThan(0.5);
    expect(Math.abs(hand.y - shoulder.y)).toBeLessThan(0.12);
    expect(Math.abs(hand.x)).toBeLessThan(0.2);
    figure.dispose();
});

test('the point puts the hand out to the leading side at chest height, the forearm, and so the index, pointing that way', () => {
    const figure = F.createAvatar({});
    figure.setPose(P.armsFor('point', 'left'));
    const hand = handOf(figure, 'left');
    const elbow = figure.arms.left.userData.forearm.getWorldPosition(new THREE.Vector3());
    const dir = hand.clone().sub(elbow).normalize();
    expect(hand.x).toBeGreaterThan(0.5);
    expect(hand.y).toBeGreaterThan(1.15);
    expect(hand.y).toBeLessThan(1.4);
    expect(hand.z).toBeGreaterThan(0.25);
    // To the figure's left and forward, near level: the finger follows.
    expect(dir.x).toBeGreaterThan(0.5);
    expect(dir.z).toBeGreaterThan(0.5);
    expect(Math.abs(dir.y)).toBeLessThan(0.3);
    figure.dispose();
});

test('a pointing hand swaps the leading hand\'s geometry for a fist with the index out, larger, and leaves the other hand', async () => {
    const Hd = await import('../www/shared/js/hands-1.0.0.js');
    const figure = F.createAvatar({});
    const before = Hd.handOf(figure, 'left');
    const other = Hd.handOf(figure, 'right');
    const oldGeometry = before.geometry;
    const unit = before.userData.handUnit;
    const reach = (g) => { g.computeBoundingBox(); return g.boundingBox.clone(); };
    const open = reach(oldGeometry);
    const hand = Hd.pointWith(figure, 'left');
    expect(hand).toBe(before);
    expect(hand.geometry).not.toBe(oldGeometry);
    expect(hand.userData.pointing).toBe(true);
    expect(hand.userData.shape).toBe('pointing');
    expect(hand.userData.handUnit).toBe(unit);
    expect(other.userData.shape).toBeUndefined();
    // The index reaches well past the rig's open fingers, and the fist is
    // thicker than the open palm.
    const point = reach(hand.geometry);
    expect(point.min.y).toBeLessThan(open.min.y - 0.02);
    expect(point.max.z - point.min.z).toBeGreaterThan(open.max.z - open.min.z);
    // A fist alone is shorter: no index past the knuckles.
    const fist = reach(Hd.fistGeometry(unit, -1));
    expect(fist.min.y).toBeGreaterThan(point.min.y + 0.02);
    expect(fist.min.y).toBeLessThan(open.min.y + 0.03);
    const fisted = Hd.fistWith(figure, 'right');
    expect(fisted).toBe(other);
    expect(other.userData.shape).toBe('fist');
    // The open hand at the same larger size: the rig's shape, scaled, so a
    // palm out beside a pointing fist is one size.
    const opened = Hd.openWith(figure, 'right');
    expect(opened).toBe(other);
    expect(other.userData.shape).toBe('open');
    const big = reach(other.geometry);
    expect(big.max.x - big.min.x).toBeCloseTo((open.max.x - open.min.x) * Hd.FIST.scale, 3);
    expect(big.max.y - big.min.y).toBeCloseTo((open.max.y - open.min.y) * Hd.FIST.scale, 3);
    expect(Hd.pointWith({ arms: {} }, 'left')).toBeNull();
    expect(Hd.fistWith({ arms: {} }, 'right')).toBeNull();
    figure.dispose();
});

test('the point and the aim stand the thumb up, so the index shows in profile and a thing held is upright', () => {
    const axesOf = (figure, side) => {
        let hand = null;
        figure.arms[side].traverse((o) => { if (o.userData && o.userData.isHand && !hand) hand = o; });
        figure.group.updateMatrixWorld(true);
        const at = hand.getWorldPosition(new THREE.Vector3());
        const dir = (v) => v.applyMatrix4(hand.matrixWorld).sub(at).normalize();
        return { thumb: dir(new THREE.Vector3(side === 'left' ? -1 : 1, 0, 0)), back: dir(new THREE.Vector3(0, 0, 1)) };
    };
    const figure = F.createAvatar({});
    figure.setPose(P.armsFor('point', 'left'));
    expect(axesOf(figure, 'left').thumb.y).toBeGreaterThan(0.9);
    figure.setPose(P.armsFor('aim', 'right'));
    const aim = axesOf(figure, 'right');
    expect(aim.thumb.y).toBeGreaterThan(0.9);
    // The back of the hand outward (the figure's right), the palm in.
    expect(aim.back.x).toBeLessThan(-0.9);
    // The dismiss shows its palm to the camera, the thumb toward the body's
    // middle (the camera's left for the left hand; Steve, 2026-10-28: the
    // back of the hand was showing).
    figure.setPose(P.armsFor('dismiss', 'left'));
    const dismiss = axesOf(figure, 'left');
    expect(dismiss.back.z).toBeLessThan(-0.5);
    expect(dismiss.thumb.x).toBeLessThan(-0.8);
    expect(P.ENLARGED).toEqual(['dismiss', 'approve', 'present']);
    figure.dispose();
});

test('a stride swings the legs from the hips the opposite ways, capped, and a nod is capped', () => {
    expect(P.legsFor(0)).toEqual({ right: -0, left: 0 });
    expect(P.legsFor(0.3)).toEqual({ right: -0.3, left: 0.3 });
    expect(P.legsFor(9)).toEqual({ right: -P.STRIDE.most, left: P.STRIDE.most });
    expect(P.legsFor('x')).toEqual({ right: -0, left: 0 });
    expect(P.nodFor(-0.35)).toBeCloseTo(-0.35, 9);
    expect(P.nodFor(-9)).toBe(-P.MAX_NOD);
    expect(P.nodFor(NaN)).toBe(0);
});

test('the side asked for leads, mirrored, whatever the avatar\'s handedness', () => {
    expect(P.SIDES).toEqual(['right', 'left']);
    const figure = F.createAvatar({ handedness: 'left' });
    figure.setPose(P.armsFor('present', 'left'));
    const left = handOf(figure, 'left');
    expect(left.x).toBeGreaterThan(0.55);
    figure.setPose(P.armsFor('present', 'right'));
    const right = handOf(figure, 'right');
    expect(right.x).toBeCloseTo(-left.x, 2);
    expect(right.y).toBeCloseTo(left.y, 2);
    expect(right.z).toBeCloseTo(left.z, 2);
    // Nothing but the side is read: a left-handed avatar's right arm leads
    // when the template says right.
    expect(P.armsFor('present')).toEqual(P.armsFor('present', 'right'));
    expect(P.armsFor('present', 'left').right).toEqual(F.REST);
    figure.dispose();
});

test('the head turns the way it is told, never past the cap', () => {
    expect(P.headTurnFor('stand')).toBe(0);
    expect(P.headTurnFor('approve')).toBe(0);
    // Toward the figure's right is a negative turn about +y (-x on the rig).
    expect(P.headTurnFor('dismiss')).toBeCloseTo(-P.HEAD_TURNS.dismiss, 9);
    expect(P.headTurnFor('dismiss', 'right')).toBeCloseTo(-P.HEAD_TURNS.dismiss, 9);
    expect(P.headTurnFor('dismiss', 'left')).toBeCloseTo(P.HEAD_TURNS.dismiss, 9);
    expect(P.headTurnFor('lookBack', 'left')).toBeCloseTo(P.HEAD_TURNS.lookBack, 9);
    // Radians of its own, either way, capped; nonsense is no turn.
    expect(P.headTurnFor('approve', 0.35)).toBeCloseTo(0.35, 9);
    expect(P.headTurnFor('approve', -0.35)).toBeCloseTo(-0.35, 9);
    expect(P.headTurnFor('approve', 0)).toBe(0);
    expect(P.headTurnFor('approve', 9)).toBe(P.MAX_HEAD_TURN);
    expect(P.headTurnFor('approve', -9)).toBe(-P.MAX_HEAD_TURN);
    expect(P.headTurnFor('approve', NaN)).toBe(0);
    expect(P.headTurnFor('nope')).toBe(0);
    for (const id of P.POSES) for (const look of P.SIDES) expect(Math.abs(P.headTurnFor(id, look))).toBeLessThanOrEqual(P.MAX_HEAD_TURN);
});
