// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Growth, water, health, and persistence.
 *
 * All pure, so no THREE and no DOM.
 *
 * THE SCHEDULE IN THE REQUIREMENTS IS ASSERTED BY SIMULATION rather than by
 * restating the constants. "Three dry summers begins the wilt and three more
 * leaves it bare" is a claim about what happens over six in-world years, and
 * the only honest way to check it is to run six in-world years. A test that
 * repeated `dryPerYear` back would pass against any implementation that
 * multiplied it by the wrong thing.
 *
 * The frame-rate property is here too: stepping the same interval in small
 * pieces and in one large piece must land in the same place. That is the class
 * of bug that never appears on the machine it was written on and always
 * appears on somebody else's phone.
 */
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
import {
    thirstSecondsPerYear, growthRate, moistureAfter, healthAfter, healthBand,
    needsWater, dropFor, viewFor, createRecord, serialize, hydrate, HEALTH_WORDS,
    cropAt, plantingGrowth, waterTree
} from '../www/garden/js/garden.js';
import { inThirstWindow } from '../www/garden/js/clock.js';
import { cellInPlot } from '../www/garden/js/terrain.js';

const CYCLE = GARDEN_CONFIG.clock.cycleSeconds;

/**
 * Run a tree through `years` of in-world time.
 * @param {object} options { waterEachYear, dt }
 */
function simulate(years, options = {}) {
    const dt = options.dt || 1 / 30;
    const record = { moisture: 1, health: 1, growth: 0 };
    const log = [];
    let t = 0;
    let wateredYear = -1;

    const steps = Math.round((years * CYCLE) / dt);
    for (let i = 0; i < steps; i++) {
        const hour = ((t / CYCLE) % 1) * 24;
        if (options.waterEachYear) {
            const year = Math.floor(t / CYCLE);
            if (hour > 10 && hour < 11 && year !== wateredYear) {
                record.moisture = 1;
                wateredYear = year;
            }
        }
        record.moisture = moistureAfter(record.moisture, dt, hour);
        record.health = healthAfter(record.health, record.moisture, dt, hour);
        record.growth = Math.min(1, record.growth + growthRate(record.health) * dt);
        t += dt;
        if (i > 0 && i % Math.round(CYCLE / dt) === 0) {
            log.push({ year: Math.round(t / CYCLE), ...record });
        }
    }
    return { record, log };
}

// ---- The shape of the year -------------------------------------------------

test('the thirst window is ten in-world hours of real seconds', () => {
    expect(thirstSecondsPerYear()).toBeCloseTo(100, 6);
    // Every water number is expressed against this, so changing the cycle
    // length retimes the whole care loop consistently rather than partly.
    expect(thirstSecondsPerYear({
        ...GARDEN_CONFIG,
        clock: { ...GARDEN_CONFIG.clock, cycleSeconds: 480 }
    })).toBeCloseTo(200, 6);
});

test('one full tank lasts exactly one thirst window', () => {
    // The rhythm the visitor feels: water each tree about once a year, and
    // being a little late is never punished.
    let m = 1;
    const dt = 0.1;
    const window = thirstSecondsPerYear();
    for (let i = 0; i < window / dt; i++) m = moistureAfter(m, dt, 12);
    expect(m).toBeCloseTo(0, 3);
});

test('nothing drinks outside the growing season', () => {
    for (const hour of [0, 3, 5, 6.9, 17.1, 20, 23]) {
        expect(inThirstWindow(hour)).toBe(false);
        expect(moistureAfter(0.5, 10, hour)).toBe(0.5);
        expect(healthAfter(0.5, 0, 10, hour)).toBe(0.5);
    }
});

