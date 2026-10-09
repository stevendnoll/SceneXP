// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Halloween week in the yard (www/leaves/js/halloween.js, M6), measured:
 * the week is October 24 to 31 by the visitor's own calendar (and the lab's
 * address only on a QA host), the trick-or-treaters walk the sidewalk end
 * to end, stop at our walk to look at the house, wait for anybody in their
 * way, and come back now and then. Then the pair on the real three.js.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const H = await import('../www/leaves/js/halloween.js');
const S = await import('../www/leaves/js/sim.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const HW = C.halloween;
const walkX = C.yard.house.door;

describe('when it is Halloween week', () => {
    test('October 24 to 31 by the local calendar, and no other day', () => {
        const on = (m, d) => H.isHalloweenWeek(new Date(2026, m, d, 12), HW);
        expect(on(9, 7)).toBe(false);
        expect(on(9, 23)).toBe(false);
        expect(on(9, 24)).toBe(true);
        expect(on(9, 31)).toBe(true);
        expect(on(10, 1)).toBe(false);
        // Late on the 31st and early on the 24th are still the week.
        expect(H.isHalloweenWeek(new Date(2026, 9, 31, 23, 59), HW)).toBe(true);
        expect(H.isHalloweenWeek(new Date(2026, 9, 24, 0, 1), HW)).toBe(true);
        expect(H.isHalloweenWeek(null, HW)).toBe(false);
    });

    test('the decorations are up all October, and the week\'s extras from the 24th', () => {
        expect(H.seasonFor('', new Date(2026, 8, 30), HW, false)).toEqual({ decor: false, week: false });
        expect(H.seasonFor('', new Date(2026, 9, 1), HW, false)).toEqual({ decor: true, week: false });
        expect(H.seasonFor('', new Date(2026, 9, 7), HW, false)).toEqual({ decor: true, week: false });
        expect(H.seasonFor('', new Date(2026, 9, 24), HW, false)).toEqual({ decor: true, week: true });
        // Still up on November 1st, the morning after, and down on the 2nd.
        expect(H.seasonFor('', new Date(2026, 10, 1, 20), HW, false)).toEqual({ decor: true, week: false });
        expect(H.seasonFor('', new Date(2026, 10, 2), HW, false)).toEqual({ decor: false, week: false });
    });

    test('the lab\'s address decides it on a QA host, and nowhere else', () => {
        const july = new Date(2026, 6, 4);
        const oct28 = new Date(2026, 9, 28);
        expect(H.seasonFor('?halloween=1', july, HW, true)).toEqual({ decor: true, week: true });
        expect(H.seasonFor('?halloween=0', oct28, HW, true)).toEqual({ decor: false, week: false });
        expect(H.seasonFor('?halloween=1', july, HW, false)).toEqual({ decor: false, week: false });
        expect(H.seasonFor('?halloween=0', oct28, HW, false)).toEqual({ decor: true, week: true });
        expect(H.seasonFor('', oct28, HW, true)).toEqual({ decor: true, week: true });
    });
});

describe('the trick-or-treaters', () => {
    const quiet = (random) => ({ active: true, person: { x: 0, z: 0 }, walkX, random });

    /** Step them for `seconds`, collecting events, until `until`. */
    function drive(tr, input, seconds, until = () => false, dt = 1 / 30) {
        const events = [];
        for (let t = 0; t < seconds && !until(tr); t += dt) {
            const e = H.stepTreaters(tr, dt, input, HW);
            if (e) events.push(e);
        }
        return events;
    }

    test('a pair walks the sidewalk end to end, stopping at our walk to look at the house', () => {
        const random = S.makeRandom(5);
        const tr = H.createTreaters(HW, random);
        const inp = quiet(random);
        let facedHouse = false;
        const events = [];
        for (let t = 0; t < 80 && events.filter((e) => e === 'gone').length < 1; t += 1 / 30) {
            const e = H.stepTreaters(tr, 1 / 30, inp, HW);
            if (e) events.push(e);
            if (tr.state === 'pause') facedHouse = facedHouse || Math.abs(Math.cos(tr.heading) + 1) < 1e-6;
        }
        expect(events).toEqual(['start', 'pause', 'gone']);
        expect(facedHouse).toBe(true);
        expect(tr.state).toBe('wait');
        // Along the sidewalk, both of them.
        tr.state = 'walk';
        for (const spot of H.treaterSpots(tr)) {
            expect(spot.z).toBeGreaterThan(C.yard.sidewalk.minZ);
            expect(spot.z).toBeLessThan(C.yard.sidewalk.maxZ);
        }
    });

    test('they pause for `pause` seconds, and walk on', () => {
        const random = S.makeRandom(5);
        const tr = H.createTreaters(HW, random);
        const inp = quiet(random);
        drive(tr, inp, 80, (t) => t.state === 'pause');
        expect(tr.x).toBe(walkX);
        drive(tr, inp, HW.pause - 0.1);
        expect(tr.state).toBe('pause');
        drive(tr, inp, 0.3);
        expect(tr.state).toBe('walk');
    });

    test('somebody standing on the sidewalk in their way, and they wait for them', () => {
        const random = S.makeRandom(5);
        const tr = H.createTreaters(HW, random);
        const inp = quiet(random);
        drive(tr, inp, 20, (t) => t.state === 'walk');
        inp.person = { x: tr.x + tr.dir * 0.9, z: HW.z };
        const x = tr.x;
        drive(tr, inp, 3);
        expect(tr.x).toBe(x);
        expect(tr.speed).toBe(0);
        inp.person = { x: 0, z: 0 };
        drive(tr, inp, 1);
        expect(Math.abs(tr.x - x)).toBeGreaterThan(0.5);
    });

    test('they come by again and again, from either end, and hold still behind a card', () => {
        const random = S.makeRandom(7);
        const tr = H.createTreaters(HW, random);
        const inp = quiet(random);
        const dirs = new Set();
        for (let t = 0; t < 400; t += 1 / 15) {
            if (H.stepTreaters(tr, 1 / 15, inp, HW) === 'start') dirs.add(tr.dir);
        }
        expect(tr.walks).toBeGreaterThanOrEqual(4);
        expect([...dirs].sort()).toEqual([-1, 1]);
        const held = { ...tr };
        drive(tr, { ...inp, active: false }, 10);
        expect(tr.x).toBe(held.x);
        expect(tr.state).toBe(held.state);
    });
});

// Steve's M6 QA: "maybe a few more trick-or-treaters?"
describe('more trick-or-treaters', () => {
    // Steve's M6 QA: "The second group of trick-or-treaters arrive too
    // late." They used to wait their turn behind a walk of 50 m.
    test('both groups come early, each in its own half of the sidewalk, and never meet, blown about or not', () => {
        const random = S.makeRandom(11);
        const groups = HW.groups.map((g) => H.createTreaters(HW, random, g));
        const firstWalk = [null, null];
        let closest = Infinity;
        let k = 0;
        // A gust now and then, across the sidewalk both ways.
        const wind = () => (Math.floor(k / 90) % 3 === 0 ? { x: 0.3, z: (Math.floor(k / 270) % 2 ? 1 : -1), speed: 6 } : null);
        for (let t = 0; t < 240; t += 1 / 15, k++) {
            groups.forEach((tr, g) => {
                if (H.stepTreaters(tr, 1 / 15, { active: true, person: null, walkX: -0.5, random, wind }, HW) === 'start' && firstWalk[g] === null) firstWalk[g] = t;
            });
            if (groups.every((tr) => tr.state !== 'wait')) {
                for (const a of H.treaterSpots(groups[0])) {
                    for (const b of H.treaterSpots(groups[1])) closest = Math.min(closest, Math.abs(a.z - b.z));
                }
            }
        }
        expect(firstWalk[0]).toBeLessThan(8);
        expect(firstWalk[1]).toBeLessThan(15);
        // A child is about 0.3 m across: never within reach of the other
        // group, side by side.
        expect(closest).toBeGreaterThan(0.35);
        // And both lanes, every child, on the sidewalk.
        for (const tr of groups) {
            for (const p of H.treaterSpots(tr)) {
                expect(p.z - 0.15).toBeGreaterThan(C.yard.sidewalk.minZ);
                expect(p.z + 0.15).toBeLessThan(C.yard.sidewalk.maxZ);
            }
        }
    });

    test('they come and go just past the edge of the view, not far down the street', () => {
        // At the sidewalk the default view is about 14 m across; a walk of
        // 35 m is mostly on screen.
        expect(HW.toX - HW.fromX).toBeLessThan(40);
        expect(HW.fromX).toBeLessThan(-12);
        expect(HW.toX).toBeGreaterThan(12);
    });

    test('a group of three walks single file in its lanes, and turns back without anybody jumping', () => {
        const tr = H.createTreaters(HW, S.makeRandom(3), HW.groups[1]);
        Object.assign(tr, { state: 'walk', x: 2, dir: 1, heading: Math.PI / 2, paused: true });
        const spots = H.treaterSpots(tr);
        expect(spots).toHaveLength(3);
        // One behind the other, a step apart.
        const xs = spots.map((p) => p.x).sort((a, b) => b - a);
        expect(xs[0] - xs[1]).toBeCloseTo(HW.spacing, 6);
        expect(xs[1] - xs[2]).toBeCloseTo(HW.spacing, 6);
        // Blown back the other way: once they turn, nobody has moved.
        const input = { active: true, person: null, walkX: -40, random: S.makeRandom(2), wind: () => ({ x: -1, z: 0, speed: 6 }) };
        let worst = 0;
        let before = H.treaterSpots(tr);
        for (let t = 0; t < 3; t += 1 / 30) {
            if (t > 0.5) input.wind = () => null;
            H.stepTreaters(tr, 1 / 30, input, HW);
            const after = H.treaterSpots(tr);
            after.forEach((p, k) => { worst = Math.max(worst, Math.hypot(p.x - before[k].x, p.z - before[k].z)); });
            before = after;
        }
        expect(tr.dir).toBe(-1);
        expect(worst).toBeLessThan((HW.speed * HW.hurry + HW.push) / 30 * 1.05);
    });
});

// Steve's M6 QA: "If there are leaves on the sidewalk when a trick-or-treater
// walks by, could we have the trick-or-treater kick the leaves back into the
// yard?"
describe('kicking the leaves', () => {
    test('each one puts a kicking foot down every `kick.every` meters, staggered, ahead of them', () => {
        const tr = H.createTreaters(HW, S.makeRandom(1), HW.groups[1]);
        Object.assign(tr, { state: 'walk', x: 0, dir: 1, heading: Math.PI / 2, paused: true });
        const count = [0, 0, 0];
        let together = 0;
        const input = { active: true, person: null, walkX: -40, random: S.makeRandom(2) };
        const meters = 7;
        for (let t = 0; t < meters / HW.speed; t += 1 / 60) {
            H.stepTreaters(tr, 1 / 60, input, HW);
            const feet = H.footfalls(tr, HW);
            if (feet.length > 1) together++;
            for (const f of feet) {
                count[f.k]++;
                expect(f.x).toBeCloseTo(H.treaterSpots(tr)[f.k].x + HW.kick.ahead, 6);
            }
        }
        for (const n of count) expect(Math.abs(n - meters / HW.kick.every)).toBeLessThanOrEqual(1);
        expect(together).toBe(0);
    });

    test('on the real sim, a group walking past leaves on the sidewalk kicks a good share of them back onto the lawn', () => {
        const sim = S.createSim(3000, C);
        S.scatterLeaves(sim, C);
        // Real leaves (scattered, so they have their size and drag), laid in
        // rows across the sidewalk.
        const ids = [];
        for (let i = 0; i < sim.count && ids.length < 300; i += 7) ids.push(i);
        ids.forEach((i, k) => {
            S.hangLeaf(sim, i, 0, 5, 0);
            S.layDown(sim, i, -5 + (k % 100) * 0.1, 7.55 + Math.floor(k / 100) * 0.45);
        });
        const tr = H.createTreaters(HW, S.makeRandom(1), HW.groups[1]);
        Object.assign(tr, { state: 'walk', x: -7, dir: 1, heading: Math.PI / 2, paused: true });
        const air = { ...C.blower, ...HW.kick.air };
        let kicks = [];
        let kicked = 0;
        const input = { active: true, person: null, walkX: -40, random: S.makeRandom(2) };
        for (let t = 0; t < 12; t += 1 / 30) {
            H.stepTreaters(tr, 1 / 30, input, HW);
            for (const f of H.footfalls(tr, HW)) {
                if (!S.restingNear(sim, f.x, f.z, HW.kick.radius)) continue;
                const len = Math.hypot(HW.kick.forward, 1);
                kicks.push({ jet: S.makeJet(air, f.x, f.z, (f.dir * HW.kick.forward) / len, -1 / len, true), until: t + HW.kick.time });
                kicked++;
            }
            kicks = kicks.filter((k) => k.until > t);
            S.stepSim(sim, 1 / 30, kicks.map((k) => k.jet));
        }
        for (let k = 0; k < 60; k++) S.stepSim(sim, 1 / 30, null);
        const back = ids.filter((i) => sim.pz[i] < C.yard.lawn.maxZ).length;
        expect(kicked).toBeGreaterThan(10);
        expect(back / ids.length).toBeGreaterThan(0.25);
        // Into the yard, not across it.
        for (const i of ids) expect(sim.pz[i]).toBeGreaterThan(C.yard.lawn.maxZ - 4);
    });

    test('a clear sidewalk is never kicked: there is nothing near their feet', () => {
        const sim = S.createSim(3000, C);
        S.scatterLeaves(sim, C);
        for (let x = -12; x < 12; x += 0.5) expect(S.restingNear(sim, x, HW.groups[0].z, HW.kick.radius)).toBe(0);
    });
});

describe('blown at by the leaf blower', () => {
    const B = C.blower;
    /** The blower's air, as main.js gives it them. */
    const windOf = (jet) => (x, y, z) => {
        const out = new Float32Array(3);
        const speed = S.airAt(jet, x, y, z, 0, out);
        return { x: out[0], z: out[2], speed };
    };

    /** A pair walking, `x` along the sidewalk. */
    function walking(x, dir = 1) {
        const tr = H.createTreaters(HW, S.makeRandom(1));
        Object.assign(tr, { state: 'walk', x, dir, heading: dir * Math.PI / 2, paused: true });
        return tr;
    }

    test('the real blower aimed at them from a few meters staggers them along with it, and they hurry off that way', () => {
        // The person on the lawn, aiming down the sidewalk at them (+x).
        const tr = walking(4, -1);
        const jet = S.makeJet(B, 1, HW.z, 1, 0, true);
        const input = { active: true, person: { x: 1, z: 6 }, walkX: -0.5, random: S.makeRandom(2), wind: windOf(jet) };
        const events = [];
        const x0 = tr.x;
        let leaned = 0;
        for (let t = 0; t < 0.6; t += 1 / 30) {
            const e = H.stepTreaters(tr, 1 / 30, input, HW);
            if (e) events.push(e);
            leaned = Math.max(leaned, tr.blown);
        }
        expect(events).toEqual(['blown']);
        expect(tr.state).toBe('blown');
        expect(leaned).toBeGreaterThan(0.3);
        // Pushed the way the air blows, though they were walking into it.
        expect(tr.x).toBeGreaterThan(x0 + 0.1);
        // Backs to the air: facing +x, down the wind.
        expect(Math.sin(tr.heading)).toBeGreaterThan(0.9);
        // The blower off, they recover and hurry off the way it sent them.
        input.wind = windOf(S.makeJet(B, 1, HW.z, 1, 0, false));
        for (let t = 0; t < HW.blownTime + 0.2; t += 1 / 30) H.stepTreaters(tr, 1 / 30, input, HW);
        expect(tr.state).toBe('walk');
        expect(tr.dir).toBe(1);
        expect(tr.hurrying).toBe(true);
        const x1 = tr.x;
        H.stepTreaters(tr, 1, input, HW);
        expect(tr.x - x1).toBeCloseTo(HW.speed * HW.hurry, 5);
        // And they stay on the sidewalk, however hard it blew.
        for (const p of H.treaterSpots(tr)) {
            expect(p.z).toBeGreaterThan(C.yard.sidewalk.minZ);
            expect(p.z).toBeLessThan(C.yard.sidewalk.maxZ);
        }
    });

    // Steve's M6 QA: the blown animation was "glitchy". Headings snapped
    // round, the second child jumped 1.7 m when they turned back, and the
    // edge of the blower's reach flicked them in and out of it.
    test('SMOOTH: through a whole blow and recovery, nobody jumps and nobody snaps round', () => {
        const tr = walking(4, -1);
        const on = S.makeJet(B, 1, HW.z, 1, 0, true);
        const off = S.makeJet(B, 1, HW.z, 1, 0, false);
        const input = { active: true, person: { x: 1, z: 6 }, walkX: -40, random: S.makeRandom(2), wind: windOf(on) };
        const dt = 1 / 30;
        let worstStep = 0;
        let worstTurn = 0;
        let turnedBack = false;
        let before = H.treaterSpots(tr);
        let heading = tr.heading;
        for (let t = 0; t < 5; t += dt) {
            if (t > 0.8) input.wind = windOf(off);
            const dir = tr.dir;
            H.stepTreaters(tr, dt, input, HW);
            if (tr.dir !== dir) turnedBack = true;
            const after = H.treaterSpots(tr);
            after.forEach((p, k) => { worstStep = Math.max(worstStep, Math.hypot(p.x - before[k].x, p.z - before[k].z)); });
            const d = Math.abs(Math.atan2(Math.sin(tr.heading - heading), Math.cos(tr.heading - heading)));
            worstTurn = Math.max(worstTurn, d);
            before = after;
            heading = tr.heading;
        }
        // They did turn back (the wind sent them the other way).
        expect(turnedBack).toBe(true);
        // At most a hurried stride's worth a frame, and a turn no faster
        // than turnRate.
        expect(worstStep).toBeLessThan((HW.speed * HW.hurry + HW.push) * dt * 1.05);
        expect(worstTurn).toBeLessThanOrEqual(HW.turnRate * dt + 1e-9);
    });

    test('air hovering at the edge of the threshold does not flick them in and out of it', () => {
        const tr = walking(4);
        let k = 0;
        // Just over, then just under, frame after frame.
        const input = { active: true, person: null, walkX: -40, random: S.makeRandom(2),
            wind: () => ({ x: 1, z: 0, speed: (k++ % 2 ? 0.95 : 1.05) * HW.blownAir }) };
        const states = [];
        for (let t = 0; t < 3; t += 1 / 30) {
            H.stepTreaters(tr, 1 / 30, input, HW);
            if (states[states.length - 1] !== tr.state) states.push(tr.state);
        }
        // One stagger, then off they run: never back and forth.
        expect(states).toEqual(['blown', 'walk']);
        // How hard they are blown eases: no frame jumps it by much.
        const eased = walking(4);
        const strong = { ...input, wind: () => ({ x: 1, z: 0, speed: 20 }) };
        let last = 0;
        let jump = 0;
        for (let t = 0; t < 1; t += 1 / 30) {
            H.stepTreaters(eased, 1 / 30, strong, HW);
            jump = Math.max(jump, Math.abs(eased.blown - last));
            last = eased.blown;
        }
        expect(jump).toBeLessThan(0.25);
    });

    // Steve's M6 QA: "The trick-or-treaters turn away when they're blown, but
    // they don't run away until I stop blowing."
    test('kept blowing at, they stagger a moment and then run off anyway, and keep running', () => {
        const tr = walking(4, -1);
        const input = { active: true, person: null, walkX: -40, random: S.makeRandom(2), wind: () => ({ x: 1, z: 0, speed: 8 }) };
        const states = [];
        for (let t = 0; t < 3; t += 1 / 30) {
            H.stepTreaters(tr, 1 / 30, input, HW);
            if (states[states.length - 1] !== tr.state) states.push(tr.state);
        }
        // Still in the air, and running: the way it blows, at a run.
        expect(states).toEqual(['blown', 'walk']);
        expect(tr.hurrying).toBe(true);
        expect(tr.dir).toBe(1);
        expect(tr.speed).toBeCloseTo(HW.speed * HW.hurry, 5);
        expect(HW.speed * HW.hurry).toBeGreaterThan(2.5);
    });

    test('the air of a blower aimed elsewhere, or too far off, does not bother them', () => {
        const tr = walking(4);
        const away = S.makeJet(B, 1, 2, 0, -1, true);
        const far = S.makeJet(B, -12, HW.z, 1, 0, true);
        for (const jet of [away, far]) {
            const input = { active: true, person: { x: 1, z: 2 }, walkX: -0.5, random: S.makeRandom(2), wind: windOf(jet) };
            for (let t = 0; t < 1; t += 1 / 30) expect(H.stepTreaters(tr, 1 / 30, input, HW)).toBe(null);
            expect(tr.blown).toBe(0);
        }
    });

    test('a hard gust toward the street cannot push them off the sidewalk', () => {
        const tr = walking(0);
        const input = { active: true, person: null, walkX: 50, random: S.makeRandom(2), wind: () => ({ x: 0, z: 1, speed: 30 }) };
        for (let t = 0; t < 5; t += 1 / 30) H.stepTreaters(tr, 1 / 30, input, HW);
        for (const p of H.treaterSpots(tr)) expect(p.z).toBeLessThan(C.yard.sidewalk.maxZ);
    });
});

describe('the drawing, on the real three.js', () => {
    let THREE;
    let Dc;
    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        Dc = await import('../www/leaves/js/decorations.js');
    });
    afterAll(() => { delete globalThis.THREE; });

    test('a little ghost and a little witch, child-sized, hidden while they are away', () => {
        const figs = H.createTreaterFigures(HW);
        const tr = H.createTreaters(HW, S.makeRandom(1));
        figs.update(tr, 0);
        expect(figs.group.visible).toBe(false);
        tr.state = 'walk';
        tr.x = 0;
        figs.update(tr, 0);
        expect(figs.group.visible).toBe(true);
        expect(figs.group.children).toHaveLength(2);
        for (const kid of figs.group.children) {
            kid.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(kid);
            const tall = box.max.y - box.min.y;
            expect(tall).toBeGreaterThan(0.9);
            expect(tall).toBeLessThan(1.45);
            expect(box.min.y).toBeGreaterThan(-0.05);
        }
    });

    test('no faces are carved where nothing can draw them, and the pumpkins are left as they are', () => {
        // Under Node there is no canvas for the faces' texture.
        const group = H.carvePumpkins(C.yard.pumpkins, HW);
        expect(group.children).toHaveLength(0);
    });

    test('each carved face lies on its pumpkin\'s skin, a few millimeters proud, facing the street', () => {
        const group = H.carvePumpkins(C.yard.pumpkins, HW, new THREE.Texture());
        expect(group.children).toHaveLength(HW.carved.length);
        group.updateMatrixWorld(true);
        group.children.forEach((face, k) => {
            const p = C.yard.pumpkins[HW.carved[k]];
            const at = face.geometry.attributes.position;
            const v = new THREE.Vector3();
            let worst = 0;
            for (let i = 0; i < at.count; i++) {
                v.fromBufferAttribute(at, i).applyMatrix4(face.matrixWorld);
                // The pumpkin is a sphere of radius r squashed to 0.72 tall,
                // its middle 0.72 r above what it sits on (house.js).
                const dx = v.x - p.x;
                const dy = (v.y - (p.y + p.r * 0.72)) / 0.72;
                const dz = v.z - p.z;
                expect(dz).toBeGreaterThan(0);
                // How far outside the skin, along the outward line.
                worst = Math.max(worst, Math.abs(Math.hypot(dx, dy, dz) - p.r));
            }
            // Never inside the skin, and never more than a few millimeters
            // off it (the squash stretches the 3 mm a little at the top).
            expect(worst).toBeLessThan(0.006);
        });
    });

    // Our yard's own decorations (M6 QA: "add more Halloween decorations to
    // the main user's yard") stand on the lawn, each on a box the sim knows,
    // so the leaves meet them. Nothing else may.
    test('NOTHING STANDS ON OUR LAWN UNSEEN BY THE LEAVES: every decoration hangs on a house, sits up high, stands past our lawn, or stands on a box the sim knows', () => {
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const Y = C.yard;
        const box = new THREE.Box3();
        let meshes = 0;
        group.traverse((o) => {
            if (!o.isMesh && !o.isLine) return;
            meshes++;
            // Precise: a box turned 45 degrees is not boxed twice over.
            box.setFromObject(o, true);
            const onAHouse = box.max.z <= Y.lawn.minZ + 0.6;
            const overhead = box.min.y >= 2;
            // Past the picket or the hedge (the other lawns' have their own
            // boxes, tested below).
            const pastTheSim = box.min.x > Y.neighbor.minX || box.max.x < Y.lawn.minX;
            // On or wound round something the sim treats as solid (a porch
            // post, a lantern, a skeleton, a pumpkin stack, whose bellies
            // bulge past their boxes as the porch pumpkins' always have),
            // within a few centimeters of it and no taller than its stem.
            const onSolid = S.solidBoxes(Dc.decoratedConfig(C).yard).some((b) => box.min.x >= b.minX - 0.1 && box.max.x <= b.maxX + 0.1
                && box.min.z >= b.minZ - 0.1 && box.max.z <= b.maxZ + 0.1 && box.max.y <= b.height + 0.12);
            // The mummy's wrappings, on the mailbox's body, over its post.
            const mail = Y.boxes.find((b) => b.name === 'mailbox');
            const onMailbox = box.min.y >= mail.height - 0.05 && box.min.x >= mail.minX - 0.15 && box.max.x <= mail.maxX + 0.15
                && box.min.z >= mail.minZ - 0.2 && box.max.z <= mail.maxZ + 0.4;
            expect({ name: o.name || o.type, ok: onAHouse || overhead || pastTheSim || onSolid || onMailbox })
                .toEqual({ name: o.name || o.type, ok: true });
        });
        expect(meshes).toBeGreaterThan(20);
    });

    test('the bats fly up our white wall beside the porch, under the eave, clear of the stone base', () => {
        const porch = C.yard.boxes.find((b) => b.name === 'porch');
        const H = C.yard.house;
        const flight = Dc.batFlight(HW.decor, H, porch.maxX);
        expect(flight.length).toBeGreaterThanOrEqual(HW.decor.bats - 2);
        for (const b of flight) {
            expect(b.x - b.size / 2).toBeGreaterThan(porch.maxX + 0.1);
            expect(b.x + b.size / 2).toBeLessThan(H.maxX);
            expect(b.y - b.size * 0.2).toBeGreaterThan(0.6);
            expect(b.y + b.size * 0.2).toBeLessThan(H.wall - 0.1);
        }
        // Rising as they go, and larger.
        expect(flight[flight.length - 1].y).toBeGreaterThan(flight[0].y + 1.2);
        expect(flight[flight.length - 1].size).toBeGreaterThan(flight[0].size);
    });

    test('string lights hang in scallops below their anchors, a bulb about every 30 cm', () => {
        const anchors = [{ x: 0, y: 3, z: 0 }, { x: 2, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }];
        const { bulbs, wire } = Dc.stringLights(anchors, 0.13, 0.3);
        expect(bulbs.length).toBeGreaterThanOrEqual(12);
        expect(bulbs.length).toBeLessThanOrEqual(14);
        for (const b of bulbs) expect(b.y).toBeLessThan(3);
        const lowest = Math.min(...wire.map((p) => p[1]));
        expect(lowest).toBeCloseTo(3 - 0.13, 2);
        expect(wire[0][1]).toBe(3);
    });

    test('the neighbor\'s inflatable and graveyard stand on his side, clear of his house, his tree and his path', () => {
        const D = HW.decor;
        const NH = C.yard.neighborHouse;
        const aspen = C.yard.trees.find((t) => t.species === 'quaking-aspen');
        const things = [{ x: D.inflatable.x, z: D.inflatable.z, r: D.inflatable.r }, ...D.graves.map((g) => ({ x: g.x, z: g.z, r: 0.35 }))];
        for (const t of things) {
            expect(t.x - t.r).toBeGreaterThan(C.neighbor.lineMax);
            expect(t.z - t.r).toBeGreaterThan(C.yard.neighbor.minZ);
            expect(t.z + t.r).toBeLessThan(C.yard.sidewalk.minZ);
            expect(Math.hypot(t.x - aspen.x, t.z - aspen.z)).toBeGreaterThan(t.r + 0.5);
        }
        expect(D.inflatable.x).toBeLessThan(NH.maxX);
    });

    // Steve's QA, 2026-10-08: no invisible walls, so the sim's ground now
    // reaches past his side fence and over the sage house's lawn.
    test('on the other lawns, now on the sim\'s ground, each decoration stands on a box the sim knows', () => {
        const D = HW.decor;
        const Y = C.yard;
        const theirs = Dc.theirDecorBoxes(C);
        const solid = S.solidBoxes(Dc.decoratedConfig(C).yard);
        const at = (x, z) => solid.filter((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
        const feet = [D.inflatable, D.ghostInflatable, D.skeleton, D.scarecrow, ...D.graves];
        for (const f of feet) {
            const inSim = f.x > Y.bounds.minX && f.x < Y.bounds.maxX && f.z > Y.bounds.minZ && f.z < Y.bounds.maxZ;
            expect(inSim).toBe(true);
            expect(at(f.x, f.z).length).toBeGreaterThan(0);
        }
        expect(theirs).toHaveLength(feet.length);
        // None reaches across a fence or onto a sidewalk.
        for (const b of theirs) {
            expect(b.maxZ).toBeLessThan(Y.sidewalk.minZ);
            const over = b.minX > Y.neighbor.minX ? b.maxX < Y.neighborYard.maxX : b.maxX < Y.lawn.minX;
            expect(over).toBe(true);
        }
        // And the sim is built with them only while the decorations are up.
        expect(Dc.decoratedConfig(C).yard.boxes.length).toBe(C.yard.boxes.length + Dc.yardDecorBoxes(C).length + theirs.length);
    });

    /** The decorations' meshes, each with its world box. */
    function boxes() {
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const out = [];
        group.traverse((o) => { if (o.isMesh) out.push({ o, box: new THREE.Box3().setFromObject(o) }); });
        return out;
    }

    // Steve's M6 QA: her legs out of the maple's trunk were "in a weird
    // spot". She dove headfirst into the top of our hedge instead.
    test('the witch who dove into our hedge kicks her legs up out of its top, all of her past our lawn', () => {
        const hedge = C.yard.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
        const her = boxes().filter(({ box }) => box.max.x < hedge.at && Math.abs((box.min.z + box.max.z) / 2 - HW.decor.witch.z) < 0.9);
        expect(her.length).toBeGreaterThan(15);
        for (const { box } of her) {
            // Over the hedge, inside its width, on our side of nothing.
            expect(box.min.x).toBeGreaterThan(hedge.at - 0.9);
            expect(box.max.x).toBeLessThan(hedge.at);
        }
        // Her boots kick up well over the hedge top, where the street sees them.
        const top = Math.max(...her.map(({ box }) => box.max.y));
        expect(top).toBeGreaterThan(hedge.height + 0.7);
        expect(top).toBeLessThan(hedge.height + 1.3);
    });

    test('the giant spider stands on the neighbor\'s roof, on its front slope, and not inside it', () => {
        const NH = C.yard.neighborHouse;
        // The eave stands out 0.4 m from his set back face (house.js).
        const front = C.yard.neighbor.minZ - NH.setBack + 0.4;
        const rise = NH.ridge - NH.wall + 0.05;
        const roofAt = (z) => NH.wall - 0.05 + ((front - z) / 4.4) * rise;
        const S = HW.decor.roofSpider;
        const spider = boxes().filter(({ box }) => Math.abs((box.min.x + box.max.x) / 2 - S.x) < 1.3 && box.min.y > NH.wall - 0.5 && box.max.z < front);
        expect(spider.length).toBeGreaterThan(15);
        // Every piece of it is above the roof's surface where it stands
        // (a leg's thickness allowed), and none floats far off it.
        let lowestGap = Infinity;
        for (const { box } of spider) {
            const gap = box.min.y - roofAt(box.max.z);
            lowestGap = Math.min(lowestGap, gap);
            expect(gap).toBeGreaterThan(-0.08);
        }
        expect(lowestGap).toBeLessThan(0.1);
    });

    test('the houses down the street have their pumpkins by the door, and the skeleton sits on its bale past his lawn', () => {
        const all = boxes();
        for (const h of C.yard.street) {
            const by = all.filter(({ box }) => box.min.x > h.minX - 1 && box.max.x < h.maxX + 1 && box.max.y < 0.5 && box.min.z > h.front);
            expect(by.length).toBeGreaterThanOrEqual(HW.decor.streetPumpkins.length);
        }
        const K = HW.decor.skeleton;
        const lounger = all.filter(({ box }) => Math.hypot((box.min.x + box.max.x) / 2 - K.x, (box.min.z + box.max.z) / 2 - K.z) < 0.9);
        expect(lounger.length).toBeGreaterThan(20);
        const top = Math.max(...lounger.map(({ box }) => box.max.y));
        expect(top).toBeGreaterThan(1.2);
        expect(top).toBeLessThan(1.6);
    });

    test('blown at, the witch holds her hat with both hands, and the ghost\'s sheet billows out', () => {
        const figs = H.createTreaterFigures(HW);
        // Facing the street (+z), so her left and right are along x.
        const tr = { ...H.createTreaters(HW, S.makeRandom(1)), state: 'walk', x: 0, dir: 1, heading: 0, blown: 0 };
        const witch = figs.group.children[1];
        const ghost = figs.group.children[0];
        const hands = () => {
            const out = [];
            witch.updateMatrixWorld(true);
            witch.traverse((o) => { if (o.userData && o.userData.isArm) out.push(o); });
            return out.map((arm) => {
                // The far end of the arm: its lowest point at rest.
                const box = new THREE.Box3().setFromObject(arm);
                return box;
            });
        };
        figs.update(tr, 0);
        const restTop = Math.max(...hands().map((b) => b.max.y));
        const ghostRest = new THREE.Box3().setFromObject(ghost);
        figs.update({ ...tr, blown: 1 }, 0.3);
        witch.updateMatrixWorld(true);
        const hatBox = new THREE.Box3().setFromObject(witch.getObjectByName('witch-hat'));
        const up = hands();
        // Both hands up, meeting over her middle at the brim of her hat.
        const middle = (hatBox.min.x + hatBox.max.x) / 2;
        for (const b of up) {
            expect(b.max.y).toBeGreaterThan(restTop + 0.2);
            expect(b.max.y).toBeGreaterThan(hatBox.min.y);
            expect(Math.min(Math.abs(b.min.x - middle), Math.abs(b.max.x - middle))).toBeLessThan(0.06);
        }
        const ghostBlown = new THREE.Box3().setFromObject(ghost);
        expect(ghostBlown.max.x - ghostBlown.min.x).toBeGreaterThan(ghostRest.max.x - ghostRest.min.x);
    });

    test('our yard\'s decorations are drawn on the boxes the leaves meet: every lantern, both pumpkin stacks, the skeletons', () => {
        const all = boxes();
        for (const b of Dc.yardDecorBoxes(C)) {
            const near = all.filter(({ box }) => box.max.x > b.minX - 0.05 && box.min.x < b.maxX + 0.05
                && box.max.z > b.minZ - 0.05 && box.min.z < b.maxZ + 0.05 && box.min.y < b.height);
            expect({ box: b.name, x: b.minX, drawn: near.length > 0 }).toEqual({ box: b.name, x: b.minX, drawn: true });
            const top = Math.max(...near.map(({ box }) => box.max.y));
            expect(Math.abs(top - b.height)).toBeLessThan(0.13);
        }
        // Where the walk meets the sidewalk, and clear of the walk and the
        // mailbox, and never on the tarp.
        const placed = Dc.yardDecorBoxes(C);
        const solid = C.yard.boxes;
        for (const b of placed) {
            for (const o of solid) {
                const overlap = b.minX < o.maxX && b.maxX > o.minX && b.minZ < o.maxZ && b.maxZ > o.minZ;
                expect({ b: b.name, o: o.name, overlap }).toEqual({ b: b.name, o: o.name, overlap: false });
            }
            const T = C.yard.tarp;
            expect(b.minX > T.maxX || b.minZ > T.maxZ).toBe(true);
        }
    });

    // Steve's QA, 2026-10-09: "add more detail to the stacked pumpkins...
    // could the top pumpkins not look so dark/black? ... slightly more
    // detail to the lanterns". The ribbed pumpkins are dimpled, which first
    // left each one floating 1 to 2 cm over the one below.
    test('the stacked pumpkins rest one on another, the top one not black, and each lantern is four draws', () => {
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const stacks = group.children.filter((c) => c.name === 'pumpkins');
        expect(stacks).toHaveLength(2);
        for (const stack of stacks) {
            const bodies = stack.children.map((pk) => new THREE.Box3().setFromObject(pk.children[0], true));
            expect(bodies[0].min.y).toBeCloseTo(0, 3);
            for (let k = 1; k < bodies.length; k++) {
                // Down into the one below, never above it, and not sunk deep.
                expect(bodies[k].min.y).toBeLessThan(bodies[k - 1].max.y);
                expect(bodies[k - 1].max.y - bodies[k].min.y).toBeLessThan(0.06);
            }
            // The top one carries its stem, above its own rim.
            const top = stack.children[stack.children.length - 1];
            expect(new THREE.Box3().setFromObject(top.children[1], true).max.y).toBeGreaterThan(bodies[bodies.length - 1].max.y + 0.02);
        }
        const topColor = new THREE.Color(HW.decor.towerPumpkins[HW.decor.towerPumpkins.length - 1].color);
        // Lightness as the eye has it (sRGB): the old black was 0.16.
        expect(topColor.getHSL({}, THREE.SRGBColorSpace).l).toBeGreaterThan(0.4);
        const lamps = group.children.filter((c) => c.name === 'lantern');
        expect(lamps).toHaveLength(HW.decor.lanterns.xs.length * HW.decor.lanterns.zs.length);
        for (const lamp of lamps) expect(lamp.children.filter((c) => c.isMesh)).toHaveLength(4);
    });

    // Steve's QA, 2026-10-08: "in front of the windows on the right (in front
    // of or near the window without the clown) we add a couple of tombstones
    // and grave plots".
    test('three graves before the window right of the porch, not the clown\'s, with room to walk behind them', async () => {
        const Ho = await import('../www/leaves/js/house.js');
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const stones = group.children.filter((c) => c.name === 'tombstone');
        const mounds = group.children.filter((c) => c.name === 'grave');
        expect(stones).toHaveLength(3);
        expect(mounds).toHaveLength(3);
        const W = Ho.OUR_WINDOWS;
        const porch = C.yard.boxes.find((b) => b.name === 'porch');
        // The window right of the porch that the clown is not in.
        const right = W.xs.map((x, i) => ({ x, i })).filter((w) => w.x > porch.maxX && w.i !== HW.decor.clown.window);
        expect(right.length).toBeGreaterThan(0);
        const window = right[0];
        const all = new THREE.Box3();
        stones.forEach((st) => all.union(new THREE.Box3().setFromObject(st, true)));
        expect(Math.abs((all.min.x + all.max.x) / 2 - window.x)).toBeLessThan(0.3);
        // Clear of the clown's window.
        expect(all.max.x).toBeLessThan(W.xs[HW.decor.clown.window] - W.w / 2);
        // Each mound in front of its stone, toward the street, low.
        mounds.forEach((m, k) => {
            const b = new THREE.Box3().setFromObject(m, true);
            const st = new THREE.Box3().setFromObject(stones[k], true);
            expect(b.min.z).toBeGreaterThan(st.max.z - 0.01);
            expect(b.max.y).toBeLessThan(0.15);
            // A grave's length, not a round (Steve: "Right now they're just
            // circles"), filling the box the leaves meet.
            expect((b.max.z - b.min.z) / (b.max.x - b.min.x)).toBeGreaterThan(2.5);
            const plot = Dc.yardDecorBoxes(C).filter((x) => x.name === 'grave')[k];
            expect(b.min.x).toBeCloseTo(plot.minX, 2);
            expect(b.max.z).toBeCloseTo(plot.maxZ, 2);
        });
        // A strip behind them the person fits along (a body is 0.3 either
        // side of its middle), short of the house where they cannot walk.
        const boxes = Dc.yardDecorBoxes(C).filter((b) => b.name === 'tombstone');
        const walkMinZ = C.yard.lawn.minZ + 0.6;
        for (const b of boxes) expect(b.minZ - walkMinZ).toBeGreaterThanOrEqual(0.6);
        // Gaps between the stones for the air to blow through.
        const sorted = [...boxes].sort((a, b) => a.minX - b.minX);
        for (let k = 1; k < sorted.length; k++) expect(sorted[k].minX - sorted[k - 1].maxX).toBeGreaterThan(0.2);
    });

    // Steve's M6 QA: "Maybe a skeleton or two (or three)?"
    test('three skeletons: one breaking out of the lawn, one raking, and one peeking over our hedge from behind it', () => {
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const skeletons = group.children.filter((c) => c.name === 'skeleton');
        expect(skeletons).toHaveLength(3);
        const hedge = C.yard.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
        const peeker = new THREE.Box3().setFromObject(skeletons[2], true);
        expect(peeker.max.x).toBeLessThan(hedge.at);
        expect(peeker.min.y).toBeGreaterThan(hedge.height - 0.1);
        // The raker stands as tall as a person, the riser low in its mound.
        const raker = new THREE.Box3().setFromObject(skeletons[1], true);
        expect(raker.max.y).toBeGreaterThan(1.6);
        const riser = new THREE.Box3().setFromObject(skeletons[0], true);
        expect(riser.max.y).toBeLessThan(1);
    });

    test('the second group: a little pumpkin and a little vampire, child-sized, and a grown-up behind them', () => {
        const figs = H.createTreaterFigures(HW, HW.groups[1].kinds);
        const tr = { ...H.createTreaters(HW, S.makeRandom(1), HW.groups[1]), state: 'walk', x: 0, heading: 0 };
        figs.update(tr, 0);
        expect(figs.group.children.map((c) => c.name)).toEqual(['pumpkin', 'vampire', 'parent']);
        const tall = figs.group.children.map((c) => {
            c.updateMatrixWorld(true);
            const b = new THREE.Box3().setFromObject(c, true);
            return b.max.y - b.min.y;
        });
        expect(tall[0]).toBeGreaterThan(0.9);
        expect(tall[0]).toBeLessThan(1.45);
        expect(tall[1]).toBeGreaterThan(0.9);
        expect(tall[1]).toBeLessThan(1.45);
        expect(tall[2]).toBeGreaterThan(1.6);
        expect(tall[2]).toBeLessThan(1.95);
    });

    // Steve's M6 QA: "something that looks like Jason or Michael Meyers -
    // maybe in one of the house's windows on the right".
    test('a masked figure stands in the neighbor\'s left window, now and then gone, and the ghost hangs clear of it', async () => {
        const Ho = await import('../www/leaves/js/house.js');
        const W = HW.decor.watcher;
        const window = Ho.neighborWindows(C.neighbor.door.x)[W.window];
        // The ghost (0.62 tall, about 0.45 across) hangs beside, not over it.
        expect(Math.abs(HW.decor.ghost.x - window)).toBeGreaterThan(0.55 + 0.22);
        // There for `seen` seconds, gone for `gone`, and back.
        expect(Dc.watcherThere(0, W)).toBe(true);
        expect(Dc.watcherThere(W.seen - 0.1, W)).toBe(true);
        expect(Dc.watcherThere(W.seen + 0.1, W)).toBe(false);
        expect(Dc.watcherThere(W.seen + W.gone + 0.1, W)).toBe(true);
        // Visible from the street at the start: the window is in the
        // default wide view.
        const V = await import('../www/leaves/js/view.js');
        const v = V.cameraFor(1.6, C.camera, C.yard.lawn, C.blower.start);
        const cam = new THREE.PerspectiveCamera(C.camera.fovDegrees, 1.6, 0.3, 200);
        cam.position.set(v.position.x, v.position.y, v.position.z);
        cam.lookAt(v.target.x, v.target.y, v.target.z);
        cam.updateMatrixWorld(true);
        const p = new THREE.Vector3(window, 1.75, C.yard.neighbor.minZ - C.yard.neighborHouse.setBack).project(cam);
        expect(Math.abs(p.x)).toBeLessThan(1);
        expect(Math.abs(p.y)).toBeLessThan(1);
    });

    // Steve's M6 QA: the watcher, centered, had "the window frames cover up
    // most of his face".
    test('both faces in the windows are clear of the window\'s cross of mullions', () => {
        for (const f of Object.values(Dc.WINDOW_FACES)) {
            // The mullions are 5 cm bars through the pane's middle, both ways.
            const halfX = (0.05 / f.pane[0]) * f.w / 2;
            const halfY = (0.05 / f.pane[1]) * f.h / 2;
            const [x0, y0, x1, y1] = f.box;
            const crossesUpright = x0 < f.w / 2 + halfX && x1 > f.w / 2 - halfX;
            const crossesBar = y0 < f.h / 2 + halfY && y1 > f.h / 2 - halfY;
            expect({ upright: crossesUpright, bar: crossesBar }).toEqual({ upright: false, bar: false });
            expect(x0).toBeGreaterThanOrEqual(0);
            expect(y0).toBeGreaterThanOrEqual(0);
        }
    });

    // Steve's M6 QA: "Could we add a monster or something to the main
    // character's house's furthest right window?"
    test('the clown in our far right window slides in, peeks, and slides away, round and round', () => {
        const P = HW.decor.clown;
        expect(P.window).toBe(3);
        expect(Dc.clownPeek(0, P)).toBe(0);
        expect(Dc.clownPeek(P.hidden + P.slide / 2, P)).toBeCloseTo(0.5, 5);
        expect(Dc.clownPeek(P.hidden + P.slide + 1, P)).toBe(1);
        expect(Dc.clownPeek(P.hidden + P.slide * 1.5 + P.stay, P)).toBeCloseTo(0.5, 5);
        const cycle = P.hidden + P.slide * 2 + P.stay;
        expect(Dc.clownPeek(cycle + P.hidden + P.slide + 1, P)).toBe(1);
        // Smoothly: no step jumps more than a frame's worth.
        let worst = 0;
        for (let t = 0; t < cycle * 2; t += 1 / 60) worst = Math.max(worst, Math.abs(Dc.clownPeek(t + 1 / 60, P) - Dc.clownPeek(t, P)));
        expect(worst).toBeLessThan(0.03);
    });

    // Steve's M6 QA: the cape was "floating far away from his body".
    test('the vampire\'s cape hangs from his shoulders, blown or not', () => {
        const figs = H.createTreaterFigures(HW, HW.groups[1].kinds);
        const tr = { ...H.createTreaters(HW, S.makeRandom(1), HW.groups[1]), state: 'walk', x: 0, heading: 0, blown: 0 };
        const vampire = figs.group.children[1];
        const cape = vampire.userData.cape;
        for (const blown of [0, 1]) {
            figs.update({ ...tr, blown }, 0.3);
            vampire.updateMatrixWorld(true);
            const c = new THREE.Box3().setFromObject(cape, true);
            const body = new THREE.Box3();
            vampire.children[0].traverse((o) => { if (o.isMesh && !cape.getObjectById(o.id)) body.expandByObject(o, true); });
            // Touching his back at the top, wherever its hem goes.
            expect(c.max.z).toBeGreaterThan(body.min.z - 0.03);
            expect(c.max.y).toBeGreaterThan(body.max.y - 0.25);
        }
    });

    // Steve's M6 QA: the clown was "too bright and takes away from the
    // Halloween aesthetic".
    test('the clown is in shadow: a dark room and dark colors, his face the palest thing and still dim', () => {
        const P = HW.decor.clown;
        const lum = (c) => {
            const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255);
        };
        expect(lum(P.room)).toBeLessThan(0.01);
        expect(lum(P.roomLight)).toBeLessThan(0.05);
        for (const k of ['nose', 'hair', 'suit', 'dots', 'hat']) expect(lum(P[k])).toBeLessThan(0.1);
        expect(lum(P.face)).toBeLessThan(0.5);
        expect(P.shade).toBeGreaterThan(0.3);
    });
});

