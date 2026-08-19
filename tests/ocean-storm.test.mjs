// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/ocean/js/storm.js.
//
// THE ARC IS A STORY AND A STORY CAN BE WRONG IN WAYS ARITHMETIC CANNOT. A curve
// that never reaches its peak, a stage nobody ever enters, a drawback that does
// not actually go backwards, a fade that finishes after the scene does: each of
// those leaves every function in this file returning a perfectly reasonable
// number and the experience broken. So most of what follows walks the whole
// three minutes and asserts things about the SHAPE rather than about values at
// convenient instants.
//
// The two assertions worth reading first are the fold margin one, which is the
// only hard physical limit in the scene, and the one about the sheet being long
// enough for the surge, which is the bug this arc would otherwise have shipped.

import { jest } from '@jest/globals';

const CONFIG_URL = '../www/ocean/js/config.js';
const STORM_URL = '../www/ocean/js/storm.js';
const WATER_URL = '../www/ocean/js/water.js';

jest.unstable_mockModule('../www/ocean/js/config.min.js', async () => (
    await import(CONFIG_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);
const {
    arcProgress, stageAt, stageProgress, curveAt, swellAt, leanAt, surgeAt,
    engulfAt, surfaceAtCamera, fadeAt, stormStateAt
} = await import(STORM_URL);
const { bedHeightAt, tideOffset } = await import(WATER_URL);

const STORM = OCEAN_CONFIG.storm;
const { beach, camera } = OCEAN_CONFIG;

/** Every second of the arc, plus a little past the end. */
const everySecond = () => {
    const out = [];
    for (let t = 0; t <= STORM.seconds + 10; t++) out.push(t);
    return out;
};

describe('the clock', () => {
    test('progress runs 0 to 1 across the arc and clamps outside it', () => {
        expect(arcProgress(0)).toBe(0);
        expect(arcProgress(STORM.seconds / 2)).toBeCloseTo(0.5, 9);
        expect(arcProgress(STORM.seconds)).toBe(1);
        expect(arcProgress(-50)).toBe(0);
        expect(arcProgress(9999)).toBe(1);
    });

    test('EVERY STAGE IS ACTUALLY REACHED', () => {
        // A stage listed in config and never entered is a scene that silently
        // skips a beat, and nothing else would report it: `stageAt` would keep
        // returning perfectly valid neighbours. This is the assertion that
        // catches a `from` typed past the end of the arc, or two in the wrong
        // order, both of which look completely reasonable in the table.
        const seen = new Set(everySecond().map((t) => stageAt(t).name));
        for (const stage of STORM.stages) expect(seen).toContain(stage.name);
    });

    test('the stages are in order and start at zero', () => {
        expect(STORM.stages[0].from).toBe(0);
        for (let i = 1; i < STORM.stages.length; i++) {
            expect(STORM.stages[i].from).toBeGreaterThan(STORM.stages[i - 1].from);
        }
        expect(STORM.stages[STORM.stages.length - 1].from).toBeLessThan(STORM.seconds);
    });

    test('stage progress runs 0 to 1 inside each stage without jumping', () => {
        let previous = stageAt(0).name;
        let last = 0;
        for (const t of everySecond()) {
            const now = stageAt(t).name;
            const p = stageProgress(t);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
            // Inside one stage it only ever climbs. Across a boundary it resets,
            // which is the one place a fall is allowed.
            if (now === previous) expect(p).toBeGreaterThanOrEqual(last - 1e-9);
            previous = now;
            last = p;
        }
    });
});

describe('the curves', () => {
    test('a curve holds its end values outside its own keys', () => {
        const keys = [{ at: 10, value: 2 }, { at: 20, value: 5 }];
        expect(curveAt(0, keys)).toBe(2);
        expect(curveAt(10, keys)).toBe(2);
        expect(curveAt(20, keys)).toBe(5);
        expect(curveAt(9999, keys)).toBe(5);
        expect(curveAt(15, keys)).toBeCloseTo(3.5, 9);
    });

    test('it is smoothstepped, not linear, so the slope has no corner', () => {
        // A linear ramp is continuous in value and has a corner in its slope,
        // and on something that takes a minute the corner is the only part
        // anybody notices. Smoothstep is flat at both ends, so the quarter
        // points sit inside the straight line rather than on it.
        const keys = [{ at: 0, value: 0 }, { at: 10, value: 1 }];
        expect(curveAt(2.5, keys)).toBeLessThan(0.25);
        expect(curveAt(7.5, keys)).toBeGreaterThan(0.75);
        expect(curveAt(5, keys)).toBeCloseTo(0.5, 9);
    });

    test('an empty or single key curve does not throw', () => {
        expect(curveAt(5, [])).toBe(0);
        expect(curveAt(5, null)).toBe(0);
        expect(curveAt(5, [{ at: 0, value: 7 }])).toBe(7);
    });
});

describe('the shape of the arc', () => {
    test('THE SEA STARTS ORDINARY AND ENDS ENORMOUS', () => {
        // The premise of the whole scene. If the opening is not the calm sea the
        // rest of config was tuned against, the turn has nothing to turn from.
        expect(swellAt(0)).toBeCloseTo(1, 6);
        expect(swellAt(STORM.seconds)).toBeGreaterThan(2.2);
        // And it is bigger at the end of every stage than at the start of it,
        // up to the drawback, which is the one place the sea is allowed to ease.
        expect(swellAt(90)).toBeGreaterThan(swellAt(35));
        expect(swellAt(130)).toBeGreaterThan(swellAt(90));
    });

    test('the swell never exceeds what the mesh can carry', () => {
        // 2.6 is where the fold margin was measured, and past about 2.7 at these
        // leans the Gerstner displacement turns the surface inside out. This is
        // a config guard rather than a physics simulation: the real check is the
        // Jacobian sweep in the scratchpad, and this is what stops somebody
        // typing 6 into the table between sweeps.
        for (const t of everySecond()) expect(swellAt(t)).toBeLessThanOrEqual(2.7);
    });

    test('the cusping comes DOWN as the swell goes up', () => {
        // They trade against each other through the fold limit, so a table where
        // both climbed would be one that had forgotten the constraint.
        expect(leanAt(0)).toBeGreaterThan(leanAt(90));
        expect(leanAt(90)).toBeGreaterThan(leanAt(130));
        expect(leanAt(130)).toBeGreaterThan(leanAt(STORM.seconds));
        for (const t of everySecond()) expect(leanAt(t)).toBeGreaterThan(0);
    });

    test('THE DRAWBACK ACTUALLY GOES BACKWARDS', () => {
        // The single most effective twenty seconds in the arc, and the one most
        // easily lost to a sign or a smoothing window. The sea has to sit BELOW
        // its own mean for long enough to be read as wrong, not dip through it.
        const below = everySecond().filter((t) => surgeAt(t) < -0.5);
        expect(below.length).toBeGreaterThan(10);
        expect(Math.min(...everySecond().map((t) => surgeAt(t)))).toBeLessThan(-0.8);
        // And it happens BEFORE the tsunami, or it is just a low tide.
        const lowest = below[Math.floor(below.length / 2)];
        expect(lowest).toBeLessThan(STORM.seconds);
        expect(surgeAt(STORM.seconds)).toBeGreaterThan(1);
    });

    test('the drawback uncovers beach that was under water', () => {
        // What the visitor actually sees. The waterline is the shore position
        // for a given water level, so a negative surge walks it seaward, and
        // the sand it leaves is the point of the beat.
        const waterline = (surge) => beach.shoreZ + surge / beach.slope;
        const restZ = waterline(0);
        const lowZ = waterline(Math.min(...everySecond().map((t) => surgeAt(t))));
        expect(lowZ).toBeLessThan(restZ);
        // Several metres of it, or nobody notices.
        expect(restZ - lowZ).toBeGreaterThan(3);
    });
});

describe('the water coming over the camera', () => {
    test('dry sand is not engulfed and a metre over the eye is', () => {
        expect(engulfAt(0)).toBe(0);
        expect(engulfAt(camera.height - STORM.engulfWashMetres)).toBe(0);
        expect(engulfAt(camera.height)).toBeCloseTo(0.5, 6);
        expect(engulfAt(camera.height + STORM.engulfWashMetres)).toBe(1);
    });

    test('THE SURFACE UNDER THE CAMERA STARTS AT THE SAND, NOT AT ZERO', () => {
        // The beach climbs shoreward, so the bed under the camera is above mean
        // sea level and a surge has to clear it before there is any water here
        // at all. Reading the surface as the surge alone would have said the
        // camera was ankle deep from the first frame.
        const bed = bedHeightAt(camera.z, beach);
        expect(bed).toBeGreaterThan(0);
        expect(surfaceAtCamera(0)).toBeCloseTo(bed, 9);
        expect(surfaceAtCamera(-0.9)).toBeCloseTo(bed, 9);
        expect(surfaceAtCamera(1.55)).toBeCloseTo(1.55, 9);
    });

    test('the tsunami covers the eye and nothing before it does', () => {
        const engulfed = everySecond().filter((t) => stormStateAt(t).engulf > 0.5);
        expect(engulfed.length).toBeGreaterThan(3);
        // All of it is in the last stage. This is the assertion that would have
        // caught the version of the surge table where the storm peak was set
        // high enough to leave the camera permanently under water.
        const tsunami = STORM.stages[STORM.stages.length - 1].from;
        for (const t of engulfed) expect(t).toBeGreaterThanOrEqual(tsunami);
    });

    test('THE SHEET IS LONG ENOUGH FOR THE SEA THE ARC ASKS FOR', () => {
        // THE BUG THIS ARC WOULD OTHERWISE HAVE SHIPPED. The waterline for a
        // water level sits at shoreZ + level / slope, so a rising sea walks it
        // shoreward fast on a steep beach: four and a half metres of shore for
        // every metre of surge here. `beach.nearZ` was 10.5, which runs out at a
        // surge of 0.99, and the tsunami peaks at 1.55. The sea would have
        // climbed off the end of the beach three seconds before it reached the
        // camera, and the failure would have looked like a rendering fault.
        const tideHigh = OCEAN_CONFIG.water.tideRange / 2;
        const peak = Math.max(...everySecond().map((t) => surgeAt(t))) + tideHigh;
        const waterline = beach.shoreZ + peak / beach.slope;
        expect(waterline).toBeLessThan(beach.nearZ);
    });
});

describe('the ending', () => {
    test('the fade starts inside the arc and is complete exactly at the end', () => {
        expect(fadeAt(0)).toBe(0);
        expect(fadeAt(STORM.seconds - STORM.fadeSeconds)).toBe(0);
        expect(fadeAt(STORM.seconds)).toBe(1);
        expect(fadeAt(STORM.seconds + 100)).toBe(1);
        // Long enough to read as an ending rather than as a page dying.
        expect(STORM.fadeSeconds).toBeGreaterThanOrEqual(4);
    });

    test('THE FADE IS OVER THE TSUNAMI, NOT OVER AN EMPTY BEACH', () => {
        // A fade that began before the last beat would black the screen out
        // while the thing everybody waited three minutes for was still arriving.
        const fadeStart = STORM.seconds - STORM.fadeSeconds;
        expect(stageAt(fadeStart).name).toBe('tsunami');
        expect(stormStateAt(fadeStart).engulf).toBeGreaterThan(0.5);
    });

    test('finished only becomes true at the very end', () => {
        expect(stormStateAt(STORM.seconds - 1).finished).toBe(false);
        expect(stormStateAt(STORM.seconds).finished).toBe(true);
        expect(stormStateAt(STORM.seconds + 60).finished).toBe(true);
    });
});

describe('the whole state, once per frame', () => {
    test('it never returns anything a shader could choke on', () => {
        for (const t of everySecond()) {
            const s = stormStateAt(t);
            for (const key of ['progress', 'swell', 'lean', 'surge', 'engulf', 'fade']) {
                expect(Number.isFinite(s[key])).toBe(true);
            }
            expect(s.swell).toBeGreaterThan(0);
            expect(s.engulf).toBeGreaterThanOrEqual(0);
            expect(s.engulf).toBeLessThanOrEqual(1);
            expect(s.fade).toBeGreaterThanOrEqual(0);
            expect(s.fade).toBeLessThanOrEqual(1);
        }
    });

    test('a live surface overrides the estimate, because it carries the tide', () => {
        // The tide is a quarter of a metre either way against a wash that ramps
        // over 0.35, so the two answers genuinely differ and the live one wins.
        const dry = stormStateAt(120, OCEAN_CONFIG, 0.2);
        const drowned = stormStateAt(120, OCEAN_CONFIG, camera.height + 1);
        expect(dry.engulf).toBe(0);
        expect(drowned.engulf).toBe(1);
        // Everything else is untouched by it.
        expect(drowned.swell).toBeCloseTo(dry.swell, 9);
        expect(drowned.surge).toBeCloseTo(dry.surge, 9);
    });

    test('nothing in the arc depends on the tide phase to stay sane', () => {
        // The tide runs on its own clock underneath the arc, so a visitor
        // arriving at high water gets a different sea from one arriving at low.
        // Neither may push the waterline off the end of the sheet.
        for (const t of everySecond()) {
            const level = surgeAt(t) + tideOffset(t, OCEAN_CONFIG.water);
            expect(beach.shoreZ + level / beach.slope).toBeLessThan(beach.nearZ);
        }
    });
});
