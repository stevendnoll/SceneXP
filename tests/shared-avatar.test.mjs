// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The site-wide avatar's data part (shared/js/avatar-1.0.0.js), from SOURCE.
 * specs/avatar M1.
 *
 * What is held here, and why:
 * - ANYTHING IN, A REAL FIGURE OUT. A link, a file and storage can all hold
 *   anything, so every field is checked against its own list, inherited keys
 *   are never read, and nothing throws at a visitor.
 * - THE DEFAULT IS LEAF BLOWER'S FIGURE, EXACTLY. A choice from Leaf
 *   Blower, carried over, must build the same person it builds today, or
 *   moving the scene onto the avatar (M6) changes a figure players already
 *   chose.
 * - THE LINK'S ORDER IS FROZEN. A link made today is read tomorrow, so the
 *   default's link is pinned as a literal.
 * - THE STORE SURVIVES A BROWSER THAT REFUSES STORAGE, and a portrait is a
 *   PNG or JPEG data URL and nothing else, since the home page puts it in an
 *   <img>.
 */
import { readFileSync } from 'node:fs';
import * as A from '../www/shared/js/avatar-1.0.0.js';
// The min build, the same module the part itself imports (a source import
// would be a second copy of every list).
import { DEFAULT_CHOICE, SHIRTS, PANTS, SKINS, HAIR_COLORS, HAIR_LENGTHS } from '../www/shared/js/cast-1.0.0.min.js';
import { personConfig as leavesPerson } from '../www/leaves/js/cast.js';

const FIELD_KEYS = A.FIELDS.map(([key]) => key);

/** A small seeded generator, so a failure names an avatar that can be built
 *  again. */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomAvatar(rand) {
    const a = { v: 1 };
    for (const [key, list] of A.FIELDS) a[key] = list[Math.floor(rand() * list.length)].id;
    return a;
}

/** A fake localStorage, as a global, with switches to make it refuse. */
function installStorage() {
    const map = new Map();
    const fake = {
        map,
        refuseRead: false,
        refuseWrite: false,
        getItem(k) {
            if (fake.refuseRead) throw new Error('SecurityError');
            return map.has(k) ? map.get(k) : null;
        },
        setItem(k, v) {
            if (fake.refuseWrite) throw new Error('QuotaExceededError');
            map.set(k, String(v));
        },
        removeItem(k) {
            if (fake.refuseWrite) throw new Error('SecurityError');
            map.delete(k);
        }
    };
    globalThis.localStorage = fake;
    return fake;
}

afterEach(() => {
    delete globalThis.localStorage;
});

describe('the lists', () => {
    test('every field has a list, each id is unique in it, and the default names a real option of each', () => {
        expect(FIELD_KEYS).toEqual(['skin', 'eyes', 'hair', 'length', 'facial', 'glasses', 'build', 'shirt',
            'sleeves', 'bottom', 'bottomColor', 'shoes', 'shoeColor', 'hat', 'hatColor', 'mouth', 'lips', 'muscles',
            'facialColor', 'brows', 'eyeShape', 'nose', 'faceShape', 'cheeks', 'frameColor', 'lensColor', 'handSize', 'footSize',
            'jerseyNumber', 'numberColor', 'legwear', 'legwearColor', 'armwear', 'armwearColor', 'handedness', 'jerseyName']);
        for (const [key, list] of A.FIELDS) {
            const ids = list.map((o) => o.id);
            expect(`${key}: ${new Set(ids).size}`).toBe(`${key}: ${ids.length}`);
            // Ids travel in a link between dots, so they are plain letters
            // (and the jersey numbers' digits, 2026-10-26).
            for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]+$/);
            expect(A.optionOf(list, A.DEFAULT_AVATAR[key])).toBeTruthy();
            expect(A.listOf(key)).toBe(list);
        }
        expect(A.listOf('name')).toBeNull();
        expect(Object.keys(A.DEFAULT_AVATAR).sort()).toEqual(['v', ...FIELD_KEYS].sort());
    });

    test("today's lists are cast-1.0.0's own, and the new ones are the PRD's", () => {
        expect(A.SHIRTS).toBe(SHIRTS);
        expect(A.PANTS).toBe(PANTS);
        expect(A.SKINS).toBe(SKINS);
        // More styles (Steve's QA, 2026-10-24), cast-1.0.0's four first, by
        // id; the rig's long hair is called "Long with bangs" here since the
        // long styles without them (2026-10-25).
        expect(A.HAIR_LENGTHS.slice(0, HAIR_LENGTHS.length).map((o) => o.id)).toEqual(HAIR_LENGTHS.map((o) => o.id));
        expect(A.HAIR_LENGTHS.slice(0, 3)).toEqual(HAIR_LENGTHS.slice(0, 3));
        expect(A.optionOf(A.HAIR_LENGTHS, 'long').label).toBe('Long with bangs');
        expect(A.HAIR_LENGTHS.map((o) => o.id)).toEqual(expect.arrayContaining(['longCenter', 'longSide', 'longBack']));
        expect(A.HAIR_LENGTHS.map((o) => o.id)).toEqual(expect.arrayContaining(['mohawk', 'mullet', 'ponytail', 'afro', 'locs', 'cornrows']));
        expect(A.HATS.map((o) => o.id)).toEqual(['none', 'cap', 'beanie', 'sunHat', 'trucker', 'ivyCap', 'beret', 'fedora', 'cowboy', 'topHat', 'fez', 'chef', 'hardHat', 'birthday']);
        // More hair colors (Steve's QA, 2026-10-24), cast-1.0.0's six first,
        // so every id a Leaf Blower choice holds still reads.
        expect(A.HAIR_COLORS.slice(0, HAIR_COLORS.length)).toEqual([...HAIR_COLORS]);
        expect(A.HAIR_COLORS.length).toBeGreaterThanOrEqual(18);
        expect(A.FACIAL_COLORS[0]).toMatchObject({ id: 'match', color: null });
        expect(A.FACIAL_COLORS.slice(1)).toEqual([...A.HAIR_COLORS]);
        expect(A.FACE_SHAPES.map((o) => o.id)).toEqual(['round', 'oval']);
        expect(A.NOSES[0].id).toBe('pointed');
        expect(A.listOf('hatColor')).toBe(SHIRTS);
        expect(A.listOf('bottomColor')).toBe(PANTS);
        expect(A.EYES.map((o) => o.label)).toEqual(['Dark brown', 'Brown', 'Hazel', 'Green', 'Blue', 'Gray']);
        expect(A.FACIAL.map((o) => o.id)).toEqual(['none', 'stubble', 'mustache', 'goatee', 'beard']);
        expect(A.GLASSES.map((o) => o.id)).toEqual(['none', 'round', 'square', 'sunglasses', 'roundSun', 'aviators', 'catEye', 'sport', 'oversized']);
        // The sunglasses say so, the clear frames do not (the sentence adds
        // "glasses" to those).
        expect(A.GLASSES.filter((o) => o.sun).map((o) => o.id)).toEqual(['sunglasses', 'roundSun', 'aviators', 'catEye', 'sport', 'oversized']);
        expect(A.FRAME_COLORS[0]).toMatchObject({ id: 'standard', color: null });
        expect(A.FRAME_COLORS.filter((o) => o.metal).map((o) => o.id)).toEqual(['gold', 'silver']);
        expect(A.LENS_COLORS.slice(0, 2).map((o) => o.id)).toEqual(['standard', 'clear']);
        expect(A.LENS_COLORS.find((o) => o.id === 'clear')).toMatchObject({ color: null, clear: true });
        // The hand sizes moved up together and grew an XL on the end
        // (Steve's QA, 2026-10-26: "hands still look a little too small").
        expect(A.HAND_SIZES.map((o) => o.id)).toEqual(['small', 'standard', 'large', 'xl']);
        expect(A.HAND_SIZES.map((o) => o.scale)).toEqual([1.1, 1.4, 1.7, 2.0]);
        // An XXL was built and withdrawn the same day: it reads as standard.
        expect(A.normalizeAvatar({ handSize: 'xxl' }).handSize).toBe('standard');
        expect(A.optionOf(A.HAND_SIZES, 'small').scale).toBeGreaterThan(1);
        expect(A.FOOT_SIZES.map((o) => o.id)).toEqual(['small', 'standard', 'large']);
        expect(A.MOUTHS.map((o) => o.id)).toEqual(['smile', 'bigSmile', 'grin', 'smirk', 'surprised']);
        expect(A.LIP_COLORS.map((o) => o.id)).toEqual(['natural', 'rose', 'red', 'berry', 'softPink']);
        expect(A.MUSCLES.map((o) => o.label)).toEqual(['Standard', 'Athletic', 'Buff']);
        // The first three of each are the ones links made before hold; the
        // wardrobe's follow (2026-10-25).
        expect(A.SLEEVES.map((o) => o.id)).toEqual(['long', 'short', 'tank', 'sweater', 'turtleneck', 'jersey', 'buttonDown', 'hoodie', 'vneck', 'leotard', 'bodysuit']);
        expect(A.BOTTOMS.map((o) => o.id)).toEqual(['pants', 'skirt', 'shorts', 'cargoPants', 'cargoShorts', 'sweatpants', 'leggings', 'basketballShorts', 'longSkirt',
            'shortShorts', 'miniSkirt', 'pleatedSkirt', 'tutu', 'capris', 'bare']);
        for (const o of A.BOTTOMS) expect(['pants', 'shorts', 'skirt', 'capris', 'bare']).toContain(o.kind);
        // The one-pieces, and bare legs offered only under them (2026-10-26).
        expect(A.SLEEVES.filter((o) => o.onePiece).map((o) => o.id)).toEqual(['leotard', 'bodysuit']);
        expect(A.optionOf(A.SLEEVES, 'bodysuit').long).toBe(true);
        expect(A.optionOf(A.BOTTOMS, 'bare').onlyWith).toEqual({ field: 'sleeves', values: ['leotard', 'bodysuit'] });
        expect(A.LEGWEAR.map((o) => o.id)).toEqual(['none', 'crewSocks', 'kneeSocks', 'thighHighs', 'sheerTights', 'tights', 'fishnets', 'longJohns', 'legWarmers']);
        expect(A.ARMWEAR.map((o) => o.id)).toEqual(['none', 'fishnetSleeves', 'longGloves', 'armWarmers', 'thermalSleeves']);
        expect(A.LAYER_COLORS[0].id).toBe('black');
        expect(A.COLOR_FIELDS).toEqual(expect.arrayContaining(['legwearColor', 'armwearColor']));
        // Natural lips have no color of their own (they are the skin's), only
        // a swatch to show; every other lip color has one.
        for (const o of A.LIP_COLORS) expect(o.id === 'natural' ? o.color === null && o.swatch > 0 : o.color > 0).toBe(true);
        // Seven builds since 2026-10-26 (Steve: three "look pretty
        // limiting"), the first three keeping their ids, none named for who
        // it is for.
        expect(A.BUILDS.map((o) => o.label)).toEqual(['Straight', 'Slim', 'Curvy', 'Pear', 'Broad', 'Round', 'Full']);
        for (const o of A.BUILDS) expect(`${o.label} ${o.said || ''}`).not.toMatch(/\b(men|women|man|woman|male|female|lady|ladies)/i);
        expect(A.SHOES.map((o) => o.id)).toEqual(['classic', 'sneakers', 'maryJane', 'ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots',
            'sandals', 'flats', 'heels', 'platforms', 'slippers', 'crocs', 'highTops', 'hikingBoots', 'cleats']);
        // Named by style, never by who wears them (Steve, 2026-10-24).
        for (const o of A.SHOES) expect(o.label).not.toMatch(/\b(men|women|man|woman|boy|girl|lady|ladies)/i);
        expect(A.SHOE_COLORS.map((o) => o.id)).toEqual(['black', 'brown', 'white', 'navy', 'red']);
    });

    test('Curvy is Maya\'s build, from Whitestone\'s own config', () => {
        const src = readFileSync('www/whitestone/js/config.js', 'utf8');
        const maya = src.slice(src.indexOf('maya: {'));
        const num = (key) => Number(maya.match(new RegExp(`\\b${key}: ([0-9.]+)`))[1]);
        const curvy = A.optionOf(A.BUILDS, 'curvy');
        expect([curvy.hips, curvy.waist, curvy.slender]).toEqual([num('hips'), num('waist'), num('slender')]);
    });
});

