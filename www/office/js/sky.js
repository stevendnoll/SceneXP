// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sky.js - What is up in the sky: the sun, the moon, the stars and the
 * clouds, and the day going by.
 *
 * THE SUN KEEPS daylight.js's HOURS. daylight.js says when the sun rises and
 * sets on the visitor's own clock (a day length for about 40 degrees north,
 * so it feels right almost anywhere). The sun here walks the sky of that
 * latitude, rising in the east, crossing the south, setting in the west,
 * and it touches the horizon exactly at daylight.js's sunrise and sunset,
 * so the light and the sky never disagree. Looking west, the visitor sees it
 * go down behind the mountains.
 *
 * THE MOON KEEPS ITS OWN MONTH. Its age comes from a known new moon and the
 * length of a lunar month, so tonight's moon is (near enough) tonight's
 * moon: it trails the sun by its age, a full moon rises at sunset opposite
 * it, and the side of its disc that is lit always faces the sun.
 *
 * THE STARS TURN about the pole once a sidereal day, east to west, and show
 * only once the sky is dark.
 *
 * A CLOUD DECK, SEEN FROM BELOW. The clouds are one wide, flat layer high
 * over the city and the bay, painted with broken cumulus and seen from
 * underneath. From the 40th floor the near clouds sit high in the window
 * and the far ones crowd down toward the mountains in perspective, paler
 * with each kilometer of haze, which is how a real cloud deck reads from
 * the ground. Blue sky shows between them. Because the deck is part of the
 * world, the water and the glass reflect it too.
 *
 * The deck is one tile of cloud painted once (paint.js drawClouds) and
 * repeated. The puffs that make it are clustered into cells, stretched a
 * little along the wind, and every puff near an edge is painted again on
 * the far side, so the tile repeats without a seam.
 *
 * Pure: numbers in and out. world.js builds the deck and colors it for the
 * hour (daylight.js `clouds`).
 */

import { seeded, ridgeAt } from './city.min.js';
import { sunTimes, dayOfYear } from './daylight.min.js';

const DEG = Math.PI / 180;
const HOUR_MS = 60 * 60 * 1000;

/** The latitude the sky keeps: the one daylight.js's day lengths are for. */
export const LATITUDE = 40;

/** The celestial pole, in the room's frame (north is +x, up is +y). */
export const POLE = [Math.cos(LATITUDE * DEG), Math.sin(LATITUDE * DEG), 0];

/**
 * THE SUNSET IS FRAMED (QA, 2026-09-29: "I'm still not seeing the sun set in
 * the west"; Steve chose to frame it). The true sun goes down behind a tower
 * from both the desk and the window: every station sees the mountains' crest
 * only from about 2 degrees south of west to 9 north (measured 2026-09-29),
 * and on the 28th of September the true sun meets the crest 8 degrees south.
 * So the sun's path keeps a fifth of its seasonal swing (`swing`) and is
 * turned `turn` degrees north, and it meets the crest between about 2
 * degrees south and 10 north every day of the year, down the office's
 * street. Its hours are still daylight.js's: it touches the horizon at the
 * sunset the clock gives. The same license as the jets drawn larger than
 * life.
 */
export const SUNSET_FRAME = { swing: 0.2, turn: 8.5 };

/** A vector in the room's frame turned `deg` degrees about the vertical,
 *  west (-z) toward north (+x). */
export function turnNorth([x, y, z], deg) {
    const a = deg * DEG;
    return [x * Math.cos(a) - z * Math.sin(a), y, z * Math.cos(a) + x * Math.sin(a)];
}

/** A lunar month, in days, and a new moon to count it from. */
export const SYNODIC_DAYS = 29.530588853;
export const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** A sidereal day, in milliseconds: the stars' turn. */
const SIDEREAL_MS = 86164090.5;

/** The sun's declination on a date, in radians: +23.44 degrees at the June
 *  solstice, -23.44 at December's (the same swing daylight.js uses). */
export function declination(date) {
    return 23.44 * DEG * Math.cos((2 * Math.PI * (dayOfYear(date) - 172)) / 365);
}

/**
 * Where something on the sky is, as a unit vector in the room's frame, from
 * its hour angle (radians west of the meridian) and declination, at
 * `latitude` degrees north.
 */
