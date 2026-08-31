// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * What the scene actually BUILDS, as opposed to what it draws.
 *
 * M8 takes most of the furniture out of the frame (PRD Addendum B), and the
 * whole milestone rests on one rule: **things are removed by a flag, never by a
 * deletion, and the flag gates CONSTRUCTION rather than visibility.** Hiding a
 * creature would leave its geometry, its instance matrices and its per-frame
 * walk all still being paid for, which is the usual way a "removed" feature
 * keeps its bill.
 *
 * That rule is invisible in a screenshot: a scene that builds four flocks and
 * hides three looks exactly like a scene that builds one. So it is asserted
 * here instead, by reading what init actually handed back.
 *
 * These suites touch THREE, so they use the shared stub. Nothing here models
 * real geometry: a group is either an object or it is null, and that is the
 * whole question being asked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree, installCanvas, uninstallAll } from './helpers/three-stub.mjs';

let GARDEN_CONFIG;
let initWildlife, updateWildlife, disposeWildlife, fireflyGlowSize, REFERENCE_FRAME_PX;
let initVista, disposeVista;
let createTree, disposeTree, resolveSpecies;
let updateVista, snowCoverageAt;
let pondHalfWidth;
let initForest, disposeForest, updateForest, getForestMeshes, __forest;
let initBeds, disposeBeds, syncBeds, updateBeds, __beds;
let builtGarden, builtBeds;

/** A scene that only records what was put in it. */
function recordingScene() {
    const added = [];
    return { added, add(x) { added.push(x); }, remove() { } };
}

/** A config with one flag flipped, since GARDEN_CONFIG is deep frozen. */
function withFlags(patch) {
    const copy = structuredClone(GARDEN_CONFIG);
    patch(copy);
    return copy;
}

beforeAll(async () => {
    installThree();
    // forest.js paints its canopy and leaf masks into a canvas at build time.
    installCanvas();
    ({ GARDEN_CONFIG } = await import('../www/garden/js/config.js'));
    ({ initBeds, disposeBeds, syncBeds, updateBeds, __test__: __beds } = await import('../www/garden/js/beds.js'));
    // The BUILT pair, for the wiring test below: garden.js resolves its own
    // imports to the .min files, so only these two share one beds instance.
    builtGarden = await import('../www/garden/js/garden.min.js');
    builtBeds = await import('../www/garden/js/beds.min.js');
    ({ initWildlife, updateWildlife, disposeWildlife, fireflyGlowSize, REFERENCE_FRAME_PX } =
        await import('../www/garden/js/wildlife.js'));
    ({ initVista, disposeVista } = await import('../www/garden/js/vista.js'));
    ({ createTree, disposeTree } = await import('../www/garden/js/tree.js'));
    ({ resolveSpecies } = await import('../www/garden/js/species.js'));
    ({ updateVista } = await import('../www/garden/js/vista.js'));
    ({ snowCoverageAt } = await import('../www/garden/js/clock.js'));
    ({ pondHalfWidth } = await import('../www/garden/js/terrain.js'));
    __forest = await import('../www/garden/js/forest.js');
    ({ initForest, disposeForest, updateForest, getForestMeshes } = __forest);
});

afterAll(() => uninstallAll());

// ---- Wildlife (M8-1) -------------------------------------------------------

describe('the wildlife flags', () => {
    afterEach(() => disposeWildlife());

    test('the four that fly are off, and the ducks are not', () => {
        // The product decision, stated where a future reader will find it:
        // butterflies, birds and bats are moving things that pull the eye off
        // the only motion that matters. The fireflies came off later and for a
        // different reason, which is that neither version of them landed. The
        // sphere drew octagons and the glow that replaced it read as too faint,
        // and the fix for the second is a lighting problem rather than a sizing
        // one. See M12-9.
        const on = GARDEN_CONFIG.world.wildlife.enabled;
        expect(on.butterflies).toBe(false);
        expect(on.birds).toBe(false);
        expect(on.bats).toBe(false);
        expect(on.fireflies).toBe(false);
        // THE DUCKS DO NOT HAVE THE PROBLEM THE OTHERS HAD (M22-1). Everything
        // above was switched off for pulling the eye away from the growing
        // trees. Ducks are on the LAKE, which is already where the eye goes
        // when it leaves the plot, and they drift rather than fly.
        expect(on.ducks).toBe(true);
    });

    test('a creature that is off is never BUILT, not merely hidden', () => {
        const built = initWildlife(recordingScene(), GARDEN_CONFIG);
        // Null means buildFlyer was never called: no geometry, no material, no
        // seeded paths, and nothing for driveFlyer to walk every frame. With
        // everything off the module builds nothing at all, which is the state
        // the early-return bug below would hide rather than announce.
        expect(built.butterflies).toBeNull();
        expect(built.birds).toBeNull();
        expect(built.bats).toBeNull();
        expect(built.fireflies).toBeNull();
        // The ducks are the exception, and they are two meshes: a pale body and
        // a dark head, because at 12 px the body alone is a floating leaf.
        expect(built.ducks).not.toBeNull();
        expect(built.duckHeads).not.toBeNull();
        expect(built.duckWings).not.toBeNull();
    });

    test('only the creatures that are on reach the scene', () => {
        const scene = recordingScene();
        initWildlife(scene, GARDEN_CONFIG);
        // The ducks' three meshes, and nothing else: a pale body, a dark head,
        // and the wings that only exist while they are migrating.
        expect(scene.added).toHaveLength(3);
    });

    test('turning a flag back on is the only edit needed to restore one', () => {
        // The claim M8-1 makes about being reversible, and the claim M12-9
        // leans on hardest now that the fireflies are the ones waiting to come
        // back. If this ever fails, benching a creature has quietly become a
        // code change to undo rather than one word in the config.
        for (const name of ['butterflies', 'fireflies', 'birds', 'bats']) {
            const scene = recordingScene();
            const built = initWildlife(scene, withFlags((c) => {
                c.world.wildlife.enabled[name] = true;
            }));
            expect(built[name]).not.toBeNull();
            expect(built[name].count).toBeGreaterThan(0);
            // The one turned on, plus the ducks' three.
            expect(scene.added).toHaveLength(4);
            disposeWildlife();
        }
    });

    test('the fireflies are still DRIVEN when the butterflies are gone', () => {
        // THE BUG THIS EXISTS TO STOP. updateWildlife opened with
        // `if (!butterflies) return`, which was harmless while everything was
        // always built and became a silent bug the moment one creature could be
        // switched off alone: the butterflies going would have taken the
        // fireflies with them and nothing would have thrown.
        //
        // NOTHING THROWING IS NOT THE TEST. The first version of this asserted
        // `not.toThrow()` and passed with the bug reintroduced, because an
        // early return does not throw. It has to watch the work happen. The
        // group handed back is the same object the module holds, so swapping
        // its mesh for a recorder puts a probe inside the real drive loop.
        //
        // BUILT BEHIND THE FLAG, because the shipped config has the fireflies
        // off (M12-9) and this guard is about the drive loop rather than about
        // the product decision. It is worth more now than it was: the module's
        // only remaining creature is one nobody is watching in a screenshot.
        const built = initWildlife(recordingScene(), withFlags((c) => {
            c.world.wildlife.enabled.fireflies = true;
        }));
        let matrixWrites = 0;
        built.fireflies.mesh = {
            visible: false,
            material: {},
            instanceMatrix: {},
            instanceColor: {},
            setMatrixAt() { matrixWrites += 1; },
            setColorAt() { }
        };
        // Hour 20 sits inside the firefly window (17.8 to 22.5) with no snow,
        // so they are unambiguously out.
        updateWildlife(20, 200, 0);
        expect(matrixWrites).toBe(built.fireflies.count);
        expect(built.fireflies.mesh.visible).toBe(true);
    });

    test('and they are still put away at the hours they do not belong to', () => {
        const built = initWildlife(recordingScene(), withFlags((c) => {
            c.world.wildlife.enabled.fireflies = true;
        }));
        built.fireflies.mesh = {
            visible: true,
            material: {},
            instanceMatrix: {},
            instanceColor: {},
            setMatrixAt() { },
            setColorAt() { }
        };
        updateWildlife(12, 120, 0);   // noon
        expect(built.fireflies.mesh.visible).toBe(false);
    });

    test('nothing throws when every creature is off', () => {
        initWildlife(recordingScene(), withFlags((c) => {
            c.world.wildlife.enabled = {
                butterflies: false, birds: false, bats: false, fireflies: false,
                ducks: false
            };
        }));
        expect(() => updateWildlife(20, 200, 0)).not.toThrow();
        expect(() => disposeWildlife()).not.toThrow();
    });
});