describe('normalizeAvatar takes anything', () => {
    test('nothing, or not an object, is the default', () => {
        for (const raw of [undefined, null, '', 'deep', 42, true, [], ['deep'], () => {}]) {
            expect(A.normalizeAvatar(raw)).toEqual(A.DEFAULT_AVATAR);
        }
    });

    test('each field is kept only when it names a real option, as a string', () => {
        const a = A.normalizeAvatar({
            skin: 'deep', eyes: 'purple', hair: 7, length: ['long'], facial: { id: 'beard' },
            glasses: 'round', build: 'curvy', shirt: 'TEAL', sleeves: 'short', bottom: 'skirt',
            bottomColor: 'denim', shoes: 'sneakers', shoeColor: null, hat: 'beanie', hatColor: 'mustard',
            name: 'Steve', v: 99
        });
        expect(a).toEqual({
            v: 1, skin: 'deep', eyes: 'darkBrown', hair: 'darkBrown', length: 'short', facial: 'none',
            glasses: 'round', build: 'curvy', shirt: 'rust', sleeves: 'short', bottom: 'skirt',
            bottomColor: 'denim', shoes: 'sneakers', shoeColor: 'black', hat: 'beanie', hatColor: 'mustard',
            mouth: 'smile', lips: 'natural', muscles: 'standard',
            facialColor: 'match', brows: 'natural', eyeShape: 'round', nose: 'pointed', faceShape: 'round', cheeks: 'none',
            frameColor: 'standard', lensColor: 'standard', handSize: 'standard', footSize: 'standard', jerseyNumber: 'none', numberColor: 'standard', legwear: 'none', legwearColor: 'black', armwear: 'none', armwearColor: 'black',
            handedness: 'right', jerseyName: 'none'
        });
        // No free text survives, whatever it was called: the one typed field
        // (the jersey's name, 2026-10-28) keeps only a name it can be.
        expect(a.name).toBeUndefined();
    });

    test('inherited keys are never read, and a prototype key changes nothing', () => {
        expect(A.normalizeAvatar(Object.create({ skin: 'deep' })).skin).toBe('fair');
        const hostile = JSON.parse('{"__proto__": {"skin": "deep", "polluted": true}, "constructor": {"prototype": {"polluted": true}}}');
        expect(A.normalizeAvatar(hostile)).toEqual(A.DEFAULT_AVATAR);
        expect({}.polluted).toBeUndefined();
        // An id that is an Object.prototype name is not an option.
        expect(A.normalizeAvatar({ skin: 'toString', hat: '__proto__', shirt: 'constructor' })).toEqual(A.DEFAULT_AVATAR);
    });

    test('an object that throws when read is the default, not an error', () => {
        const trap = new Proxy({}, { get() { throw new Error('no'); }, getOwnPropertyDescriptor() { throw new Error('no'); } });
        expect(A.normalizeAvatar(trap)).toEqual(A.DEFAULT_AVATAR);
    });

    test('it always returns a new object, so a caller cannot change the default', () => {
        const a = A.normalizeAvatar(null);
        a.skin = 'deep';
        expect(A.DEFAULT_AVATAR.skin).toBe('fair');
        expect(Object.isFrozen(A.DEFAULT_AVATAR)).toBe(true);
    });

    test('sameAvatar compares the figure, not the object', () => {
        expect(A.sameAvatar(null, A.DEFAULT_AVATAR)).toBe(true);
        expect(A.sameAvatar({ skin: 'nope' }, {})).toBe(true);
        expect(A.sameAvatar({ skin: 'deep' }, {})).toBe(false);
    });
});

describe('a scene\'s overrides', () => {
    test('only real fields with real options take effect', () => {
        const a = A.withOverrides({ hat: 'cap', sleeves: 'short' }, { hat: 'none', sleeves: 'sideways', name: 'x' });
        expect(a.hat).toBe('none');
        expect(a.sleeves).toBe('short');
        expect(a.name).toBeUndefined();
        expect(A.withOverrides({ hat: 'cap' }, null).hat).toBe('cap');
        expect(A.withOverrides({ hat: 'cap' }, Object.create({ hat: 'none' })).hat).toBe('cap');
    });
});

