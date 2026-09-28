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
    LIFE, minutesOn, minutesOfDay, gently, yawFor, ferryRoute, ferriesAt, shipsAt, sailboatCourses, sailboatsAt,
    shipShift, SEAPLANE_START, takeoff, seaplaneAt, carLanes, carFleet, carPositions, carYaws, carLightPositions, CAR, drift,
    TRAFFIC, VEHICLES, SUV, PARKED_Y, pitchOf, cycleOf, slotTimes, distanceAlong, onStreet,
    JET, jetCrossing, jetFlight, jetOnTrack, jetAt, jetFlashing, jetTimes, jetParked, glideHeight
} from '../www/office/js/life.js';
import { CITY, WATER_Y, piers, isWater, isLand, groundY, AIRPORT, airportFrame, airportLocal, airportGates } from '../www/office/js/city.js';

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
        for (let t = 0; t <= times.total + 5; t += step) out.push({ t, ...jetOnTrack(t) });
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
        // It sets out over the water, well out from the island.
        const first = approach[0];
        expect(isWater(first.x, first.z)).toBe(true);
        expect(Math.hypot(first.x, first.z)).toBeLessThan(12000);
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

    test('it rolls out on the runway slowing to a taxi, then taxis on the airport to its gate and waits there', () => {
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
            expect(a).toBeLessThan(AIRPORT.runway.to);
            expect(b).toBeGreaterThanOrEqual(-1e-6);
            expect(b).toBeLessThanOrEqual(AIRPORT.gates.b + 1e-6);
            expect(p.fast).toBe(false);
        }
        const parked = jetOnTrack(times.total + 1);
        const gate = airportGates()[AIRPORT.arrivalGate];
        expect(parked).toEqual(jetParked());
        expect(parked.phase).toBe('parked');
        expect(parked.x).toBeCloseTo(gate.x, 6);
        expect(parked.z).toBeCloseTo(gate.z, 6);
        expect(parked.yaw).toBeCloseTo(gate.yaw, 9);
        expect(gate.free).toBe(true);
    });

    test('never a jump: from the first second out to its gate it moves no faster than it flies', () => {
        const path = flight(0.5);
        for (let i = 1; i < path.length; i++) {
            const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z);
            // Its speed is over the ground, so down the slope a touch more.
            expect(d).toBeLessThanOrEqual((JET.speed * 0.5) / Math.cos((JET.glide * Math.PI) / 180) + 1e-6);
        }
    });

    test('the first comes in within a minute of the office opening, then one now and then; between them it waits at its gate', () => {
        expect(jetFlight(0)).toEqual({ start: JET.first });
        expect(jetAt(0).phase).toBe('approach');
        expect(jetAt(-100)).toEqual(jetParked());
        let flights = 0;
        let flying = false;
        for (let s = 0; s < 3600; s += 1) {
            const at = jetAt(s);
            expect(at).not.toBeNull();
            const now = at.phase === 'approach';
            if (now && !flying) flights++;
            flying = now;
        }
        // An hour holds about eight or nine.
        expect(flights).toBeGreaterThanOrEqual(8);
        expect(flights).toBeLessThanOrEqual(10);
        for (let k = 0; k < 30; k++) {
            const { start } = jetFlight(k);
            // Each is at its gate before the next one's stretch of the clock.
            expect(start + times.total).toBeLessThan(JET.first + (k + 1) * JET.every);
            expect(start).toBeGreaterThanOrEqual(JET.first + k * JET.every);
            expect(jetAt(start + times.total + 1)).toEqual(jetParked());
        }
        expect(jetCrossing()).toBe(times.approach);
    });

    test('one asked for by hand comes in from when it was asked, whatever the timetable', () => {
        // Asked for just after the first flight has come in, with the whole
        // flight over before the second is due.
        const called = jetFlight(0).start + times.total + 1;
        expect(called + times.total + 1).toBeLessThan(jetFlight(1).start);
        expect(jetAt(called + 20)).toEqual(jetParked());
        expect(jetAt(called + 20, called)).toEqual(jetOnTrack(20));
        expect(jetAt(called + times.total + 1, called)).toEqual(jetParked());
        // And the timetable carries on under it.
        expect(jetAt(jetFlight(1).start + 5, called)).toEqual(jetOnTrack(5));
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
