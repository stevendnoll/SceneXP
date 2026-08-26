// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The world beyond the wall: the shape of the clearing, the wood that fills
 * it, the pond basin, and who is out at which hour.
 *
 * All pure, so no THREE and no DOM.
 *
 * THE LOAD-BEARING TEST HERE IS THE SEAM. The plot's relief damps to zero at
 * its boundary and the outer relief ramps up from it, and the two have to meet
 * at EXACTLY zero. A millimetre of disagreement is a crack all the way round
 * the garden, lit differently on every side, and it would be blamed on the
 * meadow mesh long before anybody suspected two height functions that each
 * look correct on their own.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    heightAt, outerWavesAt, outerReliefAt, worldHeightAt, pondBasinAt, pondWaterLevel
} from '../www/garden/js/terrain.js';
import {
    forestDensityAt, openingHalfWidthAt, scatter, forestColorAt, barenessAt, bloomAt
} from '../www/garden/js/forest.js';
import { presenceAt, WINDOWS } from '../www/garden/js/wildlife.js';
import { luminanceOf } from '../www/garden/js/sky.js';

const PLOT = GARDEN_CONFIG.plot;
const HALF = PLOT.halfSize;
const W = GARDEN_CONFIG.world;

// ---- The seam --------------------------------------------------------------

test('the plot and the world beyond it meet at exactly zero', () => {
    for (let a = -HALF; a <= HALF; a += 0.1) {
        for (const [x, z] of [[a, -HALF], [a, HALF], [-HALF, a], [HALF, a]]) {
            expect(worldHeightAt(x, z)).toBe(0);
        }
    }
    // And the outer relief contributes nothing anywhere inside the plot, so
    // the planted trees stand on the ground the plot mesh actually draws.
    for (const [x, z] of [[0, 0], [8, -8], [-11.5, 11.5]]) {
        expect(outerReliefAt(x, z)).toBe(0);
        expect(worldHeightAt(x, z)).toBe(heightAt(x, z));
    }
});

test('the meadow rolls once it is clear of the plot', () => {
    let min = Infinity, max = -Infinity;
    for (let x = -120; x <= 120; x += 3) {
        for (let z = -120; z <= 120; z += 3) {
            if (Math.max(Math.abs(x), Math.abs(z)) < 20) continue;
            const h = outerWavesAt(x, z);
            if (h < min) min = h;
            if (h > max) max = h;
        }
    }
    // Enough to read as ground rather than a table top, gentle enough that
    // the wood does not climb a hillside.
    expect(max - min).toBeGreaterThan(1);
    expect(max - min).toBeLessThan(5);
});

// ---- The clearing ----------------------------------------------------------

test('no wood grows on the plot', () => {
    for (let x = -HALF; x <= HALF; x += 0.5) {
        for (let z = -HALF; z <= HALF; z += 0.5) {
            expect(forestDensityAt(x, z)).toBe(0);
        }
    }
});

test('the wood closes east, west and south, and opens north', () => {
    // THE SHAPE STEVE ASKED FOR: a clearing with a view. Three sides shut, one
    // side open onto the meadow and the pond.
    expect(forestDensityAt(28, 0)).toBeGreaterThan(0.9);    // east belt
    expect(forestDensityAt(-28, 0)).toBeGreaterThan(0.9);   // west belt
    expect(forestDensityAt(0, 28)).toBeGreaterThan(0.9);    // south, behind
    expect(forestDensityAt(0, -28)).toBe(0);                // the opening
    expect(forestDensityAt(0, -70)).toBe(0);                // still open, far out
});

test('the opening widens as it goes, so the view funnels out', () => {
    const near = openingHalfWidthAt(W.clearing.openFromZ - 10);
    const far = openingHalfWidthAt(W.clearing.openFromZ - 60);
    expect(far).toBeGreaterThan(near);
    // And it is closed behind the plot: the wood is continuous there.
    expect(openingHalfWidthAt(0)).toBe(0);
    expect(openingHalfWidthAt(20)).toBe(0);
});

test('the wood has edges rather than cuts', () => {
    // A density that jumped from 0 to 1 would draw the clearing as a stencil.
    // Walking out from the plot edge, it must rise gradually.
    const samples = [];
    for (let x = W.clearing.innerRadius; x <= W.clearing.innerRadius + W.clearing.rampWidth; x += 1) {
        samples.push(forestDensityAt(x, 0));
    }
    expect(samples[0]).toBeLessThan(0.1);
    expect(samples[samples.length - 1]).toBeGreaterThan(0.9);
    for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
});

