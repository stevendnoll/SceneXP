// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The mulch bed under each planted tree (M10).
 *
 * THE LOAD-BEARING CLAIM IN THIS FILE IS A MEASUREMENT, and it is the reason
 * the bed is picked in screen space rather than raycast. A bed is a disc lying
 * on the ground, the camera looks along that ground at about 17 degrees, and at
 * the back of the plot the disc is a few pixels tall. Every test below either
 * pins that measurement or pins a rule that exists because of it.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    groundUnderBed, bedSpan, bedPickRadius, pickBase, levelFill, levelUrgency
} from '../www/garden/js/beds.js';
import { cellCenter, cellInPlot } from '../www/garden/js/terrain.js';
import { plantingGrowth, currentHeight, createRecord } from '../www/garden/js/garden.js';
import { SPECIES, speciesById } from '../www/garden/js/species.js';

const B = GARDEN_CONFIG.garden.bed;
const CAM = GARDEN_CONFIG.camera;

/** Every cell a tree can actually be planted in. */
function plantableCells() {
    const cells = [];
    for (let gx = -20; gx <= 20; gx++) {
        for (let gz = -20; gz <= 20; gz++) {
            if (cellInPlot(gx, gz)) cells.push(cellCenter(gx, gz));
        }
    }
    return cells;
}

/** How a horizontal disc of this radius lands on a 1280x800 frame, in pixels,
 *  seen from the composed camera. The arithmetic the design rests on. */
function projectedBed(z, radius = B.radius, frameHeight = 800) {
    const pxPerRad = frameHeight / (CAM.fov * Math.PI / 180);
    const distance = Math.hypot(CAM.position.y, CAM.position.z - z);
    const width = (2 * radius / distance) * pxPerRad;
    // Foreshortened by the sine of the angle the eye looks down at.
    return { width, height: width * (CAM.position.y / distance) };
}

// ---- Why the bed cannot be raycast -----------------------------------------

test('A BED AT THE BACK OF THE PLOT IS A FEW PIXELS TALL', () => {
    // This is the whole reason `pickBase` exists. If this test ever fails
    // because the camera or the bed moved, a ray against the disc may have
    // become reasonable again and the screen-space pick could be reconsidered.
    const half = GARDEN_CONFIG.plot.halfSize;
    const far = projectedBed(-half);
    const near = projectedBed(half - 2);

    expect(far.height).toBeLessThan(8);
    expect(far.width).toBeGreaterThan(20);
    // And it is not that the bed is small, it is that it is FLAT: the same bed
    // at the front of the plot is several times taller on screen.
    expect(near.height / far.height).toBeGreaterThan(4);
});

test('a bed big enough to tap at the back would swallow its neighbours', () => {
    // The other half of the argument: the escape hatch of "just make it bigger"
    // is closed by the planting grid, and this is the arithmetic that closes it.
    const half = GARDEN_CONFIG.plot.halfSize;
    const spacing = GARDEN_CONFIG.plot.gridSpacing;
    // What radius would put 44 px of height at the back?
    const far = projectedBed(-half, 1);
    const needed = 44 / far.height;
    expect(needed * 2).toBeGreaterThan(spacing);
    // Whereas the bed we draw leaves a clear gap between adjacent cells.
    expect(B.radius * 2).toBeLessThan(spacing);
});

test('A BED IS BIG ENOUGH TO SEE AT THE BACK OF THE PLOT', () => {
    // The bug that took a whole afternoon: QA reported missing mulch, and the
    // beds were in the scene, visible, counted, correctly placed, on a shader
    // that compiled. They were 22 x 5 px, with a Coast Redwood's 9 px trunk
    // straight through the middle. Drawn is not the same as seen, and nothing
    // in the suite had ever asked how big the thing lands.
    //
    // THE LIP IS WHAT CARRIES THIS. A flat disc is foreshortened by the
    // camera's ~17 degrees and a vertical edge is not, so the edge is worth
    // more than the width, and the width is capped by the planting grid.
    const half = GARDEN_CONFIG.plot.halfSize;
    const worst = projectedBed(-half, B.radius, 640);
    const lipPx = (B.lip / Math.hypot(CAM.position.y, CAM.position.z + half)) * (640 / (CAM.fov * Math.PI / 180));

    expect(worst.width).toBeGreaterThan(20);
    // Top face plus the edge below it: the whole silhouette, on a small window.
    expect(worst.height + lipPx).toBeGreaterThan(8);
    // The trunk of the largest species covers the middle, so what has to
    // survive is what is left either side of it.
    const trunk = 2 * GARDEN_CONFIG.plot.maxTreeHeight * GARDEN_CONFIG.tree.trunkRadiusRatio;
    expect(worst.width - (trunk / (2 * B.radius)) * worst.width).toBeGreaterThan(8);
});

