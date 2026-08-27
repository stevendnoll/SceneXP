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
    heightAt, outerWavesAt, outerReliefAt, worldHeightAt, pondBasinAt, pondWaterLevel,
    pondHalfWidth
} from '../www/garden/js/terrain.js';
import {
    forestDensityAt, scatter, forestColorAt, barenessAt, bloomAt,
    clearsCamera, openingHalfWidthAt
} from '../www/garden/js/forest.js';
import { presenceAt, WINDOWS } from '../www/garden/js/wildlife.js';
import { luminanceOf } from '../www/garden/js/sky.js';
import { dollyView, dollyTrackZ, tiltedLookY } from '../www/garden/js/view.js';

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
    expect(pondBasinAt(W.pond.x + pondHalfWidth() + 1, W.pond.z)).toBe(0);
    expect(pondBasinAt(0, 0)).toBe(0);

    // The dig is smooth all the way to the rim, so no crease catches a low sun.
    let prev = W.pond.depth + 1;
    for (let d = 0; d <= 1; d += 0.05) {
        const v = pondBasinAt(W.pond.x + d * pondHalfWidth(), W.pond.z);
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        prev = v;
    }
});

test('the water sits below its banks, so there is a shore', () => {
    const level = pondWaterLevel();
    // Deeper than the water at the middle: the pond is filled, not brimming.
    expect(worldHeightAt(W.pond.x, W.pond.z)).toBeLessThan(level);
    // And dry ground just outside it.
    expect(worldHeightAt(W.pond.x + pondHalfWidth() + 3, W.pond.z)).toBeGreaterThan(level);
});

test('the pond sits in the opening, not in the wood', () => {
    // A pond behind the treeline would be a pond nobody can see.
    // Sampled over the WATER, which is an ellipse, not its bounding box: the
    // corners of the box are dry ground and testing them asks the wrong
    // question. Anywhere the basin is dug, the wood must not be.
    const wet = [];
    for (let x = W.pond.x - pondHalfWidth(); x <= W.pond.x + pondHalfWidth(); x += 0.5) {
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

// ---- The camera stands inside the near treeline's ring ----------------------
//
// THE BUG THIS EXISTS TO STOP: `nearTreeline` scatters on a ring measured from
// the PLOT CENTRE, 17 to 38 m out, and the eye sits at z = 22. The band
// therefore includes the ground the visitor is standing on, so the generator
// was free to put a 17 m tree a couple of metres in front of the camera. It did,
// and it is in 14 of the 21 QA screenshots as a bare armature across the frame.
//
// The trap in fixing it is measuring against the COMPOSED camera position: a
// portrait phone dollies the eye straight back down +z, to 34.84 on a 320 px
// frame, so a keep-out that only knew about z = 22 would leave a tree standing
// exactly where a phone ends up.

test('the tiers really do contain the camera, which is why the rule is needed', () => {
    // The wood is tiered now (M8-4), so the question is asked of the whole
    // span rather than of one band: the eye at z = 22 stands inside it.
    const tiers = W.nearTreeline.tiers;
    const camZ = GARDEN_CONFIG.camera.position.z;
    const inner = Math.min(...tiers.map((t) => t.minRadius));
    const outer = Math.max(...tiers.map((t) => t.maxRadius));
    expect(camZ).toBeGreaterThan(inner);
    expect(camZ).toBeLessThan(outer);
});

test('the tiers tile the middle distance with no gap and no overlap', () => {
    // A gap would be a ring of bare meadow through the wood; an overlap would
    // pay twice for the same ground.
    const tiers = W.nearTreeline.tiers;
    for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].minRadius).toBe(tiers[i - 1].maxRadius);
    }
    // And the flat tier picks up exactly where the real trees stop.
    expect(W.farForest.minRadius).toBe(tiers[tiers.length - 1].maxRadius);
});

test('recursion is cut deeper the further out a tier stands', () => {
    // Recursion is what costs and distance is what hides it. If this ever
    // inverts, the wood is paying most for the trees it can least resolve.
    const tiers = W.nearTreeline.tiers;
    for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].depthReduction).toBeGreaterThan(tiers[i - 1].depthReduction);
    }
});

