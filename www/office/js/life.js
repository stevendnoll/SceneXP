// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * life.js - What moves out there: the ferries, the ships, the sailboats, the
 * seaplane, the traffic, a jet now and then, and the wind in the clouds and
 * on the water.
 *
 * ON A TIMETABLE, NOT AT RANDOM. Everything on the water keeps a schedule
 * on the sky's clock (the visitor's own time, a pinned hour, or a day going
 * by), so a ferry is where the timetable says it is whenever the visitor
 * looks, and a day going by runs the whole harbor at speed, the way a
 * time-lapse does. The cars, the jet and the ripples keep real seconds
 * instead: at a day-going-by's pace a car would cross the city in a frame.
 *
 * WHERE THE WINDOW CAN SEE. The water shows only in slivers between the
 * towers (the brief), so every route is laid through the slivers the
 * census finds: the ferries straight down the office's own street from the
 * dock to the island, the ships across the bay six and a half kilometers
 * out, the sailboats and the seaplane in the near water, the cars in the
 * street canyon under the window.
 *
 * No real livery: the ferries are white with a navy hull, not any
 * operator's colors, and the seaplane wears none (M6.5's decisions: no
 * state-ferry livery, nothing trademarked).
 *
 * Pure: a Date or a number of seconds in, positions out. world.js hangs the
 * meshes on them.
 */

import { CITY, WATER_Y, shoreZ, groundY, blockAt, piers, isLand, seeded } from './city.min.js';

const MINUTE = 60000;

/**
 * The timetables and sizes. Minutes for schedules, meters and meters per
 * second for the rest. `scale` enlarges the small craft past life, because
 * a true-size sailboat two kilometers off is a pixel or two.
 */
export const LIFE = {
    ferry: { cycle: 100, crossing: 35, lane: 70, length: 140, scale: 1.2 },
    ship: { every: 75, offset: 20, speed: 7, span: 40000, lanes: { north: -6300, south: -6900 }, length: 290 },
    sailboat: { count: 6, from: 8, to: 19.5, scale: 2 },
    seaplane: { takeoff: 20, landing: 50, from: 8, to: 19, run: 35, climb: 150, top: 45, rise: 4, scale: 2 },
    cars: { near: { x0: -200, x1: 120, z1: -6 } },
    wind: 6,
    ripple: [0.004, 0.0025]
};

/** Minutes on an unbroken clock, for the runs that go round the clock
 *  (a schedule counted from midnight would jump at midnight). */
export function minutesOn(date) {
    return date.getTime() / MINUTE;
}

/** Minutes since the visitor's local midnight, for what keeps daytime hours. */
export function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / MINUTE;
}

/** A start and a stop with no jolt: 0 to 1 with zero speed at both ends. */
export function gently(p) {
    const t = Math.min(1, Math.max(0, p));
    return t - Math.sin(2 * Math.PI * t) / (2 * Math.PI);
}

/** The heading a mesh built bow toward -z needs to face along (dx, dz). */
export function yawFor(dx, dz) {
    return Math.atan2(-dx, -dz);
}

// ---- The ferries ----------------------------------------------------------------

/**
 * The ferry run: from the berth at the end of the dock at the foot of the
 * office's street, straight west to the island's shore opposite.
 */
export function ferryRoute(city = CITY) {
    const dock = piers(city).find((p) => p.ferry);
    const x = dock.x;
    const cityBerth = dock.z - dock.length - LIFE.ferry.length / 2;
    let z = cityBerth;
    while (!isLand(x, z, city) && z > -40000) z -= 10;
    return { x, from: cityBerth, to: z + LIFE.ferry.length / 2 + 60 };
}

/**
 * Where both ferries are at a moment. Each runs a `cycle`: across to the
 * island, a wait there, back, a wait at the dock; the second runs half a
 * cycle behind the first, so a boat leaves each side every half cycle. Out
 * and back they keep to the right, so they pass each other port to port.
 */