// ---- A firefly is a light, so it holds its size on screen (M12-8) ----------

/**
 * WHY THIS IS MEASURED AT BOTH ENDS OF THE BOX.
 *
 * The fireflies were a 7 cm sphere, which is a BODY: it grows as it comes
 * toward the lens. Their box runs from 5.4 m in front of the camera to 31 m,
 * so the same insect was 28.8 px on the near edge at full blink and 5.4 px in
 * the far corner. QA found the near ones as flat lime octagons lying on the
 * lawn, and one in the sky at about 35 px. Nothing about the flight paths, the
 * hours, the blink or the count was wrong, and no test could see it, because
 * every one of them measured the insect and not the frame.
 *
 * A light's apparent size is its glow. So the property is that a firefly
 * covers the SAME pixels wherever it is, and that is what is asserted, at the
 * two corners of its own box that used to disagree by a factor of five.
 *
 * THIS BLOCK OUTLIVES THE FIREFLIES BEING SWITCHED OFF (M12-9), on purpose.
 * `fireflyGlowSize` is a pure function over the config, so it measures whether
 * the numbers are still sound whether or not anything is drawing them, and the
 * point of benching a creature rather than deleting it is that it comes back
 * tuned. A dormant feature with no guard on it comes back broken.
 */
function boxCorners(box) {
    const out = [];
    for (const x of [box.x0, 0, box.x1]) {
        for (const y of [box.y0, box.y1]) {
            for (const z of [box.z0, box.z1]) out.push({ x, y, z });
        }
    }
    return out;
}

/** Pixels across, projected independently of the code under test. */
function pxOf(metres, depth) {
    const pxPerRadian = REFERENCE_FRAME_PX / (GARDEN_CONFIG.camera.fov * Math.PI / 180);
    return 2 * Math.atan(metres / (2 * depth)) * pxPerRadian;
}

/** Radial distance from the composed viewpoint, which is what the module falls
 *  back to when it has not been handed a camera. */
function depthOf(point) {
    const eye = GARDEN_CONFIG.camera.position;
    return Math.hypot(point.x - eye.x, point.y - eye.y, point.z - eye.z);
}

