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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dollyView, dollyTrackZ } from '../www/garden/js/view.js';

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
    // Scene fog is total past 260 m, so a ridge drawn with fog on is painted
    // exactly the colour of the sky behind it. Every tier carries its own
    // aerial perspective instead. That is a property of the MATERIAL, so it is
    // asserted directly rather than inferred from where a layer stands.
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'vista.js'), 'utf8');
    const build = src.slice(src.indexOf('function buildRidge'));
    expect(build.slice(0, build.indexOf('\n}\n'))).toMatch(/fog: false/);

    // AND EVERY TIER SITS PAST THE CEILING. A tier inside the fog's range is a
    // different problem: everything around it at that distance really is most
    // of the way dissolved, so a crisp ridge there reads as standing in front
    // of the haze rather than in it. One was tried at 205 m to fill the empty
    // band between the lake and the range (M14-2) and taken out again after QA
    // (M14-5), and this is the line that says what a new one would owe.
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

// Tilt is NOT tested here any more. It belongs to the shared pan part, which
// applies it by rotating the aim direction rather than by moving the target,
// so it composes with the dolly by construction. See tests/shared-pan.test.mjs
// for the property, and the M9 log for why the garden stopped keeping a second
// tilt axis of its own.

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
});

// ---- Nothing stands in the lake (M14-4) ------------------------------------

const { inTheLake } = await import('../www/garden/js/forest.js');

test('NO BUSH STANDS IN THE LAKE', () => {
    // The trees have had a rule keeping them out of the basin since M7-6 and
    // the bushes never did. The ring they are scattered on runs 13.5 to 30 m
    // from the plot and the lake spans 26 to 58 m out, so the two overlap, and
    // with a hundred bushes drawn a spot in the water is a certainty rather
    // than a risk. QA found one standing in it.
    const U = W.undergrowth;
    const wet = [];
    let n = 0;
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 40000; i++) {
        const a = rnd() * Math.PI * 2;
        const r = U.bushRadius.min + rnd() * (U.bushRadius.max - U.bushRadius.min);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (Math.max(Math.abs(x), Math.abs(z)) < PLOT.halfSize + 1) continue;
        n += 1;
        // Everything the placement loop accepts must be dry.
        if (!inTheLake(x, z)) {
            if (worldHeightAt(x, z) < pondWaterLevel(W)
                && Math.abs(x - W.pond.x) <= pondHalfWidth(W)
                && Math.abs(z - W.pond.z) <= W.pond.halfDepth) wet.push([x, z]);
        }
    }
    expect(n).toBeGreaterThan(1000);
    expect(wet).toEqual([]);

    // AND THE RULE IS "WOULD IT BE STANDING IN WATER", not "is it inside the
    // ellipse". Those are still different questions after M14-5 levelled the
    // bed, and for a better reason than before: the water fills the basin to
    // about 0.84 of its radius, so the outer sixth of the bowl is the grass
    // BANK, which is dry ground a bush is perfectly at home on. A basin test
    // would throw the whole shore away.
    const P = W.pond;
    const dryInBasin = { x: P.x + pondHalfWidth(W) * 0.93, z: P.z };
    expect(pondBasinAt(dryInBasin.x, dryInBasin.z)).toBeGreaterThan(0);
    expect(worldHeightAt(dryInBasin.x, dryInBasin.z)).toBeGreaterThan(pondWaterLevel(W));
    expect(inTheLake(dryInBasin.x, dryInBasin.z)).toBe(false);

    // The middle of the lake is unambiguously out.
    expect(inTheLake(P.x, P.z)).toBe(true);
    // And so is somewhere well clear of it.
    expect(inTheLake(0, 0)).toBe(false);
    expect(inTheLake(90, 90)).toBe(false);
});

// ---- The lake bed is level (M14-5) -----------------------------------------

const { lakeShelfAt, outerReliefAt: reliefAt } = await import('../www/garden/js/terrain.js');

/** The world as it was before the shelf: same config, no levelling. */
const TILTED = (() => {
    const w = structuredClone(W);
    delete w.pond.shelf;
    return w;
})();