export function ferriesAt(date, route = ferryRoute()) {
    const { cycle, crossing, lane } = LIFE.ferry;
    const half = cycle / 2;
    return [0, 1].map((f) => {
        const phase = (((minutesOn(date) + f * half) % cycle) + cycle) % cycle;
        const out = phase < half;
        const p = (out ? phase : phase - half) / crossing;
        const s = gently(p);
        const along = out ? s : 1 - s;
        // Out is heading west (-z), whose right hand is north (+x).
        const side = out ? 1 : -1;
        const x = route.x + side * lane * Math.sin(Math.PI * s);
        const z = route.from + (route.to - route.from) * along;
        const moving = p > 0 && p < 1;
        const speed = moving ? (1 - Math.cos(2 * Math.PI * p)) / 2 : 0;
        // Heading: along the run, leaning toward the side lane at first and
        // back again at the end.
        const dz = out ? -1 : 1;
        const dx = side * lane * Math.PI * Math.cos(Math.PI * s) / Math.abs(route.to - route.from);
        return { x, y: WATER_Y, z, yaw: yawFor(dx, dz), speed };
    });
}

// ---- The ships ------------------------------------------------------------------

/**
 * The container ships passing up and down the bay, one every `every`
 * minutes, alternately northbound and southbound in their own lanes. Each
 * is numbered `k` on the unbroken clock, so its look stays the same while
 * it is in sight. Only the ones within `span` of the office's line are listed.
 */
export function shipsAt(date) {
    const { every, offset, speed, span, lanes } = LIFE.ship;
    const m = minutesOn(date);
    const ships = [];
    const reach = span / speed / 60;
    for (let k = Math.floor((m - offset - reach) / every); k <= Math.ceil((m - offset + reach) / every); k++) {
        const passes = k * every + offset;
        const north = ((k % 2) + 2) % 2 === 0;
        const x = (north ? 1 : -1) * speed * (m - passes) * 60;
        if (Math.abs(x) > span) continue;
        ships.push({ k, x, y: WATER_Y, z: north ? lanes.north : lanes.south, yaw: yawFor(north ? 1 : -1, 0), speed: 1 });
    }
    return ships;
}

// ---- The sailboats --------------------------------------------------------------

/** The sailboats' courses: each a slow loop in the near bay. */
export function sailboatCourses(seed = 20260927) {
    const random = seeded(seed);
    return Array.from({ length: LIFE.sailboat.count }, () => ({
        cx: -1400 + random() * 3000,
        cz: -2300 - random() * 1500,
        a: 220 + random() * 280,
        b: 140 + random() * 200,
        period: 18 + random() * 20,
        phase: random(),
        heel: (8 + random() * 8) * (Math.PI / 180)
    }));
}

/** Where the sailboats are, and whether they are out at all: by day, and
 *  not in the rain (weather.js `rain`, 0 to 1). */
export function sailboatsAt(date, courses = sailboatCourses(), rain = 0) {
    const m = minutesOfDay(date);
    const out = m >= LIFE.sailboat.from * 60 && m <= LIFE.sailboat.to * 60 && rain < 0.3;
    const going = minutesOn(date);
    return courses.map((c) => {
        const theta = 2 * Math.PI * (going / c.period + c.phase);
        const x = c.cx + c.a * Math.cos(theta);
        const z = c.cz + c.b * Math.sin(theta);
        return { x, y: WATER_Y, z, yaw: yawFor(-c.a * Math.sin(theta), c.b * Math.cos(theta)), heel: c.heel, out };
    });
}

// ---- The seaplane ---------------------------------------------------------------

/** Where the seaplane's run starts on the water, and which way it takes off. */
export const SEAPLANE_START = [900, -1500];

/**
 * The seaplane, `seconds` into a takeoff: a run along the water, speeding
 * up, then a steady climb away west. Null once it is gone.
 */