describe('the fireflies hold their size on screen', () => {
    const F = () => GARDEN_CONFIG.world.wildlife.fireflies;

    test('a firefly is the same size at both ends of its own box', () => {
        const corners = boxCorners(F().box);
        const sizes = corners.map((c) => {
            const depth = depthOf(c);
            return pxOf(fireflyGlowSize(depth, 0, GARDEN_CONFIG, 0), depth);
        });
        const near = Math.max(...sizes);
        const far = Math.min(...sizes);
        // The old sphere spread these by a factor of 5.3 across the same
        // corners. Anything above a few percent means size has gone back to
        // being a property of the insect rather than of the frame.
        expect(near / far).toBeLessThan(1.02);
        expect(near).toBeCloseTo(F().sizePx, 1);
    });

    test('and the brightest blink is still nothing like the old worst case', () => {
        // The number QA actually saw: 28.8 px of flat green at the near edge on
        // a full blink. The blink is carried by brightness now, so all that is
        // left of it in the size is `bloom`.
        const corners = boxCorners(F().box);
        const worst = Math.max(...corners.map((c) => {
            const depth = depthOf(c);
            return pxOf(fireflyGlowSize(depth, 0, GARDEN_CONFIG, 1), depth);
        }));
        // The absolute cap the old worst case blows straight through, left
        // loose on purpose: how big a firefly should be is a matter of taste
        // and belongs in the config, while 28.8 px of flat green is a bug.
        expect(worst).toBeLessThan(18);
        // The property underneath it, which taste does not get a vote on: the
        // blink is a swell and not a growth, so the brightest a firefly gets
        // is within a quarter of its resting size.
        expect(worst).toBeGreaterThan(F().sizePx);
        expect(worst / F().sizePx).toBeLessThan(1.25);
    });

    test('a wider lens or a taller window moves it, and by the right amount', () => {
        // The two halves that move. Portrait widens the field to 72 degrees and
        // the window can be any height, so a size pinned to the composed camera
        // would be a third out on a phone. Same pixels, different metres.
        const depth = 12;
        const landscape = REFERENCE_FRAME_PX / (GARDEN_CONFIG.camera.fov * Math.PI / 180);
        const portrait = REFERENCE_FRAME_PX / (GARDEN_CONFIG.camera.portrait.fov * Math.PI / 180);
        const wide = fireflyGlowSize(depth, portrait, GARDEN_CONFIG, 0);
        const narrow = fireflyGlowSize(depth, landscape, GARDEN_CONFIG, 0);
        // A wider field means fewer pixels per radian, so the same pixels cost
        // more metres.
        expect(wide).toBeGreaterThan(narrow);
        expect(2 * Math.atan(wide / (2 * depth)) * portrait).toBeCloseTo(F().sizePx, 1);
        // And a frame twice as tall is twice as many pixels per radian, so the
        // insect stays the same number of pixels while halving in metres.
        expect(fireflyGlowSize(depth, landscape * 2, GARDEN_CONFIG, 0))
            .toBeCloseTo(narrow / 2, 5);
    });

    test('an unmeasured viewport falls back rather than vanishing', () => {
        // A first frame can arrive before the window has been measured. Zero
        // pixels per radian must not mean zero metres of firefly.
        const depth = 12;
        expect(fireflyGlowSize(depth, 0, GARDEN_CONFIG, 0)).toBeGreaterThan(0);
        expect(fireflyGlowSize(depth, 0, GARDEN_CONFIG, 0))
            .toBeCloseTo(fireflyGlowSize(
                depth, REFERENCE_FRAME_PX / (GARDEN_CONFIG.camera.fov * Math.PI / 180),
                GARDEN_CONFIG, 0), 6);
    });

    test('and one that drifts behind the lens does not turn inside out', () => {
        // A negative depth is a negative scale, which mirrors the card and, at
        // a big enough negative, draws it enormous behind the camera.
        expect(fireflyGlowSize(-4, 0, GARDEN_CONFIG, 0)).toBeGreaterThan(0);
        expect(fireflyGlowSize(-4, 0, GARDEN_CONFIG, 0))
            .toBe(fireflyGlowSize(0.4, 0, GARDEN_CONFIG, 0));
    });
});

// ---- The path and the gate (M8-1) ------------------------------------------

describe('the path and the gate', () => {
    afterEach(() => disposeVista());

    test('both are off, because both led the eye out of the clearing', () => {
        expect(GARDEN_CONFIG.world.path.enabled).toBe(false);
        expect(GARDEN_CONFIG.world.path.gateEnabled).toBe(false);
    });

    test('neither is built, and the mountains and the water still are', () => {
        const built = initVista(recordingScene(), null, GARDEN_CONFIG);
        expect(built.pathMesh).toBeFalsy();
        expect(built.gateGroup).toBeFalsy();
        // The vista is not switched off, only the two things leading out of it.
        expect(built.pond).toBeTruthy();
        expect(built.ridges.length).toBeGreaterThan(0);
    });

    test('turning them back on is the only edit needed', () => {
        const built = initVista(recordingScene(), null, withFlags((c) => {
            c.world.path.enabled = true;
            c.world.path.gateEnabled = true;
        }));
        expect(built.pathMesh).toBeTruthy();
        expect(built.gateGroup).toBeTruthy();
    });
});

// ---- The scrub (M8-1) ------------------------------------------------------

test('ninety percent of the bushes went by a number, not by a deletion', () => {
    const U = GARDEN_CONFIG.world.undergrowth;
    // Was 260 and 120. Kept as counts so restoring them is one edit, and kept
    // above zero because something has to break the line where the wall meets
    // the meadow.
    expect(U.bushes).toBeGreaterThan(0);
    expect(U.bushes).toBeLessThan(40);
    expect(U.bushesMobile).toBeGreaterThan(0);
    expect(U.bushesMobile).toBeLessThan(U.bushes);
});

// ---- One wind, applied consistently ----------------------------------------

describe('sway scales with the tree', () => {
    test('every species swings the same FRACTION of its own height', () => {
        // The sway used to be absolute metres, so at wind 1.0 a 3 m Japanese
        // Maple's tip swung a third of its height while a 14 m Coast Redwood's
        // moved 7 percent of its. QA saw it as one tree swaying hard while the
        // others barely moved, which is not what a single wind looks like.
        const ratios = [];
        for (const id of ['japanese-maple', 'sugar-maple', 'coast-redwood']) {
            const resolved = resolveSpecies(id, undefined);
            const tree = createTree(resolved, 4242, { mobile: true });
            const scale = tree.barkUniforms.uSwayScale.value;
            expect(scale).toBeGreaterThan(0);
            ratios.push(scale / resolved.matureHeight);
            disposeTree(tree);
        }
        // Same fraction for all three, whatever that fraction is.
        for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);
    });

    test('the leaves are handed the very same scale object as the bark', () => {
        // Not a copy. Two uniforms holding equal numbers today would be two
        // uniforms holding different numbers the first time one is retuned, and
        // the symptom would be a canopy sliding off its branches.
        const resolved = resolveSpecies('sugar-maple', undefined);
        const tree = createTree(resolved, 99, { mobile: true });
        expect(tree.leafUniforms.uSwayScale).toBe(tree.barkUniforms.uSwayScale);
        expect(tree.leafUniforms.uWind).toBe(tree.barkUniforms.uWind);
        disposeTree(tree);
    });
});

// ---- The lake freezes with everything else (M8-2) --------------------------

