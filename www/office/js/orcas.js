// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * orcas.js - A pod of orcas visiting the bay now and then (QA, 2026-09-29:
 * Steve, "I like the orcas idea, please feel free to implement").
 *
 * HOW AN ORCA BREATHES. A traveling or foraging orca spends most of its
 * time under the surface and comes up in bouts: a few breaths some seconds
 * apart, then a long dive. Each breath is a roll: the head breaks the
 * surface and the blow goes up (a bushy spout a few meters tall that hangs
 * and drifts), then the back arches over, the tall dorsal fin rising and
 * sliding forward and down as the animal pitches nose down again, and it
 * is gone. The pod keeps loosely together, the animals a little out of
 * step, and now and then one breaches: out of the water in a leap, over on
 * its side, and a splash.
 *
 * WHERE THE OFFICE LOOKS. They mill about down the office's own street, x
 * 60 to 260 and 1.4 to 2.3 km out, the one stretch of the near water both
 * the desk and the window see at the surface (measured 2026-09-29).
 *
 * TRUE SCALE IS A PIXEL. A bull's fin is 1.8 m tall, a pixel at two
 * kilometers. So the naked eye sees them `scale` times life, and the
 * binoculars at life size (world.js setTrueScale), as the gulls are.
 *
 * NOW AND THEN, AND SOON. A visit comes every `every` seconds on the
 * visitor's own clock, the first `first` seconds after the page opens, so
 * a visitor who stays a minute is likely to see one. Real seconds, like
 * the gulls: a day going by does not hurry a breath.
 *
 * Pure: numbers in, poses out. world.js and fleet.js draw them.
 */

import { seeded } from './city.min.js';

/**
 * `area`: where they mill (room frame, meters); `visit`: seconds between
 * visits, the first one's start, and how long one lasts; `pod`: how many,
 * and how far apart they keep; `speed`, meters a second; `bout`: breaths
 * in a bout, seconds between breaths, and the dive after; `roll` how long a
 * breath's arc takes; `spout` how tall the blow stands (meters, life size)
 * and how long it hangs; `breach`: the chance each bout ends in one, and
 * how long it takes; `length` an orca's, meters; `scale` for the naked
 * eye.
 */
export const ORCAS = {
    area: { x: [60, 260], z: [-2300, -1400] },
    visit: { every: 1200, first: 25, length: 420 },
    pod: { count: 4, apart: 22 },
    speed: 2.2,
    bout: { breaths: [3, 5], between: [5, 9], dive: [35, 70] },
    roll: 2.6,
    spout: { height: 3.5, seconds: 2.2 },
    breach: { chance: 0.18, seconds: 2.4 },
    length: 7.5,
    scale: 4,
    seed: 20260930
};

/** Each orca's own numbers, drawn once: the first is the bull, with the
 *  tall fin. */
let podMade = null;
export function pod() {
    if (!podMade) {
        const random = seeded(ORCAS.seed);
        podMade = Array.from({ length: ORCAS.pod.count }, (_, i) => ({
            i,
            bull: i === 0,
            // Where it keeps in the loose group, across and along.
            offset: [(random() * 2 - 1) * ORCAS.pod.apart, (random() * 2 - 1) * ORCAS.pod.apart],
            // How far out of step its breathing is.
            lag: random() * 4,
            seed: Math.floor(random() * 1e9)
        }));
    }
    return podMade;
}

/** Which visit `t` seconds falls in, and how far into it, or null between
 *  visits. */
export function visitAt(t) {
    const { every, first, length } = ORCAS.visit;
    if (t < first) return null;
    const k = Math.floor((t - first) / every);
    const into = t - first - k * every;
    return into < length ? { k, into } : null;
}

/** A small hash of whole numbers, 0 to 1. */
function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where the pod's middle is `into` seconds into visit `k`: wandering the
 *  area on a slow curve of its own, at about `speed`. */
