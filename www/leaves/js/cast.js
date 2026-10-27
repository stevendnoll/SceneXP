// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cast.js - who is on leaf duty: since M6 of the avatar (2026-10-26), the
 * visitor's own site-wide avatar (shared/js/avatar-1.0.0.js, made once at
 * /avatar/), worn by the operator with NO overrides (Steve, 2026-10-24:
 * "funny to leaf blow in shorts and a tank top"). The welcome card shows its
 * portrait and links to the avatar page, which brings the visitor back here.
 *
 * WHAT STAYS HERE IS THE WAY IN FROM BEFORE. From M4 (2026-10-06) until the
 * avatar, the scene kept its own choice of figure under STORAGE_KEY, five
 * short ids (shirt and pants colors, skin tone, hair color and length, the
 * choices now a shared part, shared/js/cast-1.0.0.js), chosen on a card of
 * its own. `adoptChoice` moves such a choice INTO THE AVATAR, once, the first
 * time the scene runs after this shipped: it counts as a saved avatar (PRD
 * section 8), and the old key is removed. An avatar already saved on the
 * avatar page wins, and the old key still goes. Disclosed in
 * www/privacy.html.
 *
 * Every read goes through normalizeChoice(), so a stored value from an older
 * version (an outfit becomes its nearest shirt and pants), or one somebody
 * edited by hand, comes back as a valid choice.
 */

import {
    SHIRTS, PANTS, SKINS, HAIR_COLORS, HAIR_LENGTHS, DEFAULT_CHOICE,
    nearestOption, normalizeChoice as normalizeParts, personConfig as personParts, createCastStore
} from '../../shared/js/cast-1.0.0.min.js';
import { fromCastChoice } from '../../shared/js/avatar-1.0.0.min.js';

export { SHIRTS, PANTS, SKINS, HAIR_COLORS, HAIR_LENGTHS, DEFAULT_CHOICE };

export const STORAGE_KEY = 'leaves-character';

/** The named outfits a choice kept before 2026-10-08, by their shirt and
 *  pants, so a stored one comes back as the nearest colors. */
const OUTFITS = Object.freeze({
    weekend: [0x9c2b25, 0x34495e],
    hoodie: [0x55705e, 0x2c3440],
    retiree: [0x8a6e4b, 0xb5a58a],
    executive: [0xf2f2f2, 0x2f3236],
    runner: [0x1f8a8a, 0x1c1c1c],
    gardener: [0xd8b445, 0x5a4632]
});

/** A choice made valid: each part kept if it names a real option, the
 *  default's otherwise. Takes anything (null, a string, a stale object). */
export function normalizeChoice(raw) {
    const r = raw && typeof raw === 'object' ? { ...raw } : {};
    // An outfit kept before 2026-10-08: its nearest shirt and pants.
    const old = OUTFITS[r.preset];
    if (old) {
        if (r.shirt === undefined) r.shirt = nearestOption(SHIRTS, old[0]);
        if (r.pants === undefined) r.pants = nearestOption(PANTS, old[1]);
    }
    return normalizeParts(r);
}

/** The settings createPerson() needs for a choice on the operator's rig
 *  (the neighbor's way, and the suite's measure of the arm poses). */
export function personConfig(choice) {
    return personParts(normalizeChoice(choice), { role: 'operator', shoulderRound: 0.4 });
}

const store = createCastStore(STORAGE_KEY, { normalize: normalizeChoice });

/** Whether a choice is still kept under the old key. */
function kept() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null;
    } catch (e) {
        return false;
    }
}

/** The choice kept under the old key, or the default where there is none
 *  or storage is refused. */
export function loadChoice() {
    return store.load();
}

/** The old key, gone. Returns whether it worked. */
export function forgetChoice() {
    return store.forget();
}

/**
 * The avatar to wear this visit, from `avatarStore` (shared avatar-1.0.0's):
 * the saved avatar, or a choice kept under the old key moved in and saved
 * as the avatar. Null means nothing is saved anywhere: the usual figure.
 * The old key is removed once its choice is safely in the avatar store (a
 * browser that refuses the save keeps it, and tries again next visit).
 */
export function adoptChoice(avatarStore) {
    if (avatarStore.hasSaved()) {
        if (kept()) store.forget();
        return avatarStore.load();
    }
    if (!kept()) return null;
    const avatar = fromCastChoice(store.load());
    if (avatarStore.save(avatar)) store.forget();
    return avatar;
}
