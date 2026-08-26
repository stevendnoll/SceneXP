// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The fractal tree generator: the growth invariant, determinism, and budgets.
 *
 * `buildSkeleton` and `buildLeaves` are pure arithmetic, so this needs no
 * THREE. The bake and the meshes are exercised by the init smoke.
 *
 * TWO OF THESE TESTS PROTECT THINGS THAT CANNOT BE SEEN IN THE SOURCE.
 *
 *   The growth invariant is what makes growth a single shader uniform over
 *   geometry baked once. If a refactor lets a child be born before its parent
 *   has finished extending, half grown branches leave their children hanging
 *   in space, and the only repairs are a transform chain per vertex or a
 *   rebuild every frame. The rule is cheap; losing it is not.
 *
 *   The checksums are what stop a refactor quietly reshaping somebody's saved
 *   garden. A tree is a function of its seed, so a change to the generator
 *   does not break a test anywhere else: it just means the birch that greets a
 *   returning visitor tomorrow is a different birch.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import { SPECIES, DEFAULT_CUSTOM, resolveSpecies, makeRandom, clampCustom, sliderWords, tintColor } from '../www/garden/js/species.js';
import { buildSkeleton, buildLeaves, sidesForDepth } from '../www/garden/js/tree.js';

const SEED = 20260825;

function skeletonFor(id, custom = DEFAULT_CUSTOM, seed = SEED) {
    return buildSkeleton(resolveSpecies(id, custom), seed);
}

/** A stable hash of every coordinate in a skeleton. */
function checksum(skeleton) {
    let h = 2166136261 >>> 0;
    const push = (n) => {
        const v = Math.round(n * 10000) | 0;
        h ^= v;
        h = Math.imul(h, 16777619) >>> 0;
    };
    for (const s of skeleton.segments) {
        push(s.x0); push(s.y0); push(s.z0);
        push(s.x1); push(s.y1); push(s.z1);
        push(s.r0); push(s.r1); push(s.birth);
    }
    return h >>> 0;
}

// ---- The generator ---------------------------------------------------------

test('the seeded generator is the same generator on every run', () => {
    const a = makeRandom(42);
    const b = makeRandom(42);
    const first = [a(), a(), a(), a()];
    const second = [b(), b(), b(), b()];
    expect(second).toEqual(first);
    // And it is actually random-looking rather than a constant.
    expect(new Set(first).size).toBe(4);
    for (const v of first) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    }
    // Different seeds give different sequences.
    expect(makeRandom(43)()).not.toBe(first[0]);
});

test('every species builds, and stands exactly as tall as it claims', () => {
    for (const s of SPECIES) {
        const skeleton = skeletonFor(s.id);
        expect(skeleton.segments.length).toBeGreaterThan(50);
        let top = 0;
        for (const seg of skeleton.segments) top = Math.max(top, seg.y1, seg.y0);
        expect(top).toBeCloseTo(s.matureHeight, 6);
    }
});

// ---- The invariant ---------------------------------------------------------

test('a branch never begins before its parent has finished', () => {
    // THE RULE THE WHOLE GROWTH DESIGN RESTS ON.
    for (const s of SPECIES) {
        const skeleton = skeletonFor(s.id);
        for (const seg of skeleton.segments) {
            if (seg.parent < 0) continue;
            const parent = skeleton.segments[seg.parent];
            expect(seg.birth).toBeGreaterThanOrEqual(parent.birth + skeleton.emergeSpan - 1e-9);
        }
    }
});

test('the trunk is there from the first moment and the tree finishes by one', () => {
    for (const s of SPECIES) {
        const skeleton = skeletonFor(s.id);
        const trunk = skeleton.segments[0];
        expect(trunk.parent).toBe(-1);
        expect(trunk.birth).toBe(0);
        let latest = 0;
        for (const seg of skeleton.segments) latest = Math.max(latest, seg.birth);
        // Every branch has room to finish extending before growth reaches 1,
        // or the last order of twigs would still be arriving on a tree the
        // visitor has been told is mature.
        expect(latest + skeleton.emergeSpan).toBeLessThanOrEqual(1 + 1e-9);
    }
});

