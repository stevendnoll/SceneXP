// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/highwater/js/sand.js.
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

const CONFIG_URL = '../www/highwater/js/config.js';
const WATER_URL = '../www/highwater/js/water.js';
const SAND_URL = '../www/highwater/js/sand.js';

// sand.js imports './config.min.js' and './water.min.js'. The minified builds
// are real and current, but pointing the test at the sources keeps a stale
// build from passing.
jest.unstable_mockModule('../www/highwater/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/highwater/js/water.min.js', async () => (
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
    boreDepth, runUpFromBore, swashDepth, swashSurfaceAt, surfaceWithSwash,
    sandRows, initSand, updateSand, addBreaks, disposeSand, swashReachMetres,
    getSandMesh, getWet, __sand
} = sand;

const { beach, sand: SAND, water: WATER, camera } = OCEAN_CONFIG;
// The same constant sand.js uses, restated rather than imported because it is
// not exported and a test that reached for it would be asserting against itself.
const GRAVITY = 9.81;

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

    test('the biggest calm swash lands in about three seconds', () => {
        // Not a tuned number, an output, and it is worth pinning because the
        // surf synthesiser next door was tuned to the same rhythm from the
        // other end: audio.breaks.washSeconds is 3.4.
        const duration = swashDuration(runUpFromBore(SAND.swash.maxBoreDepth));
        expect(duration).toBeGreaterThan(2);
        expect(duration).toBeLessThan(4.5);
    });
});

