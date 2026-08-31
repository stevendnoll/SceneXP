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
import { SPECIES, DEFAULT_CUSTOM, resolveSpecies, makeRandom, clampCustom, sliderWords, tintColor, speciesById } from '../www/garden/js/species.js';
import { buildSkeleton, buildLeaves, buildFruit, sidesForDepth, FRUIT_SHAPES, fruitClusterSpan } from '../www/garden/js/tree.js';
import { fruitStageAt, phenologyAt } from '../www/garden/js/clock.js';

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
        'apple': 3510848100,
        'olive': 3567027007,
        'orange': 3022373954,
        'pear': 1853214699,
        'paper-birch': 386799237,
        'cherry': 2652351780,
        'bur-oak': 2543638504,
        'copper-beech': 2600671710,
        'weeping-willow': 691008386,
        'sugar-maple': 863262162,
        // The lemon joined at M16-3. A golden value like the rest: it pins
        // that this species' generated skeleton is stable across engines,
        // which is what makes a saved garden come back as the same garden.
        lemon: 1470650742,
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

// ---- Leaves ride the branch they grow on ------------------------------------
//
// THE BUG THIS EXISTS TO STOP. The leaf shader's only wind term was a one-sided
// flutter at 12 percent of the branch amplitude, and it never applied the
// branch's own sway at all. So branches moved and leaves hung in the air where
// the branch used to be. Because a canopy hides its own twigs, the whole tree
// read as standing still, and QA reported it as "the trees do not sway" rather
// than as "the leaves are detached", which is how a bug like this hides.
//
// Same family as the growth bug in M2-7, and for the same underlying reason: a
// leaf's position lives in its instance matrix, baked at rest, so nothing the
// bark does reaches it unless it is handed over explicitly.

test('every leaf carries a sway weight, and none of them is zero', () => {
    for (const species of SPECIES) {
        const resolved = resolveSpecies(species.id, DEFAULT_CUSTOM);
        const skeleton = buildSkeleton(resolved, SEED);
        const leaves = buildLeaves(skeleton, resolved, SEED);
        expect(leaves.length).toBeGreaterThan(0);
        for (const leaf of leaves) {
            expect(Number.isFinite(leaf.sway)).toBe(true);
            // Zero would mean a leaf pinned in space while its branch moved.
            expect(leaf.sway).toBeGreaterThan(0);
            expect(leaf.sway).toBeLessThanOrEqual(1);
        }
    }
});

test('a leaf sways by the same rule its own segment does', () => {
    // The two weights have to be computed the same way from the same segment,
    // or the canopy drifts off the wood by however much they disagree.
    const resolved = resolveSpecies('sugar-maple', DEFAULT_CUSTOM);
    const skeleton = buildSkeleton(resolved, SEED);
    const leaves = buildLeaves(skeleton, resolved, SEED);
    const height = skeleton.height;

    for (const leaf of leaves.slice(0, 200)) {
        // Recover the segment this leaf sits on: it is the one whose span
        // contains the leaf, and every leaf lies on its segment's line.
        const seg = skeleton.segments.find((s) =>
            leaf.y >= Math.min(s.y0, s.y1) - 1e-9 && leaf.y <= Math.max(s.y0, s.y1) + 1e-9
            && Math.abs((s.x1 - s.x0) * (leaf.z - s.z0) - (s.z1 - s.z0) * (leaf.x - s.x0)) < 1e-6);
        if (!seg) continue;
        const depthWeight = Math.pow(seg.depth / Math.max(1, skeleton.maxDepth), 1.5);
        const expected = depthWeight * (0.25 + 0.75 * Math.min(1, leaf.y / height));
        expect(leaf.sway).toBeCloseTo(expected, 9);
    }
});