test('no tree may stand anywhere along the eye or its dolly', () => {
    const N = W.nearTreeline;
    // THE TRACK IS READ, NOT RESTATED. Before M9-5 the eye only ever sat
    // between the composed z and the portrait dolly's end, and this test wrote
    // that number down. The dolly moved both ends, and a test holding its own
    // copy of them would have gone on passing while trees stood in the frame.
    const track = dollyTrackZ(Math.max(GARDEN_CONFIG.camera.position.z, N.cameraKeepOut.dollyToZ));
    const outer = Math.max(...N.tiers.map((t) => t.maxRadius));

    // Every radius the generator can pick, straight down the axis the camera
    // occupies, from the close end of the track to the far one. Not one of
    // them may be legal.
    for (let z = track.near; z <= Math.min(outer, track.far); z += 0.5) {
        expect(clearsCamera(0, z)).toBe(false);
    }
    // And the first legal spot on the axis really is behind the far end.
    expect(clearsCamera(0, track.far + N.cameraKeepOut.clearance)).toBe(true);
    expect(clearsCamera(0, track.far + N.cameraKeepOut.clearance - 0.5)).toBe(false);
    // The portrait extreme, and the composed position itself.
    expect(clearsCamera(0, 34.84)).toBe(false);
    expect(clearsCamera(0, GARDEN_CONFIG.camera.position.z)).toBe(false);
});

test('THE KEEP-OUT COVERS EVERY POINT THE DOLLY CAN REACH', () => {
    // The coupling M9-5 was written down in advance of: `clearsCamera` used to
    // measure against z 22 to 39 because that was everywhere the camera had
    // ever been, and a longer track puts trees that were safely behind the eye
    // directly in front of it.
    //
    // Walk the dolly parameter rather than the segment, so this asserts the
    // property the camera actually has rather than the arithmetic that
    // implements it.
    const clearance = W.nearTreeline.cameraKeepOut.clearance;
    const composed = { z: GARDEN_CONFIG.camera.position.z, y: 7, lookY: 2.5, lookZ: -2 };
    for (let t = -1; t <= 1.0001; t += 0.02) {
        const eye = dollyView(t, composed);
        // Anything nearer than the clearance to where the eye stands must be
        // forbidden, in every direction, all the way round.
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            const r = clearance * 0.9;
            expect(clearsCamera(Math.cos(a) * r, eye.z + Math.sin(a) * r)).toBe(false);
        }
    }

    // And a portrait phone, whose composed z is dollied back on its own and
    // whose track is therefore longer at the far end than the desktop's.
    const tall = { ...composed, z: 41 };
    expect(dollyTrackZ(tall.z).far).toBe(41);
    expect(clearsCamera(0, dollyView(-1, tall).z)).toBe(false);
});

test('the keep-out is a corridor, not a hole in the whole wood', () => {
    // The flanking treeline is what the composition is built on, so the rule
    // has to leave it alone. If this ever fails the frame loses its edges.
    expect(clearsCamera(-20, 20)).toBe(true);
    expect(clearsCamera(22, 14)).toBe(true);
    expect(clearsCamera(0, -40)).toBe(true);

    // And there must still be somewhere to plant a wood. Counted over the whole
    // span the tiers actually sample.
    let legal = 0;
    let total = 0;
    const inner = Math.min(...W.nearTreeline.tiers.map((t) => t.minRadius));
    const outer = Math.max(...W.nearTreeline.tiers.map((t) => t.maxRadius));
    for (let a = 0; a < 720; a++) {
        const angle = (a / 720) * Math.PI * 2;
        for (let r = inner; r <= outer; r += 1) {
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            if (forestDensityAt(x, z) < 0.35) continue;
            total++;
            if (clearsCamera(x, z)) legal++;
        }
    }
    expect(total).toBeGreaterThan(0);
    // Comfortably more than the sixteen placements, with room for the 4.5 m
    // minimum separation between them.
    expect(legal / total).toBeGreaterThan(0.7);
});

// ---- The lake (M8-2) -------------------------------------------------------
//
// The water is DERIVED from the gap in the wood it sits in, not fitted to it by
// hand. That is the whole point: the first pond was fitted by hand, overlapped
// the treeline, and would have had trees standing in the water. Only a test
// sampling the ellipse caught it, and the first version of THAT test sampled
// the bounding box, whose corners are dry ground, so it asked the wrong
// question and passed.

test('the lake has no width of its own to get wrong', () => {
    // If a halfWidth ever reappears in config it is a second number that has to
    // be kept in step with the opening, which is the arrangement that failed.
    expect(W.pond.halfWidth).toBeUndefined();
    expect(W.pond.shoreMargin).toBeGreaterThan(0);
    expect(pondHalfWidth()).toBeGreaterThan(0);
});

