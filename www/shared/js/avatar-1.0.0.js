// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar.js - the visitor's own figure, site-wide (specs/avatar PLANNING 2.1):
 * made once at /avatar/, kept in this browser, and worn by every scene that
 * shows the visitor as a person.
 *
 * PURE, AND NO THREE. This is the only avatar code the home page loads (its
 * corner chip), so it must stay small and must never need a renderer. The
 * figure itself is avatar-figure-1.0.0.js.
 *
 * EVERY VALUE IS ONE OF A KNOWN LIST. There are no free colors and no free
 * text (PRD section 5), so an avatar from anywhere (a link, a file, storage
 * somebody edited by hand) is made valid field by field: a field that names a
 * real option is kept, anything else becomes the default's. `normalizeAvatar`
 * takes anything at all and always returns a real figure.
 *
 * TODAY'S LISTS COME FROM cast-1.0.0 (frozen, Leaf Blower and Derby Day run
 * on it): the shirts, pants, skin tones, hair colors and hair lengths. The
 * rest are new here. The default is Leaf Blower's shipped figure, so a visitor
 * who never makes an avatar sees no change in any scene.
 *
 * THE STORE writes three localStorage keys (PLANNING 3.1), each call wrapped
 * so a browser that refuses storage simply gets the default every visit. It
 * calls `localStorage` by name, as cast-1.0.0 does, because
 * tests/privacy.test.mjs finds the site's storage writers by that name.
 * www/privacy.html says what is kept.
 *
 * NOTHING HERE TOUCHES THE NETWORK. The link keeps the avatar after the `#`,
 * which a browser never sends to the server.
 */

import { SHIRTS, PANTS, SKINS, HAIR_COLORS as CAST_HAIR, HAIR_LENGTHS as CAST_STYLES, optionOf, normalizeChoice } from './cast-1.0.0.min.js';

export { SHIRTS, PANTS, SKINS, optionOf };

/**
 * Hair styles (the field keeps its first name, `length`, so links made
 * before still read): cast-1.0.0's four first (none, buzzed, short, long),
 * then the styles Steve asked for on 2026-10-24, drawn by avatar-hair.
 * Named by style, never by who wears them.
 */
export const HAIR_LENGTHS = Object.freeze([
    ...CAST_STYLES,
    { id: 'quiff', label: 'Quiff' },
    { id: 'spiky', label: 'Spiky' },
    { id: 'curly', label: 'Curly' },
    { id: 'afro', label: 'Afro' },
    { id: 'mohawk', label: 'Mohawk' },
    { id: 'mullet', label: 'Mullet' },
    { id: 'bob', label: 'Bob' },
    { id: 'ponytail', label: 'Ponytail' },
    { id: 'pigtails', label: 'Pigtails' },
    { id: 'topKnot', label: 'Top knot' },
    { id: 'lowBun', label: 'Low bun' },
    { id: 'spaceBuns', label: 'Space buns' },
    { id: 'braids', label: 'Braids' },
    { id: 'locs', label: 'Locs' },
    { id: 'cornrows', label: 'Cornrows' }
]);

/**
 * Hair colors (Steve's QA, 2026-10-24: more of them): cast-1.0.0's six
 * first, so every id a choice or a link already holds still reads, then
 * more natural shades, then the fun ones. Any color at all is a custom one
 * (`CUSTOM_COLOR`).
 */
export const HAIR_COLORS = Object.freeze([
    ...CAST_HAIR,
    { id: 'lightBrown', label: 'Light brown', color: 0x9a7350 },
    { id: 'honey', label: 'Honey blond', color: 0xc4914a },
    { id: 'strawberry', label: 'Strawberry blond', color: 0xd08a5c },
    { id: 'platinum', label: 'Platinum', color: 0xe9e2cf },
    { id: 'copper', label: 'Copper', color: 0xb3542a },
    { id: 'silver', label: 'Silver', color: 0xc8cacd },
    { id: 'white', label: 'White', color: 0xf0efea },
    { id: 'pink', label: 'Pink', color: 0xe48fb8 },
    { id: 'purple', label: 'Purple', color: 0x7b4fb5 },
    { id: 'blue', label: 'Blue', color: 0x3d6fd6 },
    { id: 'teal', label: 'Teal', color: 0x2aa7a3 },
    { id: 'green', label: 'Green', color: 0x4f9e4b },
    { id: 'fireRed', label: 'Fire red', color: 0xc3242c }
]);

