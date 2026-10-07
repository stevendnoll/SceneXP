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

    test('NOTHING IS ON OUR LAWN: every decoration hangs on a house, sits up high, or stands past the sim\'s ground on either side', () => {
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
            const pastTheSim = box.min.x > Y.bounds.maxX || box.max.x < Y.bounds.minX;
            // Wound round something the sim already treats as solid (a porch
            // post), within a few centimeters of it and no taller.
            const onSolid = S.solidBoxes(Y).some((b) => box.min.x >= b.minX - 0.06 && box.max.x <= b.maxX + 0.06
                && box.min.z >= b.minZ - 0.06 && box.max.z <= b.maxZ + 0.06 && box.max.y <= b.height + 0.05);
            expect({ name: o.name || o.type, ok: onAHouse || overhead || pastTheSim || onSolid }).toEqual({ name: o.name || o.type, ok: true });
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

    /** The decorations' meshes, each with its world box. */
    function boxes() {
        const { group } = Dc.buildDecorations(C);
        group.updateMatrixWorld(true);
        const out = [];
        group.traverse((o) => { if (o.isMesh) out.push({ o, box: new THREE.Box3().setFromObject(o) }); });
        return out;
    }

    test('the witch who flew into the maple shows her legs and boots over the hedge, past our lawn', () => {
        const tree = C.yard.trees.find((t) => t.x < C.yard.bounds.minX && t.z > C.yard.lawn.minZ);
        const hedge = C.yard.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
        const near = boxes().filter(({ box }) => box.max.x < C.yard.bounds.minX
            && Math.abs((box.min.z + box.max.z) / 2 - tree.z) < 1.2 && box.min.y > 1.5);
        expect(near.length).toBeGreaterThan(10);
        for (const { box } of near) {
            // On or above the hedge top, where the street can see them.
            expect(box.min.y).toBeGreaterThanOrEqual(hedge.height - 1e-3);
            expect(box.max.x).toBeLessThan(hedge.at);
        }
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
});