test('leaves higher and further out sway more than inner ones', () => {
    // The property, not the formula: whatever the weights are, a leaf at the
    // top of the crown must move more than one down by the trunk.
    const resolved = resolveSpecies('bur-oak', DEFAULT_CUSTOM);
    const skeleton = buildSkeleton(resolved, SEED);
    const leaves = buildLeaves(skeleton, resolved, SEED);
    const sorted = [...leaves].sort((a, b) => a.y - b.y);
    const low = sorted.slice(0, 50).reduce((t, l) => t + l.sway, 0) / 50;
    const high = sorted.slice(-50).reduce((t, l) => t + l.sway, 0) / 50;
    expect(high).toBeGreaterThan(low);
});


// ---- Blossom and fruit anchors (M11-7) -------------------------------------

function fruitFor(id) {
    const resolved = resolveSpecies(id, DEFAULT_CUSTOM);
    const skeleton = buildSkeleton(resolved, SEED);
    const leaves = buildLeaves(skeleton, resolved, SEED);
    return { resolved, skeleton, leaves, fruit: buildFruit(leaves, resolved, SEED) };
}

test('only the species that carry a schedule build any anchors at all', () => {
    for (const s of SPECIES) {
        const { fruit } = fruitFor(s.id);
        const expected = s.schedule ? 'anchors' : 'none';
        expect(`${s.id}: ${fruit ? 'anchors' : 'none'}`).toBe(`${s.id}: ${expected}`);
    }
    // Six of the seventeen: five fruit trees and the dogwood, which flowers
    // and sets nothing.
    expect(SPECIES.filter((s) => s.schedule).length).toBe(6);
    expect(SPECIES.filter((s) => s.fruit).length).toBe(5);
});

/**
 * THE INVARIANT THAT MUST NOT BE LOST IN THE COPY.
 *
 * `step(aBirth, uGrowth)` is what stops a leaf appearing on a branch that has
 * not been born yet. An apple hanging in the air off the end of an unborn twig
 * is the same defect with a much bigger silhouette than a leaf has, and it is
 * only avoided because a fruit anchor IS a leaf anchor rather than a second
 * scattering built from the skeleton.
 */
test('every fruit anchor carries the birth of the branch it hangs on', () => {
    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const { leaves, fruit } = fruitFor(id);
        const births = new Set(leaves.map((l) => l.birth));
        for (const a of fruit.anchors) {
            expect(births.has(a.birth)).toBe(true);
            expect(a.birth).toBeGreaterThanOrEqual(0);
            expect(a.birth).toBeLessThan(1);
        }
    }
});

test('a fruit anchor sits exactly where a leaf does, and sways with it', () => {
    // Not "near" a leaf: AT one. A second set built from the skeleton would be
    // a second answer to where the outside of a canopy is, and the two would
    // drift the first time anybody touched `leafLevels`.
    const { leaves, fruit } = fruitFor('cherry');
    const at = new Set(leaves.map((l) => `${l.x},${l.y},${l.z},${l.sway}`));
    for (const a of fruit.anchors) {
        expect(at.has(`${a.x},${a.y},${a.z},${a.sway}`)).toBe(true);
    }
});

test('blossom is denser than fruit, because most flowers never set', () => {
    const F = GARDEN_CONFIG.garden.fruit;
    const { leaves, fruit } = fruitFor('apple');
    // One set of anchors at BLOSSOM density, with `aRole` picking the share
    // that go on to be fruit.
    expect(fruit.anchors.length / leaves.length).toBeCloseTo(F.blossomDensity, 1);
    expect(fruit.fruitShare).toBeLessThan(1);
    expect(fruit.anchors.length * fruit.fruitShare / leaves.length).toBeCloseTo(F.density, 2);
});

test('a tree that flowers and sets nothing has a fruit share of zero', () => {
    // The dogwood. `aRole` is a 0-to-1 draw and `step(aRole, 0)` lets nothing
    // through, so no instance can ever reach the fruit stage.
    const { fruit } = fruitFor('flowering-dogwood');
    expect(fruit.fruitShare).toBe(0);
    expect(fruit.anchors.length).toBeGreaterThan(0);
});

