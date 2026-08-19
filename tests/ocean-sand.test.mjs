// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/ocean/js/sand.js.
//
// THE POINT OF THESE IS THE SWASH, which is the only thing in the file with any
// physics in it. It is a parabola with no free parameters: the run up distance
// fixes the launch speed and the launch speed fixes the duration, all through
// the beach slope. That means a whole class of plausible-looking mistakes, a
// stray factor of two, a sine substituted for the parabola, a duration tuned by
// hand until it looked right, would each break a relationship that can be
// stated exactly. So the assertions below are mostly statements about the
// water: it must go exactly as far as it was asked to, take exactly as long as
// gravity says, come back to where it started, and never reach further on a
// gentler beach than on a steep one.
//
// The wetness half is simpler and its failures are duller, so it is tested for
// the two things that would actually be noticed: sand under water is wet, and
// sand out of it dries at the configured rate rather than at some rate.

import { jest } from '@jest/globals';

const CONFIG_URL = '../www/ocean/js/config.js';
const WATER_URL = '../www/ocean/js/water.js';
const SAND_URL = '../www/ocean/js/sand.js';

// sand.js imports './config.min.js' and './water.min.js'. The minified builds
// are real and current, but pointing the test at the sources keeps a stale
// build from passing.
jest.unstable_mockModule('../www/ocean/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/ocean/js/water.min.js', async () => (
    await import(WATER_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);

// ---------------------------------------------------------------------------
// A THREE stub with real arrays in it, matching the water suite's
// ---------------------------------------------------------------------------

class StubBufferAttribute {
    constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
        this.count = array.length / itemSize;
        this.usage = 'static';
        this.needsUpdate = false;
    }
    setUsage(usage) { this.usage = usage; return this; }
}

class StubBufferGeometry {
    constructor() { this.attributes = {}; this.index = null; this.disposed = false; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    getAttribute(name) { return this.attributes[name]; }
    setIndex(attribute) { this.index = attribute; return this; }
    computeVertexNormals() { this.normalsComputed = true; }
    dispose() { this.disposed = true; }
}

class StubMaterial {
    constructor(params = {}) { Object.assign(this, params); this.disposed = false; }
    dispose() { this.disposed = true; }
}

class StubMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.parent = null;
        this.matrixAutoUpdate = true;
    }
    updateMatrix() { this.matrixUpdated = true; }
}

function installThree() {
    globalThis.THREE = {
        BufferGeometry: StubBufferGeometry,
        BufferAttribute: StubBufferAttribute,
        MeshStandardMaterial: StubMaterial,
        Mesh: StubMesh,
        Color: class { constructor(hex) { this.hex = hex; } },
        DynamicDrawUsage: 'dynamic'
    };
}

function makeScene() {
    return {
        children: [],
        add(object) { this.children.push(object); object.parent = this; },
        remove(object) {
            const i = this.children.indexOf(object);
            if (i >= 0) this.children.splice(i, 1);
            object.parent = null;
        }
    };
}

installThree();
const sand = await import(SAND_URL);
const {
    swashDecel, swashDuration, swashReach, waterlineZ, swashFromBreak, reachZ, soak,
    sandRows, initSand, updateSand, addBreaks, disposeSand, swashReachMetres,
    getSandMesh, getWet, __sand
} = sand;

const { beach, sand: SAND, water: WATER, camera } = OCEAN_CONFIG;

afterEach(() => { disposeSand(); });

// ---------------------------------------------------------------------------