test('the freeze follows the same snow coverage the ground does', () => {
    // The pond and the ground must change together or the water is on its own
    // calendar. M8-2 widened the lake, and this is the half of its gate that a
    // width change could quietly break by rebuilding the material.
    const built = initVista(recordingScene(), null, GARDEN_CONFIG);
    const freeze = () => built.pond.uniforms.uFreeze.value;

    // Deep winter. NOT midnight: the flakes start at 22.5 and the ground is
    // not fully covered until 1.5, so hour 0 is halfway at 0.5. This test
    // asserted midnight and was wrong about the calendar, which is the sort of
    // thing only writing it down catches.
    updateVista(2, 0, snowCoverageAt(2), 0, null, GARDEN_CONFIG);
    expect(freeze()).toBeCloseTo(snowCoverageAt(2), 6);
    expect(freeze()).toBe(1);

    // Midsummer noon: no snow anywhere, so no ice.
    updateVista(12, 0, snowCoverageAt(12), 0, null, GARDEN_CONFIG);
    expect(freeze()).toBe(0);

    // And it thaws THROUGH spring rather than switching, walking the same
    // curve the ground uses. The melt runs from hour 3 to hour 5.
    let prev = 1;
    for (let hour = 3; hour <= 5.5; hour += 0.1) {
        updateVista(hour, 0, snowCoverageAt(hour), 0, null, GARDEN_CONFIG);
        expect(freeze()).toBeCloseTo(snowCoverageAt(hour), 6);
        expect(freeze()).toBeLessThanOrEqual(prev + 1e-9);
        prev = freeze();
    }
    expect(prev).toBe(0);
    disposeVista();
});

// ---- The vista is built out of real numbers (M8-2) -------------------------

/** Run a builder with PlaneGeometry recording the dimensions it is handed. */
function recordGeometry(run) {
    const seen = [];
    const base = globalThis.THREE;
    globalThis.THREE = new Proxy(base, {
        get(target, key) {
            if (key === 'PlaneGeometry') {
                return function Recorder(...args) { seen.push(args); return new base.PlaneGeometry(...args); };
            }
            return target[key];
        }
    });
    try { run(); } finally { globalThis.THREE = base; }
    return seen;
}

test('nothing in the vista is built NaN metres wide', () => {
    // THE BUG THIS EXISTS TO STOP, and it is the reason the lake was invisible.
    // `buildPond` read `P.halfWidth` after that key moved out of config into
    // `pondHalfWidth()`, so the water plane was built NaN metres across and
    // drew nothing at all. Nothing threw and the whole suite stayed green,
    // because under the stub a geometry is a proxy and NaN is just another
    // number it absorbs. A missing config key is normally caught by something
    // downstream complaining; here the complaint was a lake that was not there.
    const seen = recordGeometry(() => initVista(recordingScene(), null, GARDEN_CONFIG));
    expect(seen.length).toBeGreaterThan(0);
    for (const args of seen) {
        for (const value of args) {
            expect(Number.isFinite(value)).toBe(true);
        }
    }
    disposeVista();
});

test('the water plane is exactly as wide as the derivation says', () => {
    // Pins the mesh to the same number the ground is dug by. Two sources for
    // the lake's width would mean a plane that does not match its own basin.
    const seen = recordGeometry(() => initVista(recordingScene(), null, GARDEN_CONFIG));
    const widths = seen.map((a) => a[0]);
    expect(widths).toContain(pondHalfWidth() * 2);
    disposeVista();
});

// ---- The wood pays its way (M8-4) ------------------------------------------

/**
 * Run a builder with enough of a real THREE to COUNT what it made.
 *
 * The shared stub absorbs everything, which is what makes it useful and what
 * makes it useless here: under it a BufferAttribute is a proxy and
 * `index.array.length` is another proxy, not a number. So for the duration of
 * this measurement, geometry and attributes are real objects holding the real
 * typed arrays `bakeGeometry` writes, and everything else stays absorbed.
 */
function measureWood(run) {
    const meshes = [];
    const base = globalThis.THREE;
    class Geo {
        constructor() { this.attributes = {}; this.userData = {}; }
        setAttribute(name, attr) { this.attributes[name] = attr; }
        setIndex(attr) { this.index = attr; }
        computeVertexNormals() { }
        computeBoundingSphere() { }
        dispose() { }
    }
    class Attr {
        constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
    }
    // Real enough to read a threshold back off. Everything else stays absorbed.
    class Mat {
        constructor(params = {}) {
            Object.assign(this, params);
            this.userData = {};
            this.color = { hex: 0, setHex(v) { this.hex = v; } };
        }
        dispose() { }
    }
    // Real enough to read a uniform back out of. Everything else stays absorbed.
    class Vec3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setScalar(v) { return this.set(v, v, v); }
        copy(v) { return this.set(v.x, v.y, v.z); }
        clone() { return new Vec3(this.x, this.y, this.z); }
    }
    globalThis.THREE = new Proxy(base, {
        get(target, key) {
            if (key === 'BufferGeometry') return Geo;
            if (key === 'BufferAttribute' || key === 'InstancedBufferAttribute') return Attr;
            if (key === 'Vector3') return Vec3;
            if (key === 'MeshLambertMaterial' || key === 'MeshStandardMaterial') return Mat;
            if (key === 'InstancedMesh') {
                return class Recorder {
                    constructor(geometry, material, count) {
                        this.geometry = geometry;
                        this.material = material;
                        this.count = count;
                        this.name = '';
                        // `count` as well as the array: real three exposes it
                        // on the attribute and code reads it to find the
                        // buffer's capacity. Without it that read is undefined
                        // and every clamp derived from it comes out NaN.
                        this.instanceMatrix = {
                            array: new Float32Array(Math.max(1, count) * 16),
                            count,
                            needsUpdate: false
                        };
                        meshes.push(this);
                    }
                    setMatrixAt() { }
                    setColorAt() { }
                };
            }
            return target[key];
        }
    });
    try { run(); } finally { globalThis.THREE = base; }
    return meshes;
}

/** Triangles a recorded mesh actually draws, or null if it is not measurable. */
function trianglesOf(mesh) {
    const length = mesh.geometry && mesh.geometry.index && mesh.geometry.index.array
        && mesh.geometry.index.array.length;
    return typeof length === 'number' ? (length / 3) * mesh.count : null;
}