test('every fruit species carries a real colour for every stage it has', () => {
    // The entire point of adding them: a pear that ripens red throws the
    // reason away. Asserted as "present and distinct" rather than as hex
    // values, which would just restate the table.
    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const s = speciesById(id);
        expect(typeof s.blossom).toBe('number');
        expect(typeof s.fruit.unripe).toBe('number');
        expect(typeof s.fruit.ripe).toBe('number');
        // Green to ripe, never flat ripe: a summer apple is a green apple.
        expect(s.fruit.unripe).not.toBe(s.fruit.ripe);
    }
    // And no two of them ripen to the same colour, or the choice is decorative.
    const ripe = ['apple', 'pear', 'orange', 'cherry'].map((id) => speciesById(id).fruit.ripe);
    expect(new Set(ripe).size).toBe(4);
});

test('the fruit species are still ordered small to large in the grid', () => {
    // The modal shows the range at a glance, so the four slot in by mature
    // height rather than being appended to the end of the list.
    for (let i = 1; i < SPECIES.length; i++) {
        expect(SPECIES[i].matureHeight).toBeGreaterThanOrEqual(SPECIES[i - 1].matureHeight);
    }
});


// ---- What blossom costs (M11-11) -------------------------------------------

test('a plot full of trees in blossom stays inside the scene budget', () => {
    // Addendum B cleared this frame of everything that competed with the
    // swaying, and M10 already put sixteen small pieces of interface back into
    // it. A whole orchard in flower is the largest thing M11 adds, so it gets
    // measured rather than assumed.
    //
    // Sized against a scene measured near 371,600 of its 400,000 triangles.
    // The first pass at blossomDensity 0.55 cost 43,776 for sixteen cherries,
    // which is more headroom than the scene has.
    let worst = 0;
    for (const s of SPECIES) {
        if (!s.schedule) continue;
        const { fruit } = fruitFor(s.id);
        worst = Math.max(worst, fruit.anchors.length);
    }
    // Four triangles a card: the crossed pair that gives a cluster volume.
    const triangles = worst * 4 * GARDEN_CONFIG.plot.maxTrees;
    expect(triangles).toBeLessThan(20000);
    // One extra draw call per fruit tree, and only for the five species that
    // have a schedule. The other eleven pay nothing at all.
    expect(SPECIES.filter((x) => x.schedule).length).toBeLessThan(SPECIES.length / 2);
});

test('a fruit tree carries a countable number of fruit, not a decoration', () => {
    // The other half of the budget question. Thinning blossom is free because a
    // card is a CLUSTER of five flowers, but a fruit card is one fruit, so this
    // number is what a visitor actually counts.
    const counts = {};
    for (const id of ['apple', 'orange', 'pear', 'cherry']) {
        const { fruit } = fruitFor(id);
        counts[id] = Math.round(fruit.anchors.length * fruit.fruitShare);
        expect(counts[id]).toBeGreaterThan(25);
        expect(counts[id]).toBeLessThan(200);
    }
    // And a bigger tree carries more, which is the only ordering that reads.
    expect(counts.cherry).toBeGreaterThan(counts.apple);
});


// ---- Fruit is sized in PIXELS (M12-5) --------------------------------------

/**
 * THE THIRD TIME THIS SCENE HAS SHIPPED SOMETHING TOO SMALL TO SEE, so this
 * test is in pixels and not in metres.
 *
 * The mulch beds were 22x5 px and were reported missing for an afternoon while
 * every count, matrix, span and code path measured correct. The water level was
 * 24x3.3 px and was legible only when dollied in. Fruit was 1.6 px, and a cherry
 * was 0.9, because it had been sized by botany: an apple is about 8 cm, so the
 * card was about 11 cm.
 *
 * AND TRUE SCALE CANNOT WORK AT THIS CAMERA, which is the part that had to be
 * measured rather than assumed. A life-size apple is 2.7 px from the composed
 * viewpoint and a life-size cherry is 0.7. The scene's own answer is the leaf
 * card: a clump of NINE leaves at 0.425 m, reading 14.7 px. So a fruit card is
 * a cluster of three, a little over life size, and lands in the same range.
 */
