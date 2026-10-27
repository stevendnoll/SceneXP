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
 * takes anything at all and always returns a real figure. The two shapes
 * since: any color as six hex digits (`CUSTOM_COLOR`), and a jersey number
 * as one of a list of a hundred and two (JERSEY_NUMBERS).
 *
 * TODAY'S LISTS COME FROM cast-1.0.0 (frozen, Leaf Blower and Derby Day run
 * on it): the shirts, pants, skin tones, hair colors and hair lengths. The
 * rest are new here. The default is Leaf Blower's shipped figure, so a visitor
 * who never makes an avatar sees no change in any scene, with one deliberate
 * exception since 2026-10-26: the standard hand is bigger than the rig's
 * (HAND_SIZES), because the rig's was about half a real hand.
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
    // The rig's long hair has bangs baked in, so it says so now that there
    // are long styles without them (Steve's QA, 2026-10-25). Same id.
    ...CAST_STYLES.map((o) => (o.id === 'long' ? { ...o, label: 'Long with bangs' } : o)),
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
    { id: 'cornrows', label: 'Cornrows' },
    // Parted (Steve's QA round 5, 2026-10-24): the wearer's left or right.
    { id: 'leftPart', label: 'Left part' },
    { id: 'rightPart', label: 'Right part' },
    { id: 'centerPart', label: 'Center part' },
    // Long without bangs (Steve's QA, 2026-10-25: "some men have long hair
    // parted in the center with no bangs"): parted, or swept back.
    { id: 'longCenter', label: 'Long, center part' },
    { id: 'longSide', label: 'Long, side part' },
    { id: 'longBack', label: 'Long, swept back' }
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
export const COLOR_FIELDS = Object.freeze(['skin', 'eyes', 'hair', 'shirt', 'bottomColor', 'shoeColor', 'hatColor', 'lips', 'facialColor', 'frameColor', 'lensColor', 'numberColor', 'legwearColor', 'armwearColor']);

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

/** Glasses. The `sun` ones are said as they are ("aviators"); the rest get
 *  "glasses" after them. Appended 2026-10-25 (Steve's QA: more sunglasses),
 *  drawn by avatar-figure. */
export const GLASSES = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'round', label: 'Round' },
    { id: 'square', label: 'Square' },
    { id: 'sunglasses', label: 'Sunglasses', sun: true },
    { id: 'roundSun', label: 'Round sunglasses', sun: true },
    { id: 'aviators', label: 'Aviators', sun: true },
    { id: 'catEye', label: 'Cat-eye sunglasses', sun: true },
    { id: 'sport', label: 'Sport sunglasses', sun: true },
    { id: 'oversized', label: 'Oversized sunglasses', sun: true }
]);

/** The frames' color (Steve's QA, 2026-10-25): each style's own unless
 *  another is chosen. Gold and silver are `metal`, drawn with a shine. */
export const FRAME_COLORS = Object.freeze([
    { id: 'standard', label: 'Standard', color: null, swatch: 0x1d1d1f },
    { id: 'black', label: 'Black', color: 0x1d1d1f },
    { id: 'tortoise', label: 'Tortoiseshell', color: 0x5a3a1e },
    { id: 'gold', label: 'Gold', color: 0xc9a24a, metal: true },
    { id: 'silver', label: 'Silver', color: 0xb8bcc2, metal: true },
    { id: 'white', label: 'White', color: 0xeeede8 },
    { id: 'red', label: 'Red', color: 0x9c2b25 },
    { id: 'pink', label: 'Pink', color: 0xe48fb8 },
    { id: 'blue', label: 'Blue', color: 0x3d6fd6 }
]);

/** The lenses' color: each style's own (dark in sunglasses, none in clear
 *  frames), `clear` (none in any frame), or a tint, which clear frames take
 *  too. */
export const LENS_COLORS = Object.freeze([
    { id: 'standard', label: 'Standard', color: null, swatch: 0x22262c },
    { id: 'clear', label: 'Clear', color: null, swatch: 0xe8eef3, clear: true },
    { id: 'dark', label: 'Dark', color: 0x1b1d21 },
    { id: 'brown', label: 'Brown', color: 0x5a3a24 },
    { id: 'blue', label: 'Blue', color: 0x3a6fb0 },
    { id: 'green', label: 'Green', color: 0x2f7a4f },
    { id: 'amber', label: 'Amber', color: 0xd49a2a },
    { id: 'rose', label: 'Rose', color: 0xd06a85 }
]);

