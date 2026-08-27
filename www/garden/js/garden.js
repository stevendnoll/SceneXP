// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * garden.js - The garden itself: what is planted, how it grows, and what it
 * needs.
 *
 * The rules are pure functions over plain numbers. The array of trees and the
 * meshes they own are the only mutable state, and persistence sits at the edge
 * as two pure functions the conductor hands to storage.
 *
 * ---- GROWTH IS INTEGRATED, NOT COMPUTED FROM AGE ----
 *
 * The obvious design reads a tree's growth off its age. It is wrong here,
 * because a neglected tree has to STALL: two trees planted in the same minute,
 * one watered and one not, must not be the same size. So `growth` is stored on
 * the record and advanced each frame at a rate scaled by health, and `age` is
 * kept alongside purely to tell the visitor how old the tree is. The two
 * diverge, and that divergence is the point.
 *
 * ---- THE WATER MODEL IS TWO NUMBERS, AND THEY DO DIFFERENT JOBS ----
 *
 *   moisture  drains only inside the thirst window, and one watering lasts
 *             exactly one window. This is the rhythm the visitor feels.
 *   health    falls only while moisture is zero AND the window is open, at
 *             1/6 per fully dry year. This is the consequence, and it is slow.
 *
 * Three dry summers reaches 0.5 and the wilt begins. Six reaches 0 and the
 * tree looks dead. It is never actually dead: watering it puts buds back on
 * the branches within a second and a half, in any season.
 */

import { GARDEN_CONFIG } from './config.min.js';
import {
    hourAt, inThirstWindow, phenologyAt, seasonAt, clamp01
} from './clock.min.js';
import { resolveSpecies, clampCustom, speciesById, newSeed, DEFAULT_CUSTOM } from './species.min.js';
import { createTree, updateTree, disposeTree } from './tree.min.js';
import { heightAt, cellCenter, cellKey, cellInPlot } from './terrain.min.js';
import { initBeds, syncBeds, updateBeds, disposeBeds } from './beds.min.js';

// ---- Derived constants (pure) ----------------------------------------------

/** How many real seconds the thirst window lasts, per year. Everything about
 *  water is expressed against this, so changing the cycle length or the window
 *  retimes the whole care loop consistently. */
export function thirstSecondsPerYear(config = GARDEN_CONFIG) {
    const t = config.season.thirst;
    return (t.end - t.start) * (config.clock.cycleSeconds / 24);
}

// ---- The rules (pure) ------------------------------------------------------

/** How fast a tree grows, as a fraction of the way to maturity per second.
 *  Zero once health has fallen far enough: a failing tree stops rather than
 *  creeping, and it never shrinks. */
export function growthRate(health, config = GARDEN_CONFIG) {
    const G = config.garden;
    if (health < G.minGrowthHealth) return 0;
    const perSecond = 1 / (G.maturityYears * config.clock.cycleSeconds);
    // THE CURVE MATTERS MORE THAN THE FLOOR. A first version used a straight
    // line from 0.35 to 1, which left a tree at health 0.17 still growing at
    // nearly half speed, so six years of total neglect still produced a full
    // sized tree. It was merely a grey one. Putting health on a power curve
    // means a struggling tree visibly stalls, which is the whole point of
    // coupling growth to health in the first place.
    const h = clamp01(health);
    return perSecond * (0.15 + 0.85 * Math.pow(h, 1.5));
}

/** Moisture after a step. Drains only inside the thirst window; rain fills at
 *  any hour, because rain does not check a calendar. */
export function moistureAfter(moisture, dt, hour, rainRate = 0, config = GARDEN_CONFIG) {
    const M = config.garden.moisture;
    let m = moisture;
    if (inThirstWindow(hour, config.season.thirst)) {
        m -= dt / (thirstSecondsPerYear(config) * M.windowsPerFill);
    }
    if (rainRate > 0) m += rainRate * M.rainFill * dt;
    return clamp01(m);
}

/** Health after a step. Falls only while dry AND thirsty, recovers only while
 *  watered AND thirsty, and is untouched the rest of the year. Winter cannot
 *  hurt a tree here, and it cannot heal one either. */
export function healthAfter(health, moisture, dt, hour, config = GARDEN_CONFIG) {
    const H = config.garden.health;
    if (!inThirstWindow(hour, config.season.thirst)) return clamp01(health);
    const perSecond = 1 / thirstSecondsPerYear(config);
    if (moisture <= 0) return clamp01(health - H.dryPerYear * perSecond * dt);
    return clamp01(health + H.recoverPerYear * perSecond * dt);
}