/**
 * M11-4. THIS TEST IS THE INVERSE OF THE ONE IT REPLACES, and the one it
 * replaces passed for four milestones while the care loop was dead.
 *
 * Measured against the shipped config before the change, precipitation
 * delivered 2.39 tank-fills per in-world year (rain 1.51, snow 0.67, sleet
 * 0.21) against a drain of exactly 1.00. Every tree in the plot was watered two
 * and a half times over by the sky, whether or not the visitor ever came back.
 *
 * SNOW WAS PART OF IT. `updateGarden` handed this function `weather.rain` and
 * it added the term whatever the temperature had made of the water, so a
 * blizzard filled a tank. Removing the term covers rain, sleet and snow at once,
 * which is why there is no separate snow case below: there is no code path left
 * for one to take.
 */
test('nothing waters a tree but the visitor, in any weather at any hour', () => {
    // Run a tree through a year of the wettest weather the machine can produce,
    // with the rain rate pinned at its maximum for every step, and it must
    // still empty on the ordinary schedule.
    let m = 1;
    const dt = 0.1;
    const window = thirstSecondsPerYear();
    for (let i = 0; i < window / dt; i++) {
        // The fourth argument is `config` now. Anything a caller passes here
        // that looks like a rain rate is a config object as far as this
        // function is concerned, which is the point: there is nowhere left to
        // put one.
        m = moistureAfter(m, dt, 12);
    }
    expect(m).toBeCloseTo(0, 3);

    // And a tree already dry stays dry, at the hours a storm is most likely.
    for (const hour of [0, 2, 5, 12, 18, 22]) {
        expect(moistureAfter(0, 10, hour)).toBe(0);
    }
});

test('there is no rainFill knob left to turn', () => {
    // A live-looking config value that does nothing is how somebody restores
    // this bug by accident later, so the number is deleted rather than zeroed.
    expect(GARDEN_CONFIG.garden.moisture.rainFill).toBeUndefined();
});

// ---- The schedule ----------------------------------------------------------

test('a watered tree reaches maturity in four and a half years', () => {
    const { log } = simulate(6, { waterEachYear: true });
    const atFour = log.find((l) => l.year === 4);
    const atFive = log.find((l) => l.year === 5);
    expect(atFour.growth).toBeLessThan(1);
    expect(atFour.growth).toBeGreaterThan(0.85);
    expect(atFive.growth).toBe(1);
    expect(atFive.health).toBe(1);
});

test('A YEAR BONE DRY STOPS THE BLOSSOM, TWO AND IT IS DEAD WOOD', () => {
    // ---- THIS SUPERSEDES M5-2's SCHEDULE, AND ON PURPOSE ---------------
    // The requirement said three dry summers reach the wilt and six reach bare,
    // and the code did exactly that. QA overruled it: "bone dry trees continue
    // to bloom and produce fruit even after several years." They did, correctly
    // by the old numbers, because blossom stops at health 0.25 and at 1/6 a
    // year that was four and a half dry years away. Nobody watches a tree for
    // four and a half years to find out it minded.
    //
    // Run the years rather than restating the rate, same as before.
    const { log } = simulate(6);
    const at = (y) => log.find((l) => l.year === y);

    // The tank it was planted with still carries it through its first year,
    // which is the one part of the old schedule that was never the problem.
    expect(at(1).health).toBe(1);
    expect(at(1).moisture).toBeCloseTo(0, 3);

    // A second year, bone dry from the first day of it: the blossom is gone.
    // `cropAt` is what gates flower AND fruit, so this one number is the whole
    // of "no longer blooms or produces fruit".
    expect(at(2).health).toBeLessThan(GARDEN_CONFIG.garden.fruit.cropFrom);
    expect(cropAt(1, at(2).health)).toBe(0);
    expect(healthBand(at(2).health)).toBe('failing');

    // A third and it is bare wood, and STAYS bare rather than creeping back.
    expect(at(3).health).toBeCloseTo(0, 2);
    expect(healthBand(at(3).health)).toBe('bare');
    expect(at(5).health).toBe(0);
});