export function podCenter(k, into) {
    const { x: [x0, x1], z: [z0, z1] } = ORCAS.area;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const ax = (x1 - x0) / 2 - ORCAS.pod.apart;
    const az = (z1 - z0) / 2 - ORCAS.pod.apart;
    // A figure the length of the area, run at a pace that makes it about
    // `speed` on average (its mean rate is about half its fastest).
    const phase = hash(k, 7) * Math.PI * 2;
    const w = ORCAS.speed / (0.5 * Math.hypot(2 * ax, az));
    const a = phase + w * into;
    return [cx + ax * Math.sin(a * 2 + hash(k, 3) * 3), cz + az * Math.sin(a)];
}

/**
 * Where an orca is in its breathing at `into` seconds of visit `k`:
 * `{ breath, p, breach }`: `breath` true while it is up (`p` 0 to 1 through
 * the roll, or the leap when `breach`), false under water between.
 */
export function breathing(o, k, into) {
    const { bout, roll, breach } = ORCAS;
    let t = into - o.lag;
    let n = 0;
    // Bout after bout, each drawn from the orca's own hash.
    while (t >= 0 && n < 50) {
        const breaths = bout.breaths[0] + Math.floor(hash(o.seed + k, n) * (bout.breaths[1] - bout.breaths[0] + 1));
        const between = bout.between[0] + hash(o.seed + k, n + 100) * (bout.between[1] - bout.between[0]);
        const dive = bout.dive[0] + hash(o.seed + k, n + 200) * (bout.dive[1] - bout.dive[0]);
        const leaps = hash(o.seed + k, n + 300) < breach.chance;
        const upTime = breaths * between;
        if (t < upTime) {
            const b = Math.floor(t / between);
            const within = t - b * between;
            // The last breath of a bout may be a breach instead.
            const leap = leaps && b === breaths - 1;
            const long = leap ? breach.seconds : roll;
            return within < long ? { breath: true, p: within / long, breach: leap } : { breath: false };
        }
        t -= upTime + dive;
        n++;
    }
    return { breath: false };
}

/**
 * An orca's pose at `t` seconds (the visitor's own), or null between
 * visits: `{ x, y, z, yaw, pitch, roll, spout, splash }` in the room's
 * frame, `y` from the water up (its middle), `spout` 0 to 1 through the
 * blow's life (null when there is none), `splash` the same for a breach's
 * landing. Life size; world.js scales it.
 */
export function orcaPose(o, t) {
    const visit = visitAt(t);
    if (!visit) return null;
    const { k, into } = visit;
    const c0 = podCenter(k, into - 0.5);
    const c1 = podCenter(k, into + 0.5);
    const heading = Math.atan2(c1[0] - c0[0], c1[1] - c0[1]);
    const [cx, cz] = podCenter(k, into);
    // Its place in the group, turned with the pod's heading.
    const [ox, oz] = o.offset;
    const x = cx + ox * Math.cos(heading) + oz * Math.sin(heading);
    const z = cz - ox * Math.sin(heading) + oz * Math.cos(heading);
    const yaw = Math.atan2(-(c1[0] - c0[0]), -(c1[1] - c0[1]));
    const b = breathing(o, k, into);
    const L = ORCAS.length;
    let y = -3;
    let pitch = 0;
    let roll = 0;
    let spout = null;
    let splash = null;
    if (b.breath && !b.breach) {
        // The roll: up with the nose raised, over, and down nose first. At
        // its top the back and the fin stand clear of the water.
        const s = Math.sin(Math.PI * b.p);
        y = -1.4 + 1.55 * s;
        pitch = 0.32 * Math.cos(Math.PI * b.p);
        if (b.p < ORCAS.spout.seconds / ORCAS.roll) spout = b.p / (ORCAS.spout.seconds / ORCAS.roll);
    } else if (b.breach) {
        // Out in a leap, over onto its side, and back in with a splash.
        const s = Math.sin(Math.PI * b.p);
        y = -L * 0.6 + L * 1.05 * s;
        pitch = 1.1 * Math.cos(Math.PI * b.p);
        roll = 1.3 * b.p;
        if (b.p > 0.8) splash = (b.p - 0.8) / 0.2;
    } else if (!b.breath) {
        // Under: out of sight, a little down.
        y = -4;
    }
    return { x, y, z, yaw, pitch, roll, spout, splash, up: b.breath };
}
