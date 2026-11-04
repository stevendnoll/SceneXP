// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared hand shapes (www/shared/js/hands-1.0.0.js), promoted from Meme
 * Studio on 2026-10-28 for Leaf Blower. The shapes themselves (the fist,
 * the point, the open hand at the action size) are measured on avatar
 * figures by tests/meme-poses; held here is what a scene with only the
 * person needs: a tagged hand closed into a fist and opened again, its
 * thumb on the arm's inner side, and the grip a held bar passes through.
 * On the real three, since the stub absorbs every assignment.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let Hd;
let P;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    jest.resetModules();
    Hd = await import('../www/shared/js/hands-1.0.0.js');
    P = await import('../www/shared/js/people-1.0.0.js');
});
afterAll(() => {
    delete globalThis.THREE;
});

/** A plain rig person and its hand on arm side `side` (-1 its right). */
function handOn(side) {
    const person = P.createPerson({});
    const arm = person.children.find((o) => o.userData && o.userData.isArm && o.userData.armSide === side);
    let hand = null;
    arm.traverse((o) => { if (!hand && o.userData && o.userData.isHand) hand = o; });
    return { person, hand };
}

test('the finger-and-thumb ring: an open loop on the thumb\'s side, closed all round, with three fingers up, on either hand (Meme Studio, 2026-11-03)', () => {
    const R = Hd.RING;
    const unit = 0.05;
    for (const inner of [1, -1]) {
        const geometry = Hd.ringGeometry(unit, inner);
        const p = geometry.attributes.position;
        const pts = [];
        for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i));
        // The loop stands in the palm's plane, past the palm on the thumb's
        // side, and nothing of the hand is in its hole.
        const hole = new THREE.Vector3(inner * R.center[0] * unit, R.center[1] * unit, 0);
        expect(Math.abs(hole.x)).toBeGreaterThan((Hd.RING.r * 0.5 + 0.7) * unit);
        expect(Math.min(...pts.map((v) => v.distanceTo(hole)))).toBeGreaterThan(R.r * unit * 0.5);
        // Closed, not a hook: a ray from the hole's middle meets the hand
        // within about the loop's radius whichever way it goes in that plane.
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const caster = new THREE.Raycaster();
        for (let a = 0; a < 360; a += 15) {
            const t = (a * Math.PI) / 180;
            caster.set(hole, new THREE.Vector3(Math.cos(t), Math.sin(t), 0));
            caster.far = R.r * unit * 1.5;
            expect(`${inner} at ${a}: ${caster.intersectObject(mesh).length > 0}`).toBe(`${inner} at ${a}: true`);
        }
        // Three fingers up past the loop's top, on the far side of the palm
        // from it (a hand, not a hook on a card).
        const beyond = pts.filter((v) => v.y < (R.center[1] - R.r - 0.25) * unit);
        expect(beyond.length).toBeGreaterThan(0);
        expect(Math.max(...beyond.map((v) => v.x * inner))).toBeLessThan(0.5 * unit);
        geometry.dispose();
    }
});

test('a figure\'s hand made the ring keeps a name for it, sits as deep in the sleeve as a plain hand, and nothing for a figure with no such arm', () => {
    const { person, hand } = handOn(-1);
    const arm = person.children.find((o) => o.userData && o.userData.isArm && o.userData.armSide === -1);
    const made = Hd.ringWith({ arms: { right: arm } }, 'right');
    expect(made).toBe(hand);
    expect(hand.userData.shape).toBe('ring');
    hand.geometry.computeBoundingBox();
    // The palm's top, which runs up inside the sleeve, is where the same hand
    // at the pointing size has it, though the whole hand is larger.
    const unit = hand.userData.handUnit * Hd.FIST.scale;
    // (Its bevel stands a tenth of a larger hand unit past that.)
    expect(hand.geometry.boundingBox.max.y).toBeCloseTo((P.HAND.palmTop + 0.1 * Hd.RING.scale) * unit, 3);
    expect(Hd.RING.scale).toBeGreaterThan(1);
    expect(Hd.ringWith({ arms: {} }, 'right')).toBeNull();
});

