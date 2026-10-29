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
