// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Who is on leaf duty (www/leaves/js/cast.js), measured: the choices are
 * whole and kind, a stored choice comes back valid whatever was stored, a
 * browser that refuses storage still gets a person, and every outfit with
 * every haircut builds on the real three.js and holds the blower.
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
    test('six outfits, six skin tones, six hair colors and four lengths, every one named', () => {
        expect(K.PRESETS).toHaveLength(6);
        expect(K.SKINS).toHaveLength(6);
        expect(K.HAIR_COLORS).toHaveLength(6);
        expect(K.HAIR_LENGTHS.map((h) => h.id)).toEqual(['bald', 'buzz', 'short', 'long']);
        for (const list of [K.PRESETS, K.SKINS, K.HAIR_COLORS, K.HAIR_LENGTHS]) {
            const ids = list.map((o) => o.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const o of list) {
                expect(o.label.length).toBeGreaterThan(2);
                expect(o.label).not.toMatch(/[—;]/);
            }
        }
        for (const p of K.PRESETS) expect(p.name).toMatch(/^the [a-z ]+$/);
    });

    test('no outfit is a real person from another scene', () => {
        const tribute = /dad|mom|gavin|jamar|jenn|roqui|steve|john|raquel|family/i;
        for (const p of K.PRESETS) {
            expect(p.id).not.toMatch(tribute);
            expect(p.label).not.toMatch(tribute);
        }
    });

    test('the default is the person M0 to M3 shipped with', () => {
        const c = K.personConfig(K.DEFAULT_CHOICE);
        expect(c.shirtColor).toBe(0x9c2b25);
        expect(c.skinTone).toBe(0xe0ac86);
        expect(c.hairColor).toBe(0x3b2a1e);
        expect(c.hairStyle).toBe('short');
        expect(c.bald).toBe(false);
    });

    test('skin, hair and length go on whatever the outfit', () => {
        const choice = { preset: 'executive', skin: 'deep', hair: 'gray', length: 'long' };
        const c = K.personConfig(choice);
        expect(c.skinTone).toBe(K.SKINS.find((s) => s.id === 'deep').color);
        expect(c.hairColor).toBe(K.HAIR_COLORS.find((h) => h.id === 'gray').color);
        expect(c.hairStyle).toBe('long');
        expect(c.dressShirt).toBe(true);
        expect(K.personConfig({ ...choice, length: 'bald' }).bald).toBe(true);
        expect(K.personConfig({ ...choice, preset: 'gardener' })).toMatchObject({ hasApron: true, skinTone: c.skinTone });
    });

    test('anything stored comes back as a valid choice, part by part', () => {
        expect(K.normalizeChoice(null)).toEqual(K.DEFAULT_CHOICE);
        expect(K.normalizeChoice('nonsense')).toEqual(K.DEFAULT_CHOICE);
        expect(K.normalizeChoice({ preset: 'runner', skin: 'purple', hair: 'blond', length: 'mohawk' }))
            .toEqual({ preset: 'runner', skin: K.DEFAULT_CHOICE.skin, hair: 'blond', length: K.DEFAULT_CHOICE.length });
    });

    test('the welcome card says who it is', () => {
        expect(K.castLine({ preset: 'retiree' })).toBe('Playing as the retiree.');
        expect(K.castLine(null)).toBe('Playing as the weekend warrior.');
    });
});

describe('kept in this browser', () => {
    test('saved, read back, and forgotten, under one key', () => {
        globalThis.localStorage = storage();
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
        const choice = { preset: 'hoodie', skin: 'tan', hair: 'black', length: 'buzz' };
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
        expect(K.saveChoice({ preset: 'runner' })).toBe(false);
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

    test('every outfit with every haircut builds, and holds the blower the same way', () => {
        const hands = [];
        for (const preset of K.PRESETS) {
            for (const length of K.HAIR_LENGTHS) {
                const choice = { ...K.DEFAULT_CHOICE, preset: preset.id, length: length.id };
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

    test('the chosen skin, hair and shirt are what is drawn', () => {
        const choice = { preset: 'runner', skin: 'deep', hair: 'auburn', length: 'long' };
        const fig = Op.createOperatorFigure(C.blower, C.look, { person: K.personConfig(choice) });
        const colors = new Set();
        fig.group.traverse((o) => { if (o.isMesh && o.material && o.material.color) colors.add(o.material.color.getHex()); });
        const drawn = (hex) => [...colors].some((c) => c === new THREE.Color(hex).getHex());
        expect(drawn(K.SKINS.find((s) => s.id === 'deep').color)).toBe(true);
        expect(drawn(K.HAIR_COLORS.find((h) => h.id === 'auburn').color)).toBe(true);
        expect(drawn(K.PRESETS.find((p) => p.id === 'runner').shirt)).toBe(true);
    });
});
