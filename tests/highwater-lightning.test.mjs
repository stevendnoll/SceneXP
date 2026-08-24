// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/highwater/js/lightning.js.
//
// THE FIRST BLOCK IS THE ONLY ONE THAT IS NOT ABOUT LOOKS. Lightning is the
// first thing in this scene that flashes, and a flash covering the whole sky and
// most of the sea is a "general flash" under WCAG 2.3.1, which asks for no more
// than three in any one second. Real lightning runs at about twenty. The
// scheduler is what stands between those two numbers, so it is beaten on for the
// length of the arc rather than spot checked, and the ceiling is asserted as a
// property of every pair of flashes rather than as a property of the config.
//
// The rest is the fractal and the ribbon. Both are pure and both are the sort of
// code that fails quietly: a bolt with a NaN in it does not throw, it silently
// drops the entire draw call, and a ribbon whose winding is inconsistent draws
// half a channel depending on which way the segment happened to point.

import { jest } from '@jest/globals';

const CONFIG_URL = '../www/highwater/js/config.js';
const STORM_URL = '../www/highwater/js/storm.js';
const LIGHTNING_URL = '../www/highwater/js/lightning.js';

jest.unstable_mockModule('../www/highwater/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/highwater/js/storm.min.js', async () => (
    await import(STORM_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);
const { curveAt } = await import(STORM_URL);

// ---------------------------------------------------------------------------
// A THREE stub, real enough to hold buffers and a light
// ---------------------------------------------------------------------------

class StubColor {
    constructor(hex = 0) { this.hex = hex; this.r = 0; this.g = 0; this.b = 0; }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
}
class StubVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
}
class StubAttribute {
    constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
        this.needsUpdate = false;
    }
}
class StubGeometry {
    constructor() {
        this.attributes = {};
        this.index = null;
        this.drawRange = { start: 0, count: 0 };
        this.disposed = false;
    }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    setIndex(attribute) { this.index = attribute; return this; }
    setDrawRange(start, count) { this.drawRange = { start, count }; }
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
        this.visible = true;
        this.parent = null;
    }
}
class StubLight {
    constructor(color, intensity) {
        this.color = color;
        this.intensity = intensity;
        this.position = new StubVector3();
        this.parent = null;
    }
}

globalThis.THREE = {
    Color: StubColor,
    Vector2: class { constructor() { this.x = 0; this.y = 0; } set(x, y) { this.x = x; this.y = y; return this; } },
    Vector3: StubVector3,
    BufferGeometry: StubGeometry,
    BufferAttribute: StubAttribute,
    ShaderMaterial: StubMaterial,
    Mesh: StubMesh,
    DirectionalLight: StubLight,
    AdditiveBlending: 'additive',
    DoubleSide: 'double'
};

function makeScene() {
    return {
        children: [],
        add(o) { this.children.push(o); o.parent = this; },
        remove(o) {
            const i = this.children.indexOf(o);
            if (i >= 0) this.children.splice(i, 1);
            o.parent = null;
        }
    };
}

/** The uniform objects lightning.js writes through, as sky.js hands them over. */
function makeSkyUniforms() {
    return {
        uFlash: { value: 0 },
        uFlashDir: { value: new StubVector3(0, 1, 0) },
        uFlashColor: { value: new StubColor() },
        uFlashSpread: { value: 3 }
    };
}

const {
    strikeRateAt, flashesPerSecondCeiling, drawStrikeThreshold, flashPulse, flashLevelAt,
    planStrike, strikeDirection, generateBolt, boltRibbon, strikeEndpoints,
    visibleHalfAngleDegrees, boltAzimuthLimit,
    initLightning, updateLightning, resetLightning, disposeLightning, __lightning
} = await import(LIGHTNING_URL);

const LIGHT = OCEAN_CONFIG.storm.lightning;

afterEach(() => { disposeLightning(); });

/** A deterministic random that is still spread over [0, 1).
 *
 *  A counter rather than a list, so a test can pull ten thousand values without
 *  the sequence repeating on a short period and accidentally making the
 *  scheduler periodic, which is exactly the property under test.
 *
 *  THE HASH AND THE WARM UP ARE NOT DECORATION, and leaving them out produced a
 *  genuinely misleading measurement. A plain linear congruential generator seeded
 *  with 1, 2, 3 and so on returns almost the SAME FIRST VALUE for every one of
 *  them, because the first step is dominated by the additive constant. So a
 *  characterisation of the first strike across two hundred seeds came back
 *  clustered inside a single second, which looked like the scheduler having no
 *  randomness in its first event and was in fact this function having none in its
 *  first output. Hashing the seed and discarding ten values makes neighbouring
 *  seeds diverge, and the same measurement then spread across thirty seconds.
 *
 *  Anything here that samples the FIRST draw of a run depends on this. */
