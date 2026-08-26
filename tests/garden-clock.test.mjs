// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Fractal Garden calendar.
 *
 * clock.js is pure, so this suite needs no THREE, no DOM, and no stubs at all.
 * That is the point of the split: the rules the whole scene depends on are
 * asserted against real numbers rather than against a proxy that reports zero.
 *
 * The assertions here are properties rather than restatements. "Winter wraps
 * through midnight", "snow never un-falls", "an evergreen never goes bare",
 * "the trees are only thirsty in daylight". A test that simply repeated the
 * boundary constants would pass against any implementation that had the same
 * typo.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    hourAt, yearAt, wrapHour, yearPhaseAt, startSeconds,
    seasonAt, seasonPhaseAt, inThirstWindow,
    solarAt, lunarAt,
    snowCoverageAt, isSnowingAt,
    phenologyAt,
    SPRING, SUMMER, AUTUMN, WINTER
} from '../www/garden/js/clock.js';

const CYCLE = GARDEN_CONFIG.clock.cycleSeconds;

// ---- Elapsed time to hours and years ---------------------------------------

test('one cycle is one year and one day', () => {
    expect(hourAt(0, CYCLE)).toBe(0);
    expect(hourAt(CYCLE / 2, CYCLE)).toBeCloseTo(12, 9);
    expect(yearAt(CYCLE * 4.5, CYCLE)).toBeCloseTo(4.5, 9);

    // The clock wraps rather than running off the end, so year 900 works as
    // well as year 1. A garden left running overnight must not break.
    expect(hourAt(CYCLE * 900 + CYCLE / 4, CYCLE)).toBeCloseTo(6, 6);
});

test('a new garden opens at sunrise in the middle of spring', () => {
    // Hour zero is midnight in the deep of winter, under snow, with the
    // watering window shut, which is a strange place to hand somebody an empty
    // plot. The start hour moves only where a NEW garden begins: elapsed time
    // is still a duration from zero, so nothing persisted is affected.
    const start = startSeconds();
    expect(hourAt(start)).toBeCloseTo(GARDEN_CONFIG.clock.startHour, 9);
    expect(seasonAt(hourAt(start))).toBe(SPRING);
    expect(snowCoverageAt(hourAt(start))).toBe(0);
    // Sunrise exactly, and the growing season about to open.
    expect(solarAt(hourAt(start)).elevation).toBeCloseTo(0, 9);
    expect(inThirstWindow(hourAt(start))).toBe(false);
    expect(inThirstWindow(hourAt(start) + 1.5)).toBe(true);
    // Still the first year.
    expect(Math.floor(yearAt(start))).toBe(0);
});

test('wrapHour folds anything into a day', () => {
    expect(wrapHour(25)).toBe(1);
    expect(wrapHour(-1)).toBe(23);
    expect(wrapHour(-25)).toBe(23);
    expect(yearPhaseAt(6)).toBeCloseTo(0.25, 9);
});

// ---- Seasons ---------------------------------------------------------------

test('the boundary hour belongs to the season that is ending', () => {
    // Half-open intervals, exactly as specified: 03:00:01 to 09:00:00 is
    // spring, so hour 9.0 is still spring and a hair past it is summer.
    expect(seasonAt(3)).toBe(WINTER);
    expect(seasonAt(3.0001)).toBe(SPRING);
    expect(seasonAt(9)).toBe(SPRING);
    expect(seasonAt(9.0001)).toBe(SUMMER);
    expect(seasonAt(15)).toBe(SUMMER);
    expect(seasonAt(15.0001)).toBe(AUTUMN);
    expect(seasonAt(21)).toBe(AUTUMN);
    expect(seasonAt(21.0001)).toBe(WINTER);
});

test('winter is the interval that wraps through midnight', () => {
    // Every off-by-one in this calendar lands here, so it gets its own test.
    expect(seasonAt(23.999)).toBe(WINTER);
    expect(seasonAt(0)).toBe(WINTER);
    expect(seasonAt(2.999)).toBe(WINTER);
    expect(seasonAt(3.0)).toBe(WINTER);

    // And it is one continuous season rather than two stubs: six hours long,
    // like the other three.
    let winterHours = 0;
    for (let h = 0; h < 24; h += 0.01) if (seasonAt(h) === WINTER) winterHours += 0.01;
    expect(winterHours).toBeCloseTo(6, 1);
});