test('the middle-distance wood is inside the triangle budget it was sized to', () => {
    // M8-4's gate, and the number that made it necessary: 16 mature planted
    // trees are 276,896 of the 400,000, so the wood beyond the wall gets what
    // is left. Sized off the twelve-species MEAN this came out 7,457 over,
    // because these tiers use only the five largest species and a tree here
    // costs more than an average one. Measured from the built wood instead.
    const N = GARDEN_CONFIG.world.nearTreeline;
    const built = measureWood(() => initForest(recordingScene(), GARDEN_CONFIG, { mobile: false }));

    let triangles = 0;
    for (const mesh of built) {
        if (!String(mesh.name || '').startsWith('treeline')) continue;
        const count = trianglesOf(mesh);
        if (count !== null) triangles += count;
    }
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(N.triangleBudget);
    disposeForest();
});

test('the real wood is a handful of near trees, not a thicket of far ones', () => {
    // This started at 104 trees running out to 52 m and QA called it a tangled
    // mess. The count was a symptom: past about 30 m a deeply cut fractal tree
    // has lost the fine structure that makes a tree read, so it is worse than
    // the impostor it replaced. Now it is a couple of dozen legible trees near
    // enough to watch move, with the flat wood doing the mass behind them.
    const result = initForest(recordingScene(), GARDEN_CONFIG, { mobile: false });
    expect(result.counts.near).toBeGreaterThan(12);
    expect(result.counts.near).toBeLessThan(45);
    // And the flat tier still closes the horizon behind them.
    expect(result.counts.evergreen + result.counts.deciduous).toBeGreaterThan(800);
    disposeForest();
});

/** The tree groups the forest module is holding, however it exposes them. */
function nearTreeEntries() {
    return __forest.__test__ ? __forest.__test__.nearTrees() : [];
}

// ---- The wood sways, and not in lockstep (M8-5) ----------------------------

test('every tree in the wood has its own phase', () => {
    // THE WHOLE POINT OF THIS TASK. Instances share one geometry, and the sway
    // phase comes from vertex position in LOCAL space, so without a per-tree
    // offset a hundred trees sway in perfect unison and read as one object
    // breathing. M8-5 says the test is the gate here and not the picture, and
    // this is why: **a lockstep wood is invisible in a still frame** and would
    // pass every screenshot review we have.
    initForest(recordingScene(), GARDEN_CONFIG, { mobile: false });
    const groups = getForestMeshes();
    expect(groups.length).toBeGreaterThan(0);

    const phases = [];
    for (const entry of nearTreeEntries()) {
        expect(entry.phases).toBeDefined();
        expect(entry.phases.length).toBeGreaterThanOrEqual(entry.count);
        for (let i = 0; i < entry.count; i++) phases.push(entry.phases[i]);
    }
    expect(phases.length).toBeGreaterThan(10);
    // Distinct, and spread across a whole cycle rather than clustered.
    expect(new Set(phases.map((p) => p.toFixed(6))).size).toBe(phases.length);
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(Math.PI);
    disposeForest();
});

test('a tree and its own canopy share one phase', () => {
    // The other half. Different phases per TREE, but the same phase for a
    // tree's bark and its leaves, or the canopy slides off the branch under it.
    // Built through the recorder, because under the plain stub a geometry
    // attribute is absorbed and there is nothing to read back.
    measureWood(() => initForest(recordingScene(), GARDEN_CONFIG, { mobile: false }));
    for (const entry of nearTreeEntries()) {
        if (!entry.leafMesh) continue;
        const bark = entry.mesh.geometry.attributes.aTreePhase;
        const leaf = entry.leafMesh.geometry.attributes.aTreePhase;
        expect(bark).toBeDefined();
        expect(leaf).toBeDefined();
        // The same array, not a copy: two copies are two numbers to drift.
        expect(leaf.array).toBe(bark.array);
    }
    disposeForest();
});

test('the wood reads the same wind vector the garden does', () => {
    measureWood(() => initForest(recordingScene(), GARDEN_CONFIG, { mobile: false }));
    updateForest(12, 0, { x: 0.7, z: -0.3 }, 42);
    for (const entry of nearTreeEntries()) {
        expect(entry.sway.uTime.value).toBe(42);
        // Set through a Vector3, so read back what the stub recorded.
        expect(entry.sway.uWind.value.x).toBe(0.7);
        expect(entry.sway.uWind.value.z).toBe(-0.3);
    }
    disposeForest();
});

// ---- The wood is deciduous and goes bare (QA 2026-08-26) -------------------

test('nothing in the fractal wood is secretly an evergreen', () => {
    // Scots Pine and Blue Spruce were in here and are genuinely evergreen, but
    // they did not READ as conifers: only the spruce is conical, both wear the
    // same generic leaf clump mask, and at a reduced recursion neither keeps
    // the habit that would tell you what it is. A wood of trees that are
    // secretly evergreen is worse than a wood that plainly is not.
    initForest(recordingScene(), GARDEN_CONFIG, { mobile: false });
    for (const entry of nearTreeEntries()) {
        expect(`${entry.species.id}: ${entry.evergreen}`).toBe(`${entry.species.id}: false`);
    }
    // The horizon still has conifers, which is where dark winter mass belongs.
    expect(GARDEN_CONFIG.world.farForest.evergreenShare).toBeGreaterThan(0.2);
    disposeForest();
});

test('the wood goes properly bare in deep winter', () => {
    // M7-2 and M3-3 both call for bare, and it was not happening: the threshold
    // was the flat tier's 0.82 while this mask paints 0.62 to 0.92, so about a
    // third of the canopy stood through winter and overlapping clumps kept more.
    // Through the recorder: under the plain stub a material is absorbed and a
    // threshold cannot be read back off it.
    measureWood(() => initForest(recordingScene(), GARDEN_CONFIG, { mobile: false }));
    const N = GARDEN_CONFIG.world.nearTreeline;

    // Hour 2 is deep winter, fully turned and fully dropped.
    updateForest(2, 1, { x: 0, z: 0 }, 0);
    for (const entry of nearTreeEntries()) {
        if (!entry.leafMesh) continue;
        expect(entry.leafMesh.material.alphaTest).toBeCloseTo(N.bareAlphaTest, 6);
    }
    // And in full leaf it is the leafy threshold, or summer would be thin.
    updateForest(12, 0, { x: 0, z: 0 }, 0);
    for (const entry of nearTreeEntries()) {
        if (!entry.leafMesh) continue;
        expect(entry.leafMesh.material.alphaTest)
            .toBeCloseTo(GARDEN_CONFIG.world.farForest.leafyAlphaTest, 6);
    }
    disposeForest();
});

