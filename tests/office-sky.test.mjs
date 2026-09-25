// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's sky (sky.js), pure: where the sun, the moon and the stars
 * are at a moment, where the outside's light comes from, a day going by,
 * and the cloud deck's puffs. Whether it all LOOKS right is Steve's
 * screenshots.
 */
import {
    CLOUDS, cloudPuffs, wrappedPuffs, cloudCover, LATITUDE, POLE, declination, direction, moonAge, skyAt, lightFrom,
    discBasis, starField, dayLapse
} from '../www/office/js/sky.js';
import { lighting, lightAt, sunTimes } from '../www/office/js/daylight.js';

const puffs = cloudPuffs();

describe('the clouds', () => {
    test('the same sky every visit, every puff on the tile', () => {
        expect(cloudPuffs()).toEqual(puffs);
        expect(puffs.length).toBeGreaterThan(CLOUDS.cells * 5);
        for (const [u, v, r, a] of puffs) {
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
            expect(r).toBeGreaterThan(0);
            expect(a).toBeGreaterThan(0);
            expect(a).toBeLessThanOrEqual(1);
        }
    });

    test('broken cloud, with blue between: a quarter to a half of the sky', () => {
        expect(cloudCover(puffs)).toBeGreaterThan(0.25);
        expect(cloudCover(puffs)).toBeLessThan(0.5);
        expect(cloudCover([], 8)).toBe(0);
    });

    test('a cloud is a real cloud’s size: under a few kilometers across', () => {
        const widest = Math.max(...puffs.map(([, , r]) => r)) * 2 * CLOUDS.tile;
        expect(widest).toBeGreaterThan(300);
        expect(widest).toBeLessThan(3000);
        // High enough to hang over the mountains' tops, seen from the 40th floor.
        expect(CLOUDS.altitude).toBeGreaterThan(2000);
    });

    test('a puff over an edge is painted again across it, so the tile repeats without a seam', () => {
        const corner = wrappedPuffs([[0.01, 0.99, 0.05, 1]]).map(([u, v]) => [u, v].map((x) => Math.round(x * 100) / 100).join());
        expect(corner.sort()).toEqual(['0.01,-0.01', '0.01,0.99', '1.01,-0.01', '1.01,0.99']);
        expect(wrappedPuffs([[0.5, 0.5, 0.05, 1]])).toEqual([[0.5, 0.5, 0.05, 1]]);
        // Cover measured on either side of an edge agrees.
        const across = wrappedPuffs([[0.99, 0.5, 0.04, 1]]);
        const reaches = (u, v) => across.some(([x, y, r]) => Math.hypot(u - x, v - y) < r);
        expect(reaches(0.01, 0.5)).toBe(true);
        expect(reaches(0.97, 0.5)).toBe(true);
    });

    test('lit for the hour: white by day, warm at dusk, dark by night', () => {
        const date = new Date(2026, 8, 24);
        const day = lighting(lightAt(date, 12)).clouds;
        const dusk = lighting(lightAt(date, sunTimes(date).sunset)).clouds;
        const night = lighting(lightAt(date, 2)).clouds;
        expect(day).toBe(0xffffff);
        expect(dusk >> 16).toBeGreaterThan(dusk & 255);
        expect((night >> 8) & 255).toBeLessThan(80);
    });
});