test('a branch is always thinner and shorter than its parent', () => {
    for (const s of SPECIES) {
        const skeleton = skeletonFor(s.id);
        for (const seg of skeleton.segments) {
            if (seg.parent < 0) continue;
            const parent = skeleton.segments[seg.parent];
            expect(seg.r0).toBeLessThan(parent.r0);
            expect(seg.r1).toBeLessThanOrEqual(seg.r0);
        }
    }
});

// ---- Determinism -----------------------------------------------------------

test('a tree is a function of its seed, and that is locked', () => {
    // If a change to the generator lands, these fail. That is the point: the
    // failure is the warning that every saved garden is about to look
    // different. Re-record them ONLY when reshaping the trees is the intent.
    const EXPECTED = {
        'japanese-maple': 2389269509,
        'flowering-dogwood': 3800298273,
        'olive': 3567027007,
        'paper-birch': 386799237,
        'bur-oak': 2543638504,
        'copper-beech': 2600671710,
        'weeping-willow': 691008386,
        'sugar-maple': 863262162,
        'quaking-aspen': 3742805772,
        'blue-spruce': 943020070,
        'scots-pine': 1560069635,
        'coast-redwood': 501854416
    };
    for (const s of SPECIES) {
        expect(`${s.id}:${checksum(skeletonFor(s.id))}`).toBe(`${s.id}:${EXPECTED[s.id]}`);
    }
});

test('the same seed rebuilds the same tree, and a different seed does not', () => {
    const a = checksum(skeletonFor('sugar-maple', DEFAULT_CUSTOM, 777));
    const b = checksum(skeletonFor('sugar-maple', DEFAULT_CUSTOM, 777));
    const c = checksum(skeletonFor('sugar-maple', DEFAULT_CUSTOM, 778));
    expect(b).toBe(a);
    expect(c).not.toBe(a);
});

// ---- Budgets ---------------------------------------------------------------

test('no tree costs more than its share of the frame', () => {
    const budget = { triangles: 25000, leaves: 4000 };
    for (const s of SPECIES) {
        const resolved = resolveSpecies(s.id, DEFAULT_CUSTOM);
        const skeleton = buildSkeleton(resolved, SEED);
        let triangles = 0;
        for (const seg of skeleton.segments) triangles += sidesForDepth(seg.depth) * 2;
        const leaves = buildLeaves(skeleton, resolved, SEED);
        expect(triangles).toBeLessThan(budget.triangles);
        expect(leaves.length).toBeLessThan(budget.leaves);
    }
});

test('the segment budget holds even with every slider at maximum', () => {
    // The budget is the backstop against a generous slider setting costing a
    // frame, so it is tested at the setting that would.
    const greedy = { height: 1.6, trunk: 1.5, spread: 1.4, density: 1.3, leaf: 1.4, tint: 0 };
    for (const s of SPECIES) {
        const skeleton = buildSkeleton(resolveSpecies(s.id, greedy), SEED);
        expect(skeleton.segments.length).toBeLessThanOrEqual(GARDEN_CONFIG.tree.maxSegments);
    }
    const tight = buildSkeleton(resolveSpecies('blue-spruce', greedy), SEED, { maxSegments: 200 });
    expect(tight.segments.length).toBeLessThanOrEqual(200);
});

// ---- Leaves ----------------------------------------------------------------

test('leaves arrive with the branch that carries them, never before', () => {
    for (const s of SPECIES) {
        const resolved = resolveSpecies(s.id, DEFAULT_CUSTOM);
        const skeleton = buildSkeleton(resolved, SEED);
        const leaves = buildLeaves(skeleton, resolved, SEED);
        expect(leaves.length).toBeGreaterThan(0);
        for (const leaf of leaves) {
            expect(leaf.birth).toBeGreaterThan(0);
            expect(leaf.birth).toBeLessThan(1);
            expect(leaf.drop).toBeGreaterThanOrEqual(0);
            expect(leaf.drop).toBeLessThanOrEqual(1);
        }
    }
});