/** The hands and the feet (Steve's QA, 2026-10-25): the rig's `handScale`
 *  and `footScale`. The feet's scale multiplies the muscles' (MUSCLES). */
/** Steve's QA, 2026-10-26: every hand was about half a real one against
 *  this head (the crowd part already asked the rig for 1.3), so the three
 *  sizes moved up together and XL was appended (an XXL was built and
 *  withdrawn the same day at Steve's request; a saved `xxl` reads as
 *  standard). A saved avatar keeps its id and gets the right-sized hand.
 *  `said` is how a size is spoken in a sentence ("extra-large hands"). */
export const HAND_SIZES = Object.freeze([
    { id: 'small', label: 'Small', scale: 1.1 },
    { id: 'standard', label: 'Standard', scale: 1.4 },
    { id: 'large', label: 'Large', scale: 1.7 },
    { id: 'xl', label: 'XL', scale: 2.0, said: 'extra-large' }
]);

export const FOOT_SIZES = Object.freeze([
    { id: 'small', label: 'Small', scale: 0.88 },
    { id: 'standard', label: 'Standard', scale: 1 },
    { id: 'large', label: 'Large', scale: 1.15 }
]);

/**
 * The number on a sports jersey (Steve's QA, 2026-10-26: "people who wear
 * jerseys wear the jersey of their favorite player"): none, or 0 to 99, or
 * 00, each one an option of this list so it travels and is checked like
 * every other id (`n8` is the number 8; `digits` is what is drawn). Drawn by
 * avatar-wardrobe on the chest and the back, only on the jersey.
 */
export const JERSEY_NUMBERS = Object.freeze([
    { id: 'none', label: 'None', digits: '' },
    ...Array.from({ length: 100 }, (_, n) => ({ id: `n${n}`, label: String(n), digits: String(n) })),
    { id: 'n00', label: '00', digits: '00' }
]);

/** The number's color: the jersey's own trim (white on a dark shirt, dark
 *  on a light one) unless another is chosen. */
