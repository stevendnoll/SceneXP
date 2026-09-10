// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-arm.test.mjs - does the hand actually land where it was asked to?
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB, for the same reason the
 * helmet suite cannot: the stub models no geometry and no transforms, so an arm
 * posed against it is three numbers written onto a proxy and every question
 * about where the hand went comes back as undefined.
 *
 * WHY IT IS WORTH THE TROUBLE. The scene's whole pose vocabulary is now written
 * as hand positions and solved by arm.js, so a solver that is quietly wrong
 * would move every player's arms at once, which is precisely the failure that
 * shipped last round: an elbow angle with the wrong sign, in five poses, for a
 * whole QA cycle, in plain sight and unnameable.
 *
 * It builds a real `createPerson`, sets the angles the solver returns, reads
 * the hand's real world position out of the scene graph, and compares. The
 * previous round's version of this test lived inside the gameplay suite and
 * re-implemented the forward kinematics in its own arithmetic, which is a test
 * agreeing with a copy of the thing it is testing.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let arm;
let poseHand;      // (side, armX, armZ, foreX) -> the hand's world position
let poseElbow;
let RIG;
let CFG;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;

    const people = await import(join(root, 'www/shared/js/people-1.0.0.js'));
    arm = await import(join(root, 'www/exesnohs/js/arm.js'));
    RIG = arm.RIG;
    CFG = (await import(join(root, 'www/exesnohs/js/config.js'))).EXESNOHS_CONFIG;

    const person = people.createPerson({ role: 'customer', shoulderRound: 0.35 });
    person.position.set(0, 0, 0);
    const arms = person.children.filter((c) => c.userData && c.userData.isArm);

    // CALIBRATED FROM THE FIGURE, exactly as roster.js does it at build time, so
    // this is testing the same numbers the game runs on rather than the
    // defaults written into arm.js.
    const one = arms[0];
    const hand0 = one.userData.forearm.children.find(
        (c) => c.isMesh && c.geometry.type === 'SphereGeometry'
            && c.geometry.parameters.radius < 0.045
    );
    arm.calibrate({
        shoulderX: Math.abs(one.position.x),
        shoulderY: one.position.y,
        upper: Math.abs(one.userData.forearm.position.y),
        lower: Math.abs(hand0.position.y),
        restZ: Math.abs(one.rotation.z),
    });

    const v = new THREE.Vector3();
    const part = (side) => {
        const a = arms.find((x) => x.userData.armSide === side);
        const f = a.userData.forearm;
        const h = f.children.find(
            (c) => c.isMesh && c.geometry.type === 'SphereGeometry'
                && c.geometry.parameters.radius < 0.045
        );
        return { a, f, h };
    };
    const set = (side, armX, armZ, foreX) => {
        const { a, f } = part(side);
        a.rotation.set(armX, 0, armZ);
        f.rotation.x = foreX;
        person.updateMatrixWorld(true);
    };
    poseHand = (side, armX, armZ, foreX) => {
        set(side, armX, armZ, foreX);
        part(side).h.getWorldPosition(v);
        return v.clone();
    };
    poseElbow = (side, armX, armZ, foreX) => {
        set(side, armX, armZ, foreX);
        part(side).f.getWorldPosition(v);
        return v.clone();
    };
});

/**
 * Is this point somewhere this rig's hand can physically get to?
 *
 * NOT SIMPLY "IS IT WITHIN ARM'S LENGTH". The shoulder has two axes and no
 * twist, so the reachable set is a surface of revolution rather than a ball:
 * the sideways component of a target can never exceed the upper arm's own
 * projection, which the elbow angle fixes. Written out, the elbow angle follows
 * from the distance and gives that projection as `(d² + U² - L²) / 2U`, so a
 * point straight out to the side at half an arm's length is inside the sphere
 * and genuinely impossible. Worth stating here because it is the exact class of
 * target the solver has to degrade gracefully on rather than reach.
 */
