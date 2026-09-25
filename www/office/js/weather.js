// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * weather.js - Rain on some days.
 *
 * EACH DAY HAS ITS OWN WEATHER, the same for every visitor on that date and
 * every visit that day: a seed made of the date decides whether it rains
 * and when. Rain is likelier in winter than in summer (Seattle's own
 * pattern: most winter days wet, few July ones). A wet day has one spell of
 * a few hours; the sky clouds over an hour or so before the rain comes and
 * clears an hour or so after it goes, and the rain itself builds and eases
 * rather than switching on. A spell that starts late runs on past midnight
 * into the next day.
 *
 * WHAT RAIN DOES, all from two numbers, `overcast` and `rain` (0 to 1): a
 * gray sky and a low gray deck over it, the sun's light and glow dimmed,
 * the stars and the moon hidden, more offices lit against the gloom (the
 * look, here), and in world.js the haze closing in (the mountains go first,
 * as they do), the water roughened, streaks falling past the window and
 * drops beaded on the glass. On the water the sailboats stay in and the
 * seaplane stays moored (life.js).
 *
 * Pure: a Date in, numbers and a look out.
 */

import { seeded } from './city.min.js';
import { dayOfYear, mix } from './daylight.min.js';

/**
 * The rules. `chance` is how likely a day is to be wet: `mean` plus `swing`
 * at midwinter and minus it at midsummer. A wet day's spell starts at an
 * hour in `start`, lasts `hours`, and rains at a `strength`; the clouds
 * gather `lead` hours before it, and it builds and eases over `ramp` hours.
 */
export const WEATHER = {
    seed: 20260929,
    chance: { mean: 0.35, swing: 0.25 },
    start: [0, 22],
    hours: [3, 10],
    strength: [0.45, 1],
    lead: 1.5,
    ramp: 0.75
};

/** How likely a date is to be wet: the season's share of rainy days. */
export function wetChance(date, weather = WEATHER) {
    const winter = Math.cos((2 * Math.PI * (dayOfYear(date) - 355)) / 365);
    return weather.chance.mean + weather.chance.swing * winter;
}

/**
 * Scramble a number into a seed. Neighboring seeds give the seeded source
 * nearly the same first numbers, so seeding each day with its date made
 * almost every day wet and moved the rain three hours later each day.
 */
export function mixSeed(n) {
    let h = n >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) % 2147483646 + 1;
}

/** A date's rain spell, in hours from its own midnight (it may end past
 *  24), or null for a dry day. The same for everyone on that date. */
export function daySpell(date, weather = WEATHER) {
    const key = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    const random = seeded(mixSeed(weather.seed + key));
    const roll = random();
    if (roll >= wetChance(date, weather)) return null;
    const pick = ([lo, hi]) => lo + random() * (hi - lo);
    const start = pick(weather.start);
    return { start, end: start + pick(weather.hours), strength: pick(weather.strength) };
}

/** 0 before `from`, 1 after `from + over`, smoothly between. */
function rise(h, from, over) {
    const t = Math.min(1, Math.max(0, (h - from) / over));
    return t * t * (3 - 2 * t);
}

/**
 * The weather at a moment: how overcast the sky is and how hard it rains,
 * each 0 to 1. `pin` ('rain' or 'clear') holds it for screenshots.
 */
export function weatherAt(date, pin = null, weather = WEATHER) {
    if (pin === 'rain') return { overcast: 1, rain: 1 };
    if (pin === 'clear') return { overcast: 0, rain: 0 };
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    let overcast = 0;
    let rain = 0;
    // Today's spell, and yesterday's in case it ran on past midnight.
    const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    for (const [day, offset] of [[date, 0], [yesterday, 24]]) {
        const spell = daySpell(day, weather);
        if (!spell) continue;
        const at = h + offset;
        const { start, end, strength } = spell;
        const { lead, ramp } = weather;
        rain = Math.max(rain, strength * Math.min(rise(at, start, ramp), 1 - rise(at, end - ramp, ramp)));
        overcast = Math.max(overcast, Math.min(rise(at, start - lead, lead), 1 - rise(at, end, lead)));
    }
    return { overcast: Math.max(overcast, rain), rain };
}

/** A gray as bright as `hex`, a little blue, as a rain sky is. */
export function grayOf(hex, k = 1) {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    const y = Math.min(255, (0.2126 * r + 0.7152 * g + 0.0722 * b) * k);
    const ch = (f) => Math.min(255, Math.round(y * f));
    return (ch(0.94) << 16) | (ch(0.97) << 8) | ch(1.04);
}

/**
 * A look (daylight.js `lighting`) under the weather: the sky and clouds
 * grayed, the sun and its glow dimmed, the stars and moon clouded out, the
 * room's light a little lower, more offices lit, and the weather itself
 * carried along for world.js.
 */
export function weathered(look, { overcast, rain }) {
    const g = overcast;
    return {
        ...look,
        skyTop: mix(look.skyTop, grayOf(look.skyBottom, 0.82), 0.9 * g),
        skyBottom: mix(look.skyBottom, grayOf(look.skyBottom, 0.9), 0.85 * g),
        clouds: mix(look.clouds, grayOf(look.clouds, 0.72), 0.8 * g),
        sun: look.sun * (1 - 0.7 * g),
        halo: look.halo * (1 - g),
        hemi: look.hemi * (1 - 0.25 * g),
        fill: look.fill * (1 - 0.2 * g),
        stars: look.stars * (1 - g),
        moonShine: look.moonShine * (1 - 0.9 * g),
        cityLights: Math.min(1, look.cityLights + 0.3 * g),
        overcast,
        rain
    };
}

/**
 * The rain falling past the window: `count` streaks in a box of air outside
 * the office's corner, in the room's frame (the room's own walls hide any
 * that fall inside it, since the room is drawn over the city). Each streak
 * is [x, y, z, phase].
 */
export const RAIN = { count: 1400, box: { x: [-40, 70], y: [-45, 30], z: [-100, 20] }, fall: 9, length: 1.6, slant: 0.18 };

export function rainStreaks(rain = RAIN, seed = 20260930) {
    const random = seeded(seed);
    const { x, y, z } = rain.box;
    const pick = ([lo, hi]) => lo + random() * (hi - lo);
    return Array.from({ length: rain.count }, () => [pick(x), pick(y), pick(z), random()]);
}

/**
 * Every streak's two ends at `seconds`, falling at `fall` meters a second
 * with a little wind in them, wrapping from the bottom of the box back to
 * its top, written into `out` (six numbers a streak).
 */
export function streakPositions(streaks, seconds, rain = RAIN, out = new Float32Array(streaks.length * 6)) {
    const [lo, hi] = rain.box.y;
    const span = hi - lo;
    streaks.forEach(([x, y, z, phase], i) => {
        const dropped = (((hi - y) + seconds * rain.fall + phase * span) % span + span) % span;
        const top = hi - dropped;
        const at = i * 6;
        out[at] = x;
        out[at + 1] = top;
        out[at + 2] = z;
        out[at + 3] = x;
        out[at + 4] = top - rain.length;
        out[at + 5] = z + rain.length * rain.slant;
    });
    return out;
}
