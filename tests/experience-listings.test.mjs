// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Coverage for the per-experience listings.js placeholder modules. The
 * realtor build rendered for-sale homes on lit podiums here; every
 * experience that inherited the module keeps it as a deliberate stub so the
 * raycast seam survives -- an empty 'listings' container group, a memoized
 * initListings(), and an inert remainder of the podium API.
 *
 * All six copies are the same code (only their comments differ about what
 * might one day fill the seam), so they are held to one contract here. A
 * future edit that grows behavior in any of them, or breaks the memo, fails
 * here first.
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';

const EXPERIENCES = ['dad', 'family', 'interstate', 'roqui', 'seedtoseed', 'steve'];

beforeEach(() => {
  installThree();
});

afterEach(() => {
  uninstallAll();
});

describe.each(EXPERIENCES)('%s listings.js stub', (exp) => {
  test('memoizes its container group and keeps the rest of the API inert', async () => {
    jest.resetModules();
    const listings = await import(`../www/${exp}/js/listings.js`);

    // No container until initListings() runs.
    expect(listings.getListingsGroup()).toBeNull();

    // First init creates the group and adds it to the scene exactly once.
    const added = [];
    const scene = { add: (obj) => added.push(obj) };
    const group = listings.initListings(scene);
    expect(group).toBeTruthy();
    expect(added).toHaveLength(1);
    expect(added[0]).toBe(group);
    expect(listings.getListingsGroup()).toBe(group);

    // Second init hits the memo branch: same group back, no second add.
    expect(listings.initListings(scene)).toBe(group);
    expect(added).toHaveLength(1);

    // The rest of the podium API is deliberately inert.
    expect(listings.clearListings()).toBeUndefined();
    expect(listings.buildListings()).toBeUndefined();
    expect(listings.resolveListingPodium(group)).toBeNull();
    expect(listings.resolveListingPodium(null)).toBeNull();
    expect(listings.getListingColliders()).toEqual([]);
    expect(listings.getListingWaypoints()).toEqual([]);
    expect(listings.SAMPLE_LISTINGS).toEqual([]);
  });
});
