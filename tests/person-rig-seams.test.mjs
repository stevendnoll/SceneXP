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
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let createPerson;
let AM;    // www/automan's pose seams
let SVJ;   // www/sunnyvalejenn's pose seams
let JAM;   // www/jamar's pose seams

beforeAll(async () => {
    THREE = await loadRealThree();
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

    test('the hand is still findable from inside an arm, by its tag', () => {
        // www/jamar and www/seedtoseed give their leads big capable hands by
        // walking the built figure for the hand and scaling it where it
        // stands. They matched the rig's 0.04-radius ball until 2026-10-26,
        // when the hand became a palm with fingers and a thumb in one mesh;
        // now they match the tag, and this holds the rig to tagging it. The
        // sources are read too, so neither scene can slip back to matching
        // a ball that is no longer there.
        const person = createPerson({ role: 'customer' });
        const found = [];
        person.traverse((child) => {
            if (!child.isMesh || !child.userData.isHand) return;
            const owner = (child.parent && child.parent.userData) || {};
            if (owner.isArm || owner.isForearm) found.push(child);
        });
        expect(found).toHaveLength(2);
        expect(found).toEqual(expect.arrayContaining(armsOf(person).map(handOf)));
        for (const scene of ['jamar', 'seedtoseed']) {
            const source = readFileSync(join(root, `www/${scene}/js/store.js`), 'utf8');
            expect(source).toMatch(/child\.userData\.isHand/);
            expect(source).not.toMatch(/params\.radius === 0\.04/);
        }
    });

    test('the forearm narrows from the elbow to a wrist narrower than the palm (2026-10-26)', () => {
        // Steve's QA of the avatar: the forearm tapered the OTHER way (0.9 of
        // the arm's radius at the elbow, all of it at the wrist), so a
        // muscular wrist came out twice the hand's width. The wrist is
        // sized from the hand now, so it stays put whatever the arm does.
        const measure = (config) => {
            const fore = armsOf(createPerson(config))[0].userData.forearm;
            const cyl = fore.children.find((c) => c.isMesh && c.geometry.type === 'CylinderGeometry');
            const hand = handOf(fore.parent);
            hand.geometry.computeBoundingBox();
            const b = hand.geometry.boundingBox;
            return { elbow: cyl.geometry.parameters.radiusTop, wrist: cyl.geometry.parameters.radiusBottom, palm: b.max.x - b.min.x, hand: b.max.y - b.min.y };
        };
        const plain = measure({ role: 'customer' });
        expect(plain.elbow).toBeCloseTo(0.045, 9);
        expect(plain.wrist).toBeLessThan(plain.elbow * 0.7);
        expect(plain.wrist * 2).toBeLessThan(plain.palm);
        // A thicker arm keeps its wrist to the hand: never twice the palm.
        const buff = measure({ role: 'customer', muscular: true });
        expect(buff.elbow).toBeGreaterThan(plain.elbow * 1.5);
        expect(buff.wrist * 2).toBeLessThan(buff.palm * 1.1);
        // And a bigger hand brings a bigger wrist with it.
        const big = measure({ role: 'customer', handScale: 1.3 });
        expect(big.palm).toBeCloseTo(plain.palm * 1.3, 6);
        expect(big.wrist).toBeGreaterThan(plain.wrist);
        // The hand is longer than it is wide (its width taking in the
        // thumb), as a hand with fingers is.
        expect(plain.hand).toBeGreaterThan(plain.palm * 1.2);
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

/**
 * THE LEGS, WHICH www/xo SWINGS AND NOBODY HAD EVER ASKED THE RIG FOR.
 *
 * The hip pivot was always here: `createPerson` hangs each leg off its own
 * group with the thigh, knee, shin and shoe as children at negative y, exactly
 * the way it hangs an arm off a shoulder. What it did not have was a TAG, so
 * roster.js's own note said the legs were "bare meshes with no pivot" and the
 * game ran for six weeks with the arm swing carrying the whole stride. QA:
 * "it kind of looks like the players are just floating down the field."
 *
 * The tag is what makes the lookup safe. A scene that went hunting for these
 * groups BY POSITION would be doing precisely the thing the top of this file
 * exists to warn about, and would find nothing the day the rig re-bases a hip.
 */
describe('the legs swing from the hip', () => {
    const legsOf = (person) => person.children.filter((c) => c.isGroup && c.userData.isLeg);

    /** The shoe inside a leg: the part furthest DOWN it, found by walking the
     *  drawn figure rather than by name. */
    const shoeOf = (leg) => {
        let low = null;
        for (const c of leg.children) if (!low || c.position.y < low.position.y) low = c;
        return low;
    };

    test('there are two of them, tagged, one a side', () => {
        const legs = legsOf(createPerson({}));
        expect(legs.length).toBe(2);
        expect(legs.map((l) => l.userData.legSide).sort()).toEqual([-1, 1]);
    });

    /** A PIVOT WITH NOTHING UNDER IT IS THE FAILURE THIS FILE IS ABOUT, and an
     *  empty group rotates perfectly happily. The leg has to be IN it. */
    test('the whole leg hangs off the pivot, not beside it', () => {
        for (const leg of legsOf(createPerson({}))) {
            expect(leg.children.length).toBeGreaterThanOrEqual(3);
            // Everything under it hangs DOWN from the hip.
            for (const part of leg.children) expect(part.position.y).toBeLessThan(0);
        }
    });

    test('and rotating it actually moves the foot', () => {
        const person = createPerson({});
        const leg = legsOf(person)[0];
        const shoe = shoeOf(leg);
        person.updateMatrixWorld(true);
        const rest = worldOf(shoe);
        leg.rotation.x = -0.5;                  // a stride forward
        person.updateMatrixWorld(true);
        const swung = worldOf(shoe);
        // It travelled, and it travelled FORWARD: the rig faces +z.
        expect(swung.distanceTo(rest)).toBeGreaterThan(0.2);
        expect(swung.z).toBeGreaterThan(rest.z);
        // ...and a swing lifts the foot rather than driving it through the
        // grass, which is what lets a knee-less leg stride at all.
        expect(swung.y).toBeGreaterThan(rest.y);
    });

    /** The hip is where a hip is: at the top of the legs, under the torso. */
    test('the pivot is at hip height', () => {
        const person = createPerson({});
        for (const leg of legsOf(person)) {
            expect(leg.position.y).toBeGreaterThan(0.5);
            expect(leg.position.y).toBeLessThan(1.0);
        }
    });
});

// ---- A woman's build (`hips`, Whitestone's Maya, 2026-10-14) -------------

describe('the rig\'s hips: off by default, a woman\'s build from the legs when asked', () => {
    const legsOf = (person) => person.children.filter((c) => c.isGroup && c.userData.isLeg);
    /** A leg's thigh and shin: the cylinders centered a quarter and three
     *  quarters of the way down it. */
    const meshAt = (leg, y) => leg.children.find((c) => c.geometry && c.geometry.type === 'CylinderGeometry' && Math.abs(c.position.y - y) < 1e-6);
    const pieces = (leg) => ({ thigh: meshAt(leg, -0.1875).geometry.parameters, shin: meshAt(leg, -0.5625).geometry.parameters });
    const torsoOf = (person) => person.children.find((c) => c.isMesh && c.geometry.type === 'BoxGeometry' && Math.abs(c.position.y - 1.025) < 1e-6);
    const boxOf = (obj, person) => {
        person.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(obj);
    };

    test('every figure built before the option is unchanged: the legs where they were, as they were', () => {
        const person = createPerson({ role: 'customer' });
        const legs = legsOf(person);
        expect(legs.map((l) => Math.abs(l.position.x))).toEqual([0.095, 0.095]);
        const { thigh, shin } = pieces(legs[0]);
        expect(thigh.radiusTop).toBeCloseTo(0.065, 9);
        expect(thigh.radiusBottom).toBeCloseTo(0.0715, 9);
        expect(thigh.radialSegments).toBe(8);
        expect(shin.radiusBottom).toBeCloseTo(0.0585, 9);
    });

    test('hips: the thighs make them, full at the hip and meeting, tapering to the knee, a slimmer ankle, and nothing added', () => {
        const plain = createPerson({ role: 'customer' });
        const person = createPerson({ role: 'customer', hips: 1 });
        // Nothing beside the legs to bulge (QA, 2026-10-14: a separate
        // pelvis stuck out at the sides and read as a stomach in front).
        expect(person.children).toHaveLength(plain.children.length);
        const [left, right] = legsOf(person).sort((a, b) => a.position.x - b.position.x);
        const thighBox = (leg) => boxOf(meshAt(leg, -0.1875), person);
        const torso = boxOf(torsoOf(person), person);
        // The hip line runs just past the shirt's sides, a centimeter or so.
        expect(thighBox(right).max.x).toBeGreaterThan(torso.max.x);
        expect(thighBox(right).max.x).toBeLessThan(torso.max.x + 0.03);
        expect(thighBox(left).min.x).toBeLessThan(torso.min.x);
        // The thighs meet in the middle.
        expect(thighBox(right).min.x - thighBox(left).max.x).toBeLessThan(0.01);
        // Front to back, inside the shirt: never a belly.
        expect(thighBox(right).max.z).toBeLessThan(torso.max.z);
        const { thigh, shin } = pieces(right);
        const was = pieces(legsOf(plain)[0]);
        expect(thigh.radiusTop).toBeGreaterThan(was.thigh.radiusTop * 1.5);
        expect(thigh.radiusBottom).toBeLessThan(thigh.radiusTop * 0.75);
        expect(shin.radiusBottom).toBeLessThan(was.shin.radiusBottom);
        // The legs still swing from the hip, tagged as before.
        expect(legsOf(person).map((l) => l.position.y)).toEqual([0.75, 0.75]);
    });

    test('the builds\' shape numbers (2026-10-26): shoulders and seat widen or narrow the torso\'s ends, a waist below 0 bows it out, girth deepens it, legs thicken them, and each at 1 is the figure as it was', () => {
        const base = { role: 'customer', shoulderRound: 0.35 };
        /** The torso's width across a band of its height (its own
         *  middle), from its outline. */
        const widthAt = (person, y0, y1) => {
            const torso = torsoOf(person) || person.children.find((c) => c.isMesh && c.geometry.type === 'ExtrudeGeometry' && Math.abs(c.position.y - 1.025) < 1e-6);
            const { width } = (() => {
                torso.geometry.computeBoundingBox();
                const b = torso.geometry.boundingBox;
                return { width: b.max.x - b.min.x, depth: b.max.z - b.min.z };
            })();
            const pos = torso.geometry.attributes.position;
            let half = 0;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y < y0 || y > y1) continue;
                half = Math.max(half, Math.abs(pos.getX(i)));
            }
            // A straight side has no vertex between its corners: full width.
            return { width: half > 0 ? 2 * half : width, full: width, depth: boxOf(torso, person).max.z - boxOf(torso, person).min.z };
        };
        const plain = createPerson(base);
        // Bands down the side, clear of the shoulders' rounding at the top
        // and the corners at the bottom.
        const top = (p) => widthAt(p, 0.1, 0.16).width;
        const bottom = (p) => widthAt(p, -0.22, -0.16).width;
        const middle = (p) => widthAt(p, -0.06, -0.01).width;
        expect(top(plain)).toBeCloseTo(bottom(plain), 3);
        // Lean shoulders over a wider seat: a pear. The arms hang from the
        // shoulders and the legs and the belt sit on the seat.
        const pear = createPerson({ ...base, shoulders: 0.86, seat: 1.08 });
        // (The side is still coming in at the band; at the shoulders it is
        // 0.86 of the width.)
        expect(top(pear)).toBeLessThan(top(plain) - 0.02);
        expect(bottom(pear)).toBeGreaterThan(bottom(plain) + 0.02);
        const armX = (p) => Math.abs(armsOf(p)[0].position.x);
        const legX = (p) => Math.abs(legsOf(p)[0].position.x);
        expect(armX(pear)).toBeLessThan(armX(plain));
        expect(legX(pear)).toBeGreaterThan(legX(plain));
        // Broad: the other way about.
        const broad = createPerson({ ...base, shoulders: 1.15, seat: 0.94 });
        expect(top(broad)).toBeGreaterThan(top(plain) * 1.1);
        expect(bottom(broad)).toBeLessThan(bottom(plain));
        expect(armX(broad)).toBeGreaterThan(armX(plain));
        // A waist below 0 bows the middle OUT past both ends.
        const round = createPerson({ ...base, waist: -0.12, girth: 1.3 });
        expect(middle(round)).toBeGreaterThan(top(round) + 0.02);
        expect(middle(round)).toBeGreaterThan(bottom(round) + 0.02);
        expect(middle(plain)).toBeLessThanOrEqual(top(plain) + 1e-6);
        expect(widthAt(round, 0, 0).depth).toBeCloseTo(widthAt(plain, 0, 0).depth * 1.3, 3);
        // Thicker legs, over the muscles' own.
        const thick = createPerson({ ...base, legs: 1.25 });
        expect(pieces(legsOf(thick)[0]).thigh.radiusTop).toBeCloseTo(0.065 * 1.25, 9);
        expect(pieces(legsOf(createPerson({ ...base, legs: 1.25, muscular: true }))[0]).thigh.radiusTop).toBeCloseTo(0.065 * 1.35 * 1.25, 9);
        // At 1, 1, 0 and 1 nothing differs, vertex for vertex.
        const same = createPerson({ ...base, shoulders: 1, seat: 1, waist: 0, girth: 1, legs: 1 });
        const rounded = (p) => p.children.find((c) => c.isMesh && c.geometry.type === 'ExtrudeGeometry' && Math.abs(c.position.y - 1.025) < 1e-6);
        const posOf = (p) => Array.from(rounded(p).geometry.attributes.position.array);
        expect(posOf(same)).toEqual(posOf(plain));
    });

    test('more than 1 is 1, and less than 0 is none', () => {
        const one = createPerson({ role: 'customer', hips: 1 });
        const many = createPerson({ role: 'customer', hips: 5 });
        const none = createPerson({ role: 'customer', hips: -2 });
        expect(legsOf(many)[0].position.x).toBe(legsOf(one)[0].position.x);
        expect(pieces(legsOf(many)[0]).thigh.radiusTop).toBe(pieces(legsOf(one)[0]).thigh.radiusTop);
        expect(pieces(legsOf(none)[0]).thigh.radiusTop).toBeCloseTo(0.065, 9);
    });
});
