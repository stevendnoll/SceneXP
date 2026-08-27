// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The weather machine.
 *
 * The randomness is INJECTED rather than called from inside, which is what
 * makes any of this assertable: a scripted sequence of rolls drives the
 * machine and the long-run distribution can be measured instead of watched.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    STATES, weightsFor, nextState, dwellFor, temperatureAt, precipFor,
    blendStates, createWeather, stepWeather, weatherWords, gustAt
} from '../www/garden/js/weather.js';
import { makeRandom } from '../www/garden/js/species.js';
import {
    flashAt, accumulateStrikes, strikeFactorAt, fallRates, fallOpacity
} from '../www/garden/js/precip.js';
import { flashLighting, lightingAt } from '../www/garden/js/sky.js';
import { solarAt } from '../www/garden/js/clock.js';

// ---- Selection -------------------------------------------------------------

test('the weather never repeats itself back to back', () => {
    // A machine that could pick sunny after sunny would sit still for minutes
    // and read as broken rather than as calm.
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        for (const current of STATES) {
            for (let r = 0; r <= 1; r += 0.05) {
                expect(nextState(current, season, r)).not.toBe(current);
            }
        }
    }
});

test('summer is the sunniest season and autumn the windiest', () => {
    // SUMMER BEING SUNNY IS WHY SUMMER IS THE SEASON THE VISITOR HAS TO SHOW
    // UP FOR, so it is measured rather than assumed.
    const random = makeRandom(4242);
    const tally = (season) => {
        const counts = { sunny: 0, cloudy: 0, windy: 0, stormy: 0 };
        let current = 'cloudy';
        for (let i = 0; i < 4000; i++) {
            current = nextState(current, season, random());
            counts[current]++;
        }
        return counts;
    };
    const summer = tally('summer');
    const autumn = tally('autumn');
    const winter = tally('winter');

    expect(summer.sunny).toBeGreaterThan(summer.cloudy);
    // Not the raw six-to-one of the weights: the no-repeat rule suppresses
    // whichever state is currently held, which pulls the dominant one down
    // toward the rest. Two to one is what that actually leaves.
    expect(summer.sunny).toBeGreaterThan(summer.stormy * 2);
    expect(autumn.windy).toBeGreaterThan(summer.windy);
    expect(autumn.sunny).toBeLessThan(summer.sunny);
    // Every state is reachable in every season, or a season would quietly
    // lose part of its weather.
    for (const counts of [summer, autumn, winter]) {
        for (const s of STATES) expect(counts[s]).toBeGreaterThan(0);
    }
});

test('the weights are a complete set for every season', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const w = weightsFor(season);
        let total = 0;
        for (const s of STATES) {
            expect(typeof w[s]).toBe('number');
            total += w[s];
        }
        expect(total).toBeCloseTo(1, 6);
    }
});

test('a state holds for a plausible while', () => {
    const d = GARDEN_CONFIG.weather.dwell;
    expect(dwellFor(0)).toBe(d.min);
    expect(dwellFor(1)).toBe(d.max);
    expect(dwellFor(0.5)).toBeCloseTo((d.min + d.max) / 2, 6);
});

// ---- What is falling -------------------------------------------------------

test('temperature is a curve rather than a calendar', () => {
    // What makes sleet possible is a continuous line crossing a threshold. A
    // switch on the season name would turn every spring storm from snow to
    // rain in a single frame.
    const T = GARDEN_CONFIG.weather.temperature;
    expect(temperatureAt(0)).toBeCloseTo(T.coldest, 6);
    expect(temperatureAt(12)).toBeCloseTo(T.warmest, 6);
    let prev = temperatureAt(0);
    for (let h = 0.25; h <= 12; h += 0.25) {
        const t = temperatureAt(h);
        expect(t).toBeGreaterThan(prev);
        prev = t;
    }
});

