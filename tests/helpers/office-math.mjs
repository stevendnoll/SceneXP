// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * THE OFFICE'S HEAVY PURE MATH, WORKED OUT ONCE A FILE, for the suites that
 * boot Corner Office's page over and over (office-init, office-ui).
 *
 * Every boot calls jest.resetModules() and re-imports the page, so each
 * one worked out the whole world again: the land across the bay (ninety
 * thousand points of noise), the crest line the sun sets behind, and the
 * water's ripple texture. Jest's module sandbox runs that math some sixty
 * times slower than plain Node (800k noise calls: 7 ms in Node, 420 ms
 * here). Thirteen boots of it doubled office-init and timed out its first
 * test in a loaded full run (2026-09-25), and office-ui's 135 boots of it
 * set the whole suite's wall clock (2026-09-29: 306 s of a 306 s run).
 *
 * So these suites get ONE instance of city.js and bay.js for the file:
 * city.js's own caches (the mountain fields, the crest line) then outlive
 * each boot, the ripple texture and the island's towers and lamps are made
 * once, and the land is thinned to every sixth point. Both modules are pure (no state but those
 * deterministic caches, and no imports), so sharing them changes nothing a
 * test can see. These suites boot the page and drive it; the land, the
 * crests and the water are measured with the real three.js in office-view.
 *
 * Call shareOfficeMath() at the top of a suite, before main.js is imported.
 */
import { jest } from '@jest/globals';
import * as city from '../../www/office/js/city.js';
import * as bay from '../../www/office/js/bay.js';

/** Every `every`th row and column of a land grid, and its last. */
export function thinned({ positions, cols, rows }, every = 6) {
    const pick = (n) => [...new Set([...Array.from({ length: Math.ceil(n / every) }, (_, i) => i * every), n - 1])];
    const cs = pick(cols);
    const rs = pick(rows);
    const out = new Float32Array(cs.length * rs.length * 3);
    let k = 0;
    for (const r of rs) for (const c of cs) for (let a = 0; a < 3; a++) out[k++] = positions[(r * cols + c) * 3 + a];
    return { positions: out, cols: cs.length, rows: rs.length };
}

/** Serve city.min.js and bay.min.js from one instance each, with the land
 *  thinned and the ripple texture made once. */
export function shareOfficeMath() {
    const land = Object.fromEntries(Object.entries(city.landGrids()).map(([name, grid]) => [name, thinned(grid)]));
    const ripples = new Map();
    // The island's towers and lamps, planned once and handed to each boot as
    // its own copy (a boot is free to write on what it is given).
    const once = (make) => {
        let made = null;
        return (...args) => {
            if (args.length) return make(...args);
            made = made || make();
            return structuredClone(made);
        };
    };
    jest.unstable_mockModule('../../www/office/js/city.min.js', () => ({
        ...city,
        landGrids: () => land,
        islandTowers: once(city.islandTowers),
        islandLamps: once(city.islandLamps)
    }));
    jest.unstable_mockModule('../../www/office/js/bay.min.js', () => ({
        ...bay,
        rippleNormals: (size = bay.BAY.size, waves = bay.BAY.waves) => {
            const key = `${size}:${JSON.stringify(waves)}`;
            if (!ripples.has(key)) ripples.set(key, bay.rippleNormals(size, waves));
            return ripples.get(key);
        }
    }));
    return land;
}