/** The four bands, in words, because colour is never the only carrier. */
export function healthBand(health) {
    const H = GARDEN_CONFIG.garden.health;
    if (health <= H.bareBelow) return 'bare';
    if (health <= H.failingBelow) return 'failing';
    if (health <= H.wiltBelow) return 'wilting';
    return 'healthy';
}

export const HEALTH_WORDS = {
    healthy: 'Doing well',
    wilting: 'Starting to wilt',
    failing: 'Struggling badly',
    bare: 'Bare, but not gone'
};

export function needsWater(moisture, config = GARDEN_CONFIG) {
    return moisture < config.garden.moisture.thirstyBelow;
}

/**
 * How much of the canopy is on the ground, taking the season and the tree's
 * health together.
 *
 * A failing tree sheds out of season, which is most of how neglect READS
 * before the colour changes are obvious. The scaling lines up with the bands:
 * nothing extra at the wilt threshold, half the canopy at "failing", and bare
 * at zero health.
 */
export function dropFor(phenologyDrop, health) {
    const H = GARDEN_CONFIG.garden.health;
    const fromHealth = clamp01((H.wiltBelow - health) / H.wiltBelow);
    return Math.max(phenologyDrop, fromHealth);
}

/**
 * Everything a tree's shaders need for one frame.
 *
 * Pure, so what a tree looks like at a given moment can be asserted without a
 * renderer: "a healthy maple at noon in year three is in full leaf", "a tree
 * at zero health is bare in every season", "a watered bare tree carries buds".
 */
export function viewFor(record, hour, options = {}) {
    const evergreen = options.evergreen === true;
    const phen = phenologyAt(hour, evergreen);
    const health = clamp01(record.health);
    const drop = dropFor(phen.drop, health);

    return {
        growth: clamp01(record.growth),
        health,
        // A struggling canopy is thin as well as dull.
        leaf: phen.leaf * (0.4 + 0.6 * health),
        color: phen.color,
        // New leaves come in pale and yellow-green before they deepen.
        spring: phen.color > 0 ? 0 : clamp01(1 - phen.leaf),
        drop,
        bud: clamp01(record.bud || 0),
        snow: options.snow || 0,
        wind: options.wind || { x: 0, z: 0 },
        time: options.time || 0,
        // Reduced motion damps the sway rather than removing it, because in
        // this scene the movement is the content. Absent means full motion.
        motion: options.motion === undefined ? 1 : options.motion
    };
}

// ---- Records ---------------------------------------------------------------

let nextId = 1;

/**
 * The growth a newly planted tree starts at.
 *
 * DERIVED FROM THE AGE RATHER THAN WRITTEN DOWN, so the two numbers cannot
 * drift: growth advances at exactly `1 / maturityYears` per year at full
 * health, so an age is a growth. See `config.garden.plantAgeYears`.
 */
export function plantingGrowth(config = GARDEN_CONFIG) {
    const G = config.garden;
    return clamp01((G.plantAgeYears || 0) / G.maturityYears);
}

export function createRecord(speciesId, custom, gx, gz, plantedAt, seed) {
    return {
        id: `t${nextId++}`,
        species: speciesId,
        seed: seed >>> 0,
        gx, gz,
        custom: clampCustom(custom),
        plantedAt,
        // ONLY THIS FIELD STARTS FORWARD. Everything below it starts where a
        // brand new tree starts, because `plantedAt` drives the decline
        // schedule and backdating that would plant a thirsty tree.
        growth: plantingGrowth(),
        moisture: 1,
        health: 1,
        bud: 0,
        budActive: false,
        lastWateredAt: plantedAt
    };
}

// ---- Persistence (pure) ----------------------------------------------------

export function serialize(records, elapsedSeconds, config = GARDEN_CONFIG) {
    return {
        v: config.storage.schema,
        elapsedSeconds: round(elapsedSeconds, 2),
        trees: records.map((r) => ({
            id: r.id,
            species: r.species,
            seed: r.seed,
            gx: r.gx,
            gz: r.gz,
            custom: r.custom,
            plantedAt: round(r.plantedAt, 2),
            growth: round(r.growth, 4),
            moisture: round(r.moisture, 4),
            health: round(r.health, 4),
            lastWateredAt: round(r.lastWateredAt, 2)
        }))
    };
}

/**
 * Read a saved garden back, dropping anything that does not survive
 * inspection.
 *
 * A BAD TREE IS DROPPED ON ITS OWN rather than taking the garden with it. A
 * garden lost to a schema change is bad; a garden silently rendered wrong is
 * worse; a garden thrown away because one record had a NaN in it is just
 * careless. An unrecognised `v` IS discarded whole, because guessing at the
 * shape of an unknown schema is the one case where being conservative is
 * right.
 */