test('winter storms fall as snow and summer ones as rain, with sleet between', () => {
    expect(precipFor(1, 0)).toBe('snow');
    expect(precipFor(1, 12)).toBe('rain');
    expect(precipFor(0, 12)).toBe('none');

    // Somewhere in the spring shoulder there is sleet, and it is reached
    // through a gradient rather than a jump.
    const kinds = new Set();
    for (let h = 0; h < 12; h += 0.1) kinds.add(precipFor(1, h));
    expect(kinds.has('snow')).toBe(true);
    expect(kinds.has('sleet')).toBe(true);
    expect(kinds.has('rain')).toBe(true);
});

// ---- Blending --------------------------------------------------------------

test('a change of weather is a crossfade, not a cut', () => {
    const start = blendStates('sunny', 'stormy', 0);
    const mid = blendStates('sunny', 'stormy', 0.5);
    const end = blendStates('sunny', 'stormy', 1);
    expect(start.gloom).toBe(GARDEN_CONFIG.weather.states.sunny.gloom);
    expect(end.gloom).toBe(GARDEN_CONFIG.weather.states.stormy.gloom);
    expect(mid.gloom).toBeGreaterThan(start.gloom);
    expect(mid.gloom).toBeLessThan(end.gloom);
    expect(mid.rain).toBeGreaterThan(0);
});

test('one wind vector, and everything reads it', () => {
    const w = createWeather('windy');
    const random = makeRandom(7);
    for (let i = 0; i < 400; i++) stepWeather(w, 1 / 30, 12, i / 30, random);
    const speed = Math.hypot(w.wind.x, w.wind.z);
    expect(speed).toBeCloseTo(w.windStrength, 6);
    // THE CEILING IS THE STATE'S WIND TIMES THE GUST PEAK, not 1. This
    // assertion used to read `<= 1.0001`, which was true right up until gusts
    // existed and is the sort of bound that quietly encodes an assumption
    // nobody meant to make permanent. Read from config so it moves if the
    // envelope is retuned.
    const ceiling = GARDEN_CONFIG.weather.states.windy.wind * GARDEN_CONFIG.weather.gust.peak;
    expect(speed).toBeLessThanOrEqual(ceiling + 0.0001);
    expect(speed).toBeGreaterThanOrEqual(0);
});

test('the weather actually changes, and reduced motion slows it without stopping it', () => {
    const seen = new Set();
    const w = createWeather('sunny');
    const random = makeRandom(31337);
    for (let i = 0; i < 20000; i++) {
        stepWeather(w, 1 / 30, 12, i / 30, random);
        seen.add(w.state);
    }
    expect(seen.size).toBeGreaterThan(2);

    // Reduced motion damps the crossfade. It does NOT freeze the machine:
    // the setting asks for less movement, not for less weather.
    const calm = createWeather('sunny');
    const calmRandom = makeRandom(31337);
    const states = new Set();
    for (let i = 0; i < 20000; i++) {
        stepWeather(calm, 1 / 30, 12, i / 30, calmRandom, true);
        states.add(calm.state);
    }
    expect(states.size).toBeGreaterThan(2);
});

// ---- The season chip (M9-3) ------------------------------------------------
//
// The chip used to read the STATE MACHINE while the scene drew from two other
// sources, so it could and did contradict the frame. It now reads the rates
// `updatePrecipitation` actually used.

const CALM = { windStrength: 0.2, gloom: 0 };
const NOTHING = { rain: 0, snow: 0 };

test('the chip names what is falling, from the rates that were drawn', () => {
    expect(weatherWords({ ...CALM }, { rain: 0.8, snow: 0 })).toBe('rain');
    expect(weatherWords({ ...CALM }, { rain: 0, snow: 0.8 })).toBe('snow');
    // Sleet is the state of both systems running, which is exactly how
    // fallRates describes it, so the chip needs no separate notion of sleet.
    expect(weatherWords({ ...CALM }, { rain: 0.5, snow: 0.3 })).toBe('sleet');
    expect(weatherWords({ ...CALM }, NOTHING)).toBe('clear');
});