test('A LAKE NEEDS FLAT GROUND UNDER IT, and this one did not have any', () => {
    // The fault QA reported as a hill on the right of the lake and a notch at
    // the top, and it had been true since the lake was first widened. A basin
    // dug into rolling ground is a dent in a hillside, not a bowl.
    const P = W.pond;
    const rw = pondHalfWidth(W);
    const levelTilted = outerWavesAt(P.x, P.z, TILTED) - P.depth * P.fill;

    // THE OLD GROUND, ACROSS THE BASIN: a metre under water at one end and
    // nearly two metres of dry land at the other.
    const west = reliefAt(P.x - rw * 0.7, P.z, TILTED);
    const east = reliefAt(P.x + rw * 0.7, P.z, TILTED);
    // Measured at 0.7 of the basin radius, which is well inside where water
    // should be on both sides.
    expect(levelTilted - west).toBeGreaterThan(0.5);     // drowned
    expect(east - levelTilted).toBeGreaterThan(0.9);     // dry land, well proud
    expect(east - west).toBeGreaterThan(2.2);            // the tilt itself

    // And now it is level: the two ends agree to within a few centimetres.
    const level = pondWaterLevel(W);
    const w2 = reliefAt(P.x - rw * 0.7, P.z);
    const e2 = reliefAt(P.x + rw * 0.7, P.z);
    expect(Math.abs(e2 - w2)).toBeLessThan(0.05);
    expect(level - w2).toBeGreaterThan(0);
    expect(level - e2).toBeGreaterThan(0);
});

test('the waterline is the same distance out on every side', () => {
    const P = W.pond;
    const level = pondWaterLevel(W);
    const reach = (dx, dz) => {
        // THE FIRST CROSSING, not the last. Walking on past the shore finds
        // the next dip the meadow happens to have, which belongs to no lake.
        let out = 0;
        for (let d = 0; d < 40; d += 0.02) {
            if (reliefAt(P.x + dx * d, P.z + dz * d) >= level) break;
            out = d;
        }
        return out;
    };
    expect(reach(1, 0)).toBeCloseTo(reach(-1, 0), 1);
    expect(reach(0, 1)).toBeCloseTo(reach(0, -1), 1);
    // The old bed was lopsided by most of its own width.
    const tiltedReach = (dx) => {
        const lv = outerWavesAt(P.x, P.z, TILTED) - P.depth * P.fill;
        let out = 0;
        for (let d = 0; d < 40; d += 0.02) {
            if (reliefAt(P.x + dx * d, P.z, TILTED) >= lv) break;
            out = d;
        }
        return out;
    };
    expect(Math.abs(tiltedReach(1) - tiltedReach(-1))).toBeGreaterThan(8);
});

test('NO DRY LAND IS LEFT INSIDE THE WATER, which is what the notch was', () => {
    const P = W.pond;
    const level = pondWaterLevel(W);
    const rw = pondHalfWidth(W);
    let dryNow = 0;
    let dryBefore = 0;
    const levelTilted = outerWavesAt(P.x, P.z, TILTED) - P.depth * P.fill;
    for (let x = -rw; x <= rw; x += 0.5) {
        for (let z = P.z - P.halfDepth; z <= P.z + P.halfDepth; z += 0.5) {
            // Well inside the basin, where water has no business being absent.
            if (Math.hypot(x / rw, (z - P.z) / P.halfDepth) > 0.7) continue;
            if (reliefAt(x, z) >= level) dryNow += 1;
            if (reliefAt(x, z, TILTED) >= levelTilted) dryBefore += 1;
        }
    }
    expect(dryNow).toBe(0);
    // And the old bed had a great deal of it, which is the guard rather than
    // the restatement: this number is what QA was looking at.
    expect(dryBefore).toBeGreaterThan(100);
});

test('levelling did not move the water, which is why nothing downstream broke', () => {
    // The shelf damps the waves toward their value AT THE POND CENTRE, and that
    // is the value `pondWaterLevel` was already built on. So the water sits
    // exactly where it did and every number derived from it still holds.
    const P = W.pond;
    expect(outerWavesAt(P.x, P.z)).toBeCloseTo(outerWavesAt(P.x, P.z, TILTED), 9);
    expect(lakeShelfAt(P.x, P.z)).toBe(1);
});

test('the shelf finishes clear of the water, and of the plot', () => {
    const P = W.pond;
    // Fully flat past the basin rim, or the waves come back inside the lake and
    // the whole problem returns in miniature.
    expect(P.shelf.from).toBeGreaterThan(1);
    expect(P.shelf.to).toBeGreaterThan(P.shelf.from);
    // And a WIDE blend, so the meadow returns as a slope rather than as a
    // terrace rim around a flat disc.
    expect((P.shelf.to - P.shelf.from) * pondHalfWidth(W)).toBeGreaterThan(12);

    // IT MUST NOT REACH THE PLOT. The seam between the plot and the meadow is
    // guaranteed at exactly zero, and levelling ground near it would be a
    // second thing deciding that height.
    for (let x = -HALF; x <= HALF; x += 0.5) {
        for (const z of [-HALF, HALF]) {
            expect(lakeShelfAt(x, z)).toBe(0);
            expect(lakeShelfAt(z, x)).toBe(0);
        }
    }
});

