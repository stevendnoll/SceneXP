// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * finishes.js - The desk's materials, painted in numbers: a figured walnut
 * and a stitched leather pad (QA, 2026-09-29: "the furniture in the scene
 * should look really expensive and of the highest quality").
 *
 * PAINTED, NOT DOWNLOADED (Steve's choice): each finish is worked out at
 * load from seeded noise, as three maps of RGBA bytes: the color (sRGB),
 * the relief as a normal map, and the roughness (in green, as three reads
 * it). No file to fetch, nothing to cache, and the same desk on every visit.
 *
 * THE WALNUT. Bookmatched flat-cut veneer, as a fine desk is faced: leaves
 * sliced one after another from the same log and laid side by side, each
 * the mirror of its neighbor. A flat cut passes the log's growth rings at a
 * slant as the log tapers, so each ring shows as an arch (the
 * "cathedral"), nested arches all pointing the one way along the leaf and
 * straightening into plain grain toward its edges; pale earlywood darkening
 * into each ring's latewood; fine streaks along the grain; broad warm and
 * cool patches; and the open pores, dark hairlines drawn out along the
 * grain, that the lacquer fills and the light picks out. (In previews,
 * stripes that only wandered read as a contour map, and rings round a cut
 * that dipped toward the heart closed into ovals, which read as knots.)
 * One texture covers WALNUT.size meters (along the grain, across it),
 * mapped in meters
 * (room.js grainUv), so the grain keeps its scale on every part and runs
 * unbroken over the waterfall edge.
 *
 * THE LEATHER. A dark hide with a fine pebbled grain, mottled a little, and
 * a line of stitching a finger's width in from its edge.
 *
 * Pure: numbers in, typed arrays out, testable under Node.
 */

import { noiseField } from './city.min.js';

/**
 * The walnut. `size` is the meters one texture covers, along the grain and
 * across it; `texels` its pixels; `colors` the palette, sRGB, from the pale
 * earlywood to the dark latewood line; `lines` grain lines a meter across
 * the board; `wander` how far (meters) they wander, at the scale of the
 * board and finer; `relief` how deep the pores and the latewood read in
 * the normal map; `roughness` the bare wood's, under the lacquer.
 */
export const WALNUT = {
    size: [2.6, 1.0],
    texels: [1024, 512],
    colors: { light: 0x8f5d39, mid: 0x5f3a23, dark: 0x3d2416, line: 0x21130b },
    /** A leaf's width across the grain, meters. */
    leaf: 0.2,
    /** The arches: `bend` how sharply a ring curves away from the leaf's
     *  heart line (rings a square meter across it), `pitch` rings a meter
     *  along it. Contours of bend * across² + pitch * along are nested
     *  parabolas, the cathedral's arches. */
    bend: 520,
    pitch: 4.2,
    relief: 1.6,
    roughness: [0.4, 0.72],
    seed: 20260929
};

/** The leather pad: its size in meters, its texels, its colors, how far in
 *  its stitching runs and how long each stitch is (meters). */
export const LEATHER = {
    size: [0.8, 0.42],
    texels: [512, 256],
    colors: { hide: 0x2c211b, light: 0x3a2c24, stitch: 0x9c8a72 },
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

let walnutFields = null;
function fields() {
    if (!walnutFields) {
        walnutFields = [0, 1, 2, 3].map((i) => noiseField(WALNUT.seed + i));
    }
    return walnutFields;
}

/** Where a point of the board lies in its leaf: meters across the leaf,
 *  mirrored on every other leaf (bookmatched), and which leaf. */
export function leafOf(v) {
    const w = WALNUT.leaf;
    const leaf = Math.floor(v / w);
    const inLeaf = v - leaf * w;
    return { leaf, across: leaf % 2 === 0 ? inLeaf : w - inLeaf };
}

/**
 * The walnut at a point of the board, meters `u` along the grain and `v`
 * across it: `tone` 0 (pale earlywood) to 1 (the dark latewood line),
 * `pore` 0 to 1, `late` how far into a ring's latewood, and `height` for
 * the relief (higher is proud; the pores and the latewood are low).
 */
export function walnutAt(u, v) {
    const [f0, f1, f2, f3] = fields();
    const { across } = leafOf(v);
    // The log's heart runs along the leaf a little off its middle, wandering.
    const heart = WALNUT.leaf * 0.58 + 0.012 * f0(u * 0.7, 3.1);
    const x = across - heart;
    // The arches, the bend easing and tightening along the leaf, and the
    // rings uneven as a tree's years are, wandering a little.
    const bend = WALNUT.bend * (1 + 0.3 * f1(u * 0.45, 7.7));
    // The arches come unevenly along the leaf, as the years do (evenly
    // spaced, they read as a chevron wallpaper).
    const years = WALNUT.pitch * u + 3.2 * f0(u * 0.55 + 1.7, 0.5) + 1.2 * f1(u * 1.6 + 4.4, 0.9);
    const g = bend * x * x + years + 1.1 * f2(u * 0.9, across * 9) + 0.35 * f3(u * 4.3, across * 31);
    const t = g - Math.floor(g);
    // Each ring: pale, darkening late into its latewood, a soft dark line
    // (a long, strong ramp made every ring look ribbed).
    const late = smoothstep(0.62, 0.9, t) * (1 - smoothstep(0.92, 1, t));
    // Fine streaks along the grain, and broad patches of warmer and cooler.
    const streak = 0.6 * f2(u * 0.5 + 5.1, across * 170) + 0.4 * f3(u * 1.4, across * 420);
    const broad = f3(u * 0.3 + 2.2, v * 1.3);
    // Pores: dark hairlines a few centimeters long, a millimeter or two
    // wide, drawn out along the grain, thickest in the latewood.
    const hair = f1(u * 22 + 3.3, across * 700);
    const pore = smoothstep(0.5 - 0.15 * late, 0.72 - 0.15 * late, hair);
    const tone = Math.min(1, Math.max(0, 0.32 + 0.3 * late + 0.2 * streak + 0.3 * broad + 0.26 * pore));
    return { tone, pore, late, height: -0.35 * late - 0.7 * pore + 0.1 * streak };
}

/** The walnut's color for a tone, sRGB [r, g, b]: pale through mid and
 *  dark to the line. */
export function walnutColor(tone) {
    const { light, mid, dark, line } = WALNUT.colors;
    if (tone < 0.45) return mix(light, mid, tone / 0.45);
    if (tone < 0.8) return mix(mid, dark, (tone - 0.45) / 0.35);
    return mix(dark, line, (tone - 0.8) / 0.2);
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
 * The walnut's three maps, `width` by `height` texels over WALNUT.size:
 * `{ color, normal, rough, width, height }`, each RGBA bytes, row 0 at v 0.
 */
export function walnutMaps(width = WALNUT.texels[0], height = WALNUT.texels[1]) {
    const color = new Uint8Array(width * height * 4);
    const rough = new Uint8Array(width * height * 4);
    const heights = new Float32Array(width * height);
    const [U, V] = WALNUT.size;
    const [r0, r1] = WALNUT.roughness;
    for (let j = 0; j < height; j++) {
        const v = ((j + 0.5) / height) * V;
        for (let i = 0; i < width; i++) {
            const w = walnutAt(((i + 0.5) / width) * U, v);
            const [r, g, b] = walnutColor(w.tone);
            const k = (j * width + i) * 4;
            color[k] = r;
            color[k + 1] = g;
            color[k + 2] = b;
            color[k + 3] = 255;
            const rr = Math.round((r0 + (r1 - r0) * w.pore) * 255);
            rough[k] = rr;
            rough[k + 1] = rr;
            rough[k + 2] = rr;
            rough[k + 3] = 255;
            heights[j * width + i] = w.height;
        }
    }
    return { color, normal: normalsFrom(heights, width, height, WALNUT.relief), rough, width, height };
}

/**
 * The leather pad's three maps over LEATHER.size, as walnutMaps: the hide
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
