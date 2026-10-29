// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The visitor's own avatar as one of a scene's cast (cameo-1.0.0, 2026-10-28).
 *
 * Three promises, each one a scene's to rely on without looking:
 *  - with nothing saved, nothing is loaded and the scene's cast is its own
 *    (no call to the import at all, so a visitor downloads nothing more);
 *  - anything going wrong on the way is the same as nothing saved;
 *  - a cameo stands and answers like a createPerson root: on the floor at the
 *    same height, platforms too, and a raycast hit anywhere on it walks up to
 *    the group the cast code moves.
 * The last is measured on real three, through the real import(), so a
 * mistyped module path fails here rather than quietly in a browser.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let C;
let A;
let createPerson;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    C = await import('../www/shared/js/cameo-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.min.js');
    ({ createPerson } = await import('../www/shared/js/people-1.0.0.min.js'));
});

/** A fake localStorage, as a global, that can be made to refuse reads. */
function installStorage() {
    const map = new Map();
    const fake = {
        refuseRead: false,
        getItem(k) {
            if (fake.refuseRead) throw new Error('SecurityError');
            return map.has(k) ? map.get(k) : null;
        },
        setItem(k, v) {
            map.set(k, String(v));
        },
        removeItem(k) {
            map.delete(k);
        }
    };
    globalThis.localStorage = fake;
    return fake;
}

afterEach(() => {
    delete globalThis.localStorage;
});

/** The first ancestor (or the object itself) tagged isCustomer, the way the
 *  scenes' getVisitorRoot walks up from a raycast hit. */
function customerRoot(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.isCustomer) return o;
    return null;
}

const lowest = (object) => {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object, true).min.y;
};

describe('whether an avatar is saved', () => {
    test('is the avatar store\'s own key', () => {
        expect(C.AVATAR_KEY).toBe(A.STORAGE_KEYS.avatar);
    });

    test('only when the key exists, whatever it holds, and never throwing', () => {
        expect(C.hasSavedAvatar()).toBe(false); // no storage at all
        const ls = installStorage();
        expect(C.hasSavedAvatar()).toBe(false);
        ls.setItem(C.AVATAR_KEY, '{}');
        expect(C.hasSavedAvatar()).toBe(true);
        ls.refuseRead = true;
        expect(C.hasSavedAvatar()).toBe(false);
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
        expect(C.hasSavedAvatar()).toBe(false);
    });
});

describe('loading the cameo', () => {
    test('with nothing saved, nothing is imported and there is no cameo', async () => {
        installStorage();
        const load = jest.fn();
        expect(await C.loadCameo({ load })).toBeNull();
        expect(load).not.toHaveBeenCalled();
    });

    test('a module that will not load, or a figure that will not build, leaves the usual cast', async () => {
        installStorage().setItem(C.AVATAR_KEY, '{}');
        expect(await C.loadCameo({ load: () => Promise.reject(new Error('offline')) })).toBeNull();
        const store = { hasSaved: () => true, load: () => ({}) };
        expect(await C.loadCameo({ load: async () => ({ store, createAvatar: () => { throw new Error('bad'); } }) })).toBeNull();
    });

    test('an avatar forgotten in another tab while the modules loaded is no cameo', async () => {
        installStorage().setItem(C.AVATAR_KEY, '{}');
        const createAvatar = jest.fn();
        const store = { hasSaved: () => false, load: () => ({}) };
        expect(await C.loadCameo({ load: async () => ({ store, createAvatar }) })).toBeNull();
        expect(createAvatar).not.toHaveBeenCalled();
    });

    test('the saved avatar is built with the role asked for, exactly as saved', async () => {
        const saved = { ...A.DEFAULT_AVATAR, bottom: 'skirt', shoes: 'platforms', hat: 'beanie' };
        installStorage().setItem(C.AVATAR_KEY, JSON.stringify(saved));
        const cameo = await C.loadCameo({ role: 'pedestrian' });
        expect(cameo).not.toBeNull();
        expect(A.sameAvatar(cameo.avatar, A.normalizeAvatar(saved))).toBe(true);
        expect(cameo.group.userData).toMatchObject({ isCameo: true, role: 'pedestrian', isPedestrian: true, isCustomer: false });
    });
});

describe('a cameo is shaped like a createPerson root', () => {
    async function savedCameo(avatar) {
        installStorage().setItem(C.AVATAR_KEY, JSON.stringify({ ...A.DEFAULT_AVATAR, ...avatar }));
        return C.loadCameo();
    }

    test('a hit on any piece of it walks up to the group, and nothing inside answers first', async () => {
        const cameo = await savedCameo({ bottom: 'skirt', glasses: 'round', hat: 'ballCap' });
        expect(cameo.group.userData).toMatchObject({ isCameo: true, role: 'customer', isCustomer: true });
        let meshes = 0;
        cameo.group.traverse((o) => {
            if (!o.isMesh) return;
            meshes++;
            expect(customerRoot(o)).toBe(cameo.group);
        });
        expect(meshes).toBeGreaterThan(30);
        expect(cameo.person.userData.role).toBeUndefined();
    });

    test.each([
        ['classic shoes', { shoes: 'classic' }],
        ['platforms, whose sole stands the figure up', { shoes: 'platforms' }],
        ['cleats, on their studs', { shoes: 'cleats' }]
    ])('placed as a scene places a createPerson root, it stands on the same floor: %s', async (_name, avatar) => {
        const cameo = await savedCameo(avatar);
        // initGalleryVisitors: position.set(spot.x, 0.055, spot.z).
        cameo.group.position.set(3, C.FLOOR, -2);
        const plain = createPerson({ x: 3, z: -2 });
        expect(plain.position.y).toBe(C.FLOOR);
        expect(Math.abs(lowest(cameo.group) - lowest(plain))).toBeLessThan(0.002);
    });
});