// ---- The range has to reach the edge of the frame (M20-1) ------------------

test('THE MOUNTAINS SPAN THE WHOLE HORIZON, AT EVERY ASPECT AND FULL PAN', () => {
    // QA found the range simply stopping, with pale sky beyond it. Two things
    // add up and only the first was ever accounted for.
    //
    // `camera.fov` is VERTICAL, so the horizontal half-angle is
    // atan(tan(fov / 2) * aspect) and GROWS WITH THE WINDOW. The pan then adds
    // its own limit on top, which is why this was not just a wide-screen bug:
    // even 4:3 ran out once panned.
    const cam = GARDEN_CONFIG.camera;
    const spread = W.mountains.spreadDegrees;
    const pan = cam.portrait.pan.maxAngle * 180 / Math.PI;
    const halfH = (fov, aspect) => Math.atan(Math.tan(fov * Math.PI / 360) * aspect) * 180 / Math.PI;

    for (const aspect of [4 / 3, 16 / 10, 16 / 9, 21 / 9, 32 / 9]) {
        expect(halfH(cam.fov, aspect) + pan).toBeLessThanOrEqual(spread);
    }
    // Portrait too, which uses its own wider lens on a narrow window.
    expect(halfH(cam.portrait.fov, 0.46) + pan).toBeLessThanOrEqual(spread);

    // AND THE OLD VALUE FAILS, which is what makes this a guard. 62 was short
    // by 7 degrees at 4:3 and by 23 at 21:9.
    expect(halfH(cam.fov, 16 / 9) + pan).toBeGreaterThan(62);
    expect(halfH(cam.fov, 4 / 3) + pan).toBeGreaterThan(62);

    // THE PROFILE IS SAMPLED PER DEGREE, NOT PER RIDGE. Widening the arc
    // without the segments would stretch the same ridgeline over 1.7 times the
    // sky and soften it, so the detail is held roughly constant.
    for (const layer of W.mountains.layers) {
        expect(layer.segments / spread).toBeGreaterThan(1.8);
    }
    // And it stays cheap: two triangles a segment.
    const tris = W.mountains.layers.reduce((a, l) => a + l.segments * 2, 0);
    expect(tris).toBeLessThan(1200);
});

// ---- Clouds (M20-2) --------------------------------------------------------

