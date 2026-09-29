// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fireworks.js - Fireworks over the bay, for what the office celebrates
 * (celebrate.js): one shell for an application sent, a volley for the
 * week's goal, and the whole show for an offer.
 *
 * WHERE THE DESK LOOKS. Fired from a barge out on the water down the
 * office's own street (`site`), the one stretch of the bay every station
 * and screen sees, and burst a little above the office's own height, so
 * they flower in front of the island and the mountains rather than over the
 * roof.
 *
 * A SHELL IS A ROCKET AND A BURST. The rocket climbs on a slowing arc with
 * a spark at its head; at the top it breaks into `count` stars thrown out
 * evenly over a sphere, each slowed by the air (`drag`) and falling
 * (gravity), fading as it burns out, with a little twinkle at the end.
 *
 * ON THE VISITOR'S OWN SECONDS, like the gulls: a show is an event, not
 * scenery, and a day going by does not hurry it.
 *
 * Pure: numbers in, positions and colors out. world.js draws them.
 */

import { seeded } from './city.min.js';

/**
 * `site`: where the barge lies (degrees north of west, meters out) and how
 * far either side of it the shells range; `height` how high they break
 * over the water (the office's eye is 195 m up); `rise` the rocket's climb,
 * seconds; `burst`: how many stars, how fast they are thrown (meters a
 * second), how long they burn, the air's drag (per second) and gravity;
 * `shows`: how many shells each celebration fires, and the seconds between
 * them; `colors`, the stars' (linear RGB, bright).
 */
export const FIREWORKS = {
    site: { bearing: 8, out: 1600, spread: 150 },
    height: [240, 330],
    rise: 1.7,
    burst: { count: 90, speed: [60, 90], life: 2.8, drag: 0.9, gravity: 9.8 },
    shows: { applied: { shells: 1, gap: 0 }, goal: { shells: 6, gap: 0.8 }, offer: { shells: 16, gap: 0.6 } },
    colors: [[1, 0.78, 0.35], [1, 1, 1], [1, 0.3, 0.25], [0.35, 0.75, 1], [0.45, 1, 0.5], [0.95, 0.5, 1]],
    seed: 20260929
};

/** How many shells can be in the air at once: the most any show fires. */
export const MAX_SHELLS = Math.max(...Object.values(FIREWORKS.shows).map((s) => s.shells));

/**
 * The shells a celebration fires (`kind`, celebrate.js), `n` numbering the
 * show so no two look alike: each `{ at, x, z, height, color, speed, seed }`,
 * `at` its launch, seconds from the start. The last shell of a big show is
 * gold and larger: the finale.
 */
export function showFor(kind, n = 0) {
    const show = FIREWORKS.shows[kind] || FIREWORKS.shows.applied;
    const random = seeded(FIREWORKS.seed + n * 101 + kind.length);
    const { bearing, out, spread } = FIREWORKS.site;
    const a = (bearing * Math.PI) / 180;
    const cx = Math.sin(a) * out;
    const cz = -Math.cos(a) * out;
    // Across the line of sight, so the shells spread over the frame.
    const across = [Math.cos(a), Math.sin(a)];
    const [lo, hi] = FIREWORKS.height;
    const [s0, s1] = FIREWORKS.burst.speed;
    return Array.from({ length: show.shells }, (_, i) => {
        const finale = show.shells > 1 && i === show.shells - 1;
        const side = (random() * 2 - 1) * spread * (show.shells > 1 ? 1 : 0.2);
        return {
            at: i * show.gap + (finale ? show.gap : 0),
            x: cx + across[0] * side,
            z: cz + across[1] * side,
            height: finale ? hi : lo + random() * (hi - lo),
            color: finale ? FIREWORKS.colors[0] : FIREWORKS.colors[Math.floor(random() * FIREWORKS.colors.length)],
            speed: finale ? s1 * 1.25 : s0 + random() * (s1 - s0),
            seed: Math.floor(random() * 1e9)
        };
    });
}

/** How long a shell lasts from its launch: the climb and the burn. */
export const SHELL_SECONDS = FIREWORKS.rise + FIREWORKS.burst.life;

/** Directions spread evenly over a sphere (a Fibonacci lattice), turned by
 *  the shell's own seed so no two bursts share a pattern. */
function starDirections(count, seed) {
    const turn = (seed % 1000) / 1000 * Math.PI * 2;
    const out = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - (2 * (i + 0.5)) / count;
        const r = Math.sqrt(1 - y * y);
        const t = i * golden + turn;
        out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
    }
    return out;
}

const directionsMade = new Map();
function directionsFor(seed) {
    if (!directionsMade.has(seed)) directionsMade.set(seed, starDirections(FIREWORKS.burst.count, seed));
    if (directionsMade.size > 64) directionsMade.delete(directionsMade.keys().next().value);
    return directionsMade.get(seed);
}

/**
 * Where a shell's lights are `t` seconds after its launch, written into
 * `out` (x, y, z a light) and `rgba` (color and alpha a light) from light
 * `k`, one for the rocket and `burst.count` for the stars; `y0` is the
 * water's height. A light not burning is given alpha 0. Returns the next
 * free light.
 */
export function shellLights(shell, t, y0, out, rgba, k = 0) {
    const { rise, burst } = FIREWORKS;
    const top = y0 + shell.height;
    const put = (x, y, z, c, alpha) => {
        out[k * 3] = x;
        out[k * 3 + 1] = y;
        out[k * 3 + 2] = z;
        rgba[k * 4] = c[0];
        rgba[k * 4 + 1] = c[1];
        rgba[k * 4 + 2] = c[2];
        rgba[k * 4 + 3] = alpha;
        k++;
    };
    const rocket = [1, 0.85, 0.6];
    // The rocket: up on a slowing climb, from the water to the top.
    if (t >= 0 && t < rise) {
        const f = t / rise;
        put(shell.x, y0 + shell.height * (1 - (1 - f) * (1 - f)), shell.z, rocket, 1);
    } else {
        put(shell.x, top, shell.z, rocket, 0);
    }
    const tb = t - rise;
    const dirs = directionsFor(shell.seed);
    const alive = tb >= 0 && tb < burst.life;
    // Thrown out and slowed by the air: v/k (1 - e^(-kt)); and falling.
    const reach = alive ? (shell.speed / burst.drag) * (1 - Math.exp(-burst.drag * tb)) : 0;
    const fall = alive ? 0.5 * burst.gravity * tb * tb * 0.6 : 0;
    const fade = alive ? Math.max(0, 1 - tb / burst.life) : 0;
    for (let i = 0; i < dirs.length; i++) {
        const [dx, dy, dz] = dirs[i];
        // The twinkle at the end of the burn, star by star.
        const flicker = fade < 0.35 ? 0.55 + 0.45 * Math.sin(tb * 40 + i * 2.1) : 1;
        put(shell.x + dx * reach, top + dy * reach - fall, shell.z + dz * reach, shell.color, alive ? Math.min(1, fade * 1.6) * flicker : 0);
    }
    return k;
}