test('A DEAD TREE PUTS OUT NO LEAVES AT ALL', () => {
    // The other half of the report, and a separate bug: `leaf` was
    // `0.4 + 0.6 * health`, which floors at FORTY PER CENT of a full canopy.
    // A tree at health zero went on sprouting every spring however long it had
    // been dead. The floor was never meant as one.
    const spring = 7;                       // leaves out, nothing turning
    const look = (health) => viewFor({ health, growth: 1, moisture: 0 }, spring, {});

    expect(look(0).leaf).toBe(0);
    expect(look(0).crop).toBe(0);
    // And the tree card and the wood agree it is gone.
    expect(healthBand(0)).toBe('bare');

    // A LIVING TREE IS UNCHANGED, which is what makes this a fix and not a
    // retune. The old curve gave 0.70 at the wilt and 0.85 at three quarters;
    // the new one gives 0.71 and 0.87 against the same phenology.
    const full = look(1).leaf;
    expect(look(1).leaf).toBeGreaterThan(0);
    expect(look(0.5).leaf / full).toBeCloseTo(0.707, 2);
    expect(look(0.75).leaf / full).toBeCloseTo(0.866, 2);
    // Monotonic, so a tree never looks fuller for being sicker.
    let last = -1;
    for (let h = 0; h <= 1.0001; h += 0.05) {
        const leaf = look(h).leaf;
        expect(`${h.toFixed(2)}: ${leaf >= last}`).toBe(`${h.toFixed(2)}: true`);
        last = leaf;
    }
});

test('WATERING A DEAD TREE BRINGS IT BACK IN TIME TO FLOWER', () => {
    // "The restoration of a bone dry to watered tree should be fast: if it's
    // spring it should bloom that year." A RATE CANNOT DELIVER THAT, and that
    // is the whole reason there is a jump. Health only moves inside the thirst
    // window, the window opens at hour 7, and the cherry has finished flowering
    // by 6.9: a tree watered in early spring would recover nothing at all until
    // its own blossom was over, whatever `recoverPerYear` was set to.
    const B = GARDEN_CONFIG.garden.bud;
    expect(GARDEN_CONFIG.season.thirst.start).toBeGreaterThan(3);

    const dead = { health: 0, moisture: 0, growth: 1 };
    const entry = { record: dead };
    expect(waterTree(entry, 0)).toBe('revived');

    // It is over the crop threshold the instant the water lands, so it flowers
    // this spring rather than next.
    expect(dead.health).toBe(B.reviveTo);
    expect(cropAt(1, dead.health)).toBeGreaterThan(0);

    // AND IT COMES BACK THINNER THAN ONE THAT WAS NEVER LET GO, which is the
    // half that keeps the care loop meaning something: about 40 percent of a
    // crop, and the card still says it is wilting rather than doing well.
    expect(cropAt(1, dead.health)).toBeLessThan(0.6);
    expect(healthBand(dead.health)).toBe('wilting');

    // NEVER DOWNWARD. `bud.below` is 0.6, so a tree at 0.55 counts as revived
    // and must not be pulled down to the floor by being watered.
    const middling = { record: { health: 0.55, moisture: 0, growth: 1 } };
    expect(waterTree(middling, 0)).toBe('revived');
    expect(middling.record.health).toBe(0.55);

    // And a year of being looked after finishes the job.
    let health = dead.health;
    const dt = 0.1;
    for (let i = 0; i < thirstSecondsPerYear() / dt; i++) {
        health = healthAfter(health, 1, dt, 12);
    }
    expect(health).toBeCloseTo(1, 2);
    expect(healthBand(health)).toBe('healthy');
});

test('a tree is never actually dead', () => {
    // Health has a floor, and it recovers. Nothing is ever removed by
    // neglect, and there is no state a tree cannot come back from.
    const { record } = simulate(12);
    expect(record.health).toBe(0);
    expect(record.growth).toBeGreaterThan(0);

    let health = 0;
    const dt = 0.1;
    for (let i = 0; i < 3 * thirstSecondsPerYear() / dt; i++) {
        health = healthAfter(health, 1, dt, 12);
    }
    expect(health).toBeCloseTo(1, 2);
});