export function direction(hourAngle, dec, latitude = LATITUDE) {
    const phi = latitude * DEG;
    const east = -Math.cos(dec) * Math.sin(hourAngle);
    const north = Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(hourAngle);
    const up = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle);
    return [north, up, east];
}

/** The clock hour of a Date, with its minutes, seconds and milliseconds, so a
 *  day going by moves smoothly. */
function clockHours(date) {
    return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 + date.getMilliseconds() / HOUR_MS;
}

/** How old the moon is at a moment: 0 new, 0.5 full, back to 1. */
export function moonAge(date) {
    const days = (date.getTime() - NEW_MOON) / (24 * HOUR_MS);
    return (((days / SYNODIC_DAYS) % 1) + 1) % 1;
}

const unitAngle = (a, b) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

/**
 * The sky at a moment: where the sun and moon are (unit vectors), their
 * heights above the horizon (radians), the moon's age and its angle from
 * the sun (which is its phase: 0 new, pi full), and how far the stars have
 * turned.
 */
export function skyAt(date) {
    const { sunrise, sunset } = sunTimes(date);
    const noon = (sunrise + sunset) / 2;
    const halfDay = (sunset - sunrise) / 2;
    const dec = declination(date);
    const phi = LATITUDE * DEG;
    // The sun's own path, framed (SUNSET_FRAME).
    const sunDec = dec * SUNSET_FRAME.swing;
    // The hour angle at which the sun meets the horizon, so the sun's hours
    // can be stretched to meet daylight.js's sunrise and sunset exactly.
    const setting = Math.acos(Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(sunDec))));
    const h = clockHours(date);
    const sun = turnNorth(direction(((h - noon) / halfDay) * setting, sunDec), SUNSET_FRAME.turn);
    const age = moonAge(date);
    const moon = direction(((h - noon) / 12) * Math.PI - 2 * Math.PI * age, dec * Math.cos(2 * Math.PI * age));
    const turn = ((((date.getTime() / SIDEREAL_MS) % 1) + 1) % 1) * 2 * Math.PI;
    return {
        sun, moon, age, turn,
        sunHeight: Math.asin(sun[1]),
        moonHeight: Math.asin(moon[1]),
        elongation: unitAngle(sun, moon)
    };
}

/** A direction's bearing in degrees north of west (the room's frame). */
export function bearingOf([north, , east]) {
    return Math.atan2(north, -east) / DEG;
}

/** The sun's disc as drawn, degrees across (world.js DISCS.sun). */
const SUN_DISC = 0.9;

/**
 * How much of the sun's disc stands clear of the ranges and the horizon, 0
 * to 1 (city.js ridgeAt): what is left of its direct light, its glitter on
 * the water and its glare. Down behind the mountains the sky still glows,
 * but the city is in their shadow.
 */
export function sunClear(sky, ridge = ridgeAt) {
    const crest = Math.max(0, ridge(bearingOf(sky.sun)));
    const over = sky.sunHeight / DEG - crest;
    return Math.min(1, Math.max(0, over / SUN_DISC + 0.5));
}

/**
 * Where the outside's one directional light comes from: the sun while it
 * is up or just down (it is still the sky's light at dusk), the moon by
 * night when it is up, and otherwise from high overhead. Never lower than a
 * few degrees, so the city is never lit from under the ground.
 */
export function lightFrom(sky) {
    const floor = Math.sin(4 * DEG);
    let from = [0.3, 1, 0.2];
    if (sky.sunHeight > -6 * DEG) from = sky.sun;
    else if (sky.moonHeight > 0) from = sky.moon;
    let [x, y, z] = from;
    if (y < floor) {
        const flat = Math.hypot(x, z) || 1;
        const k = Math.sqrt(1 - floor * floor) / flat;
        x *= k;
        z *= k;
        y = floor;
    }
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
}

/**
 * How to hang a disc (the moon) at direction `m` so it faces the eye and its
 * lit side points at the sun `s`: its right (toward the sun, across the
 * face), up and normal (toward the eye).
 */