const DEG = Math.PI / 180;
const DATE = new Date(2026, 8, 24);
const at = (date, h) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, h * 3600000);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('the sun', () => {
    test('it meets the horizon exactly at daylight.js’s sunrise and sunset, so the sky and the light agree', () => {
        for (const date of [DATE, new Date(2026, 5, 21), new Date(2026, 11, 21)]) {
            const { sunrise, sunset } = sunTimes(date);
            expect(skyAt(at(date, sunrise)).sunHeight / DEG).toBeCloseTo(0, 3);
            expect(skyAt(at(date, sunset)).sunHeight / DEG).toBeCloseTo(0, 3);
            expect(skyAt(at(date, sunrise + 1)).sunHeight).toBeGreaterThan(0);
            expect(skyAt(at(date, sunset + 1)).sunHeight).toBeLessThan(0);
        }
    });

    test('it rises in the east, stands in the south at noon, and sets in the west', () => {
        const { sunrise, sunset } = sunTimes(DATE);
        const noon = skyAt(at(DATE, (sunrise + sunset) / 2));
        expect(skyAt(at(DATE, sunrise)).sun[2]).toBeGreaterThan(0.9);
        expect(skyAt(at(DATE, sunset)).sun[2]).toBeLessThan(-0.9);
        expect(noon.sun[0]).toBeLessThan(0);
        expect(Math.abs(noon.sun[2])).toBeLessThan(1e-9);
        // Near the equinox, noon's height is 90 degrees less the latitude.
        expect(noon.sunHeight / DEG).toBeCloseTo(90 - LATITUDE + declination(DATE) / DEG, 6);
        // An afternoon sun is in the southwest, over the bay: the window's side.
        const four = skyAt(at(DATE, 16)).sun;
        expect(four[0]).toBeLessThan(0);
        expect(four[2]).toBeLessThan(0);
    });

    test('high in summer, low in winter', () => {
        const noonHeight = (date) => {
            const { sunrise, sunset } = sunTimes(date);
            return skyAt(at(date, (sunrise + sunset) / 2)).sunHeight / DEG;
        };
        expect(noonHeight(new Date(2026, 5, 21))).toBeCloseTo(90 - LATITUDE + 23.44, 0);
        expect(noonHeight(new Date(2026, 11, 21))).toBeCloseTo(90 - LATITUDE - 23.44, 0);
        expect(declination(new Date(2026, 5, 21)) / DEG).toBeCloseTo(23.44, 1);
    });

    test('a direction is a unit vector in the room’s frame: north +x, up +y, east +z', () => {
        const zenith = direction(0, LATITUDE * DEG);
        expect(zenith[1]).toBeCloseTo(1, 9);
        const risingEquator = direction(-Math.PI / 2, 0);
        expect(risingEquator[2]).toBeCloseTo(1, 9);
        expect(Math.hypot(...direction(1.1, 0.3))).toBeCloseTo(1, 9);
        expect(Math.hypot(...POLE)).toBeCloseTo(1, 9);
        expect(Math.asin(POLE[1]) / DEG).toBeCloseTo(LATITUDE, 9);
    });
});

describe('the moon', () => {
    test('it keeps the real month: a known full moon is full, and it is new a half month later', () => {
        const full = new Date(Date.UTC(2024, 8, 18, 2, 34));
        expect(moonAge(full)).toBeCloseTo(0.5, 1);
        expect(Math.abs(moonAge(full) - 0.5)).toBeLessThan(0.02);
        expect(skyAt(full).elongation / DEG).toBeGreaterThan(165);
        const newMoon = new Date(full.getTime() + 14.77 * 24 * 3600000);
        const age = moonAge(newMoon);
        expect(Math.min(age, 1 - age)).toBeLessThan(0.02);
        expect(skyAt(newMoon).elongation / DEG).toBeLessThan(15);
        expect(moonAge(new Date(Date.UTC(1990, 0, 1)))).toBeGreaterThanOrEqual(0);
    });

    test('a full moon rises in the east as the sun sets in the west', () => {
        const full = new Date(2024, 8, 17);
        const { sunset } = sunTimes(full);
        const sky = skyAt(at(full, sunset));
        expect(sky.moon[2]).toBeGreaterThan(0.8);
        expect(Math.abs(sky.moonHeight / DEG)).toBeLessThan(12);
    });

    test('the stars turn once a sidereal day, a little short of a clock day', () => {
        const a = skyAt(DATE).turn;
        const later = skyAt(new Date(DATE.getTime() + 86164090.5)).turn;
        expect(Math.abs(later - a) % (2 * Math.PI)).toBeLessThan(1e-4);
        expect(skyAt(new Date(DATE.getTime() + 6 * 3600000)).turn).not.toBeCloseTo(a, 1);
    });
});

