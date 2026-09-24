// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's bay (bay.js), pure: the slow swell that makes a calm
 * mirror read as water, and the haze that makes distance visible.
 * Whether the result LOOKS like Elliott Bay is Steve's screenshots; these
 * hold the numbers it is built from.
 */
import { BAY, HAZE, hazeAt, rippleSlope, maxTilt, meanSquareSlope, rippleNormals, glintTilt } from '../www/office/js/bay.js';

const deg = (r) => (r * 180) / Math.PI;

describe('the ripples', () => {
    test('the tile repeats without a seam, both ways', () => {
        for (let t = 0; t < 1; t += 0.037) {
            const [ax, ay] = rippleSlope(0, t);
            const [bx, by] = rippleSlope(1, t);
            expect(bx).toBeCloseTo(ax, 9);
            expect(by).toBeCloseTo(ay, 9);
            const [cx, cy] = rippleSlope(t, 0);
            const [dx, dy] = rippleSlope(t, 1);
            expect(dx).toBeCloseTo(cx, 9);
            expect(dy).toBeCloseTo(cy, 9);
        }
        // A wave that does not fit a whole number of times leaves a seam.
        const [a] = rippleSlope(0, 0.3, [[2.5, 0, 0.1, 0]]);
        const [b] = rippleSlope(1, 0.3, [[2.5, 0, 0.1, 0]]);
        expect(Math.abs(a - b)).toBeGreaterThan(0.05);
    });

    test('every wave fits the tile a whole number of times, long and low', () => {
        for (const [kx, ky, slope] of BAY.waves) {
            expect(Number.isInteger(kx) && Number.isInteger(ky)).toBe(true);
            // Wavelengths of several meters to a few dozen: a swell, not a chop.
            const wavelength = BAY.tile / Math.hypot(kx, ky);
            expect(wavelength).toBeGreaterThan(6);
            expect(wavelength).toBeLessThan(60);
            // Each at least four pixels long, so none aliases in the tile.
            expect(wavelength / (BAY.tile / BAY.size)).toBeGreaterThanOrEqual(4);
            expect(slope).toBeGreaterThan(0);
        }
    });

    test('the slopes are a calm day: a mirror that bends, not a chop', () => {
        // Sea-glitter measurements put the mean square slope near 0.003 plus
        // 0.005 per meter a second of wind: a light breeze is 0.01 to 0.04.
        // Steve asked for less than that (2026-09-24), and some, so the
        // reflection still moves like water.
        expect(meanSquareSlope()).toBeGreaterThan(0.001);
        expect(meanSquareSlope()).toBeLessThan(0.006);
        expect(deg(maxTilt())).toBeGreaterThan(4);
        expect(deg(maxTilt())).toBeLessThan(12);
    });

    test('the normal map holds the surface’s normals, up, and no steeper than the waves allow', () => {
        const size = 32;
        const data = rippleNormals(size);
        expect(data).toHaveLength(size * size * 4);
        const decode = (at) => [0, 1, 2].map((k) => (data[at + k] / 255) * 2 - 1);
        let steepest = 0;
        let sumX = 0;
        for (let at = 0; at < data.length; at += 4) {
            const n = decode(at);
            expect(Math.hypot(...n)).toBeCloseTo(1, 1);
            expect(n[2]).toBeGreaterThan(Math.cos(maxTilt()) - 0.01);
            expect(data[at + 3]).toBe(255);
            steepest = Math.max(steepest, Math.acos(Math.min(1, n[2])));
            sumX += n[0];
        }
        expect(steepest).toBeLessThanOrEqual(maxTilt() + 0.02);
        expect(steepest).toBeGreaterThan(maxTilt() / 3);
        // Level on average: no tilt to the whole bay.
        expect(Math.abs(sumX / (size * size))).toBeLessThan(0.02);
        // A pixel is its point's slope: tilted against the rise.
        const [sx, sy] = rippleSlope(5 / size, 9 / size);
        const n = decode((9 * size + 5) * 4);
        expect(n[0]).toBeCloseTo(-sx / Math.hypot(sx, sy, 1), 1);
        expect(n[1]).toBeCloseTo(-sy / Math.hypot(sx, sy, 1), 1);
        expect(rippleNormals()).toHaveLength(BAY.size * BAY.size * 4);
    });
});

describe('the glint', () => {
    test('water level between the eye and the sun, at mirror angles, needs no tilt', () => {
        expect(glintTilt([0, 10, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(0, 9);
        expect(glintTilt([0, 10, 10], [0, 0, 0], [0, 1, -1])).toBeCloseTo(0, 9);
    });

    test('an eye looking down 10 degrees toward a sun 40 degrees up needs a 15 degree tilt', () => {
        const down = (10 * Math.PI) / 180;
        const up = (40 * Math.PI) / 180;
        const eye = [0, Math.sin(down) * 1000, Math.cos(down) * 1000];
        const sun = [0, Math.sin(up), -Math.cos(up)];
        expect(deg(glintTilt(eye, [0, 0, 0], sun))).toBeCloseTo(15, 6);
    });

    test('a sun behind the eye cannot glint in level water at all', () => {
        expect(deg(glintTilt([0, 10, 100], [0, 0, 0], [0, 0.2, 1]))).toBeGreaterThan(80);
    });
});

describe('the haze', () => {
    test('none at the window, all of the horizon by the far end, and even in between', () => {
        expect(hazeAt(HAZE.near)).toBe(0);
        expect(hazeAt(-50)).toBe(0);
        expect(hazeAt(HAZE.far)).toBe(1);
        expect(hazeAt(HAZE.far * 3)).toBe(1);
        expect(hazeAt(HAZE.far / 2)).toBeCloseTo(0.5, 9);
        expect(hazeAt(10, { near: 0, far: 20 })).toBe(0.5);
    });

    test('a city three kilometers off is a little hazed, mountains thirty off half so', () => {
        expect(hazeAt(300)).toBeLessThan(0.01);
        expect(hazeAt(3000)).toBeGreaterThan(0.03);
        expect(hazeAt(3000)).toBeLessThan(0.1);
        expect(hazeAt(30000)).toBeGreaterThan(0.35);
        expect(hazeAt(30000)).toBeLessThan(0.65);
    });
});
