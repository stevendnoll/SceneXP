// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's garage, units and pockets (M3), the pure parts: garage.js
 * (a stored car made valid, the four-car cap, results, trophies, settings,
 * storage refused or broken), units.js (the visitor's figures and the rule
 * sheet's), and weights.js (what each pocket holds, weights by hand, and
 * Auto-weigh into the pockets). PLANNING, Testing: storage refused, broken
 * JSON, a stale build normalized, four-car cap.
 */
import { jest } from '@jest/globals';

const { DERBY_CONFIG: C, IN, OZ } = await import('../www/derby/js/config.js');
const Car = await import('../www/derby/js/car.js');
const G = await import('../www/derby/js/garage.js');
const U = await import('../www/derby/js/units.js');
const W = await import('../www/derby/js/weights.js');

/** A seeded stand-in for Math.random, so ids are the same every run. */
function seeded(seed = 7) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** An in-memory localStorage, or one that refuses everything. */
function storage({ refuse = false } = {}) {
    const map = new Map();
    const no = () => { throw new Error('SecurityError'); };
    return refuse ? { getItem: no, setItem: no, removeItem: no } : {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k)
    };
}

afterEach(() => {
    delete globalThis.localStorage;
});

const massOf = (b) => Car.describeCar(b, C).mass / OZ;
const balanceOf = (b) => Car.describeCar(b, C).balance / IN;

describe('normalizeBuild', () => {
    test('what is not a car is null, and an empty object is a whole default car', () => {
        for (const raw of [null, undefined, 3, 'car', [1, 2]]) expect(G.normalizeBuild(raw, C)).toBeNull();
        const b = G.normalizeBuild({}, C, { rand: seeded() });
        expect(b.v).toBe(1);
        expect(b.id).toMatch(/^[a-z0-9]{10}$/);
        expect(b.design).toBe('wedge');
        expect(b.rules).toBe('standard');
        expect(b.stations).toEqual(C.designs.wedge.stations.map((s) => [...s]));
        expect(b.weights).toEqual([]);
        expect(b.ballast).toBe('auto');
        expect(b.tune).toEqual({ deburr: false, polish: 0, graphite: false, align: false, sand: 0 });
        expect(b.paint).toEqual({ body: 0x3a7be8, stripe: null, finish: 'gloss' });
        expect(b.name).toBe('');
        expect(b.number).toBeNull();
        expect(b.carve).toBeNull();
        expect(b.decals).toEqual([]);
    });

    test('every field is clamped or dropped, never trusted', () => {
        const b = G.normalizeBuild({
            id: 'NOT VALID!', design: 'rocket', rules: 'anything', name: '  Big\u0000 \n Blue   Comet the Fastest Car Ever  ',
            number: 140, ballast: 'magic',
            tune: { deburr: 'yes', polish: 99, graphite: true, align: 1, sand: 3 },
            paint: { body: 0x1000000, stripe: 'red', finish: 'chrome' },
            weights: [
                { kind: 'cylinder', x: 99 }, { kind: 'lead', x: 0.1 }, { kind: 'putty', x: 0.1, mass: 5 }, { kind: 'cube', x: NaN }, null,
                { kind: 'constructor', x: 0.1 }
            ],
            extra: 'dropped'
        }, C, { rand: seeded() });
        expect(b.id).toMatch(/^[a-z0-9]{10}$/);
        expect(b.design).toBe('wedge');
        expect(b.rules).toBe('standard');
        expect(b.name).toBe('Big Blue Comet the Faste');
        expect(b.name.length).toBeLessThanOrEqual(G.NAME_MAX);
        expect(b.number).toBeNull();
        expect(b.ballast).toBe('auto');
        expect(b.tune).toEqual({ deburr: false, polish: C.physics.axleFriction.polish.length, graphite: true, align: false, sand: 1 });
        expect(b.paint).toEqual({ body: 0x3a7be8, stripe: null, finish: 'gloss' });
        expect(b.weights).toEqual([{ kind: 'cylinder', x: C.kit.length }, { kind: 'putty', x: 0.1, mass: C.weights.putty.mass }]);
        expect(b).not.toHaveProperty('extra');
    });

    test('a profile that holds together is kept, clamped to the block, and one that does not falls back to its design', () => {
        const ok = G.normalizeBuild({ design: 'bullet', stations: [[0, 0, 0.5, 0.04], [0.1, -1, 9, 9], [0.15, 0.01, 0.005, 0.03], [0.5, 0, 0, 0]] }, C);
        expect(ok.stations).toEqual([[0, 0, C.kit.height, 0.04], [0.1, 0, C.kit.height, C.kit.width], [0.15, 0.01, 0.01, 0.03], [C.kit.length, 0, 0, 0]]);
        for (const stations of [[[0.1, 0, 0.01, 0.01], [0.05, 0, 0.01, 0.01]], [[0, 0, 0.01]], 'flat', new Array(30).fill([0, 0, 0.01, 0.01])]) {
            expect(G.normalizeBuild({ design: 'bullet', stations }, C).stations).toEqual(C.designs.bullet.stations.map((s) => [...s]));
        }
    });

    test('a car comes back exactly as it was kept', () => {
        const car = G.newCar(C, { design: 'classic', index: 2, rand: seeded() });
        const again = G.normalizeBuild(JSON.parse(JSON.stringify(car)), C);
        expect(again).toEqual(car);
        expect(massOf(again)).toBeCloseTo(massOf(car), 12);
    });
});