export function takeoff(seconds) {
    const { run, climb, top, rise } = LIFE.seaplane;
    if (seconds < 0 || seconds > run + climb) return null;
    const [x, z0] = SEAPLANE_START;
    const a = top / run;
    if (seconds <= run) {
        return { x, y: WATER_Y, z: z0 - 0.5 * a * seconds * seconds, yaw: 0, pitch: 0, speed: seconds / run };
    }
    const flying = seconds - run;
    return {
        x, y: WATER_Y + rise * flying, z: z0 - 0.5 * a * run * run - top * flying,
        yaw: 0, pitch: Math.atan2(rise, top), speed: 1
    };
}

/**
 * The seaplane at a moment. Each hour of its day it takes off at `takeoff`
 * past and flies away, and comes back at `landing` past: a takeoff run
 * backward (in from the west, nose a little up, touching down, slowing to a
 * stop where it started). The rest of the time it lies moored at its
 * start, so it never appears or vanishes on the water, and in heavy rain
 * it stays moored. Null only while it is away.
 */
export function seaplaneAt(date, rain = 0) {
    const { takeoff: up, landing, from, to, run, climb } = LIFE.seaplane;
    const moored = { x: SEAPLANE_START[0], y: WATER_Y, z: SEAPLANE_START[1], yaw: 0, pitch: 0, speed: 0 };
    const m = minutesOfDay(date);
    const hour = Math.floor(m / 60);
    if (hour < from || hour > to || rain > 0.5) return moored;
    const into = (m - hour * 60) * 60;
    const trip = run + climb;
    if (into < up * 60) return moored;
    if (into <= up * 60 + trip) return takeoff(into - up * 60);
    if (into < landing * 60) return null;
    if (into > landing * 60 + trip) return moored;
    const back = takeoff(Math.max(0, trip - (into - landing * 60)));
    return { ...back, yaw: Math.PI, pitch: back.y > WATER_Y ? 0.04 : 0 };
}

// ---- The cars -------------------------------------------------------------------

/**
 * THE TRAFFIC IS TIMED, so nothing drives through anything (QA, 2026-09-25:
 * cars at their own speeds ran through the one ahead, and through the cross
 * traffic at every corner). Downtown's signals are a green wave:
 *
 * - Every vehicle drives at `speed`, so none ever gains on the one ahead.
 * - The blocks are the same size both ways, so a light's cycle can be the
 *   time it takes to drive two blocks (`cycle`, 2 x 98 m). Each street at a
 *   crossing has the green for half of it, and the crossings are offset in
 *   a checkerboard, so a vehicle that meets one green meets every green
 *   after it, whichever way it drives.
 * - The vehicles run in platoons that fill the middle of their green, with
 *   `margin` seconds clear before the cross street's platoon arrives: at
 *   most `slots` places `spacing` apart, or a bus with a place either side.
 *
 * A vehicle's place on its lane is then a pure function of time: `slot` (a
 * share of the cycle) and `group` (which platoon of the lane's loop). The
 * loop is a whole number of cycles long, a little longer than the street,
 * and a vehicle on the stretch past the street's end is parked out of sight.
 */
export const TRAFFIC = {
    speed: 10,
    slots: 5,
    spacing: 10.5,
    fill: 0.62,
    buses: 0.16,
    suvs: 0.3,
    /** How much further the loop runs than the street, at least. */
    tail: 30
};

/** Each kind of vehicle's size in meters, and how high its lights ride. */
export const VEHICLES = {
    car: { length: 4.6, width: 1.9, height: 1.45, lights: 0.8 },
    bus: { length: 12, width: 2.55, height: 3.3, lights: 1.0 }
};

/** A car's size (the kind most vehicles are). */
export const CAR = VEHICLES.car;

/** How an SUV is a car enlarged: a little longer and wider, and taller. */
export const SUV = [1.04, 1.22, 1.05];

/** Where a vehicle not on the street waits: far below the water. */
export const PARKED_Y = -10000;

/** The distance, along any street, from one crossing to the next. */
export function pitchOf(city = CITY) {
    return city.block + city.street;
}

