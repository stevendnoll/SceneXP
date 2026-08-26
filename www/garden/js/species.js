// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * species.js - The twelve trees, the six sliders, and the seeded generator.
 *
 * Pure throughout. No THREE, no DOM.
 *
 * THE SEEDED GENERATOR IS LOAD BEARING. Every jitter in a tree's shape is
 * drawn from `makeRandom(seed)`, and the seed is stored with the tree. That is
 * the whole reason a persisted garden comes back as the SAME garden rather
 * than as twelve trees of the right species in the right places with the wrong
 * shapes. There is deliberately no Math.random() anywhere downstream of here.
 *
 * BARK COLOUR IS A FIRST-CLASS PART OF THE CHOICE, not a detail. The grid is
 * ordered small to large so a visitor sees the range at a glance, and the
 * twelve cover nine distinct bark treatments: chalk white, silver grey, smooth
 * grey, dark grey, medium brown, deep furrowed brown, dark red, red brown, and
 * orange red.
 *
 * THE TALLEST IS 14 METRES AND THAT IS A CAMERA DECISION. See the note in
 * config.js beside `plot.maxTreeHeight`: a 22 metre tree cannot be framed
 * alongside a 3 metre one from a fixed viewpoint, and 3 to 14 still reads as a
 * plain four-and-a-half to one difference.
 */

// ---- The generator ---------------------------------------------------------

/**
 * A small deterministic pseudo-random generator (mulberry32).
 *
 * Chosen because it is eight lines, has no state beyond one 32 bit integer,
 * and gives the same sequence on every engine forever. A tree's shape is a
 * function of its seed, so "the same on every engine forever" is not a nicety
 * here, it is the difference between a saved garden and a lottery.
 */
