// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * bay.js - The water and the air: Elliott Bay's surface, and the haze that
 * lies over everything with distance.
 *
 * THE WATER IS A MIRROR, GENTLY MOVED. Seen from 195 m at a glancing angle,
 * open water is mostly what it reflects (more of it the flatter the angle,
 * which a standard material's Fresnel term already does) over a dark teal
 * body. On a calm day that is a near-perfect mirror of the sky, the far
 * shore and the mountains (world.js captures the world from just over the
 * water for it), and what says water rather than glass is a slow swell
 * that bends the reflection a few degrees. The swell is a normal map, one
 * tile of six long, low waves. Every wave fits a whole number of times
 * across the tile, so the tile repeats without a seam, and their slopes are
 * sized to a calm day (a mean square slope a fraction of a light breeze's,
 * after Steve, 2026-09-24: "less rippley... and more reflective"). Far off
 * the texture's own mipmaps flatten it, which is right: distant water is a
 * sheen, not a pattern.
 *
 * THE HAZE IS DISTANCE MADE VISIBLE. Without it a tower three kilometers off
 * is drawn as crisply as one across the street, and nothing says how big the
 * city is. With it the view falls into layers: the city, the island, the far
 * shore, the mountains, each paler than the last.
 *
 * Pure: numbers and arrays in and out. world.js turns them into a material.
 */

/**
 * The water. `color` is the body of the bay under the reflections, dark so
 * the reflections carry it; `roughness` is how sharp the mirror is;
 * `reflect` strengthens the reflection a little past a plain dielectric's,
 * for the calm-day mirror Steve asked for; `normalScale` is how strongly
 * the swell bends it; `tile` is how many meters one swell texture spans
 * (long, so its repeat does not show as a grid toward the horizon), and
 * `size` its pixels. Each wave is
 * `[kx, ky, slope, phase]`: how many times it fits across the tile each way
 * (whole numbers, so the tile repeats), its steepest slope, and where it
 * starts.
 */
export const BAY = {
    color: 0x12303b,
    roughness: 0.05,
    reflect: 1.3,
    normalScale: 0.6,
    tile: 240,
    size: 256,
    waves: [
        [2, 1, 0.035, 0.0],
        [3, -2, 0.03, 1.7],
        [5, 2, 0.03, 4.1],
        [4, -5, 0.025, 2.3],
        [8, 3, 0.02, 5.2],
        [7, -8, 0.02, 0.9]
    ]
};

/** The haze: none at the window, all of the horizon's color by `far`
 *  meters. Linear, so a kilometer adds the same haze near and far. */
export const HAZE = { near: 0, far: 60000 };

/** How much of the horizon's color lies over a thing `distance` meters off. */
export function hazeAt(distance, haze = HAZE) {
    return Math.min(1, Math.max(0, (distance - haze.near) / (haze.far - haze.near)));
}

/** The water's slope at a point on the tile (u and v from 0 to 1): how much
 *  it rises per meter across and per meter along. */
export function rippleSlope(u, v, waves = BAY.waves) {
    let sx = 0;
    let sy = 0;
    for (const [kx, ky, slope, phase] of waves) {
        const k = Math.hypot(kx, ky);
        const c = slope * Math.cos(2 * Math.PI * (kx * u + ky * v) + phase);
        sx += (c * kx) / k;
        sy += (c * ky) / k;
    }
    return [sx, sy];
}

/** The steepest the water can get, in radians from level, if every wave
 *  crested together. */
export function maxTilt(waves = BAY.waves) {
    return Math.atan(waves.reduce((sum, w) => sum + w[2], 0));
}

/** The mean square slope of the surface: the one number sea-glitter
 *  measurements describe a wind's ripples by. */
export function meanSquareSlope(waves = BAY.waves) {
    return waves.reduce((sum, w) => sum + (w[2] * w[2]) / 2, 0);
}

/**
 * The ripple tile as a normal map: RGBA bytes, `size` by `size`, each pixel
 * the surface's normal (x and y from -1..1 to 0..255, and z, which is up,
 * the same way).
 */
export function rippleNormals(size = BAY.size, waves = BAY.waves) {
    const data = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [sx, sy] = rippleSlope(i / size, j / size, waves);
            const len = Math.hypot(sx, sy, 1);
            const at = (j * size + i) * 4;
            data[at] = Math.round(((-sx / len) * 0.5 + 0.5) * 255);
            data[at + 1] = Math.round(((-sy / len) * 0.5 + 0.5) * 255);
            data[at + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
            data[at + 3] = 255;
        }
    }
    return data;
}

/**
 * How far from level a patch of water at `point` must tilt to throw the sun
 * (a direction toward it) back to the eye, in radians: the angle between
 * straight up and the halfway direction between the sun and the eye. A
 * glint can only happen where this is within the swell's reach, which on a
 * calm day means a low sun over the water.
 */
export function glintTilt(eye, point, sun) {
    const unit = (v) => {
        const l = Math.hypot(...v);
        return v.map((c) => c / l);
    };
    const toEye = unit(eye.map((c, i) => c - point[i]));
    const half = unit(unit(sun).map((c, i) => c + toEye[i]));
    return Math.acos(Math.min(1, Math.max(-1, half[1])));
}