describe('the light outside', () => {
    const sky = (sun, moon) => ({ sun, moon, sunHeight: Math.asin(sun[1]), moonHeight: Math.asin(moon[1]) });

    test('it comes from the sun while it is up, and never from lower than a few degrees', () => {
        const high = direction(0.4, 0.2);
        expect(lightFrom(sky(high, [0, -1, 0]))).toEqual(high.map((v) => expect.closeTo(v, 9)));
        const low = [Math.cos(DEG), Math.sin(DEG), 0];
        const lit = lightFrom(sky(low, [0, -1, 0]));
        expect(Math.asin(lit[1]) / DEG).toBeCloseTo(4, 6);
        expect(lit[0]).toBeGreaterThan(0.99);
    });

    test('by night it is the moon when the moon is up, and otherwise from high overhead', () => {
        const down = [0, -0.5, Math.sqrt(0.75)];
        const moon = direction(-0.8, 0.1);
        expect(lightFrom(sky(down, moon))).toEqual(moon.map((v) => expect.closeTo(v, 9)));
        const none = lightFrom(sky(down, [0, -1, 0]));
        expect(none[1]).toBeGreaterThan(0.9);
        expect(Math.hypot(...none)).toBeCloseTo(1, 9);
        // Handed nothing to go on, it still gives a direction, never NaN.
        const lost = lightFrom({ sun: [0, 0, 0], moon: [0, -1, 0], sunHeight: 0, moonHeight: -1 });
        expect(Math.hypot(...lost)).toBeCloseTo(1, 9);
    });

    test('the moon’s disc faces the eye, with its lit side toward the sun', () => {
        const m = direction(-0.6, 0.2);
        const s = direction(1.2, 0.1);
        const { right, up, normal } = discBasis(m, s);
        expect(dot(normal, m)).toBeCloseTo(-1, 9);
        expect(dot(right, m)).toBeCloseTo(0, 9);
        expect(dot(right, s)).toBeGreaterThan(0);
        expect(dot(up, right)).toBeCloseTo(0, 9);
        expect(Math.hypot(...up)).toBeCloseTo(1, 9);
        // A right-handed frame, as three's makeBasis wants.
        const z = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
        expect(dot(z, normal)).toBeCloseTo(1, 9);
        // With the sun right behind it (a new moon) it still hangs square.
        const behind = discBasis(m, m);
        expect(Math.hypot(...behind.right)).toBeCloseTo(1, 9);
        expect(dot(behind.right, m)).toBeCloseTo(0, 9);
        expect(Math.hypot(...discBasis([0, 1, 0], [0, 1, 0]).right)).toBeCloseTo(1, 9);
    });
});

describe('the stars and a day going by', () => {
    test('the same stars every visit, over the whole sky, faint and bright', () => {
        const stars = starField();
        expect(starField()).toEqual(stars);
        expect(stars).toHaveLength(420);
        for (const [x, y, z, b] of stars) {
            expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
            expect(b).toBeGreaterThanOrEqual(0.35);
            expect(b).toBeLessThanOrEqual(1);
        }
        expect(stars.filter(([, y]) => y > 0).length / stars.length).toBeGreaterThan(0.4);
        expect(starField(5, 1)).toHaveLength(5);
    });

    test('a day goes by in its seconds, smoothly, and ends where it began a day later', () => {
        const from = DATE.getTime();
        const day = dayLapse(from, { seconds: 30 });
        expect(day.step(7.5)).toEqual({ at: from + 6 * 3600000, done: false });
        expect(day.step(-3).at).toBe(from + 6 * 3600000);
        expect(day.step(0.2).at).toBeCloseTo(from + 6.16 * 3600000, -1);
        expect(day.step(60)).toEqual({ at: from + 24 * 3600000, done: true });
        expect(dayLapse(from).step(15).at).toBe(from + 12 * 3600000);
    });

    test('for less motion, an hour at a time, and still the whole day at the end', () => {
        const from = DATE.getTime();
        const day = dayLapse(from, { seconds: 24, stepped: true });
        expect(day.step(2.6).at).toBe(from + 2 * 3600000);
        expect(day.step(0.3).at).toBe(from + 2 * 3600000);
        expect(day.step(0.2).at).toBe(from + 3 * 3600000);
        expect(day.step(30)).toEqual({ at: from + 24 * 3600000, done: true });
    });
});

describe('the heavens’ light levels (daylight.js)', () => {
    test('stars only in the dark, the moon pale by day, the sun’s glow strongest low in the sky', () => {
        const noon = lighting(lightAt(DATE, 12));
        const night = lighting(lightAt(DATE, 2));
        const dusk = lighting(lightAt(DATE, sunTimes(DATE).sunset));
        expect(noon.stars).toBe(0);
        expect(night.stars).toBe(1);
        expect(night.moonShine).toBe(1);
        expect(noon.moonShine).toBeCloseTo(0.35, 9);
        expect(dusk.halo).toBeGreaterThan(noon.halo);
        expect(noon.halo).toBeGreaterThan(0);
    });
});