test('and it still cannot touch its neighbour', () => {
    // The grid is the ceiling on making a bed easier to see. Two beds on
    // adjacent cells must leave grass between them, or the tap stops being
    // unambiguous by construction, which is the whole reason the bed exists.
    expect(2 * B.radius).toBeLessThan(GARDEN_CONFIG.plot.gridSpacing);
    expect(GARDEN_CONFIG.plot.gridSpacing - 2 * B.radius).toBeGreaterThan(0.15);
    // And the height cap must leave room for the lip on the steepest ground,
    // or the cap quietly eats the edge exactly where the relief is worst.
    expect(B.maxHeight).toBeGreaterThan(B.lip + B.skirt + 0.36);
});

// ---- The bed sits on rolling ground ----------------------------------------

test('NO BED BURIES ITS DOWNHILL EDGE OR FLOATS ON ITS UPHILL ONE', () => {
    // Measured across every plantable cell rather than eyeballed at the middle,
    // because the plot's relief is what makes this fail and the middle is flat.
    let worstBury = -Infinity;
    let worstFloat = -Infinity;
    let tallest = 0;

    for (const { x, z } of plantableCells()) {
        const ground = groundUnderBed(x, z, B.radius);
        const span = bedSpan(x, z);
        worstBury = Math.max(worstBury, ground.high - span.top);
        worstFloat = Math.max(worstFloat, span.bottom - ground.low);
        tallest = Math.max(tallest, span.height);
    }

    expect(worstBury).toBeLessThanOrEqual(0);
    expect(worstFloat).toBeLessThanOrEqual(0);
    // It clears by exactly the lip and the skirt, which says the span is
    // derived from the ground rather than padded until it looked right.
    expect(worstBury).toBeCloseTo(-B.lip, 6);
    expect(worstFloat).toBeCloseTo(-B.skirt, 6);
    // And the cap never bites anywhere on this plot, so no bed is a pillar.
    expect(tallest).toBeLessThan(B.maxHeight);
});

test('the ground sample looks at the rim, not just the middle', () => {
    // A version that read `heightAt` at the centre alone would pass the span
    // tests on flat ground and bury every bed on a slope.
    const cells = plantableCells();
    const varied = cells.filter(({ x, z }) => {
        const g = groundUnderBed(x, z, B.radius);
        return g.high - g.low > 0.02;
    });
    expect(varied.length).toBeGreaterThan(cells.length / 2);
});

// ---- Picking ---------------------------------------------------------------

test('the pick radius follows the drawn bed, with a floor', () => {
    expect(bedPickRadius(60)).toBe(60 * B.pickScale);
    expect(bedPickRadius(4)).toBe(B.minPickPx);
    expect(bedPickRadius(0)).toBe(B.minPickPx);
    // The floor is a real touch target rather than a gesture at one.
    expect(B.minPickPx * 2).toBeGreaterThanOrEqual(44);
});

test('NEAREST WINS between two trees whose targets overlap', () => {
    // Two trees on adjacent cells are 1.5 m apart, which is about 24 px at the
    // back of the plot, so their targets overlap heavily. "Which disc did the
    // ray hit" has no answer there and "which centre is closest" always does.
    const a = { entry: 'a', x: 100, y: 200, radiusPx: 12 };
    const b = { entry: 'b', x: 124, y: 200, radiusPx: 12 };
    expect(pickBase(104, 200, [a, b])).toBe('a');
    expect(pickBase(120, 200, [a, b])).toBe('b');
    // Dead centre between them resolves to one of them rather than to nothing.
    expect(pickBase(112, 200, [a, b])).not.toBeNull();
    // Order must not decide it.
    expect(pickBase(104, 200, [b, a])).toBe('a');
});

test('a tap that is on no bed is a tap that plants', () => {
    const only = { entry: 'a', x: 100, y: 200, radiusPx: 12 };
    expect(pickBase(100 + B.minPickPx + 1, 200, [only])).toBeNull();
    expect(pickBase(400, 400, [only])).toBeNull();
    expect(pickBase(100, 200, [])).toBeNull();
});

test('a tree behind the camera can never be picked', () => {
    // `project` still returns numbers behind the eye and they are MIRRORED, so
    // a tree the visitor has dollied past would otherwise answer taps on the
    // far side of the screen. The dolly makes this reachable: the close end of
    // the track stands the eye inside the plot, with trees behind it.
    //
    // The coordinates here are deliberately ones that WOULD match. A first
    // version of this test passed a flagged entry with no x or y at all, which
    // made every comparison NaN and returned null by accident: it went on
    // passing with the skip deleted.
    const behind = { entry: 'a', x: 100, y: 200, radiusPx: 30, behind: true };
    const front = { entry: 'b', x: 400, y: 200, radiusPx: 30 };
    expect(pickBase(100, 200, [behind])).toBeNull();
    expect(pickBase(100, 200, [behind, front])).toBeNull();
    // And the one in front is still perfectly pickable.
    expect(pickBase(400, 200, [behind, front])).toBe('b');
    // A hole in the list is skipped rather than thrown on.
    expect(pickBase(400, 200, [null, front])).toBe('b');
});

// ---- The water level -------------------------------------------------------