describe('the swash is a parabola with nothing to tune', () => {
    test('the deceleration is gravity down the slope, not a chosen number', () => {
        const beta = Math.atan(beach.slope);
        expect(swashDecel()).toBeCloseTo(9.81 * Math.sin(beta) * Math.cos(beta), 9);
    });

    test('a steeper beach throws the water back faster', () => {
        // Monotonic in the slope, which is the property that keeps the swash
        // honest if the beach is ever re-cut. It was 1:14 once and 1:4.5 now.
        let previous = 0;
        for (const slope of [0.05, 0.1, 0.22, 0.4, 0.7]) {
            const a = swashDecel({ slope });
            expect(a).toBeGreaterThan(previous);
            previous = a;
        }
    });

    test('it reaches exactly the run up it was asked for, and no further', () => {
        for (const runUp of [0.4, 1.0, 2.4, 5.0]) {
            const duration = swashDuration(runUp);
            let peak = 0;
            for (let t = 0; t <= duration; t += duration / 400) {
                peak = Math.max(peak, swashReach(t, runUp));
            }
            expect(peak).toBeCloseTo(runUp, 3);
        }
    });

    test('the duration follows from the distance, with no second knob', () => {
        // THE RELATIONSHIP IS THE TEST. u0 is sqrt(2 a X) and the sheet is back
        // at 2 u0 / a, so quadrupling the run up only doubles the time. A
        // duration that had been tuned by hand would not track this.
        const a = swashDecel();
        for (const runUp of [0.6, 2.4, 9.6]) {
            expect(swashDuration(runUp)).toBeCloseTo(2 * Math.sqrt(2 * a * runUp) / a, 9);
        }
        expect(swashDuration(9.6) / swashDuration(2.4)).toBeCloseTo(2, 6);
    });

    test('it is back where it started at the end, and gone after', () => {
        const runUp = SAND.swash.maxRunUp;
        const duration = swashDuration(runUp);
        expect(swashReach(duration, runUp)).toBeCloseTo(0, 6);
        expect(swashReach(duration + 1, runUp)).toBe(0);
        expect(swashReach(-1, runUp)).toBe(0);
        expect(swashReach(0, runUp)).toBe(0);
    });

    test('it is symmetric about its peak, which is what a ballistic sheet is', () => {
        const runUp = 2.4;
        const duration = swashDuration(runUp);
        for (const f of [0.1, 0.25, 0.4]) {
            expect(swashReach(duration * f, runUp))
                .toBeCloseTo(swashReach(duration * (1 - f), runUp), 6);
        }
    });

    test('a degenerate swash is zero rather than a NaN', () => {
        expect(swashDuration(0)).toBe(0);
        expect(swashReach(1, 0)).toBe(0);
        expect(swashDuration(2.4, { slope: 0 })).toBe(0);
    });

    test('the configured run up lands in about three seconds', () => {
        // Not a tuned number, an output, and it is worth pinning because the
        // surf synthesiser next door was tuned to the same rhythm from the
        // other end: audio.breaks.washSeconds is 3.4.
        const duration = swashDuration(SAND.swash.maxRunUp);
        expect(duration).toBeGreaterThan(2);
        expect(duration).toBeLessThan(4.5);
    });
});

describe('the waves that broke are the water that arrives', () => {
    test('a stronger break runs further up, inside the configured range', () => {
        const weak = swashFromBreak({ strength: 0, distance: 0 }, 0);
        const strong = swashFromBreak({ strength: 1, distance: 0 }, 0);
        expect(weak.runUp).toBeCloseTo(SAND.swash.minRunUp, 9);
        expect(strong.runUp).toBeCloseTo(SAND.swash.maxRunUp, 9);
        expect(strong.runUp).toBeGreaterThan(weak.runUp);
    });

    test('the sheet arrives after the crash, by the time a bore takes to cross',
        () => {
            // THE DELAY IS THE POINT. The wave breaks twelve metres out and the
            // whitewater takes five seconds to reach the sand at 2.4 m/s. Start
            // them together and the water arrives before its own wave.
            const near = swashFromBreak({ strength: 0.5, distance: 0 }, 100);
            const far = swashFromBreak({ strength: 0.5, distance: 12 }, 100);
            expect(near.start).toBeCloseTo(100, 9);
            expect(far.start).toBeCloseTo(100 + 12 / SAND.swash.boreSpeed, 9);
            expect(far.start - near.start).toBeGreaterThan(4);
        });

    test('a nonsense event is clamped rather than propagated', () => {
        const s = swashFromBreak({ strength: 5, distance: -3 }, 0);
        expect(s.runUp).toBeCloseTo(SAND.swash.maxRunUp, 9);
        expect(s.start).toBe(0);
        expect(swashFromBreak({}, 0).runUp).toBeCloseTo(SAND.swash.minRunUp, 9);
    });
});