test('a hand about to press: the index straight out past the rest, the other three curled back, on either hand (Two Buttons, 2026-11-03)', () => {
    const unit = 0.1;
    for (const inner of [1, -1]) {
        const geometry = Hd.pressGeometry(unit, inner);
        const p = geometry.attributes.position;
        const pts = [];
        for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i));
        const tip = pts.reduce((best, v) => (v.y < best.y ? v : best), pts[0]);
        // The index is on the thumb's side of the hand, and alone at the end.
        expect(tip.x * inner).toBeGreaterThan(0.3 * unit);
        const palmBottom = (P.HAND.palmTop - P.HAND.palm[1]) * unit;
        // Past the knuckles by more than a palm's width, whatever PRESS says: a
        // finger that shows at a thumbnail.
        expect(tip.y).toBeLessThan(palmBottom - 1.5 * unit);
        const past = pts.filter((v) => v.y < palmBottom - unit * 0.9);
        expect(Math.min(...past.map((v) => v.x * inner))).toBeGreaterThan(0.2 * unit);
        // The others are curled toward the palm side, not out straight.
        const curled = pts.filter((v) => v.x * inner < 0.2 * unit && v.y < palmBottom);
        expect(curled.length).toBeGreaterThan(0);
        expect(Math.min(...curled.map((v) => v.z))).toBeLessThan(-Hd.PRESS.curled.second * unit);
        geometry.dispose();
    }
});

test('a hand on a ball: turned to face it, fingers bent onto it, thumb round it, nothing inside it (X\'s and O\'s, 2026-11-01)', () => {
    const { hand } = handOn(-1);
    const own = hand.geometry;
    const rest = hand.rotation.y;
    const unit = hand.userData.handUnit;
    const up = new THREE.Vector3(0, 1, 0);
    // The ball where X's and O's throw hold put it, measured on the real rig
    // in the resting hand's own frame: 2.51 units off the thumb side, 0.39
    // up, 0.77 toward the palm, radius 2.18 units. In the forearm's frame:
    const inOwn = new THREE.Vector3(2.51, 0.39, -0.77).multiplyScalar(unit);
    const ball = inOwn.clone().applyAxisAngle(up, rest).add(hand.position);
    const radius = 2.18 * unit;
    // The rig's own hand was through it: its nearest vertex inside the ball.
    const nearestOf = (geometry, centre) => {
        const pos = geometry.getAttribute('position');
        let nearest = Infinity;
        for (let i = 0; i < pos.count; i += 1) nearest = Math.min(nearest, new THREE.Vector3().fromBufferAttribute(pos, i).distanceTo(centre));
        return nearest;
    };
    expect(nearestOf(own, inOwn)).toBeLessThan(radius);

    const grip = Hd.gripHand(hand, { radius, ball });
    expect(grip.hand).toBe(hand);
    expect(hand.userData.shape).toBe('grip');
    expect(hand.geometry).not.toBe(own);
    // Turned so the ball lies straight in front of the palm, at the same
    // height and the same distance it was.
    const local = ball.clone().sub(hand.position).applyAxisAngle(up, -hand.rotation.y);
    expect(Math.abs(local.x)).toBeLessThan(1e-9);
    expect(local.z).toBeLessThan(0);
    expect(grip.at.y).toBeCloseTo(0.39, 9);
    expect(grip.at.z).toBeCloseTo(-Math.hypot(2.51, 0.77), 9);
    // Nothing of the new hand is inside the ball, and the fingertips are on it.
    const centre = new THREE.Vector3(0, grip.at.y * unit, grip.at.z * unit);
    const nearest = nearestOf(hand.geometry, centre);
    expect(nearest).toBeGreaterThan(radius - 0.03 * unit);
    expect(nearest).toBeLessThan(radius + 0.2 * unit);
    // Bent, not the rig's straight fingers: a finger's tip is well forward
    // of the palm's front, where a straight finger's never is.
    const pos = hand.geometry.getAttribute('position');
    let mostForward = 0;
    for (let i = 0; i < pos.count; i += 1) mostForward = Math.min(mostForward, pos.getZ(i));
    expect(mostForward).toBeLessThan(-0.8 * unit);
    // The ball moving in the forearm's frame (an arm still settling): the
    // hand turns to keep facing it, reshaped only for a real move.
    const kept = hand.geometry;
    const nudged = ball.clone().add(new THREE.Vector3(0.03 * unit, 0, 0.02 * unit));
    grip.follow(nudged);
    const after = nudged.clone().sub(hand.position).applyAxisAngle(up, -hand.rotation.y);
    expect(Math.abs(after.x)).toBeLessThan(1e-9);
    expect(hand.geometry).toBe(kept);
    const moved = inOwn.clone().add(new THREE.Vector3(0, 0.5 * unit, 0)).applyAxisAngle(up, rest).add(hand.position);
    grip.follow(moved);
    expect(hand.geometry).not.toBe(kept);
    expect(grip.at.y).toBeCloseTo(0.89, 9);
    grip.follow(ball);
    // His own hand and its resting turn come back.
    const g = hand.geometry;
    const disposed = jest.spyOn(g, 'dispose');
    grip.open();
    expect(hand.geometry).toBe(own);
    expect(hand.rotation.y).toBe(rest);
    expect(hand.userData.shape).toBe('open');
    expect(disposed).toHaveBeenCalled();
    // The other arm mirrors it: the thumb on its own inner side.
    const left = handOn(1);
    const mirrored = new THREE.Vector3(-2.51, 0.39, -0.77).multiplyScalar(unit).applyAxisAngle(up, left.hand.rotation.y).add(left.hand.position);
    const g2 = Hd.gripHand(left.hand, { radius, ball: mirrored });
    expect(g2).toBeTruthy();
    expect(nearestOf(left.hand.geometry, new THREE.Vector3(0, g2.at.y * unit, g2.at.z * unit))).toBeGreaterThan(radius - 0.03 * unit);
    g2.open();
    // Not a hand, or no ball, is nothing.
    expect(Hd.gripHand(null, { radius, ball })).toBeNull();
    expect(Hd.gripHand(hand, { radius, ball: null })).toBeNull();
    expect(Hd.gripHand(hand, { radius: 0, ball })).toBeNull();
    expect(hand.userData.shape).toBe('open');
});

