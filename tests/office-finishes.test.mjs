// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's desk pad leather (finishes.js), pure. The maps are painted
 * small here: Jest's module sandbox runs the noise some sixty times slower
 * than Node (the "Jest sandbox slows hot math" note), and the page paints
 * them full size only where there is WebGL2.
 */
import { LEATHER, normalsFrom, leatherMaps } from '../www/office/js/finishes.js';

const lum = ([r, g, b]) => r + g + b;

describe('the relief', () => {
    test('as a normal map: level ground points straight out, a slope tilts it, and the map wraps', () => {
        const flat = normalsFrom(new Float32Array(16), 4, 4, 1);
        for (let k = 0; k < flat.length; k += 4) expect(Array.from(flat.slice(k, k + 4))).toEqual([128, 128, 255, 255]);
        const ramp = new Float32Array(64).map((_, i) => (i % 8) * 0.1);
        const n = normalsFrom(ramp, 8, 8, 1);
        expect(n[(3 * 8 + 3) * 4]).toBeLessThan(128);
        expect(n[(3 * 8 + 3) * 4 + 1]).toBe(128);
        const { normal } = leatherMaps(32, 16);
        for (let k = 0; k < normal.length; k += 4) {
            const v = [0, 1, 2].map((c) => normal[k + c] / 127.5 - 1);
            expect(Math.hypot(...v)).toBeCloseTo(1, 1);
        }
    });
});

describe('the leather pad', () => {
    test('a graphite hide, stitched all round a finger’s width in from its edge, and nowhere else', () => {
        const W = 400;
        const H = 210;
        const { color, width, height } = leatherMaps(W, H);
        expect([width, height]).toEqual([W, H]);
        const at = (i, j) => Array.from(color.slice((j * W + i) * 4, (j * W + i) * 4 + 3));
        const stitch = [(LEATHER.colors.stitch >> 16) & 255, (LEATHER.colors.stitch >> 8) & 255, LEATHER.colors.stitch & 255];
        const isStitch = (c) => c.every((v, k) => Math.abs(v - stitch[k]) < 2);
        let edge = 0;
        let middle = 0;
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                if (!isStitch(at(i, j))) continue;
                const x = ((i + 0.5) / W) * LEATHER.size[0];
                const y = ((j + 0.5) / H) * LEATHER.size[1];
                const d = Math.min(x, LEATHER.size[0] - x, y, LEATHER.size[1] - y);
                if (Math.abs(d - LEATHER.stitch.inset) < 0.004) edge++;
                else middle++;
            }
        }
        expect(edge).toBeGreaterThan(200);
        expect(middle).toBe(0);
        // Dark: the hide well under half bright.
        expect(lum(at(W / 2, H / 2))).toBeLessThan(3 * 128);
    });
});