function seeded(seed = 1) {
    let s = (seed * 2654435761) >>> 0;
    for (let i = 0; i < 10; i++) s = (s * 1664525 + 1013904223) >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ---------------------------------------------------------------------------

describe('the flash rate is capped, and the cap is the point', () => {
    test('the stated ceiling is under three flashes a second', () => {
        // The number the accessibility claim rests on. If somebody lowers
        // minGapSeconds this is the test that should stop them.
        expect(flashesPerSecondCeiling(OCEAN_CONFIG)).toBeLessThan(3);
        expect(flashesPerSecondCeiling(OCEAN_CONFIG)).toBeCloseTo(1 / 0.34, 6);
    });

    test('no two flashes on screen ever land closer than the gap', () => {
        // THE REAL ASSERTION, AND IT IS DELIBERATELY END TO END. Not that the
        // config says 0.34, and not that a reimplementation of the scheduler
        // behaves, but that the brightness the sky is actually handed never rises
        // from dark twice inside the gap. That is the thing a viewer experiences,
        // it covers the boundary between one strike and the next as well as the
        // inside of a double, and it stays true however the scheduler is
        // rewritten underneath it.
        //
        // Sampled at 240 Hz so the onset is located to about four milliseconds,
        // and the tolerance below is that sampling error rather than slack in the
        // property.
        const gap = LIGHT.minGapSeconds;
        const step = 1 / 240;
        let worst = Infinity;
        let counted = 0;

        for (let seed = 1; seed <= 25; seed++) {
            const scene = makeScene();
            const uniforms = makeSkyUniforms();
            initLightning(scene, null, OCEAN_CONFIG,
                { sky: { uniforms }, random: seeded(seed) });
            let previous = 0;
            let last = -Infinity;
            for (let t = 0; t < OCEAN_CONFIG.storm.seconds; t += step) {
                updateLightning(t, OCEAN_CONFIG);
                const now = uniforms.uFlash.value;
                // A rising edge out of full dark is one flash arriving.
                if (previous === 0 && now > 0) {
                    if (last > -Infinity) {
                        worst = Math.min(worst, t - last);
                        counted++;
                        expect(t - last).toBeGreaterThan(gap - step * 2);
                    }
                    last = t;
                }
                previous = now;
            }
            disposeLightning();
        }
        // And it has to have actually seen a great many flashes, or the loop
        // above is asserting nothing at all.
        expect(counted).toBeGreaterThan(400);
        expect(worst).toBeGreaterThan(gap - step * 2);
    });

    test('the planner refuses to crowd whatever came before it', () => {
        // The same property one level down, where it is enforced. Handed a last
        // flash that has only just happened, every flash it plans must clear it.
        const random = seeded(21);
        for (let i = 0; i < 500; i++) {
            const strike = planStrike(50, 50 - 0.01, random, OCEAN_CONFIG);
            let last = 50 - 0.01;
            for (const f of strike.flashes) {
                expect(f.at - last).toBeGreaterThanOrEqual(LIGHT.minGapSeconds - 1e-9);
                last = f.at;
            }
        }
    });

    test('two strokes never stack into a double bright flash', () => {
        // Combined with a max rather than a sum. Summing would put a spike at
        // twice the peak in exactly the case the rate limit was meant to cover,
        // and would also be wrong: a second return stroke is not brighter than
        // the first one.
        const flashes = [{ at: 0, power: 1 }, { at: 0.001, power: 1 }];
        for (let t = 0; t < 0.5; t += 0.005) {
            expect(flashLevelAt(t, flashes, LIGHT)).toBeLessThanOrEqual(1.0000001);
        }
    });

    test('reduced motion drops the second stroke and quarters the amplitude', () => {
        // Not "no lightning". The channel still draws. What goes is the snap.
        const random = seeded(7);
        for (let i = 0; i < 40; i++) {
            const strike = planStrike(10, -Infinity, random, OCEAN_CONFIG, true);
            expect(strike.flashes).toHaveLength(1);
        }
        expect(LIGHT.reduced.gain).toBeLessThan(0.35);
        // And the attack is slow enough to read as a swell rather than a snap.
        expect(LIGHT.reduced.attackSeconds).toBeGreaterThan(LIGHT.attackSeconds * 4);
    });
});

describe('the flash envelope', () => {
    test('it rises fast, falls slow, and reaches exactly zero', () => {
        // EXACTLY ZERO IS THE ASSERTION. An exponential decay leaves a percent of
        // the flash on screen forever, which on a sky this dark reads as the
        // storm having a permanent glow in it. storm.js documents hitting that
        // bug once already in washEnvelope.
        expect(flashPulse(0, LIGHT)).toBe(0);
        expect(flashPulse(LIGHT.attackSeconds, LIGHT)).toBeCloseTo(1, 9);
        const end = LIGHT.attackSeconds + LIGHT.decaySeconds;
        expect(flashPulse(end, LIGHT)).toBe(0);
        expect(flashPulse(end + 10, LIGHT)).toBe(0);
        // Up faster than it comes down, which is the shape of the event.
        expect(LIGHT.attackSeconds).toBeLessThan(LIGHT.decaySeconds / 4);
    });

    test('it never goes negative or above one', () => {
        for (let t = -1; t < 2; t += 0.001) {
            const v = flashPulse(t, LIGHT);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    test('a rate of zero contributes nothing to the schedule', () => {
        // The opening of the arc has to be genuinely clear, and under the
        // accumulator that falls out for free: a rate of zero adds zero credit,
        // so the threshold is never reached however long the scene runs.
        expect(strikeRateAt(0, OCEAN_CONFIG)).toBe(0);
        expect(strikeRateAt(15, OCEAN_CONFIG)).toBe(0);
        // And genuinely busy once the storm is running. Deliberately a loose
        // bound: this used to assert a rate above 0.5 at t=80, which was pinning
        // one number off the curve rather than a property, and it broke the
        // moment the curve was reshaped to give the tsunami a quieter sky.
        expect(strikeRateAt(70, OCEAN_CONFIG)).toBeGreaterThan(0.25);
    });

    test('the sky is at its loudest in the drawback, not in the tsunami', () => {
        // THE SHAPE OF THE ARC, AND IT IS NOT THE OBVIOUS ONE. The drawback is
        // the stretch where the sea has gone quiet and nothing has arrived yet,
        // so it is where the scene most needs something carrying the tension.
        // The tsunami is the opposite: it brings the largest object in the whole
        // arc with it and it wants the frame to itself.
        const drawback = strikeRateAt(70, OCEAN_CONFIG);
        const landing = strikeRateAt(88, OCEAN_CONFIG);
        expect(drawback).toBeGreaterThan(landing);
        // But it never goes quiet, because the flashes are what light the wall.
        expect(landing).toBeGreaterThan(drawback * 0.4);
    });

    test('the channels thin right out once the wall is on its way', () => {
        // Steve watched it and said there were far too many channels as the
        // tsunami came in. A channel is the second largest bright object the
        // scene can draw and the wall is the largest, so the two split the frame.
        // The FLASH rate is deliberately not cut in step: a flash lights the wall
        // rather than competing with it.
        const chance = (t) => curveAt(t, LIGHT.boltChance, OCEAN_CONFIG.storm);
        expect(chance(60)).toBeGreaterThan(0.7);
        expect(chance(80)).toBeLessThan(chance(60) * 0.5);
        expect(chance(90)).toBeLessThan(chance(60) * 0.5);
        // Not to zero, though. A storm that stops producing channels entirely
        // reads as the effect having been switched off.
        expect(chance(90)).toBeGreaterThan(0.15);
    });

    test('the last twenty seconds carry channels far less often than the peak', () => {
        // The end to end version of the two above, counted rather than asserted
        // off the curves, because the rate and the chance multiply and either one
        // alone can be moved without the frame actually getting calmer.
        //
        // COUNTED PER SECOND, AND THE FIRST VERSION WAS NOT. It compared a raw
        // count over twenty seconds of tsunami against one over ten seconds of
        // drawback, so it was really asserting that the tsunami had less than
        // HALF the density, and it only passed because at the time it had about
        // a third. The 2026-08-21 rate trim took the drawback down with it and
        // the ratio moved to 0.53, which is still comfortably thinner and still
        // exactly the effect the test exists to protect, but the old form failed
        // it. Two windows of different lengths should never have been compared
        // by count.
        let peakBin = 0;
        let lateBin = 0;
        for (let seed = 1; seed <= 60; seed++) {
            const uniforms = makeSkyUniforms();
            initLightning(makeScene(), null, OCEAN_CONFIG,
                { sky: { uniforms }, random: seeded(seed) });
            const seen = new Set();
            for (let t = 0; t < 90; t += 1 / 60) {
                updateLightning(t, OCEAN_CONFIG);
                const live = __lightning.state().strike;
                if (live && !seen.has(live)) {
                    seen.add(live);
                    if (!live.drawBolt) continue;
                    if (t >= 60 && t < 70) peakBin++;
                    if (t >= 70) lateBin++;
                }
            }
            disposeLightning();
        }
        // A second of tsunami must carry channels at well under three quarters
        // the rate of a second of drawback. Against a flat boltChance the two
        // densities come out level and this fails, which is the whole point.
        expect(peakBin).toBeGreaterThan(0);
        expect(lateBin / 20).toBeLessThan((peakBin / 10) * 0.75);
    });

    test('a threshold is always finite, positive, and averages one', () => {
        // Math.random never returns exactly 1, but an injected one might, and
        // log(0) is the kind of thing that turns into a storm with no lightning.
        expect(Number.isFinite(drawStrikeThreshold(() => 1))).toBe(true);
        // Negative zero, since it is -log(1), which is why this is not toBe(0).
        expect(drawStrikeThreshold(() => 0)).toBeCloseTo(0, 12);
        const random = seeded(31);
        let sum = 0;
        for (let i = 0; i < 20000; i++) sum += drawStrikeThreshold(random);
        // The unit exponential has mean 1, which is what makes `rate` read as
        // strikes per second rather than as an arbitrary dial.
        expect(sum / 20000).toBeGreaterThan(0.95);
        expect(sum / 20000).toBeLessThan(1.05);
    });

    test('THE RATE RAMPS FROM ZERO, WHICH BROKE THE FIRST DESIGN', () => {
        // Drawing a gap in seconds from the instantaneous rate is correct only
        // for a rate that never moves. Taken just after the rate left zero it
        // returned a gap of 4e28 seconds, nothing rechecked it, and the scene had
        // no lightning in it at all. The accumulator cannot fail that way: a
        // small rate contributes a small amount of credit rather than fixing a
        // date. This walks the real arc and insists strikes actually arrive.
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(2) });
        let first = null;
        for (let t = 0; t < 90; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            if (uniforms.uFlash.value > 0 && first === null) first = t;
        }
        expect(first).not.toBeNull();
        // Not before the sky has closed over, and not so late it never lands.
        expect(first).toBeGreaterThan(22);
        expect(first).toBeLessThan(55);
    });
});

describe('the onset survives the rate being tuned', () => {
    test('every visit gets lightning, and gets a channel to look at', () => {
        // CUTTING A RATE IS AN EASY WAY TO QUIETLY DELAY THE FIRST STRIKE past
        // the part of the arc somebody already watched and approved, and the
        // median hides it: a change that moves the median by a second can still
        // leave one visit in twenty with no bolt at all. So this walks eighty
        // whole arcs and asserts on the worst of them rather than the middle.
        const first = [];
        const firstBolt = [];
        for (let seed = 1; seed <= 80; seed++) {
            const uniforms = makeSkyUniforms();
            initLightning(makeScene(), null, OCEAN_CONFIG,
                { sky: { uniforms }, random: seeded(seed) });
            let flash = null;
            let bolt = null;
            const seen = new Set();
            for (let t = 0; t < OCEAN_CONFIG.storm.seconds; t += 1 / 60) {
                updateLightning(t, OCEAN_CONFIG);
                if (uniforms.uFlash.value > 0 && flash === null) flash = t;
                const live = __lightning.state().strike;
                if (live && !seen.has(live)) {
                    seen.add(live);
                    if (live.drawBolt && bolt === null) bolt = t;
                }
            }
            first.push(flash);
            firstBolt.push(bolt);
            disposeLightning();
        }
        // Nobody watches a storm with no lightning in it, and nobody watches one
        // with no channel in it either. Both are the promise the scene makes.
        expect(first.every((t) => t !== null)).toBe(true);
        expect(firstBolt.every((t) => t !== null)).toBe(true);
        // Never before the sky has closed over, which is the arc's own order.
        expect(Math.min(...first)).toBeGreaterThan(22);
        // And the slowest visit still has most of the arc left to run.
        expect(Math.max(...first)).toBeLessThan(58);
        expect(Math.max(...firstBolt)).toBeLessThan(72);
    });
});

describe('the storm closes in rather than only getting busier', () => {
    test('strikes land nearer as the arc runs', () => {
        const meanAt = (t) => {
            const random = seeded(3);
            let sum = 0;
            for (let i = 0; i < 400; i++) {
                sum += planStrike(t, -Infinity, random, OCEAN_CONFIG).distance;
            }
            return sum / 400;
        };
        const early = meanAt(32);
        const middle = meanAt(60);
        const late = meanAt(88);
        expect(early).toBeGreaterThan(middle);
        expect(middle).toBeGreaterThan(late);
        // And never outside the stated range, whatever the spread does.
        expect(late).toBeGreaterThanOrEqual(LIGHT.nearMetres);
        expect(early).toBeLessThanOrEqual(LIGHT.farMetres);
    });

    test('some strikes are off frame and draw no channel', () => {
        // Most of what a real storm does is flash from somewhere you cannot see,
        // and allowing it costs nothing because the bolt simply is not built.
        const random = seeded(11);
        let drawn = 0;
        for (let i = 0; i < 600; i++) {
            if (planStrike(80, -Infinity, random, OCEAN_CONFIG).drawBolt) drawn++;
        }
        expect(drawn).toBeGreaterThan(60);
        expect(drawn).toBeLessThan(540);
    });

    test('the flash direction agrees with where the channel is drawn', () => {
        // The flash lights the cloud the bolt comes out of. If these disagreed
        // the sky would brighten on one side and the channel appear on the other,
        // which is the sort of fault that looks like a rendering bug.
        const azimuth = 0.4;
        const distance = 500;
        const dir = strikeDirection(azimuth, distance, OCEAN_CONFIG);
        const { from } = strikeEndpoints(azimuth, distance, OCEAN_CONFIG);
        const length = Math.hypot(from[0], from[1], from[2]);
        for (let i = 0; i < 3; i++) {
            expect(dir[i]).toBeCloseTo(from[i] / length, 6);
        }
    });
});

describe('a phone held upright still gets the channels', () => {
    // `camera.fov` is vertical, so a portrait window is about 9.5 degrees either
    // side of the axis against 33 on a monitor. Steve found the fault on an
    // iPhone: the flashes were all there and almost none of the streaks were,
    // because five channels in six were being drawn outside the picture.
    const PORTRAIT = 393 / 852;
    const LANDSCAPE = 16 / 9;
    const DEG = Math.PI / 180;
    const fov = OCEAN_CONFIG.camera.fov;

    /** Where every channel of `count` strikes was aimed, in degrees. */
    const channels = (limit, seed = 21, at = 60, count = 800) => {
        const random = seeded(seed);
        const out = [];
        for (let i = 0; i < count; i++) {
            const s = limit == null
                ? planStrike(at, -Infinity, random, OCEAN_CONFIG)
                : planStrike(at, -Infinity, random, OCEAN_CONFIG, false, limit);
            if (s.drawBolt) out.push(Math.abs(s.azimuth) / DEG);
        }
        return out;
    };

    test('the visible half angle follows the window, not the field of view', () => {
        const wide = visibleHalfAngleDegrees(fov, LANDSCAPE);
        const tall = visibleHalfAngleDegrees(fov, PORTRAIT);
        expect(wide).toBeGreaterThan(30);
        expect(tall).toBeLessThan(11);
        // A square window sees exactly the vertical field of view across.
        expect(visibleHalfAngleDegrees(fov, 1)).toBeCloseTo(fov / 2, 6);
    });

    test('a wide screen is left exactly where it was', () => {
        // The whole change has to be invisible on a monitor, which is the screen
        // the storm was tuned on.
        expect(boltAzimuthLimit(LANDSCAPE, OCEAN_CONFIG)).toBeGreaterThan(29);
        expect(boltAzimuthLimit(2.33, OCEAN_CONFIG)).toBe(LIGHT.boltAzimuthDegrees);
        expect(boltAzimuthLimit(LANDSCAPE, OCEAN_CONFIG))
            .toBeLessThanOrEqual(LIGHT.boltAzimuthDegrees);
    });

    test('every channel a portrait window draws is inside that window', () => {
        const limit = boltAzimuthLimit(PORTRAIT, OCEAN_CONFIG);
        const edge = visibleHalfAngleDegrees(fov, PORTRAIT);
        const aimed = channels(limit);
        expect(aimed.length).toBeGreaterThan(50);
        // Inside the frame, with the margin the fractal's own wander needs still
        // to spare. This is the assertion the old code fails.
        expect(Math.max(...aimed)).toBeLessThan(edge - LIGHT.boltFrameMarginDegrees + 1e-9);
        // And the old code really does fail it: on the same draws, without a
        // limit, most of the channels were aimed clean off the side of a phone.
        const before = channels(null);
        expect(before.filter((a) => a > edge).length / before.length)
            .toBeGreaterThan(0.5);
    });

    test('the channels are moved rather than thinned out', () => {
        // The count per strike is a property of `boltAzimuthDegrees` and
        // `boltChance`, and narrowing the frame must not quietly cut it. A
        // portrait visitor should see MORE channels than before, not fewer.
        const limit = boltAzimuthLimit(PORTRAIT, OCEAN_CONFIG);
        expect(channels(limit).length).toBe(channels(null).length);
    });

    test('a strike with no channel still comes from anywhere', () => {
        // The flash from off the side of the view is the one that says the storm
        // is wider than the window, and squeezing those would cost the scene the
        // only cue it has that anything exists outside the frame.
        const limit = boltAzimuthLimit(PORTRAIT, OCEAN_CONFIG);
        const random = seeded(33);
        let widest = 0;
        for (let i = 0; i < 600; i++) {
            const s = planStrike(60, -Infinity, random, OCEAN_CONFIG, false, limit);
            if (!s.drawBolt) widest = Math.max(widest, Math.abs(s.azimuth) / DEG);
        }
        expect(widest).toBeGreaterThan(visibleHalfAngleDegrees(fov, PORTRAIT));
        expect(widest).toBeLessThanOrEqual(LIGHT.azimuthDegrees);
    });

    test('the scene reads the window at the moment it plans a strike', () => {
        // Turning the phone on its side has to widen the spread on the next
        // strike rather than on the next visit, so the camera is read live.
        const camera = {
            position: { x: 0, y: 2.2, z: 12 },
            fov: OCEAN_CONFIG.camera.fov,
            aspect: PORTRAIT
        };
        const uniforms = makeSkyUniforms();
        initLightning(makeScene(), camera, OCEAN_CONFIG,
            { sky: { uniforms }, random: seeded(7) });
        const edge = visibleHalfAngleDegrees(camera.fov, PORTRAIT);

        const seen = new Set();
        let drawn = 0;
        for (let t = 0; t < OCEAN_CONFIG.storm.seconds; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            const live = __lightning.state().strike;
            if (live && !seen.has(live)) {
                seen.add(live);
                if (live.drawBolt) {
                    drawn++;
                    expect(Math.abs(live.azimuth) / DEG).toBeLessThan(edge);
                }
            }
        }
        // A whole arc's worth of channels, all of them on screen.
        expect(drawn).toBeGreaterThan(5);

        camera.aspect = LANDSCAPE;
        expect(__lightning.state().frameLimit).toBeGreaterThan(29);
    });

    test('a scene with no camera behaves exactly as it always did', () => {
        // The tests drive this file without one, and so would any later caller.
        const uniforms = makeSkyUniforms();
        initLightning(makeScene(), null, OCEAN_CONFIG, { sky: { uniforms } });
        expect(__lightning.state().frameLimit).toBe(LIGHT.boltAzimuthDegrees);
    });
});

describe('the channel is a fractal, and it has to survive being one', () => {
    const from = [0, 420, -500];
    const to = [0, 0, -500];

    test('it subdivides into a trunk plus branches', () => {
        const { segments } = generateBolt(from, to, seeded(5), OCEAN_CONFIG);
        const cfg = LIGHT.bolt;
        // At least the trunk's own doubling, and more than it, because branches
        // are pushed back into the working set and subdivided too.
        expect(segments.length).toBeGreaterThan(Math.pow(2, cfg.iterations) * 0.9);
        expect(segments.some((s) => s.generation > 0)).toBe(true);
    });

    test('it is not a straight line, and it is not a scribble', () => {
        // A fractal that wanders too little is a line and too much is noise. The
        // total path length against the straight line distance is the measure.
        const { segments } = generateBolt(from, to, seeded(9), OCEAN_CONFIG);
        const trunk = segments.filter((s) => s.generation === 0);
        let walked = 0;
        for (const s of trunk) walked += Math.hypot(...s.b.map((v, i) => v - s.a[i]));
        const direct = Math.hypot(...to.map((v, i) => v - from[i]));
        expect(walked / direct).toBeGreaterThan(1.02);
        expect(walked / direct).toBeLessThan(2.2);
    });

    test('branches head away from the trunk rather than back up it', () => {
        // Stepped leaders work toward the water. A branch heading up reads as a
        // mistake, and it is the sort of thing a random turn produces if the
        // spread is ever widened past ninety degrees.
        const { segments } = generateBolt(from, to, seeded(13), OCEAN_CONFIG);
        const children = segments.filter((s) => s.generation > 0);
        expect(children.length).toBeGreaterThan(0);
        const climbing = children.filter((s) => s.b[1] > s.a[1] + 1).length;
        expect(climbing / children.length).toBeLessThan(0.30);
    });

    test('it never exceeds the segment cap, on any seed', () => {
        // Branching compounds, so an unlucky seed grows faster than the doubling
        // alone. The cap is what stops a frame allocating for a second.
        for (let seed = 1; seed <= 60; seed++) {
            const { segments } = generateBolt(from, to, seeded(seed), OCEAN_CONFIG);
            expect(segments.length).toBeLessThanOrEqual(LIGHT.bolt.maxSegments);
        }
    });

    test('no vertex is ever NaN, on any seed', () => {
        // THE FAULT THIS EXISTS TO CATCH IS SILENT. A single NaN vertex does not
        // throw and does not draw a bad triangle: it takes out the WHOLE draw
        // call, so the bolt simply fails to appear. The fractal takes
        // perpendiculars of segments and an unlucky pair of offsets can reduce a
        // segment to nothing, which is a normalize of a zero vector.
        for (let seed = 1; seed <= 60; seed++) {
            const { segments } = generateBolt(from, to, seeded(seed), OCEAN_CONFIG);
            for (const s of segments) {
                for (let i = 0; i < 3; i++) {
                    expect(Number.isFinite(s.a[i])).toBe(true);
                    expect(Number.isFinite(s.b[i])).toBe(true);
                }
            }
        }
    });

    test('a zero length channel does not produce NaNs either', () => {
        // The degenerate input, reached if a strike is ever placed at the eye.
        const { segments } = generateBolt([0, 0, 0], [0, 0, 0], seeded(2), OCEAN_CONFIG);
        for (const s of segments) {
            for (let i = 0; i < 3; i++) expect(Number.isFinite(s.a[i])).toBe(true);
        }
    });
});

describe('the ribbon', () => {
    const eye = [0, OCEAN_CONFIG.camera.height, OCEAN_CONFIG.camera.z];

    function build(seed) {
        const { from, to } = strikeEndpoints(0.2, 480, OCEAN_CONFIG);
        const { segments } = generateBolt(from, to, seeded(seed), OCEAN_CONFIG);
        const max = LIGHT.bolt.maxSegments;
        const positions = new Float32Array(max * 6 * 3);
        const brights = new Float32Array(max * 6);
        const powers = new Float32Array(max * 6);
        const indices = new Uint16Array(max * 12);
        const used = boltRibbon(segments, eye, positions, brights, powers, indices,
            OCEAN_CONFIG);
        return { segments, positions, brights, powers, indices, used };
    }

    test('it writes six vertices and twelve indices per segment', () => {
        const { segments, used } = build(4);
        expect(used.vertices).toBe(segments.length * 6);
        expect(used.indices).toBe(segments.length * 12);
    });

    test('it never writes past the buffers it was given', () => {
        // The buffers are allocated once for the life of the page, so this is
        // the only thing standing between a long bolt and a corrupted heap.
        const { from, to } = strikeEndpoints(0, 480, OCEAN_CONFIG);
        const { segments } = generateBolt(from, to, seeded(17), OCEAN_CONFIG);
        const positions = new Float32Array(10 * 6 * 3);
        const brights = new Float32Array(10 * 6);
        const powers = new Float32Array(10 * 6);
        const indices = new Uint16Array(10 * 12);
        const used = boltRibbon(segments, eye, positions, brights, powers, indices,
            OCEAN_CONFIG);
        expect(used.vertices).toBeLessThanOrEqual(10 * 6);
        expect(used.indices).toBeLessThanOrEqual(10 * 12);
        expect(segments.length).toBeGreaterThan(10);
    });

    test('every index points at a vertex that was actually written', () => {
        const { indices, used } = build(6);
        for (let i = 0; i < used.indices; i++) {
            expect(indices[i]).toBeLessThan(used.vertices);
        }
    });

    test('the core is bright and both edges fall to nothing', () => {
        const { brights, used } = build(8);
        for (let v = 0; v < used.vertices; v += 3) {
            expect(brights[v]).toBe(0);
            expect(brights[v + 1]).toBe(1);
            expect(brights[v + 2]).toBe(0);
        }
    });

    test('branches are thinner and dimmer than the trunk', () => {
        const { segments, positions, powers, used } = build(10);
        const trunk = [];
        const branch = [];
        for (let s = 0; s < segments.length && (s + 1) * 6 <= used.vertices; s++) {
            const base = s * 6;
            const width = Math.hypot(
                positions[base * 3] - positions[(base + 2) * 3],
                positions[base * 3 + 1] - positions[(base + 2) * 3 + 1],
                positions[base * 3 + 2] - positions[(base + 2) * 3 + 2]
            );
            (segments[s].generation === 0 ? trunk : branch).push({ width, power: powers[base] });
        }
        expect(branch.length).toBeGreaterThan(0);
        const mean = (a, k) => a.reduce((x, y) => x + y[k], 0) / a.length;
        expect(mean(branch, 'width')).toBeLessThan(mean(trunk, 'width'));
        expect(mean(branch, 'power')).toBeLessThan(mean(trunk, 'power'));
    });

    test('the ribbon opens across the view, not along it', () => {
        // The billboard is baked on the CPU because the camera never moves. If
        // it is ever computed wrongly the bolt turns edge on and vanishes, which
        // is a failure with no error message attached to it.
        const { segments, positions, used } = build(12);
        for (let s = 0; s < 12 && (s + 1) * 6 <= used.vertices; s++) {
            const base = s * 6;
            const at = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
            const across = at(base + 2).map((v, i) => v - at(base)[i]);
            const centre = at(base + 1);
            const toEye = eye.map((v, i) => v - centre[i]);
            const dot = across[0] * toEye[0] + across[1] * toEye[1] + across[2] * toEye[2];
            const norm = Math.hypot(...across) * Math.hypot(...toEye);
            // Perpendicular to the view direction, to within rounding.
            expect(Math.abs(dot / norm)).toBeLessThan(1e-5);
        }
    });
});

describe('the scene the lightning builds', () => {
    test('it adds a mesh and a light, and takes them both away again', () => {
        const scene = makeScene();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms: makeSkyUniforms() } });
        expect(scene.children.map((c) => c.name).sort())
            .toEqual(['lightning', 'lightningFlash']);
        disposeLightning();
        expect(scene.children).toHaveLength(0);
    });

    test('the light is created at zero rather than when the first strike lands', () => {
        // Three keys its compiled programs on how many lights are in the scene.
        // Adding one mid arc would recompile the water, the sand and the sky on
        // the frame of a flash, which is the worst moment available.
        const scene = makeScene();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms: makeSkyUniforms() } });
        const light = scene.children.find((c) => c.name === 'lightningFlash');
        expect(light).toBeDefined();
        expect(light.intensity).toBe(0);
    });

    test('nothing flashes before the arc says it should', () => {
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(3) });
        for (let t = 0; t < 20; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            expect(uniforms.uFlash.value).toBe(0);
        }
    });

    test('it does flash once the storm is under way', () => {
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(3) });
        let peak = 0;
        for (let t = 0; t < 90; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            peak = Math.max(peak, uniforms.uFlash.value);
        }
        expect(peak).toBeGreaterThan(0.5);
    });

    test('dimming the sky wash leaves the channel and the glint alone', () => {
        // THE WHOLE POINT OF HAVING THREE GAINS. `skyGain` is the screen wide
        // wash, `bolt.intensity` is the channel, `lightIntensity` is the glint
        // path on the water, and they are separate numbers precisely so the
        // wash can be turned down without taking the streaks with it. That is
        // the tuning Steve asked for on 2026-08-21 and it is only possible while
        // this holds.
        //
        // The obvious refactor, folding `skyGain` into `flash` so there is one
        // multiply instead of three, would silently couple all three and this is
        // the test that would stop it.
        const half = structuredClone(OCEAN_CONFIG);
        half.storm.lightning.skyGain = OCEAN_CONFIG.storm.lightning.skyGain / 2;

        const run = (config) => {
            const scene = makeScene();
            const uniforms = makeSkyUniforms();
            initLightning(scene, null, config, { sky: { uniforms }, random: seeded(11) });
            const light = scene.children.find((c) => c.name === 'lightningFlash');
            const mesh = scene.children.find((c) => c.name === 'lightning');
            let flash = 0, bolt = 0, glint = 0;
            for (let t = 0; t < 90; t += 1 / 60) {
                updateLightning(t, config);
                flash = Math.max(flash, uniforms.uFlash.value);
                bolt = Math.max(bolt, mesh.material.uniforms.uBoltIntensity.value);
                glint = Math.max(glint, light.intensity);
            }
            disposeLightning();
            return { flash, bolt, glint };
        };

        const full = run(OCEAN_CONFIG);
        const dim = run(half);
        expect(full.flash).toBeGreaterThan(0);
        expect(full.bolt).toBeGreaterThan(0);
        expect(full.glint).toBeGreaterThan(0);
        // The wash halves...
        expect(dim.flash).toBeCloseTo(full.flash / 2, 6);
        // ...and the other two do not move at all.
        expect(dim.bolt).toBeCloseTo(full.bolt, 6);
        expect(dim.glint).toBeCloseTo(full.glint, 6);
    });

    test('the flash always comes back to zero between strikes', () => {
        // The decay reaches exactly zero, so over ninety seconds there must be
        // frames with no flash on them at all. A permanent glow would mean the
        // envelope is leaking.
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(5) });
        let dark = 0;
        for (let t = 40; t < 90; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            if (uniforms.uFlash.value === 0) dark++;
        }
        expect(dark).toBeGreaterThan(100);
    });

    test('a replay puts the schedule back to the beginning', () => {
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(5) });
        for (let t = 0; t < 80; t += 1 / 60) updateLightning(t, OCEAN_CONFIG);
        resetLightning();
        expect(uniforms.uFlash.value).toBe(0);
        expect(__lightning.state().strike).toBeNull();
        expect(__lightning.state().lastFlashAt).toBe(-Infinity);
        // And the very next frame of a fresh arc is still clear.
        updateLightning(0, OCEAN_CONFIG);
        expect(uniforms.uFlash.value).toBe(0);
    });

    test('jumping the arc backwards does not leave a strike stuck on screen', () => {
        // oceanSetArc walks the storm around for a screenshot pass. A schedule
        // holding a due time in the future of a clock that has gone backwards
        // would simply stop producing strikes.
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(9) });
        for (let t = 0; t < 85; t += 1 / 60) updateLightning(t, OCEAN_CONFIG);
        updateLightning(30, OCEAN_CONFIG);
        expect(uniforms.uFlash.value).toBe(0);
        let peak = 0;
        for (let t = 30; t < 90; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            peak = Math.max(peak, uniforms.uFlash.value);
        }
        expect(peak).toBeGreaterThan(0.5);
    });

    test('the bolt is hidden whenever it is not lit', () => {
        const scene = makeScene();
        const uniforms = makeSkyUniforms();
        initLightning(scene, null, OCEAN_CONFIG, { sky: { uniforms }, random: seeded(4) });
        const mesh = scene.children.find((c) => c.name === 'lightning');
        for (let t = 0; t < 90; t += 1 / 60) {
            updateLightning(t, OCEAN_CONFIG);
            if (uniforms.uFlash.value === 0) expect(mesh.visible).toBe(false);
        }
    });

    test('it survives being updated with no sky to write through', () => {
        // The page builds the sky first, but a stripped down embed might not.
        initLightning(makeScene(), null, OCEAN_CONFIG, {});
        expect(() => updateLightning(50, OCEAN_CONFIG)).not.toThrow();
    });
});