test('the bare threshold really does clear the mask it has to erase', () => {
    // The number that matters, tied to the texture rather than asserted on its
    // own: if the mask is ever repainted brighter than the threshold, the wood
    // silently keeps its winter canopy again and nothing else fails.
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'tree.js'), 'utf8');
    const fn = src.slice(src.indexOf('export function leafClusterTexture'));
    const m = fn.slice(0, fn.indexOf('\n}')).match(/rgba\(255,255,255,\$\{([\d.]+) \+ random\(\) \* ([\d.]+)\}\)/);
    expect(m).not.toBeNull();
    const brightest = Number(m[1]) + Number(m[2]);
    expect(GARDEN_CONFIG.world.nearTreeline.bareAlphaTest).toBeGreaterThan(brightest);
});

// ---- The beds pay their way (M10-6) ----------------------------------------
//
// Addendum B cleared this frame of everything that competed with the swaying,
// and M10 puts a bed and a water level under every tree. The cost has to be a
// number rather than a hope, and the shared stub cannot count, so the beds are
// built under the same real-geometry harness the wood is measured with.

test('THE BEDS, THE LEVELS AND THE DROPLETS ARE THREE DRAW CALLS, not forty eight', () => {
    const meshes = measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: false });
    });

    // One instanced mesh each, whatever the plot holds. The droplet earns its
    // own because it is a different shader and a different size rule, not
    // because it is a different tree: sixteen of them are still one draw.
    expect(meshes).toHaveLength(3);
    expect(meshes.map((m) => m.name).sort())
        .toEqual(['mulch-beds', 'thirst-drops', 'water-levels']);

    // Sized for the plot's capacity.
    for (const mesh of meshes) {
        expect(mesh.instanceMatrix.array.length / 16).toBe(GARDEN_CONFIG.plot.maxTrees);
        // And starting EMPTY: an instanced mesh whose count is its capacity
        // draws sixteen beds into a garden that has none.
        expect(mesh.count).toBe(0);
    }
    disposeBeds();
});

test('the beds cost a rounding error against the scene budget', () => {
    // A twenty-sided truncated cone is 40 side triangles plus two caps of 20,
    // so about 80 a bed, and a level is two. Against a scene measured near
    // 371,600 of its 400,000 this has to be invisible or the milestone has
    // quietly spent the wood's headroom on interface.
    const B = GARDEN_CONFIG.garden.bed;
    const perBed = B.segments * 4;
    const perLevel = 2;
    const total = GARDEN_CONFIG.plot.maxTrees * (perBed + perLevel);
    expect(total).toBeLessThan(2000);
});

test('a mobile plot builds a smaller bed buffer, not the desktop one', () => {
    const meshes = measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: true });
    });
    for (const mesh of meshes) {
        expect(mesh.instanceMatrix.array.length / 16).toBe(GARDEN_CONFIG.plot.maxTreesMobile);
    }
    expect(GARDEN_CONFIG.plot.maxTreesMobile).toBeLessThan(GARDEN_CONFIG.plot.maxTrees);
    disposeBeds();
});

test('SYNCING THE BEDS TRACKS THE TREE LIST, and clamps to the buffer', () => {
    // The beds are one instanced mesh, so "how many are drawn" is a number that
    // has to be maintained. An instanced mesh whose count is left at capacity
    // draws sixteen beds into a garden holding three, and nothing throws.
    let counted = [];
    const meshes = measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: false });
        const at = (gx, gz, moisture) => ({ record: { gx, gz, moisture } });
        counted.push(syncBeds([]));
        counted.push(syncBeds([at(0, 0, 1), at(1, 0, 1), at(-2, 3, 1)]));
        // More trees than the plot can hold cannot overrun the buffer.
        const many = [];
        for (let i = 0; i < GARDEN_CONFIG.plot.maxTrees + 8; i++) many.push(at(i % 5, i % 7, 1));
        counted.push(syncBeds(many));
    });

    expect(counted).toEqual([0, 3, GARDEN_CONFIG.plot.maxTrees]);
    for (const mesh of meshes) expect(mesh.count).toBe(GARDEN_CONFIG.plot.maxTrees);
    disposeBeds();
});

test('the level reads each tree\'s own tank, and only the live ones', () => {
    // The fill and the urgency ride per-instance attributes rather than a
    // uniform, which is the only way one draw call can show sixteen different
    // tanks. These are real typed arrays under the measurement harness, so the
    // numbers can actually be read back.
    const B = GARDEN_CONFIG.garden.bed;
    let levels;
    measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: false });
        const entries = [
            { record: { gx: 0, gz: 0, moisture: 1 } },      // full
            { record: { gx: 2, gz: 0, moisture: 0.3 } },    // getting on
            { record: { gx: -2, gz: 1, moisture: 0 } }      // empty
        ];
        syncBeds(entries);
        updateBeds(entries, 0);
        levels = __beds.levelAttributes();
    });

    const fill = levels.fill.array;
    const urgency = levels.urgency.array;
    expect(fill[0]).toBeCloseTo(1, 6);
    expect(fill[1]).toBeCloseTo(0.3, 6);
    expect(fill[2]).toBe(0);

    // Quiet when full, loudest when empty, and the middle one is in between.
    expect(urgency[0]).toBe(0);
    expect(urgency[2]).toBe(1);
    expect(urgency[1]).toBeGreaterThan(0);
    expect(urgency[1]).toBeLessThan(1);
    expect(B.noticeAbove).toBeGreaterThan(0.3);   // the middle case is inside the ramp
    disposeBeds();
});