function pxAcross(metres, y, z) {
    // A 1280x800 frame, the composed camera, the shipped lens.
    const pxPerRadian = 800 / (GARDEN_CONFIG.camera.fov * Math.PI / 180);
    const eye = GARDEN_CONFIG.camera.position;
    const distance = Math.hypot(eye.x - 0, eye.y - y, eye.z - z);
    return 2 * Math.atan(metres / (2 * distance)) * pxPerRadian;
}

test('a fruit cluster is big enough on screen to be seen at all', () => {
    // MEASURED OFF THE DRAWING, not off the config, so that repainting a mask
    // smaller cannot quietly shrink the fruit back out of sight.
    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const r = resolveSpecies(id, DEFAULT_CUSTOM);
        const share = fruitClusterSpan(r.fruit.shape);
        const cluster = GARDEN_CONFIG.garden.fruit.size * r.fruitSize * share;
        const y = r.matureHeight * 0.6;

        // At the middle of the plot, comfortably readable.
        expect(`${id} mid`).toBe(pxAcross(cluster, y, 0) >= 6 ? `${id} mid` : `${id} TOO SMALL`);
        // And at the BACK edge, which is the worst case a planted tree has and
        // the case every previous miss in this scene was measured at.
        expect(`${id} back`).toBe(pxAcross(cluster, y, -12) >= 4 ? `${id} back` : `${id} TOO SMALL`);
    }
});

test('a fruit cluster does not outgrow the canopy it hangs in', () => {
    // The other end of the same decision. Legibility bought by making an apple
    // the size of a leaf clump is fine; making it the size of a branch is not.
    const oak = resolveSpecies('bur-oak', DEFAULT_CUSTOM);
    const leafCard = oak.leafSize * 1.25 * GARDEN_CONFIG.tree.leafCardScale;
    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const r = resolveSpecies(id, DEFAULT_CUSTOM);
        const card = GARDEN_CONFIG.garden.fruit.size * r.fruitSize;
        expect(card).toBeLessThan(leafCard * 1.3);
        // And small against its own tree, or the tree reads as a toy.
        expect(card / r.matureHeight).toBeLessThan(0.14);
    }
});

// ---- The cluster has to read as SEVERAL fruit (M12-7) ----------------------

/**
 * WHY THIS IS A TEST AND NOT AN EYE. The first mask drew three equal circles
 * close enough to touch, and the QA note that came back was "the shapes look a
 * little off": what had actually shipped was one blob per card, in four
 * colours, with a wedge of converging stalks above it. Nothing in the counts,
 * the schedule, the colours or the pixel sizes was wrong, and all of them
 * passed. The property those tests could not see is that the cluster has to
 * have GAPS in it, so it is written down here.
 */
test('the fruit in a cluster do not touch each other', () => {
    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const r = resolveSpecies(id, DEFAULT_CUSTOM);
        const shape = FRUIT_SHAPES[r.fruit.shape];
        const card = GARDEN_CONFIG.garden.fruit.size * r.fruitSize;
        const y = r.matureHeight * 0.6;
        const bodies = shape.bodies;
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const a = bodies[i];
                const b = bodies[j];
                // Widest part against widest part, which is the belly of a pear
                // and the whole of a sphere. A neck is narrower than the belly
                // it grows out of, so this is the conservative comparison.
                const gap = Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r);
                const px = pxAcross(gap * card, y, 0);
                expect(`${id} ${i}-${j}`).toBe(px >= 1 ? `${id} ${i}-${j}` : `${id} ${i}-${j} MERGED`);
            }
        }
    }
});

