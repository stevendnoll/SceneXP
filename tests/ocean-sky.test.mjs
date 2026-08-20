// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/ocean/js/sky.js.
//
// THE POINT OF THESE IS THAT THE SKY AND THE SEA ARE ONE DECISION. sky.js draws
// a dome, but its real job is to be the thing the water reflects, and the seam
// between those two jobs is where the interesting failures live. A dome that
// looks right while the water reflects a stale copy of it is not a crash, it is
// a colour grading choice nobody made, and the only symptom is that the horizon
// goes back to being a hard line. So the assertions below care a great deal
// about identity and continuity: the uniform objects handed to water.js must be
// the same objects the dome uses, the day must close into a loop with no step at
// the wrap, and the sun must actually leave the sky at night.
//
// The Fresnel assertions are the other half. The whole design rests on the claim
// that reflectance runs from two percent underfoot to nearly one at the horizon,
// which is why the sea is bright at the horizon at all, and that claim deserves
// to be pinned rather than trusted.

import { jest } from '@jest/globals';

const CONFIG_URL = '../www/ocean/js/config.js';
const SKY_URL = '../www/ocean/js/sky.js';

// sky.js imports './config.min.js'. The minified build is real and current, but
// pointing the test at the source keeps a stale build from passing.
jest.unstable_mockModule('../www/ocean/js/config.min.js', async () => (
    await import(CONFIG_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);

// ---------------------------------------------------------------------------
// A THREE stub, real enough to hold colours and vectors
// ---------------------------------------------------------------------------

class StubColor {
    constructor() { this.r = 0; this.g = 0; this.b = 0; this.space = null; }
    setRGB(r, g, b, space) { this.r = r; this.g = g; this.b = b; this.space = space; return this; }
}

class StubVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
}

class StubVector2 {
    constructor() { this.x = 0; this.y = 0; }
    set(x, y) { this.x = x; this.y = y; return this; }
}

class StubDisposable {
    constructor(params = {}) { Object.assign(this, params); this.disposed = false; }
    dispose() { this.disposed = true; }
}

class StubMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.position = new StubVector3();
        this.parent = null;
    }
}

class StubLight {
    constructor() {
        this.color = new StubColor();
        this.groundColor = new StubColor();
        this.intensity = 1;
        this.position = new StubVector3();
    }
}

function installThree() {
    globalThis.THREE = {
        Color: StubColor,
        Vector2: StubVector2,
        Vector3: StubVector3,
        SphereGeometry: class extends StubDisposable {},
        ShaderMaterial: class extends StubDisposable {},
        Mesh: StubMesh,
        DirectionalLight: StubLight,
        HemisphereLight: StubLight,
        Fog: class { constructor(color, near, far) { this.color = new StubColor(); this.near = near; this.far = far; } },
        BackSide: 'back',
        SRGBColorSpace: 'srgb',
        LinearSRGBColorSpace: 'srgb-linear'
    };
}

