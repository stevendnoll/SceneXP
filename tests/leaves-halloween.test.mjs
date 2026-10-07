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

    test('the lab\'s address decides it on a QA host, and nowhere else', () => {
        const july = new Date(2026, 6, 4);
        const oct28 = new Date(2026, 9, 28);
        expect(H.halloweenFor('?halloween=1', july, HW, true)).toBe(true);
        expect(H.halloweenFor('?halloween=0', oct28, HW, true)).toBe(false);
        expect(H.halloweenFor('?halloween=1', july, HW, false)).toBe(false);
        expect(H.halloweenFor('?halloween=0', oct28, HW, false)).toBe(true);
        expect(H.halloweenFor('', oct28, HW, true)).toBe(true);
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
    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
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
});