test('COVER SLIDES THE THRESHOLD, and the thresholds come off the field', () => {
    const C = GARDEN_CONFIG.sky.clouds;
    // A NORMALISED fbm still does not spread evenly over 0 to 1. Sampled over
    // 9,000 directions across the band this camera can actually see:
    //
    //     p20 0.137   p32 0.169   p50 0.219   p90 0.419   p98.8 0.555
    //
    // The first pass guessed 0.62 and 0.34, which is a threshold ABOVE the
    // field's maximum and one at its 90th percentile: almost no cloud at any
    // weather. Guessing a threshold against an unmeasured distribution is the
    // same mistake as guessing a size in metres against an unmeasured frame,
    // and this scene has now made both.
    //
    // `clearAt` sits near the 99th percentile, so a clear day is one or two
    // small puffs. It was the 97.5th and QA read that as still too cloudy.
    expect(C.clearAt).toBeGreaterThan(0.50);
    expect(C.clearAt).toBeLessThan(0.62);
    expect(C.fullAt).toBeGreaterThan(0.12);
    expect(C.fullAt).toBeLessThan(0.25);
    // CLEARER MEANS A HIGHER BAR, which is the direction the whole thing rests
    // on: at `clearAt` only the tops of the field get through.
    expect(C.clearAt).toBeGreaterThan(C.fullAt);

    // The edge has to be small against the field's own span, or every cloud is
    // a smear with no edge anywhere. The first pass used 0.16 against a span of
    // about 0.32.
    expect(C.edge).toBeLessThan((C.clearAt - C.fullAt) / 2);

    // ---- AND THE SHAPE IS SET BY A BAND 19 DEGREES TALL ------------------
    // The camera pitches down 10.6 degrees with a 60 degree lens, so the
    // visible sky runs from the horizon to about 19.4. A cloud has to FIT in
    // that to read as a cloud: the second attempt reduced the foreshortening
    // and got slabs with vertical walls crossing the whole strip.
    const cam = GARDEN_CONFIG.camera;
    const pitch = Math.atan2(cam.lookAt.y - cam.position.y,
        Math.hypot(cam.lookAt.x - cam.position.x, cam.lookAt.z - cam.position.z));
    const topOfSky = (pitch + cam.fov * Math.PI / 360) * 180 / Math.PI;
    expect(topOfSky).toBeGreaterThan(10);
    expect(topOfSky).toBeLessThan(30);

    // A GENTLE, SEAMLESS PROJECTION. xz over (bias + y) foreshortens by only
    // 1.6x across that band, so clouds stay round, and it has no wrap: an
    // atan2 mapping puts a seam due west and the widest panned frame reaches
    // 84.5 degrees off north.
    expect(C.bias).toBeGreaterThan(0.3);
    const atHorizon = 1 / C.bias;
    const atTop = 1 / (C.bias + Math.sin(topOfSky * Math.PI / 180));
    expect(atHorizon / atTop).toBeLessThan(2.2);

    // Three octaves, not four: the fourth adds the fractal edge detail that
    // made the first pass read as scattered scraps.
    expect(C.octaves).toBe(3);

    // They stop short of the horizon, where the projection has nothing left to
    // give and distant cloud is lost in haze anyway.
    expect(C.horizonFade).toBeGreaterThan(0.05);
    expect(C.horizonFade).toBeLessThan(Math.sin(topOfSky * Math.PI / 180));

    // AND THEY MOVE. The visible sky is about 11 noise cells wide, so this
    // crosses the frame in roughly five minutes. It was 0.0075, eight times
    // slower, which read as a painted backdrop.
    expect(C.drift).toBeGreaterThan(0.02);
    expect(C.drift).toBeLessThan(0.08);
});

test('the lake reflects the same clouds the dome draws', () => {
    const dir = join(process.cwd(), 'www', 'garden', 'js');
    const sky = readFileSync(join(dir, 'sky.js'), 'utf8');
    const vista = readFileSync(join(dir, 'vista.js'), 'utf8');

    // THE COVER FUNCTION IS IN THE SHARED CHUNK, which is the whole reason the
    // water samples the dome's GLSL rather than approximating it. A cloudy sky
    // over a cloudless lake is the same fault one layer up.
    const glsl = sky.slice(sky.indexOf('export const SKY_GLSL'));
    expect(glsl.slice(0, glsl.indexOf('`;'))).toMatch(/float gardenCloudCover/);
    expect(vista).toMatch(/gardenCloudCover\(reflected/);

    // And both surfaces get their uniforms from ONE builder, so they cannot be
    // given different weather.
    expect(sky).toMatch(/export function cloudUniforms/);
    expect(sky).toMatch(/\.\.\.cloudUniforms\(config\)/);
    expect(vista).toMatch(/\.\.\.cloudUniforms\(config\)/);
    // Driven from one function too, off the same `cloud` the season chip reads.
    expect(sky).toMatch(/export function driveClouds/);
    expect(sky).toMatch(/driveClouds\(u, cloud, seconds, wet, light\.sunElevation, config\)/);
    expect(vista).toMatch(/driveClouds\(pond\.uniforms, cloud, elapsed, wet, light\.sunElevation, config\)/);

    // ---- HAPPY WHEN DRY, GLOOMY WHEN IT IS FALLING (M20-4) ---------------
    // The colour is driven by the PRECIPITATION RATE and not by the cover, and
    // that separation is the point: plenty of days are wall to wall cloud and
    // still cheerful, so painting a dry overcast as a storm would be wrong.
    // `overcastAt` already raises the cover on its own.
    const main = readFileSync(join(dir, 'main.js'), 'utf8');
    expect(main).toMatch(/const wet = Math\.max\(fall\.rain, fall\.snow\)/);
    expect(sky).toMatch(/mix\(uCloudColor, uCloudStorm, uCloudWet\)/);
    expect(vista).toMatch(/mix\(uCloudColor, uCloudStorm, uCloudWet\)/);
    // Both surfaces again, so the lake never reflects a cheerful sky in a
    // downpour.
    const C = GARDEN_CONFIG.sky.clouds;
    const lum = (h) => (0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255)
        + 0.0722 * (h & 255)) / 255;
    // The storm tone is genuinely dark against the happy one, or "gloomy" is
    // just a slightly duller white.
    expect(lum(C.color) / lum(C.stormColor)).toBeGreaterThan(2);
    // And a wet cloud mostly stops taking the horizon's warmth: it is lit from
    // above and thick enough not to glow at its base.
    expect(C.stormWarmth).toBeLessThan(0.5);

    // ---- WHITE AT MIDDAY, WARM ONLY AT THE ENDS OF THE DAY --------------
    // The warmth exists to give a low sun its underlit edge, and it used to be
    // applied at EVERY hour, so a noon cloud was mixed 40 percent toward a
    // pale blue horizon and rendered 0xe3e7e9 rather than the 0xeaeaea it
    // should be: slightly blue, slightly dull, and not the white QA asked for.
    expect(C.warmthFadesAbove).toBeGreaterThan(5);
    expect(C.warmthFadesAbove).toBeLessThan(GARDEN_CONFIG.sun.maxElevation);
    expect(sky).toMatch(/warmthFadesAbove - sunElevation/);

    // A CLOUD IS IN FRONT OF WHAT IS BEHIND IT: the stars and both bodies are
    // attenuated by it rather than shining through.
    const frag = sky.slice(sky.indexOf('const SKY_FRAG'));
    const body = frag.slice(0, frag.indexOf('`;'));
    expect(body).toMatch(/float behind = 1\.0 - clouds/);
    expect(body).toMatch(/uStarBrightness \* horizonMask \* behind/);
    expect(body).toMatch(/uSunDisc \* uSunUp \* behind/);
    expect(body).toMatch(/uMoonDisc \* uMoonUp \* behind/);
});