test('every hour of the day belongs to exactly one season', () => {
    const seen = new Set();
    for (let h = 0; h < 24; h += 0.1) {
        const s = seasonAt(h);
        expect([SPRING, SUMMER, AUTUMN, WINTER]).toContain(s);
        seen.add(s);
    }
    expect(seen.size).toBe(4);
});

test('each season is centred on its solar event', () => {
    // THE IDEA THE WHOLE SCENE IS BUILT ON. Spring holds sunrise, summer holds
    // noon, autumn holds sunset, winter holds midnight, and each sits at the
    // exact middle of its season. If this ever fails, the calendar and the sky
    // have come apart.
    const centres = [[6, SPRING], [12, SUMMER], [18, AUTUMN], [0, WINTER]];
    for (const [hour, season] of centres) {
        expect(seasonAt(hour)).toBe(season);
        expect(seasonPhaseAt(hour)).toBeCloseTo(0.5, 9);
    }

    expect(solarAt(6).elevation).toBeCloseTo(0, 9);
    expect(solarAt(18).elevation).toBeCloseTo(0, 9);
    expect(solarAt(12).elevation).toBeCloseTo(GARDEN_CONFIG.sun.maxElevation, 9);
    expect(solarAt(0).elevation).toBeCloseTo(-GARDEN_CONFIG.sun.maxElevation, 9);
});

test('the sun rises in the east and sets in the west', () => {
    expect(solarAt(6).azimuth).toBe(-90);
    expect(solarAt(12).azimuth).toBe(0);
    expect(solarAt(18).azimuth).toBe(90);

    // The moon is the sun's opposite number, which is why midnight, and so
    // midwinter, can be lit at all.
    expect(lunarAt(0).elevation).toBeCloseTo(GARDEN_CONFIG.sun.maxElevation, 9);
    expect(lunarAt(12).elevation).toBeCloseTo(-GARDEN_CONFIG.sun.maxElevation, 9);
});

// ---- Thirst ----------------------------------------------------------------

test('the thirst window is half open and lands entirely in daylight', () => {
    expect(inThirstWindow(7)).toBe(false);
    expect(inThirstWindow(7.0001)).toBe(true);
    expect(inThirstWindow(17)).toBe(true);
    expect(inThirstWindow(17.0001)).toBe(false);

    // THE PROPERTY THAT MATTERS: the one thing the visitor is asked to do never
    // happens in the dark. Every thirsty hour has the sun above the horizon.
    for (let h = 0; h < 24; h += 0.05) {
        if (inThirstWindow(h)) expect(solarAt(h).elevation).toBeGreaterThan(0);
    }
});

test('the trees drink through late spring, all summer, and early autumn', () => {
    const seasons = new Set();
    for (let h = 0; h < 24; h += 0.05) if (inThirstWindow(h)) seasons.add(seasonAt(h));
    expect(seasons).toEqual(new Set([SPRING, SUMMER, AUTUMN]));

    // All of summer, and only part of the shoulder seasons.
    expect(inThirstWindow(9.5)).toBe(true);
    expect(inThirstWindow(14.5)).toBe(true);
    expect(inThirstWindow(4)).toBe(false);   // early spring
    expect(inThirstWindow(20)).toBe(false);  // late autumn
    expect(inThirstWindow(0)).toBe(false);   // winter
});

// ---- Snow ------------------------------------------------------------------