test('the shore margin is kept at the BINDING depth, not just at the middle', () => {
    // The opening narrows toward the camera faster than the ellipse does, so
    // the tightest point is not the widest point. Deriving at the pond's own z
    // alone left 1.28 m where 2 m was asked for: it cleared, but only because
    // the numbers happened to suit.
    const P = W.pond;
    const hw = pondHalfWidth();
    let tightest = Infinity;
    for (let z = P.z - P.halfDepth; z <= P.z + P.halfDepth; z += 0.1) {
        const t = (z - P.z) / P.halfDepth;
        const share = Math.sqrt(Math.max(0, 1 - t * t));
        if (share <= 1e-6) continue;
        const edge = Math.abs(P.x) + hw * share;
        tightest = Math.min(tightest, openingHalfWidthAt(z) - edge);
    }
    // Never negative (trees in the water) and never less than asked for.
    expect(tightest).toBeGreaterThanOrEqual(P.shoreMargin - 0.05);
});

test('widening the wood narrows the lake, with no edit to the lake', () => {
    // The property that makes the derivation worth having. A clearing change
    // must move the water on its own, or the two will drift the first time
    // anybody retunes the opening.
    const narrow = structuredClone(GARDEN_CONFIG.world);
    narrow.clearing.openHalfWidth = GARDEN_CONFIG.world.clearing.openHalfWidth - 8;
    expect(pondHalfWidth(narrow)).toBeLessThan(pondHalfWidth());

    const wide = structuredClone(GARDEN_CONFIG.world);
    wide.clearing.openHalfWidth = GARDEN_CONFIG.world.clearing.openHalfWidth + 8;
    expect(pondHalfWidth(wide)).toBeGreaterThan(pondHalfWidth());
});

test('the lake reads as a band across the view, not as a dot in it', () => {
    // Measured at the composed camera rather than judged: a 60 degree vertical
    // frame at a 1.5 aspect is about 81.4 degrees across, and the water sits
    // 48 to 80 m out. It was 37 percent of frame width as a pond.
    const P = W.pond;
    const distance = GARDEN_CONFIG.camera.position.z - P.z;
    const halfH = Math.atan(Math.tan((GARDEN_CONFIG.camera.fov / 2) * Math.PI / 180) * 1.5);
    const span = 2 * Math.atan(pondHalfWidth() / distance);
    expect(span / (2 * halfH)).toBeGreaterThan(0.5);
});

// ---- Nothing may crowd the eye (QA 2026-08-26) ------------------------------

test('the FAR wood respects the camera too, and needs a wider berth than the near one', () => {
    // THE BUG THIS EXISTS TO STOP. `scatter` had an `accept` hook for exactly
    // this and `initForest` passed null, so the keep-out written for the near
    // treeline never reached the tier that most needed it. One impostor stood
    // about 16 m from the eye and filled the left fifth of the frame.
    //
    // The two tiers need DIFFERENT clearances and the reason is what they are
    // made of: a fractal tree at 12 m is see-through, an impostor is a solid
    // crossed quad and reads as a wall.
    const F = W.farForest;
    expect(F.minCameraDistance).toBeGreaterThan(W.nearTreeline.cameraKeepOut.clearance);

    const cam = GARDEN_CONFIG.camera.position;
    const points = scatter(F.spacing, F.jitter, W.seed, null);
    expect(points.length).toBeGreaterThan(200);
    for (const p of points) {
        expect(Math.hypot(p.x - cam.x, p.z - cam.z)).toBeGreaterThanOrEqual(F.minCameraDistance - 1e-9);
    }
});

test('no impostor the visitor can actually SEE fills the frame', () => {
    // Stated as the thing a viewer experiences, and measured over the trees the
    // generator really places rather than over an abstract minimum distance.
    // Only trees IN FRONT of the eye and inside the frame sideways count: the
    // nearest tree of all sits 27 m away and directly behind the camera, which
    // is why a plain nearest-distance check answers the wrong question.
    const F = W.farForest;
    const cam = GARDEN_CONFIG.camera.position;
    const toDeg = 180 / Math.PI;
    const halfWide = Math.atan(Math.tan((GARDEN_CONFIG.camera.fov / 2) / toDeg) * 1.5) * toDeg;

    let worst = 0;
    for (const p of scatter(F.spacing, F.jitter, W.seed, null)) {
        const ahead = cam.z - p.z;
        if (ahead <= 0) continue;
        if (Math.atan2(Math.abs(p.x), ahead) * toDeg > halfWide) continue;
        const d = Math.hypot(p.x, ahead);
        worst = Math.max(worst, (Math.atan((F.maxHeight - cam.y) / d) + Math.atan(cam.y / d)) * toDeg);
    }
    // The blocking complaint was a tree filling the whole 60 degree frame.
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(GARDEN_CONFIG.camera.fov * 0.6);
});