test('THE CHIP SAYS SNOW OVER THE WINTER SNOWFALL, whatever the state is', () => {
    // The frame this exists for is garden-8.png: "Winter, year 13 · cloudy"
    // over heavy falling snow and a fully covered ground. The winter snowfall
    // arrives from the CALENDAR and never touches `weather.rain`, which is all
    // the old chip read, so no threshold tweak anywhere could have caught it.
    const cloudyWinter = {
        state: 'cloudy', from: 'cloudy', transition: 1,
        precip: 'none', rain: 0, gloom: 0.42, windStrength: 0.3
    };
    // Mid-accumulation, which is what garden-8 shows.
    const fall = fallRates(cloudyWinter, 0.5);
    expect(fall.snow).toBeGreaterThan(0);
    expect(weatherWords(cloudyWinter, fall)).toBe('snow');

    // And the melt, which is the spring half of the same bug (garden-11.png).
    const springMelt = { ...cloudyWinter, state: 'windy', from: 'windy' };
    expect(weatherWords(springMelt, fallRates(springMelt, 0.4))).toBe('snow');

    // Full cover with nothing in the air is NOT snowfall, and the chip must
    // not claim it is. This is the assertion that fails if the strict
    // inequalities in fallRates are ever loosened.
    expect(fallRates(cloudyWinter, 1).snow).toBe(0);
    expect(weatherWords(cloudyWinter, fallRates(cloudyWinter, 1))).toBe('cloudy');
});

test('the chip never announces precipitation the renderer did not switch on', () => {
    // The old chip called it rain above 0.01 while the mesh appeared at 0.02.
    const min = GARDEN_CONFIG.weather.precipitation.visibleRate;
    expect(weatherWords({ ...CALM }, { rain: min * 0.99, snow: 0 })).toBe('clear');
    expect(weatherWords({ ...CALM }, { rain: min, snow: 0 })).toBe('rain');
});

test('WINDY IS A WIND SPEED, not a state name', () => {
    const W = GARDEN_CONFIG.weather;
    // A cloudy state at a full gust really is windier than a windy state in a
    // lull, and before M9-3 the chip called the first one cloudy.
    const cloudyGust = W.states.cloudy.wind * W.gust.peak;
    const windyLull = W.states.windy.wind * W.gust.floor;
    expect(cloudyGust).toBeGreaterThan(windyLull);

    expect(weatherWords({ windStrength: cloudyGust, gloom: 0.42 }, NOTHING)).toBe('windy');
    expect(weatherWords({ windStrength: windyLull, gloom: 0.24 }, NOTHING)).not.toBe('windy');

    // And no sunny hour can ever reach it, gust or no gust, or the chip would
    // read "windy" on a still summer afternoon.
    expect(W.states.sunny.wind * W.gust.peak).toBeLessThan(W.windyAbove);
});

test('both halves are named when both are true', () => {
    // A gusty shower is windy AND it is rain. Dropping either is how a chip
    // starts disagreeing with the frame again.
    const gusty = { windStrength: 1.4, gloom: 0.88 };
    expect(weatherWords(gusty, { rain: 0.9, snow: 0 })).toBe('windy rain');
    expect(weatherWords(gusty, { rain: 0.4, snow: 0.3 })).toBe('windy sleet');
});

// ---- Lightning -------------------------------------------------------------

test('a flash is a fast attack and a slow decay', () => {
    const L = GARDEN_CONFIG.weather.lightning;
    expect(flashAt(-1)).toBe(0);
    expect(flashAt(0)).toBe(0);
    expect(flashAt(L.attackSeconds)).toBeCloseTo(1, 6);
    // The decay is slower than the attack, which is what makes a flash read as
    // electrical rather than as somebody turning a light on.
    expect(flashAt(L.attackSeconds * 2)).toBeGreaterThan(0.5);
    expect(flashAt(L.attackSeconds + L.decaySeconds)).toBeLessThan(0.1);
    expect(flashAt(5)).toBe(0);
});

