// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/ocean/js/storm.js.
//
// THE ARC IS A STORY AND A STORY CAN BE WRONG IN WAYS ARITHMETIC CANNOT. A curve
// that never reaches its peak, a stage nobody ever enters, a drawback that does
// not actually go backwards, a fade that finishes after the scene does: each of
// those leaves every function in this file returning a perfectly reasonable
// number and the experience broken. So most of what follows walks the whole arc
// and asserts things about the SHAPE rather than about values at convenient
// instants. It has been three minutes, then two, and now ninety seconds,
// which is why almost nothing below names a second: the times come out of the
// stage table, and the ones that do not are floors on how short a beat can get
// rather than descriptions of where it currently sits.
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
    engulfAt, washEnvelope, gloomAt, frontAt, frontLevelAt, surfaceAtCamera, fadeAt,
    stormStateAt
} = await import(STORM_URL);
const { bedHeightAt, tideOffset } = await import(WATER_URL);

const STORM = OCEAN_CONFIG.storm;
const { beach, camera } = OCEAN_CONFIG;

/** THE WATER LEVEL AT A GIVEN z, which is the surge PLUS whatever the tsunami
 *  front is carrying. Almost every assertion below used to read `surgeAt` on its
 *  own, and they all broke together the day the front took over the job of
 *  covering the eye from the surge. That was the tests being specific about a
 *  contributor when they meant the total. */
const levelAt = (t, z = camera.z) => surgeAt(t) + frontLevelAt(z, frontAt(t));

/** water.js's smoothstep, restated so the front's shape can be checked against
 *  a second implementation rather than against itself. */
