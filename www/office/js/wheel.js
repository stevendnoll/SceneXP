// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * wheel.js - The big observation wheel on the waterfront (QA, 2026-09-29:
 * Steve, "a large ferris wheel ... on the Seattle waterfront since 2012 ...
 * now an iconic part of the downtown skyline").
 *
 * AFTER THE REAL ONE, NOT NAMED FOR IT. Its look follows the waterfront
 * wheel it is inspired by: enclosed gondolas, a white wheel of thin spokes
 * on an A-frame of legs, and colored lights on its rim and spokes by
 * night. The name is not used anywhere (as with the ferries' livery and
 * the Space Needle).
 *
 * LARGER THAN LIFE, AND SIMPLER. Built to the real one's 53 m (175 ft)
 * from its pier, it was some sixty pixels across from the desk; at twice
 * that it still read as small and "out in the water" (Steve, 2026-09-29).
 * So it is drawn `scale` times over from its deck up, about 133 m, as the
 * gulls and orcas are drawn larger than life to read from forty floors up,
 * with fewer gondolas and spokes than the real one's forty-two and
 * forty-two a face (Steve asked for fewer: at this size they crowd).
 * Everything below is at life size, in the wheel's own frame; fleet.js
 * scales it about the deck.
 *
 * WHERE THE DESK SEES IT (measured 2026-09-29 against the real meshes).
 * At life size every spot along the near waterfront is hidden behind the
 * towers but the ferry's own corridor, which is the ferry's, and the only
 * gap was 380 m out, where it looked adrift. At this size it clears the
 * waterfront's rooftops from the end of the pier two south of the ferry
 * dock (x -266), in against the buildings as the real one is at the end
 * of its pier: left of the printer and under the airport across the bay,
 * some 70% of its upper half in sight on a laptop and a wide screen (the
 * rest, and most of the lower half, behind the waterfront, which Steve
 * expected). Its face is turned a little off square to the office so it
 * has depth. An upright phone does not see it without turning.
 *
 * HOW A WHEEL LIKE IT RUNS. Stop and go while it boards: it moves one
 * gondola round to the platform, stops while people step out and in, and
 * moves the next. Then it turns without stopping for the ride, easing up
 * to speed and down again, and boards again. It opens at `opens` and
 * closes at `closes`, when its lights go out (QA, 2026-09-29: Steve, "stop
 * when the lights go out ... keep it going until 11pm"). Closing, it eases
 * to a stop over `stop` seconds wherever it is, and it starts the moment it
 * opens, boarding first, on a cycle of its own from then. (It used to run
 * on to its next stop at the platform: at a day going by's speed that was
 * hours of the sky's night, "spinning all night"; and a wheel that had
 * closed waited to open for a stop in a cycle that ran on without it, and
 * stood still for minutes after the day.)
 *
 * THE CLOCKS. Open or closed is the sky's hour. The turning is the
 * scenery's clock (world.js setLife `seconds`), as the traffic is: a day
 * going by hurries it thirty times, not two thousand. The lights keep the
 * visitor's own seconds, slow color changes and never a flash.
 *
 * Pure: numbers in, angles, seats and colors out. fleet.js builds it and
 * world.js places it.
 */

import { shoreZ } from './city.min.js';

/**
 * `x` the pier's place along the shore and `out` how far the wheel stands
 * from the shore; `turn` degrees its face is turned off square to the
 * office; `scale` how many times life it is drawn above its deck; `pier`
 * the wide deck its legs stand on, at the end of the waterfront pier: its
 * width, and how far it runs past the wheel and back toward the shore (at
 * that scale). Heights
 * are meters above the water: the pier's `deck` (world.js buildPiers lays
 * the waterfront's 3 m up, 2 m thick, and the wheel's a little over it), the boarding `platform`, the `hub`; `radius` is
 * the rim's, where the gondolas hang, `tube` the rim's thickness, `apart`
 * the two rims' distance along the axle (the gondolas hang between them).
 * `gondola` is a gondola's width, height and depth; `legs` the A-frame's
 * spread at the deck, along the face and along the axle.
 */
export const WHEEL = {
    x: -266,
    out: 110,
    turn: 14,
    scale: 2.5,
    pier: { width: 70, past: 26, back: 36 },
    deck: 4,
    platform: 5.6,
    hub: 32.6,
    radius: 23.8,
    tube: 0.8,
    apart: 4.8,
    gondolas: 24,
    gondola: { width: 2.8, height: 3.2, depth: 2.6 },
    legs: { spread: 13, splay: 6.5 },
    /** Spokes a face (lines a pixel wide: more reads as a gray disc). */
    spokes: 12,
    /** Open from `opens` to `closes`, hours of the sky's day. */
    opens: 10,
    closes: 23,
    /** Seconds it takes to come to rest when it closes. */
    stop: 12,
    /** Boarding: `steps` moves of one gondola, each `move` seconds, then
     *  `hold` seconds at the platform. The ride: `turns` whole turns in
     *  `ride` seconds, easing up and down over `ease`. */
    board: { steps: 6, move: 7, hold: 10 },
    ride: { turns: 2, seconds: 240, ease: 15 },
    /** The lights: lamps round each rim, and the shows, each `show`
     *  seconds, crossing into the next over `fade`. On from `dusk` (how
     *  dark, daylight.js cityLights) while it is open. */
    lamps: 96,
    show: 40,
    fade: 4,
    dusk: 0.25
};

/** Where it stands: its deck from `start` out to `end` past it (the
 *  waterfront's pier runs in to the shore), and the way its face is turned
 *  (radians, world.js's yaw: its axle along (sin, cos)). */
export function wheelSite(office = [0.35, 0.9], wheel = WHEEL) {
    const shore = shoreZ(wheel.x);
    const z = shore - wheel.out;
    const yaw = Math.atan2(office[0] - wheel.x, office[1] - z) + (wheel.turn * Math.PI) / 180;
    return { x: wheel.x, z, shore, start: z + wheel.pier.back, end: z - wheel.pier.past, yaw };
}

/** A height above the water on the wheel (its own frame, life size) as
 *  drawn: the deck stays put and all above it is `scale` times over. */
export function drawnHeight(y, wheel = WHEEL) {
    return wheel.deck + (y - wheel.deck) * wheel.scale;
}

/** Whether it is open at `date`, by the sky's hour. */
export function wheelOpen(date, wheel = WHEEL) {
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    return h >= wheel.opens && h < wheel.closes;
}

const smooth = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/** How far a move of `distance` over `seconds`, easing up and down over
 *  `ease` at either end, has gone at `t` (a steady speed between). */
function eased(t, distance, seconds, ease) {
    const v = distance / (seconds - ease);
    if (t <= 0) return 0;
    if (t < ease) return (v * t * t) / (2 * ease);
    if (t < seconds - ease) return v * (t - ease / 2);
    if (t < seconds) return distance - (v * (seconds - t) * (seconds - t)) / (2 * ease);
    return distance;
}

/** One cycle's parts: how long boarding takes, the whole cycle, one
 *  gondola's arc and the degrees a cycle turns. */
export function wheelCycle(wheel = WHEEL) {
    const { steps, move, hold } = wheel.board;
    const boarding = steps * (move + hold);
    const bay = 360 / wheel.gondolas;
    return { boarding, seconds: boarding + wheel.ride.seconds, bay, degrees: steps * bay + 360 * wheel.ride.turns };
}

/**
 * How far it has turned (degrees) after `t` seconds of running: boarding,
 * a gondola at a time with a stop between, then the ride's turns. The same
 * unbroken count from cycle to cycle, so nothing jumps.
 */
export function wheelTurn(t, wheel = WHEEL) {
    const c = wheelCycle(wheel);
    const n = Math.floor(t / c.seconds);
    let s = t - n * c.seconds;
    const base = n * c.degrees;
    const { steps, move, hold } = wheel.board;
    if (s < c.boarding) {
        const step = Math.floor(s / (move + hold));
        return base + (step + smooth((s - step * (move + hold)) / move)) * c.bay;
    }
    s -= c.boarding;
    const { turns, seconds, ease } = wheel.ride;
    return base + steps * c.bay + eased(s, 360 * turns, seconds, ease);
}

/** Whether it is moving at `t`: false only while it stands at the
 *  platform between boarding moves. */
export function wheelMoving(t, wheel = WHEEL) {
    const c = wheelCycle(wheel);
    const s = t - Math.floor(t / c.seconds) * c.seconds;
    if (s >= c.boarding) return true;
    const { move, hold } = wheel.board;
    return s - Math.floor(s / (move + hold)) * (move + hold) < move;
}

/** Where it is on arrival at `t`: standing at nought, and if it is open,
 *  already out on a ride (a visitor's first look is the wheel turning, not
 *  a minute and a half of boarding). */
export function wheelStart(open, t, wheel = WHEEL) {
    const into = wheelCycle(wheel).boarding;
    return { running: open, since: t - into, base: -wheelTurn(into, wheel), angle: 0, stopping: null };
}

/** How fast its own cycle turns it `s` seconds in (degrees a second). */
function speedAt(s, wheel) {
    const h = 0.05;
    const a = Math.max(0, s - h);
    return (wheelTurn(s + h, wheel) - wheelTurn(a, wheel)) / (s + h - a);
}

/**
 * The next moment of the wheel from the last: `{ running, since, base,
 * angle, stopping }` (degrees), its own cycle counted from `since` and
 * turned from `base`. Closing, it eases to rest over `stop` seconds from
 * the speed it had (`stopping` holds when, where and how fast), wherever it
 * is; opening, it starts at once, boarding, on a cycle of its own from
 * where it stood. While closed it holds its angle. For less motion
 * (`still`) it stands where it is.
 */
export function wheelStep(prev, open, t, still = false, wheel = WHEEL) {
    if (still) return prev;
    if (prev.stopping) {
        const { at, from, speed } = prev.stopping;
        const tau = Math.min(Math.max(0, t - at), wheel.stop);
        const angle = from + speed * (tau - (tau * tau) / (2 * wheel.stop));
        if (open) return { running: true, since: t, base: angle, angle, stopping: null };
        if (tau >= wheel.stop) return { ...prev, running: false, angle, stopping: null };
        return { ...prev, angle };
    }
    if (prev.running) {
        const s = t - prev.since;
        const angle = prev.base + wheelTurn(s, wheel);
        if (open) return { ...prev, angle };
        const speed = speedAt(s, wheel);
        if (speed <= 0) return { ...prev, running: false, angle };
        return { ...prev, angle, stopping: { at: t, from: angle, speed } };
    }
    if (open) return { running: true, since: t, base: prev.angle, angle: prev.angle, stopping: null };
    return prev;
}

/**
 * Where gondola `i` hangs when the wheel stands at `angle` degrees: its
 * pivot on the rim, `[x, y]` across the face and up from the hub, and its
 * middle half its height below (they hang level as the wheel turns).
 */
export function seatAt(i, angle, wheel = WHEEL) {
    const a = ((angle + (i * 360) / wheel.gondolas) * Math.PI) / 180;
    const pivot = [wheel.radius * Math.cos(a), wheel.radius * Math.sin(a)];
    return { pivot, middle: [pivot[0], pivot[1] - wheel.gondola.height / 2] };
}

/** An sRGB channel as a linear one (the lights' colors are made in sRGB). */
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A hue, saturation and value (0 to 1) as sRGB. */
export function hsv(h, s, v) {
    const f = (n) => {
        const k = (n + h * 6) % 6;
        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5), f(3), f(1)];
}

