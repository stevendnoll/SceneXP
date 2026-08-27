// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * weather.js - Four states, one wind vector.
 *
 * The selection rules are pure and take their randomness as an argument, never
 * by calling Math.random inside. That is what lets a test drive the machine
 * with a scripted sequence of rolls and assert that a thousand summer steps
 * really do come out sunnier than a thousand autumn ones, which is the kind of
 * claim that is otherwise only ever checked by watching it for a while.
 *
 * ONE WIND VECTOR, PUBLISHED ONCE A FRAME. Branch sway, leaf flutter, leaf
 * fall, rain drift, and snow drift all read the same numbers, so everything in
 * frame agrees about the weather because there is only one source for it. Two
 * modules each deciding how windy it is would disagree by a frame at best and
 * by a whole gust at worst.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { seasonAt, wrapHour, clamp01 } from './clock.min.js';

export const STATES = ['sunny', 'cloudy', 'windy', 'stormy'];

// ---- Selection (pure) ------------------------------------------------------

export function weightsFor(season, config = GARDEN_CONFIG) {
    return config.weather.weights[season] || config.weather.weights.summer;
}

/**
 * The next state, given a roll in 0 to 1.
 *
 * NEVER THE SAME STATE TWICE IN A ROW. Its weight is removed and the rest are
 * renormalised, so "the weather changed" always means something changed. A
 * machine that could pick sunny after sunny would sit still for minutes at a
 * time and read as broken rather than as calm.
 */
export function nextState(current, season, roll, config = GARDEN_CONFIG) {
    const weights = weightsFor(season, config);
    let total = 0;
    for (const s of STATES) if (s !== current) total += weights[s] || 0;
    if (total <= 0) return current;

    let acc = 0;
    const target = clamp01(roll) * total;
    for (const s of STATES) {
        if (s === current) continue;
        acc += weights[s] || 0;
        if (target <= acc) return s;
    }
    return STATES[STATES.length - 1] === current ? STATES[0] : STATES[STATES.length - 1];
}

/** How long a state holds before the next draw. */
export function dwellFor(roll, config = GARDEN_CONFIG) {
    const d = config.weather.dwell;
    return d.min + clamp01(roll) * (d.max - d.min);
}

/**
 * Air temperature at an hour, in degrees.
 *
 * Smooth, and keyed to the same sine the sun follows, so it is coldest at
 * midwinter midnight and warmest at midsummer noon. Deliberately NOT a switch
 * on the season name: what makes sleet possible is a continuous curve crossing
 * a threshold, and a calendar boundary would turn every spring storm from
 * snow to rain in a single frame.
 */
export function temperatureAt(hour, config = GARDEN_CONFIG) {
    const T = config.weather.temperature;
    const t = (Math.sin((wrapHour(hour) - 6) * Math.PI / 12) + 1) / 2;
    return T.coldest + (T.warmest - T.coldest) * t;
}

/** What is falling, if anything. */
export function precipFor(rainRate, hour, config = GARDEN_CONFIG) {
    if (rainRate <= 0.01) return 'none';
    const T = config.weather.temperature;
    const temp = temperatureAt(hour, config);
    if (temp < T.snowBelow) return 'snow';
    if (temp < T.sleetBelow) return 'sleet';
    return 'rain';
}

/**
 * The gust envelope: what multiplies wind strength at a moment.
 *
 * A PURE FUNCTION OF THE GARDEN CLOCK, with no randomness in it at all. That is
 * not tidiness, it is the same rule the rest of the scene lives by: the garden
 * is reproducible from `elapsedSeconds`, so a visitor who reloads at the same
 * clock gets the same weather doing the same thing. Randomness here would also
 * make the envelope untestable except by watching it, which is exactly how you
 * end up shipping a gust that never arrives.
 *
 * Three sines at periods that do not divide, summed with weights that add to 1
 * so the sum lands in -1 to 1, then shaped so the lulls run longer than the
 * surges. A gust is only a gust because of the quiet before it.
 *
 * Returns a MULTIPLIER, not a strength. It is applied to the state's own wind
 * number so that everything tuned before gusts existed still means what it
 * meant, which is what holding the mean at 0.98 buys.
 */
export function gustAt(elapsed, config = GARDEN_CONFIG) {
    const G = config.weather.gust;
    let raw = 0;
    for (let i = 0; i < G.periods.length; i++) {
        raw += G.weights[i] * Math.sin((elapsed * Math.PI * 2) / G.periods[i] + i * 1.7 + i * i * 0.7);
    }
    const shaped = Math.pow(clamp01((raw + 1) / 2), G.shape);
    return G.floor + (G.peak - G.floor) * shaped;
}

