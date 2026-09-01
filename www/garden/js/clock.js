// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * clock.js - Fractal Garden's sense of time.
 *
 * EVERY FUNCTION HERE IS PURE. Plain numbers in, plain numbers out, no THREE,
 * no DOM, no storage, and above all no Date.now(). The garden has exactly one
 * piece of mutable time state, `elapsedSeconds`, and main.js owns it; season,
 * year, sun position, thirst, snow, and leaf phenology are all derived from it
 * on demand. That is what lets the whole calendar be tested under Node, where
 * every number read back off a THREE object would be zero.
 *
 * THE SEASONS ARE THE SUN'S OWN HOURS, and this is the idea the scene is built
 * around rather than a shortcut:
 *
 *     spring  (03, 09]   centred on sunrise
 *     summer  (09, 15]   centred on noon
 *     autumn  (15, 21]   centred on sunset
 *     winter  (21, 03]   centred on midnight
 *
 * Each season is centred on a solar event, so warmth and light rise and fall
 * together the way they actually do across a year. It also means winter is
 * always the middle of the night, which is why the sky carries a raised winter
 * light floor rather than a lower one (see config.sky.lighting.winterFloor).
 *
 * One day and night cycle is one in-world YEAR. At the shipped 240 second
 * cycle an in-world hour is 10 seconds and a season is 60.
 *
 * THE INTERVALS ARE HALF-OPEN AND WINTER IS THE ONE THAT WRAPS. Hour 9.0 is
 * the last instant of spring and hour 9.000001 is the first of summer, exactly
 * as the requirements state it. Winter runs from 21 through midnight to 3,
 * which is the interval every off-by-one lands in, so it has its own tests.
 */

import { GARDEN_CONFIG } from './config.min.js';

export const SPRING = 'spring';
export const SUMMER = 'summer';
export const AUTUMN = 'autumn';
export const WINTER = 'winter';

/** Hours in a day. Named because it appears in the wrap arithmetic often
 *  enough that a bare 24 stops being obvious. */
export const HOURS_PER_DAY = 24;

// ---- Time ------------------------------------------------------------------

/**
 * The in-world hour, 0 to 24, from elapsed in-world seconds.
 * Time zero is midnight, in the deepest part of the first winter.
 */
export function hourAt(elapsed, cycle = GARDEN_CONFIG.clock.cycleSeconds) {
    if (!(cycle > 0)) return 0;
    const turns = elapsed / cycle;
    const frac = turns - Math.floor(turns);
    return frac * HOURS_PER_DAY;
}

/** Whole and fractional years since time zero. A tree's age is a subtraction
 *  of two of these, which is why it is a float rather than a count. */
export function yearAt(elapsed, cycle = GARDEN_CONFIG.clock.cycleSeconds) {
    if (!(cycle > 0)) return 0;
    return elapsed / cycle;
}

/**
 * The elapsed value a brand new garden starts from.
 *
 * NOT ZERO, and that is a deliberate choice rather than an offset bug. Hour
 * zero is midnight in the deep of winter, under snow, with the watering window
 * shut, which is a strange place to hand somebody an empty plot and a spade.
 * `clock.startHour` opens a new garden at sunrise in the middle of spring
 * instead.
 *
 * It moves the STARTING point only. Elapsed time is still a duration counted
 * from zero, so ages, growth, and every persisted number are unaffected, and a
 * returning visitor resumes from their own elapsed rather than from here.
 */
export function startSeconds(clock = GARDEN_CONFIG.clock) {
    const hour = wrapHour(clock.startHour || 0);
    return (hour / HOURS_PER_DAY) * clock.cycleSeconds;
}

/** Where in the year an hour sits, 0 at midnight through to 1. Useful for
 *  anything that wants one continuous axis rather than four named seasons. */
export function yearPhaseAt(hour) {
    return wrapHour(hour) / HOURS_PER_DAY;
}

/** Fold any hour, including negative ones and ones past 24, into 0 to 24. */
export function wrapHour(hour) {
    const h = hour % HOURS_PER_DAY;
    return h < 0 ? h + HOURS_PER_DAY : h;
}

// ---- Seasons ---------------------------------------------------------------

