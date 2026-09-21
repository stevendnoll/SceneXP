// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * person-rig-seams.test.mjs - the seams experiences reach through into the
 * shared person rig, checked on the DRAWN figure.
 *
 * Six experiences take the rig apart after `createPerson` returns it: to bend
 * an elbow, to sit a figure down, to enlarge a hand. Every one of those is a
 * lookup into a scene graph the rig owns and may reorganize, and a lookup that
 * stops matching FINDS NOTHING rather than throwing. This file is where those
 * lookups are held to their side of the bargain.
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB, and that is the whole
 * point of the file. The stub is a Proxy that answers every property with
 * another chainable, so `arm.userData.forearm` and `arm.children.filter(...)`
 * both come back truthy whether or not there is anything behind them. The bug
 * this guards against is exactly a lookup that starts coming back EMPTY, which
 * is the one shape a Proxy cannot fail on.
 *
 * WHAT WENT WRONG. www/automan and www/sunnyvalejenn each bent the shared
 * rig's arm themselves, by moving every part below y -0.28 into a new pivot
 * at y -0.275. Then the shared rig grew its own forearm group at that same
 * joint (people-1.0.0.js), with its children re-based by that same amount, so
 * the surgery found nothing left to move and handed back an EMPTY group. No
 * error, no failing test, no console warning: just three people at a desk in
 * one scene and one in the other, all with two ramrod-straight arms. Their
 * hands hung 15 to 25cm BELOW the desk they were supposed to be working on,
 * John's tap on the deal sheet and the dealer's typing bob drove a group with
 * no geometry under it, and Jenn's wave rose to shoulder height and pointed
 * out of the screen instead of bending up to wave.
 *
 * The same rig change quietly cost www/jamar and www/seedtoseed their big
 * capable hands, which are found by geometry and scaled in place, and which
 * are pinned here too.
 *
 * Every number asserted below was measured on the fixed chain, and every one
 * of them was on the wrong side of its surface before the fix. Nothing here
 * restates an angle: the poses, the layouts and the joint helpers are all
 * imported from the scenes themselves, so a re-solve moves the measurements
 * with it and only a BROKEN SEAM fails.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let createPerson;
let AM;    // www/automan's pose seams
let SVJ;   // www/sunnyvalejenn's pose seams
let JAM;   // www/jamar's pose seams

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;

    // Enough browser for the stores to import: they draw a few textures on a
    // canvas at build time and read prefers-reduced-motion at module scope.
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive || p === 'valueOf' ? () => 0
            : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = {
        createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }),
    };
    globalThis.window = {
        innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    };
    globalThis.navigator = { maxTouchPoints: 0 };

    ({ createPerson } = await import(join(root, 'www/shared/js/people-1.0.0.js')));
    AM = (await import(join(root, 'www/automan/js/store.js'))).__test__;
    SVJ = (await import(join(root, 'www/sunnyvalejenn/js/store.js'))).__test__;
    JAM = (await import(join(root, 'www/jamar/js/store.js'))).__test__;
});

// ---- Reading the drawn figure -------------------------------------------

/** The tagged arm groups hanging off `parent` (the person, or its waist). */
const armsOf = (parent) => parent.children.filter((c) => c.isGroup && c.userData.isArm);

/** The hand inside an arm: the mesh furthest out along the forearm group.
 *  Found by walking the DRAWN figure, so it is whatever the rig actually
 *  built rather than whatever anyone believes it built. */
function handOf(arm) {
    let fore = null;
    arm.traverse((n) => { if (n.userData && n.userData.isForearm) fore = n; });
    if (!fore) return null;
    let far = null;
    for (const c of fore.children) {
        if (!far || c.position.length() > far.position.length()) far = c;
    }
    return far;
}

const worldOf = (obj) => obj.getWorldPosition(new THREE.Vector3());

/** Every hand's world position, after a fresh matrix pass. */
function handsOf(figure, arms) {
    figure.updateMatrixWorld(true);
    return arms.map((e) => Object.assign({ side: e.side }, worldOf(handOf(e.arm))));
}

// ---- The shared rig's half of the contract ------------------------------

