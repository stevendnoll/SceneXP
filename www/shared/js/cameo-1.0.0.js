// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cameo-1.0.0.js - the visitor's own avatar as one of a scene's cast
 * (2026-10-28): a visitor who has saved an avatar on /avatar/ finds it among
 * the people of a scene, a walker on the trail or a customer waiting on their
 * car. A visitor who has not sees the scene's usual cast, exactly as before.
 *
 * LOADED ONLY WHEN ONE IS SAVED. The avatar's modules (about 110 KB minified)
 * are imported here with import(), which keeps them out of a page's
 * generated modulepreload list (build.mjs follows static imports only), so a
 * visitor without an avatar downloads nothing more for this. A visitor with
 * one has been to the avatar page, so the files are already in the cache.
 * The check that decides it reads the storage key alone (`hasSavedAvatar`),
 * since avatar-1.0.0's own store is one of the modules being deferred.
 *
 * SHOWN EXACTLY AS MADE (the X's and O's quarterback's rule): nothing of a
 * scene's own costume goes on a cameo. A scene that dresses its cast (Dad's
 * trail takes the walkers' skirts) passes it by, by its `isCameo` tag.
 *
 * SHAPED LIKE A createPerson ROOT (`asCameo`), so a scene's cast code takes
 * it without knowing: the root stands at createPerson's floor height
 * (`FLOOR`), and the role tags a raycast walks up to (`isCustomer`,
 * `isPedestrian`, `isShopkeeper`, `role`) are on the root rather than on the
 * figure inside it, so the hit finds the same object the cast code moves.
 */

/** avatar-1.0.0's STORAGE_KEYS.avatar: the key existing is what "saved"
 *  means (tests/shared-cameo holds the two equal). */
export const AVATAR_KEY = 'scenexp-avatar';

/** createPerson's root height: its shoe bottoms are at -0.05, raised to sit
 *  on the floor. */
export const FLOOR = 0.055;

/** The tags createPerson sets from its role. */
const ROLE_TAGS = ['role', 'isShopkeeper', 'isCustomer', 'isPedestrian'];

/** Whether an avatar is saved in this browser, without loading the avatar's
 *  modules. False where the browser refuses storage. */
export function hasSavedAvatar() {
    try {
        return typeof localStorage !== 'undefined' && localStorage !== null && localStorage.getItem(AVATAR_KEY) !== null;
    } catch (e) {
        return false;
    }
}

/** A built avatar (avatar-figure's createAvatar) shaped like a createPerson
 *  root: the role tags moved up to its group, the group raised to the floor
 *  and the figure inside lowered by as much (a platform shoe's lift stays),
 *  and the group tagged `isCameo`. Returns the same figure. */
export function asCameo(figure) {
    const { group, person } = figure;
    for (const key of ROLE_TAGS) {
        group.userData[key] = person.userData[key];
        delete person.userData[key];
    }
    group.userData.isCameo = true;
    person.position.y -= FLOOR;
    group.position.y = FLOOR;
    return figure;
}

/** The avatar's modules, imported now. */
async function importAvatar() {
    const [{ createAvatarStore }, { createAvatar }] = await Promise.all([
        import('./avatar-1.0.0.min.js'),
        import('./avatar-figure-1.0.0.min.js')
    ]);
    return { store: createAvatarStore(), createAvatar };
}

/**
 * The visitor's saved avatar, built and shaped as a cameo with createPerson's
 * `role` ('customer' for a scene's wandering visitors), or null: nothing
 * saved, or anything failing on the way (a module that will not load), in
 * which case the scene keeps its usual cast. Start it early in a scene's boot
 * and await it where the cast is built. `load` is the import, for tests.
 */
export async function loadCameo({ role = 'customer', load = importAvatar } = {}) {
    if (!hasSavedAvatar()) return null;
    try {
        const { store, createAvatar } = await load();
        if (!store.hasSaved()) return null;
        return asCameo(createAvatar(store.load(), { role }));
    } catch (e) {
        return null;
    }
}