/**
 * The season an hour belongs to.
 *
 * Half-open intervals, opening exclusive and closing inclusive, so the
 * boundary hour belongs to the season that is ending. Winter is everything
 * left over, which is what makes the wrap across midnight fall out for free
 * rather than needing its own branch.
 */
export function seasonAt(hour, bounds = GARDEN_CONFIG.season.boundaries) {
    const h = wrapHour(hour);
    if (h > bounds.spring && h <= bounds.summer) return SPRING;
    if (h > bounds.summer && h <= bounds.autumn) return SUMMER;
    if (h > bounds.autumn && h <= bounds.winter) return AUTUMN;
    return WINTER;
}

/**
 * How far through its own season an hour is, from just above 0 at the start to
 * 1 at the closing boundary. Winter measures from its opening boundary and
 * wraps through midnight.
 */
export function seasonPhaseAt(hour, bounds = GARDEN_CONFIG.season.boundaries) {
    const h = wrapHour(hour);
    const season = seasonAt(h, bounds);
    const starts = {
        [SPRING]: bounds.spring,
        [SUMMER]: bounds.summer,
        [AUTUMN]: bounds.autumn,
        [WINTER]: bounds.winter
    };
    const length = HOURS_PER_DAY / 4;
    // Never zero: an hour sitting exactly on an opening boundary belongs to the
    // season that is ENDING, so the smallest `since` any season sees is one
    // tick past its own start and the largest is a full season.
    return wrapHour(h - starts[season]) / length;
}

/** True while the trees are drinking: in-world 07:00 to 17:00, which is the
 *  last third of spring, all of summer, and the first third of autumn. Ten
 *  hours of the twenty four, and all of them in daylight, so the one thing the
 *  visitor is asked to do never happens in the dark. */
export function inThirstWindow(hour, thirst = GARDEN_CONFIG.season.thirst) {
    const h = wrapHour(hour);
    return h > thirst.start && h <= thirst.end;
}

// ---- The sun ---------------------------------------------------------------

/**
 * Where the sun is at a given hour, in degrees.
 *
 * Elevation is a clean sine through the day: zero at 06:00 rising, highest at
 * noon, zero again at 18:00 setting, lowest at midnight. Azimuth sweeps 15
 * degrees an hour, reading 0 due south at noon, -90 due east at sunrise, and
 * +90 due west at sunset.
 *
 * Returned in degrees rather than as a vector because that is the form the
 * light rig, the shadow frustum, and the sky shader all want, and because a
 * vector would tempt somebody into building it with THREE and losing the
 * ability to assert it.
 */
export function solarAt(hour, sun = GARDEN_CONFIG.sun) {
    const h = wrapHour(hour);
    const elevation = sun.maxElevation * Math.sin((h - 6) * Math.PI / 12);
    const azimuth = (h - 12) * 15;
    return { elevation, azimuth };
}

/** The moon, which is simply the sun's opposite number. Its elevation is the
 *  sun's negated, so it is highest at midnight, which in this garden is the
 *  middle of winter and the reason winter can be lit at all. */
export function lunarAt(hour, sun = GARDEN_CONFIG.sun) {
    const solar = solarAt(hour, sun);
    return { elevation: -solar.elevation, azimuth: solar.azimuth + 180 };
}

// ---- Snow ------------------------------------------------------------------

/**
 * Ground snow coverage, 0 to 1, for an hour.
 *
 * Falls, holds, and melts entirely inside winter and the first hours of
 * spring, measured on a "winter clock" that starts at the season's opening
 * boundary so the wrap through midnight needs no special case:
 *
 *     22:30  first flakes          01:30  fully accumulated
 *     03:00  hold ends             05:00  melted
 *
 * MONOTONIC BY CONSTRUCTION on each side, which matters more than it sounds:
 * a coverage value that could tick backwards mid-accumulation would show up as
 * snow flickering off the ground, and it is the kind of thing that only
 * appears at one particular hour. The smoothstep eases the two ends without
 * ever reversing.
 */
