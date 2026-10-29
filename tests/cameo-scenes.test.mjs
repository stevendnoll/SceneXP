// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The scenes that cast the visitor's own avatar among their wandering
 * visitors (cameo-1.0.0, 2026-10-28): the NCR Trail's walkers, the Seed to
 * Seed garden's guests and the Interstate Tire Shop's waiting customers.
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
