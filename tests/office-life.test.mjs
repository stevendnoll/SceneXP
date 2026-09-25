// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's moving scenery (life.js), pure: the ferries' and ships'
 * timetables, the sailboats' loops, the seaplane's runs, the cars' lanes,
 * and the wind. Each must keep to the water (or the street), keep its
 * schedule, and never jump. What the window SEES of them is measured
 * through the camera in office-view.
 */
import {
    LIFE, minutesOn, minutesOfDay, gently, yawFor, ferryRoute, ferriesAt, shipsAt, sailboatCourses, sailboatsAt,
    SEAPLANE_START, takeoff, seaplaneAt, carLanes, carFleet, carPositions, drift
} from '../www/office/js/life.js';
import { CITY, WATER_Y, piers, isWater, isLand, groundY } from '../www/office/js/city.js';

const NOON = new Date(2026, 8, 24, 12, 0);
const later = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('keeping time', () => {
    test('two clocks: one unbroken for the runs, one from midnight for the daytime hours', () => {
        expect(minutesOn(later(NOON, 90)) - minutesOn(NOON)).toBeCloseTo(90, 9);
        expect(minutesOfDay(NOON)).toBe(720);
        expect(minutesOfDay(new Date(2026, 8, 24, 0, 0, 30))).toBeCloseTo(0.5, 9);
    });

    test('a gentle run starts and stops without a jolt', () => {
        expect(gently(0)).toBe(0);
        expect(gently(1)).toBeCloseTo(1, 12);
        expect(gently(0.5)).toBeCloseTo(0.5, 12);
        expect(gently(-1)).toBe(0);
        expect(gently(2)).toBeCloseTo(1, 12);
        // Barely moving at the ends, fastest in the middle.
        expect(gently(0.01) - gently(0)).toBeLessThan(0.0001);
        expect(gently(0.51) - gently(0.5)).toBeGreaterThan(0.019);
    });

    test('a heading faces the bow (built toward -z) along the way it goes', () => {
        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.6, -0.8]]) {
            const yaw = yawFor(dx, dz);
            // A -z bow turned by yaw about y.
            expect(-Math.sin(yaw)).toBeCloseTo(dx / Math.hypot(dx, dz), 9);
            expect(-Math.cos(yaw)).toBeCloseTo(dz / Math.hypot(dx, dz), 9);
        }
    });
});

describe('the ferries', () => {
    const route = ferryRoute();

    test('they run from the end of the dock at the foot of the office’s street to the island opposite', () => {
        const dock = piers().find((p) => p.ferry);
        expect(route.x).toBe(dock.x);
        expect(route.from).toBeLessThan(dock.z - dock.length);
        expect(isWater(route.x, route.from)).toBe(true);
        expect(isWater(route.x, route.to)).toBe(true);
        // Across the bay to the island: kilometers, with land just beyond the berth.
        expect(route.from - route.to).toBeGreaterThan(8000);
        expect(isLand(route.x, route.to - LIFE.ferry.length)).toBe(true);
    });

    test('over a whole cycle they keep to the water, keep right, and pass each other well apart', () => {
        for (let m = 0; m < LIFE.ferry.cycle; m += 0.5) {
            const [a, b] = ferriesAt(later(NOON, m), route);
            for (const f of [a, b]) {
                expect(isWater(f.x, f.z)).toBe(true);
                expect(f.y).toBe(WATER_Y);
                expect(f.z).toBeLessThanOrEqual(route.from + 1e-6);
                expect(f.z).toBeGreaterThanOrEqual(route.to - 1e-6);
            }
            expect(gap(a, b)).toBeGreaterThan(100);
        }
    });

    test('one leaves each side every half cycle, crosses in its crossing time, and waits at the berth', () => {
        // Find a departure from the city: a ferry at the city berth, and a
        // minute later under way west, on the north (+x) side.
        let departure = null;
        for (let m = 0; m < LIFE.ferry.cycle && departure == null; m += 0.25) {
            const before = ferriesAt(later(NOON, m), route);
            const after = ferriesAt(later(NOON, m + 0.25), route);
            const i = before.findIndex((f, k) => f.speed === 0 && Math.abs(f.z - route.from) < 1 && after[k].speed > 0);
            if (i >= 0) departure = { m, i };
        }
        expect(departure).not.toBeNull();
        const { m, i } = departure;
        const mid = ferriesAt(later(NOON, m + LIFE.ferry.crossing / 2), route)[i];
        expect(mid.x).toBeGreaterThan(route.x + LIFE.ferry.lane * 0.9);
        expect(mid.speed).toBeCloseTo(1, 1);
        // Heading west: bow toward -z.
        expect(-Math.cos(mid.yaw)).toBeLessThan(-0.99);
        const arrived = ferriesAt(later(NOON, m + LIFE.ferry.crossing + 0.25), route)[i];
        expect(arrived.z).toBeCloseTo(route.to, 3);
        expect(arrived.speed).toBe(0);
        // And the other boat leaves the island half a cycle after it.
        const half = ferriesAt(later(NOON, m + LIFE.ferry.cycle / 2 + 0.25), route)[i];
        expect(half.speed).toBeGreaterThan(0);
        expect(half.x).toBeLessThan(route.x);
    });

    test('no jump at midnight', () => {
        const before = ferriesAt(new Date(2026, 8, 24, 23, 59, 59, 900), route);
        const after = ferriesAt(new Date(2026, 8, 25, 0, 0, 0, 100), route);
        before.forEach((f, i) => expect(gap(f, after[i])).toBeLessThan(5));
    });
});