describe('where the water is', () => {
    test('the waterline slides up and down the beach with the tide', () => {
        // A quarter of the tide period is the high, three quarters the low.
        const high = waterlineZ(WATER.tidePeriodSeconds * 0.25);
        const low = waterlineZ(WATER.tidePeriodSeconds * 0.75);
        expect(high).toBeGreaterThan(low);
        // Vertical range over the slope, which is the horizontal excursion.
        expect(high - low).toBeCloseTo(WATER.tideRange / beach.slope, 6);
    });

    test('the reach never falls below the waterline, whatever the swashes do', () => {
        const line = waterlineZ(0);
        expect(reachZ([], 0, 0)).toBeCloseTo(line, 9);
        expect(reachZ([{ start: 100, runUp: 2 }], 0, 0)).toBeCloseTo(line, 9);
        expect(reachZ([{ start: -99, runUp: 2 }], 0, 0)).toBeCloseTo(line, 9);
    });

    test('the biggest swash on the beach is the one that sets the reach', () => {
        const small = { start: 0, runUp: 0.6 };
        const big = { start: 0, runUp: 2.4 };
        const t = swashDuration(2.4) / 2;
        expect(reachZ([small, big], t, 0)).toBeCloseTo(reachZ([big], t, 0), 9);
        expect(reachZ([small, big], t, 0)).toBeGreaterThan(reachZ([small], t, 0));
    });
});

describe('the sand remembers', () => {
    test('anything the water is standing on is soaked', () => {
        const rowZ = Float32Array.from([9, 7, 5, 3]);
        const wet = new Float32Array(4);
        soak(wet, rowZ, 6, 0.1);
        expect(Array.from(wet)).toEqual([0, 0, 1, 1]);
    });

    test('it dries on the configured time constant, not on a guess', () => {
        const rowZ = Float32Array.from([9]);
        const wet = Float32Array.from([1]);
        soak(wet, rowZ, 0, SAND.dryingSeconds);
        // One time constant leaves 1/e behind, which is what an exponential is.
        expect(wet[0]).toBeCloseTo(Math.exp(-1), 6);
        soak(wet, rowZ, 0, SAND.dryingSeconds);
        expect(wet[0]).toBeCloseTo(Math.exp(-2), 6);
    });

    test('a wave re-wets sand that was drying', () => {
        const rowZ = Float32Array.from([7]);
        const wet = new Float32Array(1);
        soak(wet, rowZ, 0, 3);
        expect(wet[0]).toBe(0);
        soak(wet, rowZ, 8, 0.1);
        expect(wet[0]).toBe(1);
    });

    test('it allocates nothing, because it runs for as long as the tab is open',
        () => {
            const rowZ = Float32Array.from([9, 5]);
            const wet = new Float32Array(2);
            expect(soak(wet, rowZ, 6, 0.1)).toBe(wet);
        });
});

describe('the sheet the sand is drawn on', () => {
    test('it borrows the water rows and stops where the sea goes opaque', () => {
        const rows = sandRows();
        expect(rows.length).toBeGreaterThan(20);
        expect(rows.length).toBeLessThan(OCEAN_CONFIG.water.rows);
        // Ordered from the camera outward, like the water's own curve.
        for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeLessThan(rows[i - 1]);
        // It has to cover the shallows the sea shows its bed through, and there
        // is no point past that.
        const opaque = beach.shoreZ - (beach.maxDepth * 0.55) / beach.slope;
        expect(rows[rows.length - 1]).toBeLessThan(opaque);
        expect(rows[rows.length - 2]).toBeGreaterThan(opaque);
    });

    test('the near edge is off the bottom of the frame, so the beach has no visible end', () => {
        // DERIVED FROM THE LENS, not written down, and it used to say "behind
        // the camera". That was too strong, and a trial move of the camera back
        // to 11.6 proved it by putting the near edge 1.1 metres IN FRONT of the
        // eye and still invisible. The camera came back to 8, but the weaker
        // assertion is the right one to keep: what matters is that the edge sits
        // inside the strip the lens leaves blind, which is everything nearer
        // than the camera height over the tangent of half the vertical field of
        // view. Being behind the eye was one way to satisfy that, not the
        // requirement.
        const frameBottom = camera.height / Math.tan((camera.fov * Math.PI) / 360);
        expect(camera.z - sandRows()[0]).toBeLessThan(frameBottom);
    });

    test('there is sand under the whole swash, at every tide', () => {
        // The other end of the same edge. The sheet has to reach further up the
        // beach than the water ever does, or the biggest run up at the top of
        // the tide would climb off the end of the sand and simply stop being
        // drawn. Highest waterline plus the largest run up, against the near
        // edge, both in world z.
        const highTide = beach.shoreZ + (WATER.tideRange / 2) / beach.slope;
        expect(sandRows()[0]).toBeGreaterThan(highTide + SAND.swash.maxRunUp);
    });
});