test('every fruit tree has its own drawing, and it fits on the card', () => {
    const seen = new Set();
    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const r = resolveSpecies(id, DEFAULT_CUSTOM);
        const shape = FRUIT_SHAPES[r.fruit.shape];
        expect(`${id}: ${shape ? 'drawn' : 'MISSING'}`).toBe(`${id}: drawn`);
        // No two species share a silhouette, or the shapes are decoration.
        const key = JSON.stringify(shape.bodies);
        expect(seen.has(key)).toBe(false);
        seen.add(key);

        // A body that runs off the card is sliced flat by the card's own edge,
        // which is a straight line across a piece of fruit and reads as a
        // rendering fault rather than as a shape.
        const tall = shape.kind === 'pear' ? shape.axis + shape.neck : (shape.squash || 1);
        for (const b of shape.bodies) {
            expect(Math.abs(b.x) + b.r).toBeLessThan(0.5);
            expect(b.y + b.r * (shape.squash || 1)).toBeLessThan(1);
            expect(b.y - b.r * tall).toBeGreaterThan(shape.node);
        }
        expect(shape.node).toBeGreaterThan(0);
    }
});

test('a cherry is mostly stalk and an orange has almost none', () => {
    // The one cue each of those two has at eight pixels. A cherry's pedicel is
    // longer than the fruit is wide and a citrus sits tight against the twig,
    // so if these ever swap places the two trees stop being tellable apart.
    const cherry = FRUIT_SHAPES.cherry;
    const lowest = Math.max(...cherry.bodies.map((b) => b.y - b.r * cherry.enter));
    const widest = Math.max(...cherry.bodies.map((b) => b.r * 2));
    expect(lowest - cherry.node).toBeGreaterThan(widest * 1.5);

    const orange = FRUIT_SHAPES.orange;
    const oLowest = Math.max(...orange.bodies.map((b) => b.y - b.r * orange.enter));
    const oWidest = Math.max(...orange.bodies.map((b) => b.r * 2));
    expect(oLowest - orange.node).toBeLessThan(oWidest);
});

test('true scale would have been invisible, which is why it is not used', () => {
    // Kept as a measurement rather than a comment, because "just draw it life
    // size" is the obvious suggestion and it is wrong here for a reason that
    // only a number can settle.
    expect(pxAcross(0.08, 2.7, 0)).toBeLessThan(3);   // an apple
    expect(pxAcross(0.02, 4.8, 0)).toBeLessThan(1);   // a cherry
});


// ---- Fruit has to be a different colour from its own leaves (M12-6) --------

/**
 * THE SECOND HALF OF "TOO SMALL TO SEE", AND IT WAS INVISIBLE FOR A DIFFERENT
 * REASON. With the pixel sizes fixed, QA reported the cherries and the oranges
 * reading and the apples and the pears still absent.
 *
 * They were being drawn, at the right size, on the right schedule. They were
 * the same COLOUR as the canopy they hung in. The apple's unripe green was
 * 0x7f9a4e against its own summer foliage of 0x4c7538 and spring of 0x86a84e,
 * and it did not colour up until hour 14.5, by which point the leaves were
 * turning too, so fruit and canopy changed together and the red arrived onto
 * ochre.
 *
 * CALIBRATED AGAINST THE TWO THAT WORK rather than against a number somebody
 * liked the look of. The cherry reads in frame and its worst moment measures
 * 113, so 110 is the floor and every species is held to it across every hour
 * it has fruit on the branch.
 */

/** Redmean colour distance. Cheap, and good enough to rank against a
 *  reference that is known to read on a real screen. */
function colourDistance(a, b) {
    const rm = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

const bytes = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));

