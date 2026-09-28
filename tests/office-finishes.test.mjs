// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's desk finishes (finishes.js), pure: the painted walnut and
 * the stitched leather (QA, 2026-09-29: "the furniture in the scene should
 * look really expensive"). The maps are painted small here: Jest's module
 * sandbox runs the noise some sixty times slower than Node (the "Jest
 * sandbox slows hot math" note), and the page paints them full size only
 * where there is WebGL2.
 */
import {
    WALNUT, LEATHER, leafOf, walnutAt, walnutColor, normalsFrom, walnutMaps, leatherMaps
} from '../www/office/js/finishes.js';

const lum = ([r, g, b]) => r + g + b;

describe('the walnut', () => {
    test('the same board every time', () => {
        expect(walnutAt(0.7, 0.33)).toEqual(walnutAt(0.7, 0.33));
        const a = walnutMaps(32, 16);
        const b = walnutMaps(32, 16);
        expect(Array.from(a.color)).toEqual(Array.from(b.color));
        expect(a.color).toHaveLength(32 * 16 * 4);
        expect(a.normal).toHaveLength(32 * 16 * 4);
        expect(a.rough).toHaveLength(32 * 16 * 4);
    });

    test('bookmatched: each leaf is the mirror of its neighbor, the figure meeting itself at the seam', () => {
        const w = WALNUT.leaf;
        expect(leafOf(0.05)).toEqual({ leaf: 0, across: 0.05 });
        expect(leafOf(w + 0.05).leaf).toBe(1);
        expect(leafOf(w + 0.05).across).toBeCloseTo(w - 0.05, 9);
        // The grain (the rings, not the broad patches) mirrors across a seam.
        for (const u of [0.2, 0.9, 1.7]) {
            for (const a of [0.01, 0.07, 0.15]) {
                expect(walnutAt(u, w - a).late).toBeCloseTo(walnutAt(u, w + a).late, 9);
                expect(walnutAt(u, 3 * w - a).late).toBeCloseTo(walnutAt(u, 3 * w + a).late, 9);
            }
        }
    });

    test('flat-cut figure: arches at the heart, straightening into close, plain grain toward the leaf’s edges', () => {
        // Count the rings crossed going across the leaf, near its heart and
        // near its edges: the arches' flanks crowd together toward the
        // edges, as a flat-cut board's rings do.
        const rings = (from, to, u) => {
            let n = 0;
            let last = null;
            for (let v = from; v <= to; v += 0.0005) {
                const dark = walnutAt(u, v).late > 0.5;
                if (last !== null && dark && !last) n++;
                last = dark;
            }
            return n;
        };
        let middle = 0;
        let edges = 0;
        for (const u of [0.3, 0.8, 1.3, 1.8]) {
            middle += rings(WALNUT.leaf * 0.48, WALNUT.leaf * 0.68, u);
            edges += rings(0, WALNUT.leaf * 0.2, u);
        }
        expect(edges).toBeGreaterThan(middle * 1.5);
    });

    test('its colors run from the pale earlywood to the dark line, and every point is one of them', () => {
        const { light, line } = WALNUT.colors;
        const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
        expect(walnutColor(0).map(Math.round)).toEqual(hex(light));
        expect(walnutColor(1).map(Math.round)).toEqual(hex(line));
        for (let t = 0; t <= 1; t += 0.05) expect(lum(walnutColor(t))).toBeLessThanOrEqual(lum(walnutColor(Math.max(0, t - 0.05))) + 1e-9);
        for (let i = 0; i < 200; i++) {
            const p = walnutAt(i * 0.013, i * 0.0047);
            expect(p.tone).toBeGreaterThanOrEqual(0);
            expect(p.tone).toBeLessThanOrEqual(1);
            expect(p.pore).toBeGreaterThanOrEqual(0);
            expect(p.pore).toBeLessThanOrEqual(1);
        }
        // Brown, not gray: red over green over blue, all through.
        const { color } = walnutMaps(24, 12);
        for (let k = 0; k < color.length; k += 4) {
            expect(color[k]).toBeGreaterThan(color[k + 1]);
            expect(color[k + 1]).toBeGreaterThan(color[k + 2]);
        }
    });

    test('the relief as a normal map: level ground points straight out, a slope tilts it, and the map wraps', () => {
        const flat = normalsFrom(new Float32Array(16), 4, 4, 1);
        for (let k = 0; k < flat.length; k += 4) expect(Array.from(flat.slice(k, k + 4))).toEqual([128, 128, 255, 255]);
        // Heights rising along x: every normal leans back toward -x.
        const ramp = new Float32Array(64).map((_, i) => (i % 8) * 0.1);
        const n = normalsFrom(ramp, 8, 8, 1);
        expect(n[(3 * 8 + 3) * 4]).toBeLessThan(128);
        expect(n[(3 * 8 + 3) * 4 + 1]).toBe(128);
        // Unit length, near enough, once decoded.
        const { normal } = walnutMaps(16, 8);
        for (let k = 0; k < normal.length; k += 4) {
            const v = [0, 1, 2].map((c) => normal[k + c] / 127.5 - 1);
            expect(Math.hypot(...v)).toBeCloseTo(1, 1);
        }
        // The lacquer sits over bare wood that is rougher in the pores.
        expect(WALNUT.roughness[1]).toBeGreaterThan(WALNUT.roughness[0]);
    });
});

describe('the leather pad', () => {
    test('a dark hide, stitched all round a finger’s width in from its edge, and nowhere else', () => {
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
