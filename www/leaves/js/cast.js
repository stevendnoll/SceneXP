// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cast.js - who is on leaf duty (M4): the shirt and pants colors, the skin
 * tones, the hair, and the visitor's choice, kept in this browser for next
 * time.
 *
 * STEVE'S ANSWERS (PRD, 2026-10-06): none of the figures from the personal
 * tribute scenes (they are real people), and SKIN TONE, HAIR COLOR and HAIR
 * LENGTH to choose, because they matter more to a visitor than height or
 * build. The named outfits of M4 (the weekend warrior, the retiree...) gave
 * way at Steve's QA of 2026-10-08 to a SHIRT COLOR and a PANTS COLOR,
 * chosen freely, always with long sleeves ("it looks chilly outside").
 *
 * KEPT IN LOCAL STORAGE under STORAGE_KEY, and nothing else: five short ids.
 * Disclosed in www/privacy.html (tests/privacy.test.mjs holds this file to
 * that), and "Forget my choice" on the character card clears it. Every read
 * goes through normalizeChoice(), so a stored value from an older version
 * (an outfit becomes its nearest shirt and pants), or one somebody edited by
 * hand, comes back as a valid choice rather than a broken figure, and a
 * browser that refuses storage (a private window) simply gets the default
 * each visit.
 *
 * PURE apart from the three storage calls: the lists, the validation and the
 * figure's settings are all checked under Node.
 */

export const STORAGE_KEY = 'leaves-character';

/** The shirts. `name` is how the welcome card says it ("Playing in a rust
 *  red shirt"), `label` the swatch's. Colors are display (sRGB) values. */
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

/** The option in `list` whose color is nearest `hex`. */
function nearest(list, hex) {
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

/** The figure M0 to M3 shipped with: a rust red shirt and navy pants (the
 *  weekend warrior's), fair, dark brown hair, short. */
export const DEFAULT_CHOICE = Object.freeze({ shirt: 'rust', pants: 'navy', skin: 'fair', hair: 'darkBrown', length: 'short' });

const byId = (list, id) => list.find((o) => o.id === id) || null;

/** A choice made valid: each part kept if it names a real option, the
 *  default's otherwise. Takes anything (null, a string, a stale object). */
export function normalizeChoice(raw) {
    const r = raw && typeof raw === 'object' ? { ...raw } : {};
    // An outfit kept before 2026-10-08: its nearest shirt and pants.
    const old = OUTFITS[r.preset];
    if (old) {
        if (r.shirt === undefined) r.shirt = nearest(SHIRTS, old[0]);
        if (r.pants === undefined) r.pants = nearest(PANTS, old[1]);
    }
    const pick = (list, key) => (byId(list, r[key]) ? r[key] : DEFAULT_CHOICE[key]);
    return {
        shirt: pick(SHIRTS, 'shirt'),
        pants: pick(PANTS, 'pants'),
        skin: pick(SKINS, 'skin'),
        hair: pick(HAIR_COLORS, 'hair'),
        length: pick(HAIR_LENGTHS, 'length')
    };
}

/** The settings createPerson() needs for a choice. */
export function personConfig(choice) {
    const c = normalizeChoice(choice);
    const shirt = byId(SHIRTS, c.shirt).color;
    return {
        role: 'operator',
        shirtColor: shirt,
        // Long sleeves, always: "it looks chilly outside".
        sleeveColor: shirt,
        pantsColor: byId(PANTS, c.pants).color,
        skinTone: byId(SKINS, c.skin).color,
        hairColor: byId(HAIR_COLORS, c.hair).color,
        hairStyle: c.length === 'bald' ? 'short' : c.length,
        bald: c.length === 'bald',
        shoulderRound: 0.4
    };
}

/** The welcome card's line: "Playing in a rust red shirt and navy pants." */
export function castLine(choice) {
    const c = normalizeChoice(choice);
    return `Playing in a ${byId(SHIRTS, c.shirt).name} shirt and ${byId(PANTS, c.pants).name} pants.`;
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
