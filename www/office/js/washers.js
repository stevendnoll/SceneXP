// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * washers.js - The window washers' gondolas on two towers across the street
 * (QA, 2026-09-29: "a couple of platforms hanging from cables along the
 * sides of a couple of buildings", no people).
 *
 * HOW A TOWER'S GLASS IS WASHED. A machine on the roof (a building
 * maintenance unit) runs along the roof's edge on a track, its jib reaching
 * out over the parapet, and from the jib's end two cables hold a gondola
 * against the glass. The crew works a drop at a time: down the face a floor
 * at a stop, squeegeeing each floor's panes before the next short descent,
 * then winched back up to the roof, and along the track to the next drop.
 * By night, in the rain and outside working hours the gondola is parked up
 * under the jib.
 *
 * ON THE SKY'S CLOCK. Like the ferries, the crews keep the visitor's own
 * hours (a pinned hour, or a day going by, runs them at its pace).
 *
 * WHICH TOWERS. The two with a face turned to the office that both the desk
 * and the window see (measured 2026-09-29): `at` finds each by the point
 * nearest its middle, and the gondola works that tower's top section, the
 * face toward the office (+z, east).
 *
 * Pure: a Date in, where each gondola is out. world.js hangs the meshes.
 */

import { cityTowers, sections, outline, WATER_Y } from './city.min.js';

/**
 * The crews. `at` is each tower's middle (x, z, meters); `hours` the
 * working day (clock hours); `width` the gondola's length along the glass,
 * and `stand` how far the jib holds it out from the glass (meters); `floor`
 * the height of a floor (city.js PANEL.floor), which is each stop;
 * `minutes` how long a drop takes down, back up, and along to the next;
 * `late` how many minutes after the start of the day each crew starts, so
 * the two are never in step; and `reach` the most of a face one drop goes
 * down. The working day is a whole number of drops, so a crew finishes
 * its last drop back up at the roof and parks where it will start next.
 */
export const WASHERS = {
    at: [[155, -355], [44, -339]],
    hours: [8, 17],
    width: 7,
    stand: 1.4,
    floor: 3.8,
    minutes: { down: 46, up: 7, across: 7 },
    late: [0, 23],
    reach: 110,
    // Where the gondola hangs when parked, under the parapet.
    parked: 2.4
};

/**
 * Each crew's tower and the face it works, in the room's frame: the face's
 * middle (`x`, `z`), `yaw` (the turn that takes the gondola's own +z out
 * from the glass), the face's `length`, the roof's height (`roof`, y in the
 * room's frame), and how far a drop goes down (`travel`, meters).
 */
export function washerFaces(towers = cityTowers()) {
    return WASHERS.at.map(([ax, az]) => {
        let best = towers[0];
        for (const t of towers) if (Math.hypot(t.x - ax, t.z - az) < Math.hypot(best.x - ax, best.z - az)) best = t;
        const secs = sections(best);
        const top = secs[secs.length - 1];
        const pts = outline(best, top.at);
        const xs = pts.map((p) => p[0]);
        const zs = pts.map((p) => p[1]);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        return {
            tower: best,
            x: (x0 + x1) / 2,
            z: Math.max(...zs),
            yaw: 0,
            length: x1 - x0,
            roof: WATER_Y + best.base + top.y1,
            travel: Math.min(WASHERS.reach, top.y1 - top.y0 - 6)
        };
    });
}

/** How many drops a face takes, and the middle of drop `k` along it (from
 *  the face's middle, meters). */
export function drops(face) {
    return Math.max(1, Math.floor((face.length - 2) / WASHERS.width));
}

export function dropAt(face, k) {
    const n = drops(face);
    return (k + 0.5 - n / 2) * WASHERS.width;
}

const smooth = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/** The order a crew works the drops in: across the face and back, so it
 *  never has far to go. */
function dropOf(cycle, n) {
    if (n === 1) return 0;
    const k = ((cycle % (2 * n)) + 2 * n) % (2 * n);
    return k < n ? k : 2 * n - 1 - k;
}

/**
 * Where crew `i`'s gondola is at `date`: `along` the face from its middle,
 * and `down` from the parapet (meters, so 0 is parked), and whether it is
 * `working`. Parked through the night, outside working hours and in the
 * rain (`raining` over a quarter), at the drop it would be at.
 */
export function washerAt(face, date, i = 0, raining = 0) {
    const n = drops(face);
    const { down: tDown, up: tUp, across: tAcross } = WASHERS.minutes;
    const cycle = tDown + tUp + tAcross;
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const m = (h - WASHERS.hours[0]) * 60 - WASHERS.late[i % WASHERS.late.length];
    const last = (WASHERS.hours[1] - WASHERS.hours[0]) * 60;
    // The crews go on round the tower day after day: the drops are counted
    // from a local day's start, so the count never turns in working hours.
    const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
    const perDay = Math.floor(last / cycle);
    if (m < 0) return { along: dropAt(face, dropOf(day * perDay, n)), down: 0, working: false };
    if (m >= perDay * cycle) return { along: dropAt(face, dropOf((day + 1) * perDay, n)), down: 0, working: false };
    const c = Math.floor(m / cycle);
    const along = dropAt(face, dropOf(day * perDay + c, n));
    if (raining > 0.25) return { along, down: 0, working: false };
    const u = m - c * cycle;
    if (u < tDown) {
        // Down a floor at a stop: most of each stop spent at the glass, the
        // last quarter of it lowering to the next floor.
        const floors = Math.max(1, Math.floor(face.travel / WASHERS.floor));
        const s = (u / tDown) * floors;
        const f = Math.floor(s);
        return { along, down: ((f + smooth((s - f - 0.75) / 0.25)) / floors) * face.travel, working: true };
    }
    if (u < tDown + tUp) return { along, down: face.travel * (1 - smooth((u - tDown) / tUp)), working: true };
    const next = dropAt(face, dropOf(day * perDay + c + 1, n));
    return { along: along + (next - along) * smooth((u - tDown - tUp) / tAcross), down: 0, working: true };
}
