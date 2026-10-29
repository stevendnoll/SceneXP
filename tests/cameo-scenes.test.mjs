// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The scenes that cast the visitor's own avatar among their people
 * (cameo-1.0.0, 2026-10-28): the NCR Trail's walkers, the Seed to Seed
 * garden's guests, the Interstate Tire Shop's waiting customers, a
 * passerby on the Family scene's sidewalk, a dancer in Roqui's class (and
 * its twin in the mirror), and one of the regulars at Jamar's high-top.
 *
 * Each page is booted the way a real load boots it (main.js auto-runs), with
 * cameo-1.0.0 stood in for, so the test decides whether an avatar is saved.
 * What it proves is the wiring, which no shared suite can see: the page asks
 * for the cameo, waits for it, and hands it to the walkers, where it takes
 * one drawn visitor's place, and Dad's trail dress code passes it by. With
 * no avatar saved, the walkers are the page's usual ones, as many as before.
 * shared-cameo measures the cameo itself, and shared-npcs the walkers' hook.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, flushAsync } from './helpers/dom-stub.mjs';

const cameoState = { next: null, calls: [] };

jest.unstable_mockModule('../www/shared/js/cameo-1.0.0.min.js', () => ({
    AVATAR_KEY: 'scenexp-avatar',
    FLOOR: 0.055,
    hasSavedAvatar: () => cameoState.next !== null,
    asCameo: (figure) => figure,
    loadCameo: (options) => {
        cameoState.calls.push(options);
        return Promise.resolve(cameoState.next);
    }
}));

/** A built cameo as the walkers see it: a root they move, tagged as a
 *  customer and a cameo. A skirt-shaped piece hangs straight off it, which
 *  is exactly what Dad's dress code would take off a drawn walker. */
function fakeCameo() {
    const position = { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); return this; } };
    const skirt = { isMesh: true, geometry: { type: 'CylinderGeometry', dispose() {} }, position: { y: 0.63 } };
    const group = { isGroup: true, position, rotation: { y: 0 }, userData: { isCameo: true, isCustomer: true, role: 'customer' }, children: [skirt], parent: null };
    group.remove = (child) => {
        group.children = group.children.filter((c) => c !== child);
    };
    return { group, skirt };
}

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    globalThis.MutationObserver = class {
        constructor(cb) { this.cb = cb; }
        observe() {}
        disconnect() {}
    };
    dom.windowStub.AudioContext = class {};
    cameoState.next = null;
    cameoState.calls = [];
});

afterEach(() => {
    dom.uninstall();
    delete globalThis.MutationObserver;
    jest.useRealTimers();
});

/** Boot a scene page, all the way to loaded, and read its walkers. */
async function boot(scene) {
    const main = await import(`../www/${scene}/js/main.js`);
    await flushAsync();
    await jest.advanceTimersByTimeAsync(500);
    expect(main.getState().isLoaded).toBe(true);
    const npcs = await import('../www/shared/js/npcs-1.0.0.min.js');
    return npcs.getVisitorMeshes();
}

describe.each([['dad'], ['seedtoseed'], ['interstate']])('%s', (scene) => {
    test('with no avatar saved, the walkers are the usual ones', async () => {
        const walkers = await boot(scene);
        expect(cameoState.calls).toHaveLength(1);
        expect(walkers.length).toBeGreaterThan(0);
        expect(walkers.some((w) => w.userData && w.userData.isCameo === true)).toBe(false);
    });

    test('with one saved, the cameo walks with them in place of one, shown as made', async () => {
        const usual = (await boot(scene)).length;
        jest.resetModules();
        const { group, skirt } = fakeCameo();
        cameoState.next = { group };
        const walkers = await boot(scene);
        // Asked for once a boot, with the default role: the scenes'
        // wandering visitors are customers.
        expect(cameoState.calls).toEqual([undefined, undefined]);
        expect(walkers).toHaveLength(usual);
        expect(walkers[0]).toBe(group);
        expect(group.position.y).toBe(0.055);
        // Nothing of a scene's costume comes off it (Dad's trail takes skirts).
        expect(group.children).toContain(skirt);
    });
});

describe('family', () => {
    /** Boot the course, all the way to loaded, and read its passersby. */
    async function bootCourse() {
        const main = await import('../www/family/js/main.js');
        await flushAsync();
        await jest.advanceTimersByTimeAsync(500);
        expect(main.getState().isLoaded).toBe(true);
        const peds = await import('../www/shared/js/pedestrians-1.0.0.min.js');
        return peds.getPedestrianMeshes();
    }

    test('with no avatar saved, the passersby are the usual ones', async () => {
        const walkers = await bootCourse();
        expect(cameoState.calls).toEqual([{ role: 'pedestrian' }]);
        expect(walkers.length).toBeGreaterThan(0);
        expect(walkers.some((w) => w.userData && w.userData.isCameo === true)).toBe(false);
    });

    test('with one saved, it walks the sidewalk in place of one, a pedestrian like them', async () => {
        const usual = (await bootCourse()).length;
        jest.resetModules();
        const { group } = fakeCameo();
        group.userData = { isCameo: true, isPedestrian: true, role: 'pedestrian' };
        cameoState.next = { group };
        const walkers = await bootCourse();
        expect(walkers).toHaveLength(usual);
        expect(walkers[0]).toBe(group);
        expect(group.position.y).toBe(0.055);
    });
});