test('the wood is the same wood on every visit', () => {
    // A forest that reshuffles between visits would undo the whole point of
    // the garden persisting.
    const a = scatter(W.farForest.spacing, W.farForest.jitter, W.seed, null);
    const b = scatter(W.farForest.spacing, W.farForest.jitter, W.seed, null);
    expect(b.length).toBe(a.length);
    expect(b[0]).toEqual(a[0]);
    expect(b[b.length - 1]).toEqual(a[a.length - 1]);
    // A different seed gives a different wood.
    const c = scatter(W.farForest.spacing, W.farForest.jitter, W.seed + 1, null);
    expect(c[0]).not.toEqual(a[0]);
});

test('the wood is dense enough to close the horizon and cheap enough to draw', () => {
    const trees = scatter(W.farForest.spacing, W.farForest.jitter, W.seed, null);
    expect(trees.length).toBeGreaterThan(600);
    // Four triangles each, in two draw calls. The whole point of impostors.
    expect(trees.length * 4).toBeLessThan(12000);
    // And every one of them is genuinely in the wood.
    for (const tree of trees) expect(forestDensityAt(tree.x, tree.z)).toBeGreaterThan(0);
});

// ---- The wood turns with the year ------------------------------------------

test('the wood turns with the seasons, or the plot looks like a stage set', () => {
    const spring = forestColorAt(6, false);
    const summer = forestColorAt(12, false);
    const autumn = forestColorAt(17, false);
    expect(new Set([spring, summer, autumn]).size).toBe(3);

    // Autumn is warmer than summer: more red relative to green.
    const warmth = (hex) => ((hex >> 16) & 0xff) / (((hex >> 8) & 0xff) || 1);
    expect(warmth(autumn)).toBeGreaterThan(warmth(summer));
    // Spring is lighter than deep summer.
    expect(luminanceOf(spring)).toBeGreaterThan(luminanceOf(summer));

    // An evergreen wood does not turn.
    expect(warmth(forestColorAt(17, true))).toBeLessThan(warmth(autumn));
});

test('the deciduous wood goes bare in winter and is full in summer', () => {
    expect(barenessAt(12)).toBe(0);
    expect(barenessAt(19.5)).toBeGreaterThan(0);
    expect(barenessAt(19.5)).toBeLessThan(1);
    expect(barenessAt(21)).toBeCloseTo(1, 6);
    expect(barenessAt(0)).toBe(1);
});

test('the wildflowers bloom in spring and are over before winter', () => {
    expect(bloomAt(0)).toBe(0);          // winter
    expect(bloomAt(6)).toBeGreaterThan(0);   // spring, coming out
    expect(bloomAt(12)).toBe(1);         // summer, full
    expect(bloomAt(18)).toBe(0);         // autumn, over
    // Monotonic through the spring, so they open rather than flicker.
    let prev = -1;
    for (let h = 3; h <= 7.5; h += 0.25) {
        const b = bloomAt(h);
        expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = b;
    }
});

// ---- The pond --------------------------------------------------------------

test('the pond is a basin, not a plane laid on a field', () => {
    // Water sitting flat on flat ground has no shoreline: its edge is wherever
    // the mesh stops, and it reads as a mirror dropped on the grass.
    expect(pondBasinAt(W.pond.x, W.pond.z)).toBeCloseTo(W.pond.depth, 6);
    expect(pondBasinAt(W.pond.x + W.pond.halfWidth + 1, W.pond.z)).toBe(0);
    expect(pondBasinAt(0, 0)).toBe(0);

    // The dig is smooth all the way to the rim, so no crease catches a low sun.
    let prev = W.pond.depth + 1;
    for (let d = 0; d <= 1; d += 0.05) {
        const v = pondBasinAt(W.pond.x + d * W.pond.halfWidth, W.pond.z);
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        prev = v;
    }
});

test('the water sits below its banks, so there is a shore', () => {
    const level = pondWaterLevel();
    // Deeper than the water at the middle: the pond is filled, not brimming.
    expect(worldHeightAt(W.pond.x, W.pond.z)).toBeLessThan(level);
    // And dry ground just outside it.
    expect(worldHeightAt(W.pond.x + W.pond.halfWidth + 3, W.pond.z)).toBeGreaterThan(level);
});