test('snow falls, holds, and melts without ever going backwards', () => {
    // A coverage that could tick backwards mid-accumulation shows up as snow
    // flickering off the ground at one particular hour, so monotonicity on
    // each side is asserted directly rather than assumed from the shape.
    const snow = GARDEN_CONFIG.season.snow;
    const start = GARDEN_CONFIG.season.boundaries.winter;
    const w = (h) => wrapHour(h - start);

    let prev = -1;
    for (let x = w(snow.firstFlakes); x <= w(snow.accumulatedBy); x += 0.01) {
        const c = snowCoverageAt(wrapHour(start + x));
        expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = c;
    }
    expect(prev).toBeCloseTo(1, 6);

    prev = 2;
    for (let x = w(snow.holdUntil); x <= w(snow.meltBy); x += 0.01) {
        const c = snowCoverageAt(wrapHour(start + x));
        expect(c).toBeLessThanOrEqual(prev + 1e-9);
        prev = c;
    }
    expect(prev).toBeCloseTo(0, 6);
});

test('snow is a winter event that melts into spring, and summer never sees it', () => {
    expect(snowCoverageAt(22)).toBe(0);           // just before the first flakes
    expect(snowCoverageAt(0)).toBeGreaterThan(0); // midnight, accumulating
    expect(snowCoverageAt(2)).toBe(1);            // deep winter, fully down

    // THE MELT IS THE ARRIVAL OF SPRING and runs past the boundary on purpose.
    expect(seasonAt(4)).toBe(SPRING);
    expect(snowCoverageAt(4)).toBeGreaterThan(0);
    expect(snowCoverageAt(5)).toBe(0);

    // Nothing at all through the growing half of the year.
    for (let h = 6; h <= 21; h += 0.1) expect(snowCoverageAt(h)).toBe(0);
});

test('flakes stop falling before the ground clears', () => {
    // Snow lies for a while after it stops falling, which is the ordinary way
    // round. The reverse would look like snow evaporating out of the air.
    expect(isSnowingAt(2)).toBe(true);
    expect(isSnowingAt(4)).toBe(false);
    expect(snowCoverageAt(4)).toBeGreaterThan(0);
    expect(isSnowingAt(12)).toBe(false);
});

// ---- Leaves ----------------------------------------------------------------

test('the deciduous year runs bud, leaf, colour, fall, bare', () => {
    const winter = phenologyAt(0);
    expect(winter.leaf).toBe(0);
    expect(winter.drop).toBe(1);

    const budding = phenologyAt(4.5);
    expect(budding.bud).toBeGreaterThan(0);
    expect(budding.bud).toBeLessThan(1);
    expect(budding.leaf).toBeGreaterThan(0);      // a bud opening onto nothing
    expect(budding.leaf).toBeLessThan(0.3);       // reads as a rendering fault

    const summer = phenologyAt(12);
    expect(summer.leaf).toBe(1);
    expect(summer.color).toBe(0);
    expect(summer.drop).toBe(0);

    // Peak colour at sunset, which is the middle of autumn.
    expect(phenologyAt(18).color).toBeCloseTo(1, 6);
    expect(phenologyAt(16.5).color).toBeGreaterThan(0);
    expect(phenologyAt(16.5).color).toBeLessThan(1);

    // Bare by the moment winter opens.
    expect(phenologyAt(21).drop).toBeCloseTo(1, 6);
});

test('the canopy fills before it colours and colours before it falls', () => {
    // Ordering, not values: colour must never begin while leaves are still
    // expanding, and leaves must never drop before they have turned.
    for (let h = 0; h < 24; h += 0.05) {
        const p = phenologyAt(h);
        if (p.drop > 0 && p.drop < 1) expect(p.color).toBeCloseTo(1, 6);
        if (p.color > 0 && p.color < 1) expect(p.leaf).toBe(1);
    }
});

test('an evergreen holds its needles all year and only loses colour', () => {
    for (let h = 0; h < 24; h += 0.25) {
        const p = phenologyAt(h, true);
        expect(p.leaf).toBe(1);
        expect(p.drop).toBe(0);
        expect(p.bud).toBe(0);
    }
    // Dullest at the coldest hour, which is midwinter, and untouched in summer.
    expect(phenologyAt(0, true).color).toBeCloseTo(GARDEN_CONFIG.season.phenology.evergreenWinterFade, 6);
    expect(phenologyAt(12, true).color).toBe(0);
});