export const NUMBER_COLORS = Object.freeze([
    { id: 'standard', label: 'Standard', color: null, swatch: 0xf2f0ea },
    { id: 'white', label: 'White', color: 0xf2f0ea },
    { id: 'black', label: 'Black', color: 0x1f2024 },
    { id: 'gold', label: 'Gold', color: 0xd4a537 },
    { id: 'silver', label: 'Silver', color: 0xb8bcc2 },
    { id: 'red', label: 'Red', color: 0xb0282a },
    { id: 'navy', label: 'Navy', color: 0x1f2f55 },
    { id: 'green', label: 'Green', color: 0x2f7a4f },
    { id: 'orange', label: 'Orange', color: 0xe07a1f }
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
/**
 * More body types (Steve's QA, 2026-10-26: three builds "look pretty
 * limiting", and Curvy never narrowed the shoulders): the rig grew a
 * shoulder width, a seat width, a girth and a leg thickness (each 1 is the
 * figure as it was), and the waist may bow out. Appended, neutral names,
 * none saying who it is for; `said` for the sentence ("a pear-shaped build").
 *
 *   pear    lean shoulders, a wider seat, full hips, a soft waist
 *   broad   wide shoulders over a narrower seat: the V shape
 *   round   a fuller, deeper middle, no waist
 *   full    everything a size up: shoulders, seat, depth and thighs
 */
export const BUILDS = Object.freeze([
    { id: 'straight', label: 'Straight', hips: 0, waist: 0, slender: 0, shoulderRound: 0.4 },
    { id: 'slim', label: 'Slim', hips: 0, waist: 0.1, slender: 1, shoulderRound: 0.45 },
    { id: 'curvy', label: 'Curvy', hips: 1, waist: 0.2, slender: 1, shoulderRound: 0.45, shoulders: 0.95 },
    { id: 'pear', label: 'Pear', said: 'pear-shaped', hips: 1, waist: 0.12, slender: 1, shoulderRound: 0.45, shoulders: 0.86, seat: 1.08 },
    { id: 'broad', label: 'Broad', said: 'broad-shouldered', hips: 0, waist: 0.1, slender: 0, shoulderRound: 0.4, shoulders: 1.15, seat: 0.94 },
    { id: 'round', label: 'Round', hips: 0.3, waist: -0.12, slender: 0, shoulderRound: 0.45, seat: 1.02, girth: 1.3, legs: 1.08 },
    { id: 'full', label: 'Full', said: 'full-figured', hips: 0.6, waist: -0.05, slender: 0, shoulderRound: 0.45, shoulders: 1.08, seat: 1.14, girth: 1.22, legs: 1.25 }
]);

/** The shirt's style, by its sleeves (the field keeps its first name,
 *  `sleeves`, so links made before the tank top still read). */
export const SLEEVES = Object.freeze([
    { id: 'long', label: 'Long sleeves', long: true },
    { id: 'short', label: 'Short sleeves' },
    { id: 'tank', label: 'Tank top' },
    // Steve's QA, 2026-10-25: "sweaters, turtlenecks, sports jerseys,
    // button-down dress shirts, hoodies". Drawn by avatar-wardrobe over the
    // rig's shirt; `long` ones cover the forearms, the button-down asks the
    // rig for its placket and buttons (`dressShirt`). Said in a sentence by
    // `said` ("a teal sweater").
    { id: 'sweater', label: 'Sweater', long: true, said: 'sweater' },
    { id: 'turtleneck', label: 'Turtleneck', long: true, said: 'turtleneck' },
    { id: 'jersey', label: 'Sports jersey', said: 'sports jersey' },
    { id: 'buttonDown', label: 'Button-down shirt', long: true, dressShirt: true, said: 'button-down shirt' },
    { id: 'hoodie', label: 'Hoodie', long: true, said: 'hoodie' },
    // Steve's QA, 2026-10-25: a V-neck (short sleeves, the collar cut away).
    { id: 'vneck', label: 'V-neck shirt', said: 'V-neck shirt' },
    // Steve's QA, 2026-10-26: one-pieces ("so avatars can look like
    // wrestlers or ballerinas"): the shirt carried down into a brief over
    // the hips (avatar-layers), so the legs may be bare under it.
    { id: 'leotard', label: 'Leotard', said: 'leotard', onePiece: true },
    { id: 'bodysuit', label: 'Bodysuit', long: true, said: 'bodysuit', onePiece: true }
]);

/** The bottoms, each of a `kind` the figure dresses the legs for: pants
 *  (trousers to the shoe), shorts (bare below the knee, a hem) or a skirt
 *  (bare legs). Appended 2026-10-25 (Steve's QA: "cargo shorts/pants, sweat
 *  pants, leggings, basketball shorts"); drawn by avatar-wardrobe. */
export const BOTTOMS = Object.freeze([
    { id: 'pants', label: 'Pants', kind: 'pants' },
    { id: 'skirt', label: 'Skirt', kind: 'skirt' },
    { id: 'shorts', label: 'Shorts', kind: 'shorts' },
    { id: 'cargoPants', label: 'Cargo pants', kind: 'pants' },
    { id: 'cargoShorts', label: 'Cargo shorts', kind: 'shorts' },
    { id: 'sweatpants', label: 'Sweatpants', kind: 'pants' },
    { id: 'leggings', label: 'Leggings', kind: 'pants' },
    { id: 'basketballShorts', label: 'Basketball shorts', kind: 'shorts' },
    { id: 'longSkirt', label: 'Long skirt', kind: 'skirt' },
    // Appended 2026-10-26 (Steve's QA: "short shorts and short mini
    // skirts", a ballerina's tutu, capris so legwear shows under pants), and
    // bare legs, OFFERED ONLY UNDER A ONE-PIECE (`onlyWith`; chosen with any
    // other shirt it is worn as shorts: `wornBottom`).
    { id: 'shortShorts', label: 'Short shorts', kind: 'shorts' },
    { id: 'miniSkirt', label: 'Mini skirt', kind: 'skirt' },
    { id: 'pleatedSkirt', label: 'Pleated skirt', kind: 'skirt' },
    { id: 'tutu', label: 'Tutu', kind: 'skirt' },
    { id: 'capris', label: 'Capri pants', kind: 'capris' },
    { id: 'bare', label: 'Bare legs', kind: 'bare', onlyWith: { field: 'sleeves', values: ['leotard', 'bodysuit'] } }
]);

/** The bottom an avatar is drawn in: its own, unless it is bare legs with
 *  no one-piece over them, which is worn as shorts. */
export function wornBottom(avatar) {
    const a = avatar && typeof avatar === 'object' ? avatar : {};
    const sleeves = optionOf(SLEEVES, a.sleeves);
    if (a.bottom === 'bare' && !(sleeves && sleeves.onePiece)) return 'shorts';
    return optionOf(BOTTOMS, a.bottom) ? a.bottom : DEFAULT_AVATAR.bottom;
}

/**
 * The underlayer (Steve's QA, 2026-10-26: "socks, nylons, fishnets, thigh
 * highs, long johns... goth/punk personas"), drawn by avatar-layers where
 * the legs and the arms are bare, in a color of its own (LAYER_COLORS).
 */
export const LEGWEAR = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'crewSocks', label: 'Crew socks' },
    { id: 'kneeSocks', label: 'Knee socks' },
    { id: 'thighHighs', label: 'Thigh highs' },
    { id: 'sheerTights', label: 'Sheer tights' },
    { id: 'tights', label: 'Tights' },
    { id: 'fishnets', label: 'Fishnets' },
    { id: 'longJohns', label: 'Long johns' },
    { id: 'legWarmers', label: 'Leg warmers' }
]);

