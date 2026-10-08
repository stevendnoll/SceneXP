// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Things lost under the leaves (www/leaves/js/finds.js, M6), measured with
 * the real sim and the real blower.
 *
 * The promise is "revealed by clearing, never pointed at", so the tests
 * hold both halves: every find is hidden where the leaves really cover it
 * (measured the way it is judged, by the share of its footprint no resting
 * leaf lies over), nothing is found in a yard nobody has touched, and
 * blowing the leaves off one finds it. Then the end card's and the share's
 * words, and the models on the real three.js, which must fit under the lawn
 * they rise out of.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const S = await import('../www/leaves/js/sim.js');
const Fd = await import('../www/leaves/js/finds.js');
const Sc = await import('../www/leaves/js/score.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const F = C.finds;
// The fewest leaves that still bury the lawn: below about 9,000 a leaf is
// at its largest and the carpet thins (see config.leaves.coverage). The
// shipped counts are 12,000 and 24,000.
const COUNT = 9000;

function yard(count = COUNT) {
    const sim = S.createSim(count, C);
    S.scatterLeaves(sim, C);
    return sim;
}

let sim;
beforeAll(() => { sim = yard(); });

describe('which finds', () => {
    test('four all autumn, and the skeleton hand only in Halloween week', () => {
        expect(Fd.findsFor(F, false).map((f) => f.id)).toEqual(['keys', 'gnome', 'ball', 'bill']);
        expect(Fd.findsFor(F, true).map((f) => f.id)).toEqual(['keys', 'gnome', 'ball', 'bill', 'hand']);
    });
});

describe('covered, measured', () => {
    test('bare lawn shows all of a find, and one leaf over it hides it', () => {
        const bare = S.createSim(10, C);
        expect(Fd.shownShare(bare, 0, 0, 0.1, F.leafReach)).toBe(1);
        // A leaf laid at the find's middle hides the ground within 0.42 of
        // its size of its middle, and no farther.
        bare.size[0] = 0.3;
        S.layDown(bare, 0, 0, 0);
        expect(Fd.coveredAt(bare, 0.1, 0, F.leafReach)).toBe(true);
        expect(Fd.coveredAt(bare, 0.14, 0, F.leafReach)).toBe(false);
        expect(Fd.shownShare(bare, 0, 0, 0.1, F.leafReach)).toBe(0);
        expect(Fd.shownShare(bare, 0, 0, 0.3, F.leafReach)).toBeGreaterThan(0.5);
    });

    test('a leaf in the air hides nothing: only the leaves lying there do', () => {
        const air = S.createSim(10, C);
        air.size[0] = 0.3;
        S.dropLeaf(air, 0, 0, 2, 0);
        expect(Fd.shownShare(air, 0, 0, 0.1, F.leafReach)).toBe(1);
    });
});

describe('hiding them', () => {
    const list = Fd.findsFor(F, true);

    test('every find is hidden where the leaves cover it, in its own area, off the tarp, out of the opening blow\'s patch, apart and clear of anything solid', () => {
        const solids = S.solidBoxes(C.yard);
        for (let round = 1; round <= 6; round++) {
            const placed = Fd.placeFinds(sim, C, list, 7 + round);
            expect(placed.map((f) => f.id)).toEqual(list.map((f) => f.id));
            for (const f of placed) {
                expect(f.shown).toBeLessThanOrEqual(F.hidden);
                expect(Fd.shownShare(sim, f.x, f.z, f.def.r, F.leafReach)).toBe(f.shown);
                expect(f.def.areas.some((a) => f.x >= a.minX && f.x <= a.maxX && f.z >= a.minZ && f.z <= a.maxZ)).toBe(true);
                const T = C.yard.tarp;
                expect(f.x > T.maxX + f.def.r || f.z > T.maxZ + f.def.r).toBe(true);
                expect(S.inBox(solids, f.x, f.z, f.def.r + F.clear)).toBe(false);
                for (const a of F.avoid) expect(f.x > a.minX - f.def.r && f.x < a.maxX + f.def.r && f.z > a.minZ - f.def.r && f.z < a.maxZ + f.def.r).toBe(false);
                expect(f.found).toBe(false);
            }
            for (const a of placed) {
                for (const b of placed) {
                    if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(F.apart);
                }
            }
        }
    });

    test('each round hides them somewhere new, and the same round in the same place', () => {
        const one = Fd.placeFinds(sim, C, list, 11);
        const again = Fd.placeFinds(sim, C, list, 11);
        const two = Fd.placeFinds(sim, C, list, 12);
        expect(again.map((f) => [f.x, f.z])).toEqual(one.map((f) => [f.x, f.z]));
        const moved = one.filter((f, k) => Math.hypot(f.x - two[k].x, f.z - two[k].z) > 0.5);
        expect(moved.length).toBeGreaterThanOrEqual(list.length - 1);
    });

    test('a yard too thin to hide anything hides nothing, rather than leaving it half in view', () => {
        // 600 leaves at their largest cover about a tenth of the lawn.
        const thin = yard(600);
        const placed = Fd.placeFinds(thin, C, list, 3);
        for (const f of placed) expect(f.shown).toBeLessThanOrEqual(F.hidden);
        expect(placed.length).toBeLessThan(list.length);
    });
});

describe('finding them', () => {
    test('nothing is found in a yard nobody has touched, even as the trees drop leaves', () => {
        const fresh = yard();
        const placed = Fd.placeFinds(fresh, C, Fd.findsFor(F, true), 5);
        expect(Fd.stepFinds(placed, fresh, F)).toEqual([]);
        // A leaf falling onto a find only covers it more.
        const T = (i) => i * 37 % fresh.count;
        for (let k = 0; k < 40; k++) S.dropLeaf(fresh, T(k), placed[k % placed.length].x, 3, placed[k % placed.length].z);
        for (let t = 0; t < 4; t += 1 / 30) S.stepSim(fresh, 1 / 30, null);
        expect(Fd.stepFinds(placed, fresh, F)).toEqual([]);
    });

    test('the opening second of blowing, from where the person starts, finds nothing', () => {
        const B = C.blower;
        for (const seed of [1, 2, 3, 4, 5]) {
            const opening = yard();
            const placed = Fd.placeFinds(opening, C, Fd.findsFor(F, true), seed);
            // Facing the house (-z), as they stand when the welcome card goes.
            const jet = S.makeJet(B, B.start.x, B.start.z, 0, -1, true);
            for (let t = 0; t < 1.5; t += 1 / 30) S.stepSim(opening, 1 / 30, jet);
            expect(Fd.stepFinds(placed, opening, F)).toEqual([]);
        }
    });

    test('blowing the leaves off one finds it, and it is found once', () => {
        const blown = yard();
        const placed = Fd.placeFinds(blown, C, Fd.findsFor(F, false), 21);
        const ball = placed.find((f) => f.id === 'ball');
        // The person stands a few meters off and blows at it, as a visitor
        // does: across it, from the street side.
        const B = C.blower;
        const from = { x: ball.x, z: Math.min(ball.z + 2.2, C.yard.lawn.maxZ) };
        const dir = { x: ball.x - from.x, z: ball.z - from.z };
        const len = Math.hypot(dir.x, dir.z);
        const jet = S.makeJet(B, from.x, from.z, dir.x / len, dir.z / len, true);
        let foundAt = null;
        for (let t = 0; t < 4 && foundAt === null; t += 1 / 30) {
            S.stepSim(blown, 1 / 30, jet);
            if (Fd.stepFinds(placed, blown, F).some((f) => f.id === 'ball')) foundAt = t;
        }
        expect(foundAt).not.toBe(null);
        expect(ball.found).toBe(true);
        expect(ball.shown).toBeGreaterThanOrEqual(F.seen);
        // Found is found: the next look does not find it again.
        expect(Fd.stepFinds(placed, blown, F).map((f) => f.id)).not.toContain('ball');
    });
});

describe('what the visitor reads', () => {
    test('the end card lists them by name, with nothing to say when nothing turned up', () => {
        expect(Sc.listOf([])).toBe('');
        expect(Sc.listOf(['a set of car keys'])).toBe('a set of car keys');
        expect(Sc.listOf(['a', 'b'])).toBe('a and b');
        expect(Sc.listOf(['a', 'b', 'c'])).toBe('a, b, and c');
        expect(Sc.findsLine([])).toBe('');
        expect(Sc.findsLine(['a $20 bill'])).toBe('Under the leaves you found a $20 bill.');
    });

    test('the share and the screen reader sentence add them at the end', () => {
        const t = { lawn: 600, tarp: 400, street: 0, neighbor: 0, total: 1000, sent: 0 };
        expect(Sc.shareText(t, 180, null, ['a $20 bill', 'a garden gnome']))
            .toBe('I cleared 40% of my yard in 3 minutes. 400 leaves made it onto the tarp. I found a $20 bill and a garden gnome under the leaves. A leaf blower game on SceneXP.');
        expect(Sc.shareText(t, 180)).not.toMatch(/found/);
        expect(Sc.resultSentence(t, null, ['a set of car keys'])).toMatch(/ Under the leaves you found a set of car keys\.$/);
    });

    test('every name and every line keeps the house style', () => {
        for (const f of F.list) {
            for (const text of [f.name, f.toast, Sc.findsLine([f.name])]) {
                expect(text).not.toMatch(/[—;]/);
                expect(text).not.toMatch(/\b(colour|neighbour|centre|grey|metre)s?\b/i);
            }
            expect(f.toast).toMatch(/^You found /);
            // Kind spooky, never scary.
            expect(f.toast).not.toMatch(/\b(blood|dead|corpse|body|kill)/i);
        }
    });
});

describe('the models, on the real three.js', () => {
    let THREE;
    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
    });
    afterAll(() => { delete globalThis.THREE; });

    test('every find has a model, hidden to begin with, that fits under the lawn it rises out of and inside its footprint', () => {
        const list = Fd.findsFor(F, true);
        const models = Fd.buildFindModels(list);
        expect(Object.keys(models)).toEqual(list.map((f) => f.id));
        for (const def of list) {
            const { group, depth } = models[def.id];
            expect(group.visible).toBe(false);
            group.visible = true;
            group.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(group);
            const size = box.getSize(new THREE.Vector3());
            // Waiting `depth` under the lawn, none of it pokes through.
            expect(box.max.y).toBeLessThanOrEqual(depth);
            expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
            // Laid on the lawn, it is inside the disc it is judged by, turned
            // any way at all.
            const corner = Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z));
            expect(corner).toBeLessThanOrEqual(def.r * 1.3);
            // And big enough to see from the street.
            expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(0.08);
        }
    });
});