describe('the shared rig hands out a real elbow', () => {
    test('each arm carries a forearm group with the hand under it', () => {
        const person = createPerson({ role: 'customer' });
        const arms = armsOf(person);
        expect(arms).toHaveLength(2);
        for (const arm of arms) {
            const fore = arm.userData.forearm;
            expect(fore).toBeTruthy();
            expect(fore.isGroup).toBe(true);
            expect(fore.userData.isForearm).toBe(true);
            // At the elbow: half of the rig's 0.55 arm, below the shoulder.
            expect(fore.position.y).toBeCloseTo(-0.275, 6);
            // And it is not an empty shell. The elbow ball, the forearm and
            // the hand all hang from it, the hand furthest out.
            expect(fore.children.length).toBeGreaterThanOrEqual(3);
            expect(handOf(arm)).toBeTruthy();
            expect(fore.children).toContain(handOf(arm));
        }
    });

    test('bending the forearm group moves the hand', () => {
        // THE FAILURE THIS CATCHES is a pivot with nothing under it, which
        // swallows every angle written to it and never complains. A quarter
        // turn at the elbow has to travel a hand's width at least.
        const person = createPerson({ role: 'customer' });
        const arm = armsOf(person)[0];
        person.updateMatrixWorld(true);
        const before = worldOf(handOf(arm));
        arm.userData.forearm.rotation.x = -Math.PI / 2;
        person.updateMatrixWorld(true);
        expect(worldOf(handOf(arm)).distanceTo(before)).toBeGreaterThan(0.2);
    });

    test('the hand is still findable by geometry, from inside an arm', () => {
        // www/jamar and www/seedtoseed give their leads big capable hands by
        // walking the built figure for the rig's own 0.04-radius sphere and
        // scaling it where it stands. The parent tag is what tells that
        // sphere apart from every other small ball on a person, and when the
        // hand moved down into the forearm group the test for it went quiet:
        // two scenes lost the detail with nothing to show for it.
        const person = createPerson({ role: 'customer' });
        const found = [];
        person.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            const params = child.geometry.parameters || {};
            if (child.geometry.type !== 'SphereGeometry' || params.radius !== 0.04) return;
            const owner = (child.parent && child.parent.userData) || {};
            if (owner.isArm || owner.isForearm) found.push(child);
        });
        expect(found).toHaveLength(2);
        expect(found).toEqual(expect.arrayContaining(armsOf(person).map(handOf)));
    });
});

// ---- www/automan: three people at a sales desk --------------------------

/** Build and rig one of the showroom's seated figures the way seatFigure
 *  does: sit, place, aim, then waist, neck and elbows. */
function seatAutomanFigure(look, scale, seat, target, poseOpts) {
    const person = createPerson(Object.assign({ x: 0, z: 0, rotationY: 0 }, look));
    if (typeof scale === 'number') person.scale.setScalar(scale);
    else person.scale.set(scale.x, scale.y, scale.z);

    AM.poseSeated(person, poseOpts);
    person.position.set(seat.x, AM.seatHeightY(AM.LAYOUT.chairSeatTop, person.scale.y), seat.z);
    person.rotation.y = AM.faceToward(seat, target);

    const hair = AM.findHairGroup(person);
    const waist = AM.addWaist(person);
    const neck = AM.addNeck(waist, hair);
    const arms = armsOf(waist).map((arm) => ({
        arm, elbow: AM.addElbow(arm), side: arm.position.x < 0 ? -1 : 1,
    }));
    return { person, waist, neck, arms };
}

