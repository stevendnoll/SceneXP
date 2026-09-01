// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Fractal Garden sky and light rig.
 *
 * Everything asserted here is pure, so no THREE and no DOM. The imperative
 * half of sky.js (the dome, the four lights, the fog object) is exercised by
 * the init smoke; what lives here is the arithmetic that decides what the
 * scene actually looks like at each hour.
 *
 * TWO OF THESE TESTS EXIST BECAUSE THE FIRST IMPLEMENTATION FAILED THEM.
 *
 *   - "the night sky is never black" caught a palette whose luminance values
 *     were physically honest and visually useless: midnight rendered #000002
 *     after the tone curve, which in this garden means half the year is lost,
 *     because winter IS the middle of the night.
 *
 *   - "dawn and dusk are brighter on the ground than midnight" caught a light
 *     rig keyed off the sun's elevation while the sky was keyed off its own
 *     palette. At sunrise the sun sits exactly on the horizon and contributes
 *     nothing, so 06:00 was rendering with less ground light than midnight.
 *
 * Neither would have been caught by a test that restated the code, and neither
 * was visible in the raw hex values. Both are only visible after all four
 * colour stages have run, which is what shownColor() is for.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    unpackColor, packColor, mixColor,
    srgbToLinear, linearToSrgb, toneMapACES, shownColor, luminanceOf,
    bracketKeys, skyStateAt, skyDaylightAt, referenceLuminance,
    directionAt, lightingAt, starFadeAt, starHidingAt, skyOpennessAt
} from '../www/garden/js/sky.js';

const SKY = GARDEN_CONFIG.sky;

/** Total light reaching the garden at an hour. Not a photometric quantity,
 *  just the sum the eye roughly responds to, and enough to compare hours. */
function totalLight(hour, snow = 0) {
    const L = lightingAt(hour, snow);
    return L.ambient + L.hemi + L.sunIntensity + L.moonIntensity;
}

function shownSky(hour) {
    const s = skyStateAt(hour);
    return luminanceOf(shownColor(s.zenith, s.lum, SKY.exposure));
}

// ---- Colour plumbing -------------------------------------------------------

test('the colour conversions round trip', () => {
    for (const c of [0, 0.02, 0.2, 0.5, 0.9, 1]) {
        expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 9);
    }
    expect(packColor(unpackColor(0x3f83cc))).toBe(0x3f83cc);
    expect(packColor(mixColor(0x000000, 0xffffff, 0.5))).toBe(0x808080);
});

test('tone mapping compresses rather than clips', () => {
    // The point of a filmic curve: brightness far past 1 still resolves to
    // something below white, which is what keeps a noon sky from going flat.
    const bright = toneMapACES([4, 4, 4], 1);
    expect(bright[0]).toBeLessThan(1);
    expect(bright[0]).toBeGreaterThan(toneMapACES([2, 2, 2], 1)[0]);
    expect(toneMapACES([0, 0, 0], 1)[0]).toBe(0);
});

// ---- The keyframe table ----------------------------------------------------

test('the keyframe list wraps rather than ending', () => {
    // There is no key at hour 24. Past the last one the second key is the
    // first, a day later, which is what closes the year into a loop. A
    // duplicated key at the end would work until somebody edited one copy, and
    // would then show up as a one frame flash at midnight.
    const b = bracketKeys(22.5);
    expect(b.from.at).toBe(21);
    expect(b.to.at).toBe(0);
    expect(b.t).toBeCloseTo(0.5, 6);

    // And the wrap is continuous: the hair either side of midnight matches.
    const before = skyStateAt(23.999);
    const after = skyStateAt(0.001);
    expect(Math.abs(before.lum - after.lum)).toBeLessThan(0.01);
});

test('every hour resolves to a state', () => {
    for (let h = 0; h < 24; h += 0.05) {
        const s = skyStateAt(h);
        expect(Number.isFinite(s.lum)).toBe(true);
        expect(s.lum).toBeGreaterThan(0);
        expect(s.zenith).toBeGreaterThanOrEqual(0);
        expect(s.horizon).toBeGreaterThanOrEqual(0);
    }
});

// ---- What the sky actually shows -------------------------------------------