export const ARMWEAR = Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'fishnetSleeves', label: 'Fishnet sleeves' },
    { id: 'longGloves', label: 'Long gloves' },
    { id: 'armWarmers', label: 'Arm warmers' },
    { id: 'thermalSleeves', label: 'Thermal sleeves' }
]);

/** The underlayer's colors, for the legs and the arms alike. */
export const LAYER_COLORS = Object.freeze([
    { id: 'black', label: 'Black', color: 0x1d1d1f },
    { id: 'white', label: 'White', color: 0xeeede8 },
    { id: 'gray', label: 'Gray', color: 0x7d8087 },
    { id: 'navy', label: 'Navy', color: 0x2a3a56 },
    { id: 'red', label: 'Red', color: 0x9c2b25 },
    { id: 'purple', label: 'Purple', color: 0x5a3a8a },
    { id: 'pink', label: 'Pink', color: 0xe48fb8 },
    { id: 'green', label: 'Green', color: 0x3f6f46 }
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
    { id: 'tallBoots', label: 'Tall boots', style: 'block' },
    // Steve, 2026-10-24: "sandals, high heels, platforms, slippers, etc."
    // Sandals and flats show the foot in the skin's color; heels tilt the
    // shoe over a heel; platforms stand the figure up on a thick sole.
    { id: 'sandals', label: 'Sandals', style: 'block' },
    { id: 'flats', label: 'Flats', style: 'block' },
    { id: 'heels', label: 'High heels', style: 'block' },
    { id: 'platforms', label: 'Platforms', style: 'block' },
    { id: 'slippers', label: 'Slippers', style: 'block' },
    // Steve's QA, 2026-10-25: "crocs, basketball shoes, hiking boots, sports
    // cleats". Drawn by avatar-wardrobe over the block.
    { id: 'crocs', label: 'Clogs', style: 'block' },
    { id: 'highTops', label: 'Basketball shoes', style: 'block' },
    { id: 'hikingBoots', label: 'Hiking boots', style: 'block' },
    { id: 'cleats', label: 'Cleats', style: 'block' }
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
    Object.freeze(['cheeks', CHEEKS]),
    // Appended 2026-10-25 (Steve's QA): the glasses' colors, the hands and
    // the feet.
    Object.freeze(['frameColor', FRAME_COLORS]),
    Object.freeze(['lensColor', LENS_COLORS]),
    Object.freeze(['handSize', HAND_SIZES]),
    Object.freeze(['footSize', FOOT_SIZES]),
    // Appended 2026-10-26 (Steve's QA): the jersey's number and its color.
    Object.freeze(['jerseyNumber', JERSEY_NUMBERS]),
    Object.freeze(['numberColor', NUMBER_COLORS]),
    // Appended 2026-10-26 (Steve's QA): the underlayer, legs and arms.
    Object.freeze(['legwear', LEGWEAR]),
    Object.freeze(['legwearColor', LAYER_COLORS]),
    Object.freeze(['armwear', ARMWEAR]),
    Object.freeze(['armwearColor', LAYER_COLORS])
]);

/** The list a field's ids come from, or null for a field that is not one. */
export function listOf(field) {
    const entry = FIELDS.find(([key]) => key === field);
    return entry ? entry[1] : null;
}

