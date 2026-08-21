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
const { lightOn, sinkAt, targetTilt, stepRoll } = await import(BUOY_URL);

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