test('the strike rate uses an accumulator, and is capped', () => {
    // A VARYING RATE NEEDS AN ACCUMULATOR rather than a drawn gap: drawing a
    // gap from the current rate is wrong every time the rate moves, which in a
    // storm is always.
    let accum = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) accum = accumulateStrikes(accum, dt, 0.25);
    expect(accum).toBeCloseTo(2.5, 6);

    // The cap holds however hard it is pushed.
    const L = GARDEN_CONFIG.weather.lightning;
    let capped = 0;
    for (let i = 0; i < 60; i++) capped = accumulateStrikes(capped, 1 / 60, 1000);
    expect(capped).toBeCloseTo(L.maxFlashesPerSecond, 6);
});

// ---- The flash is a ratio (M9-1) -------------------------------------------

test('A FLASH LIFTS THE FILL BY THE SAME RATIO AT EVERY HOUR', () => {
    // The defect: the lift used to be `ambient + flash * 1.6`, an ABSOLUTE
    // amount laid onto a fill that runs about 4.3 to 1 across the day, so one
    // flash was a modest brightening at noon and a white-out at midnight.
    const peak = GARDEN_CONFIG.weather.lightning.peak;
    const hours = [0, 3, 6, 9, 12, 15, 18, 21];
    const ratios = hours.map((h) => {
        const base = lightingAt(h, 0, 0.88);
        const lit = flashLighting(base, peak);
        return lit.ambient / base.ambient;
    });
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);

    // And the ratio is the one the flash had at the hour it was tuned at,
    // stormy noon, so nothing about a daytime storm changes.
    const noon = lightingAt(12, 0, 0.88);
    expect(flashLighting(noon, peak).ambient / noon.ambient).toBeCloseTo(3.68, 2);
});

test('the midnight flash no longer overwhelms the midnight frame', () => {
    const peak = GARDEN_CONFIG.weather.lightning.peak;
    // Stormy midnight with no snow down is the worst case: the darkest fill
    // the garden ever has, under the one state that makes lightning.
    const midnight = lightingAt(0, 0, 0.88);
    const noon = lightingAt(12, 0, 0.88);

    // What a white-out IS: the frame jumping by a far larger factor at the
    // dark end than at the end the effect was tuned at. The old absolute lift
    // was 5.5 times as violent at midnight as it was at noon.
    const oldRatio = (l) => (l.ambient + peak * 1.6) / l.ambient;
    const nowRatio = (l) => flashLighting(l, peak).ambient / l.ambient;
    expect(oldRatio(midnight)).toBeGreaterThan(9);
    expect(oldRatio(midnight) / oldRatio(noon)).toBeGreaterThan(2.4);
    expect(nowRatio(midnight) / nowRatio(noon)).toBeCloseTo(1, 9);

    // And a flashed night is still plainly a night, measured on the TOTAL
    // light reaching the ground rather than on the fill alone. The fill is
    // only a part of it, and at noon the sun dwarfs it.
    const total = (l, flash) => {
        const lit = flashLighting(l, flash);
        return lit.ambient + lit.hemi + l.sunIntensity + l.moonIntensity;
    };
    expect(total(midnight, peak)).toBeLessThan(total(noon, 0));
    // The flash is still an event, though. A storm with the electricity taken
    // out is a worse scene, not a gentler one.
    expect(total(midnight, peak)).toBeGreaterThan(total(midnight, 0) * 1.5);
});

test('no flash means no lift, at any hour', () => {
    for (const h of [0, 6, 12, 18]) {
        const base = lightingAt(h, 0.5, 0.4);
        const lit = flashLighting(base, 0);
        expect(lit.ambient).toBeCloseTo(base.ambient, 12);
        expect(lit.hemi).toBeCloseTo(base.hemi, 12);
    }
});

// ---- Lightning follows the sun (M9-2) --------------------------------------