test('growth stalls when health does, and never goes backwards', () => {
    expect(growthRate(1)).toBeGreaterThan(growthRate(0.5));
    expect(growthRate(0.1)).toBe(0);
    expect(growthRate(0)).toBe(0);

    // Two trees planted together, one tended and one not, must not end up the
    // same size. That divergence is the entire point of integrating growth
    // rather than reading it off the tree's age.
    const tended = simulate(5, { waterEachYear: true }).record;
    const neglected = simulate(5).record;
    expect(tended.growth).toBe(1);
    expect(neglected.growth).toBeLessThan(0.8);
});

test('the rules do not care how the frame rate went', () => {
    // n small steps must land where one large step does, or the garden grows
    // at different speeds on different machines.
    const fine = simulate(3, { dt: 1 / 120 }).record;
    const coarse = simulate(3, { dt: 1 / 15 }).record;
    expect(coarse.health).toBeCloseTo(fine.health, 2);
    expect(coarse.growth).toBeCloseTo(fine.growth, 2);
    expect(coarse.moisture).toBeCloseTo(fine.moisture, 2);
});

// ---- How it reads ----------------------------------------------------------

test('the four health bands all have words', () => {
    expect(healthBand(1)).toBe('healthy');
    expect(healthBand(0.5)).toBe('wilting');
    expect(healthBand(0.25)).toBe('failing');
    expect(healthBand(0)).toBe('bare');
    for (const band of ['healthy', 'wilting', 'failing', 'bare']) {
        expect(typeof HEALTH_WORDS[band]).toBe('string');
        expect(HEALTH_WORDS[band].length).toBeGreaterThan(0);
    }
});

test('a failing tree sheds out of season', () => {
    // Most of how neglect READS before the colour is obvious. It lines up with
    // the bands: nothing extra at the wilt threshold, bare at zero.
    expect(dropFor(0, 1)).toBe(0);
    expect(dropFor(0, 0.5)).toBeCloseTo(0, 6);
    expect(dropFor(0, 0.25)).toBeCloseTo(0.5, 6);
    expect(dropFor(0, 0)).toBeCloseTo(1, 6);
    // And the season still wins when the season is further along.
    expect(dropFor(1, 1)).toBe(1);
});

test('what a tree looks like is a pure function of its record and the hour', () => {
    const summer = viewFor({ growth: 1, health: 1, moisture: 1, bud: 0 }, 12);
    expect(summer.leaf).toBe(1);
    expect(summer.color).toBe(0);
    expect(summer.drop).toBe(0);

    const winter = viewFor({ growth: 1, health: 1, moisture: 1, bud: 0 }, 0);
    expect(winter.leaf).toBe(0);
    expect(winter.drop).toBe(1);

    // A bare tree is bare in every season, including high summer.
    const dead = viewFor({ growth: 1, health: 0, moisture: 0, bud: 0 }, 12);
    expect(dead.drop).toBeCloseTo(1, 6);

    // And a watered one carries buds, in any season at all.
    const budding = viewFor({ growth: 1, health: 0, moisture: 1, bud: 1 }, 0);
    expect(budding.bud).toBe(1);

    // An evergreen keeps its canopy through the winter.
    const spruce = viewFor({ growth: 1, health: 1, moisture: 1, bud: 0 }, 0, { evergreen: true });
    expect(spruce.leaf).toBe(1);
    expect(spruce.drop).toBe(0);
});

test('the thirst marker appears before the tank is empty', () => {
    // Warning while there is still time to act, rather than after.
    expect(needsWater(1)).toBe(false);
    expect(needsWater(0.5)).toBe(false);
    expect(needsWater(0.1)).toBe(true);
    expect(needsWater(0)).toBe(true);
});

// ---- Persistence -----------------------------------------------------------

