// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's physics bench (M0), from SOURCE: www/derby/js/car.js (a build
 * becomes a car) and sim.js (the race).
 *
 * What is held here, and why:
 * - GOLDEN TIMES. The race must run the same everywhere (PRD, Determinism),
 *   so the nine neighbors' times are pinned to the microsecond. A change to
 *   the physics or the field that moves them must update them on purpose.
 * - THE FIELD'S ORDER is an output of the physics, not a list we typed.
 * - EACH LEVER POINTS THE RIGHT WAY, in the order Mann, Gibbs and Sah found
 *   (Mechanical Sciences 3, 2012): the axles most, then weight, and the
 *   shape least of the three a builder works hardest on.
 * - The balance point's sweet spot falls out of the model at 0.75 to 1 in.
 * - Only + - * / and sqrt in the sim and the car (read from the source).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const { DERBY_CONFIG: C, IN, OZ } = await import('../www/derby/js/config.js');
const Car = await import('../www/derby/js/car.js');
const Sim = await import('../www/derby/js/sim.js');

const field = C.field.map((e) => Car.describeCar(Car.buildFromField(e)));
const neutral = (car) => Sim.runCar(car, null).time;
/** A fully tuned wedge at 5.00 oz with its balance 1 in in front of the rear
 *  axle, and one thing changed. */
const ref = (tune = {}, ballast = { mass: 5, balance: 1 }, design = 'wedge') =>
    Car.describeCar(Car.buildFromDesign(design, { tune: { deburr: true, polish: 5, graphite: true, align: true, ...tune }, ballast }));
const atBalance = (car, inches) => ({ ...car, balance: inches * IN, comX: car.rearAxle - inches * IN });

