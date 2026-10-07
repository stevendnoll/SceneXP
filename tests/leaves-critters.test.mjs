// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The cat in the pile and the squirrel on the fence (www/leaves/js/
 * critters.js, M6), measured.
 *
 * Both are pure state machines, so they are driven step by step: the cat
 * only ever hides in a real pile (measured on the real sim) and never in the
 * tarp's, twitches twice, bursts out, and leaves by a route that keeps clear
 * of everything solid and hops high enough to clear the fence and the gate.
 * The squirrel comes over the gate, sits on the fence top facing the yard,
 * scolds the leaves flying past, and runs home when the air or a person
 * reaches it. Then the figures on the real three.js.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const S = await import('../www/leaves/js/sim.js');
const K = await import('../www/leaves/js/critters.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const CAT = C.cat;
const Q = C.squirrel;
const Y = C.yard;
const solids = S.solidBoxes(Y);
const fence = Y.walls.find((w) => w.axis === 'x' && w.height < 1.2);
// The side gate between the houses is 1.8 m tall, on the houses' front line.
const GATE = { z: Y.lawn.minZ - 0.05, height: 1.8 };

function yard(count = 9000) {
    const sim = S.createSim(count, C);
    S.scatterLeaves(sim, C);
    return sim;
}

/** Heap `n` of the yard's resting leaves at (x, z), leaf on leaf, the way
 *  leaves arriving one after another build a pile. */
function heap(sim, x, z, n) {
    let laid = 0;
    for (let i = 0; i < sim.count && laid < n; i++) {
        if (sim.awake[i] || sim.hanging[i]) continue;
        S.hangLeaf(sim, i, 0, 5, 0);
        S.layDown(sim, i, x, z);
        laid++;
    }
}

const depthOf = (sim) => (x, z) => {
    const c = S.cellIndex(sim, x, z);
    return sim.height[c] - sim.floor[c];
};

/** A seeded 0..1. */
const seeded = (seed) => S.makeRandom(seed);

describe('where the cat hides', () => {
    test('an untouched yard has no pile deep enough, so the cat never comes to one', () => {
        const sim = yard();
        expect(K.catPile(sim, Y, null, CAT, solids)).toBe(null);
    });

    test('a pile built off the tarp is found, but not with the person standing over it', () => {
        const sim = yard();
        heap(sim, 3, 2, 700);
        const pile = K.catPile(sim, Y, null, CAT, solids);
        expect(pile).not.toBe(null);
        expect(Math.hypot(pile.x - 3, pile.z - 2)).toBeLessThan(0.5);
        expect(pile.height).toBeGreaterThanOrEqual(CAT.pile);
        expect(K.catPile(sim, Y, { x: 3.5, z: 2.5 }, CAT, solids)).toBe(null);
        expect(K.catPile(sim, Y, { x: 3 + CAT.shy + 0.5, z: 2 }, CAT, solids)).not.toBe(null);
    });

    test('never the tarp\'s pile, which the dive needs', () => {
        const sim = yard();
        heap(sim, -8, -4, 900);
        expect(S.pilePeak(sim, Y.tarp).height).toBeGreaterThan(CAT.pile);
        expect(K.catPile(sim, Y, null, CAT, solids)).toBe(null);
    });
});

describe('the way out', () => {
    test('from the left of the yard into the hedge, from the right over the fence and the gate, clear of everything solid', () => {
        const left = K.catRoute(-3, -5, CAT, Y, solids);
        expect(left[left.length - 1].x).toBeLessThan(Y.lawn.minX);
        expect(left.every((l) => !l.hop)).toBe(true);
        const right = K.catRoute(7.5, 3, CAT, Y, solids);
        expect(right.filter((l) => l.hop)).toHaveLength(2);
        expect(right[right.length - 1].z).toBeLessThan(GATE.z);
        // Every ground leg keeps clear of the porch, the posts, the trunks
        // and the pumpkins, from wherever a pile can be.
        for (const [x, z] of [[-3, -5], [4.5, -5.5], [7.5, 3], [8.5, -5.5], [-8, 6], [0, 6.5], [5, 0]]) {
            const route = K.catRoute(x, z, CAT, Y, solids);
            if (!route) continue;
            let at = { x, z };
            for (const leg of route) {
                const inLawn = (p) => p.x > Y.lawn.minX + 0.2 && p.x < fence.at - 0.1;
                if (!leg.hop && inLawn(at) && inLawn(leg)) expect(K.segmentClear(at, leg, solids, 0.15)).toBe(true);
                at = leg;
            }
        }
    });

    test('a pile it could only leave through something solid is passed over', () => {
        // Behind the maple's trunk, against the house: the lane out runs
        // into the trunk.
        const tree = Y.trees[0];
        expect(K.catRoute(tree.x, tree.z - 1.2, CAT, Y, solids)).toBe(null);
    });
});

describe('the cat, step by step', () => {
    /** Drive the cat, collecting events and the heights it hops at. */
    function drive(cat, input, seconds, dt = 1 / 60) {
        const events = [];
        const over = { fence: 0, gate: 0 };
        let shown = false;
        for (let t = 0; t < seconds; t += dt) {
            const before = { x: cat.x, z: cat.z };
            const e = K.stepCat(cat, dt, input, CAT, Y, S.solidBoxes(Y));
            if (e) events.push(e);
            if ((before.x - fence.at) * (cat.x - fence.at) <= 0 && cat.state === 'run' && before.x !== cat.x) over.fence = Math.max(over.fence, cat.y);
            if ((before.z - GATE.z) * (cat.z - GATE.z) <= 0 && cat.state === 'run' && before.z !== cat.z) over.gate = Math.max(over.gate, cat.y);
            shown = shown || cat.visible;
        }
        return { events, over, shown };
    }

    const pileAt = (x, z) => ({ x, z, height: 0.4 });
    const input = (pile, depth = 0.4, active = true) => ({
        active, findPile: () => pile, depthAt: () => depth, random: seeded(9)
    });

    test('it hides, the pile twitches twice, it bursts out and trots off, and is gone', () => {
        const cat = K.createCat();
        const { events, over, shown } = drive(cat, input(pileAt(7.5, 3)), 40);
        expect(events.slice(0, 5)).toEqual(['hide', 'twitch', 'twitch', 'out', 'gone']);
        expect(shown).toBe(true);
        expect(cat.visible).toBe(false);
        expect(cat.visits).toBe(1);
        // It cleared the pickets and the gate, with room to spare.
        expect(over.fence).toBeGreaterThan(fence.height + 0.1);
        expect(over.gate).toBeGreaterThan(GATE.height + 0.05);
    });

    test('hidden in the pile it is not drawn, and it ploughs only on the ground', () => {
        const cat = K.createCat();
        const seen = { hidingVisible: false, ploughInHop: false, ploughed: false };
        const inp = input(pileAt(7.5, 3));
        for (let t = 0; t < 30; t += 1 / 60) {
            K.stepCat(cat, 1 / 60, inp, CAT, Y, solids);
            if (cat.state === 'hiding' || cat.state === 'twitch') seen.hidingVisible = seen.hidingVisible || cat.visible;
            if (cat.hopping && cat.ploughing) seen.ploughInHop = true;
            seen.ploughed = seen.ploughed || cat.ploughing;
        }
        expect(seen.hidingVisible).toBe(false);
        expect(seen.ploughInHop).toBe(false);
        expect(seen.ploughed).toBe(true);
    });

    test('blowing its pile away sends it out at once, with no twitching', () => {
        const cat = K.createCat();
        const inp = input(pileAt(-3, 2));
        drive(cat, inp, CAT.look + 0.1);
        expect(cat.state).toBe('hiding');
        inp.depthAt = () => 0.02;
        expect(K.stepCat(cat, 1 / 60, inp, CAT, Y, solids)).toBe('out');
        expect(cat.visible).toBe(true);
    });

    test('when the round stops letting it come, it slips away unseen', () => {
        const cat = K.createCat();
        const inp = input(pileAt(-3, 2));
        drive(cat, inp, CAT.look + 0.1);
        expect(cat.state).toBe('hiding');
        inp.active = false;
        const { events, shown } = drive(cat, inp, 20);
        expect(events).toEqual([]);
        expect(shown).toBe(false);
        expect(cat.state).toBe('away');
    });

    test('with no pile to be had, it never comes', () => {
        const cat = K.createCat();
        expect(drive(cat, input(null), 60).events).toEqual([]);
    });

    test('on the real sim its burst throws the pile up and its trot ploughs through the leaves', () => {
        const sim = yard();
        heap(sim, -3, 2, 700);
        const cat = K.createCat();
        const blower = { ...C.blower, ...CAT.plough };
        const inp = { active: true, findPile: () => K.catPile(sim, Y, null, CAT, solids), depthAt: depthOf(sim), random: seeded(4) };
        let woke = 0;
        let highest = 0;
        for (let t = 0; t < 25 && cat.visits === 0 || cat.state === 'run'; t += 1 / 30) {
            const e = K.stepCat(cat, 1 / 30, inp, CAT, Y, solids);
            if (e === 'twitch') S.burst(sim, cat.x, cat.z, CAT.twitchRadius, CAT.twitch);
            if (e === 'out') woke = S.burst(sim, cat.x, cat.z, CAT.burstRadius, CAT.burst);
            const plough = S.makeJet(blower, cat.x, cat.z, Math.sin(cat.heading), Math.cos(cat.heading), cat.ploughing);
            S.stepSim(sim, 1 / 30, plough);
            for (let a = 0; a < sim.activeCount; a++) highest = Math.max(highest, sim.py[sim.active[a]]);
            if (t > 60) break;
        }
        expect(woke).toBeGreaterThan(50);
        // A cat's burst, not a dive's: up, but well short of the dive's 2 m.
        expect(highest).toBeGreaterThan(0.6);
        expect(highest).toBeLessThan(2);
        expect(cat.state).toBe('away');
    });
});

describe('the squirrel, step by step', () => {
    const calm = () => ({ active: true, airAt: () => 0, leavesPast: () => 0, people: [], random: seeded(3) });

    /** Drive it until `until(sq)` or `seconds`, collecting events and its
     *  height where it crosses the gate's line. */
    function drive(sq, input, seconds, until = () => false, dt = 1 / 60) {
        const events = [];
        let atGate = 0;
        for (let t = 0; t < seconds && !until(sq); t += dt) {
            const z0 = sq.z;
            const e = K.stepSquirrel(sq, dt, input, Q);
            if (e) events.push(e);
            if ((z0 - GATE.z) * (sq.z - GATE.z) <= 0 && z0 !== sq.z) atGate = Math.max(atGate, sq.y);
        }
        return { events, atGate };
    }

    test('it comes over the gate, runs along the fence top, and sits facing the yard', () => {
        const sq = K.createSquirrel(Q, seeded(1));
        expect(sq.visible).toBe(false);
        const { events, atGate } = drive(sq, calm(), 30, (s) => s.state === 'sit');
        expect(events).toEqual(['arrive']);
        expect(atGate).toBeGreaterThan(GATE.height);
        expect(sq.state).toBe('sit');
        expect(sq.x).toBe(fence.at);
        expect(sq.y).toBeCloseTo(fence.height, 5);
        expect(sq.z).toBeGreaterThanOrEqual(Q.perch[0]);
        expect(sq.z).toBeLessThanOrEqual(Q.perch[1]);
        // Facing our yard, which is -x.
        expect(Math.sin(sq.heading)).toBeCloseTo(-1, 5);
    });

    test('leaves flying past make it chatter, and it settles again', () => {
        const sq = K.createSquirrel(Q, seeded(1));
        const inp = calm();
        drive(sq, inp, 30, (s) => s.state === 'sit');
        inp.leavesPast = () => Q.many;
        const { events } = drive(sq, inp, 0.5);
        expect(events).toEqual(['chatter']);
        expect(sq.pose).toBe('chatter');
        inp.leavesPast = () => 0;
        drive(sq, inp, Q.chatter + 0.1);
        expect(sq.state).toBe('sit');
    });

    test('air at it, or somebody close, and it runs home over the gate, to come back later', () => {
        for (const scare of ['air', 'person']) {
            const sq = K.createSquirrel(Q, seeded(1));
            const inp = calm();
            drive(sq, inp, 30, (s) => s.state === 'sit');
            if (scare === 'air') inp.airAt = () => Q.air + 0.5;
            else inp.people = [{ x: fence.at - 1, z: sq.z }];
            const { events, atGate } = drive(sq, inp, 10, (s) => s.state === 'away');
            expect(events).toEqual(['flee', 'gone']);
            expect(atGate).toBeGreaterThan(GATE.height);
            expect(sq.visible).toBe(false);
            expect(sq.z).toBeLessThan(GATE.z);
            inp.airAt = () => 0;
            inp.people = [];
            const back = drive(sq, inp, Q.cooldown[1] + 2, (s) => s.state === 'move');
            expect(back.events).toEqual(['arrive']);
        }
    });

    test('a person walking along our side of the lawn, a few meters off, does not bother it', () => {
        const sq = K.createSquirrel(Q, seeded(1));
        const inp = calm();
        drive(sq, inp, 30, (s) => s.state === 'sit');
        inp.people = [{ x: fence.at - 2.5, z: sq.z }];
        expect(drive(sq, inp, 5).events).not.toContain('flee');
    });

    test('on the real sim, leaves blown over the fence beside it count as flying past, and resting ones do not', () => {
        const sim = yard(3000);
        const at = { x: fence.at, y: fence.height + 0.1, z: 1 };
        expect(K.leavesNear(sim, at.x, at.y, at.z, Q.near, Q.fast)).toBe(0);
        // Aimed at the fence from 4 m, beside where it sits.
        const jet = S.makeJet(C.blower, 6, 1, 1, 0, true);
        let most = 0;
        for (let t = 0; t < 3; t += 1 / 30) {
            S.stepSim(sim, 1 / 30, jet);
            most = Math.max(most, K.leavesNear(sim, at.x, at.y, at.z, Q.near, Q.fast));
        }
        expect(most).toBeGreaterThanOrEqual(Q.many);
    });
});

describe('the figures, on the real three.js', () => {
    let THREE;
    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
    });
    afterAll(() => { delete globalThis.THREE; });

    const sizeOf = (group) => {
        group.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    };

    test('the cat stands on its feet at about a cat\'s size, larger than life, and is hidden until it is out', () => {
        const fig = K.createCatFigure(CAT);
        expect(fig.group.visible).toBe(false);
        const cat = { ...K.createCat(), visible: true, x: 1, z: 2, heading: 0, speed: 2, stride: 0.3 };
        fig.update(cat, 0);
        const box = new THREE.Box3().setFromObject(fig.group);
        expect(box.min.y).toBeGreaterThan(-0.03);
        const size = sizeOf(fig.group);
        expect(size.y).toBeGreaterThan(0.3);
        expect(size.y).toBeLessThan(0.7);
        expect(size.z).toBeGreaterThan(0.45);
        expect(size.z).toBeLessThan(0.9);
    });

    test('the squirrel sitting up is taller than running, and both sit on the fence top', () => {
        const fig = K.createSquirrelFigure(Q);
        const sq = { ...K.createSquirrel(Q, seeded(1)), visible: true, x: 10, y: fence.height, z: 0, pose: 'run', stride: 0 };
        fig.update(sq, 0);
        const running = new THREE.Box3().setFromObject(fig.group);
        expect(running.min.y).toBeGreaterThan(fence.height - 0.03);
        fig.update({ ...sq, pose: 'sit' }, 0);
        const sitting = new THREE.Box3().setFromObject(fig.group);
        expect(sitting.max.y - sitting.min.y).toBeGreaterThan(running.max.y - running.min.y);
        expect(sitting.max.y - fence.height).toBeLessThan(0.6);
        expect(sitting.min.y).toBeGreaterThan(fence.height - 0.05);
    });
});
