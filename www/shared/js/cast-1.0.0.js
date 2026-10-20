// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cast.js - the visitor's own figure: the shirt and pants colors, the skin
 * tones, the hair color and length, a choice made valid whatever was stored,
 * the createPerson() settings it gives, and a small store that keeps it in
 * this browser under the scene's own key.
 *
 * PROMOTED FROM www/leaves on 2026-10-19 for Derby Day, whose visitor's
 * family cheers at their lane. Leaf Blower runs on it through its own
 * js/cast.js, which keeps what is that scene's alone: its storage key, its
 * named outfits from before 2026-10-08, the operator's role and long
 * sleeves, and the welcome card's sentence.
 *
 * SKIN TONE, HAIR COLOR AND HAIR LENGTH are what a visitor chooses, because
 * they matter more to a visitor than height or build (Steve, Leaf Blower PRD,
 * 2026-10-06). Shirt and pants are free colors, not named outfits (Steve's QA,
 * 2026-10-08).
 *
 * PURE apart from the three storage calls in createCastStore, which are each
 * wrapped, so a browser that refuses storage (a private window) simply gets
 * the default every visit. A scene that keeps a choice discloses it in
 * www/privacy.html (tests/privacy.test.mjs holds this file to that).
 */

/** The shirts. `name` is how a sentence says it ("a rust red shirt"),
 *  `label` the swatch's. Colors are display (sRGB) values. */
export const SHIRTS = Object.freeze([
    { id: 'rust', label: 'Rust red', name: 'rust red', color: 0x9c2b25 },
    { id: 'pumpkin', label: 'Pumpkin orange', name: 'pumpkin orange', color: 0xd2691e },
    { id: 'forest', label: 'Forest green', name: 'forest green', color: 0x3f6b3a },
    { id: 'mustard', label: 'Mustard', name: 'mustard', color: 0xd8b445 },
    { id: 'teal', label: 'Teal', name: 'teal', color: 0x1f8a8a },
    { id: 'navy', label: 'Navy', name: 'navy', color: 0x2f4a6d },
    { id: 'charcoal', label: 'Charcoal', name: 'charcoal', color: 0x3a3d42 },
    { id: 'white', label: 'White', name: 'white', color: 0xf2f2f2 }
]);

/** The pants, the same way. */
export const PANTS = Object.freeze([
    { id: 'navy', label: 'Navy', name: 'navy', color: 0x34495e },
    { id: 'denim', label: 'Denim blue', name: 'denim blue', color: 0x4a6f9a },
    { id: 'khaki', label: 'Khaki', name: 'khaki', color: 0xb5a58a },
    { id: 'brown', label: 'Brown', name: 'brown', color: 0x5a4632 },
    { id: 'charcoal', label: 'Charcoal', name: 'charcoal', color: 0x2f3236 },
    { id: 'black', label: 'Black', name: 'black', color: 0x1c1c1c }
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

/** A rust red shirt and navy pants, fair, dark brown hair, short: the figure
 *  Leaf Blower shipped with. */
export const DEFAULT_CHOICE = Object.freeze({ shirt: 'rust', pants: 'navy', skin: 'fair', hair: 'darkBrown', length: 'short' });

/** The option in `list` with this id, or null. */
export function optionOf(list, id) {
    return list.find((o) => o.id === id) || null;
}

/** The option in `list` whose color is nearest `hex`, by its id: for a
 *  scene mapping an old stored color onto today's swatches. */
export function nearestOption(list, hex) {
    const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const [r, g, b] = rgb(hex);
    let best = list[0];
    let bestD = Infinity;
    for (const o of list) {
        const [r2, g2, b2] = rgb(o.color);
        const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
        if (d < bestD) {
            bestD = d;
            best = o;
        }
    }
    return best.id;
}

/** A choice made valid: each part kept if it names a real option, the
 *  default's otherwise (`defaults`, DEFAULT_CHOICE unless given). Takes
 *  anything (null, a string, a stale object). */
export function normalizeChoice(raw, defaults = DEFAULT_CHOICE) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const pick = (list, key) => (optionOf(list, r[key]) ? r[key] : defaults[key]);
    return {
        shirt: pick(SHIRTS, 'shirt'),
        pants: pick(PANTS, 'pants'),
        skin: pick(SKINS, 'skin'),
        hair: pick(HAIR_COLORS, 'hair'),
        length: pick(HAIR_LENGTHS, 'length')
    };
}

/** The colors and hair createPerson() needs for a choice, long sleeves in
 *  the shirt's color, with `extra` (a role, `shoulderRound`, `sleeveColor:
 *  null` for bare forearms) laid over them. */
export function personConfig(choice, extra = {}) {
    const c = normalizeChoice(choice);
    const shirt = optionOf(SHIRTS, c.shirt).color;
    return {
        shirtColor: shirt,
        sleeveColor: shirt,
        pantsColor: optionOf(PANTS, c.pants).color,
        skinTone: optionOf(SKINS, c.skin).color,
        hairColor: optionOf(HAIR_COLORS, c.hair).color,
        hairStyle: c.length === 'bald' ? 'short' : c.length,
        bald: c.length === 'bald',
        ...extra
    };
}

/** What they are wearing, for a sentence: "a rust red shirt and navy pants". */
export function outfitWords(choice) {
    const c = normalizeChoice(choice);
    return `a ${optionOf(SHIRTS, c.shirt).name} shirt and ${optionOf(PANTS, c.pants).name} pants`;
}

/**
 * A choice kept in this browser under `storageKey`. `normalize` makes what
 * was stored valid (normalizeChoice against `defaults` unless the scene has
 * its own, to bring an older stored shape forward). Every call survives a
 * browser that refuses storage: `load` gives the defaults, `save` and
 * `forget` return false.
 */
export function createCastStore(storageKey, { defaults = DEFAULT_CHOICE, normalize = (raw) => normalizeChoice(raw, defaults) } = {}) {
    return {
        key: storageKey,
        load() {
            try {
                const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
                return normalize(raw ? JSON.parse(raw) : null);
            } catch (e) {
                return { ...defaults };
            }
        },
        save(choice) {
            try {
                localStorage.setItem(storageKey, JSON.stringify(normalize(choice)));
                return true;
            } catch (e) {
                return false;
            }
        },
        forget() {
            try {
                localStorage.removeItem(storageKey);
                return true;
            } catch (e) {
                return false;
            }
        }
    };
}