describe('the waves that broke are the water that arrives', () => {
    test('RUN UP IS DERIVED FROM THE BORE, NOT CONFIGURED BESIDE IT', () => {
        // THE STRUCTURAL POINT OF THE WHOLE BORE CHANGE. Run up used to be two
        // numbers in config, which meant a swash could be set to run ten metres
        // and still be a millimetre thick, and a millimetre of water cannot
        // break over anybody. Now Ritter's dam break front speed 2 sqrt(g d)
        // feeds the ballistic stop at u0^2 / 2a, so X = 2 g d0 / a and the depth
        // and the distance are one number wearing two hats.
        const a = swashDecel(beach);
        for (const d0 of [0.05, 0.3, 0.72, 1.4]) {
            expect(runUpFromBore(d0, beach)).toBeCloseTo((2 * GRAVITY * d0) / a, 9);
        }
        // Which makes it linear in depth, so twice the bore runs exactly twice
        // as far. That is the relationship a reader should be able to rely on.
        expect(runUpFromBore(0.6, beach)).toBeCloseTo(2 * runUpFromBore(0.3, beach), 9);
        expect(runUpFromBore(0, beach)).toBe(0);
        expect(runUpFromBore(-1, beach)).toBe(0);
    });

    test('a stronger break brings deeper water and runs further', () => {
        const weak = swashFromBreak({ strength: 0, distance: 0 }, 0);
        const strong = swashFromBreak({ strength: 1, distance: 0 }, 0);
        expect(weak.depth).toBeCloseTo(SAND.swash.minBoreDepth, 9);
        expect(strong.depth).toBeCloseTo(SAND.swash.maxBoreDepth, 9);
        expect(strong.runUp).toBeCloseTo(runUpFromBore(strong.depth, beach), 9);
        expect(strong.runUp).toBeGreaterThan(weak.runUp);
    });

    test('A BIGGER SWELL MAKES A DEEPER BORE, WHICH IS WHY THE STORM IS DANGEROUS', () => {
        // The bore is the one quantity in the scene that a bigger swell actually
        // makes bigger at the camera. The breaking wave itself does not: it is
        // pinned by the beach slope and the distance cancels, which is measured
        // to death under `beach.slope`. So this is the whole mechanism by which
        // three minutes of building storm turns into water over somebody's head.
        const calm = swashFromBreak({ strength: 0.9, distance: 0 }, 0, SAND, 1);
        const storm = swashFromBreak({ strength: 0.9, distance: 0 }, 0, SAND, 2.4);
        expect(storm.depth).toBeCloseTo(calm.depth * 2.4, 9);
        expect(storm.runUp).toBeCloseTo(calm.runUp * 2.4, 9);
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
        expect(s.depth).toBeCloseTo(SAND.swash.maxBoreDepth, 9);
        expect(s.start).toBe(0);
        expect(swashFromBreak({}, 0).depth).toBeCloseTo(SAND.swash.minBoreDepth, 9);
    });

    test('THE LENS IS A WEDGE: full thickness behind, nothing at the tip', () => {
        // The shape that decides whether somebody gets hit. Two ends of it are
        // exact and only the middle is a simplification: the tip comes straight
        // from the ballistic parabola, and a tongue of water running up sand has
        // to end in an edge rather than in a step.
        const swash = { start: 0, depth: 0.5, runUp: 4 };
        const duration = swashDuration(4, beach);
        const mid = duration / 2;
        // At the tip there is nothing, and just behind it there is a little.
        const tip = swashReach(mid, 4, beach);
        expect(swashDepth(mid, swash, beach, tip + 0.01)).toBe(0);
        expect(swashDepth(mid, swash, beach, tip - 0.5)).toBeGreaterThan(0);
        // It gets deeper all the way back to the water's edge.
        let previous = 0;
        for (let s = tip - 0.1; s > 0; s -= 0.2) {
            const d = swashDepth(mid, swash, beach, s);
            expect(d).toBeGreaterThanOrEqual(previous - 1e-9);
            previous = d;
        }
        // And it has drained by the time the sheet is back.
        expect(swashDepth(duration + 0.1, swash, beach, 0)).toBe(0);
        expect(swashDepth(-1, swash, beach, 0)).toBe(0);
    });

    test('THE LENS IS FED ON THE WAY UP AND ONLY DRAINS ON THE WAY BACK', () => {
        // A REAL BUG, WORTH ABOUT FORTY PER CENT OF THE DEPTH. The first version
        // drained linearly from the moment the swash started, which meant the
        // sheet was thinnest at exactly the moment it was travelling past
        // somebody. A bore FEEDS the lens behind it while the tip is still
        // advancing, so the thickness holds until the water turns around.
        //
        // Measured across the tide, the difference was whether a storm wave
        // broke over the visitor or washed past their knees.
        const swash = { start: 0, depth: 0.5, runUp: 4 };
        const duration = swashDuration(4, beach);
        // Full thickness for the whole outward half.
        for (const f of [0.05, 0.2, 0.35, 0.49]) {
            expect(swashDepth(duration * f, swash, beach, -1)).toBeCloseTo(0.5, 6);
        }
        // Then it drains, and is gone when the sheet is back.
        expect(swashDepth(duration * 0.75, swash, beach, -1)).toBeCloseTo(0.25, 6);
        expect(swashDepth(duration * 0.99, swash, beach, -1)).toBeLessThan(0.02);
        expect(swashDepth(duration, swash, beach, -1)).toBe(0);
    });

    test('SEAWARD OF THE WATERLINE THE BORE PASSES OVER AT FULL THICKNESS', () => {
        // The case that actually engulfs somebody, and the one most easily lost
        // to a clamp. Once the surge has carried the water's edge past the
        // camera, the camera is BEHIND the shoreline, so the bore rolls over it
        // whole rather than reaching it at the thin end of a wedge. A model that
        // only ran from zero upward would have quietly said nobody ever gets
        // more than a wedge tip, which is the version that did not engulf.
        const swash = { start: 0, depth: 0.5, runUp: 4 };
        const early = swashDuration(4, beach) * 0.1;
        expect(swashDepth(early, swash, beach, -2)).toBeGreaterThan(0.4);
        expect(swashDepth(early, swash, beach, -2))
            .toBeCloseTo(swashDepth(early, swash, beach, 0), 9);
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
        // AND THE ARC RAISED THE BAR HERE TWICE. It used to be enough to clear
        // the high tide plus a configured 2.4 m run up. Now the tsunami's surge
        // carries the waterline to z 14.2 and the bore behind it runs another
        // 6.9, so the sheet has to reach past 21. The storm suite walks every
        // second of the arc and asserts the real figure; this is the cheap
        // version of the same check, against the worst the calm sea can do.
        const highTide = beach.shoreZ + (WATER.tideRange / 2) / beach.slope;
        const biggest = runUpFromBore(boreDepth(1, SAND, 1), beach);
        expect(sandRows()[0]).toBeGreaterThan(highTide + biggest);
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
        const biggest = runUpFromBore(boreDepth(1, SAND, 1), beach);
        updateSand(swashDuration(biggest) / 2);
        expect(swashReachMetres()).toBeGreaterThan(1);
        const wet = getWet();
        expect(Math.max(...wet)).toBe(1);
    });

    test('A BIG BORE ON A RISEN SEA PUTS WATER OVER THE CAMERA', () => {
        // The end to end version of what the bore was added for, through the
        // real shell rather than through the pure core. A storm sized break on a
        // sea the surge has already pushed past the camera has to leave the
        // water surface above eye level, or the white-out never fires and three
        // minutes of build has no payoff.
        initSand(makeScene(), OCEAN_CONFIG);
        const surge = 0.55;
        // Dry-ish first: the still sea alone does not reach the eye. The camera
        // is standing in ankle deep water and that is all.
        expect(surfaceWithSwash(camera.z, surge)).toBeLessThan(camera.height);
        addBreaks([{ strength: 0.9, pan: 0, distance: 0 }], { swell: 2.4 });
        updateSand(0.05);
        expect(surfaceWithSwash(camera.z, surge)).toBeGreaterThan(camera.height);
        // And the same break in a calm sea does not, which is what makes it a
        // storm rather than a permanent flood.
        disposeSand();
        initSand(makeScene(), OCEAN_CONFIG);
        addBreaks([{ strength: 0.9, pan: 0, distance: 0 }], { swell: 1 });
        updateSand(0.05);
        expect(surfaceWithSwash(camera.z, 0)).toBeLessThan(camera.height);
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