test('the strike rate tapers off with the sun and is floored at night', () => {
    const L = GARDEN_CONFIG.weather.lightning;

    // Walk a whole year of hours rather than restating the formula, and check
    // the shape: monotonic with elevation, full in the middle of the day,
    // floored in the deep of the night.
    let brightest = 0;
    let darkest = 1;
    for (let h = 0; h < 24; h += 0.05) {
        const f = strikeFactorAt(h);
        expect(f).toBeGreaterThanOrEqual(L.nightRate - 1e-9);
        expect(f).toBeLessThanOrEqual(1 + 1e-9);
        if (solarAt(h).elevation > L.dayAboveElevation) brightest = Math.max(brightest, f);
        if (solarAt(h).elevation < L.nightBelowElevation) darkest = Math.min(darkest, f);
    }
    expect(strikeFactorAt(12)).toBeCloseTo(1, 6);
    expect(strikeFactorAt(0)).toBeCloseTo(L.nightRate, 6);
    expect(brightest).toBeCloseTo(1, 6);
    expect(darkest).toBeCloseTo(L.nightRate, 6);

    // Smooth, not a branch on an hour: no two adjacent minutes may jump.
    let biggestStep = 0;
    for (let h = 0; h < 24; h += 1 / 60) {
        biggestStep = Math.max(biggestStep, Math.abs(strikeFactorAt(h) - strikeFactorAt(h + 1 / 60)));
    }
    expect(biggestStep).toBeLessThan(0.02);
});

test('a night storm gets far fewer strikes than a day storm', () => {
    // The claim the request actually makes, measured over a storm's own dwell
    // rather than asserted about the factor.
    const L = GARDEN_CONFIG.weather.lightning;
    const dwell = GARDEN_CONFIG.weather.dwell.max;
    const perStorm = (hour) => (L.strikesPerMinute / 60) * strikeFactorAt(hour) * dwell;

    expect(perStorm(12)).toBeGreaterThan(9);
    // Most night storms carry one flash or none.
    expect(perStorm(0)).toBeLessThan(1.5);
    expect(perStorm(0) / perStorm(12)).toBeCloseTo(L.nightRate, 6);
});

// ---- What is falling (M9-4) ------------------------------------------------

test('SLEET IS A MIXTURE, not both systems at full rate', () => {
    const P = GARDEN_CONFIG.weather.precipitation;
    const sleeting = { precip: 'sleet', rain: 1 };
    const fall = fallRates(sleeting, 0);

    // Both are on, which is what makes it sleet.
    expect(fall.rain).toBeGreaterThan(P.visibleRate);
    expect(fall.snow).toBeGreaterThan(P.visibleRate);
    // Neither is at the full rate, which is what it used to do: the old code
    // handed `weather.rain` to each, so sleet drew a downpour and a blizzard
    // on top of each other and the white points won.
    expect(fall.rain).toBeLessThan(1);
    expect(fall.snow).toBeLessThan(1);
    // And it is mostly wet, or it is just snow again.
    expect(fall.rain).toBeGreaterThan(fall.snow);
});

test('light rain is drawn as light rain rather than as nothing', () => {
    const P = GARDEN_CONFIG.weather.precipitation;
    const light = GARDEN_CONFIG.weather.states.windy.rain;
    const heavy = GARDEN_CONFIG.weather.states.stormy.rain;

    const lightOpacity = fallOpacity(light, P.rainOpacityPeak, P.rainOpacityCurve);
    const heavyOpacity = fallOpacity(heavy, P.rainOpacityPeak, P.rainOpacityCurve);

    // The old linear `rain * 0.5` drew the windy state's 0.12 at six percent,
    // which is not visible against a lawn at any hour.
    expect(light * 0.5).toBeLessThan(0.07);
    expect(lightOpacity).toBeGreaterThan(0.15);
    // But it is still plainly lighter than a storm, or the curve has just
    // turned every shower into a downpour.
    expect(lightOpacity).toBeLessThan(heavyOpacity * 0.5);
    expect(fallOpacity(0, P.rainOpacityPeak, P.rainOpacityCurve)).toBe(0);
});