export function hydrate(raw, config = GARDEN_CONFIG) {
    // `restored` is what tells the conductor apart a garden that was read from
    // one that was never there. Both come back empty, but only the second
    // should open at the fresh-garden start hour.
    const empty = { elapsedSeconds: 0, trees: [], dropped: 0, restored: false };
    if (!raw || typeof raw !== 'object') return empty;
    if (raw.v !== config.storage.schema) return empty;

    const elapsed = Number.isFinite(raw.elapsedSeconds) && raw.elapsedSeconds >= 0
        ? raw.elapsedSeconds : 0;
    const list = Array.isArray(raw.trees) ? raw.trees : [];
    const trees = [];
    const seen = new Set();
    let dropped = 0;

    for (const t of list) {
        if (trees.length >= config.plot.maxTrees) { dropped++; continue; }
        if (!t || typeof t !== 'object') { dropped++; continue; }
        if (!speciesById(t.species)) { dropped++; continue; }
        if (!Number.isFinite(t.seed)) { dropped++; continue; }
        if (!Number.isInteger(t.gx) || !Number.isInteger(t.gz)) { dropped++; continue; }
        if (!cellInPlot(t.gx, t.gz, config)) { dropped++; continue; }
        const key = cellKey(t.gx, t.gz);
        if (seen.has(key)) { dropped++; continue; }
        seen.add(key);

        trees.push({
            id: typeof t.id === 'string' && t.id ? t.id : `t${nextId++}`,
            species: t.species,
            seed: t.seed >>> 0,
            gx: t.gx,
            gz: t.gz,
            custom: clampCustom(t.custom),
            plantedAt: finite(t.plantedAt, 0),
            growth: clamp01(finite(t.growth, 0)),
            moisture: clamp01(finite(t.moisture, 1)),
            health: clamp01(finite(t.health, 1)),
            bud: 0,
            budActive: false,
            lastWateredAt: finite(t.lastWateredAt, 0)
        });
    }

    // Keep the id counter ahead of anything restored, or a new tree planted in
    // this session could collide with a saved one.
    for (const t of trees) {
        const n = parseInt(String(t.id).slice(1), 10);
        if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
    }

    return { elapsedSeconds: elapsed, trees, dropped, restored: true };
}

function finite(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
}

function round(v, places) {
    const f = Math.pow(10, places);
    return Math.round(v * f) / f;
}

// ---- The living garden -----------------------------------------------------

const trees = [];          // { record, resolved, tree }
const occupied = new Set();
let sceneRef = null;
let optionsRef = { mobile: false };

export function initGarden(scene, options = {}) {
    initBeds(scene, GARDEN_CONFIG, options);
    sceneRef = scene;
    optionsRef = options;
}

export function getTrees() {
    return trees;
}

export function getOccupied() {
    return occupied;
}

export function isFull(config = GARDEN_CONFIG) {
    return trees.length >= capacity(config);
}

export function capacity(config = GARDEN_CONFIG) {
    return optionsRef.mobile ? config.plot.maxTreesMobile : config.plot.maxTrees;
}

/** Build the meshes for a record and stand it on the ground. */
function materialise(record) {
    const resolved = resolveSpecies(record.species, record.custom);
    const built = createTree(resolved, record.seed, optionsRef);
    const { x, z } = cellCenter(record.gx, record.gz);
    built.group.position.set(x, heightAt(x, z), z);
    if (sceneRef) sceneRef.add(built.group);
    const entry = { record, resolved, tree: built };
    trees.push(entry);
    occupied.add(cellKey(record.gx, record.gz));
    // The beds are one instanced mesh, so the whole buffer is rebuilt whenever
    // the list changes. Never per frame: a bed does not move once it is laid,
    // and the level's fill rides an attribute rather than a matrix.
    syncBeds(trees, GARDEN_CONFIG);
    return entry;
}

/**
 * How tall a tree is right now, in metres.
 *
 * THE ONE STATEMENT OF A TREE'S HEIGHT, and the same curve the bark shader
 * uses for `uScale`. It was written to float the thirst marker above a canopy
 * rather than above the tree the canopy will eventually be; that marker is
 * gone (M10-5) and this outlived it, because the question "how big is this
 * thing actually" is what M10-1 is about and a test that recomputed the curve
 * would only be restating the code it was checking.
 */
export function currentHeight(record, resolved, config = GARDEN_CONFIG) {
    const T = config.tree;
    const g = clamp01(record.growth);
    const ease = g * g * (3 - 2 * g);
    return resolved.matureHeight * (T.saplingScale + (1 - T.saplingScale) * ease);
}