describe('the createPerson settings', () => {
    test('sleeves, bottom, hair and build reach the rig', () => {
        const long = A.personConfig({ shirt: 'teal' });
        expect(long.sleeveColor).toBe(long.shirtColor);
        expect(A.personConfig({ sleeves: 'short' }).sleeveColor).toBeNull();
        expect(A.personConfig({ bottom: 'skirt' }).hasSkirt).toBe(true);
        expect(A.personConfig({ bottomColor: 'khaki' }).pantsColor).toBe(A.optionOf(PANTS, 'khaki').color);
        expect(A.personConfig({ length: 'bald' })).toMatchObject({ bald: true, hairStyle: 'short' });
        expect(A.personConfig({ length: 'buzz' })).toMatchObject({ bald: false, hairStyle: 'buzz' });
        expect(A.personConfig({ eyes: 'blue' }).eyeColor).toBe(A.optionOf(A.EYES, 'blue').color);
        expect(A.personConfig({ build: 'curvy' })).toMatchObject({ hips: 1, waist: 0.2, slender: 1, shoulderRound: 0.45 });
        // The builds' shape numbers reach the rig (2026-10-26), and a build
        // that leaves one unsaid sends the rig's own 1.
        expect(A.personConfig({})).toMatchObject({ shoulders: 1, seat: 1, girth: 1, legs: 1 });
        expect(A.personConfig({ build: 'curvy' }).shoulders).toBeLessThan(1);
        const pear = A.personConfig({ build: 'pear' });
        expect(pear.shoulders).toBeLessThan(0.9);
        expect(pear.seat).toBeGreaterThan(1);
        expect(pear.hips).toBe(1);
        const broad = A.personConfig({ build: 'broad' });
        expect(broad.shoulders).toBeGreaterThan(1.1);
        expect(broad.seat).toBeLessThan(1);
        const round = A.personConfig({ build: 'round' });
        expect(round.waist).toBeLessThan(0);
        expect(round.girth).toBeGreaterThan(1.2);
        const full = A.personConfig({ build: 'full' });
        expect(full.legs).toBeGreaterThan(1.2);
        expect(full.seat).toBeGreaterThan(full.shoulders);
        expect(full.shoulders).toBeGreaterThan(1);
        expect(A.personConfig({ shoes: 'maryJane', shoeColor: 'red' })).toMatchObject({ shoeStyle: 'maryJane', shoeColor: 0x9c2b25 });
        expect(A.personConfig({ shoes: 'sneakers' }).shoeStyle).toBe('block');
        for (const boots of ['ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots']) expect(A.personConfig({ shoes: boots }).shoeStyle).toBe('block');
        expect(A.personConfig({ muscles: 'buff' }).muscular).toBe(true);
        expect(A.personConfig({ muscles: 'athletic' }).muscular).toBe(false);
        expect(A.personConfig({ sleeves: 'tank' }).sleeveColor).toBeNull();
        expect(A.personConfig({ bottom: 'shorts' }).hasSkirt).toBe(false);
        // The hands and the feet (2026-10-25): the rig's own scales, the
        // feet's over the muscles' (a buff figure with large feet has both).
        expect(A.personConfig({})).toMatchObject({ handScale: A.optionOf(A.HAND_SIZES, 'standard').scale, footScale: 1 });
        expect(A.personConfig({ handSize: 'large' }).handScale).toBe(A.optionOf(A.HAND_SIZES, 'large').scale);
        expect(A.personConfig({ handSize: 'small' }).handScale).toBeLessThan(A.personConfig({}).handScale);
        expect(A.personConfig({ footSize: 'small' }).footScale).toBeLessThan(1);
        expect(A.personConfig({ footSize: 'large', muscles: 'buff' }).footScale)
            .toBeCloseTo(A.optionOf(A.FOOT_SIZES, 'large').scale * A.optionOf(A.MUSCLES, 'buff').feet, 9);
        expect(A.personConfig({ footSize: 'large', muscles: 'buff' }).footScale).toBeGreaterThan(A.personConfig({ muscles: 'buff' }).footScale);
        // An override is an avatar field, laid over first.
        expect(A.personConfig({ sleeves: 'short' }, { sleeves: 'long' }).sleeveColor).not.toBeNull();
    });

    test("a Leaf Blower choice builds exactly the operator it builds today", () => {
        // The new settings must each be the rig's own default, read from the
        // rig, so carrying a choice over adds nothing a player would see.
        const rig = readFileSync('www/shared/js/people-1.0.0.js', 'utf8');
        const rigDefault = (key) => {
            const m = rig.match(new RegExp(`^\\s+${key} = ([^,\\n]+),`, 'm'));
            return Function(`return (${m[1].trim()});`)();
        };
        const rand = rng(7);
        const lists = { shirt: SHIRTS, pants: PANTS, skin: SKINS, hair: HAIR_COLORS, length: HAIR_LENGTHS };
        for (let i = 0; i < 60; i++) {
            const choice = i === 0 ? { ...DEFAULT_CHOICE } : Object.fromEntries(Object.entries(lists)
                .map(([k, list]) => [k, list[Math.floor(rand() * list.length)].id]));
            const today = leavesPerson(choice);
            const carried = { ...A.personConfig(A.fromCastChoice(choice)), role: 'operator' };
            for (const [key, value] of Object.entries(carried)) {
                if (key in today) expect(`${i} ${key}: ${value}`).toBe(`${i} ${key}: ${today[key]}`);
                // The one deliberate difference (2026-10-26): the avatar's
                // standard hand is bigger than the rig's default, which is
                // about half a real hand against this head.
                else if (key === 'handScale') expect(`${i} ${key}: ${value}`).toBe(`${i} ${key}: ${A.optionOf(A.HAND_SIZES, 'standard').scale}`);
                else expect(`${i} ${key}: ${value}`).toBe(`${i} ${key}: ${rigDefault(key)}`);
            }
            for (const key of Object.keys(today)) expect(carried).toHaveProperty(key);
        }
    });

    test('the default avatar is the default Leaf Blower choice', () => {
        expect(A.fromCastChoice(null)).toEqual(A.DEFAULT_AVATAR);
        expect(A.fromCastChoice(DEFAULT_CHOICE)).toEqual(A.DEFAULT_AVATAR);
        expect(A.fromCastChoice({ shirt: 'teal', pants: 'khaki', skin: 'deep', hair: 'gray', length: 'long' }))
            .toMatchObject({ shirt: 'teal', bottomColor: 'khaki', skin: 'deep', hair: 'gray', length: 'long', sleeves: 'long' });
    });
});