export function snowCoverageAt(hour, season = GARDEN_CONFIG.season) {
    const snow = season.snow;
    const start = season.boundaries.winter;
    const w = wrapHour(hour - start);
    const at = (h) => wrapHour(h - start);

    const flakes = at(snow.firstFlakes);
    const full = at(snow.accumulatedBy);
    const holdEnd = at(snow.holdUntil);
    const melted = at(snow.meltBy);

    if (w < flakes) return 0;
    if (w < full) return smoothstep((w - flakes) / (full - flakes));
    if (w < holdEnd) return 1;
    if (w < melted) return 1 - smoothstep((w - holdEnd) / (melted - holdEnd));
    return 0;
}

/** True while flakes are actually in the air, which is a shorter window than
 *  the one where snow is on the ground. */
export function isSnowingAt(hour, season = GARDEN_CONFIG.season) {
    const snow = season.snow;
    const start = season.boundaries.winter;
    const w = wrapHour(hour - start);
    return w >= wrapHour(snow.firstFlakes - start) && w < wrapHour(snow.holdUntil - start);
}

// ---- Leaves ----------------------------------------------------------------

/**
 * What the leaves are doing at a given hour.
 *
 *   bud   0 to 1  how far bud break has come along
 *   leaf  0 to 1  leaf expansion, 0 nothing showing and 1 full size
 *   color 0 to 1  0 summer green, 1 full autumn colour
 *   drop  0 to 1  fraction of the canopy already on the ground
 *
 * An evergreen holds a full canopy all year and only desaturates a little in
 * the cold, so it takes the same shape of answer with a much duller story.
 *
 * The four numbers are deliberately independent rather than one "stage", so a
 * tree recovering from neglect can carry buds in November without the rest of
 * the schedule having to agree. See the bud reward in garden.js (M5-7).
 */
export function phenologyAt(hour, evergreen = false, season = GARDEN_CONFIG.season) {
    const h = wrapHour(hour);
    const p = season.phenology;

    if (evergreen) {
        // Coldest at midnight, which is midwinter. A little colour loss and
        // nothing else.
        const cold = Math.max(0, -Math.sin((h - 6) * Math.PI / 12));
        return { bud: 0, leaf: 1, color: cold * p.evergreenWinterFade, drop: 0 };
    }

    // Winter: bare. Checked first because it is the interval that wraps.
    if (h > p.dropEnd || h <= p.budStart) {
        return { bud: 0, leaf: 0, color: 1, drop: 1 };
    }
    // Bud break.
    if (h <= p.budEnd) {
        const t = (h - p.budStart) / (p.budEnd - p.budStart);
        return { bud: smoothstep(t), leaf: t * p.budLeafSize, color: 0, drop: 0 };
    }
    // Expansion to full size.
    if (h <= p.expandEnd) {
        const t = (h - p.budEnd) / (p.expandEnd - p.budEnd);
        return { bud: 1, leaf: p.budLeafSize + (1 - p.budLeafSize) * smoothstep(t), color: 0, drop: 0 };
    }
    // High summer.
    if (h <= p.turnStart) {
        return { bud: 1, leaf: 1, color: 0, drop: 0 };
    }
    // The turn.
    if (h <= p.turnEnd) {
        const t = (h - p.turnStart) / (p.turnEnd - p.turnStart);
        return { bud: 1, leaf: 1, color: smoothstep(t), drop: 0 };
    }
    // The fall. Colour is already full, and the canopy empties.
    const t = (h - p.dropStart) / (p.dropEnd - p.dropStart);
    return { bud: 1, leaf: 1, color: 1, drop: smoothstep(clamp01(t)) };
}

// ---- Fruit and blossom (pure) ----------------------------------------------