describe('www/automan: the hands are on the desk, not through it', () => {
    test("John's pointing hand lands on the deal sheet", () => {
        const john = seatAutomanFigure({
            role: 'customer', bald: true, dressShirt: true,
            shirtColor: AM.JOHN_LOOK.shirtColor, pantsColor: AM.JOHN_LOOK.pantsColor,
            skinTone: AM.JOHN_LOOK.skinTone, eyeColor: AM.JOHN_LOOK.eyeColor,
            handScale: AM.JOHN_LOOK.handScale, shoulderRound: AM.SHOULDER_ROUND,
        }, AM.JOHN_SCALE, AM.LAYOUT.john, AM.LAYOUT.dealer, { splay: AM.LEG_SPLAY });
        john.waist.rotation.x = AM.JOHN_LEAN;
        john.neck.rotation.x = AM.JOHN_NECK_X;
        john.arms.forEach((e) => {
            const pose = e.side < 0 ? AM.JOHN_POINT_ARM : AM.JOHN_REST_ARM;
            e.arm.rotation.x = pose.shoulder;
            e.arm.rotation.z = pose.rotZ;
            e.elbow.rotation.x = pose.elbow;
        });

        const hands = handsOf(john.person, john.arms);
        const point = hands.find((h) => h.side < 0);
        const rest = hands.find((h) => h.side > 0);
        const deskTop = AM.LAYOUT.desk.topY;

        // ON the desk: above the top, and close enough to it to read as a
        // touch rather than a hover. (Measured: 0.769 against a 0.75 top.)
        expect(point.y).toBeGreaterThan(deskTop);
        expect(point.y - deskTop).toBeLessThan(0.06);
        // And ON the page, which is 30 by 41cm around its own centre.
        const S = AM.LAYOUT.dealSheet;
        expect(Math.hypot(point.x - S.x, point.z - S.z)).toBeLessThan(0.20);
        // His other hand rests on his thigh, well under the desk on purpose.
        expect(rest.y).toBeLessThan(deskTop - 0.1);
    });

    test('the tap has somewhere to travel, and only ever lifts', () => {
        // The pointing pose was solved to put the fingertip ON the paper, so
        // a tap that could go the other way would drive it through the desk.
        // It is written as a lift off the solved bend, which only works if
        // the elbow carries geometry: on an empty pivot the burst ran for a
        // fortnight and moved nothing at all.
        const john = seatAutomanFigure({
            role: 'customer', bald: true, dressShirt: true,
            handScale: AM.JOHN_LOOK.handScale, shoulderRound: AM.SHOULDER_ROUND,
        }, AM.JOHN_SCALE, AM.LAYOUT.john, AM.LAYOUT.dealer, { splay: AM.LEG_SPLAY });
        john.waist.rotation.x = AM.JOHN_LEAN;
        const point = john.arms.find((e) => e.side < 0);
        point.arm.rotation.x = AM.JOHN_POINT_ARM.shoulder;
        point.arm.rotation.z = AM.JOHN_POINT_ARM.rotZ;

        point.elbow.rotation.x = AM.JOHN_POINT_ARM.elbow;
        john.person.updateMatrixWorld(true);
        const down = worldOf(handOf(point.arm));

        point.elbow.rotation.x = AM.JOHN_POINT_ARM.elbow - AM.TAP_LIFT;
        john.person.updateMatrixWorld(true);
        const up = worldOf(handOf(point.arm));

        expect(up.y).toBeGreaterThan(down.y);
        expect(up.y - down.y).toBeGreaterThan(0.01);   // visible at this camera
    });

    test("the dealer's hands rest on his keys, and the typing bob lifts them", () => {
        const dealer = seatAutomanFigure({
            role: 'shopkeeper', hasSuit: true,
            handScale: AM.HAND_SCALE, shoulderRound: AM.SHOULDER_ROUND,
        }, 1, AM.LAYOUT.dealer, {
            x: (AM.LAYOUT.john.x + AM.LAYOUT.customer.x) / 2,
            z: (AM.LAYOUT.john.z + AM.LAYOUT.customer.z) / 2,
        });
        dealer.person.rotation.y = AM.dealerYaw();
        dealer.waist.rotation.x = AM.DEALER_LEAN;
        dealer.arms.forEach((e) => {
            e.arm.rotation.x = AM.DEALER_TYPE_ARM.shoulder;
            e.arm.rotation.z = -e.side * AM.DEALER_TYPE_ARM.roll;
            e.elbow.rotation.x = AM.DEALER_TYPE_ARM.elbow;
        });

        const keys = AM.keyTopY();
        const board = AM.keyboardAt();
        for (const hand of handsOf(dealer.person, dealer.arms)) {
            // The hand's centre sits its own radius above the key tops, so
            // its underside rests ON them. (Measured: 0.801 over 0.772.)
            expect(hand.y).toBeGreaterThan(keys);
            expect(hand.y - keys).toBeLessThan(0.06);
            // Over the board's 40cm width, one hand either side of centre.
            expect(Math.hypot(hand.x - board.x, hand.z - board.z)).toBeLessThan(0.20);
        }

        // THE RESTING POSE IS THE LOWEST THE HANDS EVER GET: the bob folds
        // the forearm further, which lifts.
        const one = dealer.arms[0];
        const rest = handsOf(dealer.person, [one])[0].y;
        one.elbow.rotation.x = AM.DEALER_TYPE_ARM.elbow - AM.DEALER_TYPE_BOB;
        expect(handsOf(dealer.person, [one])[0].y).toBeGreaterThan(rest);
    });
});