function makeScene() {
    return {
        fog: null,
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
const sky = await import(SKY_URL);
const {
    wrapPhase, advancePhase, entryPhase, unpackColor, mixColor, bracketKeys, skyStateAt,
    sunDirectionAt, fresnelWater, srgbToLinear, linearToSrgb, toneMapACES, shownColor,
    twilightGlow, applyGloom,
    SKY_GLSL, SKY_UNIFORM_GLSL,
    initSky, updateSky, setPhase, getPhase, getSkyState, skyUniforms, disposeSky, __sky
} = sky;

const SKY = OCEAN_CONFIG.sky;
const CYCLE = OCEAN_CONFIG.cycle;

afterEach(() => { disposeSky(); });

/** A random that walks a fixed list, so a weighted draw can be aimed. */
function scriptedRandom(values) {
    let i = 0;
    return () => values[i++ % values.length];
}

// ---------------------------------------------------------------------------

describe('the day is a loop', () => {
    test('phase wraps into [0, 1) from anywhere, including backwards', () => {
        expect(wrapPhase(0.25)).toBeCloseTo(0.25, 9);
        expect(wrapPhase(1.25)).toBeCloseTo(0.25, 9);
        expect(wrapPhase(-0.25)).toBeCloseTo(0.75, 9);
        expect(wrapPhase(-3.5)).toBeCloseTo(0.5, 9);
        expect(wrapPhase(NaN)).toBe(0);
    });

    test('THE SUN THIS SCENE SHIPS WITH DOES NOT MOVE', () => {
        // The scene is an arc now, from an ordinary bright sea to a tsunami, and
        // a sun crossing the sky would be a second thing changing alongside the
        // only thing that should be. Config holds it by setting the cycle to
        // zero seconds, so an hour of frames has to leave the phase alone.
        let phase = 0.47;
        for (let i = 0; i < 3600; i++) phase = advancePhase(phase, 1, CYCLE);
        expect(phase).toBeCloseTo(0.47, 9);
    });

    test('zero seconds means held, not infinitely fast', () => {
        // The distinction this pins used to be a divide by zero guard that fell
        // back to a one second day. Under that reading, holding the sun would
        // have span it through a full cycle every second, which is the loudest
        // possible failure and would still have passed a test that only asked
        // for a finite number back.
        expect(advancePhase(0.3, 5, { seconds: 0 })).toBeCloseTo(0.3, 9);
        expect(advancePhase(0.3, 5, { seconds: -100 })).toBeCloseTo(0.3, 9);
        expect(advancePhase(0.3, 5, { seconds: NaN })).toBeCloseTo(0.3, 9);
    });

    test('a running cycle still comes back round, for whenever one returns', () => {
        // The machinery is kept rather than deleted, because the arc is a plan
        // and plans change. Exercised against a cycle of its own so it does not
        // go untested while config holds the sun.
        expect(advancePhase(0.3, 2510, { seconds: 2510 })).toBeCloseTo(0.3, 9);
        expect(advancePhase(0.3, 1255, { seconds: 2510 })).toBeCloseTo(0.8, 9);
    });

    test('the keyframe list wraps, so the last key runs into the first', () => {
        const keys = SKY.keys;
        const last = keys[keys.length - 1];
        // Just past the final keyframe is the wrap span, not a clamp.
        const bracket = bracketKeys(last.at + 0.01, keys);
        expect(bracket.from).toBe(last);
        expect(bracket.to).toBe(keys[0]);
        expect(bracket.t).toBeGreaterThan(0);
        expect(bracket.t).toBeLessThan(1);
    });

    test('before the first keyframe is the same wrap span, not a clamp', () => {
        // The first key sits at 0, so this only bites if a key is ever moved off
        // it. Asserting it now means the day cannot develop a seam at midnight
        // the day somebody does.
        const keys = [{ at: 0.2 }, { at: 0.6 }];
        const bracket = bracketKeys(0.05, keys);
        expect(bracket.from).toBe(keys[1]);
        expect(bracket.to).toBe(keys[0]);
        expect(bracket.t).toBeCloseTo((1 - 0.6 + 0.05) / (1 - 0.6 + 0.2), 9);
    });

    test('there is no step in the light anywhere in the cycle, the wrap included',
        () => {
            // THIS IS THE TEST THAT WOULD CATCH A DUPLICATED KEYFRAME AT 1.0, or
            // a wrap that clamped. Walk the whole day in small steps and insist
            // no single step moves any channel more than a keyframe gap could.
            // A discontinuity at the wrap is invisible in every screenshot
            // except the one frame it happens on.
            const step = 0.002;
            let previous = skyStateAt(0, SKY);
            let worst = 0;
            for (let p = step; p <= 1.0001; p += step) {
                const now = skyStateAt(wrapPhase(p), SKY);
                const channels = [
                    ...now.zenith, ...now.horizon, ...now.sunColor, ...now.cloudColor
                ];
                const before = [
                    ...previous.zenith, ...previous.horizon, ...previous.sunColor,
                    ...previous.cloudColor
                ];
                for (let i = 0; i < channels.length; i++) {
                    worst = Math.max(worst, Math.abs(channels[i] - before[i]));
                }
                previous = now;
            }
            // The tightest keyframe gap is 0.05 of the cycle, so a 0.002 step can
            // move a channel by at most about four percent of the distance
            // between two keys. Anything above a tenth is a jump.
            expect(worst).toBeLessThan(0.1);
        });
});

describe('the sun', () => {
    test('azimuth 0 points straight out to sea, which is -Z', () => {
        const dir = sunDirectionAt(0, 0);
        expect(dir.x).toBeCloseTo(0, 9);
        expect(dir.y).toBeCloseTo(0, 9);
        expect(dir.z).toBeCloseTo(-1, 9);
    });

    test('positive azimuth swings to +X and elevation lifts +Y', () => {
        const right = sunDirectionAt(0, 90);
        expect(right.x).toBeCloseTo(1, 9);
        const up = sunDirectionAt(90, 0);
        expect(up.y).toBeCloseTo(1, 9);
    });

    test('the direction is always a unit vector', () => {
        for (let p = 0; p < 1; p += 0.017) {
            const state = skyStateAt(p, SKY);
            const d = sunDirectionAt(state.elevation, state.azimuth);
            expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
        }
    });

    test('it is below the horizon at night and above it through the day', () => {
        expect(skyStateAt(0.0, SKY).elevation).toBeLessThan(0);
        expect(skyStateAt(0.46, SKY).elevation).toBeGreaterThan(30);
        expect(skyStateAt(0.97, SKY).elevation).toBeLessThan(0);
    });

    test('it stays inside the frame at both golden hours', () => {
        // The composition IS the glint path, and the path sits under the sun. The
        // horizontal field of view is about 61 degrees at camera.fov 40 on a wide
        // screen, so a sun past 30 degrees off centre puts its path against the
        // edge of the picture. Derived from the lens rather than hard coded, so
        // narrowing it again cannot quietly push the sun out of shot.
        const half = Math.atan(2.58 * Math.tan((OCEAN_CONFIG.camera.fov * Math.PI / 180) / 2))
            * 180 / Math.PI;
        for (const key of SKY.keys) {
            if (key.elevation < 0 || key.elevation > 20) continue;
            expect(Math.abs(key.azimuth)).toBeLessThan(half - 5);
        }
    });
});

describe('Fresnel is the whole argument for the reflection', () => {
    test('straight down into the water reflects almost nothing', () => {
        expect(fresnelWater(1)).toBeCloseTo(0.020, 4);
    });

    test('at the horizon it reflects everything', () => {
        expect(fresnelWater(0)).toBeCloseTo(1, 6);
    });

    test('the band under the horizon is above 0.85, which is the measured claim',
        () => {
            // The band eight to thirty two pixels under the horizon in a 40 degree
            // frame is 0.4 to 1.6 degrees below the eye. Those are the numbers in
            // the config note, and they are the reason the sea has to be bright
            // there. Computed from the lens so the claim tracks the camera.
            const pixelsPerDegree = 830 / OCEAN_CONFIG.camera.fov;
            for (const pixels of [8, 32]) {
                const belowDegrees = pixels / pixelsPerDegree;
                const cosTheta = Math.sin(belowDegrees * Math.PI / 180);
                expect(fresnelWater(cosTheta)).toBeGreaterThan(0.85);
            }
        });

    test('it rises monotonically toward grazing', () => {
        let previous = fresnelWater(1);
        for (let c = 1; c >= 0; c -= 0.02) {
            const now = fresnelWater(c);
            expect(now).toBeGreaterThanOrEqual(previous - 1e-12);
            previous = now;
        }
    });
});

describe('the halo goes out with the sun', () => {
    test('full while the sun is up, gone by the end of nautical twilight', () => {
        expect(twilightGlow(30)).toBe(1);
        expect(twilightGlow(0)).toBe(1);
        expect(twilightGlow(-12)).toBe(0);
        expect(twilightGlow(-40)).toBe(0);
    });

    test('dusk keeps its afterglow', () => {
        // Civil twilight is where the warm band on the horizon lives, and losing
        // it would make dusk a straight fade to black rather than a sunset.
        expect(twilightGlow(-5)).toBeGreaterThan(0.5);
        expect(twilightGlow(-5)).toBeLessThan(0.9);
    });

    test('night is blue, not brown', () => {
        // THE BUG THIS PINS: the disc is gated on the view ray being above the
        // horizon, so a set sun is simply not drawn, but the halo is a smooth
        // falloff over tens of degrees and was not gated on anything. At the
        // night keyframe it came out twenty times the sky's own brightness, in
        // the warm colour left over from dawn, and midnight rendered a flat
        // brown. Asserted on the numbers rather than on the gate, so a different
        // fix that also works still passes.
        const night = skyStateAt(0, SKY);
        const sunLinear = night.sunColor.map(srgbToLinear);
        const skyLinear = night.horizon.map(srgbToLinear);
        const halo = twilightGlow(night.elevation);
        // Worst case: looking straight at where the sun is, hardest term.
        const added = sunLinear[0] * SKY.sun.glowStrength * halo;
        expect(added).toBeLessThan(skyLinear[2]);
        // And the night sky is genuinely blue, so the halo is what would have
        // turned it. Blue channel above red is the whole test.
        expect(skyLinear[2]).toBeGreaterThan(skyLinear[0] * 2);
    });

    test('the strengths in the uniforms carry the gate, not just the maths', () => {
        initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.46 });
        const day = skyUniforms().uSunGlowStrength.value;
        expect(day).toBeCloseTo(SKY.sun.glowStrength, 9);
        setPhase(0.0);
        expect(skyUniforms().uSunGlowStrength.value).toBe(0);
        expect(skyUniforms().uSunAureoleStrength.value).toBe(0);
    });
});

