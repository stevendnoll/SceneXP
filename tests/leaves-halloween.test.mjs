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
        expect(H.seasonFor('', new Date(2026, 10, 1), HW, false)).toEqual({ decor: false, week: false });
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

    test('NOTHING IS ON OUR LAWN: every decoration hangs on a house, sits up high, or stands past the sim\'s ground', () => {
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const Y = C.yard;
        const box = new THREE.Box3();
        let meshes = 0;
        group.traverse((o) => {
            if (!o.isMesh && !o.isLine) return;
            meshes++;
            box.setFromObject(o);
            const onAHouse = box.max.z <= Y.lawn.minZ + 0.6;
            const overhead = box.min.y >= 2;
            const pastTheSim = box.min.x > Y.bounds.maxX;
            expect({ name: o.name || o.type, ok: onAHouse || overhead || pastTheSim }).toEqual({ name: o.name || o.type, ok: true });
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
            expect(t.x - t.r).toBeGreaterThan(C.yard.bounds.maxX);
            expect(t.x - t.r).toBeGreaterThan(C.neighbor.lineMax);
            expect(t.z - t.r).toBeGreaterThan(C.yard.neighbor.minZ);
            expect(t.z + t.r).toBeLessThan(C.yard.sidewalk.minZ);
            expect(Math.hypot(t.x - aspen.x, t.z - aspen.z)).toBeGreaterThan(t.r + 0.5);
        }
        expect(D.inflatable.x).toBeLessThan(NH.maxX);
    });
});

