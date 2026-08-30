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
import { cellCenter, cellInPlot, heightAt } from '../www/garden/js/terrain.js';
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
    // The nursery ships LEVELLED, so on the shipped config every rim sample
    // equals the centre and this rule costs nothing. It has to keep working
    // if the plot is ever rolled again, which is one config number away, so
    // the claim is made against rolling ground: across a bed's footprint the
    // rim genuinely differs from the middle, which is why `groundUnderBed`
    // samples the rim at all.
    const rolling = { ...GARDEN_CONFIG.terrain, reliefScale: 1 };
    const cells = plantableCells();
    const varied = cells.filter(({ x, z }) => {
        let low = heightAt(x, z, rolling);
        let high = low;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const h = heightAt(x + Math.cos(a) * B.radius, z + Math.sin(a) * B.radius, rolling);
            low = Math.min(low, h);
            high = Math.max(high, h);
        }
        return high - low > 0.02;
    });
    expect(varied.length).toBeGreaterThan(cells.length / 2);

    // And on the levelled plot every bed is identical bar its x and z, which
    // is the point of levelling: one shape, one height, everywhere.
    const spans = plantableCells().map(({ x, z }) => bedSpan(x, z));
    for (const s of spans) {
        expect(s.top).toBeCloseTo(spans[0].top, 9);
        expect(s.height).toBeCloseTo(spans[0].height, 9);
    }
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

test('the bed, the level and the droplet are never ray targets', async () => {
    // All three are screen-space. A bed that answered a ray would intercept the
    // ground pick that decides where a new tree goes, and the tap would do
    // nothing. The droplet joins them for the same reason and one more: it is
    // sized in PIXELS by its vertex shader, so its geometry is a unit quad and
    // a ray against that would test a shape a hundredth of the drawn size.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'beds.js'), 'utf8');
    const noops = src.match(/raycast = \(\) => \{ \};/g) || [];
    expect(noops.length).toBe(3);
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
    expect(src).toMatch(/window\.innerHeight \/ \(camera\.fov \* Math\.PI \/ 180\)/);
    // TWO THINGS HOLD A SIZE ON SCREEN NOW, the water level in the beds and
    // the fireflies' glow (M12-8), and they must be handed the SAME number.
    // Measuring it twice is how the two would drift apart on a resize.
    expect(src).toMatch(/updateWildlife\([^)]*pxPerRadian[^)]*\)/);
    expect(src).toMatch(/^\s*pxPerRadian$/m);
    expect(src.match(/window\.innerHeight \/ \(camera\.fov/g)).toHaveLength(1);
});

// ---- The gauge at zero, and the droplet over it (M13) -----------------------

/**
 * WHY THIS SECTION IS ARITHMETIC AND NOT SCREENSHOTS.
 *
 * QA let several years pass without watering and reported that the gauges "get
 * lost in the mulch" on a row of dead trees. That is a contrast claim, and a
 * contrast claim can be settled exactly: take the colour the pixel will
 * actually be, after the tone curve and the sRGB encode, and put it against the
 * colour the thing behind it will actually be. `shownColor` is the same
 * function the sky solves with, for the same reason.
 *
 * The cause turned out to be structural rather than a matter of taste. The
 * amber was painted on the FILL, and an empty tank has no fill, so the one
 * colour that meant "out of water" was the one colour that could not appear on
 * a tree that was out of water.
 */
const { shownColor, luminanceOf } = await import('../www/garden/js/sky.js');
const {
    dropPresence, dropScreenY, pickDrop, thirstyCount
} = await import('../www/garden/js/beds.js');

/** Relative luminance of what the pixel will show. */
function shownLum(hex) {
    return luminanceOf(shownColor(hex, 1, GARDEN_CONFIG.sky.exposure));
}