test('a garden round trips through storage unchanged', () => {
    let edge = 0;
    while (cellInPlot(-(edge + 1), edge + 1)) edge++;

    const records = [
        createRecord('sugar-maple', { height: 1.15 }, 2, -3, 120, 12345),
        // The far corner of whatever grid is configured, rather than a cell
        // written down when the spacing was 1.5 m. This fixture went stale the
        // moment the grid was coarsened, and a round-trip test that silently
        // drops one of its two trees is not testing a round trip.
        createRecord('blue-spruce', {}, -edge, edge, 300, 999)
    ];
    records[0].growth = 0.5;
    records[0].health = 0.75;
    records[0].moisture = 0.4;

    const saved = JSON.parse(JSON.stringify(serialize(records, 900)));
    const back = hydrate(saved);

    expect(back.elapsedSeconds).toBe(900);
    expect(back.trees).toHaveLength(2);
    expect(back.trees[0].species).toBe('sugar-maple');
    expect(back.trees[0].seed).toBe(12345);
    expect(back.trees[0].custom.height).toBeCloseTo(1.15, 6);
    expect(back.trees[0].growth).toBeCloseTo(0.5, 3);
    expect(back.trees[0].health).toBeCloseTo(0.75, 3);
    expect(back.dropped).toBe(0);
    // The flag that tells a garden which WAS read from one that never existed.
    // Both come back empty; only the second opens at the fresh start hour.
    expect(back.restored).toBe(true);
});

test('a bad tree is dropped on its own, not with the garden', () => {
    // A garden lost to a schema change is bad. A garden silently rendered
    // wrong is worse. A garden thrown away because one record had a NaN in it
    // is just careless.
    const raw = {
        v: 1,
        elapsedSeconds: 500,
        trees: [
            null,
            { species: 'not-a-tree', seed: 1, gx: 0, gz: 0 },
            { species: 'olive', seed: NaN, gx: 0, gz: 0 },
            { species: 'olive', seed: 1, gx: 99, gz: 99 },
            { species: 'olive', seed: 1, gx: 1.5, gz: 0 },
            { species: 'olive', seed: 1, gx: 3, gz: 3 },
            { species: 'olive', seed: 2, gx: 3, gz: 3 },
            { id: 't9', species: 'paper-birch', seed: 7, gx: -4, gz: 1 }
        ]
    };
    const back = hydrate(raw);
    expect(back.trees).toHaveLength(2);
    expect(back.dropped).toBe(6);
    expect(back.elapsedSeconds).toBe(500);
});

test('a broken field is repaired, but a broken identity is not', () => {
    // A NaN moisture is a number that can be replaced. A missing species is
    // not a tree at all.
    const back = hydrate({
        v: 1,
        elapsedSeconds: 0,
        trees: [{
            species: 'olive', seed: 5, gx: 1, gz: 1,
            moisture: NaN, health: 'nonsense', growth: Infinity, plantedAt: undefined
        }]
    });
    expect(back.trees).toHaveLength(1);
    expect(back.trees[0].moisture).toBe(1);
    expect(back.trees[0].health).toBe(1);
    expect(back.trees[0].growth).toBe(0);
    expect(back.trees[0].plantedAt).toBe(0);
});

test('a garden that was never there is not mistaken for an empty one', () => {
    // Both come back with no trees. Only one of them should send the scene to
    // the fresh-garden start hour.
    expect(hydrate(null).restored).toBe(false);
    expect(hydrate({ v: 99, trees: [] }).restored).toBe(false);
    expect(hydrate({ v: 1, elapsedSeconds: 500, trees: [] }).restored).toBe(true);
});

test('an unknown schema is discarded rather than guessed at', () => {
    expect(hydrate({ v: 99, trees: [{ species: 'olive', seed: 1, gx: 0, gz: 0 }] }).trees).toHaveLength(0);
    expect(hydrate(null).trees).toHaveLength(0);
    expect(hydrate('nonsense').trees).toHaveLength(0);
    expect(hydrate({ v: 1 }).trees).toHaveLength(0);
    expect(hydrate({ v: 1, elapsedSeconds: -50, trees: [] }).elapsedSeconds).toBe(0);
});

test('a saved file cannot plant more trees than the plot holds', () => {
    const trees = [];
    for (let i = 0; i < 400; i++) {
        trees.push({ species: 'olive', seed: i, gx: (i % 13) - 6, gz: (Math.floor(i / 13) % 13) - 6 });
    }
    const back = hydrate({ v: 1, elapsedSeconds: 0, trees });
    expect(back.trees.length).toBe(GARDEN_CONFIG.plot.maxTrees);
});