test('THE LENS REACHES THE LEVEL, or its pixel floor is measured against nothing', () => {
    // The level holds a size on SCREEN, so it needs pixels per radian, which
    // depends on the viewport and on the composed FOV and therefore moves.
    // Without it the uniform keeps its build-time default and the bar quietly
    // drifts off its intended size at every window size but one, which is the
    // kind of wrong that never looks broken.
    let uniforms;
    measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: false });
        const entries = [{ record: { gx: 0, gz: 0, moisture: 1 } }];
        syncBeds(entries);
        updateBeds(entries, 0, 898.6);
        uniforms = __beds.levelUniforms();
    });
    expect(uniforms.uPxPerRad.value).toBeCloseTo(898.6, 6);
    expect(uniforms.uMinPx.value).toBe(GARDEN_CONFIG.garden.bed.minLevelPx);
    // The world height the floor is compared against has to be the bar's own,
    // or the comparison is between two different bars.
    expect(uniforms.uWorldHeight.value).toBe(GARDEN_CONFIG.garden.bed.levelHeight);
    disposeBeds();
});

test('THE LENS TRAVELS THE WHOLE CHAIN, conductor to shader', () => {
    // The two ends were each pinned and the WIRE BETWEEN THEM was not: cutting
    // `context.pxPerRadian` out of updateGarden left every suite green. So this
    // drives the BUILT modules, the way the boot suite does, because that is
    // the only way garden and beds share one instance of the state.
    const scene = recordingScene();
    builtGarden.initGarden(scene, { mobile: false });
    builtGarden.updateGarden(1 / 60, 0, { pxPerRadian: 742 });
    expect(builtBeds.__test__.levelUniforms().uPxPerRad.value).toBe(742);
    builtGarden.disposeGarden();
});

test('a frame with no lens leaves the level alone rather than zeroing it', () => {
    // updateBeds is also driven from places that have no camera. A zero must
    // not reach the shader, where it would divide the bar to nothing.
    let uniforms;
    measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: false });
        const entries = [{ record: { gx: 0, gz: 0, moisture: 1 } }];
        syncBeds(entries);
        updateBeds(entries, 0, 900);
        updateBeds(entries, 0, 0);
        uniforms = __beds.levelUniforms();
    });
    expect(uniforms.uPxPerRad.value).toBe(900);
    disposeBeds();
});

test('the beds take the season, and the snow reaches them', () => {
    // A bed that stayed brown through a covered winter would be the only bare
    // earth in the frame. The uniform is the only path the season has.
    let uniforms;
    measureWood(() => {
        initBeds(recordingScene(), GARDEN_CONFIG, { mobile: false });
        const entries = [{ record: { gx: 0, gz: 0, moisture: 1 } }];
        syncBeds(entries);
        updateBeds(entries, 0.75);
        uniforms = __beds.uniforms();
    });
    expect(uniforms.uSnow.value).toBeCloseTo(0.75, 6);
    disposeBeds();
});

test('EVERY PLANTED TREE HAS A BED, through the real planting path', () => {
    // QA found trees standing with a water level and no mulch under them. The
    // level and the bed are two instanced meshes synced in one loop, so a
    // count that can differ between them is the whole question.
    // FILL THE PLOT. Six trees was the old coverage here and six is not where
    // a capacity bug lives.
    const cells = [];
    for (let gz = -3; gz <= 3 && cells.length < 40; gz++) {
        for (let gx = -3; gx <= 3 && cells.length < 40; gx++) cells.push([gx, gz]);
    }
    const seen = [];
    measureWood(() => {
        builtGarden.initGarden(recordingScene(), { mobile: false });
        for (const [gx, gz] of cells) {
            const entry = builtGarden.plantTree('bur-oak', undefined, gx, gz, 0, () => 0.5);
            seen.push({
                planted: !!entry,
                trees: builtGarden.getTrees().length,
                beds: builtBeds.getBedMesh().count,
                levels: builtBeds.getLevelMesh().count
            });
        }
    });
    // Planting stops at the plot's capacity, which is fine and expected. What
    // is not fine is a bed count that stops somewhere else.
    for (const row of seen) {
        expect(row.beds).toBe(row.trees);
        expect(row.levels).toBe(row.trees);
    }
    const full = seen[seen.length - 1];
    expect(full.trees).toBe(GARDEN_CONFIG.plot.maxTrees);
    expect(full.beds).toBe(GARDEN_CONFIG.plot.maxTrees);
    builtGarden.disposeGarden();
});

test('A RESTORED GARDEN GETS ITS BEDS, not just a freshly planted one', () => {
    // Restoring is a DIFFERENT PATH from planting, and until the pagehide
    // data-loss bug was fixed it was barely reachable: every refresh wiped the
    // garden, so nobody had ever come back to one. The first QA session after
    // that fix reported trees standing with a water level and no mulch.
    const records = [];
    for (let i = 0; i < 9; i++) {
        records.push({
            id: `t${i}`, species: 'bur-oak', seed: 1234 + i,
            gx: (i % 3) - 3, gz: Math.floor(i / 3) - 3,
            custom: undefined, plantedAt: 0, growth: 0.44,
            moisture: 1, health: 1, bud: 0, budActive: false, lastWateredAt: 0
        });
    }
    let after;
    measureWood(() => {
        builtGarden.initGarden(recordingScene(), { mobile: false });
        builtGarden.restoreTrees(records);
        after = {
            trees: builtGarden.getTrees().length,
            beds: builtBeds.getBedMesh().count,
            levels: builtBeds.getLevelMesh().count
        };
    });
    expect(after.trees).toBe(records.length);
    expect(after.beds).toBe(records.length);
    expect(after.levels).toBe(records.length);
    builtGarden.disposeGarden();
});