describe('the ships', () => {
    test('one passes the office’s line every so often, alternately north and south, each in its lane', () => {
        const seen = new Map();
        for (let m = 0; m < 600; m += 1) {
            const ships = shipsAt(later(NOON, m));
            expect(ships.length).toBeLessThanOrEqual(3);
            for (const s of ships) {
                expect(isWater(s.x, s.z)).toBe(true);
                expect(Math.abs(s.x)).toBeLessThanOrEqual(LIFE.ship.span);
                const north = s.z === LIFE.ship.lanes.north;
                expect(north || s.z === LIFE.ship.lanes.south).toBe(true);
                // Bow along +x northbound, -x southbound.
                expect(-Math.sin(s.yaw)).toBeCloseTo(north ? 1 : -1, 9);
                seen.set(s.k, north);
            }
        }
        const ks = [...seen.keys()].sort((a, b) => a - b);
        expect(ks.length).toBeGreaterThanOrEqual(Math.floor(600 / LIFE.ship.every));
        for (let i = 1; i < ks.length; i++) expect(seen.get(ks[i])).toBe(!seen.get(ks[i - 1]));
    });

    test('a ship moves at its speed, and does not jump at midnight', () => {
        const a = shipsAt(NOON);
        const b = shipsAt(later(NOON, 1));
        const same = a.map((s) => [s, b.find((t) => t.k === s.k)]).filter(([, t]) => t);
        expect(same.length).toBeGreaterThan(0);
        for (const [s, t] of same) expect(Math.abs(t.x - s.x)).toBeCloseTo(LIFE.ship.speed * 60, 6);
        const before = shipsAt(new Date(2026, 8, 24, 23, 59, 59, 900));
        const after = shipsAt(new Date(2026, 8, 25, 0, 0, 0, 100));
        for (const s of before) {
            const t = after.find((u) => u.k === s.k);
            if (t) expect(Math.abs(t.x - s.x)).toBeLessThan(5);
        }
    });
});

describe('the sailboats', () => {
    test('out by day only, and always on the water', () => {
        const courses = sailboatCourses();
        expect(courses).toHaveLength(LIFE.sailboat.count);
        expect(sailboatCourses()).toEqual(courses);
        for (let m = 0; m < 24 * 60; m += 7) {
            const date = later(new Date(2026, 8, 24), m);
            for (const b of sailboatsAt(date, courses)) {
                expect(isWater(b.x, b.z)).toBe(true);
                expect(b.out).toBe(m >= LIFE.sailboat.from * 60 && m <= LIFE.sailboat.to * 60);
                expect(b.heel).toBeGreaterThan(0);
            }
        }
        expect(sailboatsAt(NOON)).toHaveLength(LIFE.sailboat.count);
    });
});

describe('the seaplane', () => {
    test('a takeoff: a run on the water from rest, lifting off at its end, then a climb away west', () => {
        const { run, climb, top, rise } = LIFE.seaplane;
        const start = takeoff(0);
        expect([start.x, start.z]).toEqual(SEAPLANE_START);
        expect(start.speed).toBe(0);
        expect(isWater(start.x, start.z)).toBe(true);
        const liftoff = takeoff(run);
        expect(liftoff.y).toBe(WATER_Y);
        expect(isWater(liftoff.x, liftoff.z)).toBe(true);
        const up = takeoff(run + 10);
        expect(up.y).toBeCloseTo(WATER_Y + rise * 10, 9);
        expect(up.z).toBeLessThan(liftoff.z);
        expect(up.pitch).toBeCloseTo(Math.atan2(rise, top), 9);
        expect(takeoff(run + climb + 1)).toBeNull();
        expect(takeoff(-1)).toBeNull();
    });

    test('it takes off and lands once each hour of its day, moored between, and in by night', () => {
        const { takeoff: up, landing, run, climb } = LIFE.seaplane;
        const at = (h, m, s = 0) => seaplaneAt(new Date(2026, 8, 24, h, m, s));
        const moored = { x: SEAPLANE_START[0], z: SEAPLANE_START[1], speed: 0, y: WATER_Y };
        expect(at(12, up, 1)).toMatchObject({ yaw: 0 });
        expect(at(12, up - 1)).toMatchObject(moored);
        // Away between the climb and the return.
        expect(at(12, 40)).toBeNull();
        // Landing: coming in from the west, eastbound, nose a little up...
        const coming = at(12, landing, 30);
        expect(coming.yaw).toBeCloseTo(Math.PI, 9);
        expect(coming.y).toBeGreaterThan(WATER_Y);
        expect(coming.pitch).toBeGreaterThan(0);
        // ...slowing on the water to a stop where the takeoff began, and moored after.
        const end = seaplaneAt(new Date(new Date(2026, 8, 24, 12, landing).getTime() + (run + climb) * 1000 - 10));
        expect(end.x).toBe(SEAPLANE_START[0]);
        expect(end.z).toBeCloseTo(SEAPLANE_START[1], 3);
        expect(end.pitch).toBe(0);
        expect(at(12, landing + 5)).toMatchObject(moored);
        // By night it stays in.
        expect(at(22, up, 30)).toMatchObject(moored);
        expect(at(6, up, 30)).toMatchObject(moored);
        // It never jumps on the water: each change of state happens where it is.
        let last = at(12, 0);
        for (let s = 1; s < 3600; s++) {
            const now = seaplaneAt(new Date(2026, 8, 24, 12, 0, s));
            if (now && last && now.y === WATER_Y && last.y === WATER_Y) expect(gap(now, last)).toBeLessThan(50);
            last = now;
        }
    });
});