test('no tier is cut so deep that its trees become antennae', () => {
    // MEASURED, and this is the finding that reshaped the wood. Leaf cards per
    // segment is a constant 2.0 at every cut, so a deep cut does not strip
    // foliage relative to wood. What it strips is the FINE STRUCTURE: at -3 a
    // tree is 48 segments and 94 clumps, so the long structural branches have
    // nothing left to hide them and the tree reads as a wire.
    //
    //   -1  276 segments   -2  109   -3  48   -4  24
    //
    // Past -2 they stop being trees, which is why the real wood now stops at
    // 30 m and the flat tier takes over there.
    for (const tier of W.nearTreeline.tiers) {
        expect(tier.depthReduction).toBeLessThanOrEqual(2);
    }
});

test('the lake is mostly water, not mostly bank', () => {
    // `fill` is how far BELOW the rim the water sits, so it reads backwards: a
    // lower number is a fuller lake. At 0.45 only the middle third of the basin
    // was wet and it still read as a pond. This asserts the WATER, which is the
    // part anybody can see, rather than the dig.
    const P = W.pond;
    const smooth = (t) => t * t * (3 - 2 * t);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (smooth(1 - mid) > P.fill) lo = mid; else hi = mid;
    }
    const waterShare = lo;
    expect(waterShare).toBeGreaterThan(0.7);
    // And a real band of damp shore is still left, or the water meets the grass
    // in a hard line.
    expect((1 - waterShare) * pondHalfWidth()).toBeGreaterThan(3);
});

// ---- The dolly (M9-5) ------------------------------------------------------
//
// The zoom was a LENS and both views QA asked for are POSITIONS. Measured, the
// old control ran 60 degrees to 34 in (1.9x magnification) and to 76 out
// (1.35x wider), from an eye that never left (0, 7, 22). A crop from a fixed
// point has no parallax and cannot put anybody among the trees.

const COMPOSED = {
    z: GARDEN_CONFIG.camera.position.z,
    y: GARDEN_CONFIG.camera.position.y,
    lookY: GARDEN_CONFIG.camera.lookAt.y,
    lookZ: GARDEN_CONFIG.camera.lookAt.z
};

test('the dolly zero is exactly the composed viewpoint', () => {
    // Not approximately. The whole scene is framed for this one view, and a
    // track that missed it by a few centimetres would mean the garden never
    // showed the picture it was designed around.
    const at0 = dollyView(0, COMPOSED);
    expect(at0.z).toBe(COMPOSED.z);
    expect(at0.y).toBe(COMPOSED.y);
    expect(at0.lookY).toBe(COMPOSED.lookY);
    expect(at0.lookZ).toBe(COMPOSED.lookZ);
});

test('THE CLOSE END REALLY IS AMONGST THE TREES', () => {
    const plotHalf = GARDEN_CONFIG.plot.halfSize !== undefined
        ? GARDEN_CONFIG.plot.halfSize : 12;
    const inside = dollyView(1, COMPOSED);
    // Inside the wall, not merely nearer to it. This is the claim the request
    // makes and the one a bigger magnification could never satisfy.
    expect(inside.z).toBeLessThan(plotHalf);
    // At something like eye height rather than the composed 7 m, or it is a
    // low-flying drone rather than a person standing in a garden.
    expect(inside.y).toBeLessThan(3);
    // And clear of the ground. The plot's relief runs to +0.86 m.
    expect(inside.y).toBeGreaterThan(0.86 + 1);
});