/** Leaf Blower's shipped figure: a rust red shirt with long sleeves, navy
 *  pants, fair skin, dark brown short hair, and nothing new (but the
 *  standard hand, bigger than the rig's since 2026-10-26). */
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
    cheeks: 'none',
    frameColor: 'standard',
    lensColor: 'standard',
    handSize: 'standard',
    footSize: 'standard',
    jerseyNumber: 'none',
    numberColor: 'standard',
    legwear: 'none',
    legwearColor: 'black',
    armwear: 'none',
    armwearColor: 'black'
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
 * How often a random avatar goes without a piece it could go without: a
 * field with a "none" (facial hair, glasses, a hat, legwear, armwear) is
 * none this share of the time. A straight roll over the lists would wear a
 * hat thirteen times in fourteen and glasses seven in eight: a costume
 * every time.
 */
export const NONE_ODDS = 0.5;

/**
 * A random avatar (Steve, 2026-10-26: a "Surprise me" button on /avatar/),
 * from the lists alone, never a custom color, so it is always said in
 * words. Every field is rolled in the link's order with `rand` (0 up to 1,
 * Math.random unless given), under the editor's own rules: a field with a
 * "none" is none `NONE_ODDS` of the time and one of the rest evenly
 * otherwise; an option offered only with another (`onlyWith`, bare legs
 * under a one-piece) is in the draw only while that field, rolled before
 * it, holds one of its values; and a jersey number is drawn only on a
 * jersey (a number then, never none). Nothing is kept: the caller shows it,
 * and only Save keeps it.
 */
export function randomAvatar(rand = Math.random) {
    const out = { v: AVATAR_VERSION };
    const roll = () => Math.min(0.999999, Math.max(0, Number(rand()) || 0));
    const pick = (options) => options[Math.floor(roll() * options.length)].id;
    for (const [key, list] of FIELDS) {
        const offered = list.filter((o) => !o.onlyWith || o.onlyWith.values.includes(out[o.onlyWith.field]));
        const rest = offered.filter((o) => o.id !== 'none');
        if (key === 'jerseyNumber') out[key] = out.sleeves === 'jersey' ? pick(rest) : 'none';
        else if (rest.length < offered.length && roll() < NONE_ODDS) out[key] = 'none';
        else out[key] = pick(rest.length ? rest : offered);
    }
    return normalizeAvatar(out);
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
    const sleeves = optionOf(SLEEVES, a.sleeves);
    return {
        shirtColor: shirt,
        sleeveColor: sleeves.long ? shirt : null,
        dressShirt: !!sleeves.dressShirt,
        pantsColor: colorOf('bottomColor', a.bottomColor),
        hasSkirt: optionOf(BOTTOMS, wornBottom(a)).kind === 'skirt',
        muscular: a.muscles === 'buff',
        footScale: optionOf(MUSCLES, a.muscles).feet * optionOf(FOOT_SIZES, a.footSize).scale,
        handScale: optionOf(HAND_SIZES, a.handSize).scale,
        skinTone: colorOf('skin', a.skin),
        hairColor: colorOf('hair', a.hair),
        hairStyle: a.length === 'bald' ? 'short' : a.length,
        bald: a.length === 'bald',
        eyeColor: colorOf('eyes', a.eyes),
        shoulderRound: build.shoulderRound,
        hips: build.hips,
        waist: build.waist,
        slender: build.slender,
        shoulders: build.shoulders ?? 1,
        seat: build.seat ?? 1,
        girth: build.girth ?? 1,
        legs: build.legs ?? 1,
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
        cornrows: (c) => `${c} cornrows`,
        leftPart: (c) => `short ${c} hair with a left part`,
        rightPart: (c) => `short ${c} hair with a right part`,
        centerPart: (c) => `short ${c} hair parted in the middle`,
        long: (c) => `long ${c} hair with bangs`,
        longCenter: (c) => `long ${c} hair parted in the middle`,
        longSide: (c) => `long ${c} hair with a side part`,
        longBack: (c) => `long ${c} hair swept back`
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
    if (a.glasses !== 'none') {
        // "gold-framed aviators with blue lenses"; nothing said of the
        // standard colors, or of clear lenses.
        const glasses = optionOf(GLASSES, a.glasses);
        const frame = a.frameColor === 'standard' ? '' : `${word(FRAME_COLORS, a.frameColor)}-framed `;
        const lenses = a.lensColor === 'standard' || a.lensColor === 'clear' ? '' : ` with ${word(LENS_COLORS, a.lensColor)} lenses`;
        extras.push(`${frame}${word(GLASSES, a.glasses)}${glasses.sun ? '' : ' glasses'}${lenses}`);
    }
    const shoeColor = word(SHOE_COLORS, a.shoeColor);
    const shoes = a.shoes === 'classic' ? `classic ${shoeColor} shoes` : `${shoeColor} ${word(SHOES, a.shoes)}`;
    const muscles = a.muscles === 'standard' ? '' : `${word(MUSCLES, a.muscles)}, `;
    const shirt = name(SHIRTS, a.shirt);
    const sleeves = optionOf(SLEEVES, a.sleeves);
    const bottom = optionOf(BOTTOMS, wornBottom(a));
    // "a straight build with large hands and small feet".
    const limbs = [];
    if (a.handSize !== 'standard') limbs.push(`${optionOf(HAND_SIZES, a.handSize).said || word(HAND_SIZES, a.handSize)} hands`);
    if (a.footSize !== 'standard') limbs.push(`${word(FOOT_SIZES, a.footSize)} feet`);
    // "a purple sports jersey with the number 8 in white" (nothing said of
    // the standard color, which is the jersey's own trim).
    const number = optionOf(JERSEY_NUMBERS, a.jerseyNumber);
    const numbered = a.sleeves === 'jersey' && number.digits
        ? ` with the number ${number.digits}${a.numberColor === 'standard' ? '' : ` in ${word(NUMBER_COLORS, a.numberColor)}`}`
        : '';
    const clothes = [
        `a ${muscles}${optionOf(BUILDS, a.build).said || word(BUILDS, a.build)} build${limbs.length ? ` with ${limbs.join(' and ')}` : ''}`,
        (sleeves.said ? `a ${shirt} ${sleeves.said}` : a.sleeves === 'tank' ? `a ${shirt} tank top` : `a ${shirt} shirt with ${a.sleeves} sleeves`) + numbered,
        bottom.kind === 'bare' ? 'bare legs' : `${bottom.kind === 'skirt' ? 'a ' : ''}${name(PANTS, a.bottomColor)} ${bottom.label.toLowerCase()}`
    ];
    // The underlayer (2026-10-26): "black fishnets and black fishnet sleeves".
    if (a.legwear !== 'none') clothes.push(`${word(LAYER_COLORS, a.legwearColor)} ${word(LEGWEAR, a.legwear)}`);
    if (a.armwear !== 'none') clothes.push(`${word(LAYER_COLORS, a.armwearColor)} ${word(ARMWEAR, a.armwear)}`);
    clothes.push(shoes);
    if (a.hat !== 'none') clothes.push(`a ${name(SHIRTS, a.hatColor)} ${word(HATS, a.hat)}`);
    const head = [...face, hair, ...extras];
    const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]);
    return `A figure with ${list(head)}, ${clothes.slice(0, -1).join(', ')}, and ${clothes[clothes.length - 1]}.`;
}

