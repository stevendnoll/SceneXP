// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/highwater/js/buoy.js and for `waveSurfaceAt` in water.js.
 *
 * THE FIRST BLOCK IS THE ONE THAT MATTERS AND IT IS NOT ABOUT THE BUOY. The sea
 * is displaced on the GPU and the buoy is positioned on the CPU, so there are
 * two implementations of one sum and the whole illusion rests on them agreeing.
 * If they drift the buoy floats above the water or sits inside it, and nothing
 * throws, nothing warns, and no other test in this repository would notice. So
 * the shader's own displacement is written out a third time here, independently,
 * and the two are walked against each other across the arc.
 *
 * The rest is the pure core: the flash character, the sinking, the pendulum.
 * All of it is arithmetic on plain numbers and none of it needs a browser.
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';

beforeAll(() => { installThree(); });
afterAll(() => { uninstallAll(); });

const CONFIG_URL = '../www/highwater/js/config.js';
const WATER_URL = '../www/highwater/js/water.js';
const STORM_URL = '../www/highwater/js/storm.js';
const BUOY_URL = '../www/highwater/js/buoy.js';

jest.unstable_mockModule('../www/highwater/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/highwater/js/water.min.js', async () => (
    await import(WATER_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);
const {
    rowPositions, buildProfile, waveConstants, waveSurfaceAt, initWater, updateWater, disposeWater
} = await import(WATER_URL);
const { swellAt, curveAt, frontAt } = await import(STORM_URL);
const { lightOn, sinkAt, targetTilt, stepRoll, initBuoy, disposeBuoy, SHAPE } = await import(BUOY_URL);
const { srgbToLinear, toneMapACES, linearToSrgb, unpackColor, skyStateAt, applyGloom } =
    await import('../www/highwater/js/sky.js');

const B = OCEAN_CONFIG.storm.buoy;
const DEG = 180 / Math.PI;

// The house THREE stub rather than a local one. A hand rolled proxy here first,
// and Jest's own globals inspection could not survive it: `getProtectedKeys`
// asks every global for a primitive and a fully chainable proxy answers with
// another proxy. The shared helper already guards Symbol.toPrimitive for exactly
// this reason.
const makeScene = () => ({ children: [], add(o) { this.children.push(o); }, remove() {} });

// ---------------------------------------------------------------------------

describe('the CPU surface query agrees with the vertex shader', () => {
    afterEach(() => { disposeWater(); });

    test('height matches an independent port of the shader, across the arc', () => {
        // The shader's own sum, written from VERTEX_BODY rather than from
        // waveSurfaceAt, so this is a genuine second opinion and not a
        // restatement of the thing under test.
        const zs = rowPositions(OCEAN_CONFIG.water.rows, OCEAN_CONFIG);
        const constants = waveConstants(OCEAN_CONFIG.water.waves);
        const n = constants.length;
        let row = 0;
        let best = Infinity;
        for (let r = 0; r < zs.length; r++) {
            const gap = Math.abs(zs[r] - B.z);
            if (gap < best) { best = gap; row = r; }
        }
        const shaderY = (profile, x, t) => {
            let y = 0;
            for (let i = 0; i < n; i++) {
                const k = profile.k[row * n + i];
                const amp = profile.amp[row * n + i];
                if (!(amp > 0) || !(k > 0)) continue;
                const phase = profile.phase[row * n + i]
                    + constants[i].kSin * x - constants[i].omega * t;
                y += amp * Math.sin(phase)
                    - profile.sharp[row * n + i] * Math.cos(2 * phase);
            }
            return y;
        };

        initWater(makeScene(), OCEAN_CONFIG);
        let worst = 0;
        let elapsed = 0;
        // Walk far enough to cross the profile rebuild interval many times, so
        // this covers the case waveSurfaceAt is actually used in: a live profile
        // being replaced under it six times a second.
        for (let step = 0; step < 400; step++) {
            const dt = 1 / 60;
            elapsed += dt;
            updateWater(dt, {
                swell: swellAt(elapsed, OCEAN_CONFIG.storm),
                surge: curveAt(elapsed, OCEAN_CONFIG.storm.surge, OCEAN_CONFIG.storm),
                front: frontAt(elapsed, OCEAN_CONFIG.storm),
                gloom: 0
            });
            const mine = waveSurfaceAt(B.x, B.z);
            expect(mine).not.toBeNull();
            const profile = buildProfile(zs, elapsed, OCEAN_CONFIG, null, {
                swell: swellAt(elapsed, OCEAN_CONFIG.storm),
                surge: curveAt(elapsed, OCEAN_CONFIG.storm.surge, OCEAN_CONFIG.storm),
                front: frontAt(elapsed, OCEAN_CONFIG.storm)
            });
            // `wave` is the sum alone; `y` adds the vertex offset the shader
            // applies separately. Compared against the sum, because that is the
            // part the two implementations could drift on.
            worst = Math.max(worst, Math.abs(mine.wave - shaderY(profile, B.x, elapsed)));
            // And the drawn height is the sum plus exactly that offset.
            expect(mine.y - mine.wave).toBeCloseTo(mine.lift, 12);
        }
        // A millimetre. Anything above this is the two implementations having
        // genuinely parted company rather than floating point.
        expect(worst).toBeLessThan(0.001);
    });

    test('THE DRAWN SURFACE ACTUALLY RISES WHEN THE TSUNAMI PASSES', () => {
        // THE BUG THAT LIVED IN THIS SCENE THE LONGEST. `transformed.y +=
        // aShore.w` is the only thing that lifts this mesh, and until 2026-08-21
        // the attribute writer put `tideOffset(elapsed)` in it: the astronomical
        // tide alone. The surge and the tsunami's rise reached the sea only
        // through `depth`, so they changed how big its waves could be without
        // ever changing where its surface sat. At the wall the arc believed in
        // 17.35 m of water and the mesh was drawn at 3.38.
        //
        // Nothing failed. Every test passed. The scene looked plausible, because
        // the deeper water let the swell behind the front stand tall enough to
        // read as a wall. It took putting a floating object on the sea to find
        // it, because a buoy is the first thing in this scene that had to agree
        // with the water rather than be the water.
        //
        // Asserted end to end on the live profile: run the arc to the moment the
        // front is passing a point, and the surface there must be metres up.
        initWater(makeScene(), OCEAN_CONFIG);
        const at = OCEAN_CONFIG.storm.buoy.z;
        let calm = null;
        let lifted = null;
        // FROM t=55 AND AT 20 Hz. The point is to exercise the live profile
        // being rebuilt under the query, not to render the arc: walking all
        // seventy six seconds at frame rate cost fifty seconds of test time for
        // no extra coverage, since the profile itself only rebuilds twenty times
        // a second.
        // TO 84 AND NOT 76. The front was slowed on 2026-08-21 to keep the
        // camera from sitting under water for seven seconds, so it now passes
        // the buoy later than this test used to assume. Walked past the front's
        // own arrival rather than to a second that happened to work.
        let elapsed = 55;
        while (elapsed < 84) {
            const dt = 1 / 20;
            elapsed += dt;
            updateWater(dt, {
                swell: swellAt(elapsed, OCEAN_CONFIG.storm),
                surge: curveAt(elapsed, OCEAN_CONFIG.storm.surge, OCEAN_CONFIG.storm),
                front: frontAt(elapsed, OCEAN_CONFIG.storm),
                gloom: 1
            });
            const front = frontAt(elapsed, OCEAN_CONFIG.storm);
            // Well ahead of the front: the drawback's flat water.
            if (front && front.z < at - 60) calm = waveSurfaceAt(0, at).lift;
            // Well behind it: the body of the wave.
            if (front && front.z > at + 30) lifted = lifted ?? waveSurfaceAt(0, at).lift;
        }
        expect(calm).not.toBeNull();
        expect(lifted).not.toBeNull();
        // The drawback puts the flat water slightly BELOW mean level, which is
        // itself only true now that the surge lifts the mesh as well.
        expect(calm).toBeLessThan(0.5);
        // And the wave body is metres up. Ten is a floor, not a target: it is
        // there to fail loudly if the lift ever goes back to being the tide.
        expect(lifted).toBeGreaterThan(10);
    });

    test('the raised water has a back to it, so the sheet edge stays down', () => {
        // The one thing the lift could not simply be. Seaward of the front the
        // water stands `rise` higher for ever, and lifting the whole sheet by
        // that put ITS OWN FAR EDGE 43 to 58 px above the horizon under a third
        // of a fog: a hard line with sky above it. `tsunami.bodyMetres` tapers
        // the lift away behind the front, which turns the step into a body of
        // water with a back.
        const rows = rowPositions(OCEAN_CONFIG.water.rows, OCEAN_CONFIG);
        const farRow = rows.length - 1;
        for (const t of [62, 66, 70, 74, 78]) {
            const p = buildProfile(rows, t, OCEAN_CONFIG, null, {
                swell: swellAt(t, OCEAN_CONFIG.storm),
                surge: curveAt(t, OCEAN_CONFIG.storm.surge, OCEAN_CONFIG.storm),
                front: frontAt(t, OCEAN_CONFIG.storm)
            });
            // ASSERTED IN PIXELS, because pixels are the artifact. A metre of
            // lift 412 m out is about a pixel, and the first version of this
            // guessed a bound in metres and tripped over its own arbitrariness
            // at 1.58 m, which is 1.6 px and is nothing.
            const dist = OCEAN_CONFIG.camera.z - rows[farRow];
            const above = Math.max(0, p.lift[farRow] - OCEAN_CONFIG.camera.height);
            const px = Math.atan(above / dist) * (180 / Math.PI) * (1080 / OCEAN_CONFIG.camera.fov);
            expect(px).toBeLessThan(5);
        }
    });

    test('it reports null rather than a wrong answer before the sea exists', () => {
        // The frames before the first profile. Returning zero here would put the
        // buoy at mean sea level for a frame on every replay, which is a visible
        // twitch, and returning NaN would put it nowhere at all.
        expect(waveSurfaceAt(B.x, B.z)).toBeNull();
    });
});

describe('the light', () => {
    test('it is a real flash character and not a blink', () => {
        // Fl(2): two flashes, then a long dark. The PAIR is what makes it read
        // as a navigation light, so the assertion is that there are exactly two
        // lit intervals in a period rather than one or three.
        let edges = 0;
        let previous = lightOn(0, B);
        const step = 1 / 240;
        for (let t = step; t < B.flashPeriod; t += step) {
            const now = lightOn(t, B);
            if (now && !previous) edges++;
            previous = now;
        }
        // The period starts lit, so the first rising edge is at the second flash.
        expect(lightOn(0, B)).toBe(true);
        expect(edges).toBe(1);
    });

    test('it is dark for most of the period, which is what makes it read', () => {
        let lit = 0;
        const step = 1 / 240;
        let total = 0;
        for (let t = 0; t < B.flashPeriod; t += step) { total++; if (lightOn(t, B)) lit++; }
        expect(lit / total).toBeLessThan(0.25);
        expect(lit / total).toBeGreaterThan(0.02);
    });

    test('it is the same on every watch, and on any frame', () => {
        // Driven off the arc clock modulo the period, so a replay cannot open
        // mid flash and a dropped frame cannot desynchronise it.
        for (const t of [0, 1.7, 13.2, 29.9]) {
            expect(lightOn(t, B)).toBe(lightOn(t + B.flashPeriod * 5, B));
        }
    });
});

describe('the sea takes it', () => {
    // Driven by where the tsunami front is rather than by what time it is, so
    // these read the front's own schedule instead of naming seconds.
    const T = OCEAN_CONFIG.storm.tsunami;
    /** The second at which the front reaches the buoy, found rather than typed. */
    const arrival = (() => {
        for (let t = T.startAt; t <= OCEAN_CONFIG.storm.seconds; t += 1 / 60) {
            const f = frontAt(t, OCEAN_CONFIG.storm);
            if (f && f.z >= B.z) return t;
        }
        return null;
    })();

    test('the front does reach it, inside the arc', () => {
        expect(arrival).not.toBeNull();
        expect(arrival).toBeLessThan(OCEAN_CONFIG.storm.seconds - OCEAN_CONFIG.storm.fadeSeconds);
    });

    test('IT IS STILL THERE FOR THE LULL AND THE DRAWBACK', () => {
        // The correction that produced this whole rewrite. It used to sink on a
        // fixed clock at t=32, which threw away the three moments a scale
        // reference is actually worth having: the storm peak, the drawback and
        // the wall. Steve watched it and said he had expected it back.
        const stage = (name) => OCEAN_CONFIG.storm.stages.find((s) => s.name === name).from;
        for (const t of [stage('storm'), stage('lull'), stage('lull') + 4,
            stage('drawback'), stage('drawback') + 8]) {
            expect(sinkAt(t, B, OCEAN_CONFIG).visible).toBe(true);
            expect(sinkAt(t, B, OCEAN_CONFIG).sink).toBe(0);
        }
    });

    test('IT RIDES THE FACE UP BEFORE ANYTHING TAKES IT', () => {
        // The bug Steve could still see, as a property. `behindFront` blends the
        // big water in over the front's own width, so the sea at the buoy's row
        // is still flat when the front's EDGE arrives. Sinking from the edge
        // meant it descended at the same rate the water rose, the two cancelled,
        // and it read as the sea flowing around something that was not moving.
        //
        // Asserted as "still fully up once the edge has passed", which is what
        // makes room for the ride, rather than as a second on the clock.
        const front = frontAt(arrival + 0.5, OCEAN_CONFIG.storm);
        expect(front.z - B.z).toBeGreaterThan(0);        // the edge is past
        expect(sinkAt(arrival + 0.5, B, OCEAN_CONFIG).sink).toBe(0);   // and it is still up
        // The hold has to outlast the blend, or there is no ride to see.
        expect(B.lostAfterMetres).toBeGreaterThan(OCEAN_CONFIG.storm.tsunami.frontWidthNear);
    });

    test('and then it goes down, and stays down', () => {
        /** The second at which the front has travelled `metres` past the buoy. */
        const past = (metres) => {
            for (let t = arrival; t <= OCEAN_CONFIG.storm.seconds; t += 1 / 60) {
                const f = frontAt(t, OCEAN_CONFIG.storm);
                if (f && f.z - B.z >= metres) return t;
            }
            return null;
        };
        const during = sinkAt(past(B.lostAfterMetres + B.lostMetres / 2), B, OCEAN_CONFIG);
        expect(during.visible).toBe(true);
        expect(during.sink).toBeGreaterThan(0);
        expect(during.sink).toBeLessThan(B.lostDepth);
        for (const t of [past(B.lostAfterMetres + B.lostMetres) + 0.1, 85, 90, 1000]) {
            expect(sinkAt(t, B, OCEAN_CONFIG).visible).toBe(false);
        }
    });

    test('it is gone before the wall reaches the camera', () => {
        // Not a rule so much as a check that the ride and the sink both fit in
        // the time the front takes to cross the last hundred metres. If they
        // ever stop fitting, the buoy would still be on screen when the sea
        // closes over the visitor, which is one object too many for that moment.
        expect(sinkAt(T.arriveAt, B, OCEAN_CONFIG).visible).toBe(false);
    });

    test('IT IS A FUNCTION OF THE CLOCK AND NOT A FLAG', () => {
        // The arc runs backwards on a replay and under `oceanSetArc`. A latched
        // boolean would leave the buoy missing from a sea it should still be
        // floating on, which is the same class of bug the tide had before
        // `resetWater` existed.
        expect(sinkAt(90, B, OCEAN_CONFIG).visible).toBe(false);
        expect(sinkAt(5, B, OCEAN_CONFIG).visible).toBe(true);
        expect(sinkAt(90, B, OCEAN_CONFIG).visible).toBe(false);
    });

    test('it survives long enough to measure the wall against', () => {
        // The whole reason it now lives past the storm. It has to still be
        // floating when the front gets to it, because the front rolling over it
        // IS the measurement: the visitor has had seventy seconds to learn how
        // big the buoy is, and then watches the wall swallow it.
        //
        // ASSERTED AGAINST THE FRONT'S OWN ARRIVAL and not against a second
        // guessed at. The first version of this test said `arriveAt - 6` on the
        // assumption the front reached the buoy near the end of its run. It does
        // not: the buoy is 95 m out and the front slows as it comes in, so it
        // passes the buoy about eight seconds before it reaches the camera.
        expect(sinkAt(arrival - 1, B, OCEAN_CONFIG).visible).toBe(true);
        expect(sinkAt(arrival - 1, B, OCEAN_CONFIG).sink).toBe(0);
        // And that arrival is comfortably after the sea has already left, so the
        // buoy is present for the whole drawback.
        const drawback = OCEAN_CONFIG.storm.stages.find((s) => s.name === 'drawback').from;
        expect(arrival).toBeGreaterThan(drawback + 8);
    });
});

describe('the roll', () => {
    test('THE PENDULUM SWINGS PAST THE WATER, WHICH IS THE POINT', () => {
        // The first version chased the slope with an exponential and could never
        // exceed it, which capped the lean at a few pixels. A float in a seaway
        // is a driven pendulum and a driven pendulum overshoots. If this stops
        // being true somebody has replaced the integrator with a lerp again.
        const target = { x: 0.25, z: 0 };
        let state = { x: 0, z: 0, vx: 0, vz: 0 };
        let peak = 0;
        for (let i = 0; i < 600; i++) {
            state = stepRoll(state, target, 1 / 120, B);
            peak = Math.max(peak, state.x);
        }
        expect(peak).toBeGreaterThan(target.x * 1.2);
        // ...and settles rather than running away.
        expect(state.x).toBeCloseTo(target.x, 2);
    });

    test('it cannot be blown up by a long frame', () => {
        // A tab returning from the background hands over a delta of seconds. An
        // unclamped spring answers that with a buoy spinning in place.
        let state = { x: 0, z: 0, vx: 0, vz: 0 };
        for (let i = 0; i < 50; i++) state = stepRoll(state, { x: 0.4, z: -0.3 }, 12, B);
        for (const v of [state.x, state.z, state.vx, state.vz]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(Math.abs(v)).toBeLessThan(10);
        }
    });

    test('the water it is asked to follow is clamped, in both axes', () => {
        const wild = targetTilt(50, -50, B, false);
        const limit = B.maxTiltDegrees / DEG;
        expect(Math.abs(wild.x)).toBeLessThanOrEqual(limit + 1e-9);
        expect(Math.abs(wild.z)).toBeLessThanOrEqual(limit + 1e-9);
    });

    test('reduced motion keeps the buoy and loses the swing', () => {
        // Not a missing buoy: the scale reference is the reason it exists, and
        // removing it would cost the thing it is mostly here for.
        const normal = targetTilt(0.3, 0.3, B, false);
        const soft = targetTilt(0.3, 0.3, B, true);
        expect(Math.abs(soft.x)).toBeLessThan(Math.abs(normal.x));
        expect(Math.abs(soft.x)).toBeGreaterThan(0);
        expect(B.reducedTiltScale).toBeLessThan(0.5);
    });

    test('a flat sea leaves it upright', () => {
        expect(targetTilt(0, 0, B).x).toBeCloseTo(0, 12);
        expect(targetTilt(0, 0, B).z).toBeCloseTo(0, 12);
    });
});

describe('it lives in the same weather as everything else', () => {
    test('THE BODY IS LIT AND ONLY THE LAMP IS NOT', () => {
        // The buoy used to be built entirely from MeshBasicMaterial, which
        // ignores light completely, so it was the same bright orange at t=0
        // under a blue sky as at t=50 under a black one. In an arc whose whole
        // subject is the light changing, the one object that ignores the light
        // is the one that reads as pasted on. Steve saw it and asked for rust;
        // the rust was not the problem.
        //
        // Recorded off the THREE stub rather than asserted on source text,
        // by delegating to it through a proxy that notes what was reached for.
        const real = globalThis.THREE;
        const used = [];
        globalThis.THREE = new Proxy(real, {
            get(target, prop) {
                if (typeof prop === 'string') used.push(prop);
                return target[prop];
            }
        });
        try {
            initBuoy(makeScene(), OCEAN_CONFIG, {});
            disposeBuoy();
        } finally {
            globalThis.THREE = real;
        }
        // Orange, white, black. Pinned at three rather than "at least one",
        // because the count going UP means a weathering scheme has crept back
        // in: at 16 px wide a fourth colour is mud, and that was tried and
        // rejected on 2026-08-21.
        expect(used.filter((n) => n === 'MeshStandardMaterial').length).toBe(3);
        // And exactly one thing that emits rather than receives. A navigation
        // light that dims as the weather closes in is not a navigation light.
        expect(used.filter((n) => n === 'MeshBasicMaterial').length).toBe(1);
        // NOTHING ABOVE THE LAMP. A cone topmark was here and came out at
        // Steve's request: 5 px of black sitting over the light, taking the eye
        // off the one part that is meant to be the brightest thing on it.
        expect(used).not.toContain('ConeGeometry');
        // AND NOTHING POINTED UNDERNEATH IT EITHER. The hull bottom used to be
        // a long cone, which is fine as long as it is never seen, and it is
        // seen: while the buoy climbs the face of the tsunami the sight line to
        // its underside clears the water in front by three to five metres. A
        // rounded bowl is what a float lifted clear of the water looks like.
        // `ConeGeometry` appearing at either end is the same mistake twice.
        expect(used).toContain('SphereGeometry');
    });

    test('THE FLOAT IS THE LARGEST THING ABOVE THE WATERLINE', () => {
        // The bug behind "I barely see the orange" and "the stem still looks
        // gray", which were one bug and not two. The hull sat almost entirely
        // UNDER the water, so of 36 px of buoy only 4 were orange and 15 were
        // white mast. Nothing about the palette could have fixed that.
        //
        // A real mark is mostly float: the mast carries the light and nothing
        // else, and at a hundred metres it is the orange mass that says "buoy".
        const bands = {
            float: SHAPE.HULL_TOP,
            band: SHAPE.BAND_TOP - SHAPE.HULL_TOP,
            shoulder: SHAPE.SHOULDER_TOP - SHAPE.BAND_TOP,
            tower: SHAPE.TOWER_TOP - SHAPE.SHOULDER_TOP,
            lamp: SHAPE.LAMP - SHAPE.TOWER_TOP
        };
        for (const [name, size] of Object.entries(bands)) {
            expect(size).toBeGreaterThan(0);
            expect(bands.float).toBeGreaterThanOrEqual(size);
            void name;
        }
        // And it is a substantial share rather than merely the biggest of five
        // slivers. A third is the floor.
        expect(bands.float).toBeGreaterThan(0.33);
        // The bands have to run in order, or the geometry overlaps itself.
        const stops = [SHAPE.HULL_TOP, SHAPE.BAND_TOP, SHAPE.SHOULDER_TOP,
            SHAPE.TOWER_TOP, SHAPE.LAMP];
        for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1]);
        expect(SHAPE.LAMP).toBeLessThanOrEqual(1);
    });

    test('and it is still findable against the sea it sits on', () => {
        // The risk of lighting it. An albedo is not a screen colour: it gets
        // multiplied by a storm sky that has had two thirds of its sun taken
        // away, and a buoy nobody can pick out has stopped being a ruler.
        //
        // A Lambert response under this scene's own two lights, compared
        // against the sea's own storm colour through the same pipeline.
        const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
        const lit = (hex, gloom) => {
            const st = applyGloom(skyStateAt(0.46, OCEAN_CONFIG.sky), gloom, OCEAN_CONFIG.sky);
            const albedo = unpackColor(hex).map(srgbToLinear);
            const irr = [0, 1, 2].map((i) => st.hemiIntensity
                * (st.hemiSky[i] * 0.5 + st.hemiGround[i] * 0.5)
                + st.sunIntensity * st.sunColor[i] * 0.55);
            // Diffuse plus the retroreflective floor, which is what the
            // material actually draws.
            return toneMapACES(
                albedo.map((a, i) => a * irr[i] / Math.PI + a * B.retroreflect), st.exposure)
                .map((c) => Math.min(255, Math.max(0, linearToSrgb(c) * 255)));
        };
        const hull = luma(lit(B.hullColor, 1));
        const sea = luma(lit(OCEAN_CONFIG.water.stormDeepColor, 1));
        expect(hull - sea).toBeGreaterThan(25);

        // AND IT HAS TO ACTUALLY DARKEN, or it has gone back to being a
        // cut-out that ignores the weather. The retroreflective floor lifts it
        // but must not flatten it: past about 0.6 the storm stops reaching it
        // at all and there was no point lighting it in the first place.
        expect(luma(lit(B.hullColor, 1))).toBeLessThan(luma(lit(B.hullColor, 0)) * 0.92);
        // Stated on the floor itself as well, because that is the number
        // somebody would reach for if the buoy still looked too dark.
        expect(B.retroreflect).toBeLessThan(0.6);
    });
});