describe('the field', () => {
    test('golden times, to the microsecond', () => {
        const golden = {
            brick: '3.469842', hotdog: '3.325823', loaf: '3.297307', streak: '3.259512', tiger: '3.249735',
            comet: '3.239370', owl: '3.220863', arrow: '3.203525', phantom: '3.189400'
        };
        const got = {};
        C.field.forEach((e, i) => { got[e.id] = neutral(field[i]).toFixed(6); });
        expect(got).toEqual(golden);
    });

    test('the nine finish slowest to fastest, as listed, every car legal and none stopped', () => {
        const times = field.map(neutral);
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThan(times[i - 1]);
        for (const car of field) {
            expect(Car.isLegal(car)).toBe(true);
            expect(Sim.runCar(car, null).dnf).toBe(false);
        }
        // Each division's cars are the three it names, in order.
        expect([...C.divisions.easy, ...C.divisions.medium, ...C.divisions.hard]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('times look like a real aluminum track: two and a half to three and a half seconds', () => {
        for (const t of field.map(neutral)) {
            expect(t).toBeGreaterThan(2.5);
            expect(t).toBeLessThan(3.5);
        }
    });
});

describe('each lever, one change at a time', () => {
    const base = neutral(ref());
    const cost = (car) => neutral(car) - base;

    test('axles most, then weight; the shape least of the three, and every one points the right way', () => {
        const axles = cost(ref({ deburr: false, polish: 0, graphite: false }));
        const weight = cost(ref({}, { mass: 4, balance: 1 }));
        const shape = cost(ref({}, { mass: 5, balance: 1 }, 'block'));
        const align = cost(ref({ align: false }));
        expect(axles).toBeGreaterThan(weight);
        expect(weight).toBeGreaterThan(shape);
        for (const c of [axles, weight, shape, align]) expect(c).toBeGreaterThan(0);
        // Front-heavy against the sweet spot costs about what a whole ounce does.
        const front = cost(atBalance(ref(), 3.4)) - cost(atBalance(ref(), 0.75));
        expect(front).toBeGreaterThan(weight * 0.6);
        expect(front).toBeLessThan(weight * 1.6);
    });

    test('each axle tune-up helps, polish by less each grit', () => {
        const t = (tune) => cost(ref({ deburr: false, polish: 0, graphite: false, ...tune }));
        expect(t({ deburr: true })).toBeLessThan(t({}));
        let last = t({ deburr: true });
        let lastGain = Infinity;
        for (let p = 1; p <= 5; p++) {
            const now = t({ deburr: true, polish: p });
            expect(now).toBeLessThan(last);
            expect(last - now).toBeLessThan(lastGain);
            lastGain = last - now;
            last = now;
        }
        expect(t({ deburr: true, polish: 5, graphite: true })).toBeLessThan(last);
        // Polish past the last grit is the last grit.
        expect(Car.axleFrictionOf({ polish: 9 })).toBe(Car.axleFrictionOf({ polish: 5 }));
    });

    test('the balance point is fastest around 0.75 to 1 in, and too far back is a real mistake', () => {
        const at = (b) => neutral(atBalance(ref(), b));
        const sweep = [2.5, 2, 1.5, 1.25, 1, 0.875, 0.75, 0.625, 0.5, 0.25, 0];
        const times = sweep.map(at);
        const best = sweep[times.indexOf(Math.min(...times))];
        expect(best).toBeGreaterThanOrEqual(0.625);
        expect(best).toBeLessThanOrEqual(1);
        expect(at(0.25)).toBeGreaterThan(at(1));
        // Behind the rear axle the front lifts clear, slower still.
        expect(at(-0.3)).toBeGreaterThan(at(0));
    });

    test('heavier is faster all the way to the Outlaw ceiling', () => {
        const o = (mass) => neutral(Car.describeCar(Car.buildFromDesign('thinWedge', {
            rules: 'outlaw', tune: { deburr: true, polish: 5, graphite: true, align: true }, ballast: { mass, balance: 0.875 }
        })));
        expect(o(16)).toBeLessThan(o(8));
        expect(o(8)).toBeLessThan(o(5));
    });
});

describe('a build becomes a car', () => {
    test('the kit block: its volume, its weight about four ounces, its balance between the axles', () => {
        const car = Car.describeCar(Car.buildFromDesign('block'));
        expect(car.body.volume).toBeCloseTo(7 * 1.75 * 1.25 * IN * IN * IN, 9);
        expect(car.mass / OZ).toBeGreaterThan(3.8);
        expect(car.mass / OZ).toBeLessThan(4.4);
        expect(car.balance).toBeGreaterThan(0);
        expect(car.comX).toBeGreaterThan(car.frontAxle);
        expect(car.body.nose).toBe(1);
        expect(car.ballast).toBe(0);
    });

    test('profileAt joins stations linearly and holds the ends', () => {
        const s = [[0, 0, 1, 2], [1, 0, 3, 2]];
        expect(Car.profileAt(s, -1)).toEqual([0, 1, 2]);
        expect(Car.profileAt(s, 0.5)).toEqual([0, 2, 2]);
        expect(Car.profileAt(s, 5)).toEqual([0, 3, 2]);
        // A pinched profile has no area there, and a station repeated at one x
        // does not divide by zero.
        expect(Car.areaAt([[0, 1, 0.5, 1], [1, 1, 0.5, 1]], 0.5)).toBe(0);
        expect(Car.profileAt([[0, 0, 1, 1], [0, 0, 2, 1], [1, 0, 2, 1]], 0)).toEqual([0, 1, 1]);
    });

    test('Auto-weigh brings a car to the weight and balance asked, to the scale\'s hundredth', () => {
        for (const design of ['wedge', 'bullet', 'classic', 'lowRider', 'thinWedge']) {
            const build = Car.buildFromDesign(design);
            build.weights = Car.autoWeigh(build, { mass: 5, balance: 1.25 });
            const car = Car.describeCar(build);
            expect(Math.round((car.mass / OZ) * 100) / 100).toBe(5);
            expect(Math.abs(car.balance / IN - 1.25)).toBeLessThan(0.01);
            expect(build.weights.some((w) => w.kind === 'putty')).toBe(true);
            expect(Car.isLegal(car)).toBe(true);
        }
        // A bulky body has too much wood for the weights to pull its balance
        // back: every weight at the tail, and still short. Carving wood out
        // is how a real builder makes room (the workshop's lesson, M4).
        for (const design of ['block', 'loaf', 'hotDog']) {
            const build = Car.buildFromDesign(design);
            build.weights = Car.autoWeigh(build, { mass: 5, balance: 1.25 });
            expect(build.weights[0].x).toBeCloseTo(C.kit.length - 0.3 * IN, 9);
            expect(Car.describeCar(build).balance / IN).toBeGreaterThan(1.5);
        }
        // Already heavier than asked: nothing to add.
        expect(Car.autoWeigh(Car.buildFromDesign('block'), { mass: 3, balance: 1 })).toEqual([]);
        // A balance the body cannot reach comes as close as it can, on the body.
        const far = Car.buildFromDesign('thinWedge');
        far.weights = Car.autoWeigh(far, { mass: 5, balance: -2 });
        expect(far.weights[0].x).toBeCloseTo(C.kit.length - 0.3 * IN, 9);
        const near = Car.buildFromDesign('thinWedge');
        near.weights = Car.autoWeigh(near, { mass: 5, balance: 9 });
        expect(near.weights[0].x).toBeCloseTo(0.3 * IN, 9);
    });

    test('a weight of an unknown kind weighs nothing, and putty weighs its own piece up to its limit', () => {
        expect(Car.weightMass({ kind: 'lead' })).toBe(0);
        expect(Car.weightMass({ kind: 'putty', mass: 0.001 })).toBe(0.001);
        expect(Car.weightMass({ kind: 'putty', mass: 1 })).toBe(C.weights.putty.mass);
        const build = Car.buildFromDesign('block');
        build.weights = [{ kind: 'lead', x: 0.1 }];
        expect(Car.describeCar(build).mass).toBe(Car.describeCar(Car.buildFromDesign('block')).mass);
        expect(Car.buildFromDesign('no-such-design').stations).toEqual(Car.buildFromDesign('block').stations);
    });
});

describe('the rule sheets', () => {
    const failing = (car, rules) => Car.checkRules(car, rules).filter((c) => !c.ok).map((c) => c.rule);

    test('Standard: 5.00 oz passes and 5.01 does not; a body narrower than 1.75 in at an axle fails the wheel gap', () => {
        const five = Car.describeCar(Car.buildFromDesign('wedge', { ballast: { mass: 5, balance: 1 } }));
        expect(failing(five)).toEqual([]);
        const over = Car.describeCar(Car.buildFromDesign('wedge', { ballast: { mass: 5.01, balance: 1 } }));
        expect(failing(over)).toEqual(['mass']);
        const narrow = Car.describeCar({ ...Car.buildFromDesign('block'), stations: [[0, 0, 0.03, 0.03], [0.178, 0, 0.03, 0.03]] });
        expect(failing(narrow)).toEqual(['wheelGap']);
        const scraped = Car.describeCar({ ...Car.buildFromDesign('block'), stations: [[0, -0.005, 0.03, 0.04445], [0.178, -0.005, 0.03, 0.04445]] });
        expect(failing(scraped)).toEqual(['clearance']);
    });

    test('Outlaw lifts the weight to 16 oz, and the car carries its own sheet', () => {
        const heavy = Car.describeCar(Car.buildFromDesign('wedge', { rules: 'outlaw', ballast: { mass: 12, balance: 1 } }));
        expect(heavy.rules).toBe('outlaw');
        expect(Car.isLegal(heavy)).toBe(true);
        expect(Car.isLegal(heavy, 'standard')).toBe(false);
        const tooHeavy = Car.describeCar(Car.buildFromDesign('wedge', { rules: 'outlaw', ballast: { mass: 16.5, balance: 1 } }));
        expect(failing(tooHeavy)).toEqual(['mass']);
        // An unknown sheet is judged as Standard.
        expect(Car.isLegal(heavy, 'no-such-sheet')).toBe(false);
    });
});

describe('the track and the race', () => {
    test('the track is continuous: the slope eases to flat, its height to zero', () => {
        const T = C.track;
        const end = T.slopeLength + T.transitionLength;
        for (const s of [T.slopeLength, end]) {
            expect(Sim.trackAt(s - 1e-9).height).toBeCloseTo(Sim.trackAt(s + 1e-9).height, 6);
            expect(Sim.trackAt(s - 1e-9).sin).toBeCloseTo(Sim.trackAt(s + 1e-9).sin, 6);
        }
        expect(Sim.trackAt(end + 1).height).toBe(0);
        expect(Sim.trackAt(-0.1).height).toBeGreaterThan(Sim.startHeight());
        expect(Sim.trackAt(T.slopeLength + 1).curvature).toBeGreaterThan(0);
        // About four feet high at the pin.
        expect(Sim.startHeight() / IN).toBeGreaterThan(44);
        expect(Sim.startHeight() / IN).toBeLessThan(52);
    });

    test('four heats, every car in every lane once, lane 4 a hair slow and the rotation cancelling it', () => {
        const cars = C.divisions.hard.map((i) => field[i]).concat([field[0]]);
        const r = Sim.runRace(cars);
        expect(r.heats).toHaveLength(4);
        cars.forEach((_, i) => {
            expect(r.heats.map((h) => h[i].lane).sort()).toEqual([0, 1, 2, 3]);
        });
        const lanes = r.laneAverage;
        expect(Math.max(...lanes)).toBe(lanes[3]);
        const one = Sim.runCar(field[8], 3).time - Sim.runCar(field[8], 2).time;
        expect(one).toBeGreaterThan(0.001);
        expect(one).toBeLessThan(0.004);
        // Standings by average, fastest first; best heat is the car's quickest.
        expect(r.standings).toEqual([2, 1, 0, 3]);
        r.best.forEach((b, i) => expect(b.time).toBe(Math.min(...r.heats.map((h) => h[i].time))));
        // A solo Time Trial still runs all four lanes.
        const solo = Sim.runRace([field[8]]);
        expect(solo.heats.map((h) => h[0].lane)).toEqual([0, 1, 2, 3]);
        expect(solo.laneAverage.every((t) => typeof t === 'number')).toBe(true);
    });

    test('a tie on the board keeps entry order', () => {
        const r = Sim.runRace([field[4], field[4]]);
        expect(r.average[0]).toBe(r.average[1]);
        expect(r.standings).toEqual([0, 1]);
    });

    test('a recorded run samples from the pin to the finish line, and a car that cannot finish is marked', () => {
        const run = Sim.runCar(field[8], 0, { record: 1 / 60 });
        expect(run.samples[0]).toEqual({ t: 0, s: 0, v: 0 });
        expect(run.samples[run.samples.length - 1].s).toBe(C.track.courseLength);
        for (let i = 1; i < run.samples.length; i++) expect(run.samples[i].s).toBeGreaterThan(run.samples[i - 1].s);
        expect(Sim.shownTime(run.time)).toBe(Math.round(run.time * 1000) / 1000);
        const stuck = Sim.runCar({ ...field[0], axleMu: 6 }, null);
        expect(stuck.dnf).toBe(true);
        expect(stuck.stoppedAt).toBeGreaterThan(C.track.slopeLength);
        // A car still rolling when the clock runs out is marked too.
        const slow = Sim.runCar(field[0], null, {}, { ...C, physics: { ...C.physics, maxSeconds: 1 } });
        expect(slow.dnf).toBe(true);
        expect(slow.time).toBe(1);
    });
});

describe('why a car ran as it did', () => {
    const refs = {
        blockCdA: Car.describeCar(Car.buildFromDesign('block')).cdA,
        bestCdA: field[8].cdA,
        idealBalance: 0.75 * IN
    };

    test('the stock block: nothing saved by its own tune-ups, and something on the table for each', () => {
        const why = Sim.explain(field[0], refs);
        expect(why.lines.map((l) => l.id)).toEqual(['weight', 'balance', 'axles', 'alignment', 'shape']);
        const line = Object.fromEntries(why.lines.map((l) => [l.id, l]));
        expect(line.weight.saved).toBe(0);
        expect(line.axles.saved).toBe(0);
        expect(line.alignment.saved).toBe(0);
        expect(line.shape.saved).toBe(0);
        for (const l of why.lines) expect(l.more).toBeGreaterThan(0);
        expect(why.time).toBe(neutral(field[0]));
    });

    test('the Phantom: every tune-up saved time, and little is left', () => {
        const line = Object.fromEntries(Sim.explain(field[8], refs).lines.map((l) => [l.id, l]));
        for (const id of ['weight', 'balance', 'axles', 'alignment', 'shape']) expect(line[id].saved).toBeGreaterThan(0);
        expect(Math.abs(line.weight.more)).toBeLessThan(1e-9);
        expect(Math.abs(line.axles.more)).toBeLessThan(1e-9);
        expect(line.balance.more).toBeLessThan(0.002);
    });

    test('an Outlaw car is measured against the Outlaw limit', () => {
        const car = Car.describeCar(Car.buildFromDesign('thinWedge', { rules: 'outlaw', ballast: { mass: 5, balance: 0.875 } }));
        const line = Sim.explain(car, refs).lines.find((l) => l.id === 'weight');
        expect(line.more).toBeGreaterThan(0.05);
    });
});

describe('the same race on every device', () => {
    const SRC = join(process.cwd(), 'www/derby/js');

    test('the car and the sim use only + - * / and sqrt (and round, min for the scale and the board)', () => {
        for (const file of ['car.js', 'sim.js', 'config.js']) {
            const src = readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            const calls = [...src.matchAll(/Math\.(\w+)/g)].map((m) => m[1]);
            for (const c of calls) expect(['sqrt', 'round', 'min']).toContain(c);
            expect(src).not.toMatch(/\*\*/);
        }
    });

    test('no "pinewood" anywhere in the scene (PRD, The name)', () => {
        const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
            (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
        for (const file of walk(join(process.cwd(), 'www/derby'))) {
            expect(readFileSync(file, 'utf8')).not.toMatch(/pinewood/i);
        }
    });
});