describe('the CPU copy of the filmic curve matches the renderer', () => {
    test('sRGB to linear is the real transfer function, not a gamma of 2.2', () => {
        expect(srgbToLinear(0)).toBeCloseTo(0, 9);
        expect(srgbToLinear(1)).toBeCloseTo(1, 9);
        // The linear toe below 0.04045 is the part a plain power law gets wrong.
        expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 9);
        expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 4);
    });

    test('it reproduces the two horizons the config note quotes', () => {
        // THIS TEST IS THE PIN BETWEEN TWO FILES. `toneMapACES` is a hand copy of
        // a curve that actually lives in the renderer, and it is only true while
        // main.js asks for ACESFilmic tone mapping. These two numbers are the
        // ones quoted in the note beside it, so if either drifts, the comment and
        // the code fail together and loudly rather than quietly and separately.
        const toBytes = (hex, exposure) => toneMapACES(unpackColor(hex).map(srgbToLinear), exposure)
            .map((c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));

        expect(toBytes(0xafcadd, 1.0)).toEqual([191, 205, 214]);   // the day horizon
        expect(toBytes(0xe4703f, 1.0)).toEqual([229, 129, 69]);    // the sunset one
    });

    test('it is monotonic and stays inside the display range', () => {
        let previous = -1;
        for (let v = 0; v <= 4; v += 0.05) {
            const out = toneMapACES([v, v, v], 1);
            expect(out[0]).toBeGreaterThanOrEqual(previous - 1e-9);
            expect(out[0]).toBeLessThanOrEqual(1);
            previous = out[0];
        }
        // Blacks stay black, which a curve with a lifted toe would not do.
        expect(toneMapACES([0, 0, 0], 1)[0]).toBeCloseTo(0, 6);
    });

    test('exposure moves it, which is how night stops being a black rectangle',
        () => {
            const dim = toneMapACES([0.02, 0.03, 0.05], 1.0);
            const lifted = toneMapACES([0.02, 0.03, 0.05], 1.45);
            expect(lifted[2]).toBeGreaterThan(dim[2]);
        });
});

