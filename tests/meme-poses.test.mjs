// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The poses (www/meme/js/poses.js, specs/meme PLANNING 5.2), measured on
 * the REAL rig: each pose puts the leading hand where it was solved to go
 * (2026-10-27), the other arm rests, a left-handed avatar leads with the
 * other arm, and the head turns no further than the cap. A rig edit that
 * moves a hand is caught here, not in a browser.
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

test('the list names every pose once, stand and lookBack moving no arm', () => {
    expect(P.POSES).toEqual(['stand', 'dismiss', 'approve', 'present', 'lookBack']);
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
    figure.dispose();
});

test('a left-handed avatar leads with the left arm, mirrored', () => {
    const figure = F.createAvatar({ handedness: 'left' });
    figure.setPose(P.armsFor('present', figure.avatar.handedness));
    const left = handOf(figure, 'left');
    expect(left.x).toBeGreaterThan(0.55);
    figure.setPose(P.armsFor('present', 'right'));
    const right = handOf(figure, 'right');
    expect(right.x).toBeCloseTo(-left.x, 2);
    expect(right.y).toBeCloseTo(left.y, 2);
    expect(right.z).toBeCloseTo(left.z, 2);
    figure.dispose();
});

test('the head turns toward the leading side, never past the cap', () => {
    expect(P.headTurnFor('stand')).toBe(0);
    expect(P.headTurnFor('approve')).toBe(0);
    expect(P.headTurnFor('dismiss')).toBeCloseTo(-P.HEAD_TURNS.dismiss, 9);
    expect(P.headTurnFor('dismiss', 'left')).toBeCloseTo(P.HEAD_TURNS.dismiss, 9);
    expect(Math.abs(P.headTurnFor('lookBack'))).toBeLessThanOrEqual(P.MAX_HEAD_TURN);
    expect(P.headTurnFor('nope')).toBe(0);
    for (const id of P.POSES) expect(Math.abs(P.headTurnFor(id))).toBeLessThanOrEqual(P.MAX_HEAD_TURN);
});