// ---- Gusts (M8-6) ----------------------------------------------------------
//
// The sway is the subject of this scene, and before this the wind held one
// strength per weather state for the whole 20 to 45 second dwell. These tests
// drive the envelope rather than restating its formula: a test that recomputed
// the same three sines would pass against any envelope at all, including one
// that never gusts.

const GUST = GARDEN_CONFIG.weather.gust;

/** Ten minutes of envelope at 30 fps, which is several of every period in it. */
function walkGust(seconds = 600, fps = 30) {
    const out = [];
    for (let i = 0; i < seconds * fps; i++) out.push(gustAt(i / fps));
    return out;
}

test('the envelope is a pure function of the clock, so a reload gusts identically', () => {
    // No Math.random anywhere near it: the same moment is the same weather.
    for (const t of [0, 1.5, 97.25, 1234.5, 86400]) {
        expect(gustAt(t)).toBe(gustAt(t));
    }
    // And a second walk from a cold start matches the first, which is the
    // property a returning visitor actually experiences.
    const a = walkGust(60);
    const b = walkGust(60);
    expect(a).toEqual(b);
});

test('it stays inside its stated range and never reaches dead calm', () => {
    const v = walkGust();
    expect(Math.min.apply(null, v)).toBeGreaterThanOrEqual(GUST.floor - 1e-9);
    expect(Math.max.apply(null, v)).toBeLessThanOrEqual(GUST.peak + 1e-9);
    // A floor of zero would mean the highlight of the scene switching off.
    expect(GUST.floor).toBeGreaterThan(0);
});

test('it actually gusts, rather than sitting near its own average', () => {
    const v = walkGust();
    const span = GUST.peak - GUST.floor;
    // Uses most of the range it claims. An envelope stuck near the middle
    // would pass every other test in this file.
    expect(Math.max.apply(null, v) - Math.min.apply(null, v)).toBeGreaterThan(span * 0.9);

    // And it goes back and forth rather than drifting once. Count upward
    // crossings of a surge threshold over ten minutes.
    let surges = 0;
    for (let i = 1; i < v.length; i++) if (v[i - 1] < 1.25 && v[i] >= 1.25) surges++;
    expect(surges).toBeGreaterThan(20);
    expect(surges).toBeLessThan(200);
});

test('the mean sits near 1, so every wind number tuned before gusts still means what it meant', () => {
    const v = walkGust();
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean).toBeGreaterThan(0.9);
    expect(mean).toBeLessThan(1.1);
    // Lulls run longer than surges, which is what makes a gust read as one.
    expect(v.filter((x) => x < 1).length / v.length).toBeGreaterThan(0.5);
});

test('nothing pops: no single frame jumps the wind', () => {
    const v = walkGust();
    for (let i = 1; i < v.length; i++) {
        expect(Math.abs(v[i] - v[i - 1])).toBeLessThan(0.02);
    }
});

test('stepWeather publishes the gust, so downstream cannot disagree about it', () => {
    const w = createWeather('windy');
    const random = makeRandom(11);
    stepWeather(w, 1 / 30, 12, 42, random);
    // Settled in 'windy', so the state's own wind is the base and the gust is
    // the whole of the difference.
    expect(w.gust).toBeCloseTo(gustAt(42), 9);
    expect(w.windStrength).toBeCloseTo(GARDEN_CONFIG.weather.states.windy.wind * gustAt(42), 9);
});

test('the gust multiplies strength and never touches the angle', () => {
    // THE TRAP THIS GUARDS. Gusting the direction would swing the whole wood
    // sideways in unison, which reads as one object rather than as many trees.
    // Same accumulated dt, two different clocks: the heading must be identical
    // while the speed must not be.
    const run = (elapsed) => {
        const w = createWeather('windy');
        const random = makeRandom(5);
        for (let i = 0; i < 30; i++) stepWeather(w, 1 / 30, 12, elapsed + i / 30, random);
        return { angle: Math.atan2(w.wind.z, w.wind.x), speed: Math.hypot(w.wind.x, w.wind.z) };
    };
    const lull = run(3.2);
    const surge = run(9.4);
    expect(lull.angle).toBeCloseTo(surge.angle, 9);
    expect(Math.abs(lull.speed - surge.speed)).toBeGreaterThan(0.05);
});

