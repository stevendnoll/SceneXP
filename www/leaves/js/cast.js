// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cast.js - who is on leaf duty (M4): the visitor's choice of figure, kept in
 * this browser for next time.
 *
 * THE CHOICES THEMSELVES ARE A SHARED PART since 2026-10-19
 * (shared/js/cast-1.0.0.js, promoted for Derby Day): the shirts, pants, skin
 * tones and hair, validation, and the store. What stays here is Leaf
 * Blower's own: its storage key, the named outfits it kept before
 * 2026-10-08, the operator's figure, and the welcome card's sentence.
 *
 * STEVE'S ANSWERS (PRD, 2026-10-06): none of the figures from the personal
 * tribute scenes (they are real people), and SKIN TONE, HAIR COLOR and HAIR
 * LENGTH to choose. The named outfits of M4 (the weekend warrior, the
 * retiree...) gave way at Steve's QA of 2026-10-08 to a SHIRT COLOR and a
 * PANTS COLOR, chosen freely, always with long sleeves ("it looks chilly
 * outside").
 *
 * KEPT IN LOCAL STORAGE under STORAGE_KEY, and nothing else: five short ids.
 * Disclosed in www/privacy.html, and "Forget my choice" on the character
 * card clears it. Every read goes through normalizeChoice(), so a stored
 * value from an older version (an outfit becomes its nearest shirt and
 * pants), or one somebody edited by hand, comes back as a valid choice.
 */

import {
    SHIRTS, PANTS, SKINS, HAIR_COLORS, HAIR_LENGTHS, DEFAULT_CHOICE,
    nearestOption, normalizeChoice as normalizeParts, personConfig as personParts, outfitWords, createCastStore
} from '../../shared/js/cast-1.0.0.min.js';

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

/** The settings createPerson() needs for a choice: the operator, long
 *  sleeves always ("it looks chilly outside"). */
export function personConfig(choice) {
    return personParts(normalizeChoice(choice), { role: 'operator', shoulderRound: 0.4 });
}

/** The welcome card's line: "Playing in a rust red shirt and navy pants." */
export function castLine(choice) {
    return `Playing in ${outfitWords(choice)}.`;
}

const store = createCastStore(STORAGE_KEY, { normalize: normalizeChoice });

/** The saved choice, or the default where there is none or storage is
 *  refused. */
export function loadChoice() {
    return store.load();
}

/** Keep a choice for next time. Returns whether it was kept. */
export function saveChoice(choice) {
    return store.save(choice);
}

/** "Forget my choice": nothing kept. Returns whether it worked. */
export function forgetChoice() {
    return store.forget();
}
