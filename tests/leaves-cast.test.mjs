// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Who is on leaf duty (www/leaves/js/cast.js), measured: the choices are
 * whole and kind, a stored choice comes back valid whatever was stored, a
 * browser that refuses storage still gets a person, and every shirt, pants
 * and haircut builds on the real three.js and holds the blower.
 *
 * Steve's QA, 2026-10-08: "Instead of having the different outfit options,
 * could we remove the outfit option section and add sections to change the
 * shirt and pants colors?" Long sleeves for all ("it looks chilly outside").
 */
import { loadRealThree } from './helpers/real-three.mjs';

const K = await import('../www/leaves/js/cast.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

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
    test('eight shirts, six pants, six skin tones, six hair colors and four lengths, every one named', () => {
        expect(K.SHIRTS.map((o) => o.id)).toEqual(['rust', 'pumpkin', 'forest', 'mustard', 'teal', 'navy', 'charcoal', 'white']);
        expect(K.PANTS.map((o) => o.id)).toEqual(['navy', 'denim', 'khaki', 'brown', 'charcoal', 'black']);
        expect(K.SKINS).toHaveLength(6);
        expect(K.HAIR_COLORS).toHaveLength(6);
        expect(K.HAIR_LENGTHS.map((h) => h.id)).toEqual(['bald', 'buzz', 'short', 'long']);
        for (const list of [K.SHIRTS, K.PANTS, K.SKINS, K.HAIR_COLORS, K.HAIR_LENGTHS]) {
            const ids = list.map((o) => o.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const o of list) {
                expect(o.label.length).toBeGreaterThan(2);
                expect(o.label).not.toMatch(/[—;]/);
            }
        }
        // Each color reads in a sentence: "a rust red shirt", never "a orange".
        for (const o of [...K.SHIRTS, ...K.PANTS]) expect(o.name).toMatch(/^[b-df-hj-np-tv-z][a-z ]+$/);
        // And the swatches can be told apart.
        for (const list of [K.SHIRTS, K.PANTS]) {
            const colors = list.map((o) => o.color);
            expect(new Set(colors).size).toBe(colors.length);
        }
    });

    test('the default is the person M0 to M3 shipped with', () => {
        const c = K.personConfig(K.DEFAULT_CHOICE);
        expect(c.shirtColor).toBe(0x9c2b25);
        expect(c.pantsColor).toBe(0x34495e);
        expect(c.skinTone).toBe(0xe0ac86);
        expect(c.hairColor).toBe(0x3b2a1e);
        expect(c.hairStyle).toBe('short');
        expect(c.bald).toBe(false);
    });

    test('each part goes on whatever the others, and the sleeves are always long, in the shirt\'s color', () => {
        const choice = { shirt: 'white', pants: 'khaki', skin: 'deep', hair: 'gray', length: 'long' };
        const c = K.personConfig(choice);
        expect(c.shirtColor).toBe(0xf2f2f2);
        expect(c.sleeveColor).toBe(c.shirtColor);
        expect(c.pantsColor).toBe(K.PANTS.find((p) => p.id === 'khaki').color);
        expect(c.skinTone).toBe(K.SKINS.find((s) => s.id === 'deep').color);
        expect(c.hairColor).toBe(K.HAIR_COLORS.find((h) => h.id === 'gray').color);
        expect(c.hairStyle).toBe('long');
        expect(c.dressShirt).toBeUndefined();
        expect(c.hasApron).toBeUndefined();
        expect(K.personConfig({ ...choice, length: 'bald' }).bald).toBe(true);
        for (const shirt of K.SHIRTS) {
            const p = K.personConfig({ ...choice, shirt: shirt.id });
            expect(p.sleeveColor).toBe(shirt.color);
            expect(p.skinTone).toBe(c.skinTone);
        }
    });

    test('an outfit kept before shirts and pants comes back as its nearest colors', () => {
        expect(K.normalizeChoice({ preset: 'weekend', skin: 'tan' })).toEqual({ ...K.DEFAULT_CHOICE, skin: 'tan' });
        expect(K.normalizeChoice({ preset: 'runner' })).toMatchObject({ shirt: 'teal', pants: 'black' });
        expect(K.normalizeChoice({ preset: 'executive' })).toMatchObject({ shirt: 'white', pants: 'charcoal' });
        expect(K.normalizeChoice({ preset: 'gardener' })).toMatchObject({ shirt: 'mustard', pants: 'brown' });
        expect(K.normalizeChoice({ preset: 'retiree' })).toMatchObject({ pants: 'khaki' });
        // A choice of colors wins over an old outfit beside it.
        expect(K.normalizeChoice({ preset: 'runner', shirt: 'pumpkin' })).toMatchObject({ shirt: 'pumpkin', pants: 'black' });
        // And the outfit itself is not kept.
        expect(K.normalizeChoice({ preset: 'runner' }).preset).toBeUndefined();
    });

    test('anything stored comes back as a valid choice, part by part', () => {
        expect(K.normalizeChoice(null)).toEqual(K.DEFAULT_CHOICE);
        expect(K.normalizeChoice('nonsense')).toEqual(K.DEFAULT_CHOICE);
        expect(K.normalizeChoice({ shirt: 'teal', pants: 'plaid', skin: 'purple', hair: 'blond', length: 'mohawk' }))
            .toEqual({ shirt: 'teal', pants: K.DEFAULT_CHOICE.pants, skin: K.DEFAULT_CHOICE.skin, hair: 'blond', length: K.DEFAULT_CHOICE.length });
    });

    test('the welcome card says what they are wearing', () => {
        expect(K.castLine({ shirt: 'pumpkin', pants: 'denim' })).toBe('Playing in a pumpkin orange shirt and denim blue pants.');
        expect(K.castLine(null)).toBe('Playing in a rust red shirt and navy pants.');
        for (const shirt of K.SHIRTS) {
            for (const pants of K.PANTS) expect(K.castLine({ shirt: shirt.id, pants: pants.id })).not.toMatch(/[—;]/);
        }
    });
});