// ---- Ducks (M22-1) ----------------------------------------------------------

const { duckPaths, duckAt, duckWaterReach } = await import('../www/garden/js/wildlife.js');

test('EVERY DUCK STAYS ON OPEN WATER, at every moment of its loop', () => {
    // Not in the BASIN, which is the dug bowl, but inside the WATERLINE. Since
    // M14-5 levelled the bed those two differ by a bank several metres wide,
    // and a duck on the bank is a duck standing on grass.
    const level = pondWaterLevel(W);
    const paths = duckPaths();
    expect(paths.length).toBeGreaterThan(1);

    let samples = 0;
    for (const path of paths) {
        // A whole loop and then some, so nothing is missed between samples.
        for (let t = 0; t < 6000; t += 5) {
            const at = duckAt(path, t);
            expect(outerReliefAt(at.x, at.z)).toBeLessThan(level);
            samples += 1;
        }
    }
    expect(samples).toBeGreaterThan(2000);
});

test('the waterline is SOLVED, not approximated', () => {
    // The basin is dug by a smoothstep, so the waterline is where
    // t * t * (3 - 2t) = fill with t = 1 - r, which has no tidy closed form. A
    // first attempt used `1 - cbrt(fill)` and put the ducks at 0.25 of the
    // basin instead of 0.84: three birds huddled in the very middle of the
    // lake, which looks like a placement bug and is an algebra one.
    const P = W.pond;
    const reach = duckWaterReach();
    const share = reach.x / pondHalfWidth(W);
    // Solve it independently here, so the test is not the code twice.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
        const t = (lo + hi) / 2;
        if (t * t * (3 - 2 * t) < P.fill) lo = t; else hi = t;
    }
    const waterline = 1 - (lo + hi) / 2;
    expect(share).toBeCloseTo(waterline * W.wildlife.ducks.keepInside, 4);
    // And the guess it replaced is genuinely wrong, which is what makes this a
    // guard rather than a restatement.
    // 0.838 against 0.588: the ducks ended up at 30 percent of the radius they
    // should have had, which is the difference between spread across a lake and
    // huddled in the middle of it.
    expect(Math.abs(waterline - (1 - Math.cbrt(P.fill)))).toBeGreaterThan(0.2);
    expect(waterline / (1 - Math.cbrt(P.fill))).toBeGreaterThan(1.3);

    // They spread across the lake rather than huddling in the middle.
    expect(share).toBeGreaterThan(0.4);
    // With a real margin from the shore, so none of them is ever at the edge.
    expect(share).toBeLessThan(waterline);
});