describe('the cars', () => {
    const lanes = carLanes();
    const cars = carFleet(lanes);

    test('every lane is on the land under the window, at the street’s height, and they keep right', () => {
        expect(lanes.length).toBeGreaterThan(8);
        for (const { a, b } of lanes) {
            for (const p of [a, b]) {
                expect(isLand(p[0], p[2])).toBe(true);
                expect(p[1]).toBeCloseTo(groundY(p[0], p[2]) + 1.2, 6);
                expect(p[2]).toBeLessThanOrEqual(LIFE.cars.near.z1);
            }
            // Keeping right: going west (-z) on the north (+x) side of the
            // street, going north (+x) on the east (+z) side.
            const dx = b[0] - a[0];
            const dz = b[2] - a[2];
            const street = CITY.street / 2;
            if (Math.abs(dz) > Math.abs(dx)) {
                const centre = Math.round((a[0] + 84) / 98) * 98 - 84;
                expect(Math.sign(a[0] - centre)).toBe(dz < 0 ? 1 : -1);
                expect(Math.abs(a[0] - centre)).toBeLessThan(street);
            } else {
                const centre = Math.round((a[2] + 13.5) / 98) * 98 - 13.5;
                expect(Math.sign(a[2] - centre)).toBe(dx > 0 ? 1 : -1);
            }
        }
    });

    test('the cars spread over the lanes, taillights going away down the hill, headlights coming up it', () => {
        expect(cars).toHaveLength(LIFE.cars.count);
        expect(carFleet(lanes)).toEqual(cars);
        const used = new Set(cars.map((c) => c.lane));
        expect(used.size).toBeGreaterThan(lanes.length / 2);
        for (const c of cars) {
            const { a, b } = lanes[c.lane];
            if (Math.abs(b[2] - a[2]) > Math.abs(b[0] - a[0])) expect(c.red).toBe(b[2] < a[2]);
            expect(c.speed).toBeGreaterThanOrEqual(LIFE.cars.speed[0]);
            expect(c.speed).toBeLessThanOrEqual(LIFE.cars.speed[1]);
        }
        expect(cars.some((c) => c.red) && cars.some((c) => !c.red)).toBe(true);
    });

    test('a car moves along its lane at its speed, and comes round again', () => {
        const at0 = carPositions(cars, lanes, 0);
        const at1 = carPositions(cars, lanes, 1);
        expect(at0).toHaveLength(cars.length * 3);
        cars.forEach((c, i) => {
            const moved = Math.hypot(at1[i * 3] - at0[i * 3], at1[i * 3 + 2] - at0[i * 3 + 2]);
            // Either a second's drive, or it came round to the lane's start.
            if (moved < c.speed * 2) expect(moved).toBeCloseTo(c.speed, 1);
        });
        const round = carPositions(cars, lanes, cars[0].length / cars[0].speed);
        expect(round[0]).toBeCloseTo(at0[0], 3);
        expect(round[2]).toBeCloseTo(at0[2], 3);
        const out = new Float32Array(cars.length * 3);
        expect(carPositions(cars, lanes, 2, out)).toBe(out);
    });
});

describe('the wind', () => {
    test('the clouds drift with the wind on the sky’s clock, the ripples on real seconds', () => {
        const tile = 14000;
        const a = drift(NOON, 0, tile);
        const b = drift(later(NOON, 1), 0, tile);
        const moved = (((b.clouds[0] - a.clouds[0]) % 1) + 1) % 1;
        expect(moved * tile).toBeCloseTo(LIFE.wind * 60, 3);
        expect(a.ripple).toEqual([0, 0]);
        const r = drift(NOON, 100, tile).ripple;
        expect(r[0]).toBeCloseTo(100 * LIFE.ripple[0], 9);
        expect(r[1]).toBeCloseTo(100 * LIFE.ripple[1], 9);
        for (const v of [...a.clouds, ...r]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});