/**
 * Where a fruit tree is in its year: blossom, fruit size, ripeness, and drop.
 *
 * A SIBLING OF `phenologyAt`, ON THE SAME CLOCK AND IN THE SAME UNITS. The
 * garden's day is its year, so every key below is an hour, and blossom and leaf
 * are two SEPARATE schedules over those hours. That separation is the whole
 * reason the cherry is worth having: it blooms at hour 4.5, which is an hour and
 * a half before leaf bud break at `phenology.budEnd`, so a cherry in this garden
 * flowers on BARE WOOD with sky showing through it, which is the thing people
 * actually adore about cherry blossom. An apple flowers at 7.0 into a canopy
 * that is already greening. Same machinery, and they look nothing alike.
 *
 * EVERYTHING IS MEASURED FROM `bloomStart`, WHICH IS WHAT RETIRES THE WRAP. The
 * orange holds ripe fruit from hour 20 to hour 2.5, straight through midwinter,
 * and expressed in absolute hours that interval runs backwards and every
 * comparison in here would need a special case. Rebased on the tree's own year
 * it is monotonic, so there is one code path and the orange is not a branch.
 *
 * WHAT IS CONTINUOUS IS WHAT IS DRAWN, and that is the property to test rather
 * than each field on its own. `size` steps to zero the moment the last fruit has
 * fallen and `drop` resets at the turn of the tree's year, but `drop` is already
 * 1 at the first of those and `size` is already 0 at the second, so the drawn
 * quantity, `size` against the un-fallen share, never jumps. Asserting the four
 * fields are individually continuous would be asserting something false about a
 * tree that is empty either side of the boundary.
 *
 * @param {number} hour     in-world hour, 0 to 24
 * @param {object} schedule the species' own key hours
 * @param {object} shape    shared tuning, config.garden.fruit
 * @returns {{bloom:number, size:number, ripe:number, drop:number}}
 */
export function fruitStageAt(hour, schedule, shape = GARDEN_CONFIG.garden.fruit) {
    if (!schedule) return { bloom: 0, size: 0, ripe: 0, drop: 1 };

    // Rebased on this tree's own year. `at` is monotonically increasing across
    // the schedule by construction, because the keys are written in order.
    const at = (h) => wrapHour(h - schedule.bloomStart);
    const t = at(hour);

    const bloomFull = at(schedule.bloomFull);
    const bloomFade = at(schedule.bloomFade);
    const bloomEnd = at(schedule.bloomEnd);
    const setEnd = at(schedule.setEnd);
    const swellEnd = at(schedule.swellEnd);
    const ripenEnd = at(schedule.ripenEnd);
    const holdEnd = at(schedule.holdEnd);
    const dropEnd = at(schedule.dropEnd);

    // ---- Blossom: opens, holds, falls -------------------------------------
    let bloom = 0;
    if (t < bloomFull) bloom = smoothstep(t / bloomFull);
    else if (t < bloomFade) bloom = 1;
    else if (t < bloomEnd) bloom = 1 - smoothstep((t - bloomFade) / (bloomEnd - bloomFade));

    // A BLOSSOM-ONLY SPECIES IS A REAL CASE, not a degenerate one. The
    // Flowering Dogwood has been carrying a `blossom` colour since M2 with
    // nothing to draw it, and its own note in the plant modal calls it "the only
    // tree here that blossoms". It flowers here and sets nothing, and the
    // schedule says so by simply having no fruit keys.
    if (schedule.dropEnd == null) return { bloom, size: 0, ripe: 0, drop: 1 };

    // ---- Fruit: set small, swell, then hold full --------------------------
    // TWO SEGMENTS, NOT ONE, and the first is why. Newly set fruit is small and
    // sparse rather than absent, so a single ramp from nothing to full over six
    // hours would spend the whole of high summer at a size that reads as an
    // artefact. It rises quickly to `setSize` and then grows.
    let size = 0;
    if (t >= bloomEnd && t < setEnd) {
        size = shape.setSize * smoothstep((t - bloomEnd) / (setEnd - bloomEnd));
    } else if (t >= setEnd && t < dropEnd) {
        size = shape.setSize + (1 - shape.setSize)
            * smoothstep(Math.min(1, (t - setEnd) / (swellEnd - setEnd)));
    }

    // ---- Ripeness: a colour, and it keeps its value while the fruit hangs --
    let ripe = 0;
    if (t >= swellEnd && t < dropEnd) {
        ripe = smoothstep(Math.min(1, (t - swellEnd) / (ripenEnd - swellEnd)));
    }

    // ---- The drop, which the shader stages per fruit against aDrop ---------
    let drop = 0;
    if (t >= holdEnd && t < dropEnd) drop = smoothstep((t - holdEnd) / (dropEnd - holdEnd));
    else if (t >= dropEnd) drop = 1;

    return { bloom, size, ripe, drop };
}