describe('roqui', () => {
    /** A built cameo as the class sees it: the group the dance moves, and
     *  the person whose tagged arms and legs it swings. */
    function fakeFigure() {
        const limb = (tag, x) => ({ isGroup: true, userData: { [tag]: true }, position: { x, y: 0.75 }, rotation: { x: 0, y: 0, z: 0 } });
        const position = { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } };
        const group = { isGroup: true, position, rotation: { x: 0, y: 0, z: 0 }, userData: { isCameo: true }, children: [], parent: null };
        group.traverse = (fn) => fn(group);
        const person = { children: [limb('isArm', 0.2), limb('isArm', -0.2), limb('isLeg', 0.1), limb('isLeg', -0.1)] };
        return { group, person };
    }

    /** Boot the studio, all the way to loaded, and hold its store. */
    async function bootStudio() {
        const main = await import('../www/roqui/js/main.js');
        await flushAsync();
        await jest.advanceTimersByTimeAsync(500);
        expect(main.getState().isLoaded).toBe(true);
        return import('../www/roqui/js/store.min.js');
    }

    test('with no avatar saved, the class is the six regulars', async () => {
        const store = await bootStudio();
        expect(cameoState.calls).toEqual([{ role: 'pedestrian' }]);
        expect(store.getDancerMeshes()).toHaveLength(6);
        expect(store.getDancerMeshes().some((g) => g.userData && g.userData.isCameo === true)).toBe(false);
    });

    test('with one saved, it dances in the place nearest the door, its twin dancing in the mirror', async () => {
        const twins = [];
        const cameo = fakeFigure();
        cameo.another = () => {
            twins.push(fakeFigure());
            return twins[twins.length - 1];
        };
        cameoState.next = cameo;
        const store = await bootStudio();
        const dancers = store.getDancerMeshes();
        expect(dancers).toHaveLength(6);
        expect(dancers[5]).toBe(cameo.group);
        expect(cameo.group.userData).toMatchObject({ isDancer: true, dancerIndex: 5 });
        // The back row's east end, facing Roqui; its one twin behind the glass.
        expect(cameo.group.position).toMatchObject({ x: 2.6, z: 1.7 });
        expect(twins).toHaveLength(1);
        expect(twins[0].group.position.x).toBe(2.6);
        expect(twins[0].group.position.z).toBeCloseTo(2 * -6.875 - 1.7, 10);
        // A few beats of the routine swing both figures' arms and legs.
        const swung = (figure) => figure.person.children.filter((c) => c.rotation.x !== 0).length;
        for (let i = 0; i < 30; i++) store.updateStudio(null, 0.05);
        expect(swung(cameo)).toBe(4);
        expect(swung(twins[0])).toBe(4);
    });
});

describe('jamar', () => {
    // The bar's boot builds the jukebox's song list with append(), and its
    // focus-restore asks document.contains() (jamar-main's harness, too).
    beforeEach(() => {
        dom.documentStub.contains = (el) => !!el;
        const create = dom.documentStub.createElement;
        dom.documentStub.createElement = (tag) => {
            const el = create(tag);
            el.append = (...nodes) => nodes.forEach((n) => el.appendChild(n));
            return el;
        };
    });

    /** Boot the bar, all the way to loaded, and read its tappable things. */
    async function bootBar() {
        const main = await import('../www/jamar/js/main.js');
        await flushAsync();
        await jest.advanceTimersByTimeAsync(500);
        expect(main.getState().isLoaded).toBe(true);
        const world = await import('../www/shared/js/world-1.0.0.min.js');
        return world.getOutdoorPropMeshes();
    }

    test('with no avatar saved, nothing at the high-top is the cameo', async () => {
        const props = await bootBar();
        expect(cameoState.calls).toHaveLength(1);
        expect(props.length).toBeGreaterThan(20);
        expect(props.some((g) => g.userData && g.userData.isCameo === true)).toBe(false);
    });

    test('with one saved, the bar is handed it, and it stands at the high-top as a thing to tap', async () => {
        const { group } = fakeCameo();
        cameoState.next = { group, person: { children: [] } };
        const props = await bootBar();
        expect(props).toContain(group);
        expect(group.userData.propKind).toBe('cameo');
        expect(group.position.y).toBe(0.055);
    });
});
