// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * life.js - What moves out there: the ferries, the ships, the sailboats, the
 * seaplane, the traffic, a jet coming in to land now and then, and the wind in the clouds and
 * on the water.
 *
 * ON A TIMETABLE, NOT AT RANDOM. Everything on the water keeps a schedule
 * on the sky's clock (the visitor's own time, a pinned hour, or a day going
 * by), so a ferry is where the timetable says it is whenever the visitor
 * looks, and a day going by runs the whole harbor at speed, the way a
 * time-lapse does. The cars, the jet and the ripples keep the scenery's
 * seconds instead (main.js sceneryClock): real time, and 30 times faster
 * while a day goes by, so they race with it (QA, 2026-09-29) without going
 * at the day's own pace, at which a car would cross the city in a frame.
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

import {
    CITY, WATER_Y, shoreZ, groundY, blockAt, piers, isLand, seeded, AIRPORT, airportPoint, airportYaw, airportY, airportGates
} from './city.min.js';

const MINUTE = 60000;

/**
 * The timetables and sizes. Minutes for schedules, meters and meters per
 * second for the rest. `scale` enlarges the small craft past life, because
 * a true-size sailboat two kilometers off is a pixel or two.
 */
export const LIFE = {
    ferry: { cycle: 100, crossing: 35, lane: 70, length: 140, scale: 1.2 },
    ship: {
        every: 75, offset: 20, speed: 7, span: 40000, lanes: { north: -6300, south: -6900 }, length: 290,
        /** Where a ship stands, along each lane, when the visitor arrives
         *  (shipShift): just into the stretch down the office's own street
         *  and heading on across it. That stretch, x 0 to about 2200, is the
         *  only one every station and screen sees (x 0 to 1250 from the
         *  window on an upright phone), measured 2026-09-25. */
        arrival: { north: 400, south: 1200 }
    },
    /**
     * The cruise ship (QA, 2026-09-29: "now that we can pan pretty far to
     * the right (north), would it be possible to add a cruise ship in the
     * distance?"). The desk, turned right, sees one wide stretch of the
     * northern water: bearings 41 to 50 degrees north of west, from the
     * waterfront to the horizon (measured 2026-09-29). A ship sailing down
     * that stretch is seen bow on, a sliver, so the ship's day is spent
     * alongside a cruise terminal pier in it instead, broadside to the
     * office, as Seattle's are north of downtown. `pier`: where it leaves
     * the shore (x), how long and wide it is (meters), and its heading out
     * into the bay (degrees west of south). `berth`: how far out along the
     * pier the ship's middle lies, and how far off the pier's south-east
     * side, the one the office sees (its terminal shed is on the other). `lane`: the way in, a smooth curve from the far end, each point
     * a bearing and meters out (['b', bearing, out]) or a place near the
     * berth (['berth', along, across], meters along the berthed ship's
     * heading and out from the pier), straight legs joined by turns of
     * `turn` meters' radius (a ship's, at a harbor pace): out from behind
     * the tower at the stretch's right edge 16 km off, down the stretch,
     * round behind the towers at its left edge and in alongside. `arrive` and `depart` are
     * clock hours (a ship in at dawn, out in the late afternoon, as the
     * real ones keep); at `speed` meters a second under way (about ten
     * knots), slowing over the last `slow` meters, and leaving: backed off
     * `back` meters in `backMinutes`, turned about in `turnMinutes`, and
     * away. `length` meters, drawn `scale` times life; the line's colors
     * change day by day, among `liveries`.
     */
    cruise: {
        pier: { x: 2700, length: 1100, width: 55, heading: 45 },
        berth: { along: 950, off: 45 },
        lane: [['b', 56, 16000], ['b', 46, 12000], ['berth', -1500, 0], ['berth', 0, 0]],
        turn: 700,
        arrive: 5.6, depart: 16.5, speed: 5, slow: 900, back: 600, backMinutes: 10, turnMinutes: 8,
        length: 300, scale: 1.1, liveries: 3
    },
    sailboat: { count: 6, from: 8, to: 19.5, scale: 2 },
    seaplane: { takeoff: 20, landing: 50, from: 8, to: 19, run: 35, climb: 150, top: 45, rise: 4, scale: 2 },
    cars: { near: { x0: -200, x1: 120, z1: -6 } },
    /** Meters a second, at the clouds' height (sky.js CLOUDS). */
    wind: 10,
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
 * `shift` minutes run the timetable that much ahead (shipShift).
 */
export function shipsAt(date, shift = 0) {
    const { every, offset, speed, span, lanes } = LIFE.ship;
    const m = minutesOn(date) + shift;
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

/**
 * The shift (minutes, for shipsAt) that has a ship in view when the
 * visitor arrives at `date` (QA, 2026-09-25: with one every 75 minutes,
 * most visitors never saw one). Of the ships due about then, the one whose
 * moment at its lane's arrival point is nearest `date`, forward or back,
 * so the timetable moves by no more than half a gap between two ships.
 */
export function shipShift(date) {
    const { every, offset, speed, arrival } = LIFE.ship;
    const m = minutesOn(date);
    const near = Math.round((m - offset) / every);
    let best = null;
    for (let k = near - 2; k <= near + 2; k++) {
        const north = ((k % 2) + 2) % 2 === 0;
        // A ship is at x when (m - passes) * 60 * speed is x on its heading.
        const at = k * every + offset + ((north ? 1 : -1) * (north ? arrival.north : arrival.south)) / (speed * 60);
        if (best === null || Math.abs(at - m) < Math.abs(best)) best = at - m;
    }
    return best;
}

// ---- The cruise ship ------------------------------------------------------------

/**
 * The cruise terminal pier (LIFE.cruise.pier) and the berth beside it, in
 * the room's frame: where the pier leaves the shore (`x0`, `z0`) and ends
 * (`x1`, `z1`), its `width`, `out` (the unit way it runs, out into the
 * bay), `side` (the unit way off its south-east side, toward the office), the berthed ship's middle (`bx`, `bz`) and its heading as it lies
 * there (`yaw`, bow toward the shore).
 */
export function cruisePier(cruise = LIFE.cruise) {
    const { x, length, width, heading } = cruise.pier;
    const a = (heading * Math.PI) / 180;
    // West of south: south is -x, west is -z.
    const out = [-Math.cos(a), -Math.sin(a)];
    // Its south-east side, the one the office sees (the office lies south
    // and east of the pier).
    const side = [out[1], -out[0]];
    const x0 = x;
    const z0 = shoreZ(x);
    const along = cruise.berth.along;
    const off = width / 2 + cruise.berth.off;
    const bx = x0 + out[0] * along + side[0] * off;
    const bz = z0 + out[1] * along + side[1] * off;
    return {
        x0, z0, x1: x0 + out[0] * length, z1: z0 + out[1] * length, width, out, side, bx, bz,
        yaw: yawFor(-out[0], -out[1])
    };
}

/**
 * The cruise ship's way in (LIFE.cruise.lane) in the room's frame: straight
 * legs between its points, each corner rounded by an arc of `turn` meters'
 * radius (less where a leg is too short for it), so a ship turns as a ship
 * does, never pivots; laid out as `samples` points evenly along its length:
 * `points` ([x, z], far end first, the berth last) and its `length`.
 */
export function cruiseLane(cruise = LIFE.cruise, samples = 300, pier = cruisePier(cruise)) {
    const ahead = [-pier.out[0], -pier.out[1]];
    const pts = cruise.lane.map(([kind, a, b]) => {
        if (kind === 'berth') return [pier.bx + ahead[0] * a + pier.side[0] * b, pier.bz + ahead[1] * a + pier.side[1] * b];
        const r = (a * Math.PI) / 180;
        return [Math.sin(r) * b, -Math.cos(r) * b];
    });
    // The way as a fine polyline: each leg, and each corner's arc.
    const fine = [pts[0]];
    const line = (to) => {
        const [fx, fz] = fine[fine.length - 1];
        const n = Math.max(1, Math.ceil(Math.hypot(to[0] - fx, to[1] - fz) / 10));
        for (let i = 1; i <= n; i++) fine.push([fx + ((to[0] - fx) * i) / n, fz + ((to[1] - fz) * i) / n]);
    };
    for (let i = 1; i < pts.length - 1; i++) {
        const [p0, p, p1] = [pts[i - 1], pts[i], pts[i + 1]];
        const lin = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
        const lout = Math.hypot(p1[0] - p[0], p1[1] - p[1]);
        const u = [(p[0] - p0[0]) / lin, (p[1] - p0[1]) / lin];
        const v = [(p1[0] - p[0]) / lout, (p1[1] - p[1]) / lout];
        const theta = Math.acos(Math.min(1, Math.max(-1, u[0] * v[0] + u[1] * v[1])));
        if (theta < 1e-6) {
            line(p);
            continue;
        }
        const reach = Math.min(cruise.turn * Math.tan(theta / 2), lin * 0.5, lout * 0.5);
        const radius = reach / Math.tan(theta / 2);
        const start = [p[0] - u[0] * reach, p[1] - u[1] * reach];
        line(start);
        // The arc about its center, off the leg toward the turn.
        const turnSign = Math.sign(u[0] * v[1] - u[1] * v[0]);
        const normal = [-u[1] * turnSign, u[0] * turnSign];
        const center = [start[0] + normal[0] * radius, start[1] + normal[1] * radius];
        const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]);
        const n = Math.max(2, Math.ceil((radius * theta) / 10));
        for (let k = 1; k <= n; k++) {
            const a = a0 + turnSign * theta * (k / n);
            fine.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]);
        }
    }
    line(pts[pts.length - 1]);
    const run = [0];
    for (let i = 1; i < fine.length; i++) run.push(run[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
    const length = run[run.length - 1];
    // Evenly along it, so a ship keeps its speed round the turns.
    const points = [];
    let j = 0;
    for (let i = 0; i <= samples; i++) {
        const d = (i / samples) * length;
        while (j < run.length - 2 && run[j + 1] < d) j++;
        const f = (d - run[j]) / (run[j + 1] - run[j] || 1);
        points.push([fine[j][0] + (fine[j + 1][0] - fine[j][0]) * f, fine[j][1] + (fine[j + 1][1] - fine[j][1]) * f]);
    }
    return { points, length };
}

/** Where along the lane `d` meters from its far end is, and which way it
 *  runs there, as `[x, z, dx, dz]`. */
export function laneAt(lane, d) {
    const n = lane.points.length - 1;
    const f = Math.min(n, Math.max(0, (d / lane.length) * n));
    const i = Math.min(n - 1, Math.floor(f));
    const [ax, az] = lane.points[i];
    const [bx, bz] = lane.points[i + 1];
    const k = f - i;
    return [ax + (bx - ax) * k, az + (bz - az) * k, bx - ax, bz - az];
}

/**
 * The cruise ship's day, as minutes after midnight for each part of it:
 * `in` (sailing in, from the far end of the lane), `docked` (alongside),
 * `off` (backing off the pier), `turned` (turned about, heading out) and
 * `gone` (at the lane's far end, out of sight).
 */
export function cruiseDay(lane = cruiseLane(), cruise = LIFE.cruise) {
    const { speed, slow, back, backMinutes, turnMinutes } = cruise;
    const start = cruise.arrive * 60;
    // Under way, then an even slowing over the last `slow` meters, which
    // takes twice as long as it would at speed.
    const docked = start + ((lane.length - slow) / speed + (2 * slow) / speed) / 60;
    const leave = cruise.depart * 60;
    const off = leave + backMinutes;
    const turned = off + turnMinutes;
    // Away, gathering speed over its first minutes.
    const gone = turned + ((lane.length - back) / speed) / 60 + ACCELERATE / 2;
    return { in: start, docked, leave, off, turned, gone };
}

/** How many minutes a leaving ship takes to come up to speed. */
const ACCELERATE = 3;

const easeInOut = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * The cruise ship at `date` (the sky's clock), or null while none is
 * there (the night): `{ x, y, z, yaw, speed, livery, phase }`, `phase` one
 * of 'in', 'docked', 'off', 'turning' and 'out'. A different line's ship
 * each day, counted round LIFE.cruise.liveries.
 */
export function cruiseAt(date, lane = cruiseLane(), pier = cruisePier()) {
    const cruise = LIFE.cruise;
    const day = cruiseDay(lane, cruise);
    const m = minutesOfDay(date);
    const dayNumber = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
    const livery = ((dayNumber % cruise.liveries) + cruise.liveries) % cruise.liveries;
    const at = (d, reverse = false) => {
        const [x, z, dx, dz] = laneAt(lane, d);
        return { x, y: WATER_Y, z, yaw: reverse ? yawFor(-dx, -dz) : yawFor(dx, dz) };
    };
    const { speed, slow, back } = cruise;
    if (m < day.in || m >= day.gone) return null;
    if (m < day.docked) {
        const t = (m - day.in) * 60;
        const cruising = (lane.length - slow) / speed;
        let d = speed * t;
        let v = 1;
        if (t > cruising) {
            const tau = t - cruising;
            const a = (speed * speed) / (2 * slow);
            d = lane.length - slow + speed * tau - (a * tau * tau) / 2;
            v = Math.max(0, 1 - (a * tau) / speed);
        }
        return { ...at(Math.min(lane.length, d)), speed: v, livery, phase: 'in' };
    }
    if (m < day.leave) return { x: pier.bx, y: WATER_Y, z: pier.bz, yaw: pier.yaw, speed: 0, livery, phase: 'docked' };
    if (m < day.off) {
        // Backed off along the way it came in, bow still toward the shore.
        const d = lane.length - back * easeInOut((m - day.leave) / (day.off - day.leave));
        return { ...at(d), speed: 0, livery, phase: 'off' };
    }
    if (m < day.turned) {
        // Turned about by the tugs where it lies, to starboard.
        const here = at(lane.length - back);
        return { ...here, yaw: here.yaw - Math.PI * easeInOut((m - day.off) / (day.turned - day.off)), speed: 0, livery, phase: 'turning' };
    }
    // Away up the lane, bow first, gathering speed.
    const tau = m - day.turned;
    const run = tau < ACCELERATE ? (tau * tau) / (2 * ACCELERATE) : tau - ACCELERATE / 2;
    const d = Math.max(0, lane.length - back - speed * run * 60);
    return { ...at(d, true), speed: Math.min(1, tau / ACCELERATE), livery, phase: 'out' };
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
 * Now and then a passenger jet comes in to land at the airport across the
 * bay (city.js AIRPORT; QA, 2026-09-28). Every one flies the same way, in
 * from the visitor's right and down to their left, never left to right: a
 * straight final approach along the runway's line, letting down on a
 * `glide` slope from `from` meters out: from over downtown behind the
 * office's right shoulder, across the view 3 to 5 km out, and away over the
 * bay to the island (QA, 2026-09-29: closer, so bigger). The big tower
 * left of the office's street hides it from about 8.3 km out to 1.6,
 * from every station and screen (measured 2026-09-29), and in that stretch
 * it flies faster (`dash`: meters left from and to, its speed there, and
 * the ramps either side, all inside the hidden stretch), so the wait
 * behind the tower is about 20 seconds, not 45. It comes out low over the
 * airport and touches down. It flares over the last `flare` meters, rolls out
 * `rollout` meters slowing to `taxiSpeed`, turns off at the taxiway exit
 * past that and taxis down to the hangar at the runway's far end and into
 * it, where the scene lets it go. A twin-engined narrow-body, enlarged by
 * `scale` like the small craft, so its shape reads as an airliner rather
 * than a speck.
 *
 * ONE EVERY 90 SECONDS (QA, 2026-09-29: "there aren't enough passenger
 * jets"; Steve chose 90 s). One every seven minutes was right for real
 * time, but a day going by runs the jets 30 times over, and its 30 seconds
 * held two. A flight from first sight to the hangar takes nearly four
 * minutes, so `fleet` jets fly at once, each flight in turn taking the next
 * (flight k the jet k mod fleet), and each is inside the hangar before its
 * jet is wanted again (held by a test).
 *
 * On the scenery's seconds, like the cars (main.js sceneryClock): real
 * time, and 30 times faster while a day goes by, not the day's own 2,880,
 * at which a landing would last a twentieth of a second. The first comes
 * into the desk's view half a minute after the office opens, and then one
 * every `every` seconds or a little later (`late`).
 */
export const JET = {
    every: 90,
    late: 20,
    first: -5,
    fleet: 3,
    /** Faster than a real approach (about 75), because it is drawn 3.5
     *  times its size: at 80 it crept across (QA, 2026-09-25). */
    speed: 145,
    dash: { from: 7700, to: 2000, speed: 450, ramp: 350 },
    glide: 3,
    from: 15000,
    flare: 400,
    rollout: 1300,
    taxiSpeed: 14,
    /** How far the fuselage's axis stands above the ground on its wheels,
     *  meters, before `scale` (the engines hang 2.9 m under it). */
    wheels: 3.4,
    scale: 3.5,
    /** A light aboard flashes this long, this often (seconds). */
    flash: 0.16,
    blink: 1.3,
    /** Nearer the eye than this, meters, a jet coming in steps visibly at
     *  the scenery's 15 frames a second, and is worth drawing every frame
     *  (world.js jetInSight). Farther, it moves about a pixel and a half a
     *  frame or less: with a flight every 90 seconds, some jet was in the
     *  frame 83% of the time, and every frame for all of them was the
     *  phone's battery. */
    smooth: 6500
};

/**
 * The airlines' colors (QA, 2026-09-29: "so they look like they belong to
 * different airlines"). Invented, as the ferries' are: no real carrier's
 * livery, no names or marks, and none of the color schemes a real carrier is
 * known by (no all-yellow fuselage, no blue one with a red belly, no white
 * one with an orange tail and engines). Each is the fuselage `body`, its
 * `belly`, a `stripe` along its sides, the `tail` (the fin and the
 * winglets) and the `engine` nacelles, sRGB. From 3 to 15 km it is the tail
 * and the fuselage's color that read, so those differ most.
 */
export const LIVERIES = [
    { name: 'harbor', body: 0xf3f4f5, belly: 0x9aa1a9, stripe: 0x1f3a5f, tail: 0x1f3a5f, engine: 0xb8bdc3 },
    { name: 'cedar', body: 0xf2f3f1, belly: 0xe4e7e6, stripe: 0x1d6b58, tail: 0x1d6b58, engine: 0x1d6b58 },
    { name: 'ember', body: 0xf4f2ef, belly: 0xb9bec4, stripe: 0xc8a24a, tail: 0x9e1f2c, engine: 0xd9dcdf },
    { name: 'glacier', body: 0xdbe7f1, belly: 0xf5f6f7, stripe: 0x3b7fb6, tail: 0x3b7fb6, engine: 0xf5f6f7 },
    { name: 'canyon', body: 0xf5f5f3, belly: 0x5d6168, stripe: 0xb4532a, tail: 0xb4532a, engine: 0x3a3e44 },
    { name: 'graphite', body: 0x3b4047, belly: 0x2c3036, stripe: 0xc9ced3, tail: 0xc9ced3, engine: 0x9aa1a9 },
    { name: 'plum', body: 0xf3f3f4, belly: 0xa7adb4, stripe: 0x6b3b7a, tail: 0x6b3b7a, engine: 0xe8e9eb }
];

/** The order the liveries come in, shuffled once: flight after flight goes
 *  through all of them before any comes again, and no two in a row match. */
const LIVERY_ORDER = (() => {
    const random = seeded(20260929);
    const order = LIVERIES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
})();

/** Flight `k`'s livery, an index into LIVERIES. */
export function liveryOf(k) {
    const n = LIVERY_ORDER.length;
    return LIVERY_ORDER[((k % n) + n) % n];
}

/** The jet's nose attitude on the approach, a touch down, and at the end of
 *  the flare, a little up (radians). */
const APPROACH_PITCH = -0.017;
const FLARE_PITCH = 0.06;

/** The height over the runway on the approach, `left` meters short of the
 *  touchdown point. The glide slope is aimed half a flare short of it, as a
 *  real one is aimed short of where the wheels meet the runway, and the
 *  flare rounds it off from there: a parabola that starts at the slope's
 *  own angle and only ever grows shallower, level at touchdown. */
export function glideHeight(left) {
    const slope = Math.tan((JET.glide * Math.PI) / 180);
    const F = JET.flare;
    if (left >= F) return slope * (left - F / 2);
    const t = Math.max(0, left) / F;
    return ((slope * F) / 2) * t * t;
}

/** The taxi from the end of the rollout into the hangar, as points of the
 *  airport's frame [a, b]: on along the runway to the exit, across to the
 *  taxiway, along it past the gates to the hangar, and in. */
export function taxiRoute() {
    const exit = AIRPORT.taxiway.exits.find((a) => a >= JET.rollout);
    const { hangar } = AIRPORT;
    return [[JET.rollout, 0], [exit, 0], [exit, AIRPORT.taxiway.b], [hangar.a, AIRPORT.taxiway.b], [hangar.a, hangar.b]];
}

/** The jet's speed over the ground on the approach, `left` meters short
 *  of the touchdown point: its own, and faster in the dash, ramped smoothly
 *  in and out. */
export function approachSpeed(left) {
    const { from, to, speed, ramp } = JET.dash;
    const ease = (t) => {
        const x = Math.min(1, Math.max(0, t));
        return x * x * (3 - 2 * x);
    };
    const inDash = ease((left - (to - ramp)) / ramp) * (1 - ease((left - from) / ramp));
    return JET.speed + (speed - JET.speed) * inDash;
}

/** The approach as a table, made once: `seconds[i]` into the approach the
 *  jet is `JET.from - i * step` meters short of the touchdown point. */
const APPROACH_STEP = 5;
let approachTable = null;
function approachSeconds() {
    if (!approachTable) {
        const n = Math.ceil(JET.from / APPROACH_STEP);
        const seconds = new Float64Array(n + 1);
        for (let i = 1; i <= n; i++) {
            const mid = JET.from - (i - 0.5) * APPROACH_STEP;
            seconds[i] = seconds[i - 1] + APPROACH_STEP / approachSpeed(mid);
        }
        approachTable = seconds;
    }
    return approachTable;
}

/** How far short of the touchdown point the jet is `into` seconds into the
 *  approach, meters. */
export function approachLeft(into) {
    const seconds = approachSeconds();
    const n = seconds.length - 1;
    if (into <= 0) return JET.from;
    if (into >= seconds[n]) return Math.max(0, JET.from - n * APPROACH_STEP);
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (seconds[mid] <= into) lo = mid;
        else hi = mid;
    }
    const k = (into - seconds[lo]) / (seconds[hi] - seconds[lo]);
    return Math.max(0, JET.from - (lo + k) * APPROACH_STEP);
}

/** How long each part of a flight takes, seconds: `approach`, `rollout` and
 *  `taxi`, and `total`. */
export function jetTimes() {
    const table = approachSeconds();
    const approach = table[table.length - 1];
    const rollout = (2 * JET.rollout) / (JET.speed + JET.taxiSpeed);
    const route = taxiRoute();
    let length = 0;
    for (let i = 1; i < route.length; i++) length += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    const taxi = length / JET.taxiSpeed;
    return { approach, rollout, taxi, total: approach + rollout + taxi };
}

/** How long a flight is in the air, seconds: the stretch worth drawing at
 *  the jet's own frame rate (main.js CONFIG.view.jetFps). */
export function jetCrossing() {
    return jetTimes().approach;
}

/** Flight `k`: when it sets out (seconds on the page's clock). */
export function jetFlight(k) {
    const late = k === 0 ? 0 : seeded(20260925 + k * 7919)() * JET.late;
    return { start: JET.first + k * JET.every + late };
}

/** The jet at a point of the airport's frame, `up` meters over its ground,
 *  heading along (da, db) with its nose `pitch` up. */
function jetAtPoint(a, b, up, da, db, pitch, phase, fast) {
    const [x, z] = airportPoint(a, b);
    return { x, y: airportY(up), z, yaw: airportYaw(da, db), pitch, speed: 1, phase, fast };
}

/**
 * The jet `into` seconds into a flight: where it is, which way it faces,
 * its pitch, and its `phase` ('approach', 'rollout' or 'taxi'), or null
 * before the flight and once it is in the hangar. `fast` is whether it is
 * moving quickly enough to be worth drawing at its own frame rate: in the
 * air and on the rollout, not taxiing.
 */
export function jetOnTrack(into) {
    const times = jetTimes();
    if (!(into >= 0) || into > times.total) return null;
    const ground = JET.wheels * JET.scale;
    if (into < times.approach) {
        const left = approachLeft(into);
        const flare = 1 - Math.min(1, left / JET.flare);
        const pitch = APPROACH_PITCH + (FLARE_PITCH - APPROACH_PITCH) * flare;
        return jetAtPoint(-left, 0, ground + glideHeight(left), 1, 0, pitch, 'approach', true);
    }
    let t = into - times.approach;
    if (t < times.rollout) {
        const slowing = (JET.speed - JET.taxiSpeed) / times.rollout;
        const a = JET.speed * t - 0.5 * slowing * t * t;
        const pitch = FLARE_PITCH * Math.max(0, 1 - t / 3);
        return jetAtPoint(a, 0, ground, 1, 0, pitch, 'rollout', true);
    }
    t -= times.rollout;
    const route = taxiRoute();
    let along = t * JET.taxiSpeed;
    for (let i = 1; i < route.length; i++) {
        const [a0, b0] = route[i - 1];
        const [a1, b1] = route[i];
        const length = Math.hypot(a1 - a0, b1 - b0);
        if (along <= length) {
            const k = along / length;
            return jetAtPoint(a0 + (a1 - a0) * k, b0 + (b1 - b0) * k, ground, a1 - a0, b1 - b0, 0, 'taxi', false);
        }
        along -= length;
    }
    // In the hangar, at its middle.
    const [a, b] = route[route.length - 1];
    return jetAtPoint(a, b, ground, 0, 1, 0, 'taxi', false);
}

/**
 * Every jet at `seconds`: an array of JET.fleet + 1, each null (not out) or
 * where it is (jetOnTrack) and in which `livery` (liveryOf). Flight k flies
 * jet k mod JET.fleet; the last is kept for one asked for by hand
 * (`called`, the start of it, main.js cornerOffice.jet), so it never takes
 * a jet a flight is using.
 */
export function jetsAt(seconds, called = null) {
    const slots = new Array(JET.fleet + 1).fill(null);
    const last = Math.floor((seconds - JET.first) / JET.every);
    for (let k = last - JET.fleet; k <= last; k++) {
        const at = jetOnTrack(seconds - jetFlight(k).start);
        if (at) slots[((k % JET.fleet) + JET.fleet) % JET.fleet] = { ...at, livery: liveryOf(k) };
    }
    if (called != null) {
        const at = jetOnTrack(seconds - called);
        slots[JET.fleet] = at && { ...at, livery: liveryOf(Math.floor(called)) };
    }
    return slots;
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