/** A light's full cycle, in meters of driving and in seconds. */
export function cycleOf(city = CITY) {
    const meters = 2 * pitchOf(city);
    return { meters, seconds: meters / TRAFFIC.speed };
}

/**
 * The share of the cycle each place in a platoon arrives at a crossing, the
 * middle one at a quarter. The first half of every cycle is one street's
 * green and the second half the other's.
 */
export function slotTimes(city = CITY) {
    const step = TRAFFIC.spacing / cycleOf(city).meters;
    const middle = (TRAFFIC.slots - 1) / 2;
    return Array.from({ length: TRAFFIC.slots }, (_, k) => 0.25 + (k - middle) * step);
}

/**
 * The lanes of the streets under the window: both ways along every street
 * in the few blocks the window looks down on, each from `a` to `b` at the
 * height of the street, stopping short of the water. Each carries its
 * `length`, its `loop` (a whole number of cycles) and `d0`, the distance
 * along it that keeps its platoons on the green wave.
 */
export function carLanes(city = CITY) {
    const { x0, x1, z1 } = LIFE.cars.near;
    const half = city.street / 2;
    const pitch = pitchOf(city);
    const cycle = cycleOf(city).meters;
    // The middles of the streets: those running along z (at these x's) and
    // those running along x (at these z's), every `pitch` from here.
    const xStreets = city.ownTower.x0 - half;
    const zStreets = city.ownTower.z0 - half;
    const lanes = [];
    const lane = (a, b) => {
        const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (length <= 40) return;
        // A lane along z crosses the streets along x, and the other way round.
        const alongZ = Math.abs(b[2] - a[2]) > Math.abs(b[0] - a[0]);
        const s = Math.sign(alongZ ? b[2] - a[2] : b[0] - a[0]);
        const from = alongZ ? a[2] : a[0];
        const crossings = alongZ ? zStreets : xStreets;
        // Which street of the other way this lane is on: its crossings'
        // greens are that many half-cycles on (the checkerboard), and a
        // lane along x has the second half of every cycle.
        const own = alongZ ? Math.round((a[0] - xStreets) / pitch) : Math.round((a[2] - zStreets) / pitch);
        const d0 = s * (crossings - from) - own * pitch - (alongZ ? 0 : pitch);
        const loop = Math.ceil((length + TRAFFIC.tail) / cycle) * cycle;
        lanes.push({ a, b, length, loop, d0, alongZ });
    };
    const at = (x, z) => [x, groundY(x, z, city) + 1.2, z];
    // Streets running along z (east and west), at the block edges in x.
    for (let k = -5; k <= 8; k++) {
        const x = blockAt(k, 0, city).x0 - half;
        if (x < x0 || x > x1) continue;
        const shore = shoreZ(x, city) + 40;
        for (const side of [-4, 4]) {
            const a = at(x + side, z1);
            const b = at(x + side, shore);
            if (side > 0) lane(a, b); else lane(b, a);
        }
    }
    // Streets running along x (north and south), at the block edges in z.
    for (let m = 0; m >= -8; m--) {
        const z = blockAt(0, m, city).z0 - half;
        if (z > z1) continue;
        let xa = x0;
        let xb = x1;
        while (xa < xb && !isLand(xa, z, city)) xa += 10;
        while (xb > xa && !isLand(xb, z, city)) xb -= 10;
        for (const side of [-4, 4]) {
            const a = at(xa, z + side);
            const b = at(xb, z + side);
            if (side > 0) lane(a, b); else lane(b, a);
        }
    }
    return lanes;
}

/**
 * The vehicles: platoons on every lane's loop, each place taken or not by
 * chance, some platoons led by a bus. Each vehicle has its `kind`, its
 * `slot` (the share of the cycle it arrives at a crossing) and `group`, its
 * `scale` (an SUV is a car enlarged), and its lights as the window sees
 * them: taillights (red) on one driving away down the hill, headlights
 * (white) on one coming up it, and either on the cross streets.
 */