/** WCAG contrast ratio between two colours as they will be SHOWN. */
function contrast(a, b) {
    const la = shownLum(a);
    const lb = shownLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The bed under snow, which is the other thing the gauge lies on. */
function snowyBed() {
    const mix = (x, y) => Math.round(x + (y - x) * B.snowMix);
    const bed = [B.color >> 16 & 255, B.color >> 8 & 255, B.color & 255];
    const snow = [
        GARDEN_CONFIG.terrain.snowColor >> 16 & 255,
        GARDEN_CONFIG.terrain.snowColor >> 8 & 255,
        GARDEN_CONFIG.terrain.snowColor & 255
    ];
    return (mix(bed[0], snow[0]) << 16) | (mix(bed[1], snow[1]) << 8) | mix(bed[2], snow[2]);
}

test('AN EMPTY TANK IS LEGIBLE ON THE MULCH IT LIES ON', () => {
    // The whole of the bug, as one number. At moisture 0 the interior of the
    // gauge is one flat colour, and this asserts that colour can be seen
    // against mulch. 3:1 is the figure for a graphical object.
    const mulch = B.color;
    expect(contrast(B.levelEmptyColor, mulch)).toBeGreaterThanOrEqual(3);

    // AND THE OLD MODEL FAILS IT, which is what makes the assertion above a
    // guard rather than a restatement. With the amber on the fill, an empty
    // tank showed the track and the rim and nothing else, and neither of them
    // reaches 3:1 on mulch. If someone moves the urgency back to the water,
    // this is the line that says why they must not.
    expect(contrast(B.levelTrackColor, mulch)).toBeLessThan(3);
    expect(contrast(B.levelBorderColor, mulch)).toBeLessThan(3);
});

test('and on everything else a gauge is ever seen against', () => {
    // A gauge lies on mulch for most of the year and on a snow-covered bed for
    // the rest, and the fix for one must not cost the other. Each background
    // needs ONE part of the gauge that clears 3:1 against it, not all of them:
    // a readout with a rim is legible when either the rim or the interior is,
    // which is the whole reason it has a rim.
    const parts = [B.levelFullColor, B.levelEmptyColor, B.levelTrackColor, B.levelBorderColor];
    for (const ground of [B.color, snowyBed(), GARDEN_CONFIG.terrain.snowColor]) {
        const best = Math.max(...parts.map((p) => contrast(p, ground)));
        expect(best).toBeGreaterThanOrEqual(3);
    }
});

test('THE FILL EDGE IS DRAWN, because blue on amber is not a luminance step', () => {
    // Water and thirst are a HUE pair. Measured, they are within 1.2:1 of each
    // other, so the boundary between them, which is the entire reading of a
    // gauge, would be invisible at 8 px and gone completely without colour
    // vision. The tick is what carries it, and it has to be legible against
    // both sides or it is decoration.
    expect(contrast(B.levelFullColor, B.levelEmptyColor)).toBeLessThan(1.5);
    expect(contrast(B.levelBorderColor, B.levelFullColor)).toBeGreaterThanOrEqual(3);
    expect(contrast(B.levelBorderColor, B.levelEmptyColor)).toBeGreaterThanOrEqual(3);
    expect(contrast(B.levelBorderColor, B.levelTrackColor)).toBeGreaterThanOrEqual(3);

    // And it is a hairline rather than a band: in bar heights, like the rim
    // beside it, on a bar that floors at 8 px.
    expect(B.levelTickWidth * B.minLevelPx).toBeGreaterThan(0.75);
    expect(B.levelTickWidth * B.minLevelPx).toBeLessThan(3);
});

// ---- The droplet is a button ------------------------------------------------

test('a droplet appears at the thirst line and not at the gauge line', () => {
    const M = GARDEN_CONFIG.garden.moisture;
    // Two signals, two thresholds, and the droplet's is the later one. A gauge
    // going amber says "soon"; a droplet says "now" and offers to fix it. If
    // these ever collapse into one number the scene has one signal wearing two
    // costumes.
    expect(M.thirstyBelow).toBeLessThan(B.noticeAbove);

    expect(dropPresence(1)).toBe(0);
    expect(dropPresence(B.noticeAbove)).toBe(0);
    expect(dropPresence(M.thirstyBelow + 0.001)).toBe(0);
    expect(dropPresence(M.thirstyBelow - B.dropFadeSpan)).toBe(1);
    expect(dropPresence(0)).toBe(1);

    // It ARRIVES rather than blinking on, and most of the way down it is
    // already fully there: a control that is half drawn is one a visitor is not
    // sure they may press.
    const mid = dropPresence(M.thirstyBelow - B.dropFadeSpan / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(B.dropFadeSpan).toBeLessThan(M.thirstyBelow / 2);
});

/** A projected tree, the shape `projectBases` hands the pick functions. */
function baseAt(x, y, thirst = 1, radiusPx = B.minPickPx) {
    // The gauge's anchor sits a little ABOVE the bed's base point, measured at
    // 3 to 4 px across the plot. The droplet rises from the anchor.
    const entry = { record: { moisture: thirst > 0 ? 0 : 1 } };
    return { entry, x, y, radiusPx, thirst, dropY: dropScreenY(y - 3.5) };
}

test('THE TWO TARGETS OVERLAP, which is why precedence is an order', () => {
    // The measurement the design rests on. The droplet is drawn above a gauge
    // whose anchor is only 3 to 4 px above the bed's own base point, so a 44 px
    // droplet target and a 44 px bed target cannot help sharing a band of
    // screen between them. Asking "which centre is nearer" in that band would
    // be settled by a pixel or two, which is a coin toss.
    const base = baseAt(400, 400);
    const dropBottom = base.dropY + B.dropPickPx;
    const bedTop = base.y - bedPickRadius(base.radiusPx);
    expect(dropBottom).toBeGreaterThan(bedTop);

    // A real band, not a rounding error, and every pixel of it is claimed by
    // both functions. Only the ORDER they are called in decides, which is the
    // assertion that breaks if someone tidies the pick into a single
    // nearest-wins pass over one list.
    expect(dropBottom - bedTop).toBeGreaterThan(10);
    const shared = (dropBottom + bedTop) / 2;
    expect(pickDrop(base.x, shared, [base])).toBe(base.entry);
    expect(pickBase(base.x, shared, [base])).toBe(base.entry);

    // What the rise buys, and the reason it is 26 rather than 17: the drawn
    // droplet's own centre is clear of the bed's circle entirely, so a visitor
    // aiming AT the droplet is never in the disputed band at all.
    expect(base.y - base.dropY).toBeGreaterThan(bedPickRadius(base.radiusPx));
});

test('and the bed keeps a real target underneath it', () => {
    // The other half of that trade: the droplet must not swallow the bed, or a
    // thirsty tree's card becomes unreachable. Below the droplet's reach the
    // bed is alone, and what is left has to be big enough to hit.
    const base = baseAt(400, 400);
    const floor = base.y + bedPickRadius(base.radiusPx);   // bottom of the bed
    const ceiling = base.dropY + B.dropPickPx;             // bottom of the drop
    expect(ceiling).toBeLessThan(floor);
    // A band, in pixels, that belongs to the bed alone.
    expect(floor - ceiling).toBeGreaterThan(24);

    const inBand = (floor + ceiling) / 2;
    expect(pickDrop(base.x, inBand, [base])).toBeNull();
    expect(pickBase(base.x, inBand, [base])).toBe(base.entry);
});

test('the droplet is a 44 px target even though it is a 17 px drawing', () => {
    // The figure for a touch target. The drawing stays small because a droplet
    // the size of its own target would read as weather rather than a control.
    expect(B.dropPickPx * 2).toBeGreaterThanOrEqual(44);
    expect(B.dropSizePx).toBeLessThan(B.dropPickPx * 2);
});

test('A TREE THAT IS NOT ASKING HAS NO BUTTON', () => {
    // An invisible button is worse than no button: it would water a tree that
    // the visitor was trying to open the card on, and nothing on screen would
    // have suggested it might.
    const quiet = baseAt(400, 400, 0);
    expect(pickDrop(quiet.x, quiet.dropY, [quiet])).toBeNull();
    // And the bed still answers, exactly as it did before any of this existed.
    expect(pickBase(quiet.x, quiet.y, [quiet])).toBe(quiet.entry);
});

test('nearest still wins among droplets, and behind never does', () => {
    // Two adjacent trees are 41 px apart at the back of the plot, so their
    // droplet targets overlap each other as well as their own beds.
    const near = baseAt(400, 400);
    const far = baseAt(430, 400);
    expect(pickDrop(405, near.dropY, [near, far])).toBe(near.entry);
    expect(pickDrop(426, far.dropY, [near, far])).toBe(far.entry);

    // A tree behind the eye projects to mirrored numbers, so it has to be
    // skipped rather than measured. Same rule the bed pick has always had.
    expect(pickDrop(400, 400, [{ entry: {}, behind: true, thirst: 1 }])).toBeNull();
});

test('a tap outside the ring is nobody s droplet', () => {
    const base = baseAt(400, 400);
    expect(pickDrop(base.x + B.dropPickPx + 2, base.dropY, [base])).toBeNull();
    expect(pickDrop(base.x, base.dropY - B.dropPickPx - 2, [base])).toBeNull();
});

// ---- Water all --------------------------------------------------------------

test('Water all counts what is asking, and stays a rescue', () => {
    const M = GARDEN_CONFIG.garden.moisture;
    const trees = [0, 0.1, M.thirstyBelow, 0.6, 1].map((m) => ({ record: { moisture: m } }));
    // Exactly at the line is not below it, which is the same boundary
    // `needsWater` and the droplet both use.
    expect(thirstyCount(trees)).toBe(2);
    expect(thirstyCount([])).toBe(0);

    // NOT A PERMANENT BUTTON. M11-4 took the free water out of this scene so
    // that showing up meant something, and a Water all that is always there
    // hands it straight back: it becomes the only control anybody uses and the
    // droplets become decoration. It has to take more than a tended garden's
    // ordinary backlog to bring it out.
    expect(M.waterAllFrom).toBeGreaterThan(1);
    expect(M.waterAllFrom).toBeLessThan(GARDEN_CONFIG.plot.maxTrees / 2);
});

// ---- The conductor's half of it --------------------------------------------

test('THE DROPLET IS TRIED BEFORE THE BED, and that order is the design', async () => {
    // The targets overlap, so nothing about the geometry settles a tap in the
    // shared band. What settles it is that one call comes first. This test
    // reads the source because the order of two statements is the entire
    // mechanism, and there is no number anywhere that records it.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    const handler = src.slice(src.indexOf('function handleSceneTap'));
    const body = handler.slice(0, handler.indexOf('\n}\n'));

    expect(body).toMatch(/pickDrop\(/);
    expect(body).toMatch(/pickBase\(/);
    expect(body.indexOf('pickDrop(')).toBeLessThan(body.indexOf('pickBase('));
    // One projection feeding both, or the two could disagree about where a tree
    // is by a frame.
    expect(body).toMatch(/const bases = projectBases\(\)/);
    expect(body.match(/projectBases\(\)/g)).toHaveLength(1);
});

test('the drawn droplet and the tappable one share ONE number', async () => {
    // The failure this exists to stop is a button that is not under its own
    // picture. The shader lifts the droplet off the gauge's anchor by
    // dropRisePx in view space and dropScreenY subtracts dropRisePx from the
    // projected anchor, so there is one config key and no second copy of the
    // offset anywhere.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const beds = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'beds.js'), 'utf8');
    const main = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');

    // The shader's uniform comes from the config key, and nothing else sets it.
    expect(beds).toMatch(/uRisePx:\s*\{\s*value:\s*B\.dropRisePx\s*\}/);
    expect(beds).toMatch(/mv\.y \+= uRisePx \* dropMetre/);
    // The CPU side reads the same key, once.
    expect(beds).toMatch(/return anchorY - config\.garden\.bed\.dropRisePx/);
    expect(beds.match(/dropRisePx/g)).toHaveLength(3);

    // And the conductor projects the GAUGE'S anchor rather than inventing one,
    // so the drawing and the target start from the same point in the world.
    expect(main).toMatch(/gaugePoint\.set\(x, span\.top \+ B\.levelLift, z \+ B\.radius \* 0\.72\)/);
    expect(main).toMatch(/dropY: dropScreenY\(/);
});

test('Water all leaves the tab order when it leaves the screen', async () => {
    // The bug only keyboard visitors meet: a control faded out of sight but
    // still focusable is a stop on the way to everything else, and it does
    // nothing when it is reached. Hiding has to be both, every time.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    const fn = src.slice(src.indexOf('function syncWaterAll'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/classList\.toggle\('visible', show\)/);
    expect(body).toMatch(/hidden = !show/);
    // It says the count out loud, so the button is a reading of the garden and
    // not only an action on it.
    expect(body).toMatch(/thirstyCount\(/);
    expect(body).toMatch(/aria-label/);

    // AND IT IS A REAL BUTTON, because it is the keyboard's only route to the
    // care loop: every other way to water a tree needs a pointer aimed at a few
    // pixels of 3D scene.
    const html = readFileSync(join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    expect(html).toMatch(/<button id="water-all" type="button" class="water-all" hidden>/);
});
