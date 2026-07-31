// © 2026 Continuum Commerce LLC. MIT licensed.
// listings.js — placeholder module (Phase 6 keeps the seam).
//
// The realtor build rendered for-sale homes on lit podiums here; the tire
// theme kept the module as a stub, and this memorial trail does the same.
// The empty `'listings'` container group created by initListings() stays
// available as a raycast seam, so if this experience ever gains clickable
// point-of-interest displays they can be built into it with no
// re-registration. resolveListingPodium() would become the hit-test that
// maps a clicked mesh to a record.
//
// Caveat kept from the tire notes: main.js setupCollision() snapshots
// colliders once at init, so anything built later must either rebuild that
// snapshot or keep its colliders static.
//
// THREE is provided globally by ../lib/three.min.js (same as the rest of the app).

let container = null;

/** Create the (empty) container group and add it to the scene. Call once. */
export function initListings(scene) {
    if (container) return container;
    container = new THREE.Group();
    container.name = 'listings';
    scene.add(container);
    return container;
}

/** No podiums to remove in the environment-first milestone. */
export function clearListings() {}

/** No-op until the M5 service stations arrive. */
export function buildListings() {}

/** Nothing in the container resolves to a podium yet. */
export function resolveListingPodium() { return null; }

export function getListingsGroup() { return container; }

export function getListingColliders() { return []; }

export function getListingWaypoints() { return []; }

export const SAMPLE_LISTINGS = [];