test('winter is measurably darker than summer, in screen values', () => {
    // MEASURED AFTER ALL FOUR STAGES, which is the only measurement that means
    // anything. The raw keyframe hexes cannot answer this: `lum` and the tone
    // curve between them can reverse the ordering of two colours, and skipping
    // the final encode is how the ocean scene once shipped a storm sky no
    // darker than its clear one.
    const midwinter = shownSky(0);
    const midsummer = shownSky(12);
    expect(midsummer).toBeGreaterThan(midwinter * 5);

    // Spring dawn and autumn dusk sit between the two, as the seasons do.
    for (const h of [6, 18]) {
        expect(shownSky(h)).toBeGreaterThan(midwinter);
        expect(shownSky(h)).toBeLessThan(midsummer);
    }
});

test('the night sky is never black', () => {
    // THE TRAP THIS SCENE IS MOST EXPOSED TO. Winter is the middle of the
    // night here, so a night sky that resolves to black is not a mood, it is
    // half the year rendered as an empty frame. A physically honest palette
    // does exactly that: an early pass put midnight at #000002.
    for (let h = 19; h < 24 + 5; h += 0.25) {
        const lum = shownSky(h % 24);
        expect(lum).toBeGreaterThan(0.02);
    }

    // And it is a blue rather than a grey, because a clear night sky is.
    const s = skyStateAt(0);
    const [r, g, b] = unpackColor(shownColor(s.zenith, s.lum, SKY.exposure));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
});

test('the sky brightens steadily from midnight to sunrise and fades after sunset', () => {
    // Checked on the dark half only. Across the middle of the day the shown
    // luminance deliberately plateaus rather than peaking to a point, because
    // the zenith DEEPENS toward noon as a real midday sky does, so a strict
    // rise there would be asserting the wrong thing.
    for (let h = 0; h < 6; h += 0.25) {
        expect(shownSky(h + 0.25)).toBeGreaterThan(shownSky(h));
    }
    for (let h = 18; h < 21; h += 0.25) {
        expect(shownSky(h + 0.25)).toBeLessThan(shownSky(h));
    }
});

// ---- The light rig ---------------------------------------------------------

test('dawn and dusk are brighter on the ground than midnight', () => {
    // THE TEST THAT CAUGHT THE REAL BUG. The first rig read the ground's
    // daylight off the sun's elevation while the sky read it off the palette.
    // At sunrise the sun is exactly on the horizon and delivers nothing, so
    // 06:00 came out darker on the ground than midnight while the sky above it
    // was seven times brighter. Deriving the ground from what the sky shows is
    // what makes the two incapable of disagreeing.
    // Midnight is taken with snow half down, which is what the calendar
    // actually has on the ground at that hour, so the comparison is against
    // the brightest version of midnight rather than a convenient one.
    const midnight = totalLight(0, 0.5);
    expect(totalLight(6)).toBeGreaterThan(midnight);
    expect(totalLight(18)).toBeGreaterThan(midnight);
});

test('a sun on the horizon still delivers light', () => {
    // The other half of the same bug: sin(0) is 0, and the moment of sunrise
    // is not an unlit moment.
    expect(lightingAt(6).sunIntensity).toBeGreaterThan(0.2);
    // But it dies out below the horizon rather than shining up through it.
    expect(lightingAt(4).sunIntensity).toBe(0);
    expect(lightingAt(20).sunIntensity).toBe(0);
});

test('noon is the brightest hour, and the darkest is dusk rather than midnight', () => {
    let brightest = -1, brightestHour = -1;
    let darkest = Infinity, darkestHour = -1;
    for (let h = 0; h < 24; h += 0.25) {
        const t = totalLight(h);
        if (t > brightest) { brightest = t; brightestHour = h; }
        if (t < darkest) { darkest = t; darkestHour = h; }
    }
    expect(brightestHour).toBeGreaterThan(11);
    expect(brightestHour).toBeLessThan(13);

    // THE DARKEST MOMENT IS 19:30, AND THAT IS NOT A BUG. The moon is the
    // sun's exact opposite in this sky, which is the geometry of a full moon,
    // so it sits ON the horizon at the instant the sun does. Late dusk is
    // therefore the one time with neither a sun nor a risen moon, and the
    // garden brightens again as the night deepens and the moon climbs.
    // That is exactly what a snowy full-moon night does, and it is why winter
    // here is legible rather than black.
    expect(darkestHour).toBeGreaterThan(18.5);
    expect(darkestHour).toBeLessThan(20.5);
    expect(totalLight(0, 0.5)).toBeGreaterThan(darkest);
});