test('reduced motion damps the gust toward steady without removing it', () => {
    const sample = (reduced) => {
        const out = [];
        for (let i = 0; i < 600 * 30; i++) {
            const w = createWeather('windy');
            stepWeather(w, 1 / 30, 12, i / 30, makeRandom(3), reduced);
            out.push(w.gust);
            i += 29; // one sample a second is plenty for a range
        }
        return out;
    };
    const full = sample(false);
    const calm = sample(true);
    const range = (v) => Math.max.apply(null, v) - Math.min.apply(null, v);
    // Gentler, but still moving. Zero here would be taking the scene away.
    expect(range(calm)).toBeLessThan(range(full));
    expect(range(calm)).toBeGreaterThan(0.05);
});

// ---- No dead calm (M8-8) ---------------------------------------------------
//
// The gate is "a visitor arriving at any hour in any state sees the trees
// moving, confirmed by walking the state machine rather than by watching".
// So this walks it.
//
// The threshold is in PIXELS rather than in wind units, because wind units are
// not a thing anybody can see. A 10 m tree's tip moves `wind * height *
// swayPerMetre` metres, and at the composed camera's 23.09 m across a 60 degree
// vertical frame that lands at about 793 px per radian.

const PX_PER_RADIAN = 830 / 1.0472;
const CAMERA_DISTANCE = 23.09;

/** Tip movement of a 10 m tree, in pixels, at a given wind. */
function tipPixels(wind, height = 10) {
    const metres = wind * height * GARDEN_CONFIG.tree.swayPerMetre;
    return (metres / CAMERA_DISTANCE) * PX_PER_RADIAN;
}

/** Forty in-world minutes of weather, sampled three times a second. */
function walkWind(hour, seed = 4242) {
    const w = createWeather('sunny');
    const random = makeRandom(seed);
    const out = [];
    for (let i = 0; i < 40 * 60 * 30; i++) {
        stepWeather(w, 1 / 30, hour, i / 30, random);
        if (i % 10 === 0) out.push(Math.hypot(w.wind.x, w.wind.z));
    }
    return out.sort((a, b) => a - b);
}

test('there is no hour of any season where the garden stands still', () => {
    for (const [season, hour] of [['spring', 6], ['summer', 12], ['autumn', 18], ['winter', 0]]) {
        const v = walkWind(hour);
        const p5 = v[Math.floor(v.length * 0.05)];
        const median = v[Math.floor(v.length * 0.5)];
        // Even the calmest twentieth of the time has to be visibly moving.
        // Before M8-8 the calm states sat at 0.16 and this came out at 4 px.
        expect(tipPixels(p5)).toBeGreaterThan(5);
        expect(tipPixels(median)).toBeGreaterThan(10);
        expect(season).toBeTruthy();
    }
});

test('the calm states carry a breeze, and the loud ones were left alone', () => {
    const S = GARDEN_CONFIG.weather.states;
    // The problem was never the top of the range.
    expect(S.windy.wind).toBe(1);
    expect(S.stormy.wind).toBeCloseTo(0.72, 6);
    // A sunny hour at the very bottom of a lull still has to move.
    expect(tipPixels(S.sunny.wind * GARDEN_CONFIG.weather.gust.floor)).toBeGreaterThan(4);
    // And the ordering still has to make sense as weather.
    expect(S.sunny.wind).toBeLessThan(S.cloudy.wind);
    expect(S.cloudy.wind).toBeLessThan(S.stormy.wind);
    expect(S.stormy.wind).toBeLessThan(S.windy.wind);
});