describe('colours interpolate without going muddy', () => {
    test('unpack splits a packed colour into 0..1 channels', () => {
        expect(unpackColor(0xff8040)).toEqual([1, 128 / 255, 64 / 255]);
    });

    test('the ends of a mix are the colours themselves', () => {
        expect(mixColor(0x102030, 0x405060, 0)).toEqual(unpackColor(0x102030));
        expect(mixColor(0x102030, 0x405060, 1)).toEqual(unpackColor(0x405060));
    });

    test('the midpoint of a sunset is no darker than either end', () => {
        // A deliberate choice recorded in unpackColor: the blend happens in sRGB
        // rather than in linear light. Linear is the physically defensible answer
        // and it makes the halfway point between a blue zenith and an orange
        // horizon come out dark and grey, because a straight line between two
        // points in linear space passes under both of them perceptually.
        const a = unpackColor(0x1f3f6a);
        const b = unpackColor(0xe4703f);
        const mid = mixColor(0x1f3f6a, 0xe4703f, 0.5);
        const sum = (c) => c[0] + c[1] + c[2];
        expect(sum(mid)).toBeGreaterThan(Math.min(sum(a), sum(b)));
    });
});

describe('where a visit starts', () => {
    test('every draw lands inside one of the configured windows', () => {
        for (let i = 0; i < 400; i++) {
            const p = entryPhase(Math.random, CYCLE);
            const inside = CYCLE.entry.some((w) => p >= w.from - 1e-9 && p <= w.to + 1e-9);
            expect(inside).toBe(true);
        }
    });

    test('nobody is ever dropped into the night', () => {
        // Night runs from the dusk key round to the first light key. A visitor
        // arriving there gets a black rectangle and no reason to stay, which is
        // the one first impression the scene cannot afford.
        const dusk = SKY.keys.find((k) => k.name === 'dusk').at;
        const firstLight = SKY.keys.find((k) => k.name === 'first light').at;
        for (let i = 0; i < 400; i++) {
            const p = entryPhase(Math.random, CYCLE);
            expect(p < dusk && p > firstLight - 1e-9).toBe(true);
        }
    });

    test('THE DAY STAYS BRIGHT, WHEREVER THE DRAW LANDS', () => {
        // The point of the one window config now ships. The scene turns from an
        // ordinary sea into a frightening one, and that only works if it opens
        // ordinary, so no draw may land anywhere the light is doing the work.
        // Stated as sun elevation rather than as phase, because the phase
        // numbers are an index and the elevation is the thing being asked for.
        for (let i = 0; i < 400; i++) {
            const state = skyStateAt(entryPhase(Math.random, CYCLE), SKY);
            expect(state.elevation).toBeGreaterThan(35);
        }
    });

    test('the weighting still works, tested on a cycle of its own', () => {
        // Config has one window today, so weighting it against itself would
        // assert nothing. The machinery is worth keeping tested regardless: it
        // is what a future cycle would run on, and a weighted draw that quietly
        // went uniform is the kind of failure that looks like taste.
        const cycle = { seconds: 100, entry: [
            { from: 0.0, to: 0.1, weight: 3 },
            { from: 0.5, to: 0.6, weight: 1 }
        ] };
        let heavy = 0;
        for (let i = 0; i < 4000; i++) {
            if (entryPhase(Math.random, cycle) < 0.2) heavy++;
        }
        expect(heavy / 4000).toBeGreaterThan(0.70);
        expect(heavy / 4000).toBeLessThan(0.80);
        // First draw selects the window, second places the phase inside it.
        expect(entryPhase(scriptedRandom([0.999, 0.5]), cycle)).toBeCloseTo(0.55, 6);
    });

    test('a cycle with no windows falls back to anywhere in the day', () => {
        expect(entryPhase(() => 0.42, { seconds: 100, entry: [] })).toBeCloseTo(0.42, 9);
        expect(entryPhase(() => 0.42, { seconds: 100 })).toBeCloseTo(0.42, 9);
        expect(entryPhase(() => 0.42, { seconds: 100, entry: [{ from: 0, to: 1, weight: 0 }] }))
            .toBeCloseTo(0.42, 9);
    });
});