const smoothstepCopy = (edge0, edge1, x) => {
    if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

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
        // TAKEN FROM THE STAGE TABLE RATHER THAN WRITTEN DOWN, because the arc
        // has been retimed three times and every hardcoded second in here went
        // stale each time. A test that has to be edited whenever the pacing
        // changes is a test that will eventually be edited to pass.
        const at = (name) => STORM.stages.find((s) => s.name === name).from;
        expect(swellAt(at('storm'))).toBeGreaterThan(swellAt(at('turning')));

        // AND THEN IT STOPS, WHICH IS THE BEAT THE ARC WAS MISSING. The lull
        // takes the sea below the calm it opened with, so a set is never left
        // mid flight when the water starts leaving. This assertion used to say
        // the drawback was bigger than the storm, which was true and was the
        // problem: a big wave was always dissolving on its way in.
        expect(swellAt(at('lull') + 6)).toBeLessThan(swellAt(0) * 0.5);
        expect(swellAt(at('drawback'))).toBeLessThan(swellAt(0));
    });

    test('the swell never exceeds what the mesh can carry', () => {
        // A config guard rather than a physics simulation: the real check is the
        // Jacobian sweep in the scratchpad, and this is what stops somebody
        // typing 6 into the table between sweeps.
        //
        // RE-SWEPT 2026-08-21 AND RAISED FROM 2.7 TO 3.0, because `breakRatio`
        // moved and the old bound was measured against the old cap. Whole-arc
        // minimum Jacobian at the shipped spectrum and lean curve:
        //
        //     peak 2.40   0.207        peak 3.20   0.111
        //          2.76   0.173  <-         3.40   0.096
        //          3.00   0.140             3.80   0.047
        //
        // 2.76 ships with 0.173 in hand. 3.0 is the guard, which still holds
        // 0.14, and there is no reason to go near it: the same sweep shows the
        // tallest wave in the frame moving only 161 px to 176 across that entire
        // range, because the breaker is depth limited. Height comes from
        // `water.breakRatio`, not from here.
        //
        // ANY RESWEEP MUST READ `leanAt(t)`. `water.leanGain` is only the first
        // frame; `storm.lean` overrides it every frame after. Sweeping the
        // static value describes a sea the scene never draws, and doing exactly
        // that on 2026-08-21 produced a table that was wrong in both columns.
        for (const t of everySecond()) expect(swellAt(t)).toBeLessThanOrEqual(3.0);
    });

    test('the cusping comes DOWN as the swell goes up', () => {
        // They trade against each other through the fold limit, so a table where
        // both climbed would be one that had forgotten the constraint. Stated
        // over the whole arc rather than at three chosen instants, which is both
        // stronger and immune to the pacing being changed under it.
        let previous = Infinity;
        for (const t of everySecond()) {
            const lean = leanAt(t);
            expect(lean).toBeGreaterThan(0);
            expect(lean).toBeLessThanOrEqual(previous + 1e-9);
            previous = lean;
        }
        expect(leanAt(STORM.seconds)).toBeLessThan(leanAt(0) * 0.6);
    });

    test('THE SKY CLOSES OVER, AND IT LEADS THE SEA', () => {
        // Weather arrives before the sea it makes does, because a cloud front
        // does not have to travel as a wave. That ordering is the only warning
        // the visitor gets, so it is worth pinning rather than leaving to the
        // shape of two tables that happen to be edited together.
        expect(gloomAt(0)).toBe(0);
        expect(gloomAt(STORM.seconds)).toBeCloseTo(1, 6);
        // Measured against how far each has travelled toward its own end, which
        // is the only fair comparison between a multiplier and a fraction.
        const swellSpan = swellAt(STORM.seconds) - swellAt(0);
        for (const t of everySecond()) {
            if (t === 0 || t >= STORM.seconds) continue;
            const swellProgress = (swellAt(t) - swellAt(0)) / swellSpan;
            expect(gloomAt(t)).toBeGreaterThanOrEqual(swellProgress - 1e-9);
        }
        // And it never comes back. A sun breaking through for the ending is a
        // better film and a worse beach.
        let previous = -1;
        for (const t of everySecond()) {
            expect(gloomAt(t)).toBeGreaterThanOrEqual(previous - 1e-9);
            previous = gloomAt(t);
        }
    });

    test('THE SEA FALLS CALM BEFORE IT LEAVES', () => {
        // STEVE'S NOTE, AND THE BEST ONE OF THE ROUND. The drawback used to
        // begin straight off the storm's peak, so a set was always mid flight
        // when the water started going, and the visitor watched a large wave
        // approach and then dissolve. It read as the scene losing its place.
        //
        // The order is the whole assertion: FLAT first, then GONE. A real
        // drawback is preceded by exactly this, and six seconds of a stopped
        // ocean after ninety of building storm is the loudest thing in the arc.
        const lull = STORM.stages.find((s) => s.name === 'lull').from;
        const drawback = STORM.stages.find((s) => s.name === 'drawback').from;
        expect(drawback).toBeGreaterThan(lull + 5);
        // Flat by the time the water starts leaving...
        expect(swellAt(drawback)).toBeLessThan(0.5);
        // ...and the water level still ordinary while it is, or a lull on a
        // raised sea would read as more weather rather than as an absence.
        expect(Math.abs(levelAt(drawback))).toBeLessThan(0.2);
        // The sea is only actually gone afterwards.
        expect(Math.min(...everySecond().map((t) => surgeAt(t)))).toBeLessThan(-0.8);
        const goneAt = everySecond().find((t) => surgeAt(t) < -0.5);
        expect(goneAt).toBeGreaterThan(drawback);
    });

    test('THE DRAWBACK ACTUALLY GOES BACKWARDS', () => {
        // The single most effective twenty seconds in the arc, and the one most
        // easily lost to a sign or a smoothing window. The sea has to sit BELOW
        // its own mean for long enough to be read as wrong, not dip through it.
        // MEASURED OVER THE WHOLE WRONG-SEA WINDOW, not just the deep part. The
        // lull now carries half of this beat: the ocean stops for eleven seconds
        // before it starts leaving, so the stretch where something is visibly
        // wrong runs from the lull to the front arriving rather than only while
        // the water is out. Asserting the deep part alone drove the number down
        // toward whatever the table happened to say, which is how a threshold
        // ends up being edited to pass.
        //
        // MEASURED TO WHEN THE WATER COMES BACK, not to when the front first
        // appears. The front shows up on the horizon while the sea is still out,
        // and the sea being out is the whole point of the beat, so its appearing
        // does not end anything. It ends when the water returns.
        const lull = STORM.stages.find((s) => s.name === 'lull').from;
        // AFTER IT HAS ACTUALLY GONE, which the first version of this forgot.
        // The storm's own surge plateau now overlaps the start of the lull, so
        // looking for "the water is high again" from the lull onward found the
        // water that had not left yet and reported a one second beat.
        const gone = everySecond().find((t) => t > lull && levelAt(t) < -0.5);
        const back = everySecond().find((t) => t > gone && levelAt(t) > 0.5);
        expect(back - lull).toBeGreaterThanOrEqual(14);
        const below = everySecond().filter((t) => surgeAt(t) < -0.5);
        expect(below.length).toBeGreaterThanOrEqual(8);
        expect(Math.min(...everySecond().map((t) => surgeAt(t)))).toBeLessThan(-0.8);
        // And it happens BEFORE the tsunami, or it is just a low tide.
        const lowest = below[Math.floor(below.length / 2)];
        expect(lowest).toBeLessThan(STORM.seconds);
        expect(levelAt(STORM.seconds)).toBeGreaterThan(1);
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
    test('WATER BELOW THE EYE CONTRIBUTES EXACTLY NOTHING', () => {
        // THE BUG STEVE CAUGHT ON SCREEN: the frame stayed milky between waves.
        // The ramp used to run from eye - 0.35 to eye + 0.35, on the reasoning
        // that a hard edge at eye level would flicker as crests passed. What it
        // actually did was return a small non-zero value for water standing
        // anywhere near the camera, and through the whole storm the surge alone
        // sits in that band, so the white never fully cleared.
        //
        // Water below the eye is water you are standing IN. It has to be zero,
        // and zero exactly, not nearly. The flicker the old lower edge was
        // guarding against belongs to `washEnvelope`, which is the right tool.
        expect(engulfAt(0)).toBe(0);
        expect(engulfAt(camera.height - 0.5)).toBe(0);
        expect(engulfAt(camera.height - 0.01)).toBe(0);
        expect(engulfAt(camera.height)).toBe(0);
        // And over the eye it ramps to a full white-out.
        expect(engulfAt(camera.height + STORM.engulfWashMetres / 2)).toBeCloseTo(0.5, 6);
        expect(engulfAt(camera.height + STORM.engulfWashMetres)).toBe(1);
    });

    test('THE WHITE-OUT IS A FLASH AND THEN IT CLEARS', () => {
        // THREE ROUNDS OF THE SAME COMPLAINT LIVE IN THIS TEST. First it left a
        // permanent milky veil, then it went from clear to full white in one
        // frame like a camera flash, then it stayed white for three seconds and
        // lost the next wave. Steve's standard is the right one: a brief flash
        // is fine, the picture has to be back within a second or two.
        const step = 1 / 60;
        const run = (targets) => {
            let env = { wash: 0, target: 0, attacking: false };
            const out = [];
            for (const target of targets) {
                env = washEnvelope(env, target, step, STORM);
                out.push(env.wash);
            }
            return out;
        };
        // A wave arrives as a STEP and then sits there while the tide creeps up
        // underneath it, which is exactly the signal that used to latch the
        // attack forever. Four seconds of it.
        const hit = [0];
        for (let i = 0; i < 240; i++) hit.push(Math.min(1, 0.79 + i * 0.0001));
        const trace = run(hit);

        // It rises fast, but not in one frame.
        expect(trace[1]).toBeLessThan(0.25);
        expect(trace[1]).toBeGreaterThan(0);
        // It gets somewhere worth seeing.
        expect(Math.max(...trace)).toBeGreaterThan(0.7);
        // AND IT IS GONE INSIDE TWO SECONDS, with the water still over the eye.
        const clearedBy = trace.findIndex((v, i) => i > 20 && v <= 0.02);
        expect(clearedBy).toBeGreaterThan(0);
        expect(clearedBy * step).toBeLessThan(2);
        // Exactly zero, not nearly. Both edges are linear so it lands on it; an
        // exponential leaves a percent of white on screen for the rest of the
        // scene, which was the first version of this bug.
        expect(trace[trace.length - 1]).toBe(0);
    });

    test('a second wave mid clear starts the flash again', () => {
        // The release must not lock out a fresh arrival, or a set of three waves
        // would show one white-out and two nothings.
        const step = 1 / 60;
        let env = { wash: 0, target: 0, attacking: false };
        for (let i = 0; i < 30; i++) env = washEnvelope(env, 0.9, step, STORM);
        const midClear = env.wash;
        expect(midClear).toBeLessThan(0.9);
        env = washEnvelope(env, 1, step, STORM);
        expect(env.wash).toBeGreaterThan(midClear);
    });

    test('THE SHEET IS LONG ENOUGH FOR THE SEA THE ARC ASKS FOR', () => {
        // THE BUG THIS ARC WOULD OTHERWISE HAVE SHIPPED. The waterline for a
        // water level sits at shoreZ + level / slope, so a rising sea walks it
        // shoreward fast on a steep beach: four and a half metres of shore for
        // every metre of surge here. `beach.nearZ` was 10.5, which runs out at a
        // surge of 0.99, and the tsunami peaks at 1.55. The sea would have
        // climbed off the end of the beach three seconds before it reached the
        // camera, and the failure would have looked like a rendering fault.
        // FOUND BY HAND FOUR TIMES BEFORE THIS TEST COULD CATCH IT, because it
        // only ever read `surgeAt`. The surge is one of three things that push
        // the water up the beach: the tide, the tsunami front's own rise, and
        // the bore run up behind it. Leaving two of them out meant the assertion
        // passed happily every time the sheet actually ran out.
        const tideHigh = OCEAN_CONFIG.water.tideRange / 2;
        const peak = Math.max(...everySecond().map((t) => levelAt(t))) + tideHigh;
        // The biggest bore this sea can make, which rides on top of all of it.
        // Ritter's front speed feeding the ballistic stop gives 2 g d / a, and
        // `swashDecel` is g sin(beta) cos(beta) from the same slope.
        const beta = Math.atan(beach.slope);
        const a = 9.81 * Math.sin(beta) * Math.cos(beta);
        const bore = OCEAN_CONFIG.sand.swash.maxBoreDepth
            * Math.max(...everySecond().map((t) => swellAt(t)));
        const runUp = (2 * 9.81 * bore) / a;
        const waterline = beach.shoreZ + peak / beach.slope;
        expect(waterline + runUp).toBeLessThan(beach.nearZ);
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
        // while the thing everybody waited the whole arc for was still arriving.
        const fadeStart = STORM.seconds - STORM.fadeSeconds;
        expect(stageAt(fadeStart).name).toBe('tsunami');
        // The sea is past the camera by then, which is the honest statement of
        // "the tsunami is here". NOT stated as engulfment: the white-out is
        // driven by the bore, which lives in sand.js and depends on which waves
        // happen to have broken, so asserting it here would be asserting against
        // the conservative surge-only estimate and would mean nothing.
        const waterline = beach.shoreZ + levelAt(fadeStart) / beach.slope;
        expect(waterline).toBeGreaterThan(camera.z);
    });

    test('THE TSUNAMI IS WATCHABLE BEFORE IT ARRIVES', () => {
        // THE BUG THIS CAUGHT, AND IT WOULD HAVE RUINED THE ENDING. The first
        // surge table ramped straight out of the drawback to the peak, and
        // walking it showed the water crossing eye level at t = 165, seven
        // seconds before the fade even starts. A visitor would have waited three
        // minutes and watched the finish through a blank white rectangle.
        //
        // So there has to be real time between the sea coming back and the sea
        // covering the lens. Measured on the still water level, which is the
        // half of it the arc controls.
        // MEASURED FROM THE FRONT'S OWN LIFE, which is the honest clock for it.
        // This used to measure from the end of the drawback, and that stopped
        // meaning anything when the front took over the covering: the base surge
        // now stays drawn back while the front comes in, so "the drawback ended"
        // and "the tsunami arrived" became the same instant.
        const appears = STORM.tsunami.startAt;
        const covered = everySecond().find((t) => t >= appears && levelAt(t) >= camera.height);
        // Ten seconds is the floor, not the target. It is about as short as the
        // sea coming back can be and still register as an event rather than as a
        // cut, and it survived the arc being retimed from three minutes to two,
        // which is exactly the pressure this number exists to resist.
        expect(covered - appears).toBeGreaterThanOrEqual(10);
        // And the hit lands BEFORE the fade, or the payoff arrives on a screen
        // that is already going black.
        expect(covered).toBeLessThan(STORM.seconds - STORM.fadeSeconds);
    });

    test('THE FRONT IS THE SAME SHAPE IN BOTH FILES', () => {
        // water.js applies the front per row while building the profile and
        // cannot import storm.js, because the sea knowing about a two minute
        // story is the coupling this whole design avoids. So the smoothstep
        // exists twice and this is what stops the copies drifting.
        //
        // IT ALREADY DRIFTED ONCE, IN BOTH COPIES AT THE SAME TIME. Written the
        // natural way round, `smoothstep(z + width, z - width, ...)` is a
        // REVERSED range, and both smoothsteps guard that with `edge1 <= edge0`
        // and return a hard 1. The front raised the entire ocean the instant it
        // appeared, which is exactly what it was built to replace, and it hid
        // because the visible white line uses a Gaussian and looked perfect.
        const front = frontAt(STORM.tsunami.startAt + 8);
        const ours = (z) => front.rise * (1 - smoothstepCopy(
            front.z - front.width, front.z + front.width, z));
        for (const z of [-400, front.z - 60, front.z - 10, front.z, front.z + 10, front.z + 60, 20]) {
            expect(frontLevelAt(z, front)).toBeCloseTo(ours(z), 9);
        }
        // The properties that matter, stated directly so the copies above cannot
        // both be wrong in the same way and still agree.
        expect(frontLevelAt(front.z - 500, front)).toBeCloseTo(front.rise, 6);
        expect(frontLevelAt(front.z + 500, front)).toBeCloseTo(0, 6);
        expect(frontLevelAt(front.z, front)).toBeCloseTo(front.rise / 2, 6);
        expect(frontLevelAt(0, null)).toBe(0);
    });

    test('THE TSUNAMI IS A THING THAT TRAVELS, NOT A LEVEL THAT RISES', () => {
        // WHAT STEVE COULD NOT SEE COMING, AND WHY. Before the front existed the
        // ending raised the water everywhere at once, so the ocean inflated in
        // place: no object, no approach, nothing to watch. These assertions are
        // about it being somewhere and moving, which is the whole difference.
        const t = STORM.tsunami;
        expect(frontAt(0)).toBeNull();
        expect(frontAt(t.startAt - 1)).toBeNull();
        // It starts out at the fog limit and finishes past the camera, so it
        // neither fades in nor stops in frame.
        expect(frontAt(t.startAt).z).toBeLessThan(-300);
        expect(frontAt(t.arriveAt).z).toBeGreaterThan(camera.z);
        // And it only ever comes closer.
        let previous = -Infinity;
        for (let s = t.startAt; s <= STORM.seconds; s++) {
            const front = frontAt(s);
            expect(front.z).toBeGreaterThanOrEqual(previous - 1e-9);
            previous = front.z;
        }
        // Carrying real water and a white edge by the time it is close enough
        // for either to be seen.
        const near = frontAt(t.arriveAt - 4);
        expect(near.rise).toBeGreaterThan(1);
        expect(near.foam).toBeGreaterThan(0.5);

        // AND A SEA BEHIND IT BIG ENOUGH TO STAND ABOVE THE HORIZON. This is
        // what makes it a wall rather than a step. The level rise alone is a few
        // pixels at three hundred metres, so without this the front travelled
        // correctly and was invisible, which is how it shipped twice.
        //
        // The horizon is at eye height by definition, so a crest that clears
        // `camera.height` is drawn against the sky. `swellBehind` is a multiple
        // of a spectrum whose deep water crest is about 0.67 m, and the front's
        // own rise sits under it.
        expect(near.swellBehind).toBeGreaterThan(2.5);
        const crest = near.swellBehind * 0.67 + near.rise;
        expect(crest).toBeGreaterThan(camera.height * 2);
    });

    test('the front arrives while there is still scene left to see it in', () => {
        // A front that landed after the fade had finished would be a tsunami
        // nobody was shown, which is the same failure as not having one.
        const t = STORM.tsunami;
        expect(t.arriveAt).toBeLessThan(STORM.seconds);
        // THE WALL APPEARS AS THE WATER GOES, and these two coinciding is the
        // point rather than an accident: the sea leaves and the reason it is
        // leaving comes out of the fog behind it in the same second. This used
        // to demand the front appear strictly after the drawback started, which
        // read as caution and was really just the old timing written down.
        expect(t.startAt).toBeGreaterThanOrEqual(
            STORM.stages.find((s) => s.name === 'drawback').from
        );
        expect(t.startAt).toBeLessThan(
            STORM.stages.find((s) => s.name === 'drawback').from + 4
        );
        // At least a few seconds of it on screen before the black starts.
        expect(STORM.seconds - STORM.fadeSeconds).toBeGreaterThan(t.arriveAt - 12);
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
