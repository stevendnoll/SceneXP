// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cast.js - who is on leaf duty (M4): the outfits, the skin tones, the hair,
 * and the visitor's choice, kept in this browser for next time.
 *
 * STEVE'S ANSWERS (PRD, 2026-10-06): the outfits suggested in the PRD, none
 * of the figures from the personal tribute scenes (they are real people),
 * and three things to choose beyond the outfit, because they matter more to
 * a visitor than height or build: SKIN TONE, HAIR COLOR and HAIR LENGTH.
 * They are independent of the outfit: picking a different outfit keeps the
 * same person in it.
 *
 * KEPT IN LOCAL STORAGE under STORAGE_KEY, and nothing else: four short ids.
 * Disclosed in www/privacy.html (tests/privacy.test.mjs holds this file to
 * that), and "Forget my choice" on the character card clears it. Every read
 * goes through normalizeChoice(), so a stored value from an older version,
 * or one somebody edited by hand, comes back as a valid choice rather than
 * a broken figure, and a browser that refuses storage (a private window)
 * simply gets the default each visit.
 *
 * PURE apart from the three storage calls: the lists, the validation and the
 * figure's settings are all checked under Node.
 */

export const STORAGE_KEY = 'leaves-character';

/** The outfits. `name` is how the welcome card says it ("Playing as the
 *  retiree"), `label` is the button. Colors are display (sRGB) values. */
export const PRESETS = Object.freeze([
    { id: 'weekend', label: 'Weekend warrior', name: 'the weekend warrior', shirt: 0x9c2b25, sleeves: 0x9c2b25, pants: 0x34495e },
    { id: 'hoodie', label: 'Hoodie teen', name: 'the hoodie teen', shirt: 0x55705e, sleeves: 0x55705e, pants: 0x2c3440 },
    { id: 'retiree', label: 'Retiree', name: 'the retiree', shirt: 0x8a6e4b, sleeves: 0x8a6e4b, pants: 0xb5a58a },
    { id: 'executive', label: 'Executive', name: 'the executive', shirt: 0xf2f2f2, sleeves: null, pants: 0x2f3236, dressShirt: true },
    { id: 'runner', label: 'Runner', name: 'the runner', shirt: 0x1f8a8a, sleeves: null, pants: 0x1c1c1c },
    { id: 'gardener', label: 'Gardener', name: 'the gardener', shirt: 0xd8b445, sleeves: null, pants: 0x5a4632, apron: 0x3e6b3a }
]);

export const SKINS = Object.freeze([
    { id: 'light', label: 'Light', color: 0xf3d3bd },
    { id: 'fair', label: 'Fair', color: 0xe0ac86 },
    { id: 'medium', label: 'Medium', color: 0xc98f66 },
    { id: 'tan', label: 'Tan', color: 0xa86f47 },
    { id: 'brown', label: 'Brown', color: 0x7f4f33 },
    { id: 'deep', label: 'Deep', color: 0x553522 }
]);

export const HAIR_COLORS = Object.freeze([
    { id: 'black', label: 'Black', color: 0x1d1a18 },
    { id: 'darkBrown', label: 'Dark brown', color: 0x3b2a1e },
    { id: 'brown', label: 'Brown', color: 0x6b4a2f },
    { id: 'auburn', label: 'Auburn', color: 0x8c3f22 },
    { id: 'blond', label: 'Blond', color: 0xd9b46a },
    { id: 'gray', label: 'Gray', color: 0xa3a3a3 }
]);

/** Hair length, as the shared person rig draws it (people-1.0.0's
 *  `hairStyle` and `bald`). */
export const HAIR_LENGTHS = Object.freeze([
    { id: 'bald', label: 'None' },
    { id: 'buzz', label: 'Buzzed' },
    { id: 'short', label: 'Short' },
    { id: 'long', label: 'Long' }
]);

/** The figure M0 to M3 shipped with: the weekend warrior, fair, dark brown
 *  hair, short. */
export const DEFAULT_CHOICE = Object.freeze({ preset: 'weekend', skin: 'fair', hair: 'darkBrown', length: 'short' });

const byId = (list, id) => list.find((o) => o.id === id) || null;

/** A choice made valid: each part kept if it names a real option, the
 *  default's otherwise. Takes anything (null, a string, a stale object). */
export function normalizeChoice(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const pick = (list, key) => (byId(list, r[key]) ? r[key] : DEFAULT_CHOICE[key]);
    return {
        preset: pick(PRESETS, 'preset'),
        skin: pick(SKINS, 'skin'),
        hair: pick(HAIR_COLORS, 'hair'),
        length: pick(HAIR_LENGTHS, 'length')
    };
}

/** The settings createPerson() needs for a choice. */
export function personConfig(choice) {
    const c = normalizeChoice(choice);
    const p = byId(PRESETS, c.preset);
    const config = {
        role: 'operator',
        shirtColor: p.shirt,
        sleeveColor: p.sleeves,
        pantsColor: p.pants,
        skinTone: byId(SKINS, c.skin).color,
        hairColor: byId(HAIR_COLORS, c.hair).color,
        hairStyle: c.length === 'bald' ? 'short' : c.length,
        bald: c.length === 'bald',
        shoulderRound: 0.4
    };
    if (p.dressShirt) config.dressShirt = true;
    if (p.apron) {
        config.hasApron = true;
        config.apronColor = p.apron;
    }
    return config;
}

/** The welcome card's line: "Playing as the retiree." */
export function castLine(choice) {
    return `Playing as ${byId(PRESETS, normalizeChoice(choice).preset).name}.`;
}

/** The saved choice, or the default where there is none or storage is
 *  refused. */
export function loadChoice() {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        return normalizeChoice(raw ? JSON.parse(raw) : null);
    } catch (e) {
        return { ...DEFAULT_CHOICE };
    }
}

/** Keep a choice for next time. Returns whether it was kept. */
export function saveChoice(choice) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeChoice(choice)));
        return true;
    } catch (e) {
        return false;
    }
}

/** "Forget my choice": nothing kept. Returns whether it worked. */
export function forgetChoice() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (e) {
        return false;
    }
}