describe('the sky and the sea share one set of uniforms', () => {
    test('skyUniforms hands back the same objects the dome is using', () => {
        const scene = makeScene();
        initSky(scene, null, OCEAN_CONFIG, { phase: 0.5 });
        const shared = skyUniforms();
        const dome = scene.children.find((c) => c.name === 'sky');
        // Identity, not equality. water.js grafts these straight into its own
        // shader, so a copy here means the sea reflects the sky it was built
        // under and never moves again.
        expect(dome.material.uniforms).toBe(shared);
        expect(shared.uSunDir.value).toBe(dome.material.uniforms.uSunDir.value);
    });

    test('moving the day writes through the objects rather than replacing them',
        () => {
            initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.10 });
            const shared = skyUniforms();
            const sunDir = shared.uSunDir.value;
            const zenith = shared.uSkyZenith.value;
            const beforeY = sunDir.y;

            setPhase(0.46);

            expect(skyUniforms()).toBe(shared);
            expect(shared.uSunDir.value).toBe(sunDir);
            expect(shared.uSkyZenith.value).toBe(zenith);
            expect(sunDir.y).toBeGreaterThan(beforeY);
        });

    test('the shader declares every uniform the program is given', () => {
        // The two halves are written in different places and there is no compiler
        // in this suite to catch a mismatch. A uniform declared and never set is
        // silently zero, which for uCloudOpacity is a cloudless sky nobody chose.
        initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.5 });
        const declared = [...SKY_UNIFORM_GLSL.matchAll(/uniform\s+\w+\s+(\w+);/g)]
            .map((m) => m[1]);
        expect(declared.length).toBeGreaterThan(0);
        expect(new Set(declared)).toEqual(new Set(Object.keys(skyUniforms())));
    });

    test('every uniform the program USES is a uniform the program DECLARES', () => {
        // A MISSPELLED UNIFORM IS NOT A COMPILE ERROR IN ANY USEFUL SENSE. It is
        // an undeclared identifier, which does fail to compile, and Three
        // swallows the log and draws nothing, so the symptom is a black sky with
        // a console message nobody is looking at. The reverse case is worse: a
        // uniform that is declared and never written reads as zero forever, and
        // for uFlash that is a storm with no lightning in it that looks entirely
        // deliberate. The existing test above pins declared-against-supplied;
        // this one pins used-against-declared, which is the other half.
        const declared = new Set([...SKY_UNIFORM_GLSL.matchAll(/uniform\s+\w+\s+(\w+);/g)]
            .map((m) => m[1]));
        const used = new Set([...SKY_GLSL.matchAll(/\bu[A-Z]\w*/g)].map((m) => m[0]));
        expect(used.size).toBeGreaterThan(10);
        for (const name of used) expect(declared).toContain(name);
    });

    test('the shared program offers water.js the contract it compiles against',
        () => {
            expect(SKY_GLSL).toContain('vec3 oceanSkyColor(vec3 rayDir, float discWeight)');
            // Self contained, because it is compiled into two different programs
            // and must not depend on what happens to sit above it in either.
            expect(SKY_GLSL).toContain('float skyHash(');
            expect(SKY_GLSL).toContain('float skyNoise(');
        });
});