test('a duck is sized in PIXELS, because a real one is a speck', () => {
    // The lake sits 51 to 78 m from the eye, where a true 0.55 m mallard is 5
    // to 7.5 px and reads as dirt on the screen. This scene has been caught by
    // sizing in botany rather than in pixels three times already.
    const D = W.wildlife.ducks;
    const cam = GARDEN_CONFIG.camera;
    const perRad = 800 / (cam.fov * Math.PI / 180);
    const level = pondWaterLevel(W);
    const far = Math.hypot(cam.position.y - level,
        cam.position.z - (W.pond.z - W.pond.halfDepth));
    const px = D.bodyLength / far * perRad;
    // Legible at the FAR end of the water, which is the case that decides it.
    expect(px).toBeGreaterThan(8);
    // And not a pantomime: a swan is 1.5 m and this has to stay under that.
    expect(D.bodyLength).toBeLessThan(1.5);

    // They drift rather than swim. Anything faster reads as a wind-up toy, and
    // the whole reason ducks are allowed in a scene that switched off its
    // butterflies is that they do not compete with the trees.
    expect(D.speed).toBeLessThan(0.6);
});

test('and they face where they are going', () => {
    // A duck sliding sideways across a lake is the one thing that would give
    // the loop away.
    for (const path of duckPaths()) {
        for (let t = 0; t < 400; t += 37) {
            const a = duckAt(path, t);
            const b = duckAt(path, t + 0.6);
            const travelled = Math.hypot(b.x - a.x, b.z - a.z);
            if (travelled < 1e-4) continue;
            const heading = Math.atan2(b.x - a.x, b.z - a.z);
            const off = Math.abs(Math.atan2(Math.sin(a.yaw - heading),
                Math.cos(a.yaw - heading)));
            expect(off).toBeLessThan(0.25);
        }
    }
});

// ---- The ducks migrate (M23-1) ----------------------------------------------

const { duckFlightAt, duckFlightPos } = await import('../www/garden/js/wildlife.js');

test('THE DUCKS ARE GONE FOR THE COLD HALF OF THE YEAR', () => {
    // The only wildlife in this scene the CALENDAR drives rather than the clock.
    // Everything else here keeps hours, which is a time of day; this keeps a
    // season, and it is the same kind of beat the blossom is.
    const D = W.wildlife.ducks;

    // On the water through summer and into autumn.
    for (const h of [6, 9, 12, 15, 17]) expect(duckFlightAt(h)).toBe(0);
    // Gone through winter, both sides of midnight.
    for (const h of [19, 21, 23, 0, 2]) expect(duckFlightAt(h)).toBe(1);
    // And back on the water once spring is properly open.
    for (const h of [4.5, 5, 6]) expect(duckFlightAt(h)).toBe(0);

    // They leave in mid AUTUMN and land in early SPRING, which is the whole
    // request. Autumn is 15 to 21 and spring is 3 to 9.
    expect(D.leaveAt).toBeGreaterThan(15);
    expect(D.leaveAt).toBeLessThan(21);
    expect(D.arriveAt).toBeGreaterThanOrEqual(3);
    expect(D.arriveAt).toBeLessThan(9);

    // REBASED ACROSS MIDNIGHT, which is where every off-by-one in this scene
    // has landed. The away window runs 18.5 round through 0 to 3.
    expect(duckFlightAt(23.99)).toBe(1);
    expect(duckFlightAt(0.01)).toBe(1);

    // And it is continuous: no frame where three birds jump.
    let prev = duckFlightAt(0);
    for (let h = 0; h < 24; h += 0.02) {
        const now = duckFlightAt(h);
        expect(Math.abs(now - prev)).toBeLessThan(0.08);
        prev = now;
    }
});

test('a duck takes off like a duck, not like a helicopter', () => {
    // The first attempt reached full height by 60 percent of the way while the
    // ground track was still at 39, which measured 63 degrees off the water and
    // then 54. A duck runs across the surface, gets up, and climbs shallow.
    const D = W.wildlife.ducks;
    const swim = { x: W.pond.x, z: W.pond.z, yaw: 0 };
    let prevAngle = -1;
    let steepest = 0;
    for (let f = 0.02; f <= 1; f += 0.02) {
        const air = duckFlightPos(swim, f, 0, 3);
        const ground = Math.hypot(air.x - swim.x, air.z - swim.z);
        const angle = Math.atan2(air.lift, Math.max(0.001, ground)) * 180 / Math.PI;
        steepest = Math.max(steepest, angle);
        // THE ANGLE RISES, which is the property: the climb always lags the run.
        expect(angle).toBeGreaterThan(prevAngle - 0.6);
        prevAngle = angle;
    }
    // Nothing in the flight is steeper than the path's own average, and that
    // average is a shallow migration climb rather than a launch.
    const overall = Math.atan2(D.awayHeight, Math.hypot(D.awayX, D.awayZ)) * 180 / Math.PI;
    expect(steepest).toBeLessThan(overall + 1);
    expect(overall).toBeLessThan(25);
});

