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
            'facialColor', 'brows', 'eyeShape', 'nose', 'faceShape', 'cheeks']);
        for (const [key, list] of A.FIELDS) {
            const ids = list.map((o) => o.id);
            expect(`${key}: ${new Set(ids).size}`).toBe(`${key}: ${ids.length}`);
            // Ids travel in a link between dots, so they are plain letters.
            for (const id of ids) expect(id).toMatch(/^[A-Za-z]+$/);
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
        expect(A.HAIR_LENGTHS).toBe(HAIR_LENGTHS);
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
        expect(A.GLASSES.map((o) => o.id)).toEqual(['none', 'round', 'square', 'sunglasses', 'roundSun']);
        expect(A.MOUTHS.map((o) => o.id)).toEqual(['smile', 'bigSmile', 'grin', 'smirk', 'surprised']);
        expect(A.LIP_COLORS.map((o) => o.id)).toEqual(['natural', 'rose', 'red', 'berry', 'softPink']);
        expect(A.MUSCLES.map((o) => o.label)).toEqual(['Standard', 'Athletic', 'Buff']);
        expect(A.SLEEVES.map((o) => o.id)).toEqual(['long', 'short', 'tank']);
        expect(A.BOTTOMS.map((o) => o.id)).toEqual(['pants', 'skirt', 'shorts']);
        // Natural lips have no color of their own (they are the skin's), only
        // a swatch to show; every other lip color has one.
        for (const o of A.LIP_COLORS) expect(o.id === 'natural' ? o.color === null && o.swatch > 0 : o.color > 0).toBe(true);
        expect(A.BUILDS.map((o) => o.label)).toEqual(['Straight', 'Slim', 'Curvy']);
        expect(A.SHOES.map((o) => o.id)).toEqual(['classic', 'sneakers', 'maryJane', 'ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots']);
        // Named by style, never by who wears them (Steve, 2026-10-24).
        for (const o of A.SHOES) expect(o.label).not.toMatch(/\b(men|women|man|woman|boy|girl|lady|ladies)/i);
        expect(A.SHOE_COLORS.map((o) => o.id)).toEqual(['black', 'brown', 'white', 'navy', 'red']);
        expect(A.HATS.map((o) => o.id)).toEqual(['none', 'cap', 'beanie', 'sunHat']);
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
            facialColor: 'match', brows: 'natural', eyeShape: 'round', nose: 'pointed', faceShape: 'round', cheeks: 'none'
        });
        // No free text survives, whatever it was called.
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
        expect(A.personConfig({ shoes: 'maryJane', shoeColor: 'red' })).toMatchObject({ shoeStyle: 'maryJane', shoeColor: 0x9c2b25 });
        expect(A.personConfig({ shoes: 'sneakers' }).shoeStyle).toBe('block');
        for (const boots of ['ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots']) expect(A.personConfig({ shoes: boots }).shoeStyle).toBe('block');
        expect(A.personConfig({ muscles: 'buff' }).muscular).toBe(true);
        expect(A.personConfig({ muscles: 'athletic' }).muscular).toBe(false);
        expect(A.personConfig({ sleeves: 'tank' }).sleeveColor).toBeNull();
        expect(A.personConfig({ bottom: 'shorts' }).hasSkirt).toBe(false);
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
    });

    test('the face is said too, when it is not the usual', () => {
        expect(A.describeAvatar({ faceShape: 'oval', eyeShape: 'almond', cheeks: 'freckles' }))
            .toMatch(/^A figure with fair skin, an oval face, almond dark brown eyes, a gentle smile, freckles and short/);
        expect(A.describeAvatar({ eyeShape: 'lashes', cheeks: 'blush' })).toMatch(/dark brown eyes with long lashes, a gentle smile, rosy cheeks/);
        expect(A.describeAvatar({ facial: 'stubble', facialColor: 'fireRed' })).toMatch(/fire red stubble/);
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
                + '.match.natural.round.pointed.round.none');
        // A link made before the mouth and the muscles (2026-10-23) still
        // opens, its new fields at their defaults.
        expect(A.decodeLink('#a=1.deep.blue.gray.long.beard.round.curvy.teal.short.skirt.khaki.maryJane.red.cap.mustard'))
            .toEqual({ v: 1, skin: 'deep', eyes: 'blue', hair: 'gray', length: 'long', facial: 'beard', glasses: 'round', build: 'curvy',
                shirt: 'teal', sleeves: 'short', bottom: 'skirt', bottomColor: 'khaki', shoes: 'maryJane', shoeColor: 'red', hat: 'cap',
                hatColor: 'mustard', mouth: 'smile', lips: 'natural', muscles: 'standard',
                facialColor: 'match', brows: 'natural', eyeShape: 'round', nose: 'pointed', faceShape: 'round', cheeks: 'none' });
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
        expect(longest).toBeLessThan(200);
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
        // Forgotten in another tab: back to the default picture.
        store.forget();
        chip.refresh();
        expect(chip.saved).toBe(false);
        expect(els.img.src).toBe('/d.png');
        expect(els.img.alt).toBe('Make your avatar');
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