function within(target, side) {
    const ux = target.x - side * RIG.shoulderX;
    const d = Math.hypot(ux, target.y - RIG.shoulderY, target.z);
    if (d >= arm.reach() || d <= arm.fold() + 0.05) return false;
    const lateral = (d * d + RIG.upper * RIG.upper - RIG.lower * RIG.lower)
        / (2 * RIG.upper);
    return Math.abs(ux) <= lateral - 0.005;
}

describe('the solver puts the hand where it was asked', () => {
    /**
     * THE CLAIM, SWEPT. Every point in front of the figure that the arm could
     * physically reach, on both sides, checked against a real scene graph.
     * "In front" is the region that matters: the poses all reach forward, and a
     * ball being caught comes in from downfield.
     */
    test('every reachable target in front of him lands within a millimetre', () => {
        let worst = 0;
        let at = null;
        let n = 0;
        for (const side of [-1, 1]) {
            for (let x = -0.35; x <= 0.35; x += 0.05) {
                for (let y = 0.75; y <= 1.85; y += 0.05) {
                    for (let z = 0.05; z <= 0.5; z += 0.05) {
                        const t = { x, y, z };
                        if (!within(t, side)) continue;
                        const s = arm.solveArm(t, side);
                        const got = poseHand(side, s.armX, s.armZ, s.foreX);
                        const miss = Math.hypot(got.x - x, got.y - y, got.z - z);
                        n += 1;
                        if (miss > worst) { worst = miss; at = { side, ...t }; }
                    }
                }
            }
        }
        // THE SWEEP HAS TO HAVE SWEPT SOMETHING. A predicate that rejects
        // everything passes the line below against any solver at all, which is
        // the failure mode of every sampled test in this suite.
        expect(n).toBeGreaterThan(500);
        // Named in the failure, so a regression says WHERE rather than just
        // how far: a solver that breaks does so on one region at a time.
        expect({ worst: Number(worst.toFixed(5)), at })
            .toEqual({ worst: expect.any(Number), at });
        expect(worst).toBeLessThan(0.001);
    });

    /**
     * AND THE ONES IT CANNOT REACH DEGRADE HONESTLY, which matters because a
     * receiver stretching for a ball he will not get is a picture worth having.
     * The rule is that the arm must END UP POINTING AT IT: a solver that gave
     * up and returned the rest pose would leave a man standing with his arms by
     * his sides while a pass goes through his hands.
     */
    test('an unreachable ball still gets reached for', () => {
        const side = 1;
        const far = [
            { x: 0.30, y: 2.20, z: 0.30 },     // over his head
            { x: 0.20, y: 0.90, z: 1.10 },     // way out in front
            { x: 0.10, y: 0.30, z: 0.60 },     // down at his ankles
        ];
        for (const t of far) {
            const s = arm.solveArm(t, side);
            const hand = poseHand(side, s.armX, s.armZ, s.foreX);
            const shoulder = { x: side * RIG.shoulderX, y: RIG.shoulderY, z: 0 };
            const toBall = {
                x: t.x - shoulder.x, y: t.y - shoulder.y, z: t.z - shoulder.z,
            };
            const toHand = {
                x: hand.x - shoulder.x, y: hand.y - shoulder.y, z: hand.z - shoulder.z,
            };
            const dot = toBall.x * toHand.x + toBall.y * toHand.y + toBall.z * toHand.z;
            const cos = dot / (Math.hypot(toBall.x, toBall.y, toBall.z)
                * Math.hypot(toHand.x, toHand.y, toHand.z));
            // Within 25 degrees of straight at it.
            expect(cos).toBeGreaterThan(Math.cos(0.44));
            // ...and extended, rather than folded up against the chest.
            expect(Math.abs(s.foreX)).toBeLessThan(0.6);
        }
    });

    /**
     * NO SOLUTION EVER BENDS THE ELBOW BACKWARDS. This is the whole bug from
     * last round, stated as a property of the joint, and it is swept rather
     * than spot-checked because the sign was wrong in five different poses and
     * any one of them could have been the one somebody looked at.
     */
    test('the elbow only ever flexes', () => {
        for (const side of [-1, 1]) {
            for (let x = -0.5; x <= 0.5; x += 0.07) {
                for (let y = 0.6; y <= 2.0; y += 0.07) {
                    for (let z = -0.5; z <= 0.55; z += 0.07) {
                        const s = arm.solveArm({ x, y, z }, side);
                        expect(s.foreX).toBeLessThanOrEqual(0);
                        expect(s.foreX).toBeGreaterThan(-Math.PI);
                    }
                }
            }
        }
    });

    /**
     * AND THE ELBOW ENDS UP IN A PLACE A PERSON'S ELBOW COULD BE.
     *
     * There are always two answers, and they agree about the hand and disagree
     * completely about the elbow: one raises the arm forward past the ear, the
     * other rotates the whole limb half a turn about its own hanging axis to
     * arrive at the same point. The second is correct and unusable, because
     * these angles are blended frame to frame and sweeping `armZ` through three
     * radians to reach the same pose is a shoulder coming apart.
     */
    test('it does not roll the shoulder half a turn to reach a raised hand', () => {
        for (const side of [-1, 1]) {
            for (const t of [
                { x: 0.20, y: 1.75, z: 0.20 },
                { x: 0.05, y: 1.60, z: 0.35 },
                { x: 0.26, y: 1.20, z: 0.42 },
            ]) {
                const s = arm.solveArm({ x: side * t.x, y: t.y, z: t.z }, side);
                expect(Math.abs(s.armZ)).toBeLessThan(2.0);
            }
        }
    });

    /**
     * THE COCKED ARM IS THE ONE DELIBERATE EXCEPTION, and it is worth its own
     * case: a quarterback holding a ball out beside his ear cannot do it with
     * the arm hanging near his body, so the solver abducts the shoulder to a
     * right angle. The elbow lands out to the side at shoulder height, which is
     * the picture, and the test says so rather than restating the angle.
     */
    test('a cocked throwing arm puts the elbow out at shoulder height', () => {
        const s = arm.solveArm(CFG.pose.throwHold.hand, 1);
        const elbow = poseElbow(1, s.armX, s.armZ, s.foreX);
        expect(elbow.x).toBeGreaterThan(RIG.shoulderX + 0.15);   // out to the side
        expect(Math.abs(elbow.y - RIG.shoulderY)).toBeLessThan(0.12);
        expect(elbow.z).toBeLessThan(0.10);                      // not in front
    });
});

describe('a world point becomes a point in the figure', () => {
    /**
     * THE CATCH DEPENDS ENTIRELY ON THIS. The ball is in world metres and the
     * solver works in the rig's own space, before `figureScale` and before the
     * figure's yaw, and getting either backwards puts a receiver's hands out on
     * the far sideline. It looks exactly like an animation fault.
     */
    test('a point straight in front of him is straight in front of him', () => {
        for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI, 2.3]) {
            const at = { x: 4, y: 0, z: -7 };
            const ahead = {
                x: at.x + Math.sin(yaw) * 3,
                y: 2.2,
                z: at.z + Math.cos(yaw) * 3,
            };
            const local = arm.toRigSpace(ahead, at, yaw, 2.2);
            expect(local.x).toBeCloseTo(0, 6);
            expect(local.z).toBeCloseTo(3 / 2.2, 6);
            expect(local.y).toBeCloseTo(2.2 / 2.2, 6);
        }
    });

    test('and the figure\'s own lift is taken off the height', () => {
        const local = arm.toRigSpace(
            { x: 0, y: 3.3, z: 1 }, { x: 0, y: 1.1, z: 0 }, 0, 2.2
        );
        expect(local.y).toBeCloseTo(1, 6);
    });
});