export function plantTree(speciesId, custom, gx, gz, elapsedSeconds, random = Math.random) {
    if (isFull()) return null;
    if (!speciesById(speciesId)) return null;
    if (!cellInPlot(gx, gz)) return null;
    if (occupied.has(cellKey(gx, gz))) return null;
    const record = createRecord(speciesId, custom || DEFAULT_CUSTOM, gx, gz,
        elapsedSeconds, newSeed(random));
    return materialise(record);
}

export function restoreTrees(records) {
    for (const record of records) materialise(record);
    return trees.length;
}

export function removeTree(entry) {
    const i = trees.indexOf(entry);
    if (i < 0) return false;
    trees.splice(i, 1);
    occupied.delete(cellKey(entry.record.gx, entry.record.gz));
    if (sceneRef) sceneRef.remove(entry.tree.group);
    disposeTree(entry.tree);
    syncBeds(trees, GARDEN_CONFIG);
    return true;
}

export function clearGarden() {
    while (trees.length) removeTree(trees[trees.length - 1]);
    nextId = 1;
}

/** Teardown, paired with initGarden. The beds are built in there, so they come
 *  down from here rather than leaving main.js to know they exist. */
export function disposeGarden() {
    clearGarden();
    disposeBeds();
    sceneRef = null;
}

/**
 * Water a tree.
 *
 * Returns 'revived' when the watering earned the bud reward, 'refreshed'
 * otherwise, so the conductor can pitch the acknowledgement to match. A
 * healthy tree gets something quiet; a bare one gets buds within a second and
 * a half, in any season.
 */
export function waterTree(entry, elapsedSeconds, config = GARDEN_CONFIG) {
    const r = entry.record;
    const revived = r.health <= config.garden.bud.below;
    r.moisture = 1;
    r.lastWateredAt = elapsedSeconds;
    if (revived) {
        r.budActive = true;
        r.budStartedAt = elapsedSeconds;
    }
    return revived ? 'revived' : 'refreshed';
}

/** Every tree, one frame. */
export function updateGarden(dt, elapsedSeconds, context = {}, config = GARDEN_CONFIG) {
    const hour = hourAt(elapsedSeconds, config.clock.cycleSeconds);
    const rain = context.rain || 0;
    const snow = context.snow || 0;
    const wind = context.wind || { x: 0, z: 0 };
    const B = config.garden.bud;

    for (const entry of trees) {
        const r = entry.record;

        r.moisture = moistureAfter(r.moisture, dt, hour, rain, config);
        r.health = healthAfter(r.health, r.moisture, dt, hour, config);
        r.growth = clamp01(r.growth + growthRate(r.health, config) * dt);

        // The bud reward: up over riseSeconds, then held until the season
        // produces enough real canopy to take over. In autumn and winter that
        // never happens, so the buds stay on the branches as a promise.
        if (r.budActive) {
            const since = elapsedSeconds - (r.budStartedAt || elapsedSeconds);
            r.bud = clamp01(since / B.riseSeconds);
            const natural = phenologyAt(hour, entry.resolved.evergreen).leaf;
            if (natural >= B.handoverLeaf) {
                r.budActive = false;
            }
        } else if (r.bud > 0) {
            r.bud = Math.max(0, r.bud - dt * 0.8);
        }

        updateTree(entry.tree, viewFor(r, hour, {
            evergreen: entry.resolved.evergreen,
            snow,
            wind,
            // The animation clock when the conductor supplies one, so a tree
            // can sway while the calendar is held. Falls back to the calendar,
            // which is what every caller without a welcome card to wait on
            // wants.
            time: context.time === undefined ? elapsedSeconds : context.time
        }), entry.resolved);

    }

    // The beds take the season and the levels take each tree's tank. One pass
    // over the instance attributes rather than a mesh per tree. The level's
    // pixel floor needs the lens, which only the conductor knows.
    updateBeds(trees, snow, context.pxPerRadian || 0, config);
}

/** Ages in whole years, for the tree card. */
export function ageYears(record, elapsedSeconds, config = GARDEN_CONFIG) {
    return Math.max(0, (elapsedSeconds - record.plantedAt) / config.clock.cycleSeconds);
}

/** The meshes a tap can hit, for the raycaster. */
export function getPickTargets() {
    return trees.map((t) => t.tree.group);
}

export function seasonNow(elapsedSeconds, config = GARDEN_CONFIG) {
    return seasonAt(hourAt(elapsedSeconds, config.clock.cycleSeconds));
}

export function __resetGarden() {
    trees.length = 0;
    occupied.clear();
    sceneRef = null;
    nextId = 1;
}