test('they dissolve into the haze rather than winking out', () => {
    // AWAY IS NOT HIDDEN, IT IS FAR. The meshes only go invisible once the
    // birds are past the fog ceiling, so there is no frame where three ducks
    // vanish in place.
    const D = W.wildlife.ducks;
    const cam = GARDEN_CONFIG.camera;
    const away = Math.hypot(W.pond.x + D.awayX - cam.position.x,
        D.awayHeight - cam.position.y,
        W.pond.z + D.awayZ - cam.position.z);
    expect(away).toBeGreaterThan(GARDEN_CONFIG.sky.fog.far);
    // And still inside the frustum, or they would clip out instead of fading.
    expect(away).toBeLessThan(cam.far);

    const wildlife = readFileSync(
        join(process.cwd(), 'www', 'garden', 'js', 'wildlife.js'), 'utf8');
    expect(wildlife).toMatch(/const gone = flight >= 0\.999/);

    // THE FLAP IS A SQUASH, NOT A HINGE, which is this file's own rule for
    // everything it draws. A hinge at this distance moves a wingtip by a pixel
    // and a half. The wings only exist in flight, and their span is the only
    // proportion that matters at ten pixels.
    expect(wildlife).toMatch(/s\.set\(\s*halfSpan \* pose/);
    expect(D.wingSpan).toBeGreaterThan(D.bodyLength);

    // ---- THE MESH IS TWO UNITS WIDE, SO THE SCALE IS A HALF SPAN --------
    // `wingGeometry` runs from x = -1 to +1. Handing it the full span drew
    // wings twice as long as the config asked for: a span three times the body
    // against a real duck's one and a half, which QA saw as too long.
    expect(wildlife).toMatch(/const halfSpan = D\.wingSpan \* body \* 0\.5/);
    // The drawn span is the config's number, and it is the real proportion: a
    // mallard is 0.85 m across on a 0.55 m body. One of the few numbers in this
    // scene that did NOT need exaggerating for the frame.
    const drawn = D.wingSpan * D.bodyLength;
    expect(drawn / D.bodyLength).toBeCloseTo(0.85 / 0.55, 1);
    // And the old model is proved to be twice that, so the guard is a guard.
    expect((drawn * 2) / D.bodyLength).toBeGreaterThan(2.8);

    // ---- THE STROKE IS AN ANGLE, AND THAT IS WHY IT WAS WRONG (M23-3) ----
    // `wingGeometry` puts its tips at y = 0.25 for |x| = 1, so the Y scale
    // reaching a given sweep is tan(angle) / 0.25 times the span. Setting that
    // multiplier by hand left the wings sweeping SIX DEGREES, which QA read as
    // a hummingbird: a shiver at speed rather than a flap.
    const WING_TIP_Y = 0.25;
    const halfSpan = D.wingSpan * D.bodyLength * 0.5;
    const scaleY = halfSpan * Math.tan(D.flapDegrees * Math.PI / 180) / WING_TIP_Y;
    const sweep = Math.atan2(WING_TIP_Y * scaleY, halfSpan) * 180 / Math.PI;
    expect(sweep).toBeCloseTo(D.flapDegrees, 6);
    // A duck's wingtip travels 35 to 45 degrees either side of level.
    expect(D.flapDegrees).toBeGreaterThan(28);
    expect(D.flapDegrees).toBeLessThan(50);
    // And the old multiplier is proved to be nothing like it, so the guard is a
    // guard rather than the code restated.
    const oldSweep = Math.atan2(WING_TIP_Y * halfSpan * 0.42, halfSpan) * 180 / Math.PI;
    expect(oldSweep).toBeLessThan(10);

    // ---- AND THE BEAT IS SLOWER THAN A REAL DUCK'S, ON PURPOSE ----
    // A mallard beats 8 to 10 times a second. At ten pixels and sixty frames
    // that has no shape, it shimmers. Same family as sizing the bird at 0.95 m
    // rather than 0.55: the physically true number is the wrong one here.
    expect(D.flapHz).toBeLessThan(4);
    // A full stroke has to last long enough to be seen as a stroke.
    expect(60 / D.flapHz).toBeGreaterThan(15);
    // But it is still a bird and not a flag: fast enough to read as beating.
    expect(D.flapHz).toBeGreaterThan(1.5);
});

const { duckPosture } = await import('../www/garden/js/wildlife.js');

test('POSTURE IS NOT DISTANCE, which is why the wings were never seen', () => {
    // The fault QA reported twice in one sentence: never seeing the wings, and
    // the ducks keeping their floating pose in the air. One cause. The wings,
    // the neck and the heading were all scaled by the flight parameter, the
    // same number that carries the birds away, so each reached full only once
    // the duck was a speck.
    //
    // MEASURED, that put the wings at 3.4 px across when the body was 2.7, and
    // full span at the moment there was nothing left to see it on.
    const D = W.wildlife.ducks;
    const cam = GARDEN_CONFIG.camera;
    const perRad = 800 / (cam.fov * Math.PI / 180);
    const level = pondWaterLevel(W);
    const swim = { x: W.pond.x, z: W.pond.z, yaw: 0 };
    const px = (f, span) => {
        const air = duckFlightPos(swim, f, 0, 3);
        const y = level + air.lift;
        const d = Math.hypot(air.x - cam.position.x, y - cam.position.y,
            air.z - cam.position.z);
        return span / d * perRad;
    };

    // THE POSE FINISHES WHILE THEY ARE STILL BIG. That is the whole property.
    const doneAt = D.postureOver;
    expect(duckPosture(doneAt)).toBeCloseTo(1, 3);
    expect(px(doneAt, D.bodyLength)).toBeGreaterThan(8);

    // And the wings are wider than the body at that moment, so a visitor sees
    // a bird with its wings out rather than a blob that shrank.
    const wingsOut = px(doneAt, D.wingSpan * D.bodyLength * duckPosture(doneAt));
    expect(wingsOut).toBeGreaterThan(px(doneAt, D.bodyLength));
    expect(wingsOut).toBeGreaterThan(12);

    // THE GUARD AGAINST THE OLD MODEL: scaled by `flight` instead of the pose,
    // the wings at the same moment are a fraction of that.
    const oldModel = px(doneAt, D.wingSpan * D.bodyLength * doneAt);
    expect(oldModel).toBeLessThan(wingsOut / 4);

    // The pose is monotonic and starts from nothing, so a duck never begins
    // mid-flap.
    expect(duckPosture(0)).toBe(0);
    let prev = -1;
    for (let f = 0; f <= 1; f += 0.01) {
        const now = duckPosture(f);
        expect(now).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = now;
    }
});

test('and the take-off happens near the water, where it can be seen', () => {
    // The other half of the same fix. The run is held back so the first quarter
    // of the flight happens close in: at f = 0.25 they have travelled twelve
    // metres and are still nearly ten pixels across.
    const D = W.wildlife.ducks;
    const swim = { x: W.pond.x, z: W.pond.z, yaw: 0 };
    const at = duckFlightPos(swim, 0.25, 0, 3);
    const ground = Math.hypot(at.x - swim.x, at.z - swim.z);
    const total = Math.hypot(D.awayX, D.awayZ);
    expect(ground / total).toBeLessThan(0.1);

    // A NOSE-UP ATTITUDE, so they fly rather than slide along an invisible
    // ramp, and it follows the climb rather than being a constant.
    expect(at.pitch).toBeGreaterThan(0.05);
    expect(duckFlightPos(swim, 1, 0, 3).pitch)
        .toBeGreaterThan(duckFlightPos(swim, 0.1, 0, 3).pitch);
    // Applied in YXZ, or a pitched duck would also roll and read as a bird
    // falling over.
    const wildlife = readFileSync(
        join(process.cwd(), 'www', 'garden', 'js', 'wildlife.js'), 'utf8');
    expect(wildlife).toMatch(/e\.set\(pitch, yaw, 0, 'YXZ'\)/);

    // A FULL BEAT IS UP AND DOWN. `abs` on the sine would have flapped at twice
    // the stated rate with the wings never going below level.
    expect(wildlife).toMatch(/const beat = Math\.sin\(elapsed \* D\.flapHz/);
    expect(wildlife).not.toMatch(/Math\.abs\(Math\.sin\(elapsed \* D\.flapHz/);
});
