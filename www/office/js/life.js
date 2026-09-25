// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * life.js - What moves out there: the ferries, the ships, the sailboats, the
 * seaplane, the cars, and the wind in the clouds and on the water.
 *
 * ON A TIMETABLE, NOT AT RANDOM. Everything on the water keeps a schedule
 * on the sky's clock (the visitor's own time, a pinned hour, or a day going
 * by), so a ferry is where the timetable says it is whenever the visitor
 * looks, and a day going by runs the whole harbor at speed, the way a
 * time-lapse does. The cars and the ripples keep real seconds instead: at a
 * day-going-by's pace a car would cross the city in a frame.
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
    cars: { count: 240, speed: [8, 14], near: { x0: -200, x1: 120, z1: -6 } },
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
 * The lanes of the streets under the window: both ways along every street
 * in the few blocks the window looks down on, each from `a` to `b` at the
 * height of the street, stopping short of the water.
 */
export function carLanes(city = CITY) {
    const { x0, x1, z1 } = LIFE.cars.near;
    const half = city.street / 2;
    const lanes = [];
    const lane = (a, b) => {
        if (Math.hypot(b[0] - a[0], b[2] - a[2]) > 40) lanes.push({ a, b });
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
 * The cars: each on a lane at its own speed and starting point, with its
 * lights as the window sees them: taillights (red) on a car driving away
 * down the hill, headlights (white) on one coming up it, and either on the
 * cross streets.
 */
export function carFleet(lanes = carLanes(), seed = 20260928) {
    const random = seeded(seed);
    const lengths = lanes.map((l) => Math.hypot(l.b[0] - l.a[0], l.b[2] - l.a[2]));
    const total = lengths.reduce((s, v) => s + v, 0);
    const [slow, fast] = LIFE.cars.speed;
    const cars = [];
    for (let i = 0; i < LIFE.cars.count; i++) {
        // Lanes get cars by their length.
        let pick = random() * total;
        let lane = 0;
        while (pick > lengths[lane] && lane < lanes.length - 1) pick -= lengths[lane++];
        const { a, b } = lanes[lane];
        const away = b[2] < a[2] || (b[2] === a[2] && b[0] > a[0]);
        cars.push({ lane, start: random(), speed: slow + random() * (fast - slow), length: lengths[lane], red: away });
    }
    return cars;
}

/**
 * Every car's position at `seconds`, written into `out` (x, y, z each), at
 * the lanes' height over the street where it is: the street follows the
 * hill's curve, and a straight line between a lane's ends would float a car
 * off it (by nearly seven meters, mid-hill).
 */
export function carPositions(cars, lanes, seconds, out = new Float32Array(cars.length * 3)) {
    cars.forEach((car, i) => {
        const { a, b } = lanes[car.lane];
        const s = (((car.start + (seconds * car.speed) / car.length) % 1) + 1) % 1;
        const x = a[0] + (b[0] - a[0]) * s;
        const z = a[2] + (b[2] - a[2]) * s;
        out[i * 3] = x;
        out[i * 3 + 1] = groundY(x, z) + 1.2;
        out[i * 3 + 2] = z;
    });
    return out;
}

/** A car's size in meters, and how high its lights ride above the street. */
export const CAR = { length: 4.6, width: 1.9, height: 1.45, lights: 0.8 };

/** How each car faces: along its lane (a yaw, bow toward -z as built). */
export function carYaws(cars, lanes) {
    return cars.map(({ lane }) => {
        const { a, b } = lanes[lane];
        return yawFor(b[0] - a[0], b[2] - a[2]);
    });
}

/**
 * Every car's lights at `seconds`, written into `out`: at the end of the car
 * the window sees, the tail of one driving away (red) and the nose of one
 * coming (white), a little above the street and just clear of the body.
 */
export function carLightPositions(cars, lanes, seconds, out = new Float32Array(cars.length * 3)) {
    carPositions(cars, lanes, seconds, out);
    const reach = CAR.length / 2 + 0.2;
    cars.forEach((car, i) => {
        const { a, b } = lanes[car.lane];
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const sign = car.red ? -1 : 1;
        out[i * 3] += ((b[0] - a[0]) / len) * reach * sign;
        out[i * 3 + 1] += CAR.lights - 1.2;
        out[i * 3 + 2] += ((b[2] - a[2]) / len) * reach * sign;
    });
    return out;
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