describe('the beach in a scene', () => {
    test('it adds one mesh and takes it away again', () => {
        const scene = makeScene();
        initSand(scene, OCEAN_CONFIG);
        expect(scene.children.map((c) => c.name)).toEqual(['sand']);
        expect(getSandMesh()).toBe(scene.children[0]);
        disposeSand();
        expect(scene.children).toHaveLength(0);
        expect(getSandMesh()).toBeNull();
    });

    test('the wetness attribute exists under the name the shader reads', () => {
        // THE ONE PLUMBING BUG WORTH GUARDING AGAINST. An attribute the shader
        // reads under a name the geometry does not supply is silent: it reads
        // as zero, the beach is permanently dry, and nothing reports it.
        initSand(makeScene(), OCEAN_CONFIG);
        const attribute = getSandMesh().geometry.getAttribute('aWet');
        expect(attribute).toBeDefined();
        expect(attribute.itemSize).toBe(1);
        expect(attribute.usage).toBe('dynamic');
        const { grid } = __sand.state();
        expect(attribute.array.length).toBe(grid.rows * grid.cols);
    });

    test('a break reaches the sand and wets it', () => {
        initSand(makeScene(), OCEAN_CONFIG);
        addBreaks([{ strength: 1, pan: 0, distance: 0 }]);
        // Halfway through the swash, the water is at its furthest.
        updateSand(swashDuration(SAND.swash.maxRunUp) / 2);
        expect(swashReachMetres()).toBeGreaterThan(1);
        const wet = getWet();
        expect(Math.max(...wet)).toBe(1);
    });

    test('the wetness is broadcast across each row, not left on one vertex', () => {
        initSand(makeScene(), OCEAN_CONFIG);
        addBreaks([{ strength: 1, pan: 0, distance: 0 }]);
        updateSand(swashDuration(SAND.swash.maxRunUp) / 2);
        const { grid } = __sand.state();
        const array = getSandMesh().geometry.getAttribute('aWet').array;
        for (const r of [0, 1, grid.rows - 1]) {
            const first = array[r * grid.cols];
            for (let c = 1; c < grid.cols; c++) {
                expect(array[r * grid.cols + c]).toBe(first);
            }
        }
    });

    test('the swash list cannot grow while the tab is left open', () => {
        initSand(makeScene(), OCEAN_CONFIG);
        for (let i = 0; i < 60; i++) {
            addBreaks([{ strength: 0.8, pan: 0, distance: 6 }]);
            updateSand(0.5);
        }
        expect(__sand.state().swashes.length).toBeLessThanOrEqual(SAND.swash.maxActive);
    });

    test('nothing throws before init or after dispose', () => {
        disposeSand();
        expect(() => updateSand(1)).not.toThrow();
        expect(() => addBreaks([{ strength: 1, distance: 0 }])).not.toThrow();
        expect(swashReachMetres()).toBe(0);
    });

    test('a nonsense delta does not move the beach', () => {
        initSand(makeScene(), OCEAN_CONFIG);
        updateSand(undefined);
        expect(__sand.state().elapsed).toBe(0);
    });
});
