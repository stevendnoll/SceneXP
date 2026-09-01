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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import { speciesById } from '../www/garden/js/species.js';
import {
    hourAt, yearAt, wrapHour, yearPhaseAt, startSeconds,
    seasonAt, seasonPhaseAt, inThirstWindow,
    solarAt, lunarAt,
    snowCoverageAt, isSnowingAt,
    phenologyAt, fruitStageAt, fruitWords,
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


// ---- Blossom and fruit (M11-6) ---------------------------------------------

const FRUITING = ['apple', 'pear', 'orange', 'cherry'];
const sched = (id) => speciesById(id).schedule;

/** How much fruit is actually DRAWN: the size, against the share not fallen. */
function shown(stage) {
    return stage.size * (1 - stage.drop);
}

test('every fruit schedule runs its whole sequence once a year', () => {
    for (const id of FRUITING) {
        const schedule = sched(id);
        let sawBloom = false;
        let sawGreen = false;
        let sawRipe = false;
        let sawEmpty = false;
        for (let h = 0; h < 24; h += 0.05) {
            const st = fruitStageAt(h, schedule);
            if (st.bloom > 0.9) sawBloom = true;
            if (st.size > 0.5 && st.ripe < 0.05) sawGreen = true;
            if (st.ripe > 0.95 && shown(st) > 0.5) sawRipe = true;
            if (shown(st) < 0.01 && st.bloom < 0.01) sawEmpty = true;
        }
        expect(`${id} blossom`).toBe(sawBloom ? `${id} blossom` : `${id} NO blossom`);
        expect(`${id} green`).toBe(sawGreen ? `${id} green` : `${id} NO green`);
        expect(`${id} ripe`).toBe(sawRipe ? `${id} ripe` : `${id} NO ripe`);
        expect(`${id} empty`).toBe(sawEmpty ? `${id} empty` : `${id} NEVER empty`);
    }
});

test('blossom and fruit are never on the tree at the same time', () => {
    // The invariant that lets one instanced mesh and one draw call carry both.
    // If a schedule is ever retuned so they overlap, the stage swap in
    // FRUIT_BODY starts blending two shapes and this is what says so.
    for (const id of [...FRUITING, 'flowering-dogwood']) {
        for (let h = 0; h < 24; h += 0.02) {
            const st = fruitStageAt(h, sched(id));
            expect(`${id}@${h.toFixed(2)}`)
                .toBe(Math.min(st.bloom, shown(st)) < 1e-6 ? `${id}@${h.toFixed(2)}` : `OVERLAP ${id}@${h.toFixed(2)}`);
        }
    }
});

test('what is drawn is continuous, all the way round the year', () => {
    // A stage that steps is a pop. The four fields are NOT individually
    // continuous and are not meant to be: `size` drops to zero once the last
    // fruit has fallen and `drop` resets at the turn of the tree's own year,
    // but the tree is empty either side of both, so what is on screen never
    // jumps. That product is the thing worth asserting.
    for (const id of FRUITING) {
        const schedule = sched(id);
        const step = 0.01;
        let prevShown = shown(fruitStageAt(0, schedule));
        let prevBloom = fruitStageAt(0, schedule).bloom;
        for (let h = step; h <= 24; h += step) {
            const st = fruitStageAt(h % 24, schedule);
            expect(Math.abs(shown(st) - prevShown)).toBeLessThan(0.05);
            expect(Math.abs(st.bloom - prevBloom)).toBeLessThan(0.05);
            prevShown = shown(st);
            prevBloom = st.bloom;
        }
    }
});

/**
 * THE ONE SCHEDULE FACT A LATER TUNING PASS COULD QUIETLY DESTROY.
 *
 * What people adore about cherry blossom is not the colour, it is the emptiness
 * behind it: a cherry flowers BEFORE its leaves open, so the tree is a cloud of
 * blossom on bare wood with sky showing through. Move the peak past bud break
 * and the tree stops being a cherry.
 */
test('the cherry blooms on bare branches and the apple does not', () => {
    const cherryPeak = speciesById('cherry').schedule.bloomFull;
    const applePeak = speciesById('apple').schedule.bloomFull;

    expect(cherryPeak).toBeLessThan(GARDEN_CONFIG.season.phenology.budEnd);
    expect(fruitStageAt(cherryPeak, sched('cherry')).bloom).toBeGreaterThan(0.95);
    // Barely out of bud, which is to say the tree reads as bare wood.
    expect(phenologyAt(cherryPeak, false).leaf).toBeLessThan(0.12);

    // The apple flowers into a canopy that is already greening, which is what
    // makes the two look nothing alike doing the same thing. Measured: 0.09 of
    // full leaf size under the cherry against 0.39 under the apple, a bit over
    // four to one, and it is the RATIO that carries the difference in frame.
    expect(applePeak).toBeGreaterThan(GARDEN_CONFIG.season.phenology.budEnd);
    expect(phenologyAt(applePeak, false).leaf).toBeGreaterThan(0.35);
    expect(phenologyAt(applePeak, false).leaf)
        .toBeGreaterThan(phenologyAt(cherryPeak, false).leaf * 3);
});

test('the cherry holds its petals longest, because that is what it is for', () => {
    const petalFall = (id) => {
        const s = sched(id);
        return wrapHour(s.bloomEnd - s.bloomFade);
    };
    for (const id of ['apple', 'pear', 'orange']) {
        expect(petalFall('cherry')).toBeGreaterThan(petalFall(id));
    }
});

/**
 * THE ORANGE IS WHY `fruitStageAt` REBASES EVERY KEY ON `bloomStart`.
 *
 * Citrus ripens through the winter, and winter in this garden is MIDNIGHT, so
 * the ripe window runs hour 20 to hour 2.5 and wraps. Written in absolute hours
 * that interval runs backwards and every comparison would need a special case.
 */
test('the orange is ripe at midnight, which is midwinter', () => {
    const st = fruitStageAt(0, sched('orange'));
    expect(st.ripe).toBeGreaterThan(0.95);
    expect(shown(st)).toBeGreaterThan(0.9);
    expect(st.bloom).toBe(0);

    // And it is the ONLY one, which is the whole reason it earns its place: the
    // one season with nothing to look at gets fruit on a dark evergreen.
    for (const id of ['apple', 'pear', 'cherry']) {
        expect(`${id} at midnight`)
            .toBe(shown(fruitStageAt(0, sched(id))) < 0.01 ? `${id} at midnight` : `${id} STILL FRUITING`);
    }
});

test('cherries ripen in high summer, well before an apple', () => {
    const ripeHour = (id) => {
        const s = sched(id);
        return s.ripenEnd;
    };
    expect(ripeHour('cherry')).toBeLessThan(ripeHour('apple'));
    expect(ripeHour('cherry')).toBeLessThan(ripeHour('pear'));
    // High summer is hours 9 to 15.
    expect(ripeHour('cherry')).toBeLessThanOrEqual(15);
});

test('a tree that flowers and sets nothing is a real case, not a broken one', () => {
    // The Flowering Dogwood has carried a blossom colour since M2 with nothing
    // to draw it, while its own note in the plant modal called it "the only
    // tree here that blossoms".
    const dogwood = speciesById('flowering-dogwood');
    expect(dogwood.schedule).toBeTruthy();
    expect(dogwood.fruit).toBeUndefined();

    let sawBloom = false;
    for (let h = 0; h < 24; h += 0.05) {
        const st = fruitStageAt(h, dogwood.schedule);
        if (st.bloom > 0.9) sawBloom = true;
        expect(st.size).toBe(0);
    }
    expect(sawBloom).toBe(true);
});

test('a species with no schedule is simply not fruiting', () => {
    const st = fruitStageAt(12, null);
    expect(st.bloom).toBe(0);
    expect(shown(st)).toBe(0);
});

test('the stage is named in words, because colour is never the only carrier', () => {
    const apple = sched('apple');
    expect(fruitWords(fruitStageAt(apple.bloomFull, apple))).toBe('In blossom');
    expect(fruitWords(fruitStageAt(apple.ripenEnd, apple))).toBe('Fruit ripe');
    expect(fruitWords(fruitStageAt(12, apple))).toBe('Fruit swelling');
    // Out of season it says nothing rather than saying something wrong.
    expect(fruitWords(fruitStageAt(23, apple))).toBe('');
    // And a blossom-only tree is never told it has fruit.
    const dog = sched('flowering-dogwood');
    expect(fruitWords(fruitStageAt(12, dog), false)).toBe('');
});

test('THE WORDS DESCRIBE THIS TREE, NOT ITS SPECIES', async () => {
    // QA: "it will say things like Fruit swelling or that the fruit is ripe
    // even for saplings without fruit, or dead trees which also don't have
    // fruit." Both true, and both the same fault.
    //
    // `fruitStageAt` is a function of the CALENDAR and the species schedule
    // alone. It says what an apple tree is doing in August, and every apple in
    // the plot gets that answer whether it is a twig, a full-grown tree or a
    // dead one. What decides whether a PARTICULAR tree carries anything is
    // `cropAt(growth, health)`, which the renderer has always used: `viewFor`
    // puts it in `crop` and the shader multiplies blossom and fruit by it. The
    // card read one and the tree drew the other.
    const { cropAt } = await import('../www/garden/js/garden.js');
    const apple = sched('apple');
    const wordsFor = (growth, health) => {
        const crop = cropAt(growth, health);
        const said = new Set();
        for (let hour = 0; hour < 24; hour += 0.25) {
            const w = fruitWords(fruitStageAt(hour, apple), true, crop);
            if (w) said.add(w);
        }
        return said;
    };

    // A SAPLING SAYS NOTHING, all year. This is the case QA named, and the
    // threshold is not invented here: `fruit.bearFrom` is where the shader
    // starts drawing a crop at all.
    expect([...wordsFor(0.2, 1)]).toEqual([]);
    expect([...wordsFor(0.5, 1)]).toEqual([]);
    // A DEAD TREE SAYS NOTHING either, and so does one too far gone to bear.
    expect([...wordsFor(1, 0)]).toEqual([]);
    expect([...wordsFor(1, 0.2)]).toEqual([]);

    // AND A GROWN, HEALTHY TREE IS UNCHANGED, which is the half that would
    // make a fix worse than the bug.
    expect(wordsFor(1, 1).size).toBe(5);
    expect(wordsFor(1, 1).has('Fruit ripe')).toBe(true);
    expect(wordsFor(1, 1).has('In blossom')).toBe(true);
    // A tree that is struggling but still bearing keeps its words: it has
    // fruit on it, so saying so is right. Half a crop is still a crop.
    expect(wordsFor(1, 0.5).has('Fruit ripe')).toBe(true);

    // ---- THE PRODUCT, NOT A SECOND THRESHOLD ---------------------------
    // `bloom` and `size` are AMOUNTS and are scaled by the crop; `ripe` and
    // `drop` are phases of the year and are not. So the thresholds keep
    // meaning "enough to see" rather than gaining a separate rule that could
    // drift from the shader's.
    const august = fruitStageAt(12, apple);
    expect(august.size).toBeGreaterThan(0.02);
    expect(fruitWords(august, true, 0)).toBe('');
    expect(fruitWords(august, true, 0.02 / august.size * 0.9)).toBe('');
    expect(fruitWords(august, true, 1)).toBe('Fruit swelling');
    // Defaulting to a full crop, so a caller asking purely about the calendar
    // still can and every older call site still means what it meant.
    expect(fruitWords(august, true)).toBe(fruitWords(august, true, 1));
});

test('the tree card asks for the crop, or the words drift from the tree again', async () => {
    // The rule lives in `fruitWords`, but it is only true if the card passes
    // the tree in. A default of 1 makes forgetting silent, which is exactly
    // how this shipped: the call read `fruitWords(stage, !!resolved.fruit)`
    // and looked complete.
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'ui.js'), 'utf8');
    expect(src).toMatch(/cropAt\(record\.growth, record\.health\)/);
    expect(src).toMatch(/import \{[^}]*cropAt[^}]*\} from '\.\/garden\.min\.js'/);
});