test('the ground never goes as dark as the sky does', () => {
    // Ambient floors, the winter lift, and the moon mean the ground holds a
    // much narrower range than the sky. If these two ever match, the floors
    // have stopped working.
    const skyRatio = shownSky(12) / shownSky(0);
    const groundRatio = totalLight(12) / totalLight(0, 0.5);
    expect(skyRatio).toBeGreaterThan(8);
    expect(groundRatio).toBeLessThan(skyRatio / 2);
    expect(groundRatio).toBeGreaterThan(2.5);
});

test('the winter floor lifts winter and leaves the equinoxes alone', () => {
    // Peaked at midnight and zero at both equinox hours, so spring and autumn
    // are untouched. This is the term most likely to be moved during QA, so
    // its SHAPE is asserted rather than its value.
    expect(lightingAt(0).winterness).toBeCloseTo(1, 6);
    expect(lightingAt(6).winterness).toBeCloseTo(0, 6);
    expect(lightingAt(18).winterness).toBeCloseTo(0, 6);
    expect(lightingAt(12).winterness).toBeCloseTo(0, 6);

    // The moon is the winter key light, so the boost lands mostly there. Note
    // the moon reaches the SUN'S maximum elevation rather than the zenith, so
    // the boosted peak is scaled by how high it actually gets.
    const L = GARDEN_CONFIG.sky.lighting;
    const moonUp = Math.sin(GARDEN_CONFIG.sun.maxElevation * Math.PI / 180);
    expect(lightingAt(0).moonIntensity)
        .toBeCloseTo(L.moonPeak * (1 + L.winterFloor.moonBoost) * moonUp, 6);
    // And the boost is real: without it, winter would be as dark as any night.
    expect(lightingAt(0).moonIntensity).toBeGreaterThan(L.moonPeak * moonUp);
});

test('snow throws light back up, and the colour of the bounce follows', () => {
    const dry = lightingAt(0, 0);
    const deep = lightingAt(0, 1);
    expect(deep.ambient).toBeGreaterThan(dry.ambient);
    expect(deep.hemi).toBeGreaterThan(dry.hemi);

    // The hemisphere light's GROUND colour is what tints the bounce, so it has
    // to move from soil toward snow as coverage rises. A brighter bounce in
    // the colour of earth would look like a fault rather than like snow.
    expect(luminanceOf(deep.hemiGround)).toBeGreaterThan(luminanceOf(dry.hemiGround));
    expect(deep.hemiGround).toBe(GARDEN_CONFIG.sky.lighting.snowBounce.groundColor);
});

test('a low sun is a warm sun', () => {
    const dawn = unpackColor(lightingAt(6).sunColor);
    const noon = unpackColor(lightingAt(12).sunColor);
    // Warmth is red over blue, and it has to be strictly greater at the
    // horizon or the golden hours are not golden.
    expect(dawn[0] / dawn[2]).toBeGreaterThan(noon[0] / noon[2]);
    expect(lightingAt(12).sunColor).toBe(GARDEN_CONFIG.sky.lighting.sunColorHigh);
});

test('daylight is normalised against the brightest hour of the year', () => {
    expect(referenceLuminance()).toBeGreaterThan(0);
    expect(skyDaylightAt(12)).toBeGreaterThan(0.95);
    expect(skyDaylightAt(0)).toBeLessThan(0.15);
    for (let h = 0; h < 24; h += 0.5) {
        const d = skyDaylightAt(h);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
    }
});

// ---- Direction and stars ---------------------------------------------------

test('directions come out unit length and pointing the right way', () => {
    const up = directionAt(90, 0);
    expect(up.y).toBeCloseTo(1, 9);

    const south = directionAt(0, 0);
    expect(south.z).toBeCloseTo(1, 9);
    const west = directionAt(0, 90);
    expect(west.x).toBeCloseTo(1, 9);

    for (const [el, az] of [[0, 0], [30, 45], [-20, 200], [58, -90]]) {
        const d = directionAt(el, az);
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    }
});

