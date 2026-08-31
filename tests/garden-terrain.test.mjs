// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Fractal Garden plot: its shape, its planting grid, and its seasonal
 * colour. All pure, so no THREE and no DOM.
 *
 * THE LOAD-BEARING TEST HERE IS THE FLAT BOUNDARY. The rolling plot and the
 * flat ground beyond it are two separate meshes at wildly different
 * resolutions, and they meet along the plot edge. They can only meet cleanly
 * if the relief is exactly zero there, and "exactly" is the operative word: a
 * millimetre of relief left at the boundary is a visible crack all the way
 * round the garden, lit differently on every side, and it would be blamed on
 * the wall or on the fog long before anybody suspected the height field.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    heightAt, normalAt, slopeAt, edgeDamp,
    snapToGrid, cellCenter, cellKey, cellInPlot, nearestFreeCell,
    grassColorAt
} from '../www/garden/js/terrain.js';
import { luminanceOf } from '../www/garden/js/sky.js';

const PLOT = GARDEN_CONFIG.plot;
const HALF = PLOT.halfSize;

// ---- The height field ------------------------------------------------------

test('the plot edge is exactly flat, so the two meshes meet with no crack', () => {
    for (let a = -HALF; a <= HALF; a += 0.1) {
        expect(heightAt(a, -HALF)).toBe(0);
        expect(heightAt(a, HALF)).toBe(0);
        expect(heightAt(-HALF, a)).toBe(0);
        expect(heightAt(HALF, a)).toBe(0);
    }
    // And everything outside the plot stays flat, so the surround is level
    // wherever it is sampled.
    expect(heightAt(40, -13)).toBe(0);
    expect(heightAt(-100, 100)).toBe(0);
});

test('the damp reaches the boundary smoothly rather than stopping dead', () => {
    // A crease at the point where the relief starts fading would be picked out
    // by any grazing sun, which in this garden is half the year.
    expect(edgeDamp(0, 0)).toBe(1);
    expect(edgeDamp(HALF, 0)).toBe(0);
    let prev = 1;
    for (let m = GARDEN_CONFIG.terrain.edgeFlatFrom; m <= HALF; m += 0.05) {
        const d = edgeDamp(m, 0);
        expect(d).toBeLessThanOrEqual(prev + 1e-9);
        prev = d;
    }
    // Smoothstep, so the derivative vanishes at both ends: the values a hair
    // inside each end are almost exactly the end value.
    expect(edgeDamp(GARDEN_CONFIG.terrain.edgeFlatFrom + 0.02, 0)).toBeGreaterThan(0.999);
    expect(edgeDamp(HALF - 0.02, 0)).toBeLessThan(0.001);
});

test('the ground is the same ground on every visit', () => {
    // A tree planted on a rise has to still be on that rise tomorrow. Nothing
    // in the height field may be random, time dependent, or accumulated.
    const samples = [[0, 0], [3.5, -7.25], [-11, 11], [8.5, 0]];
    const first = samples.map(([x, z]) => heightAt(x, z));
    const second = samples.map(([x, z]) => heightAt(x, z));
    expect(second).toEqual(first);
    // The relief itself is still deterministic whatever the plot is scaled to,
    // which is the property this test is actually about. The nursery ships
    // LEVELLED (terrain.reliefScale 0), so the shape is exercised through a
    // rolling copy rather than through whatever the current setting happens
    // to be.
    const rolling = { ...GARDEN_CONFIG.terrain, reliefScale: 1 };
    const rolled = samples.map(([x, z]) => heightAt(x, z, rolling));
    expect(samples.map(([x, z]) => heightAt(x, z, rolling))).toEqual(rolled);
    expect(rolled.some((h) => h !== 0)).toBe(true);
});

test('THE NURSERY IS LEVEL, and the seam still holds', () => {
    // A cultivated planting bed is a levelled thing. What matters is that
    // levelling does not disturb the seam the whole terrain is built around:
    // the plot and the world beyond it still meet at exactly zero, because at
    // scale 0 that meeting is 0 = 0.
    expect(GARDEN_CONFIG.terrain.reliefScale).toBe(0);
    for (let x = -HALF; x <= HALF; x += 0.5) {
        for (let z = -HALF; z <= HALF; z += 0.5) {
            expect(heightAt(x, z)).toBe(0);
        }
    }
    // And it is a SCALE rather than a switch, so it has to scale. 0 and 1 both
    // work through short circuits and a no-op multiply, so only a fractional
    // value proves the multiply is doing anything: without it, asking for half
    // the relief would quietly hand back all of it.
    const rolling = { ...GARDEN_CONFIG.terrain, reliefScale: 1 };
    const half = { ...GARDEN_CONFIG.terrain, reliefScale: 0.5 };
    expect(heightAt(0, 0, rolling)).not.toBe(0);
    expect(heightAt(HALF, 0, rolling)).toBe(0);
    for (const [x, z] of [[3, 4], [-7, 2], [1.5, -6]]) {
        expect(heightAt(x, z, half)).toBeCloseTo(heightAt(x, z, rolling) * 0.5, 9);
    }
});