describe('a new car', () => {
    test('is a legal 5.00 oz wedge with its weight in the sweet spot, painted in turn', () => {
        const rand = seeded();
        const cars = [0, 1, 2, 3, 4].map((index) => G.newCar(C, { index, rand }));
        expect(cars.map((c) => G.colorName(c.paint.body, C))).toEqual(['Blue', 'Red', 'Yellow', 'Green', 'Blue']);
        for (const c of cars) {
            expect(c.design).toBe('wedge');
            expect(c.ballast).toBe('auto');
            expect(massOf(c)).toBeCloseTo(5, 3);
            expect(balanceOf(c)).toBeCloseTo(C.bench.autoBalance, 1);
            expect(Car.isLegal(Car.describeCar(c, C))).toBe(true);
        }
    });

    test('goes by its paint and shape, numbered after a car already called that', () => {
        const rand = seeded();
        const a = G.newCar(C, { rand });
        const b = { ...G.newCar(C, { rand }), paint: { ...a.paint } };
        const c = { ...G.newCar(C, { rand }), name: 'Comet' };
        const cars = [a, b, c];
        expect(cars.map((x) => G.nameOf(x, cars, C))).toEqual(['Blue Wedge', 'Blue Wedge 2', 'Comet']);
        // A custom color goes by the nearest in the palette.
        expect(G.colorName(0x3070f0, C)).toBe('Blue');
        expect(G.colorName(0x101010, C)).toBe('Black');
    });

    test('may enter what its class allows, the weigh-in judging its sheet', () => {
        const std = G.newCar(C, { rand: seeded() });
        const outlaw = G.weighAuto({ ...std, rules: 'outlaw' }, C);
        expect(['easy', 'medium', 'hard', 'trial', 'outlaw'].map((e) => G.canEnter(std, e, C)))
            .toEqual(['ok', 'ok', 'ok', 'ok', 'standardOnly']);
        expect(['easy', 'medium', 'hard', 'trial', 'outlaw'].map((e) => G.canEnter(outlaw, e, C)))
            .toEqual(['outlawOnly', 'outlawOnly', 'outlawOnly', 'ok', 'ok']);
        const heavy = { ...std, weights: std.weights.concat([{ kind: 'cylinder', x: std.weights[0].x }]) };
        expect(massOf(heavy)).toBeGreaterThan(5);
        // Over its sheet, it still enters: the weigh-in turns it back (M5.2).
        expect(G.canEnter(heavy, 'trial', C)).toBe('ok');
    });
});