test('a tagged hand closes into the fist and opens again into its own hand', () => {
    const { hand } = handOn(-1);
    const own = hand.geometry;
    const closed = Hd.closeHand(hand);
    expect(closed.hand).toBe(hand);
    expect(closed.unit).toBe(hand.userData.handUnit);
    expect(hand.userData.shape).toBe('fist');
    expect(hand.geometry).not.toBe(own);
    const fist = hand.geometry;
    const disposed = jest.spyOn(fist, 'dispose');
    closed.open();
    expect(hand.geometry).toBe(own);
    expect(hand.userData.shape).toBe('open');
    expect(disposed).toHaveBeenCalledTimes(1);
    // Opened twice, nothing more changes.
    closed.open();
    expect(hand.geometry).toBe(own);
    expect(disposed).toHaveBeenCalledTimes(1);
});

test('the fist is the meme\'s fist at the hand\'s own unit (or larger), its thumb on the arm\'s inner side', () => {
    const size = (g) => {
        g.computeBoundingBox();
        return g.boundingBox;
    };
    for (const side of [-1, 1]) {
        const { hand } = handOn(side);
        const unit = hand.userData.handUnit;
        Hd.closeHand(hand);
        const inner = side > 0 ? -1 : 1;
        const want = size(Hd.fistGeometry(unit, inner));
        const got = size(hand.geometry);
        expect(got.min.distanceTo(want.min)).toBeLessThan(1e-9);
        expect(got.max.distanceTo(want.max)).toBeLessThan(1e-9);
        // The thumb's side reaches further out than the other.
        expect(Math.sign(got.max.x + got.min.x)).toBe(inner);
    }
    const { hand } = handOn(-1);
    expect(Hd.closeHand(hand, { scale: 1.15 }).unit).toBeCloseTo(hand.userData.handUnit * 1.15, 12);
});

test('the grip lies in the middle of the curled fingers, under the palm, along the knuckles\' line', () => {
    const unit = 0.05;
    const grip = Hd.gripPoint(unit);
    const fist = Hd.fistGeometry(unit, 1);
    fist.computeBoundingBox();
    expect(fist.boundingBox.containsPoint(grip)).toBe(true);
    expect(grip.x).toBe(0);
    // Below the hand's middle (the fingers hang -y), toward the palm (-z).
    expect(grip.y).toBeLessThan(-0.5 * unit);
    expect(grip.z).toBeLessThan(0);
    // It scales with the unit.
    expect(Hd.gripPoint(unit * 2).y).toBeCloseTo(grip.y * 2, 12);
});

test('anything but a tagged hand is not closed', () => {
    expect(Hd.closeHand(null)).toBeNull();
    expect(Hd.closeHand(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))).toBeNull();
    // A hand with no arm above it, and no unit of its own: the right arm's
    // thumb side, at the rig's own unit.
    const loose = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    loose.userData.isHand = true;
    const closed = Hd.closeHand(loose);
    expect(closed.unit).toBe(P.HAND.unit);
});