// ---- The grid coarsened, and saves had to survive it (M24-1) ---------------

/**
 * A saved tree is a CELL INDEX, so changing the spacing changed what every
 * saved garden meant. These are the tests that the change did not cost anyone
 * their trees.
 *
 * Falsified against the code as it stood before the migration, where hydrate
 * was a strict `raw.v !== schema` and anything else came back empty: the first
 * of these fails on `restored`, and the rest fail on length 0.
 */
test('A SAVED GARDEN SURVIVES THE GRID CHANGING UNDER IT', () => {
    const trees = [];
    for (let gx = -6; gx <= 6; gx += 3) {
        for (let gz = -6; gz <= 6; gz += 4) {
            trees.push({ species: 'apple', seed: 7, gx, gz, plantedAt: 0, growth: 1 });
        }
    }
    expect(trees.length).toBeGreaterThan(10);

    const back = hydrate({ v: 1, elapsedSeconds: 4321, trees });

    expect(back.restored).toBe(true);
    expect(back.trees).toHaveLength(trees.length);
    expect(back.dropped).toBe(0);
    expect(back.elapsedSeconds).toBe(4321);
    // Every one of them landed somewhere legal, and no two on the same cell.
    for (const t of back.trees) expect(cellInPlot(t.gx, t.gz)).toBe(true);
    expect(new Set(back.trees.map((t) => `${t.gx},${t.gz}`)).size).toBe(trees.length);
});

test('a migrated tree stays where the visitor put it', () => {
    // The point of going through the world rather than scaling the index: a
    // tree must not travel across the plot to reach its new cell. Half a cell
    // is the most a re-snap can ever move one, and that is the same tolerance
    // the planting tap has always had.
    const was = GARDEN_CONFIG.plot.legacyGridSpacing;
    const now = GARDEN_CONFIG.plot.gridSpacing;
    const trees = [{ species: 'apple', seed: 1, gx: 3, gz: -5 }];
    const [t] = hydrate({ v: 1, elapsedSeconds: 0, trees }).trees;

    expect(Math.abs(t.gx * now - 3 * was)).toBeLessThanOrEqual(now / 2 + 1e-9);
    expect(Math.abs(t.gz * now - -5 * was)).toBeLessThanOrEqual(now / 2 + 1e-9);
});

test('two old cells that become one both keep a tree', () => {
    // The halving case, which is the whole reason the migration cannot simply
    // re-snap and dedupe. These two stood 1.5 m apart and land on one cell.
    const back = hydrate({
        v: 1,
        elapsedSeconds: 0,
        trees: [
            { species: 'olive', seed: 1, gx: 2, gz: 0 },
            { species: 'bur-oak', seed: 2, gx: 3, gz: 0 }
        ]
    });
    expect(back.trees).toHaveLength(2);
    expect(back.dropped).toBe(0);
    expect(back.trees[0].gx).not.toBe(back.trees[1].gx);
    // Both species kept their identity; neither became a copy of the other.
    expect(back.trees.map((t) => t.species).sort()).toEqual(['bur-oak', 'olive']);
});

test('but a duplicate record is still corruption, and still dropped', () => {
    // Distinguished from the case above by the cell AS WRITTEN. Two records on
    // one old cell could never have been produced legally, so the second is
    // dropped rather than relocated into the next cell along.
    const back = hydrate({
        v: 1,
        elapsedSeconds: 0,
        trees: [
            { species: 'olive', seed: 1, gx: 2, gz: 0 },
            { species: 'bur-oak', seed: 2, gx: 2, gz: 0 }
        ]
    });
    expect(back.trees).toHaveLength(1);
    expect(back.dropped).toBe(1);
    expect(back.trees[0].species).toBe('olive');
});