// ---- www/sunnyvalejenn: one person, typing and waving -------------------

/** Jenn, seated and rigged the way createJenn does it. */
function seatJenn() {
    const jenn = createPerson({
        role: 'customer', x: 0, z: 0, rotationY: 0, hairStyle: 'long',
    });
    jenn.scale.set(0.97, 1, 0.97);
    SVJ.poseSeated(jenn);
    jenn.position.set(
        SVJ.LAYOUT.jenn.x, SVJ.seatHeightY(SVJ.LAYOUT.chairSeatTop, 1), SVJ.LAYOUT.jenn.z
    );
    jenn.rotation.y = SVJ.LAYOUT.jenn.yaw;
    const arms = armsOf(jenn).map((arm) => ({
        arm, elbow: SVJ.addElbow(arm), side: arm.position.x < 0 ? -1 : 1,
    }));
    return { person: jenn, arms };
}

function poseJenn(arms, pose, only) {
    arms.forEach((e) => {
        if (only && e.side !== only) return;
        e.arm.rotation.x = pose.shoulder;
        e.arm.rotation.z = (only ? 1 : -e.side) * pose.rz;
        e.elbow.rotation.x = pose.elbow;
    });
}

describe('www/sunnyvalejenn: Jenn types, and her wave is a wave', () => {
    test('her typing hands hover over the desk, not under it', () => {
        const jenn = seatJenn();
        poseJenn(jenn.arms, SVJ.JENN_TYPE_POSE);
        const deskTop = SVJ.LAYOUT.desk.topY;
        const D = SVJ.LAYOUT.desk;
        for (const hand of handsOf(jenn.person, jenn.arms)) {
            // Measured: 0.783 over a 0.74 top. Before the fix: 0.534.
            expect(hand.y).toBeGreaterThan(deskTop);
            expect(hand.y - deskTop).toBeLessThan(0.08);
            // And over the desk's own footprint, not short of its near edge.
            expect(Math.abs(hand.x - D.x)).toBeLessThan(D.w / 2);
            expect(Math.abs(hand.z - D.z)).toBeLessThan(D.d / 2);
        }
    });

    test('the typing bob only ever lifts a hand off the keys', () => {
        // The pose rests her hands about a centimeter over the keys, so a
        // bob that could go DOWN would run her fingers through them. It is
        // rectified for that reason, and this pins the direction: folding
        // the forearm further has to lift. (It used to be a full sine,
        // which dipped 14mm below the rest pose on every other half cycle.)
        const jenn = seatJenn();
        poseJenn(jenn.arms, SVJ.JENN_TYPE_POSE);
        const one = [jenn.arms[0]];
        const rest = handsOf(jenn.person, one)[0].y;
        one[0].elbow.rotation.x = SVJ.JENN_TYPE_POSE.elbow - 0.05;
        expect(handsOf(jenn.person, one)[0].y).toBeGreaterThan(rest);
        // And the source runs the bob in that direction, not the other one.
        const source = readFileSync(join(root, 'www/sunnyvalejenn/js/store.js'), 'utf8');
        expect(source).toMatch(/JENN_TYPE_POSE\.elbow - bob/);
        expect(source).toMatch(/Math\.max\(0, Math\.sin\(_t \* 7 \+ phase\)\)/);
    });

    test('the wave lifts her hand ABOVE her shoulder, not out in front', () => {
        // THE REPORTED FAULT, in one number. With a dead elbow the whole
        // straight arm swung up to the horizontal and stopped: the hand
        // finished 11mm BELOW the shoulder and 30cm out in front, which is a
        // point, not a wave. A folded forearm puts it overhead instead.
        const jenn = seatJenn();
        poseJenn(jenn.arms, SVJ.JENN_WAVE_POSE, 1);
        const right = jenn.arms.find((e) => e.side > 0);

        jenn.person.updateMatrixWorld(true);
        const shoulderY = worldOf(right.arm).y;
        const elbowY = worldOf(right.elbow).y;
        const hand = worldOf(handOf(right.arm));
        // Measured: 1.211 against a shoulder at 1.020. Before: 1.009.
        expect(hand.y - shoulderY).toBeGreaterThan(0.12);
        // The forearm is FOLDED UP, which is the half a dead elbow cannot
        // do: the upper arm alone can only carry the hand to the height it
        // swings the elbow to.
        expect(hand.y).toBeGreaterThan(elbowY + 0.12);
    });

    test('the wave swings from side to side at the elbow', () => {
        // updateOffice swings elbow.rotation.z through ±0.35 under an
        // envelope. On an empty pivot that swing moved nothing, which is
        // what "her arm doesn't wave" looked like.
        const jenn = seatJenn();
        poseJenn(jenn.arms, SVJ.JENN_WAVE_POSE, 1);
        const right = jenn.arms.find((e) => e.side > 0);
        const at = (z) => {
            right.elbow.rotation.z = z;
            jenn.person.updateMatrixWorld(true);
            return worldOf(handOf(right.arm));
        };
        // Measured span: 0.196m, about two hand widths across.
        expect(at(-0.35).distanceTo(at(0.35))).toBeGreaterThan(0.1);
    });
});

