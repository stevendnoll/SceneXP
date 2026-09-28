// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * finishes.js - The desk pad's leather, painted in numbers: a graphite hide
 * with a fine pebbled grain, mottled a little, and a line of stitching a
 * finger's width in from its edge.
 *
 * PAINTED, NOT DOWNLOADED: worked out at load from seeded noise, as three
 * maps of RGBA bytes: the color (sRGB), the relief as a normal map, and the
 * roughness (in green, as three reads it). No file to fetch, and the same
 * pad on every visit. (A painted wood lived here too until the room went
 * white and aluminum, QA 2026-09-29.)
 *
 * Pure: numbers in, typed arrays out, testable under Node.
 */

import { noiseField } from './city.min.js';

/** The leather pad: its size in meters, its texels, its colors, how far in
 *  its stitching runs and how long each stitch is (meters). */
export const LEATHER = {
    size: [0.8, 0.42],
    texels: [512, 256],
    colors: { hide: 0x2e3034, light: 0x383b40, stitch: 0x8e9196 },
    stitch: { inset: 0.012, length: 0.006, width: 0.0014 },
    relief: 1.4,
    roughness: [0.5, 0.66],
    seed: 20260930
};

const smoothstep = (a, b, t) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
};

const channel = (hex, shift) => (hex >> shift) & 255;

/** Two sRGB colors mixed, as [r, g, b] 0 to 255. */
function mix(a, b, t) {
    const k = Math.min(1, Math.max(0, t));
    return [16, 8, 0].map((s) => channel(a, s) + (channel(b, s) - channel(a, s)) * k);
}

/**
 * Heights as a tangent-space normal map, RGBA bytes: each texel tilted by
 * the slope of its neighbors, `relief` times, wrapping at the edges (the
 * maps repeat).
 */
export function normalsFrom(heights, width, height, relief) {
    const out = new Uint8Array(width * height * 4);
    const at = (i, j) => heights[((j + height) % height) * width + ((i + width) % width)];
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            const dx = (at(i + 1, j) - at(i - 1, j)) * relief;
            const dy = (at(i, j + 1) - at(i, j - 1)) * relief;
            const len = Math.hypot(dx, dy, 1);
            const k = (j * width + i) * 4;
            out[k] = Math.round((-dx / len * 0.5 + 0.5) * 255);
            out[k + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
            out[k + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
            out[k + 3] = 255;
        }
    }
    return out;
}

/**
 * The leather pad's three maps over LEATHER.size, `{ color, normal, rough,
 * width, height }`, each RGBA bytes, row 0 at v 0: the hide
 * pebbled and mottled, and a line of stitches run round it, LEATHER.stitch
 * in from the edge, each stitch a little proud and paler.
 */
export function leatherMaps(width = LEATHER.texels[0], height = LEATHER.texels[1]) {
    const pebble = noiseField(LEATHER.seed);
    const mottle = noiseField(LEATHER.seed + 1);
    const [W, H] = LEATHER.size;
    const { inset, length, width: thread } = LEATHER.stitch;
    const color = new Uint8Array(width * height * 4);
    const rough = new Uint8Array(width * height * 4);
    const heights = new Float32Array(width * height);
    const [r0, r1] = LEATHER.roughness;
    for (let j = 0; j < height; j++) {
        const y = ((j + 0.5) / height) * H;
        for (let i = 0; i < width; i++) {
            const x = ((i + 0.5) / width) * W;
            const grain = Math.abs(pebble(x * 900, y * 900));
            const patch = mottle(x * 6, y * 6);
            let [r, g, b] = mix(LEATHER.colors.hide, LEATHER.colors.light, 0.5 + 0.5 * patch);
            let h = -0.6 * grain;
            // The stitching: along the line `inset` in from the nearest
            // edge, dashes `length` long with gaps as long between.
            const edge = Math.min(x, W - x, y, H - y);
            const along = Math.abs(edge - x) < 1e-9 || Math.abs(edge - (W - x)) < 1e-9 ? y : x;
            const onLine = Math.abs(edge - inset) < thread;
            const dash = Math.floor(along / length) % 2 === 0;
            if (onLine && dash) {
                [r, g, b] = mix(LEATHER.colors.stitch, LEATHER.colors.stitch, 0);
                h = 0.8;
            } else if (Math.abs(edge - inset) < thread * 3) {
                // The groove the thread lies in.
                h -= 0.5;
            }
            const k = (j * width + i) * 4;
            color[k] = r;
            color[k + 1] = g;
            color[k + 2] = b;
            color[k + 3] = 255;
            const rr = Math.round((r0 + (r1 - r0) * grain) * 255);
            rough[k] = rr;
            rough[k + 1] = rr;
            rough[k + 2] = rr;
            rough[k + 3] = 255;
            heights[j * width + i] = h;
        }
    }
    return { color, normal: normalsFrom(heights, width, height, LEATHER.relief), rough, width, height };
}