test('the level is QUIET WHEN FULL and plain when empty', () => {
    // Addendum B took everything out of this frame that competed with the
    // swaying, and M10 puts sixteen readouts back. This is the rule that keeps
    // a healthy garden looking like a garden.
    expect(levelUrgency(1)).toBe(0);
    expect(levelUrgency(B.noticeAbove)).toBe(0);
    expect(levelUrgency(0)).toBe(1);
    // Monotonic on the way down, so it never brightens as a tree is watered.
    let previous = -1;
    for (let m = 0; m <= 1.0001; m += 0.02) {
        const u = levelUrgency(Math.min(1, m));
        expect(u).toBeLessThanOrEqual(previous === -1 ? 1 : previous + 1e-9);
        previous = u;
    }
    // Watering puts it back to silent rather than merely less shrill.
    expect(levelUrgency(1)).toBe(0);
});

test('the fill is the tank, and it is clamped', () => {
    expect(levelFill(0.5)).toBe(0.5);
    expect(levelFill(0)).toBe(0);
    expect(levelFill(1)).toBe(1);
    expect(levelFill(-1)).toBe(0);
    expect(levelFill(9)).toBe(1);
    // The level says something before the old marker did. The marker appeared
    // at `thirstyBelow`; the level has been visibly draining since well above.
    expect(B.noticeAbove).toBeGreaterThan(GARDEN_CONFIG.garden.moisture.thirstyBelow);
});

// ---- A tree is planted as a sapling (M10-1) --------------------------------

test('A FRESH PLANTING IS A VISIBLE TREE, measured in metres', () => {
    // The note was "the saplings are not even visible", so the assertion is
    // about HEIGHT rather than about the growth number that produces it.
    const growth = plantingGrowth();
    for (const species of SPECIES) {
        const height = currentHeight({ growth }, species);
        expect(height).toBeGreaterThan(species.matureHeight * 0.45);
        // And still plainly a young tree, or the growth arc has been given up.
        expect(height).toBeLessThan(species.matureHeight * 0.75);
    }
    // Past the point where the first leaves arrive, so a new tree has a canopy
    // rather than being a colourless twig for its first ninety seconds.
    expect(growth).toBeGreaterThan(0.32);
});

test('ONLY THE GROWTH STARTS FORWARD', () => {
    // `plantedAt` drives the decline schedule, so backdating it would hand the
    // visitor a tree already part-way through its first drought.
    const at = 1234;
    const record = createRecord(SPECIES[0].id, undefined, 0, 0, at, 7);
    expect(record.growth).toBeCloseTo(plantingGrowth(), 9);
    expect(record.plantedAt).toBe(at);
    expect(record.lastWateredAt).toBe(at);
    expect(record.health).toBe(1);
    expect(record.moisture).toBe(1);
    expect(record.bud).toBe(0);
});

test('the planting age and the growth cannot drift apart', () => {
    const G = GARDEN_CONFIG.garden;
    expect(plantingGrowth()).toBeCloseTo(G.plantAgeYears / G.maturityYears, 9);
    // A garden that opened before this existed still loads: growth is
    // persisted, so an older record carries its own value rather than this one.
    expect(plantingGrowth({ garden: { plantAgeYears: 0, maturityYears: 4.5 } })).toBe(0);
});

// ---- The rule itself (M10-3) -----------------------------------------------

test('THE CANOPY NO LONGER OUTRANKS THE GROUND', async () => {
    // The deliberate consequence of the bed rule is that tapping a tree's
    // LEAVES plants a tree behind it. That is what makes the interaction
    // unambiguous rather than a side effect of it, and this is the rule
    // somebody will quietly put back the first time it surprises them.
    //
    // A text assertion because the alternative cannot be driven here: the pick
    // needs a live camera to project against, and under the THREE stub a
    // projected point is a proxy holding no numbers. What CAN be pinned exactly
    // is that the tap handler asks the beds and asks nothing else.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    const handler = src.slice(src.indexOf('function handleSceneTap'));
    const body = handler.slice(0, handler.indexOf('\n}\n'));

    expect(body).toMatch(/pickBase\(/);
    // No ray is cast at a tree, by any name. The old version raycast every
    // tree group and walked a tolerance ring around the miss.
    expect(body).not.toMatch(/pickTree|intersectObjects/);
    expect(src).not.toMatch(/function pickTree/);
    // The ground pick stays: it is what turns a tap into a plantable cell.
    expect(body).toMatch(/pickGround\(/);
});

test('the bed and the level are never ray targets', async () => {
    // Both are readouts. A bed that answered a ray would intercept the ground
    // pick that decides where a new tree goes, and the tap would do nothing.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'beds.js'), 'utf8');
    const noops = src.match(/raycast = \(\) => \{ \};/g) || [];
    expect(noops.length).toBe(2);
});

test('the conductor is the one that knows the lens', async () => {
    // The last link in the chain, and the only one that cannot be driven here:
    // under the THREE stub `camera.fov` is a proxy, so the arithmetic below
    // comes out NaN and nothing can be read back off it. The other two links
    // are behavioural (see garden-scene.test.mjs).
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    // Viewport height over the vertical field in radians, both of which move:
    // the composed FOV differs by orientation and a window can be resized.
    expect(src).toMatch(/pxPerRadian:/);
    expect(src).toMatch(/window\.innerHeight \/ \(camera\.fov \* Math\.PI \/ 180\)/);
});