test('the canopy empties from the outside in', () => {
    // Autumn takes the exposed leaves first, which is the order a real canopy
    // goes in. A random fall order reads as a glitch rather than as autumn.
    //
    // MEASURED ON THE RADIAL AXIS, and that is not an arbitrary choice. The
    // first version of this test asked whether high leaves go before low ones
    // and failed, because on a broad crown the widest and most exposed leaves
    // ARE the lower ones: a spreading oak's outer lower branches are more
    // exposed than the middle of its top. Outer-before-inner holds on every
    // species; higher-before-lower only holds on the conical ones. The former
    // is the property worth pinning.
    for (const id of ['sugar-maple', 'paper-birch', 'bur-oak', 'coast-redwood']) {
        const resolved = resolveSpecies(id, DEFAULT_CUSTOM);
        const skeleton = buildSkeleton(resolved, SEED);
        const leaves = buildLeaves(skeleton, resolved, SEED);
        const sorted = [...leaves].sort(
            (a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
        const half = Math.floor(sorted.length / 2);
        const mean = (list) => list.reduce((a, l) => a + l.drop, 0) / Math.max(1, list.length);
        expect(half).toBeGreaterThan(10);
        expect(mean(sorted.slice(half))).toBeGreaterThan(mean(sorted.slice(0, half)));
    }
});

test('a conical tree sheds from the top down', () => {
    // Where height and exposure agree, the height ordering shows through.
    const resolved = resolveSpecies('coast-redwood', DEFAULT_CUSTOM);
    const skeleton = buildSkeleton(resolved, SEED);
    const leaves = buildLeaves(skeleton, resolved, SEED);
    // Split by percentile rather than by a fixed height. A crown that starts
    // above a bare trunk is normal, so "leaves below 45 percent" can honestly
    // be an empty set and would fail for the wrong reason.
    const sorted = [...leaves].sort((a, b) => a.y - b.y);
    const half = Math.floor(sorted.length / 2);
    const low = sorted.slice(0, half);
    const high = sorted.slice(half);
    const mean = (list) => list.reduce((a, l) => a + l.drop, 0) / Math.max(1, list.length);
    expect(low.length).toBeGreaterThan(10);
    expect(high.length).toBeGreaterThan(10);
    expect(mean(high)).toBeGreaterThan(mean(low));
});

// ---- The sliders -----------------------------------------------------------

test('the sliders actually move the tree', () => {
    const base = resolveSpecies('paper-birch', DEFAULT_CUSTOM);
    const tall = resolveSpecies('paper-birch', { ...DEFAULT_CUSTOM, height: 1.6 });
    const wide = resolveSpecies('paper-birch', { ...DEFAULT_CUSTOM, spread: 1.4 });
    const dense = resolveSpecies('paper-birch', { ...DEFAULT_CUSTOM, density: 1.3 });

    expect(tall.matureHeight).toBeGreaterThan(base.matureHeight);
    expect(wide.divergence).toBeGreaterThan(base.divergence);
    expect(dense.depth).toBeGreaterThan(base.depth);
});

test('out of range settings are clamped rather than trusted', () => {
    // This is also the gate a garden coming back out of storage passes
    // through, so it has to cope with anything at all.
    const wild = clampCustom({ height: 99, trunk: -5, spread: NaN, density: undefined, leaf: 'x', tint: 40 });
    expect(wild.height).toBe(1.6);
    expect(wild.trunk).toBe(0.7);
    expect(wild.spread).toBe(1);
    expect(wild.density).toBe(1);
    expect(wild.leaf).toBe(1);
    expect(wild.tint).toBe(1);
    expect(clampCustom(null).height).toBe(1);
});

test('a slider position reads as words, not as a number', () => {
    // "0.85" tells a screen reader nothing about what the tree will look like.
    expect(sliderWords('spread', 0.6)).toBe('very narrow');
    expect(sliderWords('spread', 1.0)).toBe('as usual');
    expect(sliderWords('spread', 1.4)).toBe('very wide');
    expect(sliderWords('nonsense', 1)).toBe('');
});

test('the tint warms and cools without turning a leaf into a different plant', () => {
    const green = 0x4e7d38;
    const warm = tintColor(green, 1);
    const cool = tintColor(green, -1);
    const red = (h) => (h >> 16) & 0xff;
    const grn = (h) => (h >> 8) & 0xff;
    const blu = (h) => h & 0xff;

    expect(red(warm)).toBeGreaterThan(red(green));
    expect(blu(warm)).toBeLessThan(blu(green));
    expect(red(cool)).toBeLessThan(red(green));
    // Green is the anchor. Move it and it stops being foliage.
    expect(grn(warm)).toBe(grn(green));
    expect(grn(cool)).toBe(grn(green));
    expect(tintColor(green, 0)).toBe(green);
});
