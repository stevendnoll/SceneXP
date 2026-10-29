// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The visitor's own avatar at Jamar's high-top (cameo-1.0.0, 2026-10-28).
 *
 * With an avatar saved, it takes the first regular's place (the one turned
 * side-on to the camera): registered as its own tappable thing with a card
 * of its own, a pint in the regular's hand, swaying and toasting with the
 * other. With none, the two regulars are exactly as before.
 *
 * An avatar's hand is often bigger than the rig's (its standard is 1.4 times
 * it, its largest twice), so its glass is fitted: measured on real three, the
 * glass sits as far in front of the hand as a regular's does, at every hand
 * size. Glasses that were already approved (Steve's 1.4 hand, the regulars)
 * stay exactly where they were.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll, keepPropRecords } from './helpers/three-stub.mjs';
import { loadRealThree } from './helpers/real-three.mjs';

/** The frontmost point of a figure's hand in its arm's own frame. */
function handFront(THREE, arm) {
    let hand = null;
    arm.traverse((o) => {
        if (!hand && o.userData.isHand) hand = o;
    });
    arm.updateMatrixWorld(true);
    const toArm = new THREE.Matrix4().copy(arm.matrixWorld).invert().multiply(hand.matrixWorld);
    const pos = hand.geometry.attributes.position;
    const v = new THREE.Vector3();
    let front = -Infinity;
    for (let i = 0; i < pos.count; i++) front = Math.max(front, v.fromBufferAttribute(pos, i).applyMatrix4(toArm).z);
    return front;
}

describe('at the high-top', () => {
    beforeEach(() => {
        installThree();
        keepPropRecords();   // so the regulars' propKind sticks under the stub
        installCanvas();
        installBrowserGlobals();
        globalThis.document.addEventListener = () => {};
        globalThis.document.removeEventListener = () => {};
        globalThis.document.getElementById = () => null;
        globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
    });

    afterEach(() => {
        uninstallAll();
        delete globalThis.sessionStorage;
    });

    /** A built cameo as the store sees it: the group it places and sways,
     *  and the figure inside whose arm takes the glass. */
    function standIn() {
        const arm = {
            isGroup: true, userData: { isArm: true }, position: { x: 0.2 }, rotation: { x: 0.1, z: 0.15 },
            children: [],
            add(child) { this.children.push(child); },
            traverse(fn) { fn(this); }
        };
        const group = {
            position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } },
            rotation: { x: 0, y: 0, z: 0 },
            userData: { isCameo: true }
        };
        return { group, person: { children: [arm] }, arm };
    }

    async function buildBar(options) {
        jest.resetModules();
        const scene = await import('../www/shared/js/scene-1.0.0.min.js');
        const world = await import('../www/shared/js/world-1.0.0.min.js');
        const store = await import('../www/jamar/js/store.js');
        const { JAMAR_CONFIG } = await import('../www/jamar/js/config.js');
        scene.initScene({}, JAMAR_CONFIG);
        store.initStore(options);
        const props = world.getOutdoorPropMeshes();
        const count = (kind) => props.filter((g) => g.userData.propKind === kind).length;
        return { store, props, count };
    }

    test('with no avatar saved, the two regulars are as they were', async () => {
        for (const options of [undefined, {}, { cameo: null }]) {
            const { count } = await buildBar(options);
            expect(count('patrons')).toBe(2);
            expect(count('cameo')).toBe(0);
        }
    });

    test('with one saved, it takes the first regular\'s place, glass in hand, and sways with the room', async () => {
        const cameo = standIn();
        const { store, props, count } = await buildBar({ cameo });
        expect(count('patrons')).toBe(1);
        expect(count('cameo')).toBe(1);
        expect(props.find((g) => g.userData.propKind === 'cameo')).toBe(cameo.group);
        // On the floor beside the high-top, turned as the regular was.
        expect(cameo.group.position.y).toBe(0.055);
        expect(cameo.group.rotation.y).toBe(2.55);
        // The regular's pint, in the regular's hand, raised to table height.
        expect(cameo.arm.children).toHaveLength(1);
        expect(cameo.arm.rotation.x).toBe(-1.1);
        // A few seconds of the song: the sway turns it and the toast lifts.
        for (let i = 0; i < 100; i++) store.updateBar(0.02);
        expect(cameo.group.rotation.y).not.toBe(2.55);
        expect(cameo.group.rotation.z).not.toBe(0);
        expect(cameo.arm.rotation.x).toBeLessThan(-1.1);
    });
});

describe('the glass in a bigger hand', () => {
    let THREE;
    let store;
    let createPerson;
    let createAvatar;
    let A;

    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        store = await import('../www/jamar/js/store.js');
        ({ createPerson } = await import('../www/shared/js/people-1.0.0.min.js'));
        ({ createAvatar } = await import('../www/shared/js/avatar-figure-1.0.0.min.js'));
        A = await import('../www/shared/js/avatar-1.0.0.min.js');
    });

    afterAll(() => {
        delete globalThis.THREE;
    });

    /** How far in front of the hand the glass's axis stands. */
    function clearance(held) {
        return held.glass.position.z - handFront(THREE, held.arm);
    }

    test.each(handSizes())('an avatar\'s %s hand holds it where a regular holds theirs', (size) => {
        const regular = clearance(store.giveGlass(createPerson({ role: 'customer' }), 1));
        const avatar = createAvatar({ ...A.DEFAULT_AVATAR, handSize: size }, { role: 'customer' });
        const held = store.giveGlass(avatar.person, 1, { fit: true });
        expect(Math.abs(clearance(held) - regular)).toBeLessThan(0.001);
    });

    test('every hand size the avatar offers is measured here', () => {
        expect(A.HAND_SIZES.map((h) => h.id)).toEqual(handSizes());
    });

    test('a glass already approved stays where it was: a regular\'s, and Steve\'s bigger hand', () => {
        expect(store.giveGlass(createPerson({ role: 'customer' }), 1).glass.position.z).toBe(0.045);
        expect(store.giveGlass(createPerson({ role: 'customer', handScale: 1.4 }), 1).glass.position.z).toBe(0.045);
        // And fitting a regular's own hand moves nothing.
        expect(store.giveGlass(createPerson({ role: 'customer' }), -1, { fit: true }).glass.position.z).toBeCloseTo(0.045, 10);
    });
});

/** The avatar's hand sizes, named here so test.each can list them before
 *  the modules load; the last test above holds them to avatar-1.0.0's own. */
function handSizes() {
    return ['small', 'standard', 'large', 'xl'];
}
