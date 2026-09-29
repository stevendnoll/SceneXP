// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's weather (weather.js), pure: which days are wet and when,
 * how the rain builds and eases, what it does to the look, and the rain
 * falling past the window. How it LOOKS is Steve's screenshots.
 */
import {
    WEATHER, wetChance, mixSeed, daySpell, weatherAt, grayOf, weathered, RAIN, rainStreaks, streakPositions
} from '../www/office/js/weather.js';
import { lighting, lightAt } from '../www/office/js/daylight.js';

const days = (year, month) => Array.from({ length: 28 }, (_, d) => new Date(year, month, d + 1));
const at = (date, h) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, h * 3600000);

/** A wet date, found by looking. */
function wetDay(from = new Date(2026, 0, 1), test = () => true) {
    for (let d = 0; d < 400; d++) {
        const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
        const spell = daySpell(date);
        if (spell && test(spell)) return { date, spell };
    }
    return null;
}

describe('which days are wet', () => {
    test('wetter in winter than in summer, about a third of the year in all', () => {
        expect(wetChance(new Date(2026, 11, 21))).toBeCloseTo(WEATHER.chance.mean + WEATHER.chance.swing, 2);
        expect(wetChance(new Date(2026, 5, 21))).toBeCloseTo(WEATHER.chance.mean - WEATHER.chance.swing, 1);
        let wet = 0;
        for (let d = 0; d < 365; d++) if (daySpell(new Date(2026, 0, 1 + d))) wet++;
        expect(wet / 365).toBeGreaterThan(0.25);
        expect(wet / 365).toBeLessThan(0.45);
        const count = (month) => days(2026, month).filter((d) => daySpell(d)).length;
        expect(count(0) + count(11)).toBeGreaterThan(count(6) + count(7));
    });

    test('the same weather for every visitor on a date, and neighboring days independent', () => {
        const date = new Date(2026, 9, 12);
        expect(daySpell(date)).toEqual(daySpell(new Date(2026, 9, 12, 18, 30)));
        // Seeding with the date alone once marched the rain three hours
        // later each day: the start hours of a run of wet days must not
        // step evenly.
        const starts = [];
        for (let d = 0; d < 120; d++) {
            const spell = daySpell(new Date(2026, 9, 1 + d));
            if (spell) starts.push(spell.start);
        }
        const steps = starts.slice(1).map((s, i) => s - starts[i]);
        const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
        const spread = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
        expect(spread).toBeGreaterThan(3);
        // A scrambled seed: neighbors land far apart, always in range.
        expect(Math.abs(mixSeed(100) - mixSeed(101))).toBeGreaterThan(1000);
        for (const n of [0, 1, 2 ** 31, 20261012]) {
            expect(mixSeed(n)).toBeGreaterThanOrEqual(1);
            expect(mixSeed(n)).toBeLessThan(2147483647);
        }
    });

    test('a wet day’s spell is within its rules', () => {
        for (let d = 0; d < 200; d++) {
            const spell = daySpell(new Date(2026, 0, 1 + d));
            if (!spell) continue;
            expect(spell.start).toBeGreaterThanOrEqual(WEATHER.start[0]);
            expect(spell.start).toBeLessThanOrEqual(WEATHER.start[1]);
            expect(spell.end - spell.start).toBeGreaterThanOrEqual(WEATHER.hours[0]);
            expect(spell.end - spell.start).toBeLessThanOrEqual(WEATHER.hours[1]);
            expect(spell.strength).toBeGreaterThanOrEqual(WEATHER.strength[0]);
            expect(spell.strength).toBeLessThanOrEqual(WEATHER.strength[1]);
        }
    });
});

describe('a spell of rain', () => {
    test('the sky clouds over first, the rain builds, holds, eases, and the sky clears after', () => {
        const { date, spell } = wetDay(new Date(2026, 0, 1), (s) => s.start > 3 && s.end < 22);
        const w = (h) => weatherAt(at(date, h));
        expect(w(spell.start - WEATHER.lead - 0.1)).toEqual({ overcast: 0, rain: 0 });
        const gathering = w(spell.start - 0.2);
        expect(gathering.overcast).toBeGreaterThan(0.5);
        expect(gathering.rain).toBe(0);
        const middle = w((spell.start + spell.end) / 2);
        expect(middle.rain).toBeCloseTo(spell.strength, 9);
        expect(middle.overcast).toBe(1);
        const easing = w(spell.end - WEATHER.ramp / 2);
        expect(easing.rain).toBeGreaterThan(0);
        expect(easing.rain).toBeLessThan(spell.strength);
        expect(w(spell.end + 0.2).rain).toBe(0);
        expect(w(spell.end + 0.2).overcast).toBeGreaterThan(0);
        expect(w(spell.end + WEATHER.lead + 0.1)).toEqual({ overcast: 0, rain: 0 });
        // No jumps anywhere in the day.
        for (let h = 0; h < 24; h += 0.05) {
            const a = w(h);
            const b = w(h + 0.05);
            expect(Math.abs(a.rain - b.rain)).toBeLessThan(0.15);
            expect(Math.abs(a.overcast - b.overcast)).toBeLessThan(0.15);
            expect(a.overcast).toBeGreaterThanOrEqual(a.rain);
        }
    });

    test('a late spell runs on past midnight into the next morning', () => {
        const { date, spell } = wetDay(new Date(2026, 0, 1), (s) => s.end > 25.5);
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        expect(weatherAt(at(next, spell.end - 24 - 1)).rain).toBeGreaterThan(0);
    });

    test('a dry day is dry, and a pin holds the weather for a screenshot', () => {
        let dry = null;
        for (let d = 0; d < 60 && !dry; d++) {
            const date = new Date(2026, 6, 1 + d);
            const yesterday = new Date(2026, 6, d);
            if (!daySpell(date) && !daySpell(yesterday)) dry = date;
        }
        for (let h = 0; h < 24; h += 1) expect(weatherAt(at(dry, h))).toEqual({ overcast: 0, rain: 0 });
        expect(weatherAt(at(dry, 12), 'rain')).toEqual({ overcast: 1, rain: 1 });
        const { date } = wetDay();
        expect(weatherAt(at(date, 12), 'clear')).toEqual({ overcast: 0, rain: 0 });
    });
});