export function carFleet(lanes = carLanes(), seed = 20260928, city = CITY) {
    const random = seeded(seed);
    const times = slotTimes(city);
    const middle = (TRAFFIC.slots - 1) / 2;
    const cycle = cycleOf(city).meters;
    const cars = [];
    lanes.forEach(({ a, b, loop }, lane) => {
        const red = b[2] < a[2] || (b[2] === a[2] && b[0] > a[0]);
        for (let group = 0; group < loop / cycle; group++) {
            // A bus takes the middle three places.
            const bus = random() < TRAFFIC.buses;
            for (let k = 0; k < TRAFFIC.slots; k++) {
                const kind = bus && Math.abs(k - middle) <= 1 ? 'bus' : 'car';
                if (kind === 'bus' && k !== middle) continue;
                if (kind === 'car' && random() >= TRAFFIC.fill) continue;
                const suv = kind === 'car' && random() < TRAFFIC.suvs;
                cars.push({ lane, kind, slot: times[k], group, scale: suv ? SUV : [1, 1, 1], red });
            }
        }
    });
    return cars;
}

/** How far along its lane's loop a vehicle is at `seconds`, in meters. */
export function distanceAlong(car, lane, seconds, city = CITY) {
    const { meters, seconds: period } = cycleOf(city);
    const d = meters * (seconds / period - car.slot) + lane.d0 + car.group * meters;
    return ((d % lane.loop) + lane.loop) % lane.loop;
}

/**
 * Every vehicle's position at `seconds`, written into `out` (x, y, z each),
 * at the lanes' height over the street where it is: the street follows the
 * hill's curve, and a straight line between a lane's ends would float a car
 * off it (by nearly seven meters, mid-hill). One on its loop's stretch past
 * the street's end is parked at PARKED_Y. Given `pitches`, each one's tilt
 * with the street is written there too (positive, nose up).
 */
export function carPositions(cars, lanes, seconds, out = new Float32Array(cars.length * 3), pitches = null) {
    cars.forEach((car, i) => {
        const lane = lanes[car.lane];
        const { a, b, length } = lane;
        const d = distanceAlong(car, lane, seconds);
        if (d > length) {
            out[i * 3] = a[0];
            out[i * 3 + 1] = PARKED_Y;
            out[i * 3 + 2] = a[2];
            if (pitches) pitches[i] = 0;
            return;
        }
        const ux = (b[0] - a[0]) / length;
        const uz = (b[2] - a[2]) / length;
        const x = a[0] + ux * d;
        const z = a[2] + uz * d;
        out[i * 3] = x;
        out[i * 3 + 1] = groundY(x, z) + 1.2;
        out[i * 3 + 2] = z;
        if (pitches) pitches[i] = Math.atan((groundY(x + ux * 2, z + uz * 2) - groundY(x - ux * 2, z - uz * 2)) / 4);
    });
    return out;
}

/** Whether a position carPositions wrote is on the street. */
export function onStreet(y) {
    return y > PARKED_Y / 2;
}

/** How each vehicle faces: along its lane (a yaw, bow toward -z as built). */
export function carYaws(cars, lanes) {
    return cars.map(({ lane }) => {
        const { a, b } = lanes[lane];
        return yawFor(b[0] - a[0], b[2] - a[2]);
    });
}

/**
 * Every vehicle's lights at `seconds`, written into `out`: at the end of it
 * the window sees, the tail of one driving away (red) and the nose of one
 * coming (white), a little above the street and just clear of the body. A
 * parked vehicle's lights are parked with it.
 */
export function carLightPositions(cars, lanes, seconds, out = new Float32Array(cars.length * 3)) {
    carPositions(cars, lanes, seconds, out);
    cars.forEach((car, i) => {
        if (!onStreet(out[i * 3 + 1])) return;
        const { a, b, length } = lanes[car.lane];
        const size = VEHICLES[car.kind];
        const reach = (size.length * car.scale[2]) / 2 + 0.2;
        const sign = car.red ? -1 : 1;
        out[i * 3] += ((b[0] - a[0]) / length) * reach * sign;
        out[i * 3 + 1] += size.lights - 1.2;
        out[i * 3 + 2] += ((b[2] - a[2]) / length) * reach * sign;
    });
    return out;
}