describe('the scene the sky builds', () => {
    test('it adds a dome, a sun, a fill, and fog, and takes them all away again',
        () => {
            const scene = makeScene();
            initSky(scene, null, OCEAN_CONFIG, { phase: 0.5 });
            expect(scene.children.map((c) => c.name).sort())
                .toEqual(['sky', 'skyFill', 'sun']);
            expect(scene.fog).not.toBeNull();

            disposeSky();
            expect(scene.children).toHaveLength(0);
            expect(scene.fog).toBeNull();
            expect(skyUniforms()).toBeNull();
        });

    test('the dome is centred on the eye rather than on the world origin', () => {
        // The camera sits 1.15 metres up and never moves. A dome at the origin
        // puts its equator that far below the eye, which at this radius is a
        // degree and a half of error on the one line in the frame the eye rests
        // on all the time.
        const scene = makeScene();
        const camera = { position: { x: 0, y: OCEAN_CONFIG.camera.height, z: OCEAN_CONFIG.camera.z } };
        initSky(scene, camera, OCEAN_CONFIG, { phase: 0.5 });
        const dome = scene.children.find((c) => c.name === 'sky');
        expect(dome.position.y).toBeCloseTo(OCEAN_CONFIG.camera.height, 9);
        expect(dome.position.z).toBeCloseTo(OCEAN_CONFIG.camera.z, 9);
    });

    test('the fog is the horizon as the screen shows it, not as the sky is', () => {
        // THE OBVIOUS VERSION OF THIS TEST IS WRONG and asserting it would have
        // pinned the bug in place. Three applies fog last, after tone mapping
        // and after the colour space encode, so `fogColor` is a value on the
        // screen rather than a colour in the scene. Set it to the sky's own
        // horizon and the far water fades toward something the sky above it
        // never renders as, which is the seam re-opened one chunk further down.
        const scene = makeScene();
        initSky(scene, null, OCEAN_CONFIG, { phase: 0.90 });
        const state = skyStateAt(0.90, SKY);
        const shown = toneMapACES(state.horizon.map(srgbToLinear), state.exposure);

        expect(scene.fog.color.r).toBeCloseTo(shown[0], 9);
        expect(scene.fog.color.g).toBeCloseTo(shown[1], 9);
        expect(scene.fog.color.b).toBeCloseTo(shown[2], 9);
        // Stored in the working space, so Three's encode on upload is the only
        // one applied. Tag it with sRGB and the fog is encoded twice.
        expect(scene.fog.color.space).toBe('srgb-linear');

        // And it is genuinely a different colour, which is the whole point.
        const raw = state.horizon.map(srgbToLinear);
        const gap = Math.max(...shown.map((c, i) => Math.abs(c - raw[i]) * 255));
        expect(gap).toBeGreaterThan(10);
    });

    test('the sun light points at the sun and goes dark at night', () => {
        const scene = makeScene();
        initSky(scene, null, OCEAN_CONFIG, { phase: 0.20 });
        const sun = scene.children.find((c) => c.name === 'sun');
        const golden = skyStateAt(0.20, SKY);
        const dir = sunDirectionAt(golden.elevation, golden.azimuth);
        expect(sun.position.y / 300).toBeCloseTo(dir.y, 6);
        expect(sun.intensity).toBeGreaterThan(1);

        setPhase(0.0);
        expect(sun.intensity).toBe(0);
        // And the fill has to carry the scene on its own, or night is black.
        const fill = scene.children.find((c) => c.name === 'skyFill');
        expect(fill.intensity).toBeGreaterThan(0);
    });

    test('exposure reaches the renderer, which is what stops night being black',
        () => {
            const renderer = { toneMappingExposure: 1 };
            initSky(makeScene(), null, OCEAN_CONFIG, { renderer, phase: 0.46 });
            const midday = renderer.toneMappingExposure;
            setPhase(0.0);
            expect(renderer.toneMappingExposure).toBeGreaterThan(midday);
        });

    test('the entry point is drawn per visit unless one is handed in', () => {
        initSky(makeScene(), null, OCEAN_CONFIG, { random: () => 0.0 });
        const first = getPhase();
        disposeSky();
        initSky(makeScene(), null, OCEAN_CONFIG, { random: () => 0.9999 });
        expect(getPhase()).not.toBeCloseTo(first, 3);
    });

    test('updateSky holds the day config ships, and survives a nonsense delta', () => {
        initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.5 });
        // Twenty minutes of frames, which is longer than anyone will watch.
        updateSky(1200);
        expect(getPhase()).toBeCloseTo(0.5, 6);
        updateSky(undefined);
        expect(getPhase()).toBeCloseTo(0.5, 6);
    });

    test('and advances it again the moment a cycle is handed one', () => {
        // The hold is a config decision, not a capability that was removed, and
        // the difference matters because the arc is a plan rather than a law.
        const running = { ...OCEAN_CONFIG, cycle: { seconds: 1000, entry: CYCLE.entry } };
        initSky(makeScene(), null, running, { phase: 0.5 });
        updateSky(250);
        expect(getPhase()).toBeCloseTo(0.75, 6);
    });

    test('nothing throws before init and nothing throws after dispose', () => {
        disposeSky();
        expect(() => updateSky(1)).not.toThrow();
        expect(setPhase(0.3)).toBe(getPhase());
        expect(skyUniforms()).toBeNull();
    });

    test('getSkyState reports the light the rest of the scene should be using',
        () => {
            initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.90 });
            expect(getSkyState().name).toBe('sunset');
        });
});