/**
 * The light shows, each a color for lamp `k` of `n` at `t` seconds, in
 * sRGB: the whole spectrum turning slowly round the rim; a swell of blues
 * and greens running round it like the bay; and every lamp one color,
 * drifting through the spectrum and breathing slowly. Nothing flashes: the
 * fastest change is the breath, once in six seconds.
 */
export const SHOWS = [
    (k, n, t) => hsv((k / n + t / 40) % 1, 0.8, 1),
    (k, n, t) => hsv(0.5 + 0.08 * Math.sin(2 * Math.PI * ((2 * k) / n - t / 12)), 0.75, 0.85 + 0.15 * Math.sin(2 * Math.PI * (k / n + t / 12))),
    (k, n, t) => hsv((t / 60) % 1, 0.7, 0.8 + 0.2 * Math.sin((2 * Math.PI * t) / 6))
];

/**
 * The lamps' colors at `t` seconds, linear RGB into `out` (3 a lamp, `n`
 * lamps round the rim): each show in turn, crossing into the next.
 */
export function wheelColors(t, n = WHEEL.lamps, out = new Float32Array(n * 3), wheel = WHEEL) {
    const at = t / wheel.show;
    const i = Math.floor(at);
    const into = (at - i) * wheel.show;
    const mix = smooth((into - (wheel.show - wheel.fade)) / wheel.fade);
    const a = SHOWS[((i % SHOWS.length) + SHOWS.length) % SHOWS.length];
    const b = SHOWS[(((i + 1) % SHOWS.length) + SHOWS.length) % SHOWS.length];
    for (let k = 0; k < n; k++) {
        const ca = a(k, n, t);
        const cb = mix > 0 ? b(k, n, t) : ca;
        for (let c = 0; c < 3; c++) out[k * 3 + c] = linear(ca[c] + (cb[c] - ca[c]) * mix);
    }
    return out;
}

/** Whether the lights are on: dark enough (daylight.js cityLights) and
 *  open. */
export function wheelLit(date, dark, wheel = WHEEL) {
    return dark > wheel.dusk && wheelOpen(date, wheel);
}