test('stars are gone in daylight and full in the deep of the night', () => {
    expect(starFadeAt(12)).toBe(0);
    expect(starFadeAt(6)).toBe(0);
    expect(starFadeAt(0)).toBe(1);
    // They come out through twilight rather than switching on.
    const dusk = starFadeAt(18.6);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
});


// ---- Cloud is a lid (M11-2) ------------------------------------------------

/**
 * `starFadeAt` answers "is the sun down". `starHidingAt` answers "can anything
 * be seen through the sky at all". They multiply at the call site, and keeping
 * them apart is what lets the MOON read the second without inheriting the
 * first.
 */
test('an overcast sky has no stars in it, at any hour of the night', () => {
    const S = SKY.stars;
    // Midnight through to the far side of dawn: every hour the stars are out.
    for (const hour of [21, 22, 23, 0, 1, 2, 3, 4]) {
        const bare = starFadeAt(hour);
        const shown = bare * skyOpennessAt(S.overcastAbove);
        expect(shown).toBeCloseTo(0, 6);
    }
});

test('a clear night is exactly as starry as it ever was', () => {
    // The regression guard for every star test written before M11-2: at cloud
    // zero the new term must be an identity, or this change quietly redecorates
    // a sky nobody asked it to touch.
    for (const hour of [20, 21, 22, 23, 0, 1, 2, 3, 4, 5]) {
        expect(starFadeAt(hour) * skyOpennessAt(0)).toBeCloseTo(starFadeAt(hour), 10);
    }
});

test('broken cloud keeps about half its stars', () => {
    // The windy state, which is a real and worth-having night sky rather than
    // a rounding of cloudy.
    const windy = GARDEN_CONFIG.weather.states.windy.gloom;
    const open = skyOpennessAt(windy);
    expect(open).toBeGreaterThan(0.25);
    expect(open).toBeLessThan(0.75);
});

test('the hiding ramp is monotonic and lands on both ends', () => {
    const S = SKY.stars;
    let last = -1;
    for (let c = 0; c <= 1.0001; c += 0.02) {
        const v = starHidingAt(c);
        expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        last = v;
    }
    expect(starHidingAt(0)).toBe(0);
    expect(starHidingAt(S.clearBelow)).toBeCloseTo(0, 6);
    expect(starHidingAt(S.overcastAbove)).toBeCloseTo(1, 6);
    expect(starHidingAt(1)).toBeCloseTo(1, 6);
});

/**
 * THE MOON SPENT FOUR MILESTONES NOT KNOWING ABOUT THE WEATHER.
 *
 * `sunIntensity` loses its delivery to the gloom while keeping its direction,
 * with a good note beside it about the difference between a storm and a sunset.
 * `moonIntensity` on the very next line did not, so a stormy midnight was a
 * black lid of a sky with full moonlight raking across the grass underneath.
 */
test('an overcast sky takes the moonlight as well as the sunlight', () => {
    const clear = lightingAt(0, 0, 0, 0);
    const storm = lightingAt(0, 0, 0.88, 0.88);
    expect(clear.moonIntensity).toBeGreaterThan(0);
    expect(storm.moonIntensity).toBeLessThan(clear.moonIntensity * 0.6);

    // The same scaling the sun gets, so the two cannot drift apart.
    const scale = GARDEN_CONFIG.sky.storm.sunScale;
    expect(storm.moonIntensity / clear.moonIntensity)
        .toBeCloseTo(1 - (1 - scale) * 0.88, 6);
});

test('a calendar blizzard dims the moon even though the gloom is zero', () => {
    // Cloud and gloom differ in exactly one case and this is it. Passing gloom
    // where cloud belongs would leave this at full strength.
    const clear = lightingAt(0, 1, 0, 0);
    const snowing = lightingAt(0, 1, 0, 0.56);
    expect(snowing.moonIntensity).toBeLessThan(clear.moonIntensity);
});

test('cloud defaults to gloom for the callers that do not have one', () => {
    // vista.js passes null. It must behave exactly as it did before M11-2.
    for (const g of [0, 0.24, 0.42, 0.88]) {
        expect(lightingAt(0, 0, g, null).moonIntensity)
            .toBeCloseTo(lightingAt(0, 0, g, g).moonIntensity, 10);
    }
});