/** What the canopy is wearing at an hour, the way the leaf shader mixes it. */
function canopyColour(species, hour) {
    const phen = phenologyAt(hour, !!species.evergreen);
    const f = species.foliage;
    let c = blend(bytes(f.summer), bytes(f.autumn), phen.color);
    if (phen.color <= 0) c = blend(c, bytes(f.spring), 1 - phen.leaf);
    return c;
}

/** The worst moment a species has, over every hour it carries fruit. */
function worstContrast(id) {
    const s = speciesById(id);
    let worst = Infinity;
    let at = 0;
    for (let h = 0; h < 24; h += 0.05) {
        const stage = fruitStageAt(h, s.schedule);
        // Only while there is meaningfully fruit on the tree. A single fruit
        // mid-drop is not what anybody is looking at.
        if (stage.size * (1 - stage.drop) < 0.5) continue;
        const fruit = blend(bytes(s.fruit.unripe), bytes(s.fruit.ripe), stage.ripe);
        const d = colourDistance(fruit, canopyColour(s, h));
        if (d < worst) { worst = d; at = h; }
    }
    return { worst, at };
}

test('no fruit is ever the same colour as the leaves around it', () => {
    // The cherry is the calibration: it reads on a real screen and its worst
    // moment is 113. Anything at or above that floor reads too.
    const cherry = worstContrast('cherry');
    expect(cherry.worst).toBeGreaterThan(110);

    for (const id of ['apple', 'pear', 'orange', 'cherry']) {
        const { worst, at } = worstContrast(id);
        expect(`${id} worst ${Math.round(worst)} at hour ${at.toFixed(1)}`)
            .toBe(worst >= 110 ? `${id} worst ${Math.round(worst)} at hour ${at.toFixed(1)}` : `${id} BLENDS INTO ITS OWN CANOPY`);
    }
});

test('unripe fruit is a lighter, yellower green than the leaves, not a leaf green', () => {
    // The specific mistake. An unripe apple that matches its own foliage is
    // botanically defensible and completely invisible, and it is invisible for
    // MOST of the fruit's life, because the green phase is the long one.
    for (const id of ['apple', 'pear', 'orange']) {
        const s = speciesById(id);
        const unripe = bytes(s.fruit.unripe);
        const summer = bytes(s.foliage.summer);
        const spring = bytes(s.foliage.spring);
        expect(colourDistance(unripe, summer)).toBeGreaterThan(110);
        // Lighter than the canopy, which is what "unripe" looks like in life.
        expect(unripe[0] + unripe[1] + unripe[2]).toBeGreaterThan(summer[0] + summer[1] + summer[2]);
        // NOT asserted against the SPRING colour. The leaf shader only mixes
        // spring in while the canopy is still expanding, weighted by how far
        // short of full size the leaves are, and every one of these trees has
        // full leaves long before it has fruit. The hour-by-hour sweep above is
        // what covers the moments that actually happen.
    }
});

test('the fruit colours up before the canopy turns, which is where the contrast is', () => {
    // Fruit and leaves changing colour together is the worst possible timing
    // and it is what shipped: apple ripened 14.5 to 17.5 against a leaf turn of
    // 15 to 18. Real apples and pears come in before the leaves go.
    const turnStart = GARDEN_CONFIG.season.phenology.turnStart;
    for (const id of ['apple', 'pear', 'cherry']) {
        const s = speciesById(id);
        // Fully ripe while the canopy is still mostly green.
        expect(phenologyAt(s.schedule.ripenEnd, false).color).toBeLessThan(0.25);
        expect(s.schedule.ripenEnd).toBeLessThan(turnStart + 3);
    }
});

test('the three deciduous fruit trees ripen in the right order', () => {
    // Cherry in high summer, then pear, then apple. That is the real order and
    // it is also three separate events rather than one, which is worth more in
    // frame than any of them individually.
    const at = (id) => speciesById(id).schedule.ripenEnd;
    expect(at('cherry')).toBeLessThan(at('pear'));
    expect(at('pear')).toBeLessThan(at('apple'));
});