describe('normalizeGarage', () => {
    test('caps the garage at four, drops duplicates, and keeps a bench car', () => {
        const rand = seeded();
        const cars = [1, 2, 3, 4, 5].map((i) => G.newCar(C, { index: i, rand }));
        const g = G.normalizeGarage({ cars: [cars[0], cars[0], ...cars.slice(1)], bench: 'gone' }, C, { rand });
        expect(g.cars.map((c) => c.id)).toEqual(cars.slice(0, 4).map((c) => c.id));
        expect(g.bench).toBe(cars[0].id);
        expect(G.normalizeGarage({ cars: 'nope' }, C, { rand }).cars).toHaveLength(1);
    });

    test('keeps results only for cars it holds, in events that exist, with sane numbers', () => {
        const car = G.newCar(C, { rand: seeded() });
        const g = G.normalizeGarage({
            cars: [car],
            results: { [car.id]: { easy: { place: 2, average: 3.3 }, hard: { place: 9, average: 3.2 }, moon: { place: 1, average: 3 }, medium: { average: -1 } }, other: { easy: { place: 1, average: 3 } } },
            last: { car: car.id, event: 'easy', place: 2, average: 3.3 }
        }, C);
        expect(g.results).toEqual({ [car.id]: { easy: { place: 2, average: 3.3 }, hard: { place: null, average: 3.2 } } });
        expect(g.last).toEqual({ car: car.id, event: 'easy', place: 2, average: 3.3 });
        expect(G.normalizeGarage({ cars: [car], last: { car: 'other', event: 'easy', average: 3 } }, C).last).toBeNull();
    });

    test('settings and trophies are made valid too', () => {
        expect(G.normalizeSettings({ units: 'metric', sound: 'yes' })).toEqual({ units: 'metric', sound: false, from: '' });
        expect(G.normalizeSettings(null)).toEqual({ units: 'us', sound: false, from: '' });
        // The first name last put on a challenge (M8): kept clean and short.
        expect(G.normalizeSettings({ from: '  Steve\u202e  ' }).from).toBe('Steve');
        expect(G.normalizeSettings({ from: 42 }).from).toBe('');
        expect([...G.normalizeSettings({ from: 'A'.repeat(50) }).from]).toHaveLength(G.FROM_MAX);
        expect(G.normalizeTrophies({ easy: '2026-10-19', hard: 'yesterday', moon: '2026-01-01' }))
            .toEqual({ easy: '2026-10-19', medium: null, hard: null, outlaw: null });
    });
});