test('the relief rolls without becoming a hillside', () => {
    const rolling = { ...GARDEN_CONFIG.terrain, reliefScale: 1 };
    let min = Infinity, max = -Infinity, steepest = 0;
    for (let x = -HALF; x <= HALF; x += 0.25) {
        for (let z = -HALF; z <= HALF; z += 0.25) {
            const h = heightAt(x, z, rolling);
            if (h < min) min = h;
            if (h > max) max = h;
            const s = slopeAt(x, z, rolling);
            if (s > steepest) steepest = s;
        }
    }
    // Enough to read as ground rather than as a table top. Measured on a
    // ROLLING copy, so the relief's shape stays guaranteed even while the
    // nursery ships levelled: turning the plot back on must not produce
    // ground that is flat, or a hillside.
    expect(max - min).toBeGreaterThan(0.8);
    // And gentle enough that a tree stands on it rather than leaning off it.
    expect(max - min).toBeLessThan(2.5);
    expect(steepest).toBeLessThan(25);
});

test('normals point up out of the surface and are unit length', () => {
    for (const [x, z] of [[0, 0], [4, 4], [-6.5, 2], [11.9, 0], [20, 20]]) {
        const n = normalAt(x, z);
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
        expect(n.y).toBeGreaterThan(0);
    }
    // Dead level out on the flat, where there is no relief left to tilt it.
    const flat = normalAt(30, 30);
    expect(flat.y).toBeCloseTo(1, 9);
    expect(flat.x).toBeCloseTo(0, 9);
    expect(slopeAt(30, 30)).toBeCloseTo(0, 6);
});

// ---- The planting grid -----------------------------------------------------

test('a point snaps to a cell and back to its centre', () => {
    const spacing = PLOT.gridSpacing;
    for (const [x, z] of [[0, 0], [1.1, -2.2], [-7.4, 5.9]]) {
        const cell = snapToGrid(x, z, spacing);
        const centre = cellCenter(cell.gx, cell.gz, spacing);
        // The centre is never further than half a cell from where the visitor
        // actually pointed, or the tree appears somewhere they did not tap.
        expect(Math.abs(centre.x - x)).toBeLessThanOrEqual(spacing / 2 + 1e-9);
        expect(Math.abs(centre.z - z)).toBeLessThanOrEqual(spacing / 2 + 1e-9);
        // And snapping the centre lands back on the same cell.
        expect(snapToGrid(centre.x, centre.z, spacing)).toEqual(cell);
    }
    expect(cellKey(2, -3)).toBe('2,-3');
    expect(cellKey(2, -3)).not.toBe(cellKey(-3, 2));
});

test('no tree can be planted into the wall', () => {
    // Asserted against the WALL, not against the margin formula. This test used
    // to recompute `wall.thickness + gridSpacing` and check the cells matched
    // it, which is the same arithmetic twice and proves only that the constant
    // was copied correctly. When the grid was coarsened in M24-1 the formula
    // changed and this test failed, having caught nothing: no tree had moved
    // any closer to the stonework.
    //
    // What actually has to hold is that the widest thing a cell can hold still
    // clears the inner face of the wall. The mulch bed is wider than any trunk,
    // so the bed is the test.
    const inner = HALF - GARDEN_CONFIG.terrain.wall.thickness;
    const widest = GARDEN_CONFIG.garden.bed.radius;
    for (let gx = -30; gx <= 30; gx++) {
        for (let gz = -30; gz <= 30; gz++) {
            if (!cellInPlot(gx, gz)) continue;
            const { x, z } = cellCenter(gx, gz);
            expect(Math.abs(x) + widest).toBeLessThan(inner);
            expect(Math.abs(z) + widest).toBeLessThan(inner);
        }
    }
});

test('the plot holds far more cells than trees', () => {
    let cells = 0;
    for (let gx = -30; gx <= 30; gx++) {
        for (let gz = -30; gz <= 30; gz++) if (cellInPlot(gx, gz)) cells++;
    }
    // Otherwise the grid, rather than the stated capacity, would be what
    // limits the garden, and it would do it without saying so.
    //
    // THE HEADROOM IS DELIBERATELY THINNER THAN IT WAS. Coarsening the grid in
    // M24-1 took this from 169 cells to 49, so the ratio went from 8.4x the
    // capacity to 2.4x. That was the point of the change and it is still not a
    // cap: a full garden of twenty trees leaves twenty-nine cells open, so
    // there is visibly free ground and a real choice about where to plant. The
    // floor is set at 2x because at 1x the grid IS the cap, whatever the
    // configured capacity says.
    expect(cells).toBeGreaterThan(PLOT.maxTrees * 2);
    // And the failure this guards against is the silent one, so name it: the
    // cell count must never be the smaller of the two limits.
    expect(cells).toBeGreaterThan(PLOT.maxTrees);
});