test('A BED SURVIVES REMOVING OTHER TREES AND PLANTING NEW ONES', () => {
    // QA: "the issue happens with newly added trees", after removing a lot of
    // others. Removal splices the middle out of the list and every bed after it
    // shifts down an index, so plant-remove-plant is the sequence where a stale
    // matrix or a stale count would show, and it is the one path never tested.
    const seen = [];
    measureWood(() => {
        builtGarden.initGarden(recordingScene(), { mobile: false });
        const plant = (gx, gz) => builtGarden.plantTree('bur-oak', undefined, gx, gz, 0, () => 0.5);
        const snap = (label) => seen.push({
            label,
            trees: builtGarden.getTrees().length,
            beds: builtBeds.getBedMesh().count,
            levels: builtBeds.getLevelMesh().count
        });

        for (let i = -3; i <= 3; i++) plant(i, 0);
        snap('seven planted');
        // Take out the middle, the way a visitor clearing space does.
        for (const gx of [-1, 0, 1]) {
            const entry = builtGarden.getTrees().find((t) => t.record.gx === gx && t.record.gz === 0);
            builtGarden.removeTree(entry);
        }
        snap('three removed');
        for (let i = -2; i <= 2; i++) plant(i, 2);
        snap('five more planted');
        // And clear the lot, then start again.
        builtGarden.clearGarden();
        snap('cleared');
        for (let i = -2; i <= 2; i++) plant(i, -2);
        snap('replanted');
    });

    for (const row of seen) {
        expect(`${row.label}: beds ${row.beds}`).toBe(`${row.label}: beds ${row.trees}`);
        expect(`${row.label}: levels ${row.levels}`).toBe(`${row.label}: levels ${row.trees}`);
    }
    expect(seen.map((r) => r.trees)).toEqual([7, 4, 9, 0, 5]);
    builtGarden.disposeGarden();
});


// ---- The horizon wood sheds by mask, not by threshold (M11-3) --------------

/**
 * WHY THE THRESHOLD COULD NEVER HAVE WORKED, IN ARITHMETIC.
 *
 * `buildCanopyTexture` draws 34 foliage blobs over an opaque trunk. Canvas is
 * source-over, `a = a_dst + a_src * (1 - a_dst)`, so overlapping blobs
 * ACCUMULATE. The old winter threshold was 0.82 and the blobs are drawn at 0.42
 * to 0.68, which looks safely under it and is not: three deep reaches 0.97.
 * What winter removed was the fringe. What it kept was a solid tan core, in
 * full leaf, under snow, which is garden-16 and garden-17.
 *
 * Read off the drawing source rather than hardcoded, so repainting the mask
 * brighter cannot quietly restore the bug.
 */
function canopyBlobAlpha() {
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'forest.js'), 'utf8');
    const fn = src.slice(src.indexOf('function buildCanopyTexture'));
    const m = fn.slice(0, fn.indexOf('\n}')).match(/rgba\(255,255,255,\$\{([\d.]+) \+ random\(\) \* ([\d.]+)\}\)/);
    expect(m).not.toBeNull();
    return { low: Number(m[1]), high: Number(m[1]) + Number(m[2]) };
}

test('overlapping canopy blobs composite past any threshold that spares the branches', () => {
    const { low, high } = canopyBlobAlpha();
    const over = (a, b) => a + b * (1 - a);

    // Measured from the drawing source: 0.42 to 0.68 for one blob, 0.66 to
    // 0.90 for two, 0.80 to 0.97 for three, 0.89 to 0.99 for four. A single
    // blob is comfortably under a winter threshold of 0.82. Two already clears
    // it at the bright end, three clears it almost everywhere, and four clears
    // it outright even from the dimmest blobs the mask draws. A crown of 34
    // blobs at radius 0.34 of the texture is several deep through its middle.
    expect(high).toBeLessThan(0.82);
    expect(over(high, high)).toBeGreaterThan(0.82);
    expect(over(over(high, low), low)).toBeGreaterThan(0.82);
    expect(over(over(over(low, low), low), low)).toBeGreaterThan(0.82);

    // Which is why the number is GONE rather than raised: the trunk and limbs
    // in the same texture are opaque and must survive, but the tier is far, so
    // the mipmap chain averages a thin branch line down below any threshold
    // high enough to eat a 0.97 core. There is no single number.
    expect(GARDEN_CONFIG.world.farForest.bareAlphaTest).toBeUndefined();
});

test('winter takes every leaf pixel and no wood pixel, at every density of overlap', () => {
    // The shipped rule, lifted out of the fragment source and evaluated here,
    // rather than a restatement of it. Wood is drawn RED so its green channel
    // reads 0; foliage is white so its green reads 1.
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'forest.js'), 'utf8');
    expect(src).toContain('diffuseColor.a *= mix(1.0, 1.0 - uCanopyBare, canopyLeaf);');

    const shown = (alpha, leaf, bare) => alpha * (1 + (1 - bare - 1) * leaf);
    const threshold = GARDEN_CONFIG.world.farForest.leafyAlphaTest;

    // Deep winter: nothing with any foliage in it survives, whatever its alpha,
    // which is the property the accumulating alpha destroyed.
    for (let a = 0.4; a <= 1.0001; a += 0.02) {
        expect(shown(a, 1, 1)).toBeLessThan(threshold);
    }
    // And the branches are untouched at every bareness, or the wood vanishes
    // with its leaves and the horizon opens up in January.
    for (let bare = 0; bare <= 1.0001; bare += 0.05) {
        expect(shown(1, 0, bare)).toBe(1);
        expect(shown(1, 0, bare)).toBeGreaterThan(threshold);
    }
    // Full leaf is an identity, so summer is exactly what it was.
    for (let a = 0.4; a <= 1.0001; a += 0.05) {
        expect(shown(a, 1, 0)).toBeCloseTo(a, 10);
    }
});

test('the far tier threshold no longer moves with the season', () => {
    // It used to be written every frame from `barenessAt`. If somebody puts
    // that back, the mask and the threshold are both trying to shed the wood
    // and the wood over-thins in summer as well as under-shedding in winter.
    measureWood(() => initForest(recordingScene(), GARDEN_CONFIG, { mobile: false }));
    const leafy = GARDEN_CONFIG.world.farForest.leafyAlphaTest;
    const far = getForestMeshes().find((m) => m && m.name === 'forest-deciduous');
    expect(far).toBeTruthy();
    for (const hour of [2, 6, 12, 18, 21]) {
        updateForest(hour, hour === 2 ? 1 : 0, { x: 0, z: 0 }, 0);
        expect(far.material.alphaTest).toBeCloseTo(leafy, 6);
    }
    // And the bareness really is being written, or nothing sheds at all.
    updateForest(12, 0, { x: 0, z: 0 }, 0);
    const summer = far.material.userData.bare.value;
    updateForest(2, 1, { x: 0, z: 0 }, 0);
    const winter = far.material.userData.bare.value;
    expect(summer).toBeCloseTo(0, 6);
    expect(winter).toBeCloseTo(1, 6);
    disposeForest();
});
