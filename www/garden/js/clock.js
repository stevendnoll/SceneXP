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