export function makeRandom(seed) {
    let a = (seed >>> 0) || 1;
    return function random() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A fresh seed for a new tree. Takes its randomness from the caller so the
 *  scene can stay deterministic under test. */
export function newSeed(random = Math.random) {
    return Math.floor(random() * 0xFFFFFFFF) >>> 0;
}

// ---- The twelve ------------------------------------------------------------

/**
 * Every species, ordered small to large.
 *
 * `params` are the branching parameters the generator reads:
 *   depth        recursion levels
 *   branches     children per node
 *   thirdChance  how often a node throws a third child instead of two
 *   lengthRatio  child length as a fraction of its parent
 *   radiusRatio  child radius as a fraction of its parent
 *   divergence   angle from the parent axis, in degrees
 *   gravitropism upward bias per level, negative droops
 *   taper        how much a segment narrows along its own length
 *   jitter       how far the seeded wobble can move things
 *   leafSize     metres across, before the slider
 *   leafDensity  leaf clusters per eligible branch
 */
export const SPECIES = [
    {
        id: 'japanese-maple',
        name: 'Japanese Maple',
        size: 'Small',
        note: 'Low and layered, and crimson before anything else has thought about it.',
        matureHeight: 3.0,
        evergreen: false,
        bark: 0x5a3630,
        barkName: 'Dark red',
        // A RED-LEAF CULTIVAR, which is what people picture when they hear
        // Japanese Maple: dark red through spring and summer rather than green.
        // The species note already said "crimson before anything else has
        // thought about it" and the palette did not agree with it.
        foliage: { spring: 0x9c4436, summer: 0x7a2f2b, autumn: 0xc22a18 },
        params: {
            depth: 6, branches: 2, thirdChance: 0.35, lengthRatio: 0.74,
            radiusRatio: 0.70, divergence: 42, gravitropism: 0.05, taper: 0.82,
            jitter: 0.26, leafSize: 0.16, leafDensity: 1.6
        }
    },
    {
        id: 'flowering-dogwood',
        name: 'Flowering Dogwood',
        size: 'Small',
        note: 'Tiers of horizontal branches, and the only tree here that blossoms.',
        matureHeight: 4.0,
        evergreen: false,
        blossom: 0xf6e8ec,
        bark: 0x8e8479,
        barkName: 'Smooth grey',
        foliage: { spring: 0x86a84e, summer: 0x497a35, autumn: 0x8d2f45 },
        params: {
            depth: 6, branches: 2, thirdChance: 0.15, lengthRatio: 0.72,
            radiusRatio: 0.68, divergence: 62, gravitropism: -0.12, taper: 0.84,
            jitter: 0.18, leafSize: 0.15, leafDensity: 1.5
        }
    },
    {
        id: 'olive',
        name: 'Olive',
        size: 'Small',
        note: 'Gnarled, silver, and entirely unbothered by winter.',
        matureHeight: 5.0,
        evergreen: true,
        bark: 0xa39c8c,
        barkName: 'Silver grey',
        foliage: { spring: 0x7f9270, summer: 0x6f8563, autumn: 0x6f8563 },
        params: {
            depth: 6, branches: 2, thirdChance: 0.40, lengthRatio: 0.70,
            radiusRatio: 0.69, divergence: 48, gravitropism: 0.10, taper: 0.78,
            jitter: 0.38, leafSize: 0.11, leafDensity: 1.8
        }
    },
    {
        id: 'paper-birch',
        name: 'Paper Birch',
        size: 'Medium',
        note: 'Chalk white bark and a fine, upright crown that catches every breeze.',
        matureHeight: 8.0,
        evergreen: false,
        bark: 0xe6e3da,
        barkName: 'Chalk white',
        foliage: { spring: 0x9cbb56, summer: 0x5c8a3c, autumn: 0xe0b23a },
        params: {
            depth: 7, branches: 2, thirdChance: 0.20, lengthRatio: 0.75,
            radiusRatio: 0.68, divergence: 30, gravitropism: 0.26, taper: 0.86,
            jitter: 0.22, leafSize: 0.13, leafDensity: 1.7
        }
    },
    {
        id: 'bur-oak',
        name: 'Bur Oak',
        size: 'Medium',
        note: 'Heavy, broad, and in no hurry whatsoever.',
        matureHeight: 9.0,
        evergreen: false,
        bark: 0x584434,
        barkName: 'Deep furrowed brown',
        foliage: { spring: 0x7d9c46, summer: 0x45702f, autumn: 0x8a5a2b },
        params: {
            depth: 7, branches: 2, thirdChance: 0.30, lengthRatio: 0.72,
            radiusRatio: 0.72, divergence: 46, gravitropism: 0.06, taper: 0.80,
            jitter: 0.30, leafSize: 0.17, leafDensity: 1.6
        }
    },
    {
        id: 'copper-beech',
        name: 'Copper Beech',
        size: 'Medium',
        note: 'A smooth grey trunk under a dome that turns the colour of an old penny.',
        matureHeight: 9.0,
        evergreen: false,
        bark: 0x6d6a66,
        barkName: 'Smooth dark grey',
        foliage: { spring: 0x7e6a4e, summer: 0x4b3b30, autumn: 0xa2542a },
        params: {
            depth: 7, branches: 2, thirdChance: 0.28, lengthRatio: 0.74,
            radiusRatio: 0.70, divergence: 38, gravitropism: 0.14, taper: 0.84,
            jitter: 0.24, leafSize: 0.15, leafDensity: 1.9
        }
    },
    {
        id: 'weeping-willow',
        name: 'Weeping Willow',
        size: 'Medium',
        note: 'Everything about it hangs, which is the whole point of it.',
        matureHeight: 9.0,
        evergreen: false,
        bark: 0x7a6a55,
        barkName: 'Fissured grey brown',
        foliage: { spring: 0x9ab661, summer: 0x6f9243, autumn: 0xd6cf72 },
        params: {
            depth: 7, branches: 2, thirdChance: 0.25, lengthRatio: 0.78,
            radiusRatio: 0.66, divergence: 34, gravitropism: -0.42, taper: 0.88,
            jitter: 0.28, leafSize: 0.12, leafDensity: 2.1
        }
    },
    {
        id: 'sugar-maple',
        name: 'Sugar Maple',
        size: 'Medium',
        note: 'The one everybody pictures when they picture autumn.',
        matureHeight: 10.0,
        evergreen: false,
        bark: 0x6b543c,
        barkName: 'Medium brown',
        foliage: { spring: 0x8fb352, summer: 0x437a30, autumn: 0xe2622a },
        params: {
            depth: 7, branches: 2, thirdChance: 0.32, lengthRatio: 0.74,
            radiusRatio: 0.70, divergence: 40, gravitropism: 0.16, taper: 0.83,
            jitter: 0.24, leafSize: 0.16, leafDensity: 1.9
        }
    },
    {
        id: 'quaking-aspen',
        name: 'Quaking Aspen',
        size: 'Medium',
        note: 'Its leaves tremble in air too still for anything else to notice.',
        matureHeight: 10.0,
        evergreen: false,
        tremble: 2.6,
        bark: 0xcfd3bd,
        barkName: 'Chalky white green',
        foliage: { spring: 0x9dbe57, summer: 0x5f8f38, autumn: 0xf0c231 },
        params: {
            depth: 7, branches: 2, thirdChance: 0.18, lengthRatio: 0.76,
            radiusRatio: 0.67, divergence: 26, gravitropism: 0.32, taper: 0.88,
            jitter: 0.20, leafSize: 0.13, leafDensity: 1.8
        }
    },
    {
        id: 'blue-spruce',
        name: 'Blue Spruce',
        size: 'Large',
        note: 'A conical evergreen that wears snow better than anything else here.',
        matureHeight: 12.0,
        evergreen: true,
        conical: true,
        bark: 0x7d7266,
        barkName: 'Grey brown',
        foliage: { spring: 0x6f93a4, summer: 0x5d8496, autumn: 0x5d8496 },
        params: {
            depth: 7, branches: 2, thirdChance: 0.55, lengthRatio: 0.70,
            radiusRatio: 0.66, divergence: 68, gravitropism: -0.06, taper: 0.90,
            jitter: 0.16, leafSize: 0.10, leafDensity: 2.4
        }
    },
    {
        id: 'scots-pine',
        name: 'Scots Pine',
        size: 'Large',
        note: 'Bare below, open above, and orange where the light catches it.',
        matureHeight: 14.0,
        evergreen: true,
        bark: 0xa9642f,
        barkName: 'Orange red',
        foliage: { spring: 0x5f7f4a, summer: 0x527040, autumn: 0x527040 },
        params: {
            depth: 6, branches: 2, thirdChance: 0.45, lengthRatio: 0.74,
            radiusRatio: 0.70, divergence: 52, gravitropism: 0.12, taper: 0.86,
            jitter: 0.34, leafSize: 0.14, leafDensity: 2.0
        }
    },
    {
        id: 'coast-redwood',
        name: 'Coast Redwood',
        size: 'Giant',
        note: 'A single fibrous red column, and the tallest thing this plot can hold.',
        matureHeight: 14.0,
        evergreen: true,
        conical: true,
        bark: 0x8a4b32,
        barkName: 'Fibrous red brown',
        foliage: { spring: 0x51724a, summer: 0x456440, autumn: 0x456440 },
        params: {
            depth: 7, branches: 2, thirdChance: 0.50, lengthRatio: 0.66,
            radiusRatio: 0.74, divergence: 72, gravitropism: -0.02, taper: 0.93,
            jitter: 0.14, leafSize: 0.11, leafDensity: 2.3
        }
    }
];

export const SPECIES_BY_ID = SPECIES.reduce((map, s) => { map[s.id] = s; return map; }, {});

export function speciesById(id) {
    return SPECIES_BY_ID[id] || null;
}

// ---- The six sliders -------------------------------------------------------

/**
 * The customisation ranges. Every one is a MULTIPLIER on the species value
 * rather than an absolute, so a slider set halfway up means the same thing on
 * a Japanese Maple as it does on a redwood and the presets stay meaningful.
 *
 * `words` gives each end of each range a plain-language name, which is what
 * the modal reads out to a screen reader instead of "0.8".
 */
export const SLIDERS = [
    { key: 'height', label: 'Height', min: 0.6, max: 1.6, step: 0.05, words: ['low', 'tall'] },
    { key: 'trunk', label: 'Trunk thickness', min: 0.7, max: 1.5, step: 0.05, words: ['slender', 'stout'] },
    { key: 'spread', label: 'Branch spread', min: 0.6, max: 1.4, step: 0.05, words: ['narrow', 'wide'] },
    { key: 'density', label: 'Branch density', min: 0.7, max: 1.3, step: 0.05, words: ['open', 'dense'] },
    { key: 'leaf', label: 'Leaf size', min: 0.7, max: 1.4, step: 0.05, words: ['fine', 'broad'] },
    { key: 'tint', label: 'Foliage tint', min: -1, max: 1, step: 0.1, words: ['cool', 'warm'] }
];

export const DEFAULT_CUSTOM = SLIDERS.reduce((c, s) => {
    c[s.key] = s.key === 'tint' ? 0 : 1;
    return c;
}, {});

/** Plain words for a slider position, for aria-valuetext. Colour and number
 *  are never the only carrier of what a control is set to. */
export function sliderWords(key, value) {
    const s = SLIDERS.find((x) => x.key === key);
    if (!s) return '';
    const t = (value - s.min) / (s.max - s.min);
    if (t < 0.2) return `very ${s.words[0]}`;
    if (t < 0.4) return s.words[0];
    if (t <= 0.6) return 'as usual';
    if (t <= 0.8) return s.words[1];
    return `very ${s.words[1]}`;
}

/** Hold a customisation object inside the slider ranges, filling in anything
 *  missing. Also the validation gate for a garden coming back out of storage. */
export function clampCustom(custom) {
    const out = {};
    for (const s of SLIDERS) {
        const raw = custom && typeof custom[s.key] === 'number' && Number.isFinite(custom[s.key])
            ? custom[s.key]
            : DEFAULT_CUSTOM[s.key];
        out[s.key] = Math.min(s.max, Math.max(s.min, raw));
    }
    return out;
}

/**
 * Fold a species and a set of slider values into one complete parameter set
 * for the generator.
 *
 * DENSITY MOVES RECURSION DEPTH IN WHOLE STEPS, because it cannot do anything
 * else: a tree with 6.4 levels of branching is not a thing. It is rounded here
 * rather than in the generator so that the parameter set is the single honest
 * description of the tree, and so two trees that round to the same depth are
 * genuinely the same tree.
 */
export function resolveSpecies(id, custom = DEFAULT_CUSTOM) {
    const species = speciesById(id);
    if (!species) return null;
    const c = clampCustom(custom);
    const p = species.params;

    return {
        id: species.id,
        name: species.name,
        evergreen: species.evergreen,
        conical: !!species.conical,
        tremble: species.tremble || 0,
        blossom: species.blossom || 0,
        bark: species.bark,
        foliage: species.foliage,

        matureHeight: species.matureHeight * c.height,
        depth: Math.max(4, Math.min(9, Math.round(p.depth + (c.density - 1) * 4))),
        branches: p.branches,
        thirdChance: Math.min(0.85, p.thirdChance * c.density),
        lengthRatio: Math.min(0.86, p.lengthRatio),
        radiusRatio: Math.min(0.82, p.radiusRatio * (0.94 + c.trunk * 0.06)),
        divergence: p.divergence * c.spread,
        gravitropism: p.gravitropism,
        taper: p.taper,
        jitter: p.jitter,
        trunkScale: c.trunk,
        leafSize: p.leafSize * c.leaf,
        leafDensity: p.leafDensity * c.density,
        tint: c.tint
    };
}

/** Warm or cool a foliage colour by the tint slider. Kept here rather than in
 *  the shader so the modal's preview swatch and the tree itself can never
 *  disagree about what "warm" looks like. */
export function tintColor(hex, tint) {
    const t = Math.max(-1, Math.min(1, tint || 0));
    let r = (hex >> 16) & 0xff;
    let g = (hex >> 8) & 0xff;
    let b = hex & 0xff;
    // Warm lifts red and drops blue; cool does the reverse. Green is the
    // anchor, because moving it turns a leaf into a different plant.
    r = Math.max(0, Math.min(255, Math.round(r * (1 + t * 0.26))));
    b = Math.max(0, Math.min(255, Math.round(b * (1 - t * 0.30))));
    return (r << 16) | (g << 8) | b;
}
