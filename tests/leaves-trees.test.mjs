// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The trees' falling leaves and the score (www/leaves/js/trees.js and
 * score.js), measured on the real sim. Steve's M6 QA, 2026-10-07: "I can
 * never get to 100% complete. I turned the timer off but could not get above
 * 99%."
 *
 * Two things kept a cleared lawn from ever reading 100%:
 *
 * 1. THE TREES NEVER STOPPED. Each crown took leaves back from the street as
 *    it ran low and let them fall onto the lawn again, three or four always
 *    in the air, and a leaf in the air over the lawn counted as on it. Now a
 *    leaf on its way down is not counted until it lands, and the crowns do
 *    not refill: each lets go of what it holds and is done.
 * 2. THE PORCH COUNTED AS LAWN. A leaf blown up onto the porch, its step or a
 *    pumpkin lies inside the lawn's rectangle, and nobody can stand behind
 *    it to blow it off. It is counted `porch` now, off the lawn.
 *
 * The test that matters is the last: a lawn a visitor has cleared reaches
 * 100% once the trees are bare, and stays there.
 */
const S = await import('../www/leaves/js/sim.js');
const Tr = await import('../www/leaves/js/trees.js');
const Sc = await import('../www/leaves/js/score.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const Y = C.yard;

function yard(count = 3000) {
    const sim = S.createSim(count, C);
    S.scatterLeaves(sim, C);
    const crowns = Tr.createCrowns(sim, C);
    return { sim, crowns };
}

/** What a visitor with a leaf blower does, in one stroke: every leaf lying
 *  on the lawn (not up in a crown, not on its way down) laid in the street. */
function sweepToStreet(sim) {
    let k = 0;
    for (let i = 0; i < sim.count; i++) {
        if (sim.hanging[i] || sim.falling[i] || sim.awake[i]) continue;
        if (Sc.regionOf(sim.px[i], sim.pz[i], Y) !== 'lawn') continue;
        // Nobody can get behind the porch to blow a leaf off it.
        if (sim.floor[S.cellIndex(sim, sim.px[i], sim.pz[i])] > 0) continue;
        S.hangLeaf(sim, i, 0, 5, 0);
        S.layDown(sim, i, -8 + (k % 160) * 0.1, Y.sidewalk.maxZ + 0.5 + Math.floor(k / 160) * 0.1);
        k++;
    }
    return k;
}

function run(sim, crowns, seconds, dt = 1 / 30) {
    let fell = 0;
    for (let t = 0; t < seconds; t += dt) {
        fell += Tr.stepCrowns(crowns, sim, dt, C);
        S.stepSim(sim, dt, null);
    }
    return fell;
}

describe('a leaf on its way down from a tree', () => {
    test('is not counted until it lands, and then where it lands', () => {
        const { sim, crowns } = yard();
        const before = Sc.tally(sim, Y);
        // Let go of one, and catch it in the air.
        let caught = -1;
        for (let t = 0; t < 10 && caught < 0; t += 1 / 30) {
            Tr.stepCrowns(crowns, sim, 1 / 30, C);
            for (let i = 0; i < sim.count; i++) if (sim.falling[i]) { caught = i; break; }
        }
        expect(caught).toBeGreaterThanOrEqual(0);
        expect(sim.awake[caught]).toBe(1);
        const inAir = Sc.tally(sim, Y);
        // Out of the yard while it falls, as it was while it hung.
        expect(inAir.total).toBeLessThanOrEqual(before.total);
        for (let t = 0; t < 8 && sim.awake[caught]; t += 1 / 30) S.stepSim(sim, 1 / 30, null);
        Tr.stepCrowns(crowns, sim, 1 / 30, C);
        expect(sim.awake[caught]).toBe(0);
        expect(sim.falling[caught]).toBe(0);
    });

    test('the trees let go of what they hold and then are done: nothing more falls', () => {
        const { sim, crowns } = yard();
        const held = crowns.reduce((n, c) => n + c.leaves.length, 0);
        expect(held).toBeGreaterThan(0);
        const fell = run(sim, crowns, 150);
        expect(fell).toBe(held);
        expect(crowns.every((c) => c.leaves.length === 0)).toBe(true);
        expect(run(sim, crowns, 30)).toBe(0);
    });

    test('the sugar maple still has leaves falling at the end of a round', () => {
        const { sim, crowns } = yard();
        run(sim, crowns, C.round.seconds);
        const maple = crowns.find((c) => c.entry.species === 'sugar-maple' && c.entry.x > Y.lawn.minX);
        expect(maple.leaves.length).toBeGreaterThan(0);
    });
});

describe('on the porch is not on the lawn', () => {
    test('a leaf on the porch, its step or a pumpkin is counted on the porch, off the lawn', () => {
        const sim = S.createSim(4, C);
        const porch = Y.boxes.find((b) => b.name === 'porch');
        const step = Y.boxes.find((b) => b.name === 'step' && b.maxX < Y.lawn.maxX);
        const pumpkin = Y.pumpkins[0];
        S.layDown(sim, 0, (porch.minX + porch.maxX) / 2, (porch.minZ + porch.maxZ) / 2);
        S.layDown(sim, 1, (step.minX + step.maxX) / 2, (step.minZ + step.maxZ) / 2);
        S.layDown(sim, 2, pumpkin.x, pumpkin.z);
        S.layDown(sim, 3, 3, 2);
        const t = Sc.tally(sim, Y);
        expect(t.porch).toBe(3);
        expect(t.lawn).toBe(1);
        expect(t.lawn + t.tarp + t.street + t.neighbor + t.porch).toBe(t.total);
    });
});

describe('100%', () => {
    test('a lawn cleared of every leaf reads 100% once the trees are bare, and stays there', () => {
        const { sim, crowns } = yard();
        // The visitor clears the lawn, leaving a few on the porch.
        sweepToStreet(sim);
        const porch = Y.boxes.find((b) => b.name === 'porch');
        for (let i = 0, k = 0; i < sim.count && k < 5; i++) {
            if (sim.hanging[i] || sim.awake[i] || Sc.regionOf(sim.px[i], sim.pz[i], Y) !== 'street') continue;
            S.hangLeaf(sim, i, 0, 5, 0);
            S.layDown(sim, i, porch.minX + 0.5 + k * 0.4, porch.maxZ - 0.5);
            k++;
        }
        // The trees drop what they hold, and the visitor blows those away too.
        run(sim, crowns, 150);
        sweepToStreet(sim);
        let t = Sc.tally(sim, Y);
        expect(t.lawn).toBe(0);
        expect(t.porch).toBe(5);
        expect(Sc.percent(Sc.clearedShare(t))).toBe(100);
        // A minute later nothing has come down to spoil it.
        run(sim, crowns, 60);
        t = Sc.tally(sim, Y);
        expect(Sc.percent(Sc.clearedShare(t))).toBe(100);
    });
});