test('the pond sits in the opening, not in the wood', () => {
    // A pond behind the treeline would be a pond nobody can see.
    // Sampled over the WATER, which is an ellipse, not its bounding box: the
    // corners of the box are dry ground and testing them asks the wrong
    // question. Anywhere the basin is dug, the wood must not be.
    const wet = [];
    for (let x = W.pond.x - W.pond.halfWidth; x <= W.pond.x + W.pond.halfWidth; x += 0.5) {
        for (let z = W.pond.z - W.pond.halfDepth; z <= W.pond.z + W.pond.halfDepth; z += 0.5) {
            if (pondBasinAt(x, z) > 0) wet.push([x, z]);
        }
    }
    expect(wet.length).toBeGreaterThan(500);
    for (const [x, z] of wet) {
        expect(`density at ${x.toFixed(1)},${z.toFixed(1)}: ${forestDensityAt(x, z)}`)
            .toBe(`density at ${x.toFixed(1)},${z.toFixed(1)}: 0`);
    }
});

// ---- The vista fits the frame ----------------------------------------------

test('nothing in the vista is placed where the camera cannot see it', () => {
    const cam = GARDEN_CONFIG.camera;
    // camera.far clips at 400: a ridge past it is not distant, it is absent.
    for (const layer of W.mountains.layers) {
        const distance = Math.hypot(layer.distance, cam.position.z);
        expect(distance).toBeLessThan(cam.far);
    }
    // And the taller ridge must still fit under the top of the frame.
    const pitch = Math.atan2(cam.position.y - cam.lookAt.y,
        Math.hypot(cam.lookAt.x - cam.position.x, cam.lookAt.z - cam.position.z)) * 180 / Math.PI;
    const topOfFrame = cam.fov / 2 - pitch;
    for (const layer of W.mountains.layers) {
        const d = Math.hypot(layer.distance, cam.position.z);
        const elevation = Math.atan2(layer.height - cam.position.y, d) * 180 / Math.PI;
        expect(elevation).toBeLessThan(topOfFrame);
    }
});

test('the mountains are drawn without scene fog, because fog would erase them', () => {
    // Scene fog is total past 260 m. A ridge at 340 with fog on is painted
    // exactly the colour of the sky behind it.
    for (const layer of W.mountains.layers) {
        expect(layer.distance).toBeGreaterThan(GARDEN_CONFIG.sky.fog.far);
    }
});

// ---- Who is out ------------------------------------------------------------

test('every creature keeps its own hours', () => {
    // A firefly blinking at noon would say the calendar is decorative.
    expect(presenceAt(12, WINDOWS.butterflies)).toBe(1);
    expect(presenceAt(12, WINDOWS.fireflies)).toBe(0);
    expect(presenceAt(12, WINDOWS.bats)).toBe(0);

    expect(presenceAt(0, WINDOWS.bats)).toBe(1);
    expect(presenceAt(0, WINDOWS.butterflies)).toBe(0);

    expect(presenceAt(20, WINDOWS.fireflies)).toBeGreaterThan(0.5);
    expect(presenceAt(6, WINDOWS.birdsDawn)).toBeGreaterThan(0.5);
    expect(presenceAt(18, WINDOWS.birdsDusk)).toBeGreaterThan(0.5);
});

test('the bats window wraps through midnight without a gap', () => {
    // The interval that wraps is where every off-by-one in this scene has
    // landed, so it gets its own test.
    for (const hour of [21, 22.5, 23.9, 0, 1, 2]) {
        expect(presenceAt(hour, WINDOWS.bats)).toBeGreaterThan(0.5);
    }
    expect(presenceAt(12, WINDOWS.bats)).toBe(0);
    expect(presenceAt(6, WINDOWS.bats)).toBe(0);
});

test('nobody appears or vanishes in a single frame', () => {
    for (const window of Object.values(WINDOWS)) {
        let prev = presenceAt(0, window);
        for (let h = 0.05; h < 24; h += 0.05) {
            const now = presenceAt(h, window);
            // A jump bigger than the fade allows would be a pop.
            expect(Math.abs(now - prev)).toBeLessThan(0.25);
            prev = now;
        }
    }
});