test('the far end is high enough to be a view from above', () => {
    const above = dollyView(-1, COMPOSED);
    expect(above.y).toBeGreaterThan(20);
    expect(above.z).toBeGreaterThan(COMPOSED.z);

    // The whole plot has to be inside the frame from up there, or it is a
    // view from above of something else. Measured as the angle off the aim
    // axis for the plot's near and far edges, against the half-frame.
    const halfFov = (GARDEN_CONFIG.camera.fov / 2) * Math.PI / 180;
    const aim = Math.atan2(above.y - above.lookY, above.z - above.lookZ);
    for (const edge of [12, -12]) {
        const angle = Math.atan2(above.y, above.z - edge);
        expect(Math.abs(angle - aim)).toBeLessThan(halfFov);
    }
});

test('the track moves the eye monotonically, and never past its ends', () => {
    let previousZ = -Infinity;
    for (let t = 1; t >= -1.0001; t -= 0.02) {
        const view = dollyView(t, COMPOSED);
        expect(view.z).toBeGreaterThanOrEqual(previousZ - 1e-9);
        previousZ = view.z;
    }
    // Past the ends it clamps rather than running away, which matters because
    // the deltas arrive from a held button and a pinch that do not know where
    // the track stops.
    expect(dollyView(5, COMPOSED)).toEqual(dollyView(1, COMPOSED));
    expect(dollyView(-5, COMPOSED)).toEqual(dollyView(-1, COMPOSED));
});

test('A TALL WINDOW CANNOT MAKE ZOOMING OUT MOVE THE CAMERA FORWARD', () => {
    // `framingFor` dollies a portrait phone back on its own, and a narrow
    // enough window composes past the far end of the track. Unclamped, asking
    // to pull back would then move the eye toward the plot.
    const far = GARDEN_CONFIG.camera.dolly.far.z;
    const tall = { ...COMPOSED, z: far + 8 };
    expect(dollyView(-1, tall).z).toBeGreaterThanOrEqual(tall.z);
    expect(dollyTrackZ(tall.z).far).toBe(tall.z);
    // And the same at the other end, for a window composed nearer than the
    // close end could ever be.
    const near = GARDEN_CONFIG.camera.dolly.near.z;
    expect(dollyTrackZ(near - 4).near).toBe(near - 4);
});

// ---- Tilt (M9-7) -----------------------------------------------------------

test('A TILT IS AN ANGLE, so it means the same at both ends of the track', () => {
    // Raising the aim target by a fixed height would swing the view wildly
    // from 6 m out and barely move it from 40 m out, because the same rise is
    // a different angle at a different range.
    const angleOf = (view, tilt) => {
        const lookY = tiltedLookY(view, tilt);
        return Math.atan2(lookY - view.y, Math.abs(view.z - view.lookZ));
    };
    const close = dollyView(1, COMPOSED);
    const far = dollyView(-1, COMPOSED);
    const tilt = GARDEN_CONFIG.camera.dolly.maxTilt;

    const swung = angleOf(close, tilt) - angleOf(close, 0);
    const swungFar = angleOf(far, tilt) - angleOf(far, 0);
    expect(swung).toBeCloseTo(tilt, 6);
    expect(swungFar).toBeCloseTo(tilt, 6);

    // And zero tilt leaves the composed aim exactly alone.
    expect(tiltedLookY(close, 0)).toBe(close.lookY);
});

test('the dolly deltas clamp, and a NaN cannot strand the camera', async () => {
    const view = await import('../www/garden/js/view.js');
    view.resetView();
    expect(view.getDolly()).toBe(0);
    expect(view.dollyLimits()).toEqual({ atIn: false, atOut: false });

    // Deltas arrive from a held button at zoom.speed a second and from a pinch
    // as log2 of the spread, so nothing upstream knows where the track stops.
    view.applyDollyDelta(0.4);
    expect(view.getDolly()).toBeCloseTo(0.4, 9);
    view.applyDollyDelta(9);
    expect(view.getDolly()).toBe(1);
    expect(view.dollyLimits().atIn).toBe(true);
    view.applyDollyDelta(-9);
    expect(view.getDolly()).toBe(-1);
    expect(view.dollyLimits().atOut).toBe(true);

    // A pinch of zero spread is log2(0), which is -Infinity, and one bad frame
    // of it would leave the camera somewhere it could never be steered back
    // from. NaN is the same story through a different door.
    view.resetView();
    view.applyDollyDelta(NaN);
    expect(view.getDolly()).toBe(0);
    view.applyDollyDelta(-Infinity);
    expect(view.getDolly()).toBe(-1);
    view.resetView();
    expect(view.getDolly()).toBe(0);
    expect(view.getTilt()).toBe(0);
});
