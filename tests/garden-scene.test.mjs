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
import { installThree, installCanvas, uninstallAll } from './helpers/three-stub.mjs';

let GARDEN_CONFIG;
let initWildlife, updateWildlife, disposeWildlife;
let initVista, disposeVista;
let createTree, disposeTree, resolveSpecies;
let updateVista, snowCoverageAt;
let pondHalfWidth;
let initForest, disposeForest, updateForest, getForestMeshes, __forest;

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
    ({ initWildlife, updateWildlife, disposeWildlife } =
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

    test('the three that compete with the trees are off, and the fireflies are not', () => {
        // The product decision, stated where a future reader will find it:
        // butterflies, birds and bats are moving things that pull the eye off
        // the only motion that matters. Fireflies are static points of light at
        // dusk, so they add depth without competing.
        const on = GARDEN_CONFIG.world.wildlife.enabled;
        expect(on.butterflies).toBe(false);
        expect(on.birds).toBe(false);
        expect(on.bats).toBe(false);
        expect(on.fireflies).toBe(true);
    });

    test('a creature that is off is never BUILT, not merely hidden', () => {
        const built = initWildlife(recordingScene(), GARDEN_CONFIG);
        // Null means buildFlyer was never called: no geometry, no material, no
        // seeded paths, and nothing for driveFlyer to walk every frame.
        expect(built.butterflies).toBeNull();
        expect(built.birds).toBeNull();
        expect(built.bats).toBeNull();
        expect(built.fireflies).not.toBeNull();
        expect(built.fireflies.count).toBeGreaterThan(0);
    });

    test('only the creatures that are on reach the scene', () => {
        const scene = recordingScene();
        initWildlife(scene, GARDEN_CONFIG);
        expect(scene.added).toHaveLength(1);
    });

    test('turning a flag back on is the only edit needed to restore one', () => {
        // The claim M8-1 makes about being reversible. If this ever fails, the
        // butterflies have quietly become a code change to bring back.
        const scene = recordingScene();
        const built = initWildlife(scene, withFlags((c) => {
            c.world.wildlife.enabled.butterflies = true;
        }));
        expect(built.butterflies).not.toBeNull();
        expect(built.butterflies.count).toBeGreaterThan(0);
        expect(scene.added).toHaveLength(2);
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
        const built = initWildlife(recordingScene(), GARDEN_CONFIG);
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
        const built = initWildlife(recordingScene(), GARDEN_CONFIG);
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
                butterflies: false, birds: false, bats: false, fireflies: false
            };
        }));
        expect(() => updateWildlife(20, 200, 0)).not.toThrow();
        expect(() => disposeWildlife()).not.toThrow();
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
            if (key === 'InstancedMesh') {
                return class Recorder {
                    constructor(geometry, material, count) {
                        this.geometry = geometry;
                        this.material = material;
                        this.count = count;
                        this.name = '';
                        this.instanceMatrix = { array: new Float32Array(Math.max(1, count) * 16), needsUpdate: false };
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