export function discBasis(m, s) {
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const along = (v) => {
        const k = dot(v, m);
        const r = v.map((c, i) => c - k * m[i]);
        const len = Math.hypot(...r);
        return len > 1e-6 ? r.map((c) => c / len) : null;
    };
    const right = along(s) || along([0, 1, 0]) || along([1, 0, 0]);
    const normal = m.map((c) => -c);
    const up = [
        normal[1] * right[2] - normal[2] * right[1],
        normal[2] * right[0] - normal[0] * right[2],
        normal[0] * right[1] - normal[1] * right[0]
    ];
    return { right, up, normal };
}

/** The stars, as [x, y, z, brightness]: spread evenly over the whole sky
 *  (the ones below the horizon are under the ground), as they stand when
 *  the turn is zero. */
export function starField(count = 420, seed = 20260926) {
    const random = seeded(seed);
    const stars = [];
    for (let i = 0; i < count; i++) {
        const y = random() * 2 - 1;
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(1 - y * y);
        stars.push([r * Math.cos(a), y, r * Math.sin(a), 0.35 + 0.65 * random() ** 3]);
    }
    return stars;
}

/**
 * A day going by: from `from` (milliseconds) through 24 hours in `seconds`,
 * smoothly, or, for a visitor who asked for less motion, in whole hours,
 * each held the same time. `step(delta)` moves it on and says where it is.
 */
export function dayLapse(from, { seconds = 30, stepped = false } = {}) {
    let elapsed = 0;
    return {
        step(delta) {
            elapsed = Math.min(seconds, elapsed + Math.max(0, delta));
            const hours = (elapsed / seconds) * 24;
            const shown = stepped && elapsed < seconds ? Math.floor(hours) : hours;
            return { at: from + shown * HOUR_MS, done: elapsed >= seconds };
        }
    };
}

/**
 * The deck: its height above the water, how far it spreads, how many
 * meters one painted tile covers, the tile's pixels, and how many cloud
 * cells a tile holds.
 *
 * Over the mountains' tops (QA, 2026-09-25): at 2.8 km it cut across the
 * new ranges, whose peaks stand near 3.9 km, and hid their upper halves.
 * Raised to 4.8 km with its span and its tile grown in the same proportion
 * (and the wind with them, life.js), the sky looks just as it did from
 * the office, every puff at the same angle, and the ranges stand clear
 * under it.
 */
export const CLOUDS = { altitude: 4800, span: 411000, tile: 24000, size: 1024, cells: 22, seed: 20260925 };

/**
 * The puffs of one tile, as [u, v, radius, alpha] in tile units (0 to 1):
 * clustered into `cells` clouds, each a few dozen puffs, wider along the
 * wind than across it, heavier in the middle.
 */
export function cloudPuffs(clouds = CLOUDS) {
    const random = seeded(clouds.seed);
    const puffs = [];
    for (let c = 0; c < clouds.cells; c++) {
        const cu = random();
        const cv = random();
        const size = 0.03 + random() * 0.05;
        const count = 10 + Math.floor(random() * 16);
        for (let p = 0; p < count; p++) {
            const angle = random() * Math.PI * 2;
            const out = Math.sqrt(random());
            const u = cu + Math.cos(angle) * out * size * 1.8;
            const v = cv + Math.sin(angle) * out * size;
            const radius = size * (0.35 + random() * 0.4) * (1 - out * 0.4);
            puffs.push([((u % 1) + 1) % 1, ((v % 1) + 1) % 1, radius, 0.55 + random() * 0.35]);
        }
    }
    return puffs;
}

/**
 * Every place a puff is painted: itself, and a copy across each edge it
 * crosses, so the tile's edges meet.
 */
export function wrappedPuffs(puffs) {
    const out = [];
    for (const [u, v, r, a] of puffs) {
        for (const du of [-1, 0, 1]) {
            for (const dv of [-1, 0, 1]) {
                const x = u + du;
                const y = v + dv;
                if (x + r < 0 || x - r > 1 || y + r < 0 || y - r > 1) continue;
                out.push([x, y, r, a]);
            }
        }
    }
    return out;
}

/** How much of the sky the deck covers: the share of a grid of points that
 *  lie within some puff. */
export function cloudCover(puffs, n = 64) {
    const all = wrappedPuffs(puffs);
    let covered = 0;
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            const v = (j + 0.5) / n;
            if (all.some(([x, y, r]) => Math.hypot(u - x, v - y) < r)) covered++;
        }
    }
    return covered / (n * n);
}