// ---- The link -----------------------------------------------------------------

/** The link's own version, its first part. */
export const LINK_VERSION = 1;

/** The longest fragment `decodeLink` reads. Today's link is about two
 *  hundred characters (and under 270 at its longest), so this is room for
 *  every field to grow. */
export const MAX_LINK = 768;

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

/** The chip link's tooltip, before and after a save. */
export const CHIP_TITLES = Object.freeze({
    unsaved: 'Make an avatar that looks like you',
    saved: 'Your avatar. Change it any time.'
});

/**
 * The corner chip (PRD section 7): a round portrait that links to /avatar/.
 * `els` are its parts, found by the page: `img`, `label` (the "Make your
 * avatar" words), `hide` (the label's dismiss button) and `link`.
 *
 * Shows the saved portrait where there is one, and leaves the markup's
 * default picture otherwise. Counts this visit and shows or folds the label
 * by `chipLabelShown`. The picture's alt text carries the link's name only
 * when the label does not (the label's words would otherwise be read twice),
 * and the link's title says what a press does (`CHIP_TITLES`). Another tab
 * saving or forgetting updates it in place.
 *
 * Returns `{ saved, labelShown, refresh, dispose }`, or null without an
 * image to show. `countVisit` false (a scene's welcome card, M6) leaves the
 * home page's visit count alone.
 */
export function installChip(els, { store = createAvatarStore(), defaultSrc = '', countVisit = true } = {}) {
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
        // The tooltip under a resting pointer (Steve's QA, 2026-10-26).
        if (link) link.title = saved ? CHIP_TITLES.saved : CHIP_TITLES.unsaved;
        if (saved) setLabel(false);
        else setLabel(labelShown);
    }

    saved = store.hasSaved();
    // A scene's welcome card (`countVisit` false) shows the chip without
    // counting toward the home page's label rule.
    const rule = countVisit ? store.noteVisit() : store.chip();
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
