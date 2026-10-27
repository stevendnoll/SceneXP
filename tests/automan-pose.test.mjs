// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The hands at the dealership desk, measured on the real rig: John's
 * fingertip on the deal sheet and the dealer's hands on his keys.
 *
 * STEVE, 2026-10-26: "John's hands seem to be going through the papers."
 * The shared rig's hand grew fingers that day (people-1.0.0 HAND) and the
 * tips hang 10cm below the hand's middle where the old ball reached 6cm, so
 * a pose solved for the ball put the fingertip 27mm through the page. The
 * poses were re-solved; this holds the lowest point of each hand a hair
 * over the surface it touches, so the next change to the rig's hand is
 * caught here rather than in a screenshot.
 *
 * The seating is store.js's (a waist pivot at the hip, the lean on it, the
 * arm angles on the rig's own arm and forearm groups), repeated here from
 * its exported numbers, since the store builds a whole showroom around it.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { installDom } from './helpers/dom-stub.mjs';

let THREE;
let S;
let createPerson;
let dom;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    dom = installDom();
    ({ createPerson } = await import('../www/shared/js/people-1.0.0.js'));
    S = await import('../www/automan/js/store.js');
});
afterAll(() => {
    if (dom) dom.uninstall();
    delete globalThis.THREE;
});

const HIP_Y = 0.75;
const faceToward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const seatHeightY = (seatTop, sy) => seatTop + 0.05 - 0.75 * sy;

/** A seated figure's upper body on a waist pivot, as store.js seats one. */
function seated({ scale, seat, yaw, lean }) {
    const person = createPerson({ role: 'customer', handScale: S.HAND_SCALE, shoulderRound: S.SHOULDER_ROUND });
    person.scale.setScalar(scale);
    person.position.set(seat.x, seatHeightY(S.LAYOUT.chairSeatTop, person.scale.y), seat.z);
    person.rotation.y = yaw;
    const pivot = new THREE.Group();
    pivot.position.set(0, HIP_Y, 0);
    const isLeg = (c) => c.isGroup && !c.userData.isArm && Math.abs(c.position.y - HIP_Y) < 0.02;
    for (const child of person.children.filter((c) => !isLeg(c))) {
        person.remove(child);
        child.position.y -= HIP_Y;
        pivot.add(child);
    }
    person.add(pivot);
    pivot.rotation.x = lean;
    const arms = {};
    pivot.children.filter((c) => c.isGroup && c.userData.isArm).forEach((arm) => {
        const side = arm.position.x < 0 ? -1 : 1;
        let hand = null;
        arm.userData.forearm.traverse((o) => { if (o.userData && o.userData.isHand) hand = o; });
        arms[side] = { arm, elbow: arm.userData.forearm, hand };
    });
    return { person, arms };
}

/** The lowest vertex of `mesh` in world meters. */
function lowest(root, mesh) {
    root.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    let best = null;
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (!best || v.y < best.y) best = v.clone();
    }
    return best;
}

function pose(entry, p, side) {
    entry.arm.rotation.x = p.shoulder;
    entry.arm.rotation.z = p.rotZ !== undefined ? p.rotZ : -side * p.roll;
    entry.elbow.rotation.x = p.elbow;
}

test("John's fingertip rests on the deal sheet, a hair over the page and squarely on it", () => {
    const L = S.LAYOUT;
    const john = seated({ scale: S.JOHN_SCALE, seat: L.john, yaw: faceToward(L.john, L.dealer), lean: S.JOHN_LEAN });
    pose(john.arms[-1], S.JOHN_POINT_ARM, -1);
    const low = lowest(john.person, john.arms[-1].hand);
    // The sheet's group sits 3mm over the desk, the page plane 2mm over that.
    const sheetTop = L.desk.topY + 0.003 + 0.002;
    expect(low.y - sheetTop).toBeGreaterThan(0);
    expect(low.y - sheetTop).toBeLessThan(0.008);
    // Over the page: inside its 0.30 by 0.41, turned -0.22, with a margin.
    const dx = low.x - L.dealSheet.x;
    const dz = low.z - L.dealSheet.z;
    const c = Math.cos(-0.22);
    const s = Math.sin(-0.22);
    expect(Math.abs(dx * c - dz * s)).toBeLessThan(0.12);
    expect(Math.abs(dx * s + dz * c)).toBeLessThan(0.17);
});

