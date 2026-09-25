// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * daylight.js - The light through the windows, from the visitor's own clock.
 *
 * The office keeps the visitor's hours: a bright city at noon, a warm dusk
 * at six, and at night the lamp on the desk and the lit windows across the
 * street. It knows no place, so the sun keeps a mid-latitude day (about 40
 * degrees north): up near 5:30 and down near 8:20 in June, 7:10 to 4:45 in
 * December. Solar noon is an hour later on the clock while daylight saving
 * is in force, which the Date itself can say. Close enough to feel right
 * almost anywhere people will visit from, and nothing is asked of the
 * visitor to get it.
 *
 * Pure: a Date in, numbers and colors out. main.js applies them and repaints
 * the city only when `key` changes, a few times an hour at most.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day of the year, 0 on January 1. */
export function dayOfYear(date) {
    return Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(date.getFullYear(), 0, 1)) / DAY_MS);
}

/** Whether the clocks are on daylight saving time at `date`: its offset is
 *  smaller than the larger of January's and July's. */
export function isDaylightSaving(date) {
    const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    return date.getTimezoneOffset() < Math.max(jan, jul);
}

/** Sunrise and sunset as local clock hours. */
export function sunTimes(date) {
    const swing = Math.cos((2 * Math.PI * (dayOfYear(date) - 172)) / 365);
    const halfDay = 6.1 + 1.3 * swing;
    const noon = 11.95 + (isDaylightSaving(date) ? 1 : 0);
    return { sunrise: noon - halfDay, sunset: noon + halfDay };
}

const smooth = (x) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
};

/** Blend two 0xRRGGBB colors. */
export function mix(a, b, t) {
    const k = Math.min(1, Math.max(0, t));
    const ch = (c, s) => (c >> s) & 255;
    const one = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (one(16) << 16) | (one(8) << 8) | one(0);
}

/** "#rrggbb" for a canvas. */
export function css(hex) {
    return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * How light it is: `daylight` 0 (night) to 1 (full day), easing over an hour
 * around sunrise and sunset, and which part of the day it is. `hour` pins a
 * time for screenshots and tests.
 */
export function lightAt(date, hour = null) {
    const h = hour == null ? date.getHours() + date.getMinutes() / 60 : hour;
    const { sunrise, sunset } = sunTimes(date);
    const daylight = Math.min(smooth((h - sunrise + 0.5) / 1), smooth((sunset + 0.5 - h) / 1));
    let phase = 'day';
    if (daylight <= 0) phase = 'night';
    else if (daylight < 1) phase = h < 12 ? 'dawn' : 'dusk';
    return { hour: h, daylight, phase, key: `${phase}:${Math.round(daylight * 8)}` };
}

const NIGHT = { top: 0x0b1530, bottom: 0x2a2f4a, sun: 0x9fb4ff, clouds: 0x2c3044 };
// Dawn and dusk. The horizon all round is a soft rose-gray (the far side
// of a sunrise is not golden); the gold is the sun's own glow, which
// world.js paints into the sky near the sun.
const GOLD = { top: 0x4f79b3, bottom: 0xcdbfc6, sun: 0xffb36b, clouds: 0xffbf9c };
const DAY = { top: 0x7fb2dd, bottom: 0xe3ecef, sun: 0xfff0d8, clouds: 0xffffff };

/**
 * How many of the city's offices have their lights on at a clock hour,
 * whatever the daylight (by day they are on but the sun outshines them).
 * Most go home by eight; from there fewer and fewer until three in the
 * morning, when only the night owls and the cleaners are left; from four,
 * the early risers come in before the sun is up (Steve, 2026-09-24).
 * Hours and shares, joined by straight lines round the clock.
 */
export const OFFICE_HOURS = [[0, 0.14], [3, 0.05], [4, 0.05], [6.5, 0.24], [8, 0.42], [17, 0.42], [20, 0.34], [24, 0.14]];

export function officesLit(hour, hours = OFFICE_HOURS) {
    const h = ((hour % 24) + 24) % 24;
    for (let i = 1; i < hours.length; i++) {
        const [h1, v1] = hours[i];
        if (h <= h1) {
            const [h0, v0] = hours[i - 1];
            return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
        }
    }
    return hours[hours.length - 1][1];
}

/**
 * What the scene's lights and the painted sky should be for a light level.
 * Dawn and dusk pass through gold on the way.
 */
export function lighting(light) {
    const d = light.daylight;
    const golden = light.phase === 'dawn' || light.phase === 'dusk' ? Math.sin(d * Math.PI) : 0;
    const pick = (field) => mix(mix(NIGHT[field], DAY[field], d), GOLD[field], golden * 0.7);
    return {
        skyTop: pick('top'),
        skyBottom: pick('bottom'),
        sunColor: pick('sun'),
        /** The clouds' light: white by day, peach at dawn and dusk, slate by night. */
        clouds: pick('clouds'),
        sun: 0.12 + 1.4 * d,
        hemi: 0.22 + 0.7 * d,
        fill: 0.12 + 0.23 * d,
        /** How brightly the city's lit windows show, 0 to 1: they show
         *  only as the daylight goes. */
        cityLights: 1 - d,
        /** How many of its offices have their lights on (officesLit). */
        offices: officesLit(light.hour),
        /** The stars, 0 to 1: out only once the sky is nearly dark. */
        stars: smooth((0.35 - d) / 0.35),
        /** The moon: bright by night, a pale ghost by day. */
        moonShine: 1 - 0.65 * d,
        /** The glow round the sun, in the sky and about its disc: soft at
         *  noon, strong low in the sky at dawn and dusk. */
        halo: 0.3 + 0.7 * golden,
        /** The haze on the painted blocks: dark at night, pale by day. */
        cityNear: mix(0x1c2333, 0x5b6b7d, d),
        cityFar: mix(0x252c40, 0x8499ad, d)
    };
}