/**
 * The hour a species looks its best, for the chooser's preview.
 *
 * THE SCHEDULE DECIDES, NOT A CONSTANT. The plant modal is showing what a
 * visitor will eventually have, and for the six that flower that means fruit on
 * the branches: an apple tree in the list should be carrying red apples and an
 * orange tree oranges. Picking the moment off the tree's OWN schedule means the
 * preview cannot promise something the tree will not do, which a hand-picked
 * hour or a hand-built stage object both could.
 *
 * A tree that fruits shows FULL RIPE FRUIT, taken from the middle of the hold:
 * ripening has finished by `ripenEnd` and nothing has fallen before `holdEnd`.
 * One that only flowers, which is the Flowering Dogwood, shows FULL BLOSSOM,
 * from the middle of `bloomFull` to `bloomFade`.
 *
 * Everything is rebased on `bloomStart` before the midpoint is taken and
 * wrapped back afterwards, because these windows cross midnight: the lemon
 * holds from hour 18 round to 6 and the orange from 20 to 2.5, and a plain
 * average of those two numbers lands in the middle of the wrong season.
 */
export function showcaseHour(schedule) {
    if (!schedule) return 12;
    const at = (h) => wrapHour(h - schedule.bloomStart);
    const mid = schedule.dropEnd == null
        ? (at(schedule.bloomFull) + at(schedule.bloomFade)) / 2
        : (at(schedule.ripenEnd) + at(schedule.holdEnd)) / 2;
    return wrapHour(schedule.bloomStart + mid);
}

/**
 * What the tree is doing, in words, for the tree card.
 *
 * COLOUR IS NEVER THE ONLY CARRIER of what anything in this scene is doing, the
 * same rule `HEALTH_WORDS` and `sliderWords` already follow, so a visitor who
 * cannot see an orange pixel is still told there is ripe fruit on the tree.
 *
 * ---- IT HAS TO DESCRIBE THIS TREE, NOT THE SPECIES (QA 2026-08-31) ----
 *
 * QA: "it will say things like Fruit swelling or that the fruit is ripe even
 * for saplings without fruit, or dead trees which also don't have fruit."
 * Correct, and the reason is a clean split that this function sat on the wrong
 * side of. `fruitStageAt` is a function of the CALENDAR and the species
 * schedule alone: it says what an apple tree is doing in August, and every
 * apple tree in the plot gets the same answer whether it is a twig, a
 * full-grown tree or a dead one.
 *
 * What decides whether a PARTICULAR tree carries anything is `cropAt(growth,
 * health)`, and the renderer has always used it: `viewFor` puts it in `crop`
 * and the shader multiplies the blossom and the fruit by it, so a sapling under
 * `bearFrom` and a tree under `cropFrom` draw nothing at all. The card was
 * reading the calendar and the tree was reading the crop, so the words
 * described fruit that was never on screen.
 *
 * SO THE WORDS TAKE THE SAME PRODUCT THE SHADER DOES. `bloom` and `size` are
 * amounts and are scaled; `ripe` and `drop` are phases of the year and are not.
 * The thresholds now mean "enough to see" rather than "in season", which is
 * what they always read as.
 *
 * @param {number} crop 0 to 1, from `cropAt(growth, health)`. Defaults to 1,
 *   so a caller asking purely about the calendar still can.
 */
export function fruitWords(stage, hasFruit = true, crop = 1) {
    if (!stage) return '';
    if (stage.bloom * crop > 0.15) return 'In blossom';
    if (!hasFruit) return '';
    if (stage.drop >= 1 || stage.size * crop <= 0.02) return '';
    if (stage.drop > 0.05) return 'Dropping its fruit';
    if (stage.ripe > 0.85) return 'Fruit ripe';
    if (stage.ripe > 0.05) return 'Fruit ripening';
    return 'Fruit swelling';
}

// ---- Small shared helpers --------------------------------------------------

export function clamp01(t) {
    return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/** The usual 3t^2 - 2t^3 ease, clamped. Monotonic on 0 to 1, which is the
 *  property the snow and phenology ramps depend on. */
export function smoothstep(t) {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
}
