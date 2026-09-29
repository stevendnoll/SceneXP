// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's moving scenery (life.js), pure: the ferries' and ships'
 * timetables, the sailboats' loops, the seaplane's runs, the traffic on its
 * green wave, the jet's landings, and the wind. Each must keep to the
 * water (or the street, or the sky), keep its schedule, and never jump, and
 * no vehicle may drive through another. What the window SEES of them is
 * measured through the camera in office-view.
 */
import {
    LIFE, minutesOn, minutesOfDay, gently, yawFor, ferryRoute, ferriesAt, ferryTrips, shipsAt, sailboatCourses, sailboatsAt,
    shipShift, SEAPLANE_START, takeoff, seaplaneAt, carLanes, carFleet, carPositions, carYaws, carLightPositions, CAR, drift,
    TRAFFIC, VEHICLES, SUV, PARKED_Y, pitchOf, cycleOf, slotTimes, distanceAlong, onStreet, RUSH, trafficAt, trafficStep, lapOf, parkAbsent,
    JET, jetCrossing, jetFlight, jetOnTrack, jetsAt, jetFlashing, jetTimes, glideHeight, approachSpeed, approachLeft,
    LIVERIES, liveryOf
} from '../www/office/js/life.js';
import { CITY, WATER_Y, piers, isWater, isLand, groundY, shoreZ, AIRPORT, airportFrame, airportLocal, airportGates } from '../www/office/js/city.js';

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

    test('none runs from midnight until four: each waits at the dock it sets out from in the morning (QA, 2026-09-29)', () => {
        // An even number of crossings a day, so each ends where it began.
        expect(ferryTrips() % 2).toBe(0);
        const morning = ferriesAt(new Date(2026, 8, 25, 4, 0, 30), route);
        for (let m = 0; m < 240; m += 1) {
            const night = ferriesAt(new Date(2026, 8, 25, 0, m), route);
            night.forEach((f, i) => {
                expect(f.speed).toBe(0);
                expect(Math.abs(f.z - morning[i].z)).toBeLessThan(5);
            });
        }
        // One from each side: the first from the city's dock, the second
        // from the island's.
        expect(Math.abs(morning[0].z - route.from)).toBeLessThan(5);
        expect(Math.abs(morning[1].z - route.to)).toBeLessThan(5);
        // The last crossing lands before midnight.
        for (let m = 23 * 60 + 45; m < 24 * 60; m += 1) {
            ferriesAt(new Date(2026, 8, 25, 0, m), route).forEach((f) => expect(f.speed).toBe(0));
        }
        // And from morning to night, never a jump.
        let prev = ferriesAt(new Date(2026, 8, 25, 0, 0), route);
        for (let m = 0.25; m < 24 * 60; m += 0.25) {
            const now = ferriesAt(new Date(2026, 8, 25, 0, 0, m * 60), route);
            now.forEach((f, i) => expect(gap(f, prev[i])).toBeLessThan(200));
            prev = now;
        }
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

    test('whenever the visitor arrives, a ship stands at its lane’s arrival point, the timetable moved as little as it can be (QA, 2026-09-25)', () => {
        const { arrival, every } = LIFE.ship;
        const shifts = [];
        // Every seven minutes for two days, so every place in the cycle.
        for (let m = 0; m < 2 * 24 * 60; m += 7) {
            const date = later(NOON, m);
            const shift = shipShift(date);
            shifts.push(shift);
            const ships = shipsAt(date, shift);
            const arriving = ships.find((s) => {
                const north = s.z === LIFE.ship.lanes.north;
                return Math.abs(s.x - (north ? arrival.north : arrival.south)) < 1e-6;
            });
            expect(arriving).toBeTruthy();
            // Half the gap between two ships, and the lanes' two arrival
            // points a few minutes apart, is the most it moves.
            expect(Math.abs(shift)).toBeLessThanOrEqual(every / 2 + 4);
            // And from then on it keeps its timetable: a minute on, the
            // same ship is a minute's sailing further along.
            const next = shipsAt(later(date, 1), shift).find((s) => s.k === arriving.k);
            expect(Math.abs(next.x - arriving.x)).toBeCloseTo(LIFE.ship.speed * 60, 6);
        }
        // Both lanes take their turn.
        expect(shifts.some((s) => s > 0) && shifts.some((s) => s < 0)).toBe(true);
        expect(shipsAt(NOON, 0)).toEqual(shipsAt(NOON));
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

describe('the traffic through the day (QA, 2026-09-29: "stays at a constant flow 24 hours a day")', () => {
    const lanes = carLanes();
    const cars = carFleet(lanes);
    const at = (h, m = 0) => new Date(2026, 8, 25, h, m);

    test('full in the rushes, lighter at midday, thinning through the evening, a car or two in the small hours', () => {
        expect(trafficAt(at(3))).toBeLessThan(0.12);
        expect(trafficAt(at(8))).toBeGreaterThan(0.9);
        expect(trafficAt(at(17))).toBe(1);
        expect(trafficAt(at(12))).toBeGreaterThan(0.6);
        expect(trafficAt(at(12))).toBeLessThan(trafficAt(at(8)));
        expect(trafficAt(at(22))).toBeLessThan(trafficAt(at(19)));
        // The same at both ends of the day, and never a jump in between.
        expect(RUSH[0][1]).toBe(RUSH[RUSH.length - 1][1]);
        let last = trafficAt(at(0));
        for (let m = 1; m < 24 * 60; m++) {
            const now = trafficAt(at(0, m));
            expect(now).toBeGreaterThanOrEqual(0);
            expect(now).toBeLessThanOrEqual(1);
            expect(Math.abs(now - last)).toBeLessThan(0.01);
            last = now;
        }
    });

    test('as many out as the hour asks: all of them in a rush, about one in twelve at three in the morning', () => {
        const all = trafficStep(cars, lanes, 1000, 1);
        expect(all.out.every((v) => v === 1)).toBe(true);
        // Over a few laps, so the share is the draw's and not one lap's.
        let out = 0;
        let seen = 0;
        let s = null;
        for (let t = 0; t < 600; t += 1) {
            s = trafficStep(cars, lanes, t, trafficAt(at(3)), s);
            out += s.out.reduce((n, v) => n + v, 0);
            seen += cars.length;
        }
        expect(out / seen).toBeGreaterThan(0.04);
        expect(out / seen).toBeLessThan(0.14);
    });

    test('none appears or vanishes on the street: each decides only as it comes round to its street’s start', () => {
        let s = trafficStep(cars, lanes, 0, 1);
        const dt = 0.2;
        let changes = 0;
        for (let t = dt; t < 400; t += dt) {
            // From the rush to three in the morning, and back, all at once.
            const busy = Math.floor(t / 100) % 2 ? trafficAt(at(3)) : 1;
            const before = s.out.slice();
            s = trafficStep(cars, lanes, t, busy, s);
            cars.forEach((car, i) => {
                if (s.out[i] === before[i]) return;
                changes++;
                // Just round to the start: a frame's driving along, at most.
                const lane = lanes[car.lane];
                expect(distanceAlong(car, lane, t)).toBeLessThanOrEqual(TRAFFIC.speed * dt + 1e-6);
                expect(lapOf(car, lane, t)).toBe(lapOf(car, lane, t - dt) + 1);
            });
        }
        expect(changes).toBeGreaterThan(cars.length / 2);
    });

    test('one not out is parked, lights and all', () => {
        const positions = carPositions(cars, lanes, 50);
        const lights = carLightPositions(cars, lanes, 50);
        const out = new Uint8Array(cars.length);
        out[0] = 1;
        parkAbsent(positions, out);
        parkAbsent(lights, out);
        for (let i = 1; i < cars.length; i++) {
            expect(onStreet(positions[i * 3 + 1])).toBe(false);
            expect(onStreet(lights[i * 3 + 1])).toBe(false);
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

    test('platoons fill the lanes, some led by a bus, taillights going away down the hill, headlights coming up it', () => {
        expect(carFleet(lanes)).toEqual(cars);
        expect(cars.length).toBeGreaterThan(120);
        const used = new Set(cars.map((c) => c.lane));
        expect(used.size).toBe(lanes.length);
        const buses = cars.filter((c) => c.kind === 'bus');
        expect(buses.length).toBeGreaterThan(5);
        expect(cars.filter((c) => c.kind === 'car' && c.scale === SUV).length).toBeGreaterThan(10);
        const slots = slotTimes();
        for (const c of cars) {
            const { a, b } = lanes[c.lane];
            if (Math.abs(b[2] - a[2]) > Math.abs(b[0] - a[0])) expect(c.red).toBe(b[2] < a[2]);
            expect(slots).toContain(c.slot);
            // A bus is always the middle of its platoon.
            if (c.kind === 'bus') expect(c.slot).toBe(0.25);
        }
        expect(cars.some((c) => c.red) && cars.some((c) => !c.red)).toBe(true);
    });

    test('a vehicle keeps to the street as it follows the hill down, tilted with it, or is parked out of sight', () => {
        const pitches = new Float32Array(cars.length);
        let parked = 0;
        for (const t of [0, 3, 11, 29]) {
            const at = carPositions(cars, lanes, t, undefined, pitches);
            for (let i = 0; i < cars.length; i++) {
                if (!onStreet(at[i * 3 + 1])) {
                    expect(at[i * 3 + 1]).toBe(PARKED_Y);
                    parked++;
                    continue;
                }
                expect(at[i * 3 + 1]).toBeCloseTo(groundY(at[i * 3], at[i * 3 + 2]) + 1.2, 3);
                // Nose up driving up the hill (east, +z), down driving down it.
                const { a, b } = lanes[cars[i].lane];
                if (Math.abs(b[2] - a[2]) > 1 && pitches[i] !== 0) expect(Math.sign(pitches[i])).toBe(Math.sign(b[2] - a[2]));
                expect(Math.abs(pitches[i])).toBeLessThan(0.2);
            }
        }
        // Most of the loop is the street.
        expect(parked / (4 * cars.length)).toBeLessThan(0.3);
    });

    test('every vehicle drives at the one speed along its lane, and comes round again after its loop', () => {
        const at0 = carPositions(cars, lanes, 0);
        const at1 = carPositions(cars, lanes, 1);
        expect(at0).toHaveLength(cars.length * 3);
        cars.forEach((c, i) => {
            if (!onStreet(at0[i * 3 + 1]) || !onStreet(at1[i * 3 + 1])) return;
            const moved = Math.hypot(at1[i * 3] - at0[i * 3], at1[i * 3 + 2] - at0[i * 3 + 2]);
            expect(moved).toBeCloseTo(TRAFFIC.speed, 3);
        });
        // A loop is a whole number of light cycles, so the whole traffic
        // comes round in one cycle.
        const { seconds } = cycleOf();
        for (const lane of lanes) expect((lane.loop / cycleOf().meters) % 1).toBe(0);
        const round = carPositions(cars, lanes, seconds);
        for (let i = 0; i < cars.length; i += 17) {
            const d0 = distanceAlong(cars[i], lanes[cars[i].lane], 0);
            const d1 = distanceAlong(cars[i], lanes[cars[i].lane], lanes[cars[i].lane].loop / TRAFFIC.speed);
            expect(d1).toBeCloseTo(d0, 6);
        }
        expect(round).not.toEqual(at0);
        const out = new Float32Array(cars.length * 3);
        expect(carPositions(cars, lanes, 2, out)).toBe(out);
    });

    test('every platoon crosses in its own street’s half of the light’s cycle, clear of the other’s', () => {
        // A lane along z crosses the streets along x at their middles, and
        // the other way round. Each vehicle is inside a crossing (the whole
        // width of the street it crosses, plus half its own length) only in
        // its street's half of the cycle, with time to spare either side.
        const pitch = pitchOf();
        const { seconds: period } = cycleOf();
        const xStreets = CITY.ownTower.x0 - CITY.street / 2;
        const zStreets = CITY.ownTower.z0 - CITY.street / 2;
        const inside = (q, c0, reach) => Math.abs(((((q - c0) % pitch) + pitch * 1.5) % pitch) - pitch / 2) < reach;
        let seen = 0;
        for (let t = 0; t < period * 3; t += 0.1) {
            const at = carPositions(cars, lanes, t);
            cars.forEach((car, i) => {
                if (!onStreet(at[i * 3 + 1])) return;
                const lane = lanes[car.lane];
                const reach = CITY.street / 2 + (VEHICLES[car.kind].length * car.scale[2]) / 2;
                const q = lane.alongZ ? at[i * 3 + 2] : at[i * 3];
                if (!inside(q, lane.alongZ ? zStreets : xStreets, reach)) return;
                seen++;
                // Which half of the cycle this crossing gives this street:
                // the checkerboard of crossings, and the second half for
                // lanes along x.
                const ix = Math.round(((lane.alongZ ? at[i * 3] : q) - xStreets) / pitch);
                const iz = Math.round(((lane.alongZ ? q : at[i * 3 + 2]) - zStreets) / pitch);
                const phase = ((t / period - (ix + iz) / 2 - (lane.alongZ ? 0 : 0.5)) % 1 + 1) % 1;
                expect(phase).toBeGreaterThan(0.05);
                expect(phase).toBeLessThan(0.45);
            });
        }
        expect(seen).toBeGreaterThan(1000);
    });
});

/** Whether two vehicles' bodies (plus `clearance` meters end to end)
 *  overlap, seen from above: oriented rectangles, separating axes. */
function bodiesMeet(p, q, clearance) {
    const corners = ({ x, z, ux, uz, length, width }) => {
        const hl = length / 2 + clearance / 2;
        const hw = width / 2;
        return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([l, w]) => [x + ux * hl * l - uz * hw * w, z + uz * hl * l + ux * hw * w]);
    };
    const A = corners(p);
    const B = corners(q);
    for (const poly of [A, B]) {
        for (let i = 0; i < 4; i++) {
            const [x1, z1] = poly[i];
            const [x2, z2] = poly[(i + 1) % 4];
            const nx = z2 - z1;
            const nz = x1 - x2;
            const pa = A.map(([x, z]) => x * nx + z * nz);
            const pb = B.map(([x, z]) => x * nx + z * nz);
            if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
        }
    }
    return true;
}

describe('the traffic never drives through itself (QA, 2026-09-25)', () => {
    const lanes = carLanes();
    const cars = carFleet(lanes);
    const bodiesAt = (fleet, t) => {
        const at = carPositions(fleet, lanes, t);
        return fleet.map((car, i) => {
            if (!onStreet(at[i * 3 + 1])) return null;
            const { a, b, length } = lanes[car.lane];
            const size = VEHICLES[car.kind];
            return {
                x: at[i * 3], z: at[i * 3 + 2], ux: (b[0] - a[0]) / length, uz: (b[2] - a[2]) / length,
                length: size.length * car.scale[2], width: size.width * car.scale[0]
            };
        }).filter(Boolean);
    };
    const meetings = (fleet, from, to, clearance) => {
        let n = 0;
        for (let t = from; t < to; t += 0.1) {
            const bodies = bodiesAt(fleet, t);
            for (let p = 0; p < bodies.length; p++) {
                for (let q = p + 1; q < bodies.length; q++) {
                    if (Math.abs(bodies[p].x - bodies[q].x) > 20 || Math.abs(bodies[p].z - bodies[q].z) > 20) continue;
                    if (bodiesMeet(bodies[p], bodies[q], clearance)) n++;
                }
            }
        }
        return n;
    };

    test('no two bodies ever meet, nose to tail or at a crossing, with a meter to spare', () => {
        // Three light cycles is every arrangement the traffic has, and a
        // stretch much later checks nothing drifts.
        const { seconds } = cycleOf();
        expect(meetings(cars, 0, seconds * 3, 1)).toBe(0);
        expect(meetings(cars, 5000, 5000 + seconds, 1)).toBe(0);
    });

    test('the check would catch a fleet off the green wave', () => {
        // The same vehicles, but every lane's platoons out of step.
        const offBeat = cars.map((c) => ({ ...c, slot: (c.slot + 0.37 * (c.lane % 3)) % 1 }));
        expect(meetings(offBeat, 0, cycleOf().seconds, 1)).toBeGreaterThan(0);
    });
});

describe('the cars by day and night', () => {
    const lanes = carLanes();
    const cars = carFleet(lanes);

    test('each vehicle faces along its lane', () => {
        const yaws = carYaws(cars, lanes);
        cars.forEach((car, i) => {
            const { a, b } = lanes[car.lane];
            const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
            expect(-Math.sin(yaws[i])).toBeCloseTo((b[0] - a[0]) / len, 9);
            expect(-Math.cos(yaws[i])).toBeCloseTo((b[2] - a[2]) / len, 9);
        });
    });

    test('its lights ride at the end the window sees: the tail going away, the nose coming, clear of the body', () => {
        const middles = carPositions(cars, lanes, 7);
        const lights = carLightPositions(cars, lanes, 7);
        let lit = 0;
        cars.forEach((car, i) => {
            if (!onStreet(middles[i * 3 + 1])) {
                expect(lights[i * 3 + 1]).toBe(PARKED_Y);
                return;
            }
            lit++;
            const { a, b } = lanes[car.lane];
            const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const size = VEHICLES[car.kind];
            const along = ((lights[i * 3] - middles[i * 3]) * (b[0] - a[0]) + (lights[i * 3 + 2] - middles[i * 3 + 2]) * (b[2] - a[2])) / len;
            expect(Math.abs(along)).toBeGreaterThan((size.length * car.scale[2]) / 2);
            expect(Math.sign(along)).toBe(car.red ? -1 : 1);
            // Down from the lanes' height (1.2 m) to the lights' own.
            expect(lights[i * 3 + 1] - middles[i * 3 + 1]).toBeCloseTo(size.lights - 1.2, 4);
        });
        expect(lit).toBeGreaterThan(100);
        expect(CAR).toBe(VEHICLES.car);
    });
});

describe('the jet', () => {
    const times = jetTimes();
    const flight = (step = 0.5) => {
        const out = [];
        for (let t = 0; t <= times.total; t += step) out.push({ t, ...jetOnTrack(t) });
        return out;
    };
    const ground = WATER_Y + AIRPORT.elevation + JET.wheels * JET.scale;

    test('every jet flies right to left, never left to right (QA, 2026-09-28): south, and on to its gate', () => {
        // The windows look west (-z) with north (+x) on the visitor's right,
        // so right to left is south. In the air and on the rollout x only
        // ever falls; nothing is left of which way a flight goes.
        const path = flight().filter((p) => p.fast);
        expect(path.length).toBeGreaterThan(100);
        for (let i = 1; i < path.length; i++) expect(path[i].x).toBeLessThan(path[i - 1].x);
        expect(Object.keys(jetFlight(3))).toEqual(['start']);
        // Facing the way it flies: its bow (-z as built) along the runway.
        const { along } = airportFrame();
        const p = jetOnTrack(10);
        expect(-Math.sin(p.yaw)).toBeCloseTo(along[0], 9);
        expect(-Math.cos(p.yaw)).toBeCloseTo(along[1], 9);
    });

    test('it comes in on the runway’s line, over the water, down a steady glide slope, and flares to touch down', () => {
        const approach = flight().filter((p) => p.phase === 'approach');
        for (const p of approach) {
            const { a, b } = airportLocal(p.x, p.z);
            expect(Math.abs(b)).toBeLessThan(1e-6);
            expect(a).toBeLessThanOrEqual(1e-6);
        }
        // It sets out over downtown behind the office's right shoulder
        // (QA, 2026-09-29: closer, so bigger), north (+x) of it and no
        // farther west than its own waterfront, and crosses the bay.
        const first = approach[0];
        expect(first.x).toBeGreaterThan(0);
        expect(first.z).toBeGreaterThan(shoreZ(first.x));
        expect(Math.hypot(first.x, first.z)).toBeLessThan(5000);
        expect(approach.some((p) => isWater(p.x, p.z))).toBe(true);
        // Only ever down, the glide slope's own angle until the flare.
        for (let i = 1; i < approach.length; i++) expect(approach[i].y).toBeLessThanOrEqual(approach[i - 1].y + 1e-9);
        const slope = Math.tan((JET.glide * Math.PI) / 180);
        expect(glideHeight(3000) - glideHeight(2000)).toBeCloseTo(1000 * slope, 6);
        expect(glideHeight(0)).toBe(0);
        // The flare rounds off: never steeper than the slope, and shallow
        // just before the wheels meet the runway.
        for (let left = 1; left <= 1000; left += 1) {
            expect(glideHeight(left) - glideHeight(left - 1)).toBeLessThanOrEqual(slope + 1e-9);
        }
        expect(glideHeight(20) / 20).toBeLessThan(slope / 5);
        // Nose a touch down on the slope, up in the flare.
        expect(jetOnTrack(10).pitch).toBeLessThan(0);
        expect(jetOnTrack(times.approach - 0.1).pitch).toBeGreaterThan(0.04);
        // Down on the runway: on its wheels at the touchdown point, on land.
        const down = jetOnTrack(times.approach);
        expect(down.phase).toBe('rollout');
        expect(down.y).toBeCloseTo(ground, 6);
        expect(isLand(down.x, down.z)).toBe(true);
        expect(airportLocal(down.x, down.z).a).toBeCloseTo(0, 6);
    });

    test('it rolls out on the runway slowing to a taxi, then taxis on the airport into the hangar, and is gone', () => {
        const roll = flight(0.25).filter((p) => p.phase === 'rollout');
        let last = Infinity;
        for (let i = 1; i < roll.length; i++) {
            const speed = Math.hypot(roll[i].x - roll[i - 1].x, roll[i].z - roll[i - 1].z) / 0.25;
            expect(speed).toBeLessThan(last + 1e-6);
            last = speed;
            const { a, b } = airportLocal(roll[i].x, roll[i].z);
            expect(Math.abs(b)).toBeLessThan(1e-6);
            expect(a).toBeLessThanOrEqual(AIRPORT.runway.to);
            expect(roll[i].y).toBeCloseTo(ground, 6);
        }
        expect(last).toBeLessThan(JET.taxiSpeed * 1.2);
        const taxi = flight().filter((p) => p.phase === 'taxi');
        expect(taxi.length).toBeGreaterThan(20);
        for (const p of taxi) {
            const { a, b } = airportLocal(p.x, p.z);
            expect(a).toBeGreaterThan(0);
            expect(a).toBeLessThanOrEqual(AIRPORT.hangar.a + 1e-6);
            expect(b).toBeGreaterThanOrEqual(-1e-6);
            expect(b).toBeLessThanOrEqual(AIRPORT.hangar.b + 1e-6);
            expect(p.fast).toBe(false);
            // Clear of the jets at the gates, whose tails reach 70 m either
            // side of the gate line: it passes them on the taxiway.
            if (b > AIRPORT.taxiway.b + 1) expect(a).toBeGreaterThan(Math.max(...AIRPORT.gates.a) + 150);
        }
        // Its last place is well inside the hangar, which hides it (a whole
        // jet, its length along b and its span along a), and then it is gone.
        const { hangar } = AIRPORT;
        const end = jetOnTrack(times.total);
        const { a, b } = airportLocal(end.x, end.z);
        const length = 40 * JET.scale;
        const span = 36 * JET.scale;
        expect(Math.abs(a - hangar.a) + span / 2).toBeLessThan(hangar.len / 2);
        expect(Math.abs(b - hangar.b) + length / 2).toBeLessThan(hangar.wid / 2);
        expect(jetOnTrack(times.total + 0.01)).toBeNull();
        expect(jetOnTrack(-0.01)).toBeNull();
    });

    test('never a jump: from the first second out to its gate it moves no faster than it flies, and only dashes in the dash', () => {
        const path = flight(0.5);
        // Its speed is over the ground, so down the slope a touch more.
        const climb = 1 / Math.cos((JET.glide * Math.PI) / 180);
        for (let i = 1; i < path.length; i++) {
            const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z);
            expect(d).toBeLessThanOrEqual(JET.dash.speed * 0.5 * climb + 1e-6);
            // Outside the dash and its ramps, its own speed (both ends of
            // the step outside, or it may have run into a ramp).
            const outside = (p) => {
                const left = -airportLocal(p.x, p.z).a;
                return left > JET.dash.from + JET.dash.ramp || left < JET.dash.to - JET.dash.ramp;
            };
            if (path[i].phase === 'approach' && outside(path[i - 1]) && outside(path[i])) {
                expect(d).toBeLessThanOrEqual(JET.speed * 0.5 * climb + 1e-6);
            }
        }
        // The speed through the dash: its own outside, the dash's in the
        // middle, never less than its own nor more than the dash's.
        expect(approachSpeed(JET.from)).toBe(JET.speed);
        expect(approachSpeed(0)).toBe(JET.speed);
        expect(approachSpeed((JET.dash.from + JET.dash.to) / 2)).toBe(JET.dash.speed);
        for (let left = 0; left <= JET.from; left += 25) {
            expect(approachSpeed(left)).toBeGreaterThanOrEqual(JET.speed);
            expect(approachSpeed(left)).toBeLessThanOrEqual(JET.dash.speed);
        }
        // The table and its inverse agree, and time only ever runs on.
        expect(approachLeft(0)).toBe(JET.from);
        expect(approachLeft(times.approach)).toBe(0);
        let last = Infinity;
        for (let t = 0; t <= times.approach; t += 0.25) {
            const left = approachLeft(t);
            expect(left).toBeLessThan(last);
            last = left;
        }
    });

    test('one every 90 seconds or so (QA, 2026-09-29), up to three out at once, each on a jet of its own', () => {
        expect(jetFlight(0)).toEqual({ start: JET.first });
        expect(JET.every).toBe(90);
        // The first comes in as the office opens.
        expect(jetsAt(0)[0].phase).toBe('approach');
        let landings = 0;
        const flying = new Array(JET.fleet + 1).fill(false);
        for (let s = 0; s < 3600; s += 1) {
            const jets = jetsAt(s);
            expect(jets).toHaveLength(JET.fleet + 1);
            expect(jets.filter(Boolean).length).toBeLessThanOrEqual(JET.fleet);
            jets.forEach((at, i) => {
                const now = Boolean(at && at.phase === 'approach');
                if (now && !flying[i]) landings++;
                flying[i] = now;
            });
            // The called jet's place is kept for it.
            expect(jets[JET.fleet]).toBeNull();
        }
        // An hour holds about forty: a day going by (15 minutes of the
        // scenery's clock) about ten.
        expect(landings).toBeGreaterThanOrEqual(38);
        expect(landings).toBeLessThanOrEqual(42);
        for (let k = -5; k < 60; k++) {
            const { start } = jetFlight(k);
            expect(start).toBeGreaterThanOrEqual(JET.first + k * JET.every);
            expect(start).toBeLessThan(JET.first + k * JET.every + JET.late);
            // A jet is in the hangar before the flight after next wants it.
            expect(start + times.total).toBeLessThan(jetFlight(k + JET.fleet).start);
            // And a flight never catches the one ahead: the same approach,
            // on the same clock, a minute or more behind it.
            expect(jetFlight(k + 1).start - start).toBeGreaterThan(JET.every - JET.late);
        }
        expect(jetCrossing()).toBe(times.approach);
    });

    test('one asked for by hand comes in from when it was asked, on its own jet, whatever the timetable', () => {
        const called = 1000;
        expect(jetsAt(called - 1, called)[JET.fleet]).toBeNull();
        expect(jetsAt(called + 20, called)[JET.fleet]).toEqual({ ...jetOnTrack(20), livery: liveryOf(called) });
        expect(jetsAt(called + times.total + 1, called)[JET.fleet]).toBeNull();
        // And the timetable carries on beside it.
        expect(jetsAt(called + 20, called).slice(0, JET.fleet)).toEqual(jetsAt(called + 20).slice(0, JET.fleet));
    });

    test('the jets fly for different airlines, invented ones, and no two flights in a row alike (QA, 2026-09-29)', () => {
        expect(LIVERIES.length).toBeGreaterThanOrEqual(6);
        // Each its own: the tail and the fuselage, which read from afar,
        // never the same pair twice.
        const looks = new Set(LIVERIES.map((l) => `${l.tail}/${l.body}`));
        expect(looks.size).toBe(LIVERIES.length);
        expect(new Set(LIVERIES.map((l) => l.name)).size).toBe(LIVERIES.length);
        for (const l of LIVERIES) {
            for (const key of ['body', 'belly', 'stripe', 'tail', 'engine']) {
                expect(Number.isInteger(l[key])).toBe(true);
                expect(l[key]).toBeGreaterThanOrEqual(0);
                expect(l[key]).toBeLessThanOrEqual(0xffffff);
            }
            // No all-yellow fuselage (a real carrier's mark).
            const [r, g, b] = [(l.body >> 16) & 255, (l.body >> 8) & 255, l.body & 255];
            expect(r > 180 && g > 150 && b < 90).toBe(false);
        }
        // Flight after flight: all of them before any comes again, none twice
        // in a row, the same every visit.
        const seen = Array.from({ length: 40 }, (_, k) => liveryOf(k - 20));
        for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
        expect(new Set(seen.slice(0, LIVERIES.length)).size).toBe(LIVERIES.length);
        expect(liveryOf(3)).toBe(liveryOf(3 + LIVERIES.length));
        // Each jet out carries its flight's livery.
        const s = 1000;
        const last = Math.floor((s - JET.first) / JET.every);
        const jets = jetsAt(s);
        for (let k = last - JET.fleet; k <= last; k++) {
            const at = jets[((k % JET.fleet) + JET.fleet) % JET.fleet];
            if (at && jetOnTrack(s - jetFlight(k).start)) expect(at.livery).toBe(liveryOf(k));
        }
        expect(Number.isInteger(jetsAt(s + 20, s)[JET.fleet].livery)).toBe(true);
    });

    test('its strobes flash briefly, over and over', () => {
        let lit = 0;
        let samples = 0;
        for (let s = 0; s < JET.blink * 10; s += 0.01, samples++) if (jetFlashing(s)) lit++;
        expect(lit / samples).toBeCloseTo(JET.flash / JET.blink, 1);
        expect(jetFlashing(0)).toBe(true);
        expect(jetFlashing(JET.blink / 2)).toBe(false);
        expect(jetFlashing(-JET.blink + 0.01)).toBe(true);
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

describe('in the rain', () => {
    test('the sailboats stay in and the seaplane stays moored', () => {
        expect(sailboatsAt(NOON, sailboatCourses(), 0.2).every((b) => b.out)).toBe(true);
        expect(sailboatsAt(NOON, sailboatCourses(), 0.5).every((b) => !b.out)).toBe(true);
        const flying = new Date(2026, 8, 24, 12, LIFE.seaplane.takeoff, 30);
        expect(seaplaneAt(flying, 0).speed).toBeGreaterThan(0);
        expect(seaplaneAt(flying, 0.8)).toMatchObject({ x: SEAPLANE_START[0], z: SEAPLANE_START[1], speed: 0 });
    });
});