describe('the garage in this browser', () => {
    const make = (opts = {}) => G.createGarage({ C, rand: seeded(), now: () => new Date(2026, 9, 19, 9, 30), ...opts });

    test('a first visit has one car, kept only once the host has introduced it', () => {
        globalThis.localStorage = storage();
        const g = make();
        expect(g.firstVisit).toBe(true);
        expect(g.cars()).toHaveLength(1);
        expect(localStorage.getItem(G.KEYS.garage)).toBeNull();
        g.keep();
        expect(JSON.parse(localStorage.getItem(G.KEYS.garage)).cars).toHaveLength(1);
        expect(make().firstVisit).toBe(false);
    });

    test('broken JSON is a fresh garage, not a broken page', () => {
        globalThis.localStorage = storage();
        localStorage.setItem(G.KEYS.garage, '{"cars": [');
        localStorage.setItem(G.KEYS.settings, 'NaN');
        const g = make();
        expect(g.cars()).toHaveLength(1);
        expect(g.settings()).toEqual({ units: 'us', sound: false, from: '' });
    });

    test('storage refused: every change still works for the visit', () => {
        globalThis.localStorage = storage({ refuse: true });
        const g = make();
        expect(g.firstVisit).toBe(true);
        expect(g.add(G.newCar(C, { rand: seeded(3) }))).not.toBeNull();
        expect(g.record(g.bench().id, 'easy', { place: 1, average: 3.2 })).toBe(true);
        expect(g.award('easy')).toBe(true);
        expect(g.setSetting('units', 'metric').units).toBe('metric');
        expect(g.keep()).toBe(false);
        expect(() => g.forget()).not.toThrow();
    });

    test('no storage at all is the same as refused', () => {
        const g = make();
        expect(g.cars()).toHaveLength(1);
        expect(g.keep()).toBe(false);
    });

    test('holds four cars, the newest on the bench, and never removes the last one', () => {
        globalThis.localStorage = storage();
        const g = make();
        const first = g.bench();
        for (let i = 1; i < 4; i++) expect(g.add(G.newCar(C, { index: i, rand: seeded(i) }))).not.toBeNull();
        expect(g.cars()).toHaveLength(4);
        expect(g.isFull()).toBe(true);
        expect(g.bench().id).toBe(g.cars()[3].id);
        expect(g.add(G.newCar(C, { rand: seeded(9) }))).toBeNull();
        // A copy gets its own id.
        expect(new Set(g.cars().map((c) => c.id)).size).toBe(4);
        expect(g.setBench(first.id)).toBe(true);
        expect(g.setBench('nobody')).toBe(false);
        for (const c of g.cars().slice(1)) expect(g.remove(c.id)).toBe(true);
        expect(g.cars()).toHaveLength(1);
        expect(g.remove(first.id)).toBe(false);
        expect(g.remove('nobody')).toBe(false);
        // Kept as it is, across a reload.
        expect(make().cars().map((c) => c.id)).toEqual([first.id]);
    });

    test('removing the bench car puts its neighbor on the bench and forgets its results', () => {
        globalThis.localStorage = storage();
        const g = make();
        const a = g.bench();
        const b = g.add(G.newCar(C, { index: 1, rand: seeded(2) }));
        g.record(b.id, 'hard', { place: 3, average: 3.3 });
        expect(g.remove(b.id)).toBe(true);
        expect(g.bench().id).toBe(a.id);
        expect(g.results(b.id)).toEqual({});
        expect(g.last()).toBeNull();
    });

    test('a changed car is kept by its id, made valid on the way in', () => {
        globalThis.localStorage = storage();
        const g = make();
        const b = g.bench();
        const saved = g.save({ ...b, tune: { ...b.tune, polish: 40 } });
        expect(saved.tune.polish).toBe(C.physics.axleFriction.polish.length);
        expect(make().bench().tune.polish).toBe(C.physics.axleFriction.polish.length);
        expect(g.save({ ...b, id: 'someoneelse' })).toBeNull();
    });

    test('a result is kept as the last, and as the best only when it is better', () => {
        globalThis.localStorage = storage();
        const g = make();
        const id = g.bench().id;
        expect(g.record(id, 'medium', { place: 3, average: 3.3 })).toBe(true);
        expect(g.record(id, 'medium', { place: 4, average: 3.2 })).toBe(false);
        expect(g.record(id, 'medium', { place: 3, average: 3.29 })).toBe(true);
        expect(g.record(id, 'medium', { place: 1, average: 3.31 })).toBe(true);
        expect(g.results(id).medium).toEqual({ place: 1, average: 3.31 });
        expect(g.record(id, 'trial', { average: 3.25 })).toBe(true);
        expect(g.record(id, 'trial', { average: 3.26 })).toBe(false);
        expect(g.last()).toEqual({ car: id, event: 'trial', place: null, average: 3.26 });
        expect(g.record('nobody', 'easy', { place: 1, average: 3 })).toBe(false);
        expect(g.record(id, 'moon', { place: 1, average: 3 })).toBe(false);
        expect(g.record(id, 'easy', { place: 1, average: 0 })).toBe(false);
    });

    test('a trophy is won once, dated that day, and only for a division or the exhibition', () => {
        globalThis.localStorage = storage();
        const g = make();
        expect(g.award('easy')).toBe(true);
        expect(g.award('easy')).toBe(false);
        expect(g.award('trial')).toBe(false);
        expect(g.trophies()).toEqual({ easy: '2026-10-19', medium: null, hard: null, outlaw: null });
        expect(make().trophies().easy).toBe('2026-10-19');
    });

    test('Forget my cars takes away every key, and leaves a fresh car', () => {
        globalThis.localStorage = storage();
        const g = make();
        g.keep();
        g.award('hard');
        g.setSetting('sound', true);
        const fresh = g.forget();
        expect(localStorage.map.size).toBe(0);
        expect(g.cars()).toEqual([fresh]);
        expect(g.trophies().hard).toBeNull();
        expect(g.settings()).toEqual({ units: 'us', sound: false, from: '' });
    });
});