// ---------------------------------------------------------------------------
// The storm sky
// ---------------------------------------------------------------------------

describe('a colour reaches the screen through four stages, not three', () => {
    // THIS BLOCK IS THE ONE THAT WOULD HAVE CAUGHT THE STORM PALETTE TWICE.
    // Both times the palette was "solved backwards through the pipeline" and
    // both times the solve stopped a stage short, so the numbers written in the
    // comment beside each colour were not the numbers the sky rendered.

    test('the encode is the stage that keeps going missing', () => {
        // Without the final encode a mid grey looks about forty seven levels
        // darker than it is, which is the size of the error that shipped.
        const linear = toneMapACES(unpackColor(0x828b95).map(srgbToLinear), 1.0);
        const withoutEncode = linear.map((c) => Math.round(c * 255));
        const withEncode = shownColor(0x828b95, 1.0);
        expect(withoutEncode).toEqual([72, 82, 94]);
        expect(withEncode).toEqual([144, 154, 164]);
        expect(withEncode[0] - withoutEncode[0]).toBeGreaterThan(40);
    });

    test('srgbToLinear and linearToSrgb are actually inverses', () => {
        // Six places rather than nine, and only because the two standard
        // breakpoints, 0.04045 and 0.0031308, are rounded decimals that do not
        // land on each other exactly. The gap is three parts in a hundred
        // million, which is a thousandth of the last byte of a colour.
        for (const v of [0, 0.002, 0.04045, 0.2, 0.5, 0.9, 1]) {
            expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
        }
    });

    test('the storm palette renders the greys its comment claims it does', () => {
        // Pinned to the values in `sky.storm`, at the storm's own exposure.
        // If somebody retunes the palette these numbers move with it, and the
        // point is that they have to be RE-MEASURED rather than assumed.
        const e = SKY.storm.exposure;
        expect(shownColor(SKY.storm.cloudColor, e)).toEqual([144, 154, 164]);
        expect(shownColor(SKY.storm.horizon, e)).toEqual([136, 146, 157]);
        expect(shownColor(SKY.storm.zenith, e)).toEqual([117, 120, 136]);
    });

    test('the storm sky is genuinely darker than the clear sky it replaces', () => {
        // THE FAULT THIS EXISTS TO PREVENT. Measured off the QA screenshots, the
        // old storm sky came out at (191,196,201) against a clear sky of
        // (182,194,208): through the entire storm it got very slightly BRIGHTER.
        // Any future palette has to clear this bar to count as weather.
        const midday = skyStateAt(0.46, SKY);
        const clear = toneMapACES(midday.horizon.map(srgbToLinear), midday.exposure);
        const storm = toneMapACES(unpackColor(SKY.storm.horizon).map(srgbToLinear),
            SKY.storm.exposure);
        const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
        expect(lum(storm)).toBeLessThan(lum(clear) * 0.75);
    });
});