test("the customer's smaller hands rest on her thighs, a hair over them, her elbows outside her torso (Steve, 2026-10-26)", () => {
    const L = S.LAYOUT;
    expect(S.CUSTOMER_HAND_SCALE).toBeLessThan(S.HAND_SCALE);
    const person = createPerson({ role: 'customer', hairStyle: 'long', handScale: S.CUSTOMER_HAND_SCALE, shoulderRound: S.SHOULDER_ROUND });
    person.scale.set(S.CUSTOMER_SCALE.x, S.CUSTOMER_SCALE.y, S.CUSTOMER_SCALE.z);
    person.position.set(L.customer.x, seatHeightY(L.chairSeatTop, person.scale.y), L.customer.z);
    person.rotation.y = faceToward(L.customer, L.dealer);
    // Seated as store.js seats her: the knee hinged, the thigh swung
    // forward, the knees splayed (poseSeated), then the waist pivot.
    const thighs = {};
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm || Math.abs(group.position.y - 0.75) > 0.02) return;
        const lower = new THREE.Group();
        lower.position.set(0, -0.375, 0);
        group.children.filter((part) => part.position.y <= -0.37).forEach((part) => { group.remove(part); part.position.y += 0.375; lower.add(part); });
        group.add(lower);
        group.rotation.x = -1.42;
        group.rotation.z = (group.position.x < 0 ? -1 : 1) * S.LEG_SPLAY;
        lower.rotation.x = 1.18;
        let thigh = null;
        group.children.forEach((c) => {
            if (c.isMesh && c.geometry.parameters && c.geometry.parameters.radiusTop !== undefined && (!thigh || c.geometry.parameters.radiusTop > thigh.geometry.parameters.radiusTop)) thigh = c;
        });
        thighs[group.position.x < 0 ? -1 : 1] = thigh;
    });
    const pivot = new THREE.Group();
    pivot.position.set(0, HIP_Y, 0);
    const isLeg = (c) => c.isGroup && !c.userData.isArm && Math.abs(c.position.y - HIP_Y) < 0.02;
    for (const child of person.children.filter((c) => !isLeg(c))) { person.remove(child); child.position.y -= HIP_Y; pivot.add(child); }
    person.add(pivot);
    const verts = (mesh) => {
        const pos = mesh.geometry.attributes.position;
        const out = [];
        for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
        return out;
    };
    for (const arm of pivot.children.filter((c) => c.isGroup && c.userData.isArm)) {
        const side = arm.position.x < 0 ? -1 : 1;
        let hand = null;
        arm.userData.forearm.traverse((o) => { if (o.userData && o.userData.isHand) hand = o; });
        pose({ arm, elbow: arm.userData.forearm, hand }, S.CUSTOMER_REST_ARM, side);
        person.updateMatrixWorld(true);
        const low = lowest(person, hand);
        // The thigh's top under the hand: the highest thigh vertex within 3 cm across.
        let top = null;
        for (const t of verts(thighs[side])) {
            if (Math.hypot(t.x - low.x, t.z - low.z) > 0.03) continue;
            if (top === null || t.y > top) top = t.y;
        }
        expect(`${side}: on the thigh`).toBe(`${side}: ${top === null ? 'off it' : 'on the thigh'}`);
        expect(`${side}: ${((low.y - top) * 1000).toFixed(0)} mm`).toMatch(new RegExp(`^${side}: [1-7] mm$`));
        const elbowX = Math.abs(pivot.worldToLocal(arm.userData.forearm.getWorldPosition(new THREE.Vector3())).x) / person.scale.x;
        expect(elbowX).toBeGreaterThan(0.2125);
    }
});

test("the dealer's hands rest on his keys, a hair over them", () => {
    const L = S.LAYOUT;
    const mid = { x: (L.john.x + L.customer.x) / 2, z: (L.john.z + L.customer.z) / 2 };
    const yaw = faceToward(L.dealer, mid) + S.DEALER_TURN;
    const dealer = seated({ scale: 1, seat: L.dealer, yaw, lean: S.DEALER_LEAN });
    const keyTop = L.desk.topY + L.deskKeyboard.boardH + L.deskKeyboard.keyH;
    for (const side of [-1, 1]) {
        pose(dealer.arms[side], S.DEALER_TYPE_ARM, side);
        const low = lowest(dealer.person, dealer.arms[side].hand);
        expect(`${side}: ${(low.y - keyTop > 0 && low.y - keyTop < 0.008)}`).toBe(`${side}: true`);
    }
});
