// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared figure choice (www/shared/js/cast-1.0.0.js; not to be confused
 * with shared-cast.test.mjs, the npcs and pedestrians sweep), from SOURCE so the
 * coverage report counts it: the options, a choice made valid part by part,
 * the createPerson() settings, the sentence, and the store under a scene's
 * own key, in a browser that keeps things, one that refuses, and one with no
 * storage at all.
 *
 * Leaf Blower's own wrapper (www/leaves/js/cast.js) is held by
 * tests/leaves-cast.test.mjs, which proves the move changed nothing there.
 */
const K = await import('../www/shared/js/cast-1.0.0.js');

/** A stand-in for localStorage, or one that refuses every call. */
function storage({ refuse = false } = {}) {
    const map = new Map();
    const no = () => { throw new Error('SecurityError'); };
    return {
        getItem: refuse ? no : (k) => (map.has(k) ? map.get(k) : null),
        setItem: refuse ? no : (k, v) => { map.set(k, String(v)); },
        removeItem: refuse ? no : (k) => { map.delete(k); },
        map
    };
}

let saved;
beforeEach(() => { saved = globalThis.localStorage; });
afterEach(() => { globalThis.localStorage = saved; });

describe('the choices', () => {
    test('every option list has unique ids and a label free of em-dashes and semicolons', () => {
        for (const list of [K.SHIRTS, K.PANTS, K.SKINS, K.HAIR_COLORS, K.HAIR_LENGTHS]) {
            const ids = list.map((o) => o.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const o of list) expect(o.label).not.toMatch(/[—;]/);
        }
        // The default names a real option in every part.
        expect(K.normalizeChoice(K.DEFAULT_CHOICE)).toEqual(K.DEFAULT_CHOICE);
    });

    test('optionOf finds by id, and nearestOption maps a color onto the closest swatch', () => {
        expect(K.optionOf(K.SKINS, 'tan').color).toBe(0xa86f47);
        expect(K.optionOf(K.SKINS, 'plaid')).toBeNull();
        expect(K.nearestOption(K.SHIRTS, 0x9c2b25)).toBe('rust');
        expect(K.nearestOption(K.PANTS, 0x1a1a1a)).toBe('black');
        expect(K.nearestOption(K.SHIRTS, 0xffffff)).toBe('white');
    });

    test('anything stored comes back valid, part by part, against the given defaults', () => {
        expect(K.normalizeChoice(null)).toEqual(K.DEFAULT_CHOICE);
        expect(K.normalizeChoice('nonsense')).toEqual(K.DEFAULT_CHOICE);
        const mine = { shirt: 'teal', pants: 'black', skin: 'deep', hair: 'gray', length: 'long' };
        expect(K.normalizeChoice({ shirt: 'plaid', skin: 'tan' }, mine)).toEqual({ ...mine, skin: 'tan' });
        // Nothing extra rides along.
        expect(Object.keys(K.normalizeChoice({ ...mine, preset: 'runner', x: 1 }))).toEqual(['shirt', 'pants', 'skin', 'hair', 'length']);
    });

    test('personConfig gives the colors and hair, long sleeves in the shirt color, with extras laid over', () => {
        const c = K.personConfig({ shirt: 'white', pants: 'khaki', skin: 'deep', hair: 'auburn', length: 'buzz' });
        expect(c).toEqual({
            shirtColor: 0xf2f2f2, sleeveColor: 0xf2f2f2, pantsColor: 0xb5a58a,
            skinTone: 0x553522, hairColor: 0x8c3f22, hairStyle: 'buzz', bald: false
        });
        const bald = K.personConfig({ length: 'bald' }, { role: 'spectator', sleeveColor: null });
        expect(bald).toMatchObject({ bald: true, hairStyle: 'short', role: 'spectator', sleeveColor: null });
    });

    test('outfitWords reads in a sentence', () => {
        expect(K.outfitWords({ shirt: 'pumpkin', pants: 'denim' })).toBe('a pumpkin orange shirt and denim blue pants');
        expect(K.outfitWords(null)).toBe('a rust red shirt and navy pants');
    });
});

describe('the store', () => {
    test('saved, read back and forgotten under the scene\'s own key only', () => {
        globalThis.localStorage = storage();
        const a = K.createCastStore('scene-a');
        const b = K.createCastStore('scene-b');
        expect(a.key).toBe('scene-a');
        expect(a.load()).toEqual(K.DEFAULT_CHOICE);
        const choice = { shirt: 'forest', pants: 'charcoal', skin: 'tan', hair: 'black', length: 'buzz' };
        expect(a.save({ ...choice, junk: true })).toBe(true);
        expect([...globalThis.localStorage.map.keys()]).toEqual(['scene-a']);
        expect(JSON.parse(globalThis.localStorage.map.get('scene-a'))).toEqual(choice);
        expect(a.load()).toEqual(choice);
        expect(b.load()).toEqual(K.DEFAULT_CHOICE);
        expect(a.forget()).toBe(true);
        expect(a.load()).toEqual(K.DEFAULT_CHOICE);
    });

    test('a scene\'s own normalize brings an older stored shape forward', () => {
        globalThis.localStorage = storage();
        const normalize = (raw) => K.normalizeChoice(raw && raw.old ? { shirt: raw.old } : raw);
        const s = K.createCastStore('scene-old', { normalize });
        globalThis.localStorage.setItem('scene-old', JSON.stringify({ old: 'teal' }));
        expect(s.load().shirt).toBe('teal');
    });

    test('broken JSON, a refusing browser, and no storage at all each give the defaults', () => {
        const mine = { ...K.DEFAULT_CHOICE, shirt: 'navy' };
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem('k', '{not json');
        expect(K.createCastStore('k', { defaults: mine }).load()).toEqual(mine);
        // An empty store gives the scene's defaults too, not the built-in ones.
        expect(K.createCastStore('empty', { defaults: mine }).load()).toEqual(mine);
        globalThis.localStorage = storage({ refuse: true });
        const s = K.createCastStore('k');
        expect(s.load()).toEqual(K.DEFAULT_CHOICE);
        expect(s.save({ shirt: 'teal' })).toBe(false);
        expect(s.forget()).toBe(false);
        delete globalThis.localStorage;
        expect(s.load()).toEqual(K.DEFAULT_CHOICE);
        expect(s.save({ shirt: 'teal' })).toBe(false);
    });
});
