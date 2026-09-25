// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's sky (sky.js), pure: the cloud deck's puffs, how they
 * repeat without a seam, and how much of the sky they cover. Whether they
 * look like Seattle's clouds is Steve's screenshots.
 */
import { CLOUDS, cloudPuffs, wrappedPuffs, cloudCover } from '../www/office/js/sky.js';
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