describe('the storm base is what puts the contrast back', () => {
    test('a clear sky has no base in it at all, so it costs nothing', () => {
        // The shader gives up on the first compare when this is zero, which is
        // what keeps the whole opening of the arc free of a layer it does not
        // use. See skyShelf.
        expect(skyStateAt(0.46, SKY).shelfOpacity).toBe(0);
        expect(applyGloom(skyStateAt(0.46, SKY), 0, SKY).shelfOpacity).toBe(0);
    });

    test('the gloom brings it into being rather than darkening it', () => {
        const at = (g) => applyGloom(skyStateAt(0.46, SKY), g, SKY).shelfOpacity;
        expect(at(0.5)).toBeCloseTo(SKY.storm.shelfOpacity * 0.5, 9);
        expect(at(1)).toBeCloseTo(SKY.storm.shelfOpacity, 9);
        expect(at(1)).toBeGreaterThan(0.8);
    });

    test('the bright strip along the horizon narrows as the storm closes in', () => {
        // The gap between the base and the sea is the whole look, and squeezing
        // it is the storm arriving. Both edges have to come DOWN, monotonically.
        const edge = (g) => applyGloom(skyStateAt(0.46, SKY), g, SKY).shelfFadeFrom;
        const wide = edge(0);
        const closing = edge(0.5);
        const shut = edge(1);
        expect(wide).toBeGreaterThan(closing);
        expect(closing).toBeGreaterThan(shut);
        // And it never shuts completely: a base that reached the horizon would
        // put the sea back under a featureless lid, which is what was wrong.
        expect(shut).toBeGreaterThan(0.02);
    });

    test('the base always stops higher than the sheet above it does', () => {
        // The cirrus sheet has to reach the horizon under a storm, for the
        // reason in `storm.cloudFadeTo`. If the base ever reached as low there
        // would be no strip left to see.
        const state = applyGloom(skyStateAt(0.46, SKY), 1, SKY);
        expect(state.shelfFadeFrom).toBeGreaterThan(state.cloudFadeTo);
    });

    test('thickness ramps about the noise mean, not about the coverage edge', () => {
        // THE BUG THIS PINS made the storm come and go. Modelled with the
        // threshold deciding presence, the base opened into clear sky whenever
        // the drift carried a low patch across the frame, and the contrast
        // measured anywhere from 43 to 93 over one pass of the drift. Centring
        // the shading on the noise's own mean instead holds it at 92.
        expect(SKY_GLSL).toContain('smoothstep(0.5 - uShelfDepth, 0.5 + uShelfDepth, n)');
        // And coverage stays low enough that the layer is near solid.
        expect(SKY.shelf.coverage).toBeLessThan(0.25);
    });

    test('the projection is clamped against a constant, not against a moving edge', () => {
        // uShelfFadeFrom walks down as the gloom rises. Clamping the divisor to
        // it would rescale the cloud underneath itself as the storm built, so
        // the pattern would breathe in place instead of drifting.
        expect(SKY_GLSL).toContain('uShelfScale / max(dir.y, 0.02)');
        expect(SKY_GLSL).not.toContain('uShelfScale / max(dir.y, uShelfFadeFrom)');
    });

    test('the base hides the sun harder than the thin sheet does', () => {
        expect(SKY_GLSL).toContain('(1.0 - cloud * 0.85) * (1.0 - base * 0.98)');
    });
});

describe('the drift is integrated, because the speed changes', () => {
    test('the storm speeds the sky up', () => {
        const clear = skyStateAt(0.46, SKY).driftSpeed;
        const storm = applyGloom(skyStateAt(0.46, SKY), 1, SKY).driftSpeed;
        expect(clear).toBeCloseTo(SKY.cloud.driftSpeed, 9);
        expect(storm).toBeCloseTo(SKY.cloud.driftSpeed * SKY.storm.driftSpeedScale, 9);
        expect(storm / clear).toBeGreaterThan(3);
    });

    test('a rising speed never shunts the clouds forward', () => {
        // THE WHOLE REASON THIS IS ACCUMULATED. Written the obvious way, as
        // elapsed * speed, raising the speed reprices the entire history at the
        // new rate: after 60 seconds of calm drift, turning the storm on would
        // move the cloud by fifty times one frame's worth in a single frame.
        // Assert against that number directly rather than against a shape.
        initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.46 });
        let previous = 0;
        let biggest = 0;
        for (let i = 0; i < 600; i++) {
            // A minute of calm, then the gloom comes on over thirty seconds.
            const gloom = i < 360 ? 0 : Math.min(1, (i - 360) / 180);
            updateSky(1 / 6, gloom, 0);
            const now = __sky.state().drifted;
            biggest = Math.max(biggest, now - previous);
            expect(now).toBeGreaterThanOrEqual(previous);
            previous = now;
        }
        // No frame ever moves the sky by more than one frame of the fastest the
        // sky ever goes. The naive version's worst frame is a hundred times this.
        const fastestFrame = SKY.cloud.driftSpeed * SKY.storm.driftSpeedScale / 6;
        expect(biggest).toBeLessThanOrEqual(fastestFrame * 1.0001);
    });

    test('the two sheets drift together, and the low one drifts faster', () => {
        initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.46 });
        updateSky(10, 1, 0);
        const u = skyUniforms();
        expect(u.uCloudDrift.value.y).toBeGreaterThan(0);
        expect(u.uShelfDrift.value.y)
            .toBeCloseTo(u.uCloudDrift.value.y * SKY.shelf.driftRatio, 9);
        expect(SKY.shelf.driftRatio).toBeGreaterThan(1);
    });

    test('jumping the hour for a screenshot does not jump the clouds', () => {
        // setPhase reruns applyState, which reads the accumulator rather than
        // recomputing from a clock. A screenshot pass walking the day should not
        // teleport the sky sideways every time it lands.
        initSky(makeScene(), null, OCEAN_CONFIG, { phase: 0.46 });
        updateSky(10, 1, 0);
        const before = skyUniforms().uCloudDrift.value.y;
        setPhase(0.20);
        expect(skyUniforms().uCloudDrift.value.y).toBeCloseTo(before, 9);
    });
});