describe('units', () => {
    test('a car\'s figures in ounces and inches, or grams and centimeters', () => {
        expect(U.mass(5 * OZ)).toBe('5.00 oz');
        expect(U.mass(5 * OZ, 'metric')).toBe('141.7 g');
        expect(U.length(0.875 * IN)).toBe('0.88 in');
        expect(U.length(0.875 * IN, 'metric')).toBe('2.2 cm');
        expect(U.mass(-0.0001)).toBe('0.00 oz');
        expect(U.normalizeUnits('imperial')).toBe('us');
        expect(U.unitsLabel('metric')).toBe('Centimeters and grams');
        expect(U.unitsLabel('us')).toBe('Inches and ounces');
    });

    test('the rule sheet keeps its own units, the conversion beside them (D3)', () => {
        expect(U.sheetMass(C.rules.standard.maxMass)).toBe('5.00 oz (141.7 g)');
        expect(U.sheetLength(C.rules.standard.maxWidth)).toBe('2.75 in (7.0 cm)');
        expect(U.sheetLength(C.rules.standard.minClearance)).toBe('0.375 in (1.0 cm)');
        expect(U.sheetLength(C.rules.standard.maxLength)).toBe('7 in (17.8 cm)');
    });
});

describe('the pockets', () => {
    const design = (id, rules = 'standard') => Car.buildFromDesign(id, { rules }, C);

    test('a row of holes across the body, deeper where the body is', () => {
        const { spots } = W.pocketsOf(design('wedge'), C);
        expect(spots.map((s) => s.inches)).toEqual(C.bench.pockets.at);
        // The kit's full width takes three holes, a bullet's narrow nose fewer.
        expect(spots.every((s) => s.across === 3)).toBe(true);
        expect(W.pocketsOf(design('bullet'), C).spots[0].across).toBe(2);
        // Room grows toward a wedge's tall tail.
        const room = spots.map((s) => W.roomLeft(s, C));
        expect(room[room.length - 1]).toBeGreaterThan(room[0]);
        for (let i = 1; i < room.length; i++) expect(room[i]).toBeGreaterThanOrEqual(room[i - 1]);
        // A thin wedge's nose is too thin for tungsten, though a strip sticks on.
        const thin = W.pocketsOf(design('thinWedge'), C).spots[0];
        expect(W.fitOf(thin, 'cylinder', C)).toBe('no-wood');
        expect(W.fitOf(thin, 'strip', C)).toBe('ok');
        expect(W.fitOf(thin, 'lead', C)).toBe('unknown');
        // Three shallow holes are not one deep one: no room, and it says so.
        expect(W.roomLeft(thin, C)).toBe(0);
        expect(W.holdsTungsten(thin, C)).toBe(false);
        expect(W.holdsTungsten(spots[0], C)).toBe(true);
    });

    test('weights by hand: in until the pocket is full, out the last one first', () => {
        let b = design('wedge');
        const cap = W.roomLeft(W.pocketsOf(b, C).spots[0], C);
        for (let i = 0; i < cap; i++) {
            const r = W.addWeight(b, 0, 'cylinder', C);
            expect(r.why).toBe('ok');
            b = { ...b, weights: r.weights };
        }
        expect(W.addWeight(b, 0, 'cylinder', C)).toEqual({ weights: null, why: 'full' });
        b = { ...b, weights: W.addWeight(b, 0, 'strip', C).weights };
        b = { ...b, weights: W.addWeight(b, 0, 'strip', C).weights };
        expect(W.addWeight(b, 0, 'strip', C).why).toBe('full');
        expect(W.addWeight(b, 0, 'putty', C).why).toBe('unknown');
        expect(W.addWeight(b, 99, 'cube', C).why).toBe('unknown');
        // The pieces are where the pocket is, so car.js weighs them there.
        expect(b.weights.every((w) => Math.abs(w.x - 0.5 * IN) < 1e-12)).toBe(true);
        const out = W.removeWeight(b, 0, C);
        expect(out).toHaveLength(b.weights.length - 1);
        expect(out.filter((w) => w.kind === 'strip')).toHaveLength(1);
        expect(W.removeWeight(design('wedge'), 0, C)).toBeNull();
        expect(W.removeWeight(b, 99, C)).toBeNull();
    });

    test('a shape change keeps what still fits and counts what does not', () => {
        let b = design('block');
        for (let i = 0; i < 6; i++) b = { ...b, weights: W.addWeight(b, 0, 'cylinder', C).weights };
        b = { ...b, weights: b.weights.concat([{ kind: 'cylinder', x: 1.3 * IN }]) };
        const thin = { ...b, stations: C.designs.thinWedge.stations };
        const f = W.fitWeights(thin, C);
        expect(f.weights).toHaveLength(0);
        expect(f.dropped).toBe(7);
        expect(W.fitWeights(b, C)).toEqual({ weights: b.weights.slice(0, 6), dropped: 1 });
    });

    test('an Outlaw car may stack its tungsten proud of the body', () => {
        const std = W.pocketsOf(design('lowRider'), C).spots[5];
        const out = W.pocketsOf(design('lowRider', 'outlaw'), C).spots[5];
        expect(out.budget).toBeGreaterThan(std.budget);
        expect(out.budget - std.budget).toBeCloseTo(out.across * C.bench.pockets.proud * IN, 12);
    });

    test('Auto-weigh fills the pockets to the limit, the balance in the sweet spot where the body allows', () => {
        for (const id of C.bench.designs) {
            for (const rules of ['standard', 'outlaw']) {
                const b = design(id, rules);
                const target = W.autoTarget(rules, C);
                const weights = W.autoWeighPockets(b, target, C);
                const weighed = { ...b, weights };
                expect(massOf(weighed)).toBeCloseTo(target.mass, 3);
                expect(Car.isLegal(Car.describeCar(weighed, C))).toBe(true);
                // Every piece is in a pocket, none loose, none overfilled.
                const p = W.pocketsOf(weighed, C);
                expect(p.loose).toHaveLength(0);
                for (const s of p.spots) expect(s.used).toBeLessThanOrEqual(s.budget + 1e-12);
            }
        }
        // A wedge reaches the mark. A bulky block cannot: its own wood keeps
        // its balance forward, all the weight at the tail (M0's finding).
        expect(balanceOf({ ...design('wedge'), weights: W.autoWeighPockets(design('wedge'), W.autoTarget('standard', C), C) })).toBeCloseTo(0.875, 2);
        const block = { ...design('block'), weights: W.autoWeighPockets(design('block'), W.autoTarget('standard', C), C) };
        expect(balanceOf(block)).toBeGreaterThan(1.5);
        expect(block.weights.every((w) => w.x === C.bench.pockets.at[C.bench.pockets.at.length - 1] * IN)).toBe(true);
        // An Outlaw stacks to the track's 16 oz.
        expect(W.autoTarget('outlaw', C)).toEqual({ mass: 16, balance: C.bench.autoBalance });
    });

    test('a car already at the mark gets no weights, and a car with nowhere to put them comes as close as it can', () => {
        expect(W.autoWeighPockets(design('block'), { mass: 3, balance: 1 }, C)).toEqual([]);
        // A sliver of a car: far too little room for 16 ounces.
        const sliver = { rules: 'standard', stations: [[0, 0, 0.004, 0.02], [C.kit.length, 0, 0.004, 0.02]], weights: [], tune: C.stockTune };
        const weights = W.autoWeighPockets(sliver, { mass: 16, balance: 1 }, C);
        expect(massOf({ ...sliver, weights })).toBeLessThan(16);
        expect(weights.every((w) => w.kind === 'strip' || w.kind === 'putty')).toBe(true);
    });
});

test('the garage writes nothing but its three keys', () => {
    globalThis.localStorage = storage();
    const spy = jest.spyOn(globalThis.localStorage, 'setItem');
    const g = G.createGarage({ C, rand: seeded() });
    g.keep();
    g.setSetting('units', 'metric');
    g.award('outlaw');
    expect(new Set(spy.mock.calls.map((c) => c[0]))).toEqual(new Set(Object.values(G.KEYS)));
});