test('the interaction never says no while there is room', () => {
    // A tap on an occupied cell, or just outside the plantable area, resolves
    // to the nearest spot that works rather than refusing and leaving the
    // visitor to guess what was wrong with where they pointed.
    const occupied = new Set(['0,0']);
    const moved = nearestFreeCell(0, 0, occupied);
    expect(moved).not.toBeNull();
    expect(cellKey(moved.gx, moved.gz)).not.toBe('0,0');
    // One ring out, not two.
    expect(Math.max(Math.abs(moved.gx), Math.abs(moved.gz))).toBe(1);

    // A tap beyond the wall comes back inside.
    const outside = snapToGrid(0, HALF + 4);
    const rescued = nearestFreeCell(outside.gx, outside.gz, new Set());
    expect(rescued).not.toBeNull();
    expect(cellInPlot(rescued.gx, rescued.gz)).toBe(true);
});

test('a genuinely full neighbourhood is reported rather than guessed at', () => {
    // The one case where refusing IS the honest answer. Fill everything within
    // reach of the search and it must return null instead of a cell in a wall.
    const occupied = new Set();
    for (let gx = -30; gx <= 30; gx++) {
        for (let gz = -30; gz <= 30; gz++) occupied.add(cellKey(gx, gz));
    }
    expect(nearestFreeCell(0, 0, occupied)).toBeNull();
});

test('nearestFreeCell prefers a nearer orthogonal to a further diagonal', () => {
    // Within a ring it keeps the closest by true distance, so a tree never
    // jumps diagonally past an open neighbour.
    const occupied = new Set(['0,0']);
    const cell = nearestFreeCell(0, 0, occupied);
    const d = Math.hypot(cell.gx, cell.gz);
    expect(d).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
});

// ---- Seasonal colour -------------------------------------------------------

test('the grass turns with the year', () => {
    const winter = grassColorAt(0);
    const spring = grassColorAt(6);
    const summer = grassColorAt(12);
    const autumn = grassColorAt(18);
    expect(new Set([winter, spring, summer, autumn]).size).toBe(4);

    // Summer is the deepest, so the darkest of the greens; spring is the
    // brightest new growth; winter is dun rather than green.
    expect(luminanceOf(spring)).toBeGreaterThan(luminanceOf(summer));
    expect(luminanceOf(autumn)).toBeGreaterThan(luminanceOf(summer));

    // Straw in autumn has more red than deep summer green does.
    const red = (hex) => (hex >> 16) & 0xff;
    const green = (hex) => (hex >> 8) & 0xff;
    expect(red(autumn) / green(autumn)).toBeGreaterThan(red(summer) / green(summer));
});

test('the grass colour wraps through midnight without a jump', () => {
    // The table has no key at hour 24. If the wrap were wrong it would show up
    // as one frame of the wrong grass at midnight, in the middle of winter,
    // which is exactly where nobody would be looking for it.
    const before = grassColorAt(23.99);
    const after = grassColorAt(0.01);
    for (const shift of [16, 8, 0]) {
        const a = (before >> shift) & 0xff;
        const b = (after >> shift) & 0xff;
        expect(Math.abs(a - b)).toBeLessThan(3);
    }
});

test('THE PLOT NEVER DIPS BELOW THE MEADOW PLANE', () => {
    // The meadow is ONE plane across the whole world, the nursery included,
    // sitting `meadowDrop` below where the two meet. So anything in the plot
    // that sits under it is BEHIND it, and that is not a subtle artefact: it
    // hides the ground, the mulch beds, and the bottoms of the trunks standing
    // on them. At the old `reliefScale` of 1 it swallowed 55 of the 169
    // plantable cells in an L from the back-left corner, and it took a long
    // day of QA to find, because every one of those things measured correct.
    const drop = -GARDEN_CONFIG.terrain.meadowDrop;
    let lowest = Infinity;
    for (let x = -HALF; x <= HALF; x += 0.25) {
        for (let z = -HALF; z <= HALF; z += 0.25) {
            lowest = Math.min(lowest, heightAt(x, z));
        }
    }
    expect(lowest).toBeGreaterThanOrEqual(drop);

    // And the trap this guards: turning the relief back on reintroduces it,
    // so raising reliefScale means giving the meadow a hole rather than a
    // plane. Asserted so the failure names the reason rather than arriving as
    // "the mulch went missing" six rounds into a QA pass.
    const rolling = { ...GARDEN_CONFIG.terrain, reliefScale: 1 };
    let rollingLowest = Infinity;
    for (let x = -HALF; x <= HALF; x += 0.5) {
        for (let z = -HALF; z <= HALF; z += 0.5) {
            rollingLowest = Math.min(rollingLowest, heightAt(x, z, rolling));
        }
    }
    expect(rollingLowest).toBeLessThan(drop);
});