// ---- www/jamar: a man holding a microphone ------------------------------

describe('www/jamar: the microphone is in his hand', () => {
    /** Jamar's mic arm, posed the way createJamar poses it. */
    function micArmOf() {
        const jamar = createPerson({ role: 'customer', dressShirt: true });
        const arm = armsOf(jamar).find((g) => g.position.x > 0);
        const mic = JAM.poseMicArm(arm);
        jamar.updateMatrixWorld(true);
        return { jamar, arm, mic };
    }

    test('his hand comes up with the mic, and grips it', () => {
        // THE REPORTED FAULT. The mic was always parented to the elbow
        // pivot, so it folded up to his mouth whatever happened. What went
        // missing was the FOREARM: it stayed hanging down the upper arm,
        // leaving the hand 0.63m from a microphone floating at his face.
        const { arm, mic } = micArmOf();
        const hand = worldOf(handOf(arm));
        const head = worldOf(mic.getObjectByName('micHead'));
        // Measured: 0.100m, which is the mic's own half length. Before the
        // fix: 0.627m, and his hand was down at y 0.84 by his hip.
        expect(hand.distanceTo(head)).toBeLessThan(0.16);
        // The hand is up at his face, not down at his side.
        expect(hand.y).toBeGreaterThan(1.2);
    });

    test('the mic still sits at his mouth', () => {
        // The half that never broke, pinned so a re-solve of the arm cannot
        // quietly take the mic away from his face to get the grip right.
        const { jamar, mic } = micArmOf();
        let nose = null;
        jamar.traverse((n) => { if (n.isMesh && n.geometry.type === 'ConeGeometry') nose = n; });
        const head = worldOf(mic.getObjectByName('micHead'));
        expect(head.distanceTo(worldOf(nose))).toBeLessThan(0.2);   // measured 0.117
    });

    test('a pint glass lands in the hand it was given to', () => {
        // The booth's glasses parent to the ARM at a fixed offset rather
        // than to the hand, which only stays right while those arms have no
        // elbow bend. Pinned so the offset and the rig cannot drift apart.
        const drinker = createPerson({ role: 'customer' });
        const { arm, glass } = JAM.giveGlass(drinker, 1);
        expect(arm).toBeTruthy();
        arm.rotation.x = -1.2;   // the booth's resting hold
        drinker.updateMatrixWorld(true);
        expect(worldOf(glass).distanceTo(worldOf(handOf(arm)))).toBeLessThan(0.08);
    });
});
