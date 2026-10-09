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

    // The round was a minute, and the maple dropped leaves all through it.
    // At three minutes (Steve's QA, 2026-10-08, so a visitor can win) it
    // still drops them through the first minute, and every crown is bare
    // well before the clock runs out, so a lawn cleared at the end stays
    // clear.
    test('the sugar maple still has leaves falling a minute in, and every tree is bare before the clock runs out', () => {
        const { sim, crowns } = yard();
        run(sim, crowns, 60);
        const maple = crowns.find((c) => c.entry.species === 'sugar-maple' && c.entry.x > Y.lawn.minX);
        expect(maple.leaves.length).toBeGreaterThan(0);
        run(sim, crowns, C.round.seconds - 60 - 20);
        expect(crowns.every((c) => c.leaves.length === 0)).toBe(true);
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

    // Steve's QA, 2026-10-08: blowing leaves across the porch, the score
    // "will jump from like 80% to 96% and then drop back down to 85%". Every
    // leaf in the air above the porch counted `porch`, off the lawn, until it
    // came down on the far side.
    test('a drift blown across the porch counts where each leaf lands, not where it flies, so the score never jumps and falls back', () => {
        const sim = S.createSim(6000, C);
        S.scatterLeaves(sim, C);
        // A heap banked against the house right of the porch, late in a round.
        let k = 0;
        for (let i = 0; i < sim.count && k < 1600; i++) {
            if (Sc.regionOf(sim.px[i], sim.pz[i], Y) !== 'lawn' || sim.px[i] < -4) continue;
            S.hangLeaf(sim, i, 0, 5, 0);
            S.layDown(sim, i, 2 + (k % 40) * 0.1, -5.9 + Math.floor(k / 40) * 0.025);
            k++;
        }
        const landed = new Uint8Array(sim.count);
        Sc.tally(sim, Y, null, landed);
        let flying = 0;
        let counted = 0;
        let best = 0;
        let fallBack = 0;
        // Walking left in front of the step, blowing along the house.
        for (let x = 6, n = 0; x > 0; x -= 1 / 30, n++) {
            S.stepSim(sim, 1 / 30, [S.makeJet(C.blower, x, -3.2, -1, -0.35, true)]);
            if (n % 6) continue;
            flying = Math.max(flying, Sc.tally(sim, Y).porch);
            const t = Sc.tally(sim, Y, null, landed);
            counted = Math.max(counted, t.porch);
            const share = Sc.clearedShare(t);
            best = Math.max(best, share);
            fallBack = Math.max(fallBack, best - share);
        }
        // Counted where they were, hundreds were "on the porch" in mid-air.
        expect(flying).toBeGreaterThan(200);
        // Counted where they landed, only the few that came to rest there.
        expect(counted).toBeLessThan(flying / 10);
        expect(fallBack).toBeLessThan(0.005);
    });

    test('a leaf at rest counts where it lies, and one still moving where it last lay', () => {
        const sim = S.createSim(2, C);
        const porch = Y.boxes.find((b) => b.name === 'porch');
        S.layDown(sim, 0, 3, 2);
        S.layDown(sim, 1, (porch.minX + porch.maxX) / 2, (porch.minZ + porch.maxZ) / 2);
        const landed = new Uint8Array(2);
        expect(Sc.tally(sim, Y, null, landed)).toMatchObject({ lawn: 1, porch: 1 });
        expect([...landed].map((r) => Sc.REGIONS[r - 1])).toEqual(['lawn', 'porch']);
        // Both blown up and away, the lawn's over the fence, the porch's
        // into the street: they count where they last lay until they land.
        S.wake(sim, 0);
        S.wake(sim, 1);
        sim.px[0] = 12; sim.pz[0] = 2;
        sim.px[1] = 0; sim.pz[1] = 8;
        expect(Sc.tally(sim, Y, null, landed)).toMatchObject({ lawn: 1, porch: 1, neighbor: 0, street: 0 });
        // Without the record, where they are.
        expect(Sc.tally(sim, Y)).toMatchObject({ lawn: 0, neighbor: 1, street: 1 });
        // A moving leaf with no landing yet counts where it is.
        expect(Sc.tally(sim, Y, null, new Uint8Array(2))).toMatchObject({ neighbor: 1, street: 1 });
    });
});

describe('down the block', () => {
    // Steve's QA, 2026-10-08: no invisible walls, so a leaf can now be blown
    // down the sidewalk past the hedge or his side fence, onto the lawns
    // there. Those are off our lawn, counted with the street, and never his.
    test('a leaf past the hedge or past his side fence is off our lawn, and not over his fence', () => {
        expect(Sc.regionOf(Y.lawn.minX - 3, 6, Y)).toBe('street');
        expect(Sc.regionOf(Y.lawn.minX - 3, 8, Y)).toBe('street');
        expect(Sc.regionOf(Y.neighborYard.maxX + 1, 3, Y)).toBe('street');
        expect(Sc.regionOf(Y.neighborYard.maxX - 1, 3, Y)).toBe('neighbor');
        expect(Sc.regionOf(Y.lawn.minX + 0.5, 3, Y)).toBe('lawn');
    });

    test('the maple over the hedge drops its leaves on our side of it only, as it always did', () => {
        const sim = S.createSim(3000, C);
        S.scatterLeaves(sim, C);
        Tr.createCrowns(sim, C);
        for (let i = 0; i < sim.count; i++) {
            if (!sim.hanging[i]) continue;
            expect(sim.px[i]).toBeGreaterThan(Y.fallArea.minX);
            expect(sim.px[i]).toBeLessThan(Y.fallArea.maxX);
        }
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