describe('what rain does to the look', () => {
    const noon = lighting(lightAt(new Date(2026, 8, 24), 12));
    const night = lighting(lightAt(new Date(2026, 8, 24), 23));

    test('a gray is as bright as its color, and a little blue', () => {
        const g = grayOf(0x80c0ff);
        const r = (g >> 16) & 255;
        const b = g & 255;
        expect(b).toBeGreaterThan(r);
        expect(grayOf(0xffffff, 1) >> 16).toBeLessThanOrEqual(255);
        expect(grayOf(0x000000)).toBe(0);
    });

    test('clear weather changes nothing but carrying the weather along', () => {
        const clear = weathered(noon, { overcast: 0, rain: 0 });
        expect({ ...clear, overcast: undefined, rain: undefined }).toEqual({ ...noon, overcast: undefined, rain: undefined });
        expect(clear.rain).toBe(0);
    });

    test('rain grays the sky, dims the sun, hides the stars and moon, and lights more offices', () => {
        const wet = weathered(noon, { overcast: 1, rain: 1 });
        const sat = (hex) => Math.max((hex >> 16) & 255, (hex >> 8) & 255, hex & 255) - Math.min((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
        expect(sat(wet.skyTop)).toBeLessThan(sat(noon.skyTop));
        expect(wet.sun).toBeLessThan(noon.sun * 0.5);
        expect(wet.halo).toBe(0);
        expect(wet.hemi).toBeLessThan(noon.hemi);
        expect(wet.fill).toBeLessThan(noon.fill);
        expect(wet.cityLights).toBeGreaterThan(noon.cityLights);
        expect(wet.rain).toBe(1);
        const wetNight = weathered(night, { overcast: 1, rain: 0.5 });
        expect(wetNight.stars).toBe(0);
        expect(wetNight.moonShine).toBeLessThan(0.2);
        expect(wetNight.cityLights).toBe(1);
    });
});

describe('the rain falling past the window', () => {
    const streaks = rainStreaks();

    test('streaks fill a box of air outside the office’s corner, the same every visit', () => {
        expect(streaks).toHaveLength(RAIN.count);
        expect(rainStreaks()).toEqual(streaks);
        for (const [x, y, z, phase] of streaks) {
            expect(x).toBeGreaterThanOrEqual(RAIN.box.x[0]);
            expect(x).toBeLessThanOrEqual(RAIN.box.x[1]);
            expect(y).toBeGreaterThanOrEqual(RAIN.box.y[0]);
            expect(y).toBeLessThanOrEqual(RAIN.box.y[1]);
            expect(z).toBeGreaterThanOrEqual(RAIN.box.z[0]);
            expect(z).toBeLessThanOrEqual(RAIN.box.z[1]);
            expect(phase).toBeGreaterThanOrEqual(0);
        }
    });

    test('each falls at the rain’s speed, a short slanted streak, and wraps back to the top', () => {
        const a = streakPositions(streaks, 0);
        const b = streakPositions(streaks, 0.1);
        expect(a).toHaveLength(streaks.length * 6);
        const span = RAIN.box.y[1] - RAIN.box.y[0];
        let fell = 0;
        for (let i = 0; i < streaks.length; i++) {
            const top = a[i * 6 + 1];
            expect(top).toBeLessThanOrEqual(RAIN.box.y[1] + 1e-6);
            expect(top).toBeGreaterThan(RAIN.box.y[1] - span - 1e-6);
            expect(top - a[i * 6 + 4]).toBeCloseTo(RAIN.length, 4);
            expect(a[i * 6 + 5] - a[i * 6 + 2]).toBeCloseTo(RAIN.length * RAIN.slant, 4);
            expect(a[i * 6]).toBe(a[i * 6 + 3]);
            const drop = a[i * 6 + 1] - b[i * 6 + 1];
            if (drop > 0) {
                expect(drop).toBeCloseTo(RAIN.fall * 0.1, 3);
                fell++;
            } else {
                // Wrapped from the bottom to the top.
                expect(drop).toBeCloseTo(RAIN.fall * 0.1 - span, 3);
            }
        }
        expect(fell).toBeGreaterThan(streaks.length * 0.9);
        const out = new Float32Array(streaks.length * 6);
        expect(streakPositions(streaks, 3, RAIN, out)).toBe(out);
    });
});