// ---- The jet --------------------------------------------------------------------

/**
 * Now and then a passenger jet crosses the far sky (QA, 2026-09-25): a
 * twin-engined narrow-body on the approach line over the bay, the way the
 * arrivals come down past a real waterfront. It flies south, letting down,
 * and the next one north, climbing, `span` meters either side of the
 * office's line on the track `z` out over the water, between `low` and
 * `high` meters above it. Enlarged by `scale`, like the small craft, so its
 * shape reads as an airliner rather than a speck.
 *
 * On real seconds, like the cars: a day going by at speed would fire one
 * across the window in a frame. The first comes into the desk's view half a
 * minute after the office opens, and then one every `every` seconds or a
 * little later (`late`).
 */
export const JET = {
    every: 420,
    late: 90,
    first: -35,
    speed: 80,
    z: -5200,
    span: 9000,
    low: 700,
    high: 960,
    scale: 4,
    /** A light aboard flashes this long, this often (seconds). */
    flash: 0.16,
    blink: 1.3
};

/** How long a crossing takes, in seconds. */
export function jetCrossing() {
    return (2 * JET.span) / JET.speed;
}

/** Flight `k`: when it sets out (seconds on the page's clock) and which way. */
export function jetFlight(k) {
    const late = k === 0 ? 0 : seeded(20260925 + k * 7919)() * JET.late;
    return { start: JET.first + k * JET.every + late, south: k % 2 === 0 };
}

/**
 * The jet `into` seconds into a crossing: where it is, which way it faces,
 * and its pitch (the nose a touch up letting down, more climbing). Its
 * height follows a straight line along the track, so south is down and
 * north is up.
 */
export function jetOnTrack(into, south) {
    const { span, speed, low, high, z } = JET;
    const x = south ? span - speed * into : -span + speed * into;
    const slope = (high - low) / (2 * span);
    const y = WATER_Y + (low + high) / 2 + slope * x;
    const climb = Math.atan(slope) * (south ? -1 : 1);
    return { x, y, z, yaw: yawFor(south ? -1 : 1, 0), pitch: climb + 0.035, speed: 1 };
}

/**
 * Where the jet is at `seconds`, or null between flights. `called` is the
 * start of one asked for by hand (main.js cornerOffice.jet), which flies
 * south whatever the timetable says.
 */
export function jetAt(seconds, called = null) {
    const crossing = jetCrossing();
    if (called != null && seconds >= called && seconds - called <= crossing) return jetOnTrack(seconds - called, true);
    // A crossing and the most a flight is late are shorter than `every`, so
    // the flight due in this stretch of the clock is the only one aloft.
    const k = Math.floor((seconds - JET.first) / JET.every);
    if (k < 0) return null;
    const { start, south } = jetFlight(k);
    return seconds >= start && seconds - start <= crossing ? jetOnTrack(seconds - start, south) : null;
}

/** Whether the jet's strobes are lit at `seconds`: a short flash, over and
 *  over. */
export function jetFlashing(seconds) {
    return ((seconds % JET.blink) + JET.blink) % JET.blink < JET.flash;
}

// ---- The wind -------------------------------------------------------------------

/** How far the clouds have drifted at a moment, in tiles (sky.js CLOUDS),
 *  and the ripples at `seconds`, in their own tiles. */
export function drift(date, seconds, cloudTile) {
    const along = (LIFE.wind * date.getTime()) / 1000 / cloudTile;
    return {
        clouds: [along % 1, (along * 0.35) % 1],
        ripple: [(seconds * LIFE.ripple[0]) % 1, (seconds * LIFE.ripple[1]) % 1]
    };
}