/**
 * ANY COLOR, chosen with the browser's own picker (Steve, 2026-10-24),
 * kept as `x` and six hex digits ("x9c2b25"). Letters and digits only, so
 * it travels in a link between dots like any other id, and nothing else of
 * any shape is ever accepted.
 */
export const CUSTOM_COLOR = /^x[0-9a-f]{6}$/;

/** The fields that take a custom color as well as their swatches. */
export const COLOR_FIELDS = Object.freeze(['skin', 'eyes', 'hair', 'shirt', 'bottomColor', 'shoeColor', 'hatColor', 'lips', 'facialColor']);

/** A custom color's id for a display hex (0x9c2b25 is "x9c2b25"). */
export function customColor(hex) {
    return `x${(Number(hex) >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** The avatar's own schema, stored as `v`. */
export const AVATAR_VERSION = 1;

/** Eye colors, for the rig's `eyeColor` (its iris and pupil). Display
 *  (sRGB) values. Dark brown is the color every figure has always had. */
export const EYES = Object.freeze([
    { id: 'darkBrown', label: 'Dark brown', color: 0x2c1810 },
    { id: 'brown', label: 'Brown', color: 0x5a3820 },
    { id: 'hazel', label: 'Hazel', color: 0x7a6230 },
    { id: 'green', label: 'Green', color: 0x3f7046 },
    { id: 'blue', label: 'Blue', color: 0x3c6e9e },
    { id: 'gray', label: 'Gray', color: 0x6e787f }
]);

/** Facial hair, drawn in the hair's color by avatar-figure. */
export const FACIAL = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'stubble', label: 'Stubble' },
    { id: 'mustache', label: 'Mustache' },
    { id: 'goatee', label: 'Goatee' },
    { id: 'beard', label: 'Full beard' }
]);

export const GLASSES = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'round', label: 'Round' },
    { id: 'square', label: 'Square' },
    { id: 'sunglasses', label: 'Sunglasses' },
    { id: 'roundSun', label: 'Round sunglasses' }
]);

/** The mouth (Steve's QA, 2026-10-24: expressions, lip colors, teeth). All
 *  of them friendly: the figure has no eyebrows, so the mouth is the whole
 *  expression, and nobody's avatar should frown at them. */
export const MOUTHS = Object.freeze([
    { id: 'smile', label: 'Gentle smile' },
    { id: 'bigSmile', label: 'Big smile' },
    { id: 'grin', label: 'Grin' },
    { id: 'smirk', label: 'Smirk' },
    { id: 'surprised', label: 'Surprised' }
]);

/** Lip colors. Natural is a rose of the skin's own tone (avatar-figure's
 *  `lipsColor`), so it has no color of its own, only a `swatch` for the
 *  editor to show. */
export const LIP_COLORS = Object.freeze([
    { id: 'natural', label: 'Natural', color: null, swatch: 0xbe7d6f },
    { id: 'rose', label: 'Rose', color: 0xb4566a },
    { id: 'red', label: 'Red', color: 0xa81f2d },
    { id: 'berry', label: 'Berry', color: 0x74213f },
    { id: 'softPink', label: 'Soft pink', color: 0xd88c96 }
]);

/** Facial hair's color: the hair's own unless another is chosen (Steve,
 *  2026-10-24: a beard need not match the hair on top). */
export const FACIAL_COLORS = Object.freeze([
    { id: 'match', label: 'Same as hair', color: null, swatch: 0x8a7a6a },
    ...HAIR_COLORS
]);

/** The face (Steve's QA, 2026-10-24): its shape, the eyes' shape, the
 *  eyebrows, the nose, and the cheeks. Drawn by avatar-figure. */
export const FACE_SHAPES = Object.freeze([
    { id: 'round', label: 'Round' },
    { id: 'oval', label: 'Oval' }
]);

export const EYE_SHAPES = Object.freeze([
    { id: 'round', label: 'Round' },
    { id: 'almond', label: 'Almond' },
    { id: 'wide', label: 'Wide' },
    { id: 'sleepy', label: 'Sleepy' },
    { id: 'lashes', label: 'Lashes' }
]);

export const BROWS = Object.freeze([
    { id: 'natural', label: 'Natural' },
    { id: 'straight', label: 'Straight' },
    { id: 'arched', label: 'Arched' },
    { id: 'bold', label: 'Bold' },
    { id: 'thin', label: 'Thin' }
]);

/** Pointed is the rig's own nose, which every figure has always had. */
export const NOSES = Object.freeze([
    { id: 'pointed', label: 'Pointed' },
    { id: 'button', label: 'Button' },
    { id: 'round', label: 'Round' },
    { id: 'wide', label: 'Wide' }
]);

export const CHEEKS = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'blush', label: 'Blush' },
    { id: 'freckles', label: 'Freckles' }
]);

/** How strong the arms are (Steve, 2026-10-24: "so guys can make their
 *  avatars look buff"). Athletic thickens the arms; Buff is the rig's own
 *  `muscular` build: a broader chest, bigger arms, thicker legs. `feet` is
 *  the rig's `footScale`, so the shoes keep up with the legs above them
 *  (Steve's QA, 2026-10-24: they looked too small on a buff figure). */
export const MUSCLES = Object.freeze([
    { id: 'standard', label: 'Standard', feet: 1 },
    { id: 'athletic', label: 'Athletic', feet: 1.08 },
    { id: 'buff', label: 'Buff', feet: 1.2 }
]);

/**
 * The builds (Steve, 2026-10-22: neutral names), made from the rig's own
 * numbers (people-1.0.0's `hips`, `waist`, `slender`, `shoulderRound`).
 * Straight is Leaf Blower's operator exactly. Curvy is Maya's build from
 * www/whitestone. Starting values for QA (PLANNING 3.2).
 */
export const BUILDS = Object.freeze([
    { id: 'straight', label: 'Straight', hips: 0, waist: 0, slender: 0, shoulderRound: 0.4 },
    { id: 'slim', label: 'Slim', hips: 0, waist: 0.1, slender: 1, shoulderRound: 0.45 },
    { id: 'curvy', label: 'Curvy', hips: 1, waist: 0.2, slender: 1, shoulderRound: 0.45 }
]);

/** The shirt's style, by its sleeves (the field keeps its first name,
 *  `sleeves`, so links made before the tank top still read). */
export const SLEEVES = Object.freeze([
    { id: 'long', label: 'Long sleeves' },
    { id: 'short', label: 'Short sleeves' },
    { id: 'tank', label: 'Tank top' }
]);

export const BOTTOMS = Object.freeze([
    { id: 'pants', label: 'Pants' },
    { id: 'skirt', label: 'Skirt' },
    { id: 'shorts', label: 'Shorts' }
]);

/** The shoes, and the rig's `shoeStyle` each starts from. Sneakers are
 *  drawn by avatar-figure over the rig's block. */
/** The shoes, and the rig's `shoeStyle` each starts from. Sneakers and the
 *  boots are drawn by avatar-figure over the rig's block, the tall boots
 *  and the cowboy boots over the trouser leg (Steve, 2026-10-24). Named by
 *  style, never by who wears them. */
export const SHOES = Object.freeze([
    { id: 'classic', label: 'Classic', style: 'block' },
    { id: 'sneakers', label: 'Sneakers', style: 'block' },
    { id: 'maryJane', label: 'Mary janes', style: 'maryJane' },
    { id: 'ankleBoots', label: 'Ankle boots', style: 'block' },
    { id: 'workBoots', label: 'Work boots', style: 'block' },
    { id: 'cowboyBoots', label: 'Cowboy boots', style: 'block' },
    { id: 'tallBoots', label: 'Tall boots', style: 'block' }
]);

/** Black is the color every figure has always worn. */
export const SHOE_COLORS = Object.freeze([
    { id: 'black', label: 'Black', color: 0x1a1a1a },
    { id: 'brown', label: 'Brown', color: 0x5a3a24 },
    { id: 'white', label: 'White', color: 0xeeede8 },
    { id: 'navy', label: 'Navy', color: 0x2a3a56 },
    { id: 'red', label: 'Red', color: 0x9c2b25 }
]);

export const HATS = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'cap', label: 'Ball cap' },
    { id: 'beanie', label: 'Beanie' },
    { id: 'sunHat', label: 'Sun hat' },
    // Appended 2026-10-24 (Steve's QA).
    { id: 'trucker', label: 'Trucker hat' },
    { id: 'ivyCap', label: 'Ivy cap' },
    { id: 'beret', label: 'Beret' },
    { id: 'fedora', label: 'Fedora' },
    { id: 'cowboy', label: 'Cowboy hat' },
    { id: 'topHat', label: 'Top hat' },
    { id: 'fez', label: 'Fez' },
    { id: 'chef', label: "Chef's hat" },
    { id: 'hardHat', label: 'Hard hat' },
    { id: 'birthday', label: 'Birthday hat' }
]);

/**
 * Every field and its list, IN THE LINK'S ORDER. The link (`encodeLink`)
 * writes the ids in this order, so a link made today must still read the same
 * tomorrow: a new field is only ever APPENDED, never inserted, and none is
 * ever removed. Hat colors are the shirt colors, and the bottom's colors are
 * the pants colors (PRD section 5).
 */
export const FIELDS = Object.freeze([
    Object.freeze(['skin', SKINS]),
    Object.freeze(['eyes', EYES]),
    Object.freeze(['hair', HAIR_COLORS]),
    Object.freeze(['length', HAIR_LENGTHS]),
    Object.freeze(['facial', FACIAL]),
    Object.freeze(['glasses', GLASSES]),
    Object.freeze(['build', BUILDS]),
    Object.freeze(['shirt', SHIRTS]),
    Object.freeze(['sleeves', SLEEVES]),
    Object.freeze(['bottom', BOTTOMS]),
    Object.freeze(['bottomColor', PANTS]),
    Object.freeze(['shoes', SHOES]),
    Object.freeze(['shoeColor', SHOE_COLORS]),
    Object.freeze(['hat', HATS]),
    Object.freeze(['hatColor', SHIRTS]),
    // Appended 2026-10-24 (links made before read them as the defaults).
    Object.freeze(['mouth', MOUTHS]),
    Object.freeze(['lips', LIP_COLORS]),
    Object.freeze(['muscles', MUSCLES]),
    // Appended 2026-10-24, the face (Steve's QA).
    Object.freeze(['facialColor', FACIAL_COLORS]),
    Object.freeze(['brows', BROWS]),
    Object.freeze(['eyeShape', EYE_SHAPES]),
    Object.freeze(['nose', NOSES]),
    Object.freeze(['faceShape', FACE_SHAPES]),
    Object.freeze(['cheeks', CHEEKS])
]);

/** The list a field's ids come from, or null for a field that is not one. */
export function listOf(field) {
    const entry = FIELDS.find(([key]) => key === field);
    return entry ? entry[1] : null;
}

/** Leaf Blower's shipped figure: a rust red shirt with long sleeves, navy
 *  pants, fair skin, dark brown short hair, and nothing new. */
export const DEFAULT_AVATAR = Object.freeze({
    v: AVATAR_VERSION,
    skin: 'fair',
    eyes: 'darkBrown',
    hair: 'darkBrown',
    length: 'short',
    facial: 'none',
    glasses: 'none',
    build: 'straight',
    shirt: 'rust',
    sleeves: 'long',
    bottom: 'pants',
    bottomColor: 'navy',
    shoes: 'classic',
    shoeColor: 'black',
    hat: 'none',
    hatColor: 'navy',
    mouth: 'smile',
    lips: 'natural',
    muscles: 'standard',
    facialColor: 'match',
    brows: 'natural',
    eyeShape: 'round',
    nose: 'pointed',
    faceShape: 'round',
    cheeks: 'none'
});

const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);

/** How many of `raw`'s fields name a real option (0 for anything that is
 *  not an object). */
/** Whether `value` is one `key` takes: an id of its list, or (for a color
 *  field) a custom color. */
function valid(key, list, value) {
    if (typeof value !== 'string') return false;
    if (optionOf(list, value)) return true;
    return COLOR_FIELDS.includes(key) && CUSTOM_COLOR.test(value);
}

function validCount(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
    let n = 0;
    for (const [key, list] of FIELDS) {
        if (own(raw, key) && valid(key, list, raw[key])) n++;
    }
    return n;
}

/**
 * An avatar made valid: each field kept if it is the avatar's OWN property
 * and names a real option of its list, the default's otherwise. Takes
 * anything (null, a string, an array, a stale or hostile object) and always
 * returns a new, complete avatar. Keys inherited through a prototype are
 * never read, so `{"__proto__": {...}}` from a file changes nothing.
 */
export function normalizeAvatar(raw) {
    const out = { v: AVATAR_VERSION };
    try {
        const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        for (const [key, list] of FIELDS) {
            const value = own(r, key) ? r[key] : undefined;
            out[key] = valid(key, list, value) ? value : DEFAULT_AVATAR[key];
        }
    } catch (e) {
        return { ...DEFAULT_AVATAR };
    }
    return out;
}

/** Whether two avatars are the same figure, field by field. */
export function sameAvatar(a, b) {
    const x = normalizeAvatar(a);
    const y = normalizeAvatar(b);
    return FIELDS.every(([key]) => x[key] === y[key]);
}

/**
 * An avatar with a scene's `overrides` laid over it, made valid: Leaf
 * Blower's `{ sleeves: 'long' }`, X's and O's `{ hat: 'none' }`. Only real
 * fields with real options take effect.
 */
export function withOverrides(avatar, overrides = {}) {
    const base = normalizeAvatar(avatar);
    const o = overrides && typeof overrides === 'object' ? overrides : {};
    for (const [key, list] of FIELDS) {
        if (own(o, key) && valid(key, list, o[key])) base[key] = o[key];
    }
    return base;
}

/**
 * The avatar a cast-1.0.0 choice describes (Leaf Blower's stored character,
 * Derby Day's family): its skin, hair, shirt and pants, with long sleeves
 * and everything new at the default. Built through personConfig, it is
 * exactly the figure the choice built.
 */
export function fromCastChoice(choice) {
    const c = normalizeChoice(choice);
    return normalizeAvatar({
        ...DEFAULT_AVATAR,
        skin: c.skin,
        hair: c.hair,
        length: c.length,
        shirt: c.shirt,
        bottomColor: c.pants
    });
}

/**
 * The createPerson() settings for an avatar, with `overrides` (avatar fields)
 * laid over it first. The pieces the rig cannot draw (facial hair, glasses,
 * a hat, sneakers, the smile) are avatar-figure's, read from the avatar
 * itself. A scene adds its own role and position over the result.
 *
 * Long sleeves are the shirt's color to the wrist, short ones leave the
 * forearm bare (the rig's own default).
 */
/**
 * A color field's color (display hex): its swatch's, or a custom color's
 * own. Null for a field with no color of its own (natural lips, facial hair
 * the same as the hair), or for a field that is not a color.
 */
export function colorOf(field, value) {
    if (typeof value === 'string' && CUSTOM_COLOR.test(value) && COLOR_FIELDS.includes(field)) return parseInt(value.slice(1), 16);
    const option = optionOf(listOf(field) || [], value);
    return option && typeof option.color === 'number' ? option.color : null;
}

export function personConfig(avatar, overrides = {}) {
    const a = withOverrides(avatar, overrides);
    const shirt = colorOf('shirt', a.shirt);
    const build = optionOf(BUILDS, a.build);
    return {
        shirtColor: shirt,
        sleeveColor: a.sleeves === 'long' ? shirt : null,
        pantsColor: colorOf('bottomColor', a.bottomColor),
        hasSkirt: a.bottom === 'skirt',
        muscular: a.muscles === 'buff',
        footScale: optionOf(MUSCLES, a.muscles).feet,
        skinTone: colorOf('skin', a.skin),
        hairColor: colorOf('hair', a.hair),
        hairStyle: a.length === 'bald' ? 'short' : a.length,
        bald: a.length === 'bald',
        eyeColor: colorOf('eyes', a.eyes),
        shoulderRound: build.shoulderRound,
        hips: build.hips,
        waist: build.waist,
        slender: build.slender,
        shoeColor: colorOf('shoeColor', a.shoeColor),
        shoeStyle: optionOf(SHOES, a.shoes).style
    };
}

/**
 * The figure in one sentence, for a screen reader: "A figure with fair skin,
 * dark brown eyes, a gentle smile and short dark brown hair, a straight
 * build, a rust red shirt with long sleeves, navy pants, and classic black
 * shoes." Every word
 * comes from the lists, so it is always one of a known set of sentences.
 */
export function describeAvatar(avatar) {
    const a = normalizeAvatar(avatar);
    // A custom color is said as "custom-color": the words never carry a hex.
    const word = (list, id) => (CUSTOM_COLOR.test(id) ? 'custom-color' : optionOf(list, id).label.toLowerCase());
    const name = (list, id) => (CUSTOM_COLOR.test(id) ? 'custom-color' : optionOf(list, id).name);
    const hairColor = word(HAIR_COLORS, a.hair);
    const an = (w) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
    const HAIR_WORDS = {
        bald: () => 'no hair',
        buzz: (c) => `buzzed ${c} hair`,
        spiky: (c) => `spiky ${c} hair`,
        curly: (c) => `curly ${c} hair`,
        afro: (c) => an(`${c} afro`),
        mohawk: (c) => an(`${c} mohawk`),
        mullet: (c) => an(`${c} mullet`),
        bob: (c) => an(`${c} bob`),
        quiff: (c) => `${c} hair in a quiff`,
        ponytail: (c) => `${c} hair in a ponytail`,
        topKnot: (c) => `${c} hair in a top knot`,
        lowBun: (c) => `${c} hair in a low bun`,
        spaceBuns: (c) => `${c} hair in space buns`,
        pigtails: (c) => `${c} pigtails`,
        braids: (c) => `${c} braids`,
        locs: (c) => `${c} locs`,
        cornrows: (c) => `${c} cornrows`
    };
    const hair = (HAIR_WORDS[a.length] || ((c) => `${word(HAIR_LENGTHS, a.length)} ${c} hair`))(hairColor);
    const lips = a.lips === 'natural' ? '' : ` and ${word(LIP_COLORS, a.lips)} lips`;
    const shape = { round: '', lashes: '' }[a.eyeShape] ?? `${word(EYE_SHAPES, a.eyeShape)} `;
    const face = [
        `${word(SKINS, a.skin)} skin${a.faceShape === 'oval' ? ', an oval face' : ''}`,
        `${shape}${word(EYES, a.eyes)} eyes${a.eyeShape === 'lashes' ? ' with long lashes' : ''}`,
        `a ${word(MOUTHS, a.mouth)}${lips}`
    ];
    if (a.cheeks === 'freckles') face.push('freckles');
    if (a.cheeks === 'blush') face.push('rosy cheeks');
    const extras = [];
    const beardColor = a.facialColor === 'match' ? '' : `${word(FACIAL_COLORS, a.facialColor)} `;
    if (a.facial !== 'none') extras.push(`${a.facial === 'stubble' ? '' : 'a '}${beardColor}${word(FACIAL, a.facial)}`);
    if (a.glasses === 'sunglasses' || a.glasses === 'roundSun') extras.push(word(GLASSES, a.glasses));
    else if (a.glasses !== 'none') extras.push(`${word(GLASSES, a.glasses)} glasses`);
    const shoeColor = word(SHOE_COLORS, a.shoeColor);
    const shoes = a.shoes === 'classic' ? `classic ${shoeColor} shoes` : `${shoeColor} ${word(SHOES, a.shoes)}`;
    const muscles = a.muscles === 'standard' ? '' : `${word(MUSCLES, a.muscles)}, `;
    const shirt = name(SHIRTS, a.shirt);
    const clothes = [
        `a ${muscles}${word(BUILDS, a.build)} build`,
        a.sleeves === 'tank' ? `a ${shirt} tank top` : `a ${shirt} shirt with ${a.sleeves} sleeves`,
        `${a.bottom === 'skirt' ? 'a ' : ''}${name(PANTS, a.bottomColor)} ${a.bottom}`,
        shoes
    ];
    if (a.hat !== 'none') clothes.push(`a ${name(SHIRTS, a.hatColor)} ${word(HATS, a.hat)}`);
    const head = [...face, hair, ...extras];
    const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]);
    return `A figure with ${list(head)}, ${clothes.slice(0, -1).join(', ')}, and ${clothes[clothes.length - 1]}.`;
}

// ---- The link -----------------------------------------------------------------

/** The link's own version, its first part. */
export const LINK_VERSION = 1;

/** The longest fragment `decodeLink` reads. Today's link is about a hundred
 *  characters, so this is room for every field to grow. */
export const MAX_LINK = 512;

/**
 * The avatar as a fragment, without the `#`: `a=1.fair.darkBrown...`, each
 * field's id in FIELDS order after the version. Readable, no base64, and
 * after the `#` it never reaches the server or its logs.
 */
export function encodeLink(avatar) {
    const a = normalizeAvatar(avatar);
    return `a=${LINK_VERSION}.${FIELDS.map(([key]) => a[key]).join('.')}`;
}

/** The whole address of the avatar page carrying `avatar`, for `origin`
 *  (`https://www.scenexp.com`). */
export function linkUrl(avatar, origin) {
    return `${String(origin || '').replace(/\/+$/, '')}/avatar/#${encodeLink(avatar)}`;
}

/**
 * The avatar a fragment carries (`#a=1....`, with or without the `#`, among
 * other `&` parts), or null when there is none, it is too long, its version
 * is not one this reads, or not one of its parts names a real option. A part
 * missing or unknown becomes the default's.
 */
export function decodeLink(hash) {
    if (typeof hash !== 'string' || hash.length > MAX_LINK) return null;
    const part = hash.replace(/^#/, '').split('&').find((p) => p.startsWith('a='));
    if (!part) return null;
    const ids = part.slice(2).split('.');
    if (ids[0] !== String(LINK_VERSION)) return null;
    const raw = {};
    FIELDS.forEach(([key], i) => {
        if (ids[i + 1] !== undefined) raw[key] = ids[i + 1];
    });
    return validCount(raw) > 0 ? normalizeAvatar(raw) : null;
}

// ---- The file -----------------------------------------------------------------

/** What the saved file is called. */
export const FILE_NAME = 'scenexp-avatar.json';

/** The most of a file `fromFile` reads, in characters. A real one is about
 *  four hundred. */
export const MAX_FILE = 4096;

/** The avatar as the file's text: `{ "scenexp": "avatar", "v": 1,
 *  "avatar": {...} }`. The portrait is never in it (it is rendered again on
 *  the device that opens it). */
export function toFile(avatar) {
    const a = normalizeAvatar(avatar);
    const fields = {};
    for (const [key] of FIELDS) fields[key] = a[key];
    return `${JSON.stringify({ scenexp: 'avatar', v: AVATAR_VERSION, avatar: fields }, null, 2)}\n`;
}

/**
 * The avatar a file's text holds, or null: more than MAX_FILE characters,
 * not JSON, not marked as a SceneXP avatar, a version this does not read, or
 * no avatar inside. What is inside is made valid by normalizeAvatar.
 */
export function fromFile(text) {
    if (typeof text !== 'string' || text.length > MAX_FILE) return null;
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.scenexp !== 'avatar' || data.v !== AVATAR_VERSION) return null;
    const inner = data.avatar;
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return null;
    return normalizeAvatar(inner);
}

// ---- The store ----------------------------------------------------------------

/** The three keys (PLANNING 3.1). `avatar` existing is what "saved" means,
 *  whatever it holds. */
export const STORAGE_KEYS = Object.freeze({
    avatar: 'scenexp-avatar',
    portrait: 'scenexp-avatar-portrait',
    chip: 'scenexp-avatar-chip'
});

/** The most of a stored avatar that is read, in characters. */
const MAX_STORED = 4096;

/** The longest portrait kept or read, in characters: a 160 px PNG is about
 *  thirty thousand. */
export const MAX_PORTRAIT = 150000;

/** A portrait is a PNG or JPEG data URL and nothing else. */
const PORTRAIT_SRC = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Whether `src` is a portrait this site would show. */
export function validPortraitSrc(src) {
    return typeof src === 'string' && src.length <= MAX_PORTRAIT && PORTRAIT_SRC.test(src);
}

/** The home visits the "Make your avatar" label is shown for. */
export const CHIP_LABEL_VISITS = 3;

/** Whether the chip's label shows: never once there is a saved avatar or
 *  the visitor has dismissed it, and only for the first few home visits
 *  (`seen` counts this one). */
export function chipLabelShown({ saved = false, seen = 0, dismissed = false } = {}) {
    return !saved && !dismissed && seen <= CHIP_LABEL_VISITS;
}

/** The label's rule made valid: `seen` a whole number 0 to 99. */
function normalizeChip(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const seen = Number.isInteger(r.seen) ? Math.max(0, Math.min(99, r.seen)) : 0;
    return { seen, dismissed: r.dismissed === true };
}

/** JSON of `text`, or null: empty, longer than `max`, or not JSON. */
function parseCapped(text, max) {
    if (typeof text !== 'string' || text.length > max) return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

/** localStorage, or null where the browser refuses it (reading the global
 *  itself throws in some browsers with site data blocked). */
function storage() {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch (e) {
        return null;
    }
}

function read(key) {
    try {
        const s = storage();
        return s ? s.getItem(key) : null;
    } catch (e) {
        return null;
    }
}

/**
 * The avatar kept in this browser. Every call survives a browser that
 * refuses storage: `load` gives the default, `hasSaved` false, the writes
 * return false. `win` is the window whose `storage` events `onChange`
 * listens to (another tab saving or forgetting).
 */
export function createAvatarStore({ win = typeof window === 'undefined' ? null : window } = {}) {
    const K = STORAGE_KEYS;
    const write = (key, value) => {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    };
    const remove = (key) => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    };
    const store = {
        keys: K,
        /** Whether the visitor has saved one: the key exists, whatever it
         *  holds (a save of exactly the default still counts). */
        hasSaved() {
            return read(K.avatar) !== null;
        },
        /** The saved avatar, or the default where there is none. */
        load() {
            return normalizeAvatar(parseCapped(read(K.avatar), MAX_STORED));
        },
        save(avatar) {
            return write(K.avatar, JSON.stringify(normalizeAvatar(avatar)));
        },
        /** "Forget my avatar": the avatar and its portrait both go. The
         *  label's rule stays, so a dismissed label stays dismissed. */
        forget() {
            const a = remove(K.avatar);
            const b = remove(K.portrait);
            return a && b;
        },
        /** The stored portrait `{ r, src }` (`r` the render version it was
         *  drawn with), or null when there is none or it is not a portrait. */
        loadPortrait() {
            const p = parseCapped(read(K.portrait), MAX_PORTRAIT + 64);
            if (!p || typeof p !== 'object' || !Number.isInteger(p.r) || !validPortraitSrc(p.src)) return null;
            return { r: p.r, src: p.src };
        },
        savePortrait(src, r) {
            if (!validPortraitSrc(src) || !Number.isInteger(r)) return false;
            return write(K.portrait, JSON.stringify({ r, src }));
        },
        /** The chip label's rule, `{ seen, dismissed }`. */
        chip() {
            return normalizeChip(parseCapped(read(K.chip), 256));
        },
        /** Count a home visit, and give the rule after it. */
        noteVisit() {
            const c = store.chip();
            const next = { seen: Math.min(99, c.seen + 1), dismissed: c.dismissed };
            write(K.chip, JSON.stringify(next));
            return next;
        },
        /** The visitor folded the label away. */
        dismissLabel() {
            const c = store.chip();
            return write(K.chip, JSON.stringify({ seen: c.seen, dismissed: true }));
        },
        /**
         * Call `fn(key)` when another tab changes the avatar or its portrait
         * (or clears the site's storage, key null). Returns a remover.
         */
        onChange(fn) {
            if (!win || typeof win.addEventListener !== 'function' || typeof fn !== 'function') return () => {};
            const handler = (e) => {
                const key = e ? e.key : null;
                if (key === null || key === K.avatar || key === K.portrait) fn(key);
            };
            win.addEventListener('storage', handler);
            return () => win.removeEventListener('storage', handler);
        }
    };
    return store;
}

// ---- The chip -----------------------------------------------------------------

/**
 * The corner chip (PRD section 7): a round portrait that links to /avatar/.
 * `els` are its parts, found by the page: `img`, `label` (the "Make your
 * avatar" words), `hide` (the label's dismiss button) and `link`.
 *
 * Shows the saved portrait where there is one, and leaves the markup's
 * default picture otherwise. Counts this visit and shows or folds the label
 * by `chipLabelShown`. The picture's alt text carries the link's name only
 * when the label does not (the label's words would otherwise be read twice).
 * Another tab saving or forgetting updates it in place.
 *
 * Returns `{ saved, labelShown, refresh, dispose }`, or null without an
 * image to show.
 */
export function installChip(els, { store = createAvatarStore(), defaultSrc = '' } = {}) {
    const { img, label, hide, link } = els || {};
    if (!img) return null;
    let labelShown = false;
    let saved = false;

    function setLabel(on) {
        labelShown = Boolean(on);
        if (label) label.hidden = !labelShown;
        if (hide) hide.hidden = !labelShown;
        img.alt = labelShown ? '' : (saved ? 'Your avatar' : 'Make your avatar');
    }

    function refresh() {
        saved = store.hasSaved();
        const portrait = saved ? store.loadPortrait() : null;
        if (portrait) img.src = portrait.src;
        else if (defaultSrc) img.src = defaultSrc;
        if (saved) setLabel(false);
        else setLabel(labelShown);
    }

    saved = store.hasSaved();
    const rule = store.noteVisit();
    labelShown = chipLabelShown({ saved, ...rule });
    refresh();

    const onHide = () => {
        store.dismissLabel();
        setLabel(false);
        if (link && typeof link.focus === 'function') link.focus();
    };
    if (hide && typeof hide.addEventListener === 'function') hide.addEventListener('click', onHide);
    const stop = store.onChange(() => refresh());

    return {
        get saved() {
            return saved;
        },
        get labelShown() {
            return labelShown;
        },
        refresh,
        dispose() {
            stop();
            if (hide && typeof hide.removeEventListener === 'function') hide.removeEventListener('click', onHide);
        }
    };
}
