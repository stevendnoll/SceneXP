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
    blendStates, createWeather, stepWeather, weatherWords
} from '../www/garden/js/weather.js';
import { makeRandom } from '../www/garden/js/species.js';
import { flashAt, accumulateStrikes } from '../www/garden/js/precip.js';

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
    for (let i = 0; i < 400; i++) stepWeather(w, 1 / 30, 12, random);
    const speed = Math.hypot(w.wind.x, w.wind.z);
    expect(speed).toBeCloseTo(w.windStrength, 6);
    expect(speed).toBeLessThanOrEqual(1.0001);
    expect(speed).toBeGreaterThanOrEqual(0);
});

test('the weather actually changes, and reduced motion slows it without stopping it', () => {
    const seen = new Set();
    const w = createWeather('sunny');
    const random = makeRandom(31337);
    for (let i = 0; i < 20000; i++) {
        stepWeather(w, 1 / 30, 12, random);
        seen.add(w.state);
    }
    expect(seen.size).toBeGreaterThan(2);

    // Reduced motion damps the crossfade. It does NOT freeze the machine:
    // the setting asks for less movement, not for less weather.
    const calm = createWeather('sunny');
    const calmRandom = makeRandom(31337);
    const states = new Set();
    for (let i = 0; i < 20000; i++) {
        stepWeather(calm, 1 / 30, 12, calmRandom, true);
        states.add(calm.state);
    }
    expect(states.size).toBeGreaterThan(2);
});

test('the chip says what the weather is doing', () => {
    expect(weatherWords({ precip: 'snow', state: 'stormy', gloom: 1, from: 'stormy', transition: 1 })).toBe('snow');
    expect(weatherWords({ precip: 'rain', state: 'stormy', gloom: 1, from: 'stormy', transition: 1 })).toBe('rain');
    expect(weatherWords({ precip: 'none', state: 'windy', gloom: 0.2, from: 'windy', transition: 1 })).toBe('windy');
    expect(weatherWords({ precip: 'none', state: 'cloudy', gloom: 0.5, from: 'cloudy', transition: 1 })).toBe('cloudy');
    expect(weatherWords({ precip: 'none', state: 'sunny', gloom: 0, from: 'sunny', transition: 1 })).toBe('clear');
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
