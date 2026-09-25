// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sky.js - What is up in the sky: for now, the clouds.
 *
 * A CLOUD DECK, SEEN FROM BELOW. The clouds are one wide, flat layer high
 * over the city and the bay, painted with broken cumulus and seen from
 * underneath. From the 40th floor the near clouds sit high in the window
 * and the far ones crowd down toward the mountains in perspective, paler
 * with each kilometer of haze, which is how a real cloud deck reads from
 * the ground. Blue sky shows between them. Because the deck is part of the
 * world, the water and the glass reflect it too.
 *
 * The deck is one tile of cloud painted once (paint.js drawClouds) and
 * repeated. The puffs that make it are clustered into cells, stretched a
 * little along the wind, and every puff near an edge is painted again on
 * the far side, so the tile repeats without a seam.
 *
 * Pure: numbers in and out. world.js builds the deck and colors it for the
 * hour (daylight.js `clouds`).
 */

import { seeded } from './city.min.js';

/**
 * The deck: its height above the water, how far it spreads, how many
 * meters one painted tile covers, the tile's pixels, and how many cloud
 * cells a tile holds.
 */
export const CLOUDS = { altitude: 2800, span: 240000, tile: 14000, size: 1024, cells: 22, seed: 20260925 };

/**
 * The puffs of one tile, as [u, v, radius, alpha] in tile units (0 to 1):
 * clustered into `cells` clouds, each a few dozen puffs, wider along the
 * wind than across it, heavier in the middle.
 */
export function cloudPuffs(clouds = CLOUDS) {
    const random = seeded(clouds.seed);
    const puffs = [];
    for (let c = 0; c < clouds.cells; c++) {
        const cu = random();
        const cv = random();
        const size = 0.03 + random() * 0.05;
        const count = 10 + Math.floor(random() * 16);
        for (let p = 0; p < count; p++) {
            const angle = random() * Math.PI * 2;
            const out = Math.sqrt(random());
            const u = cu + Math.cos(angle) * out * size * 1.8;
            const v = cv + Math.sin(angle) * out * size;
            const radius = size * (0.35 + random() * 0.4) * (1 - out * 0.4);
            puffs.push([((u % 1) + 1) % 1, ((v % 1) + 1) % 1, radius, 0.55 + random() * 0.35]);
        }
    }
    return puffs;
}

/**
 * Every place a puff is painted: itself, and a copy across each edge it
 * crosses, so the tile's edges meet.
 */
export function wrappedPuffs(puffs) {
    const out = [];
    for (const [u, v, r, a] of puffs) {
        for (const du of [-1, 0, 1]) {
            for (const dv of [-1, 0, 1]) {
                const x = u + du;
                const y = v + dv;
                if (x + r < 0 || x - r > 1 || y + r < 0 || y - r > 1) continue;
                out.push([x, y, r, a]);
            }
        }
    }
    return out;
}

/** How much of the sky the deck covers: the share of a grid of points that
 *  lie within some puff. */
export function cloudCover(puffs, n = 64) {
    const all = wrappedPuffs(puffs);
    let covered = 0;
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            const v = (j + 0.5) / n;
            if (all.some(([x, y, r]) => Math.hypot(u - x, v - y) < r)) covered++;
        }
    }
    return covered / (n * n);
}