describe('where it sits', () => {
    test('it is in frame on a phone held upright', () => {
        // camera.fov is VERTICAL, so a portrait screen is narrow: about 19
        // degrees across against 69 on a desktop. That is the binding
        // constraint on how far off axis the buoy can be, and it is not
        // obvious from anything in config except this sum.
        const half = Math.atan(Math.tan(OCEAN_CONFIG.camera.fov / 2 / DEG) * (390 / 844));
        const edge = (OCEAN_CONFIG.camera.z - B.z) * Math.tan(half);
        expect(Math.abs(B.x)).toBeLessThan(edge);
    });

    test('it is in deep water, not in the surf', () => {
        // A moored channel mark standing in the break zone would be wrong, and
        // it would also be destroyed by whitewater rather than by the sea.
        const depth = Math.min(
            OCEAN_CONFIG.beach.maxDepth,
            (OCEAN_CONFIG.beach.shoreZ - B.z) * OCEAN_CONFIG.beach.slope
        );
        expect(depth).toBeGreaterThan(OCEAN_CONFIG.beach.maxDepth - 0.01);
    });

    test('it is not lost in the fog it has to be seen through', () => {
        // `clarity` is 0 for the whole time the buoy is on screen, so fog.far is
        // the tight one. Past about 220 m an object is more sky than object.
        const d = OCEAN_CONFIG.camera.z - B.z;
        const fog = (d - OCEAN_CONFIG.sky.fog.near)
            / (OCEAN_CONFIG.sky.fog.far - OCEAN_CONFIG.sky.fog.near);
        expect(fog).toBeLessThan(0.15);
    });
});