describe('custom colors (Steve, 2026-10-24)', () => {
    test('a color field takes "x" and six hex digits, and nothing else of any shape', () => {
        for (const f of A.COLOR_FIELDS) {
            expect(A.normalizeAvatar({ [f]: 'x1a2b3c' })[f]).toBe('x1a2b3c');
            for (const bad of ['x1A2B3C', 'x12345', 'x1234567', '#1a2b3c', '1a2b3c', 'xggggg0', 'x1a2b3c ', ' x1a2b3c', 'x1a2b3c\n']) {
                expect(`${f} ${JSON.stringify(bad)}: ${A.normalizeAvatar({ [f]: bad })[f]}`).toBe(`${f} ${JSON.stringify(bad)}: ${A.DEFAULT_AVATAR[f]}`);
            }
        }
        // A field that is not a color never takes one.
        for (const f of ['build', 'hat', 'shoes', 'mouth', 'faceShape']) {
            expect(A.normalizeAvatar({ [f]: 'x1a2b3c' })[f]).toBe(A.DEFAULT_AVATAR[f]);
        }
        expect(A.withOverrides({}, { hair: 'xffffff' }).hair).toBe('xffffff');
        expect(A.decodeLink('#a=1.x00ff00')).toMatchObject({ skin: 'x00ff00' });
        expect(A.fromFile(A.toFile({ shirt: 'x123456' })).shirt).toBe('x123456');
    });

    test('a custom color reaches the figure, and a swatch keeps its own', () => {
        expect(A.customColor(0x9c2b25)).toBe('x9c2b25');
        expect(A.customColor(0x1a)).toBe('x00001a');
        expect(A.colorOf('hair', 'x123456')).toBe(0x123456);
        expect(A.colorOf('hair', 'pink')).toBe(A.optionOf(A.HAIR_COLORS, 'pink').color);
        expect(A.colorOf('lips', 'natural')).toBeNull();
        expect(A.colorOf('facialColor', 'match')).toBeNull();
        expect(A.colorOf('build', 'x123456')).toBeNull();
        expect(A.colorOf('nope', 'x')).toBeNull();
        const c = A.personConfig({ skin: 'x00aa00', hair: 'xff00ff', shirt: 'x0000ff', sleeves: 'long', bottomColor: 'x111111', shoeColor: 'x222222', eyes: 'x333333' });
        expect(c).toMatchObject({ skinTone: 0x00aa00, hairColor: 0xff00ff, shirtColor: 0x0000ff, sleeveColor: 0x0000ff, pantsColor: 0x111111, shoeColor: 0x222222, eyeColor: 0x333333 });
        // And it is said as "custom-color", never as a hex.
        const words = A.describeAvatar({ hair: 'xff00ff', shirt: 'x0000ff', hat: 'cap', hatColor: 'x00ff00', facial: 'beard', facialColor: 'x444444' });
        expect(words).toMatch(/custom-color hair/);
        expect(words).toMatch(/a custom-color shirt/);
        expect(words).toMatch(/a custom-color ball cap/);
        expect(words).toMatch(/a custom-color full beard/);
        expect(words).not.toMatch(/[0-9a-f]{6}/);
        const specs = A.describeAvatar({ glasses: 'aviators', frameColor: 'x123456', lensColor: 'x654321' });
        expect(specs).toMatch(/custom-color-framed aviators with custom-color lenses/);
        expect(specs).not.toMatch(/[0-9a-f]{6}/);
    });

    test('the glasses are said with their colors, and the build with its hands and feet (2026-10-25)', () => {
        expect(A.describeAvatar({ glasses: 'aviators' })).toMatch(/short dark brown hair and aviators, a straight build,/);
        expect(A.describeAvatar({ glasses: 'catEye' })).toMatch(/ and cat-eye sunglasses, /);
        expect(A.describeAvatar({ glasses: 'sport', frameColor: 'blue' })).toMatch(/ and blue-framed sport sunglasses, /);
        expect(A.describeAvatar({ glasses: 'oversized', lensColor: 'rose' })).toMatch(/ and oversized sunglasses with rose lenses, /);
        expect(A.describeAvatar({ glasses: 'round', frameColor: 'gold', lensColor: 'amber' })).toMatch(/ and gold-framed round glasses with amber lenses, /);
        // The standard colors and clear lenses go unsaid.
        expect(A.describeAvatar({ glasses: 'square', frameColor: 'standard', lensColor: 'clear' })).toMatch(/ and square glasses, /);
        // The colors mean nothing without glasses, and are not said.
        expect(A.describeAvatar({ frameColor: 'gold', lensColor: 'amber' })).toBe(A.describeAvatar({}));
        expect(A.describeAvatar({ handSize: 'large' })).toMatch(/a straight build with large hands, /);
        expect(A.describeAvatar({ footSize: 'small', build: 'curvy' })).toMatch(/a curvy build with small feet, /);
        // Which hand leads (2026-10-26): right by default and unsaid, left said.
        expect(A.HANDEDNESS.map((h) => h.id)).toEqual(['right', 'left']);
        expect(A.DEFAULT_AVATAR.handedness).toBe('right');
        expect(A.normalizeAvatar({ handedness: 'ambidextrous' }).handedness).toBe('right');
        expect(A.describeAvatar({ handedness: 'left', handSize: 'large' })).toMatch(/a straight build with large hands and a leading left hand, /);
        expect(A.describeAvatar({ handedness: 'right' })).not.toMatch(/hand/);
        expect(A.describeAvatar({ handSize: 'small', footSize: 'large', muscles: 'buff' })).toMatch(/a buff, straight build with small hands and large feet, /);
        expect(A.describeAvatar({ handSize: 'xl' })).toMatch(/a straight build with extra-large hands, /);
        // The new builds, as a person would say them (2026-10-26).
        expect(A.describeAvatar({ build: 'pear' })).toMatch(/, a pear-shaped build, /);
        expect(A.describeAvatar({ build: 'broad', muscles: 'buff' })).toMatch(/, a buff, broad-shouldered build, /);
        expect(A.describeAvatar({ build: 'round' })).toMatch(/, a round build, /);
        expect(A.describeAvatar({ build: 'full', handSize: 'large' })).toMatch(/, a full-figured build with large hands, /);
        // The one-pieces, bare legs and the underlayer (2026-10-26).
        expect(A.describeAvatar({ sleeves: 'leotard', shirt: 'navy', bottom: 'bare' })).toMatch(/a navy leotard, bare legs, and classic black shoes\.$/);
        expect(A.describeAvatar({ sleeves: 'bodysuit', shirt: 'navy', bottom: 'tutu', bottomColor: 'black' })).toMatch(/a navy bodysuit, a black tutu, and /);
        expect(A.describeAvatar({ sleeves: 'short', bottom: 'bare', bottomColor: 'navy' })).toMatch(/with short sleeves, navy shorts, and /);
        expect(A.describeAvatar({ bottom: 'shorts', legwear: 'fishnets', armwear: 'fishnetSleeves', armwearColor: 'red' }))
            .toMatch(/navy shorts, black fishnets, red fishnet sleeves, and classic black shoes\.$/);
        expect(A.describeAvatar({ legwear: 'kneeSocks', legwearColor: 'white', hat: 'cap' })).toMatch(/navy pants, white knee socks, classic black shoes, and a navy ball cap\.$/);
    });

    test('bare legs are worn only under a one-piece; with any other shirt the figure wears shorts (2026-10-26)', () => {
        expect(A.wornBottom({ sleeves: 'leotard', bottom: 'bare' })).toBe('bare');
        expect(A.wornBottom({ sleeves: 'bodysuit', bottom: 'bare' })).toBe('bare');
        expect(A.wornBottom({ sleeves: 'short', bottom: 'bare' })).toBe('shorts');
        expect(A.wornBottom({ sleeves: 'long', bottom: 'skirt' })).toBe('skirt');
        expect(A.wornBottom({ bottom: 'nope' })).toBe('pants');
        expect(A.wornBottom(null)).toBe('pants');
        // The choice itself is kept (it comes back when a one-piece does).
        expect(A.normalizeAvatar({ sleeves: 'short', bottom: 'bare' }).bottom).toBe('bare');
        expect(A.personConfig({ sleeves: 'leotard', bottom: 'bare' }).hasSkirt).toBe(false);
        expect(A.personConfig({ sleeves: 'bodysuit' })).toMatchObject({ sleeveColor: A.colorOf('shirt', 'rust') });
        expect(A.personConfig({ sleeves: 'leotard' }).sleeveColor).toBeNull();
        expect(A.describeAvatar({ sleeves: 'vneck', shirt: 'navy' })).toMatch(/a navy V-neck shirt, /);
    });

    test('a jersey number is one of a list of 102, drawn as its digits, and said with its color (2026-10-26)', () => {
        // None, 0 to 99, and 00: a number is an id like any other, so a
        // link or a file holding one is checked the same way.
        expect(A.JERSEY_NUMBERS).toHaveLength(102);
        expect(A.JERSEY_NUMBERS[0]).toEqual({ id: 'none', label: 'None', digits: '' });
        expect(A.optionOf(A.JERSEY_NUMBERS, 'n8')).toEqual({ id: 'n8', label: '8', digits: '8' });
        expect(A.optionOf(A.JERSEY_NUMBERS, 'n99').digits).toBe('99');
        expect(A.optionOf(A.JERSEY_NUMBERS, 'n00')).toEqual({ id: 'n00', label: '00', digits: '00' });
        expect(A.optionOf(A.JERSEY_NUMBERS, 'n100')).toBeFalsy();
        expect(A.optionOf(A.JERSEY_NUMBERS, 'n08')).toBeFalsy();
        expect(A.normalizeAvatar({ jerseyNumber: '8' }).jerseyNumber).toBe('none');
        expect(A.normalizeAvatar({ jerseyNumber: 'n8', numberColor: 'gold' })).toMatchObject({ jerseyNumber: 'n8', numberColor: 'gold' });
        // The number's color takes any color, like every other color field.
        expect(A.COLOR_FIELDS).toContain('numberColor');
        expect(A.normalizeAvatar({ numberColor: 'x241773' }).numberColor).toBe('x241773');
        expect(A.colorOf('numberColor', 'standard')).toBeNull();
        expect(A.colorOf('numberColor', 'white')).toBe(0xf2f0ea);
        // Said on the jersey, with the color when one is chosen; unsaid on
        // any other shirt, and the rig is never told of it.
        expect(A.describeAvatar({ sleeves: 'jersey', shirt: 'x241773', jerseyNumber: 'n8' })).toMatch(/a custom-color sports jersey with the number 8, /);
        expect(A.describeAvatar({ sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n00', numberColor: 'gold' })).toMatch(/a navy sports jersey with the number 00 in gold, /);
        expect(A.describeAvatar({ sleeves: 'jersey', shirt: 'navy' })).toMatch(/a navy sports jersey, /);
        expect(A.describeAvatar({ sleeves: 'short', jerseyNumber: 'n8', numberColor: 'gold' })).toBe(A.describeAvatar({ sleeves: 'short' }));
        expect(A.personConfig({ sleeves: 'jersey', jerseyNumber: 'n8' })).toEqual(A.personConfig({ sleeves: 'jersey' }));
    });

    test('every hair style is said the way a person would say it', () => {
        const say = (length) => A.describeAvatar({ length, hair: 'auburn' });
        expect(say('afro')).toMatch(/an auburn afro/);
        expect(say('mohawk')).toMatch(/an auburn mohawk/);
        expect(say('mullet')).toMatch(/an auburn mullet/);
        expect(A.describeAvatar({ length: 'bob', hair: 'blond' })).toMatch(/a blond bob/);
        expect(say('ponytail')).toMatch(/auburn hair in a ponytail/);
        expect(say('spaceBuns')).toMatch(/auburn hair in space buns/);
        expect(say('locs')).toMatch(/auburn locs/);
        expect(say('short')).toMatch(/short auburn hair/);
        expect(say('buzz')).toMatch(/buzzed auburn hair/);
        for (const style of A.HAIR_LENGTHS) {
            expect(A.describeAvatar({ length: style.id })).not.toMatch(/undefined|  |[;—]/);
        }
    });

    test('the face is said too, when it is not the usual', () => {
        expect(A.describeAvatar({ faceShape: 'oval', eyeShape: 'almond', cheeks: 'freckles' }))
            .toMatch(/^A figure with fair skin, an oval face, almond dark brown eyes, a gentle smile, freckles and short/);
        expect(A.describeAvatar({ eyeShape: 'lashes', cheeks: 'blush' })).toMatch(/dark brown eyes with long lashes, a gentle smile, rosy cheeks/);
        expect(A.describeAvatar({ facial: 'stubble', facialColor: 'fireRed' })).toMatch(/fire red stubble/);
    });
});

describe('a random avatar (Surprise me, 2026-10-26)', () => {
    test('every field is a real option of its list, never a custom color, and the whole is already valid', () => {
        const rand = rng(21);
        for (let i = 0; i < 300; i++) {
            const a = A.randomAvatar(rand);
            expect(Object.keys(a)).toEqual(['v', ...FIELD_KEYS]);
            for (const [key, list] of A.FIELDS) expect(`${key}: ${Boolean(A.optionOf(list, a[key]))}`).toBe(`${key}: true`);
            expect(A.normalizeAvatar(a)).toEqual(a);
            // Bare legs only under a one-piece; a number only on a jersey.
            if (a.bottom === 'bare') expect(['leotard', 'bodysuit']).toContain(a.sleeves);
            expect(`${a.sleeves}: ${a.jerseyNumber === 'none'}`).toBe(`${a.sleeves}: ${a.sleeves !== 'jersey'}`);
        }
        // Math.random by default.
        expect(A.normalizeAvatar(A.randomAvatar())).toEqual(A.randomAvatar(() => 0) === null ? null : expect.anything());
    });

    test('the mixed look is the free roll: a piece it can go without is worn about half the time, and every option comes up', () => {
        const rand = rng(8);
        const seen = {};
        const none = {};
        const N = 3000;
        for (let i = 0; i < N; i++) {
            const a = A.randomAvatar(rand, { look: 'mixed' });
            for (const key of FIELD_KEYS) {
                (seen[key] = seen[key] || new Set()).add(a[key]);
                if (a[key] === 'none') none[key] = (none[key] || 0) + 1;
            }
        }
        for (const key of ['facial', 'glasses', 'hat', 'legwear', 'armwear']) {
            expect(`${key}: ${Math.abs(none[key] / N - A.NONE_ODDS) < 0.04}`).toBe(`${key}: true`);
        }
        // A straight roll would wear a hat 13 times in 14: this test can fail.
        expect(none.hat / N).toBeGreaterThan(0.4);
        for (const [key, list] of A.FIELDS) {
            // A number is drawn only on a jersey: a hundred of them, a few
            // hundred jerseys, so most come up, not all.
            if (key === 'jerseyNumber') {
                expect(seen[key].size).toBeGreaterThan(60);
                continue;
            }
            const missing = list.filter((o) => !seen[key].has(o.id)).map((o) => o.id);
            expect(`${key} never drawn: ${missing.join()}`).toBe(`${key} never drawn: `);
        }
        // The lists hold no custom color, so none is ever drawn.
        for (const key of A.COLOR_FIELDS) for (const id of seen[key]) expect(A.CUSTOM_COLOR.test(id)).toBe(false);
    });

    test('the looks are sound: shares that sum to one, real ids, and something left to roll in every field', () => {
        const ids = A.RANDOM_LOOKS.map((l) => l.id);
        expect(ids).toEqual(['masculine', 'feminine', 'mixed']);
        expect(A.RANDOM_LOOKS.reduce((t, l) => t + l.share, 0)).toBeCloseTo(1, 9);
        for (const look of A.RANDOM_LOOKS) {
            expect(Object.isFrozen(look)).toBe(true);
            for (const [key, gone] of Object.entries(look.without)) {
                const list = A.listOf(key);
                expect(`${look.id}.${key} is a field: ${Boolean(list)}`).toBe(`${look.id}.${key} is a field: true`);
                // A typo would set nothing aside, silently.
                for (const id of gone) expect(`${look.id}.${key}.${id}: ${Boolean(A.optionOf(list, id))}`).toBe(`${look.id}.${key}.${id}: true`);
                const left = list.filter((o) => !gone.includes(o.id) && o.id !== 'none');
                expect(`${look.id}.${key} left: ${left.length > 0}`).toBe(`${look.id}.${key} left: true`);
            }
            for (const [key, odds] of Object.entries(look.none)) {
                expect(`${look.id}.${key} has a none: ${Boolean(A.optionOf(A.listOf(key), 'none'))}`).toBe(`${look.id}.${key} has a none: true`);
                expect(odds).toBeGreaterThanOrEqual(0);
                expect(odds).toBeLessThanOrEqual(1);
            }
        }
    });

    test('each look keeps to itself: no facial hair on the feminine, no skirts, heels or layers on the masculine', () => {
        const rand = rng(31);
        const N = 1500;
        for (const look of ['masculine', 'feminine']) {
            const rules = A.RANDOM_LOOKS.find((l) => l.id === look);
            let bearded = 0;
            for (let i = 0; i < N; i++) {
                const a = A.randomAvatar(rand, { look });
                expect(A.normalizeAvatar(a)).toEqual(a);
                for (const [key, gone] of Object.entries(rules.without)) {
                    expect(`${look} ${key}: ${gone.includes(a[key]) ? a[key] : 'kept'}`).toBe(`${look} ${key}: kept`);
                }
                for (const [key, odds] of Object.entries(rules.none)) {
                    if (odds === 1) expect(`${look} ${key}: ${a[key]}`).toBe(`${look} ${key}: none`);
                }
                if (a.facial !== 'none') bearded++;
            }
            // Facial hair on about half of the masculine look, and never on
            // the feminine (Steve: "female NPCs usually don't have facial
            // hair"). Layers never on the masculine.
            if (look === 'masculine') expect(Math.abs(bearded / N - (1 - A.NONE_ODDS))).toBeLessThan(0.05);
            else expect(bearded).toBe(0);
        }
        // A look that names nothing is rolled as usual.
        expect(A.normalizeAvatar(A.randomAvatar(rng(2), { look: 'nobody' }))).toBeTruthy();
    });

    test('rolled by share: about one in ten is left-handed, and now and then a stranger is a real surprise', () => {
        const rand = rng(57);
        const N = 6000;
        let left = 0;
        let bearded = 0;
        let surprise = 0;
        const skirts = A.BOTTOMS.filter((o) => o.kind === 'skirt').map((o) => o.id);
        for (let i = 0; i < N; i++) {
            const a = A.randomAvatar(rand);
            if (a.handedness === 'left') left++;
            if (a.facial !== 'none') bearded++;
            if (a.facial !== 'none' && skirts.includes(a.bottom)) surprise++;
        }
        // Not the even roll it was (half of them left-handed).
        expect(Math.abs(left / N - A.LEFT_HANDED_ODDS)).toBeLessThan(0.02);
        // Facial hair at the looks' own odds, weighed by their shares.
        const expected = A.RANDOM_LOOKS.reduce((t, l) => t + l.share * (1 - (l.none.facial ?? A.NONE_ODDS)), 0);
        expect(Math.abs(bearded / N - expected)).toBeLessThan(0.03);
        // Only the mixed look puts a beard over a skirt: rare, never gone.
        expect(surprise).toBeGreaterThan(0);
        expect(surprise / N).toBeLessThan(0.04);
    });

    test('a generator that misbehaves still gives a real avatar', () => {
        for (const rand of [() => 1, () => -1, () => NaN, () => 'x', () => 2]) {
            const a = A.randomAvatar(rand);
            expect(A.normalizeAvatar(a)).toEqual(a);
        }
        expect(A.randomAvatar(() => 0).hat).toBe('none');
        expect(A.randomAvatar(() => 0.9999).hat).toBe('birthday');
    });
});

describe('the figure in words', () => {
    test('the default reads as one plain sentence', () => {
        expect(A.describeAvatar(null)).toBe('A figure with fair skin, dark brown eyes, a gentle smile and short dark brown hair, '
            + 'a straight build, a rust red shirt with long sleeves, navy pants, and classic black shoes.');
    });

    test('every piece is said the way a person would say it', () => {
        expect(A.describeAvatar({ length: 'bald', facial: 'stubble', glasses: 'sunglasses', bottom: 'skirt', bottomColor: 'khaki', shoes: 'maryJane', shoeColor: 'red', hat: 'beanie', hatColor: 'teal', sleeves: 'short' }))
            .toBe('A figure with fair skin, dark brown eyes, a gentle smile, no hair, stubble and sunglasses, a straight build, '
                + 'a rust red shirt with short sleeves, a khaki skirt, red mary janes, and a teal beanie.');
        expect(A.describeAvatar({ mouth: 'grin', lips: 'berry', glasses: 'roundSun', muscles: 'buff', sleeves: 'tank', bottom: 'shorts', shoes: 'cowboyBoots', shoeColor: 'brown' }))
            .toBe('A figure with fair skin, dark brown eyes, a grin and berry lips, short dark brown hair and round sunglasses, '
                + 'a buff, straight build, a rust red tank top, navy shorts, and brown cowboy boots.');
        expect(A.describeAvatar({ facial: 'beard', glasses: 'round', shoes: 'sneakers', shoeColor: 'white', length: 'buzz' }))
            .toMatch(/buzzed dark brown hair, a full beard and round glasses, .* white sneakers\.$/);
    });

    test('whatever the avatar, the sentence keeps the house style', () => {
        const rand = rng(5);
        for (let i = 0; i < 200; i++) {
            const s = A.describeAvatar(randomAvatar(rand));
            expect(s).toMatch(/^A figure with [a-z].*[a-z]\.$/);
            expect(s).not.toMatch(/[;—]|undefined|null|  /);
        }
    });
});

describe('the link', () => {
    test('the default\'s link is pinned, so the field order can never move under a link already sent', () => {
        expect(A.encodeLink(A.DEFAULT_AVATAR))
            .toBe('a=1.fair.darkBrown.darkBrown.short.none.none.straight.rust.long.pants.navy.classic.black.none.navy.smile.natural.standard'
                + '.match.natural.round.pointed.round.none.standard.standard.standard.standard.none.standard.none.black.none.black.right.none');
        // A link made before the mouth and the muscles (2026-10-23) still
        // opens, its new fields at their defaults.
        expect(A.decodeLink('#a=1.deep.blue.gray.long.beard.round.curvy.teal.short.skirt.khaki.maryJane.red.cap.mustard'))
            .toEqual({ v: 1, skin: 'deep', eyes: 'blue', hair: 'gray', length: 'long', facial: 'beard', glasses: 'round', build: 'curvy',
                shirt: 'teal', sleeves: 'short', bottom: 'skirt', bottomColor: 'khaki', shoes: 'maryJane', shoeColor: 'red', hat: 'cap',
                hatColor: 'mustard', mouth: 'smile', lips: 'natural', muscles: 'standard',
                facialColor: 'match', brows: 'natural', eyeShape: 'round', nose: 'pointed', faceShape: 'round', cheeks: 'none',
                frameColor: 'standard', lensColor: 'standard', handSize: 'standard', footSize: 'standard', jerseyNumber: 'none', numberColor: 'standard', legwear: 'none', legwearColor: 'black', armwear: 'none', armwearColor: 'black',
                handedness: 'right', jerseyName: 'none' });
        expect(A.linkUrl(A.DEFAULT_AVATAR, 'https://www.scenexp.com/'))
            .toBe(`https://www.scenexp.com/avatar/#${A.encodeLink(A.DEFAULT_AVATAR)}`);
        expect(A.linkUrl(null, '')).toBe(`/avatar/#${A.encodeLink(null)}`);
    });

    test('every avatar comes back from its own link, and the link stays short', () => {
        const rand = rng(11);
        let longest = 0;
        for (let i = 0; i < 300; i++) {
            const a = randomAvatar(rand);
            const link = A.encodeLink(a);
            longest = Math.max(longest, link.length);
            expect(A.decodeLink(`#${link}`)).toEqual(a);
            expect(A.decodeLink(link)).toEqual(a);
            expect(A.decodeLink(`#x=1&${link}&y=2`)).toEqual(a);
        }
        expect(longest).toBeLessThan(A.MAX_LINK / 2);
        // Even with every color custom, a link is well inside what is read.
        const allCustom = { ...randomAvatar(rand) };
        for (const f of A.COLOR_FIELDS) allCustom[f] = 'xabcdef';
        expect(A.decodeLink(A.encodeLink(allCustom))).toEqual(A.normalizeAvatar(allCustom));
        expect(A.encodeLink(allCustom).length).toBeLessThan(A.MAX_LINK / 1.5);
    });

    test('a link it cannot read is null, and a short or odd one fills in the defaults', () => {
        for (const bad of [undefined, null, 5, '', '#', '#b=1.fair', '#a=', '#a=2.deep', '#a=1', '#a=1.x.y.z',
            `#a=1.${'deep.'.repeat(200)}`]) {
            expect(A.decodeLink(bad)).toBeNull();
        }
        expect(A.decodeLink('#a=1.deep')).toEqual({ ...A.DEFAULT_AVATAR, skin: 'deep' });
        expect(A.decodeLink('#a=1.deep.nope.gray')).toEqual({ ...A.DEFAULT_AVATAR, skin: 'deep', hair: 'gray' });
        // Extra parts past the last field are ignored.
        expect(A.decodeLink(`#${A.encodeLink({ skin: 'tan' })}.more.parts`)).toEqual({ ...A.DEFAULT_AVATAR, skin: 'tan' });
    });
});

describe('the file', () => {
    test('round trip, and the portrait and anything else stay out of it', () => {
        const rand = rng(3);
        for (let i = 0; i < 50; i++) {
            const a = randomAvatar(rand);
            const text = A.toFile(a);
            expect(A.fromFile(text)).toEqual(a);
            const data = JSON.parse(text);
            expect(Object.keys(data)).toEqual(['scenexp', 'v', 'avatar']);
            expect(Object.keys(data.avatar)).toEqual(FIELD_KEYS);
            expect(text.length).toBeLessThan(A.MAX_FILE / 4);
        }
        expect(A.FILE_NAME).toBe('scenexp-avatar.json');
    });

    test('anything else is null: too big, not JSON, not ours, another version, no avatar', () => {
        const good = JSON.parse(A.toFile({ skin: 'deep' }));
        const as = (o) => JSON.stringify(o);
        for (const bad of [
            undefined, null, 12, '', 'hello', '{', '[]', 'null', '"avatar"',
            as({ ...good, scenexp: 'garden' }), as({ ...good, scenexp: undefined }),
            as({ ...good, v: 2 }), as({ ...good, v: '1' }),
            as({ ...good, avatar: null }), as({ ...good, avatar: ['deep'] }), as({ ...good, avatar: 'deep' }),
            // Within the cap in characters but padded past it.
            as({ ...good, pad: 'x'.repeat(A.MAX_FILE) })
        ]) {
            expect(A.fromFile(bad)).toBeNull();
        }
    });

    test('hostile contents are reduced to known ids, and nothing is polluted', () => {
        const hostile = '{"scenexp":"avatar","v":1,"avatar":{"__proto__":{"skin":"deep"},"skin":{"toString":1},' +
            '"hair":"blond","hat":"<img src=x>","constructor":{"prototype":{"polluted":1}}}}';
        expect(A.fromFile(hostile)).toEqual({ ...A.DEFAULT_AVATAR, hair: 'blond' });
        expect({}.polluted).toBeUndefined();
        // Deeply nested, within the cap.
        const deep = `{"scenexp":"avatar","v":1,"avatar":{"skin":${'['.repeat(1500)}${']'.repeat(1500)}}}`;
        expect(deep.length).toBeLessThan(A.MAX_FILE);
        expect(A.fromFile(deep)).toEqual(A.DEFAULT_AVATAR);
    });
});

describe('the store', () => {
    const PNG = `data:image/png;base64,${'iVBORw0KGgo'.repeat(10)}AAA=`;

    test('nothing saved: the default, and not saved. Saved: kept as given, made valid', () => {
        const ls = installStorage();
        const store = A.createAvatarStore({ win: null });
        expect(store.hasSaved()).toBe(false);
        expect(store.load()).toEqual(A.DEFAULT_AVATAR);
        expect(store.save({ skin: 'deep', name: 'x' })).toBe(true);
        expect(store.hasSaved()).toBe(true);
        expect(store.load()).toEqual({ ...A.DEFAULT_AVATAR, skin: 'deep' });
        expect(JSON.parse(ls.map.get('scenexp-avatar')).name).toBeUndefined();
        // Saving exactly the default still counts as saved.
        store.save(A.DEFAULT_AVATAR);
        expect(store.hasSaved()).toBe(true);
    });

    test('saved means the key exists, whatever it holds, and what it holds is made valid', () => {
        const ls = installStorage();
        const store = A.createAvatarStore({ win: null });
        for (const junk of ['', 'not json', '[1,2]', '{"skin":"deep"', 'x'.repeat(5000)]) {
            ls.map.set('scenexp-avatar', junk);
            expect(store.hasSaved()).toBe(true);
            expect(store.load()).toEqual(A.DEFAULT_AVATAR);
        }
    });

    test('forget takes the avatar and its portrait, and leaves the label\'s rule', () => {
        const ls = installStorage();
        const store = A.createAvatarStore({ win: null });
        store.save({ skin: 'tan' });
        store.savePortrait(PNG, 1);
        store.dismissLabel();
        expect(store.forget()).toBe(true);
        expect(store.hasSaved()).toBe(false);
        expect(store.loadPortrait()).toBeNull();
        expect([...ls.map.keys()]).toEqual(['scenexp-avatar-chip']);
        expect(store.chip().dismissed).toBe(true);
    });

    test('a browser that refuses storage gets the default and false, never an error', () => {
        const ls = installStorage();
        ls.refuseRead = true;
        ls.refuseWrite = true;
        const store = A.createAvatarStore({ win: null });
        expect(store.hasSaved()).toBe(false);
        expect(store.load()).toEqual(A.DEFAULT_AVATAR);
        expect(store.save({})).toBe(false);
        expect(store.forget()).toBe(false);
        expect(store.savePortrait(PNG, 1)).toBe(false);
        expect(store.loadPortrait()).toBeNull();
        expect(store.noteVisit()).toEqual({ seen: 1, dismissed: false });
        expect(store.dismissLabel()).toBe(false);
        // No localStorage at all, and one whose very name throws.
        delete globalThis.localStorage;
        expect(A.createAvatarStore({ win: null }).load()).toEqual(A.DEFAULT_AVATAR);
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
        const blocked = A.createAvatarStore({ win: null });
        expect(blocked.hasSaved()).toBe(false);
        expect(blocked.save({})).toBe(false);
    });

    test('a portrait is a PNG or JPEG data URL of a sane size, with its render version', () => {
        const ls = installStorage();
        const store = A.createAvatarStore({ win: null });
        expect(store.savePortrait(PNG, 1)).toBe(true);
        expect(store.loadPortrait()).toEqual({ r: 1, src: PNG });
        const jpeg = PNG.replace('png', 'jpeg');
        expect(store.savePortrait(jpeg, 2)).toBe(true);
        expect(store.loadPortrait()).toEqual({ r: 2, src: jpeg });
        for (const [src, r] of [
            ['javascript:alert(1)', 1], ['data:image/svg+xml;base64,PHN2Zz4=', 1], ['data:text/html;base64,PGI+', 1],
            [`${PNG}"onerror="x`, 1], [`data:image/png;base64,${'A'.repeat(A.MAX_PORTRAIT)}`, 1],
            [PNG, 1.5], [PNG, '1'], [42, 1]
        ]) {
            expect(A.validPortraitSrc(src) && Number.isInteger(r)).toBe(false);
            expect(store.savePortrait(src, r)).toBe(false);
        }
        // Whatever somebody wrote by hand is checked on the way out too.
        for (const stored of ['{"r":1,"src":"javascript:alert(1)"}', '{"r":"1","src":"' + PNG + '"}', 'nope', '[]']) {
            ls.map.set('scenexp-avatar-portrait', stored);
            expect(store.loadPortrait()).toBeNull();
        }
    });

    test('the label shows for three home visits, never once saved or dismissed', () => {
        expect(A.chipLabelShown()).toBe(true);
        expect(A.chipLabelShown({ seen: 1 })).toBe(true);
        expect(A.chipLabelShown({ seen: A.CHIP_LABEL_VISITS })).toBe(true);
        expect(A.chipLabelShown({ seen: A.CHIP_LABEL_VISITS + 1 })).toBe(false);
        expect(A.chipLabelShown({ seen: 1, saved: true })).toBe(false);
        expect(A.chipLabelShown({ seen: 1, dismissed: true })).toBe(false);
        const ls = installStorage();
        const store = A.createAvatarStore({ win: null });
        expect(store.chip()).toEqual({ seen: 0, dismissed: false });
        expect(store.noteVisit()).toEqual({ seen: 1, dismissed: false });
        expect(store.noteVisit()).toEqual({ seen: 2, dismissed: false });
        ls.map.set('scenexp-avatar-chip', '{"seen": 99, "dismissed": "yes"}');
        expect(store.noteVisit()).toEqual({ seen: 99, dismissed: false });
        ls.map.set('scenexp-avatar-chip', '{"seen": -4.5}');
        expect(store.chip()).toEqual({ seen: 0, dismissed: false });
        store.dismissLabel();
        expect(store.chip().dismissed).toBe(true);
    });

    test('another tab saving or forgetting is heard, and nothing else is', () => {
        installStorage();
        const listeners = new Set();
        const win = {
            addEventListener: (type, fn) => type === 'storage' && listeners.add(fn),
            removeEventListener: (type, fn) => listeners.delete(fn)
        };
        const heard = [];
        const store = A.createAvatarStore({ win });
        const stop = store.onChange((key) => heard.push(key));
        for (const key of ['scenexp-avatar', 'leaves-character', 'scenexp-avatar-portrait', 'scenexp-avatar-chip', null]) {
            listeners.forEach((fn) => fn({ key }));
        }
        expect(heard).toEqual(['scenexp-avatar', 'scenexp-avatar-portrait', null]);
        stop();
        expect(listeners.size).toBe(0);
        expect(typeof A.createAvatarStore({ win: null }).onChange(() => {})).toBe('function');
        expect(typeof store.onChange('not a function')).toBe('function');
    });
});

describe('the corner chip', () => {
    function parts() {
        const listeners = {};
        const el = () => ({ hidden: false, alt: '', src: '', focused: false });
        const hide = {
            ...el(),
            addEventListener: (t, fn) => { listeners[t] = fn; },
            removeEventListener: (t) => { delete listeners[t]; },
            click: () => listeners.click && listeners.click()
        };
        const link = { focus() { link.focused = true; }, focused: false };
        return { img: el(), label: el(), hide, link, listeners };
    }
    const PNG = `data:image/png;base64,${'iVBORw0KGgo'.repeat(10)}AAA=`;

    test('a first visit: the default picture and the label, the picture silent beside its words', () => {
        installStorage();
        const els = parts();
        const chip = A.installChip(els, { store: A.createAvatarStore({ win: null }), defaultSrc: '/assets/avatar/default.png' });
        expect(chip.saved).toBe(false);
        expect(chip.labelShown).toBe(true);
        expect(els.img.src).toBe('/assets/avatar/default.png');
        expect(els.label.hidden).toBe(false);
        expect(els.img.alt).toBe('');
        expect(els.link.title).toBe(A.CHIP_TITLES.unsaved);
        // Folded away: the picture names the link, focus stays on it, and
        // it stays folded.
        els.hide.click();
        expect(els.label.hidden).toBe(true);
        expect(els.hide.hidden).toBe(true);
        expect(els.img.alt).toBe('Make your avatar');
        expect(els.link.focused).toBe(true);
        const again = parts();
        expect(A.installChip(again, { store: A.createAvatarStore({ win: null }) }).labelShown).toBe(false);
        chip.dispose();
        expect(els.listeners.click).toBeUndefined();
    });

    test('the fourth visit folds the label, and a saved avatar shows its own portrait', () => {
        installStorage();
        const store = A.createAvatarStore({ win: null });
        for (let i = 0; i < A.CHIP_LABEL_VISITS; i++) expect(A.installChip(parts(), { store }).labelShown).toBe(true);
        expect(A.installChip(parts(), { store }).labelShown).toBe(false);
        store.save({ skin: 'deep' });
        store.savePortrait(PNG, 1);
        const els = parts();
        const chip = A.installChip(els, { store, defaultSrc: '/d.png' });
        expect(chip.saved).toBe(true);
        expect(els.img.src).toBe(PNG);
        expect(els.img.alt).toBe('Your avatar');
        expect(els.link.title).toBe(A.CHIP_TITLES.saved);
        // Forgotten in another tab: back to the default picture.
        store.forget();
        chip.refresh();
        expect(chip.saved).toBe(false);
        expect(els.img.src).toBe('/d.png');
        expect(els.img.alt).toBe('Make your avatar');
        expect(els.link.title).toBe(A.CHIP_TITLES.unsaved);
    });

    test('a scene\'s welcome card shows the chip without counting a home visit (M6, 2026-10-26)', () => {
        installStorage();
        const store = A.createAvatarStore({ win: null });
        for (let i = 0; i < 3; i++) expect(A.installChip(parts(), { store, countVisit: false }).labelShown).toBe(true);
        expect(store.chip().seen).toBe(0);
        // The home page's own count is untouched by them, and still folds
        // the label on its own schedule.
        for (let i = 0; i <= A.CHIP_LABEL_VISITS; i++) A.installChip(parts(), { store });
        expect(A.installChip(parts(), { store, countVisit: false }).labelShown).toBe(false);
        expect(store.chip().seen).toBe(A.CHIP_LABEL_VISITS + 1);
    });

    test('saved but with no portrait yet keeps the default picture, and no image means no chip', () => {
        installStorage();
        const store = A.createAvatarStore({ win: null });
        store.save({});
        const els = parts();
        els.img.src = '/markup.png';
        A.installChip(els, { store });
        expect(els.img.src).toBe('/markup.png');
        expect(A.installChip({}, { store })).toBeNull();
        expect(A.installChip(null, { store })).toBeNull();
        // Parts the page left out are simply not touched.
        const bare = { img: { alt: '', src: '' } };
        expect(A.installChip(bare, { store }).saved).toBe(true);
    });
});

describe('the name on the jersey\'s back (Steve\'s son, 2026-10-28)', () => {
    test('typing makes a name: capitals, accents dropped, curly apostrophes made straight, anything else left out, twelve at most', () => {
        const cases = [
            ['Smith', 'SMITH'], ['van  dyke', 'VAN DYKE'], ['O’Neil', "O'NEIL"], ['José', 'JOSE'], ['Zoë', 'ZOE'],
            ['smith-jones', 'SMITH-JONES'], ['  lead', 'LEAD'], ['<b>x</b>', 'BXB'], ['straße', 'STRASSE'],
            ['abcdefghijklmnop', 'ABCDEFGHIJKL'], ['NONE', 'NONE'], ['de la cruz ', 'DE LA CRUZ']
        ];
        for (const [typed, name] of cases) expect(`${typed}: ${A.jerseyName(typed)}`).toBe(`${typed}: ${name}`);
        // Nothing that is a name: none.
        for (const typed of ['', '   ', '12345', '---', "'", '\u{1F600}', null, undefined, 42]) expect(A.jerseyName(typed)).toBe('none');
        // While typing, the box keeps a space at the end for the next word.
        expect(A.typedJerseyName('van ')).toBe('VAN ');
        expect(A.typedJerseyName(' van')).toBe('VAN');
        expect(A.typedJerseyName('a'.repeat(20))).toHaveLength(A.JERSEY_NAME.max);
    });

    test('only a real name is kept from anywhere; none is the default, and NONE is a name', () => {
        expect(A.DEFAULT_AVATAR.jerseyName).toBe('none');
        // The field is the last, appended: links made before still read.
        expect(A.FIELDS[A.FIELDS.length - 1][0]).toBe('jerseyName');
        for (const name of ['SMITH', "O'NEIL", 'VAN DYKE', 'SMITH-JONES', 'ABCDEFGHIJKL', 'NONE', 'X']) {
            expect(A.normalizeAvatar({ jerseyName: name }).jerseyName).toBe(name);
            expect(A.isJerseyName(name)).toBe(true);
        }
        // Lower case, too long, marks it cannot hold, spaces at the ends or
        // twice, no letter at all, markup, and anything not a string: none.
        for (const name of ['smith', 'ABCDEFGHIJKLM', 'SMITH!', 'SMITH.', ' SMITH', 'SMITH ', 'VAN  DYKE', '---', "'", '<B>', 'SMÍTH', 'NO\nLL', 7, null, ['SMITH'], { SMITH: 1 }]) {
            expect(`${JSON.stringify(name)}: ${A.normalizeAvatar({ jerseyName: name }).jerseyName}`).toBe(`${JSON.stringify(name)}: none`);
        }
        expect(A.isJerseyName('none')).toBe(false);
        // A scene's overrides are held to the same rule.
        expect(A.withOverrides({}, { jerseyName: 'SMITH' }).jerseyName).toBe('SMITH');
        expect(A.withOverrides({ jerseyName: 'SMITH' }, { jerseyName: '<i>' }).jerseyName).toBe('SMITH');
    });

    test('a link carries the name in characters a URL keeps as they are, and reads it back; an older link has none', () => {
        const a = A.normalizeAvatar({ sleeves: 'jersey', jerseyNumber: 'n8', jerseyName: "O'NEIL VAN" });
        const link = A.encodeLink(a);
        expect(link.endsWith(".O%27NEIL_VAN")).toBe(true);
        expect(link).toMatch(/^[A-Za-z0-9\-._~!$&()*+,;=:@/?%]*$/);
        expect(link).not.toMatch(/[ ']/);
        expect(A.decodeLink(link)).toEqual(a);
        expect(A.decodeLink(`#${link}&m=2/x`)).toEqual(a);
        // A browser that left the apostrophe as it is, or one that wrote the
        // space as %20: the same name.
        expect(A.decodeLink(link.replace('%27', "'")).jerseyName).toBe("O'NEIL VAN");
        expect(A.decodeLink(link.replace('_', '%20')).jerseyName).toBe("O'NEIL VAN");
        // A link from before the name: the same figure, no name.
        const older = link.slice(0, link.lastIndexOf('.'));
        expect(A.decodeLink(older)).toEqual({ ...a, jerseyName: 'none' });
        // A broken or hostile name part is none; the rest still reads.
        for (const bad of ['%E0%A4%A', '%3Cscript%3E', 'smith', 'A'.repeat(40), '..']) {
            const back = A.decodeLink(`${older}.${bad}`);
            expect(back.jerseyName).toBe('none');
            expect(back.jerseyNumber).toBe('n8');
        }
        // The longest name still leaves the link far under its ceiling.
        expect(A.encodeLink({ ...a, jerseyName: "O'O'O'O'O'O'" }).length).toBeLessThan(A.MAX_LINK / 2);
    });

    test('a file keeps it, a stranger never has one, and the figure in words says it', () => {
        const a = A.normalizeAvatar({ sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n8', jerseyName: 'SMITH' });
        expect(A.fromFile(A.toFile(a))).toEqual(a);
        const rand = rng(5);
        for (let i = 0; i < 300; i++) expect(A.randomAvatar(rand).jerseyName).toBe('none');
        expect(A.describeAvatar(a)).toMatch(/a navy sports jersey with the name SMITH and the number 8,/);
        expect(A.describeAvatar({ ...a, jerseyNumber: 'none' })).toMatch(/a navy sports jersey with the name SMITH,/);
        expect(A.describeAvatar({ ...a, numberColor: 'gold' })).toMatch(/with the name SMITH and the number 8 in gold,/);
        // Off the jersey the name is kept but neither drawn nor said.
        expect(A.describeAvatar({ ...a, sleeves: 'short' })).not.toMatch(/SMITH/);
        expect(A.normalizeAvatar({ ...a, sleeves: 'short' }).jerseyName).toBe('SMITH');
    });
});
