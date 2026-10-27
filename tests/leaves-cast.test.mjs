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

});

describe('kept in this browser, until the avatar takes it (2026-10-26)', () => {
    /** A stand-in for the shared avatar store: what is saved, and whether
     *  a save is refused. */
    function avatarStore({ saved = null, refuse = false } = {}) {
        const s = {
            saved,
            saves: 0,
            hasSaved: () => s.saved !== null,
            load: () => ({ ...s.saved }),
            save(avatar) {
                s.saves++;
                if (refuse) return false;
                s.saved = { ...avatar };
                return true;
            }
        };
        return s;
    }
    const CHOICE = { shirt: 'forest', pants: 'charcoal', skin: 'tan', hair: 'black', length: 'buzz' };

    test('a kept choice is read back and forgotten under one key', () => {
        globalThis.localStorage = storage();
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
        globalThis.localStorage.setItem(K.STORAGE_KEY, JSON.stringify(CHOICE));
        expect(K.loadChoice()).toEqual(CHOICE);
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
        expect(K.forgetChoice()).toBe(false);
        expect(K.adoptChoice(avatarStore())).toBeNull();
        delete globalThis.localStorage;
        expect(K.loadChoice()).toEqual(K.DEFAULT_CHOICE);
        expect(K.adoptChoice(avatarStore())).toBeNull();
    });

    test('nothing kept anywhere: the usual figure, and nothing written', () => {
        globalThis.localStorage = storage();
        const store = avatarStore();
        expect(K.adoptChoice(store)).toBeNull();
        expect(store.saves).toBe(0);
        expect(globalThis.localStorage.map.size).toBe(0);
    });

    test('a kept choice moves into the avatar as the same person, counts as saved, and the old key goes', async () => {
        const { fromCastChoice } = await import('../www/shared/js/avatar-1.0.0.js');
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem(K.STORAGE_KEY, JSON.stringify(CHOICE));
        const store = avatarStore();
        const avatar = K.adoptChoice(store);
        expect(avatar).toEqual(fromCastChoice(CHOICE));
        expect(avatar).toMatchObject({ skin: 'tan', hair: 'black', length: 'buzz', shirt: 'forest', bottomColor: 'charcoal' });
        expect(store.saved).toEqual(avatar);
        expect(globalThis.localStorage.map.has(K.STORAGE_KEY)).toBe(false);
        // Next visit: the avatar, and nothing to move.
        expect(K.adoptChoice(store)).toEqual(avatar);
        expect(store.saves).toBe(1);
    });

    test('an outfit kept before shirts and pants moves in its nearest colors', () => {
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem(K.STORAGE_KEY, JSON.stringify({ preset: 'runner', skin: 'tan', hair: 'black', length: 'buzz' }));
        expect(K.adoptChoice(avatarStore())).toMatchObject({ shirt: 'teal', bottomColor: 'black', skin: 'tan' });
    });

    test('an avatar already saved wins, and the old key still goes', () => {
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem(K.STORAGE_KEY, JSON.stringify(CHOICE));
        const store = avatarStore({ saved: { skin: 'deep' } });
        expect(K.adoptChoice(store)).toEqual({ skin: 'deep' });
        expect(store.saves).toBe(0);
        expect(globalThis.localStorage.map.has(K.STORAGE_KEY)).toBe(false);
    });

    test('a save the browser refuses keeps the old key for next time, and the person is still worn today', () => {
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem(K.STORAGE_KEY, JSON.stringify(CHOICE));
        const store = avatarStore({ refuse: true });
        expect(K.adoptChoice(store)).toMatchObject({ skin: 'tan', shirt: 'forest' });
        expect(store.saved).toBeNull();
        expect(globalThis.localStorage.map.has(K.STORAGE_KEY)).toBe(true);
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

    test('a left-handed operator holds the blower in the left hand, the mirror of the right (2026-10-26)', () => {
        const handOf = (fig, side) => {
            let hand = null;
            fig.group.traverse((o) => {
                if (o.userData && o.userData.isArm && o.userData.armSide === side) {
                    const f = o.userData.forearm;
                    hand = new THREE.Vector3().setFromMatrixPosition(f.children[f.children.length - 1].matrixWorld);
                }
            });
            return hand;
        };
        const tubeOf = (fig) => {
            let tube = null;
            fig.group.traverse((o) => { if (o.userData && o.userData.tube) tube = o.userData.tube; });
            return new THREE.Vector3().setFromMatrixPosition(tube.matrixWorld);
        };
        const op = { x: 0, z: 0, heading: 0, speed: 0, stride: 0 };
        const right = Op.createOperatorFigure(C.blower, C.look, { person: K.personConfig(K.DEFAULT_CHOICE) });
        const left = Op.createOperatorFigure(C.blower, C.look, { person: K.personConfig(K.DEFAULT_CHOICE), hand: 'left' });
        expect(right.hand).toBe('right');
        expect(left.hand).toBe('left');
        for (const arms of ['carry', 'wave', 'back']) {
            right.update(op, false, 0.3, arms);
            left.update(op, false, 0.3, arms);
            right.group.updateMatrixWorld(true);
            left.group.updateMatrixWorld(true);
            const r = handOf(right, -1);
            const l = handOf(left, 1);
            // The leading hand lands at the mirror of the right's, and the
            // other hand at the mirror of the right-hander's other hand.
            expect(`${arms}: ${l.x.toFixed(3)} ${l.y.toFixed(3)} ${l.z.toFixed(3)}`).toBe(`${arms}: ${(-r.x).toFixed(3)} ${r.y.toFixed(3)} ${r.z.toFixed(3)}`);
            const r2 = handOf(right, 1);
            const l2 = handOf(left, -1);
            expect(l2.x).toBeCloseTo(-r2.x, 3);
        }
        // The blower's tube hangs on the other side of the body too.
        right.update(op, false, 0, 'carry');
        left.update(op, false, 0, 'carry');
        right.group.updateMatrixWorld(true);
        left.group.updateMatrixWorld(true);
        expect(tubeOf(left).x).toBeCloseTo(-tubeOf(right).x, 6);
        expect(tubeOf(right).x).toBeLessThan(0);
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