/** Blend two states' numbers. */
export function blendStates(a, b, t, config = GARDEN_CONFIG) {
    const A = config.weather.states[a];
    const B = config.weather.states[b];
    const mix = (k) => A[k] + (B[k] - A[k]) * clamp01(t);
    return { gloom: mix('gloom'), wind: mix('wind'), rain: mix('rain') };
}

// ---- The driver ------------------------------------------------------------

export function createWeather(startState = 'sunny') {
    return {
        state: startState,
        from: startState,
        transition: 1,       // 1 means settled
        held: 0,
        dwell: 30,
        angle: 0.8,
        gloom: 0,
        windStrength: 0,
        gust: 1,
        rain: 0,
        wind: { x: 0, z: 0 },
        precip: 'none'
    };
}

/**
 * Advance the weather one frame.
 *
 * @param {object} w        from createWeather
 * @param {number} dt       real seconds
 * @param {number} hour     in-world hour
 * @param {number} elapsed  the garden clock, which the gust envelope rides
 * @param {function} random injected, never called from a pure function
 * @param {boolean} reduced prefers-reduced-motion
 */
export function stepWeather(w, dt, hour, elapsed = 0, random = Math.random, reduced = false, config = GARDEN_CONFIG) {
    const W = config.weather;
    const span = reduced ? W.reducedTransitionSeconds : W.transitionSeconds;

    if (w.transition < 1) {
        w.transition = Math.min(1, w.transition + dt / span);
    } else {
        w.held += dt;
        if (w.held >= w.dwell) {
            w.from = w.state;
            w.state = nextState(w.state, seasonAt(hour), random(), config);
            w.dwell = dwellFor(random(), config);
            w.held = 0;
            w.transition = 0;
        }
    }

    const blended = blendStates(w.from, w.state, w.transition, config);
    w.gloom = blended.gloom;
    w.rain = blended.rain;

    // THE ENVELOPE IS PUBLISHED FROM HERE AND NOWHERE ELSE, for the same reason
    // the vector is: two modules deciding how hard it is gusting would disagree
    // by a frame at best. Downstream reads `wind` and gets the gust for free.
    // Reduced motion damps it toward steady rather than removing it.
    const gust = gustAt(elapsed, config);
    w.gust = reduced ? 1 + (gust - 1) * W.gust.reducedDamp : gust;
    w.windStrength = blended.wind * w.gust;

    // The wind swings round slowly rather than jumping, so a change of state
    // is a change of strength rather than of direction. THE GUST MULTIPLIES
    // STRENGTH AND NEVER TOUCHES THE ANGLE: gusting the angle would swing the
    // whole wood sideways in unison, which reads as one object rather than as
    // many trees.
    w.angle += W.turnRate * dt * (reduced ? 0.4 : 1);
    w.wind.x = Math.cos(w.angle) * w.windStrength;
    w.wind.z = Math.sin(w.angle) * w.windStrength;

    w.precip = precipFor(w.rain, hour, config);
    return w;
}

/**
 * A one-line description, for the season chip.
 *
 * IT REPORTS WHAT WAS DRAWN, NOT WHAT THE STATE MACHINE INTENDED, and that is
 * the whole of M9-3. The old version read `w.precip` and the state name, and so
 * was wrong in three separate ways at once:
 *
 *   - The winter snowfall arrives from the CALENDAR and never touches
 *     `w.rain`, so a blizzard under a cloudy state was announced as "cloudy".
 *   - Its threshold was 0.01 while the renderer's was 0.02, so it announced
 *     rain that was not switched on.
 *   - "Windy" was a state NAME, and since gusts arrived a cloudy surge is
 *     windier than a windy lull.
 *
 * So it now takes `fall`, the rates `updatePrecipitation` actually used, and
 * reads the published wind STRENGTH rather than the state it came from.
 *
 * BOTH HALVES ARE NAMED WHEN BOTH ARE TRUE. A gusty shower is windy and it is
 * rain, the chip has room for both, and dropping either one is how a chip
 * starts disagreeing with the frame again.
 *
 * @param {object} w    from stepWeather
 * @param {object} fall {rain, snow} from updatePrecipitation
 */
export function weatherWords(w, fall = null, config = GARDEN_CONFIG) {
    const W = config.weather;
    const min = W.precipitation.visibleRate;
    const rain = fall && fall.rain >= min;
    const snow = fall && fall.snow >= min;
    const windy = (w.windStrength || 0) >= W.windyAbove;

    let falling = '';
    if (rain && snow) falling = 'sleet';
    else if (snow) falling = 'snow';
    else if (rain) falling = 'rain';

    if (falling) return windy ? `windy ${falling}` : falling;
    if (windy) return 'windy';
    if (w.gloom > W.cloudyAbove) return 'cloudy';
    return 'clear';
}