describe('kept in this browser', () => {
    test('saved, read back, and forgotten, under one key', () => {
        globalThis.localStorage = storage();
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
        const choice = { shirt: 'forest', pants: 'charcoal', skin: 'tan', hair: 'black', length: 'buzz' };
        expect(K.saveChoice(choice)).toBe(true);
        expect([...globalThis.localStorage.map.keys()]).toEqual([K.STORAGE_KEY]);
        expect(K.loadChoice()).toEqual(choice);
        expect(K.forgetChoice()).toBe(true);
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
    });

    test('a stored value somebody broke comes back as the default, not a crash', () => {
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem(K.STORAGE_KEY, '{not json');
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
    });

    test('a browser that refuses storage still gets a person, every visit', () => {
        globalThis.localStorage = storage({ refuse: true });
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
        expect(K.saveChoice({ shirt: 'teal' })).toBe(false);
        expect(K.forgetChoice()).toBe(false);
        delete globalThis.localStorage;
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
    });
});

describe('on the real three.js', () => {
    let THREE;
    let savedThree;
    let Op;

    beforeAll(async () => {
        savedThree = globalThis.THREE;
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        Op = await import('../www/leaves/js/blower.js');
    });
    afterAll(() => { globalThis.THREE = savedThree; });

    test('every shirt with every haircut builds, and holds the blower the same way', () => {
        const hands = [];
        for (const shirt of K.SHIRTS) {
            for (const length of K.HAIR_LENGTHS) {
                const choice = { ...K.DEFAULT_CHOICE, shirt: shirt.id, pants: K.PANTS[K.SHIRTS.indexOf(shirt) % K.PANTS.length].id, length: length.id };
                const fig = Op.createOperatorFigure(C.blower, C.look, { person: K.personConfig(choice) });
                fig.update({ x: 0, z: 0, heading: 0, speed: 0, stride: 0 }, false, 0, 'carry');
                fig.group.updateMatrixWorld(true);
                let meshes = 0;
                let hand = null;
                fig.group.traverse((o) => {
                    if (o.isMesh) meshes++;
                    if (o.userData && o.userData.isArm && o.userData.armSide === -1) {
                        const f = o.userData.forearm;
                        hand = new THREE.Vector3().setFromMatrixPosition(f.children[f.children.length - 1].matrixWorld);
                    }
                });
                expect(meshes).toBeGreaterThan(20);
                hands.push(hand);
            }
        }
        // The right hand lands in the same place on every body, at the handle.
        for (const h of hands) expect(h.distanceTo(hands[0])).toBeLessThan(0.02);
    });

    test('the chosen skin, hair, shirt and pants are what is drawn', () => {
        const choice = { shirt: 'teal', pants: 'khaki', skin: 'deep', hair: 'auburn', length: 'long' };
        const fig = Op.createOperatorFigure(C.blower, C.look, { person: K.personConfig(choice) });
        const colors = new Set();
        fig.group.traverse((o) => { if (o.isMesh && o.material && o.material.color) colors.add(o.material.color.getHex()); });
        const drawn = (hex) => [...colors].some((c) => c === new THREE.Color(hex).getHex());
        expect(drawn(K.SKINS.find((s) => s.id === 'deep').color)).toBe(true);
        expect(drawn(K.HAIR_COLORS.find((h) => h.id === 'auburn').color)).toBe(true);
        expect(drawn(K.SHIRTS.find((p) => p.id === 'teal').color)).toBe(true);
        expect(drawn(K.PANTS.find((p) => p.id === 'khaki').color)).toBe(true);
    });
});
