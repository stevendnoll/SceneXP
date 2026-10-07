// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The leaf blower's neighbor (www/leaves/js/neighbor.js), measured, and the
 * figure he is drawn as (www/leaves/js/blower.js).
 *
 * His rules are a pure state machine, so they are checked by driving it: he
 * stays in until enough of our leaves are on his lawn, comes out, blows,
 * watches, goes back in, comes out sooner each time with the big blower
 * from his third visit, waves when the round is over, and never sets foot
 * in our yard. Then the real sim, to show that what he does actually sends
 * the leaves back over the fence, and the real three.js, to show that his
 * folded arms and his wave put his hands where the poses say.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const Nb = await import('../www/leaves/js/neighbor.js');
const S = await import('../www/leaves/js/sim.js');
const Sc = await import('../www/leaves/js/score.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const N = C.neighbor;
const quiet = { leaves: 0, minZ: Infinity, maxZ: -Infinity, maxX: -Infinity, active: true, over: false };

/** Step him until an event (or `seconds` run out), returning the events. */
function drive(nb, input, seconds, dt = 1 / 30) {
    const events = [];
    for (let t = 0; t < seconds; t += dt) {
        const e = Nb.stepNeighbor(nb, dt, input, N);
        if (e) events.push(e);
    }
    return events;
}

describe('when he comes out', () => {
    test('he stays in until enough of our leaves are on his lawn, and only while the round lets him', () => {
        const nb = Nb.createNeighbor(N);
        expect(drive(nb, { ...quiet, leaves: N.visitAt[0] - 1 }, 10)).toEqual([]);
        expect(drive(nb, { ...quiet, leaves: 500, active: false }, 10)).toEqual([]);
        expect(nb.state).toBe('inside');
        expect(Nb.isOut(nb)).toBe(false);
        expect(Nb.stepNeighbor(nb, 1 / 30, { ...quiet, leaves: N.visitAt[0] }, N)).toBe('out');
        expect(Nb.isOut(nb)).toBe(true);
        expect(nb.big).toBe(false);
    });

    test('a visit goes door, walk, blow, watch, walk, door, and back in', () => {
        const nb = Nb.createNeighbor(N);
        const input = { ...quiet, leaves: 100, minZ: 0, maxZ: 3, maxX: 12 };
        const events = drive(nb, input, 60);
        expect(events.slice(0, 4)).toEqual(['out', 'blow', 'watch', 'in']);
        expect(nb.visits).toBeGreaterThanOrEqual(1);
        // Through the door it swung all the way open, and shut behind him.
        const again = Nb.createNeighbor(N);
        let widest = 0;
        let blew = false;
        let folded = false;
        for (let t = 0; t < 40 && again.visits === 0; t += 1 / 30) {
            Nb.stepNeighbor(again, 1 / 30, input, N);
            widest = Math.max(widest, again.door);
            blew = blew || again.blowing;
            folded = folded || again.arms === 'folded';
        }
        expect(widest).toBe(1);
        expect(again.door).toBe(0);
        expect(blew).toBe(true);
        expect(folded).toBe(true);
        expect(again.state).toBe('inside');
    });

    test('each visit comes sooner, and the third brings the big blower', () => {
        expect(N.visitAt[1]).toBeLessThan(N.visitAt[0]);
        expect(N.cooldown[1]).toBeLessThan(N.cooldown[0]);
        const nb = Nb.createNeighbor(N);
        const input = { ...quiet, leaves: 100, minZ: 0, maxZ: 3, maxX: 12 };
        const bigOnVisit = [];
        for (let t = 0; t < 200 && bigOnVisit.length < 3; t += 1 / 30) {
            if (Nb.stepNeighbor(nb, 1 / 30, input, N) === 'out') bigOnVisit.push(nb.big);
        }
        expect(bigOnVisit).toEqual([false, false, true]);
        // After a visit he waits his cooldown, however many leaves there are.
        const fresh = Nb.createNeighbor(N);
        drive(fresh, input, 0);
        while (fresh.visits === 0) Nb.stepNeighbor(fresh, 1 / 30, input, N);
        expect(fresh.state).toBe('inside');
        expect(drive(fresh, input, N.cooldown[1] - 0.2)).toEqual([]);
        expect(drive(fresh, input, 0.5)).toEqual(['out']);
    });

    // STEVE'S M3 QA: he went back in with "a lot of leaves in his yard", then
    // came out again a few seconds later.
    test('he keeps at it while his lawn is clearing, and while we keep sending more', () => {
        const nb = Nb.createNeighbor(N);
        const input = { ...quiet, leaves: 400, minZ: 0, maxZ: 2, maxX: 12 };
        while (nb.state !== 'blow') Nb.stepNeighbor(nb, 1 / 30, input, N);
        // Clearing steadily (a good share every pass), he goes round again
        // and again.
        let leaves = 400;
        for (let t = 0; t < 40 && leaves > 60; t += 1 / 30) {
            leaves *= 0.995;
            Nb.stepNeighbor(nb, 1 / 30, { ...input, leaves: Math.round(leaves) }, N);
            expect(nb.state).toBe('blow');
        }
        // And while we pile more on, he stays out however long it takes.
        for (let t = 0; t < 30; t += 1 / 30) {
            leaves += 1;
            Nb.stepNeighbor(nb, 1 / 30, { ...input, leaves }, N);
        }
        expect(nb.state).toBe('blow');
        // Down to a few, he is done.
        expect(drive(nb, { ...input, leaves: N.clearLeft }, 30)[0]).toBe('watch');
    });

    test('a pass that gets nowhere ends the visit, so a few leaves he cannot reach do not keep him out', () => {
        const nb = Nb.createNeighbor(N);
        const input = { ...quiet, leaves: 80, minZ: 0, maxZ: 2, maxX: 12 };
        expect(drive(nb, input, 30)).toEqual(expect.arrayContaining(['out', 'blow', 'watch']));
        expect(nb.state).not.toBe('blow');
    });

    test('when the round ends mid-visit, he stops blowing and waves', () => {
        const nb = Nb.createNeighbor(N);
        const input = { ...quiet, leaves: 300, minZ: 0, maxZ: 2, maxX: 12 };
        while (nb.state !== 'blow') Nb.stepNeighbor(nb, 1 / 30, input, N);
        Nb.stepNeighbor(nb, 1 / 30, { ...input, over: true }, N);
        expect(nb.blowing).toBe(false);
        expect(nb.state).toBe('watch');
        drive(nb, { ...input, over: true }, 5);
        expect(nb.arms).toBe('wave');
        expect(nb.state).toBe('watch');
    });

    test('he blows from beyond the farthest of our leaves, then close to the fence', () => {
        const nb = Nb.createNeighbor(N);
        const input = { ...quiet, leaves: 100, minZ: -1, maxZ: 2, maxX: 14.5 };
        let far = -Infinity;
        let lastBlowX = null;
        for (let t = 0; t < 40 && nb.visits === 0; t += 1 / 30) {
            Nb.stepNeighbor(nb, 1 / 30, input, N);
            if (nb.blowing) {
                far = Math.max(far, nb.x);
                lastBlowX = nb.x;
            }
        }
        expect(far).toBeCloseTo(14.5 + N.behind, 5);
        expect(lastBlowX).toBeCloseTo(N.nearLine, 1);
    });
});

test('when the round is over he stays out and waves', () => {
    const nb = Nb.createNeighbor(N);
    const input = { ...quiet, leaves: 100, minZ: 0, maxZ: 1, maxX: 12 };
    while (nb.state !== 'watch') Nb.stepNeighbor(nb, 1 / 30, input, N);
    drive(nb, { ...input, over: true }, 20);
    expect(nb.state).toBe('watch');
    expect(nb.arms).toBe('wave');
});

test('he never sets foot in our yard, whatever our leaves do', () => {
    const nb = Nb.createNeighbor(N);
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let westmost = Infinity;
    for (let t = 0; t < 400; t += 1 / 30) {
        const a = -6 + random() * 13;
        const input = {
            leaves: Math.floor(random() * 400), minZ: a, maxZ: a + random() * 6, maxX: 10 + random() * 8,
            active: random() > 0.1, over: false
        };
        Nb.stepNeighbor(nb, 1 / 30, input, N);
        if (Nb.isOut(nb)) westmost = Math.min(westmost, nb.x);
    }
    expect(westmost).toBeGreaterThan(C.yard.lawn.maxX + 1);
});

test('his blowers are ours with his changes, the big one bigger', () => {
    const small = Nb.neighborBlower(C.blower, N, false);
    const big = Nb.neighborBlower(C.blower, N, true);
    expect(small.reach).toBe(C.blower.reach);
    expect(small.speed).toBe(N.blower.speed);
    expect(big.speed).toBeGreaterThan(small.speed);
    expect(big.range).toBeGreaterThan(small.range);
});

test('in the real sim, a visit sends our leaves back over the fence', () => {
    // A small yard, with 300 of its leaves laid on his lawn, near the fence
    // and well into it.
    const sim = S.createSim(800, C);
    S.scatterLeaves(sim, C);
    for (let i = 0; i < 300; i++) S.wake(sim, i);
    sim.activeCount = 0;
    sim.activeAt.fill(-1);
    for (let i = 0; i < 300; i++) S.layDown(sim, i, 10.3 + (i % 15) * 0.3, -2 + Math.floor(i / 15) * 0.3);
    const before = Sc.tally(sim, C.yard);
    expect(before.neighbor).toBe(300);
    const nb = Nb.createNeighbor(N);
    for (let f = 0; f < 60 * 70 && nb.visits === 0; f++) {
        const t = Sc.tally(sim, C.yard);
        Nb.stepNeighbor(nb, 1 / 60, { leaves: t.neighbor, minZ: t.nearZ, maxZ: t.farZ, maxX: t.deepX, active: true, over: false }, N);
        const his = S.makeJet(Nb.neighborBlower(C.blower, N, nb.big), nb.x, nb.z, Math.sin(nb.heading), Math.cos(nb.heading), nb.blowing);
        S.stepSim(sim, 1 / 60, his);
    }
    const after = Sc.tally(sim, C.yard);
    expect(nb.visits).toBe(1);
    // He went in with his lawn all but clear.
    expect(after.neighbor).toBeLessThanOrEqual(N.clearLeft + 10);
    // They went back to us, not into his house or off the map.
    expect(after.lawn + after.tarp + after.street).toBeGreaterThan(800 - 300 + 150);
});

describe('his figure, on the real three.js', () => {
    let THREE;
    let saved;
    let Op;

    beforeAll(async () => {
        saved = globalThis.THREE;
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        Op = await import('../www/leaves/js/blower.js');
    });
    afterAll(() => { globalThis.THREE = saved; });

    /** The figure in a pose, and where its hands are in its own frame. */
    function hands(arms) {
        const fig = Op.createOperatorFigure(C.blower, C.look, { person: { shoulderRound: 0.4 } });
        fig.update({ x: 0, z: 0, heading: 0, speed: 0, stride: 0 }, false, 0, arms);
        fig.group.updateMatrixWorld(true);
        const out = {};
        fig.group.traverse((o) => {
            if (!o.userData || !o.userData.isArm) return;
            const f = o.userData.forearm;
            const hand = f.children[f.children.length - 1];
            out[o.userData.armSide === -1 ? 'right' : 'left'] = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
        });
        return { fig, ...out };
    }

    test('folded arms put both hands across the chest, in front of it', () => {
        const { left, right } = hands('folded');
        for (const h of [left, right]) {
            expect(h.y).toBeGreaterThan(0.95);
            expect(h.y).toBeLessThan(1.2);
            expect(h.z).toBeGreaterThan(0.12);
        }
        // Crossed: each hand on the other side of the body.
        expect(right.x).toBeGreaterThan(0);
        expect(left.x).toBeLessThan(0);
    });

    test('the wave puts the right hand up beside the head', () => {
        const { right } = hands('wave');
        expect(right.y).toBeGreaterThan(1.6);
        expect(right.x).toBeLessThan(-0.3);
    });

    test('carrying, the right hand is down at the blower and the left hangs at the side', () => {
        const { left, right } = hands('carry');
        expect(right.y).toBeLessThan(1);
        expect(right.z).toBeGreaterThan(0.25);
        expect(left.y).toBeLessThan(0.9);
    });
});