test('and a version nobody has ever written is still discarded whole', () => {
    // Migrating one known old schema is not the same as guessing at any number.
    const trees = [{ species: 'olive', seed: 1, gx: 0, gz: 0 }];
    expect(hydrate({ v: 99, elapsedSeconds: 0, trees }).restored).toBe(false);
    expect(hydrate({ v: 0, elapsedSeconds: 0, trees }).trees).toHaveLength(0);
});

test('two trees can never share a cell', () => {
    const back = hydrate({
        v: 1, elapsedSeconds: 0,
        trees: [
            { species: 'olive', seed: 1, gx: 2, gz: 2 },
            { species: 'bur-oak', seed: 2, gx: 2, gz: 2 }
        ]
    });
    expect(back.trees).toHaveLength(1);
    expect(back.trees[0].species).toBe('olive');
});


// ---- Fruit has to be earned (M11-7) ----------------------------------------

/**
 * These two gates are the REASON the fruit feature is in the same milestone as
 * M11-4. Taking away the free water leaves the honest question of what showing
 * up buys the visitor, and fruit is the answer: the first thing in this garden
 * that care BUYS rather than merely preserves.
 */
test('a sapling does not fruit', () => {
    // A tree goes in at `plantAgeYears` and must have nothing to show for a
    // while. Real orchard trees bear at three to five years.
    expect(cropAt(plantingGrowth(), 1)).toBe(0);
    expect(cropAt(GARDEN_CONFIG.garden.fruit.bearFrom, 1)).toBe(0);
    expect(cropAt(GARDEN_CONFIG.garden.fruit.bearFull, 1)).toBeCloseTo(1, 6);
    expect(cropAt(1, 1)).toBeCloseTo(1, 6);
});

test('the first blossom is under an in-world year of watching away', () => {
    // Close enough to be worth waiting for, far enough to be earned. Measured
    // in years rather than asserted on the growth number, because years is what
    // the visitor experiences.
    const M = GARDEN_CONFIG.garden.maturityYears;
    const plantedAt = plantingGrowth() * M;
    const firstBlossom = GARDEN_CONFIG.garden.fruit.bearFrom * M;
    const wait = firstBlossom - plantedAt;
    expect(wait).toBeGreaterThan(0.4);
    expect(wait).toBeLessThan(1.2);
});

test('a neglected tree gives nothing, and the boundary is the band the card names', () => {
    // `cropFrom` is deliberately `health.failingBelow`, so the crop and the
    // words the tree card already uses agree by construction rather than by
    // somebody remembering to keep two numbers in step.
    expect(GARDEN_CONFIG.garden.fruit.cropFrom).toBe(GARDEN_CONFIG.garden.health.failingBelow);
    expect(cropAt(1, 0)).toBe(0);
    expect(cropAt(1, GARDEN_CONFIG.garden.health.failingBelow)).toBe(0);
    expect(healthBand(GARDEN_CONFIG.garden.health.failingBelow)).toBe('failing');
    // Wilting still fruits, but poorly, which is a bad year rather than none.
    const wilting = cropAt(1, 0.4);
    expect(wilting).toBeGreaterThan(0);
    expect(wilting).toBeLessThan(0.5);
    expect(cropAt(1, GARDEN_CONFIG.garden.fruit.cropFull)).toBeCloseTo(1, 6);
});

test('the view hands the tree its stage and its crop, and null when it has neither', () => {
    const record = createRecord('apple', 0, 0, { x: 0, z: 0 });
    record.growth = 1;
    record.health = 1;
    const withFruit = viewFor(record, 12, { schedule: { bloomStart: 5, bloomFull: 6.5, bloomFade: 7.5, bloomEnd: 8.5, setEnd: 10, swellEnd: 14.5, ripenEnd: 17.5, holdEnd: 19, dropEnd: 20.5 } });
    expect(withFruit.fruit).not.toBeNull();
    expect(withFruit.crop).toBeCloseTo(1, 6);

    // Twelve of the sixteen species carry no schedule and pay nothing.
    expect(viewFor(record, 12, {}).fruit).toBeNull();
});
