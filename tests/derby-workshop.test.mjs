// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's workshop (M4), from SOURCE: profile.js (the pencil line and
 * the car it cuts), carmesh.js's loft (the body's surface), tools.js (the
 * Cut and the sanding), decals.js (the livery), carve.js and livery.js (the
 * bench's editors, driven by keyboard and pointer under the DOM stub), and
 * the carve-to-make-room Why line.
 *
 * M4's DONE-WHEN is the last test: a custom car built by keyboard alone,
 * and its weight matches its volume.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

let dom;
let C;
let IN;
let OZ;
let Car;
let P;
let G;
let B;
let Copy;
let Mesh;
let D;
let W;

beforeEach(async () => {
    jest.resetModules();
    installThree();
    dom = installDom();
    ({ DERBY_CONFIG: C, IN, OZ } = await import('../www/derby/js/config.js'));
    Car = await import('../www/derby/js/car.js');
    P = await import('../www/derby/js/profile.js');
    G = await import('../www/derby/js/garage.js');
    B = await import('../www/derby/js/bench.js');
    Copy = await import('../www/derby/js/copy.js');
    Mesh = await import('../www/derby/js/carmesh.js');
    D = await import('../www/derby/js/decals.js');
    W = await import('../www/derby/js/weights.js');
});

afterEach(() => dom.uninstall());

function seeded(seed = 11) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** A random carve, every point thrown somewhere and held by setPoint. */
function randomCarve(rand) {
    let c = P.carveFrom(C.designs.block.stations, C);
    for (let k = 0; k < 40; k++) {
        const edge = ['top', 'bottom', 'width'][Math.floor(rand() * 3)];
        const i = Math.floor(rand() * C.workshop.grid.length);
        c = P.setPoint(c, edge, i, rand() * C.kit.width, C);
    }
    return c;
}

describe('the pencil line', () => {
    test('the points beside each axle slot are held, the rest are free', () => {
        expect(C.workshop.grid.map((_, i) => P.isLocked(i, C))).toEqual([false, true, true, false, false, true, true, true]);
        expect(P.limitsOf(1, C)).toEqual({ locked: true, top: [0.45 * IN, C.kit.height], bottom: [0, 0], width: [C.kit.width, C.kit.width] });
        const free = P.limitsOf(3, C);
        expect(free.locked).toBe(false);
        expect(free.width).toEqual([0.5 * IN, C.kit.width]);
    });

    test('whatever the points, the cut car keeps its limits all along, not just at the points', () => {
        const rand = seeded();
        const t = C.workshop.minThickness * IN;
        for (let trial = 0; trial < 60; trial++) {
            const stations = P.stationsFrom(randomCarve(rand), C);
            expect(stations[0][0]).toBe(0);
            expect(stations[stations.length - 1][0]).toBe(C.kit.length);
            for (const [x, b, top, w] of stations) {
                expect(b).toBeGreaterThanOrEqual(-1e-12);
                expect(top).toBeLessThanOrEqual(C.kit.height + 1e-12);
                expect(top - b).toBeGreaterThanOrEqual(t - 1e-9);
                expect(w).toBeGreaterThanOrEqual(C.workshop.minWidth * IN - 1e-12);
                expect(w).toBeLessThanOrEqual(C.kit.width + 1e-12);
                for (const axle of [C.kit.frontAxle, C.kit.rearAxle]) {
                    if (Math.abs(x - axle) <= C.workshop.slot * IN) {
                        expect(b).toBeCloseTo(0, 12);
                        expect(w).toBeCloseTo(C.kit.width, 12);
                        expect(top).toBeGreaterThanOrEqual(C.workshop.axleWood * IN - 1e-9);
                    }
                }
            }
            // And every cut car is legal on the Standard sheet's shape rules.
            const car = Car.describeCar({ rules: 'standard', stations, weights: [], tune: C.stockTune }, C);
            const shape = Car.checkRules(car, 'standard', C).filter((c) => c.rule !== 'mass');
            expect(shape.every((c) => c.ok)).toBe(true);
        }
    });

    test('the curve passes through its points and never overshoots between them', () => {
        const c = P.curvesOf({ top: [0.1, 0.9, 0.9, 0.2, 1, 1, 0.5, 0.5].map((v) => v * IN), bottom: new Array(8).fill(0), width: new Array(8).fill(C.kit.width) }, C);
        const xs = P.gridX(C);
        expect(c.top(xs[3])).toBeCloseTo(0.2 * IN, 12);
        for (let i = 0; i < xs.length - 1; i++) {
            const a = c.top(xs[i]);
            const b = c.top(xs[i + 1]);
            for (let k = 1; k < 20; k++) {
                const v = c.top(xs[i] + ((xs[i + 1] - xs[i]) * k) / 20);
                expect(v).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-12);
                expect(v).toBeLessThanOrEqual(Math.max(a, b) + 1e-12);
            }
        }
    });

    test('a starting design is where the pencil starts, held to the slots', () => {
        const block = P.carveFrom(C.designs.block.stations, C);
        expect(block.top.every((v) => Math.abs(v - C.kit.height) < 1e-12)).toBe(true);
        // A whole block cut along its own outline is still the whole block.
        const vol = (s) => Car.bodyOf(s, C).volume;
        expect(vol(P.stationsFrom(block, C))).toBeCloseTo(vol(C.designs.block.stations), 12);
        // The wedge's nose is too low beside the front slot, so the pencil
        // starts there at the least wood the slot needs.
        const wedge = P.carveFrom(C.designs.wedge.stations, C);
        expect(wedge.top[1]).toBeCloseTo(0.45 * IN, 12);
        expect(wedge.top[0]).toBeCloseTo(0.25 * IN, 12);
    });

    test('a moved point stops at its limits and at its neighbors', () => {
        let c = P.carveFrom(C.designs.block.stations, C);
        const t = C.workshop.minThickness * IN;
        c = P.setPoint(c, 'bottom', 3, 1 * IN, C);
        expect(c.bottom[3]).toBeCloseTo(1 * IN, 12);
        // A top beside a raised bottom cannot come within the least thickness of it.
        const low = P.setPoint(c, 'top', 4, 0, C);
        expect(low.top[4]).toBeCloseTo(1 * IN + t, 12);
        // A bottom cannot rise to within the least thickness of the tops beside it.
        const lowTop = P.setPoint(c, 'top', 0, 0.3 * IN, C);
        const high = P.setPoint(lowTop, 'bottom', 0, 2 * IN, C);
        expect(high.bottom[0]).toBeCloseTo(0.3 * IN - t, 12);
        // A held point's bottom stays flat and its width full.
        expect(P.setPoint(c, 'bottom', 1, 0.5 * IN, C).bottom[1]).toBe(0);
        expect(P.setPoint(c, 'width', 6, 0, C).width[6]).toBe(C.kit.width);
        expect(P.setPoint(c, 'width', 0, 0, C).width[0]).toBeCloseTo(0.5 * IN, 12);
        expect(P.sameCarve(c, c)).toBe(true);
        expect(P.sameCarve(c, low)).toBe(false);
        expect(P.sameCarve(c, null)).toBe(false);
        expect(P.nudge(0, 2, false, C)).toBeCloseTo(0.125 * IN, 12);
        expect(P.nudge(0, -1, true, C)).toBeCloseTo(-0.25 * IN, 12);
    });

    test('a stored carve decides the stations, and a broken one is no carve at all', () => {
        const carve = randomCarve(seeded(4));
        const b = G.normalizeBuild({ carve, stations: C.designs.block.stations }, C);
        expect(b.stations).toEqual(P.stationsFrom(P.clampCarve(carve, C), C));
        expect(P.isCarve(carve, C)).toBe(true);
        for (const bad of [null, {}, { ...carve, top: carve.top.slice(1) }, { ...carve, width: carve.width.map(() => NaN) }, { ...carve, bottom: 'x' }]) {
            expect(P.isCarve(bad, C)).toBe(false);
            expect(G.normalizeBuild({ carve: bad }, C).carve).toBeNull();
        }
    });
});

describe('the body\'s surface', () => {
    const volumes = (stations, sand) => {
        const r = Car.roundOf(sand, C);
        return { mesh: Mesh.volumeOf(Mesh.loftOf(stations, r, C)), body: Car.bodyOf(stations, C, r).volume };
    };

    test('encloses exactly the wood car.js weighs, sanded or not, carved or not', () => {
        const shapes = [...C.bench.designs.map((id) => C.designs[id].stations), P.stationsFrom(randomCarve(seeded(2)), C), P.stationsFrom(randomCarve(seeded(3)), C)];
        for (const stations of shapes) {
            for (const sand of [0, 0.5, 1]) {
                const v = volumes(stations, sand);
                expect(v.mesh).toBeGreaterThan(0);
                expect(Math.abs(v.mesh / v.body - 1)).toBeLessThan(0.005);
            }
        }
    });

    test('sanding rounds the edges, and the wood it takes off comes off the weight', () => {
        const build = Car.buildFromDesign('block', {}, C);
        const sq = Car.describeCar(build, C);
        const round = Car.describeCar({ ...build, tune: { ...build.tune, sand: 1 } }, C);
        const r = C.workshop.round * IN;
        expect(sq.body.volume - round.body.volume).toBeCloseTo((4 - Math.PI) * r * r * C.kit.length, 9);
        expect(round.mass).toBeLessThan(sq.mass);
        expect(round.cdA).toBeLessThan(sq.cdA);
        expect(Car.roundOf(5, C)).toBe(r);
        expect(Car.roundOf(-1, C)).toBe(0);
        // A pinched section takes no more rounding than it has.
        expect(Car.areaAt([[0, 0, 0.002, 0.04], [0.2, 0, 0.002, 0.04]], 0.1, 0.01)).toBeCloseTo(0.002 * 0.04 - (4 - Math.PI) * 0.001 * 0.001, 12);
    });

    test('its faces are grouped for the livery, and every one is mapped onto the block', () => {
        const loft = Mesh.loftOf(C.designs.wedge.stations, 0.002, C);
        expect(loft.groups.map((g) => g.material).sort()).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 3]);
        expect(loft.groups.reduce((n, g) => n + g.count, 0)).toBe(loft.indices.length);
        for (const u of loft.uvs) {
            expect(u).toBeGreaterThanOrEqual(-1e-9);
            expect(u).toBeLessThanOrEqual(1 + 1e-9);
        }
        // Unsanded, there are no rounded edges to make.
        expect(Mesh.loftOf(C.designs.wedge.stations, 0, C).groups).toHaveLength(5);
    });
});

describe('the Cut and the sanding', () => {
    test('the offcuts are exactly the wood that came off', async () => {
        const T = await import('../www/derby/js/tools.js');
        const from = C.designs.block.stations;
        let carve = P.carveFrom(from, C);
        carve = P.setPoint(carve, 'top', 0, 0.3 * IN, C);
        carve = P.setPoint(carve, 'width', 0, 0.8 * IN, C);
        carve = P.setPoint(carve, 'bottom', 3, 0.3 * IN, C);
        const to = P.stationsFrom(carve, C);
        const cuts = T.offcutsOf(from, to);
        const off = Object.values(cuts).reduce((v, rows) => v + T.slabVolume(rows), 0);
        const lost = Car.bodyOf(from, C).volume - Car.bodyOf(to, C).volume;
        expect(Math.abs(off / lost - 1)).toBeLessThan(0.01);
        for (const k of ['top', 'bottom', 'left', 'right']) expect(T.slabVolume(cuts[k])).toBeGreaterThan(0);
        // Cutting along the line it already has takes nothing.
        expect(Object.values(T.offcutsOf(to, to)).every((rows) => T.slabVolume(rows) < 1e-12)).toBe(true);
    });

    test('the saw runs, the car is swapped once as the offcuts fall, and it ends', async () => {
        const T = await import('../www/derby/js/tools.js');
        const sounds = { saw: jest.fn(), sand: jest.fn() };
        const tools = T.createTools(C, sounds);
        const swap = jest.fn();
        const done = jest.fn();
        const to = P.stationsFrom(P.setPoint(P.carveFrom(C.designs.block.stations, C), 'top', 0, 0.3 * IN, C), C);
        tools.cut({ from: C.designs.block.stations, to, swap, done });
        expect(sounds.saw).toHaveBeenCalledWith(C.workshop.cut.saw);
        expect(tools.busy()).toBe(true);
        expect(tools.turning()).toBe(true);
        const step = (s) => { for (let k = 0; k < Math.round(s * 60); k++) tools.update(1 / 60); };
        step(C.workshop.cut.turn + C.workshop.cut.saw * 0.5);
        expect(swap).not.toHaveBeenCalled();
        step(C.workshop.cut.saw * 0.5 + 0.05);
        expect(swap).toHaveBeenCalledTimes(1);
        expect(done).not.toHaveBeenCalled();
        step(C.workshop.cut.fall + 0.1);
        expect(swap).toHaveBeenCalledTimes(1);
        expect(done).toHaveBeenCalledTimes(1);
        expect(tools.busy()).toBe(false);
        tools.update(1);
        // Finished early (the bench closing), it still swaps, once.
        const swap2 = jest.fn();
        tools.cut({ from: C.designs.block.stations, to, swap: swap2, done });
        step(0.3);
        tools.finish();
        expect(swap2).toHaveBeenCalledTimes(1);
        // Reduced motion: straight to the after.
        const swap3 = jest.fn();
        tools.cut({ from: C.designs.block.stations, to, swap: swap3, done, reducedMotion: true });
        expect(swap3).toHaveBeenCalledTimes(1);
        expect(tools.busy()).toBe(false);
        // The sanding block rubs, then lets go.
        const sanded = jest.fn();
        tools.sand({ stations: to, done: sanded });
        expect(sounds.sand).toHaveBeenCalled();
        expect(tools.turning()).toBe(false);
        step(C.workshop.sandSeconds + 0.1);
        expect(sanded).toHaveBeenCalledTimes(1);
        tools.sand({ stations: to, done: sanded, reducedMotion: true });
        expect(sanded).toHaveBeenCalledTimes(2);
    });
});

/** A 2D context that records what is drawn where. */
function recording2d() {
    const calls = [];
    const g = new Proxy({ font: '', fillStyle: '', measureText: (t) => ({ width: String(t).length * 20 }), createLinearGradient: () => ({ addColorStop() {} }) }, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return (...args) => calls.push([prop, ...args]);
        },
        set(target, prop, v) { target[prop] = v; return true; }
    });
    return { g, calls };
}

describe('the livery', () => {
    test('decals are made valid: known kinds, inside the block, six at most', () => {
        const many = new Array(9).fill({ kind: 'star', x: 99, y: -1, size: 'xl' });
        const out = D.normalizeDecals([{ kind: 'skull', x: 0.1 }, null, ...many], C);
        expect(out).toHaveLength(C.workshop.maxDecals);
        expect(out[0]).toEqual({ kind: 'star', x: C.kit.length, y: 0, size: 'm' });
        expect(D.normalizeDecals('flames', C)).toEqual([]);
        const placed = D.placeDecal('flame', C.designs.wedge.stations, C);
        const [b, t] = Car.profileAt(C.designs.wedge.stations, placed.x);
        expect(placed.y).toBeCloseTo((b + t) / 2, 12);
        expect(D.decalSize({ kind: 'star', size: 'l' }).w).toBeCloseTo(0.6 * 1.35 * IN, 12);
    });

    test('the name goes where the body is tall enough to read it, or nowhere', () => {
        const spot = D.nameSpot(C.designs.wedge.stations, 10, C);
        expect(spot.x).toBeGreaterThan(C.kit.length / 2);
        expect(spot.height).toBeGreaterThan(0);
        const sliver = [[0, 0, 0.005, 0.04], [C.kit.length, 0, 0.005, 0.04]];
        expect(D.nameSpot(sliver, 10, C)).toBeNull();
    });

    test('each side reads the right way round, the decals the same distance from the nose', () => {
        const build = { ...G.newCar(C), name: 'Zoom', decals: [{ kind: 'flame', x: 0.05, y: 0.015, size: 'm' }] };
        const a = recording2d();
        const b = recording2d();
        D.drawSide(a.g, 1000, 200, build, 'a', C);
        D.drawSide(b.g, 1000, 200, build, 'b', C);
        const at = (calls, op) => calls.filter((c) => c[0] === op);
        // The flame's corner: near the right on side a (the nose on the right), the left on b.
        const ta = at(a.calls, 'translate')[0];
        const tb = at(b.calls, 'translate')[0];
        expect(ta[1]).toBeGreaterThan(500);
        expect(tb[1]).toBeLessThan(500);
        // Flames trail back: turned on side a only. Words are never turned.
        expect(at(a.calls, 'scale')).toEqual([['scale', -1, 1]]);
        expect(at(b.calls, 'scale')).toEqual([]);
        expect(at(a.calls, 'fillText')[0][1]).toBe('Zoom');
        expect(at(b.calls, 'fillText')[0][1]).toBe('Zoom');
        // The top: the stripe and the number.
        const top = recording2d();
        D.drawTop(top.g, 1000, 250, { ...build, number: 7, paint: { ...build.paint, stripe: 0xffffff } }, C);
        expect(at(top.calls, 'fillText')[0][1]).toBe('7');
        expect(at(top.calls, 'fillRect')).toHaveLength(2);
        expect(D.inkFor(0xffffff)).toBe('#1a1a1a');
        expect(D.inkFor(0x111111)).toBe('#ffffff');
        expect(D.hasLivery(G.newCar(C))).toBe(false);
        expect(D.hasLivery(build)).toBe(true);
        for (const kind of Object.keys(D.DECALS)) expect(() => D.drawArt(recording2d().g, kind, 0, 0, 100, 40, true)).not.toThrow();
        expect(() => D.drawArt(recording2d().g, 'none', 0, 0, 10, 10)).not.toThrow();
    });
});

describe('carve some wood to make room (M4.6)', () => {
    test('a bulky body is told to carve, a slim one to move its weight', () => {
        const block = G.newCar(C, { design: 'block' });
        const wedge = G.newCar(C);
        expect(W.bestBalance(block, C) / IN).toBeGreaterThan(1.5);
        expect(W.bestBalance(wedge, C) / IN).toBeLessThan(0.9);
        const car = { ...Car.describeCar(block, C) };
        const line = { id: 'balance', more: 0.03 };
        expect(Copy.moreLine(line, car, 0.75 * IN, { bulky: true })).toBe(Copy.carveLine(0.03));
        expect(Copy.carveLine(0.03)).toMatch(/^Weight further back would save 0\.030 seconds, but this body has no room for it there\. Carve some wood out of the middle/);
        expect(Copy.moreLine(line, car, 0.75 * IN, { bulky: false })).toMatch(/^Moving the weight back/);
        // A car weighted too far back is still told to move it forward.
        expect(Copy.moreLine(line, { ...car, balance: 0.1 * IN }, 0.75 * IN, { bulky: true })).toMatch(/forward/);
    });
});

// ---- The editors on the bench ------------------------------------------------

const ELS = ['bench-body', 'bench-host', 'bench-host-actions', 'bench-summary', 'bench-race', 'bench-status'];

function setUp() {
    const el = Object.fromEntries(ELS.map((id) => [id, dom.el(id)]));
    const garage = G.createGarage({ C });
    const calls = { changed: [], race: [], units: [], forgot: [], raceAgain: [], track: [], draft: [], cut: [], sand: [] };
    const hooks = Object.fromEntries(Object.keys(calls).map((k) => [k, (...a) => calls[k].push(a)]));
    // The Cut lands at once here; main.js plays it.
    hooks.cut = (...a) => { calls.cut.push(a); a[2](); };
    const bench = B.createBench(el, garage, hooks, C);
    return { garage, calls, bench };
}
function find(root, test) {
    for (const c of root.children || []) {
        if (test(c)) return c;
        const deeper = find(c, test);
        if (deeper) return deeper;
    }
    return null;
}
const byId = (id) => find(dom.el('bench-body'), (n) => n.id === id);
const key = (id, k) => fire(byId(id), 'keydown', { key: k });
const click = (id) => fire(byId(id) || dom.el(id), 'click');
const pick = (id) => {
    const i = byId(id);
    i.checked = true;
    fire(i, 'change');
};
const host = () => dom.el('bench-host').textContent;
const now = (id) => Number(byId(id).getAttribute('aria-valuenow'));

describe('drawing your own', () => {
    test('every point is a slider the keys move, and its limits are its own', () => {
        const { calls } = setUp();
        const sliders = find(dom.el('bench-body'), (n) => n.classList && n.classList.contains('carve-area')).children;
        expect(sliders.map((s) => s.id)).toEqual([
            'bench-top-0', 'bench-bottom-0', 'bench-top-1', 'bench-top-2', 'bench-top-3', 'bench-bottom-3', 'bench-top-4', 'bench-bottom-4', 'bench-top-5', 'bench-top-6', 'bench-top-7'
        ]);
        for (const s of sliders) {
            expect(s.getAttribute('role')).toBe('slider');
            expect(s.getAttribute('tabindex')).toBe('0');
            expect(s.getAttribute('aria-label')).toMatch(/of the line, \d\.00 in from the nose$/);
        }
        const start = now('bench-top-7');
        key('bench-top-7', 'ArrowDown');
        expect(now('bench-top-7')).toBeCloseTo(start - 0.0625, 3);
        expect(byId('bench-top-7').getAttribute('aria-valuetext')).toMatch(/^7\.00 in from the nose, beside an axle slot: 0\.94 in above the bottom$/);
        key('bench-top-7', 'PageDown');
        expect(now('bench-top-7')).toBeCloseTo(start - 0.3125, 3);
        key('bench-top-7', 'Home');
        expect(now('bench-top-7')).toBeCloseTo(0.45, 3);
        key('bench-top-7', 'ArrowLeft');
        expect(now('bench-top-7')).toBeCloseTo(0.45, 3);
        key('bench-top-7', 'End');
        expect(now('bench-top-7')).toBeCloseTo(1.25, 3);
        key('bench-top-7', 'ArrowUp');
        key('bench-top-7', 'Tab');
        // The draft is reported while it differs from the car, and cleared
        // when it no longer does.
        expect(calls.draft.length).toBeGreaterThan(0);
        expect(calls.draft[calls.draft.length - 1][0]).not.toBeNull();
        click('bench-rubout');
        expect(calls.draft[calls.draft.length - 1][0]).toBeNull();
        // From above: the free points' widths only.
        pick('bench-view-top');
        const top = find(dom.el('bench-body'), (n) => n.classList && n.classList.contains('carve-area')).children;
        expect(top.map((s) => s.id)).toEqual(['bench-width-0', 'bench-width-3', 'bench-width-4']);
        key('bench-width-0', 'Home');
        expect(now('bench-width-0')).toBeCloseTo(0.5, 3);
    });

    test('a point follows a drag', () => {
        setUp();
        const knob = byId('bench-top-0');
        fire(knob, 'pointerdown', { pointerId: 1, clientY: 300 });
        // The stub's area is 600 tall: the top of it is the top of the block.
        fire(knob, 'pointermove', { clientY: 0 });
        expect(now('bench-top-0')).toBeCloseTo(1.25, 3);
        fire(knob, 'pointermove', { clientY: 480 });
        expect(now('bench-top-0')).toBeCloseTo(0.25, 3);
        fire(knob, 'pointerup', {});
        fire(knob, 'pointermove', { clientY: 0 });
        expect(now('bench-top-0')).toBeCloseTo(0.25, 3);
    });

    test('Cut along the line keeps the cut car, says what happened to the weights, and a starting design undoes it', () => {
        const { garage, calls } = setUp();
        click('bench-cut');
        expect(calls.cut).toHaveLength(0);
        expect(byId('bench-cut').getAttribute('aria-disabled')).toBe('true');
        for (let i = 0; i < 8; i++) key('bench-top-4', 'ArrowDown');
        expect(byId('bench-cut').getAttribute('aria-disabled')).toBe('false');
        const before = garage.bench();
        click('bench-cut');
        expect(calls.cut).toHaveLength(1);
        const [from, to] = calls.cut[0];
        expect(from.id).toBe(before.id);
        expect(to.carve).not.toBeNull();
        expect(garage.bench().carve).toEqual(to.carve);
        expect(garage.bench().stations).toEqual(P.stationsFrom(to.carve, C));
        expect(Car.describeCar(garage.bench(), C).mass / OZ).toBeCloseTo(5, 2);
        expect(host()).toBe('Cut! Auto-weigh moved the weights to suit the new shape, 5.00 oz in all.');
        expect(byId('bench-shape-box').children[0].textContent).toBe('ShapeYour own, from a Wedge');
        expect(byId('bench-design-wedge').checked).toBe(false);
        // Kept across a reload, the stations cut from the line again.
        const again = G.createGarage({ C }).bench();
        expect(again.carve).toEqual(garage.bench().carve);
        // By hand, a cut that leaves a pocket without wood says so.
        click('bench-allout');
        // The nose pocket filled to the brim, then the nose cut lower.
        for (let i = 0; i < 20; i++) click('bench-pocket-0');
        key('bench-top-0', 'Home');
        click('bench-cut');
        expect(host()).toMatch(/^Cut! (One weight lost its pocket|\d weights lost their pockets)/);
        // The wedge again: a fresh block cut to it.
        pick('bench-design-wedge');
        expect(garage.bench().carve).toBeNull();
        expect(garage.bench().stations).toEqual(C.designs.wedge.stations.map((s) => [...s]));
    });

    test('sanding: a step at a time, kept when let go, the block played', () => {
        const { garage, calls } = setUp();
        const sand = byId('bench-sand');
        sand.value = '3';
        fire(sand, 'input');
        expect(garage.bench().tune.sand).toBe(0);
        fire(sand, 'change');
        expect(garage.bench().tune.sand).toBe(0.75);
        expect(calls.sand).toHaveLength(1);
        expect(host()).toMatch(/^Sanded: rounded\./);
        expect(sand.getAttribute('aria-valuetext')).toBe('Rounded');
    });
});

// The M7.1 sweep: each arrow key on the sanding slider said a 25-word line,
// played the block and its sound.
describe('sanding by keyboard', () => {
    test('each step is kept quietly, and the line and the block come once, when the slider is let go', () => {
        const { garage, calls } = setUp();
        const before = host();
        const sand = byId('bench-sand');
        for (const v of ['1', '2', '3']) {
            fire(sand, 'keydown', { key: 'ArrowRight' });
            sand.value = v;
            fire(sand, 'input');
            fire(sand, 'change');
        }
        expect(garage.bench().tune.sand).toBe(0.75);
        expect(calls.sand).toHaveLength(0);
        expect(host()).toBe(before);
        fire(sand, 'blur');
        expect(calls.sand).toHaveLength(1);
        expect(host()).toMatch(/^Sanded: rounded\./);
        // Let go once is said once.
        fire(sand, 'blur');
        expect(calls.sand).toHaveLength(1);
        // A drag after the keys says it at once again.
        fire(sand, 'pointerdown');
        sand.value = '4';
        fire(sand, 'change');
        expect(calls.sand).toHaveLength(2);
    });
});

describe('a button that hides itself hands focus on (M7.1)', () => {
    test('Rub out the line gives focus to the line\'s first point', () => {
        setUp();
        key('bench-top-3', 'ArrowDown');
        const rub = byId('bench-rubout');
        expect(rub.hidden).toBe(false);
        rub.focus();
        fire(rub, 'click');
        expect(rub.hidden).toBe(true);
        expect(globalThis.document.activeElement).toBe(byId('bench-top-0'));
    });

    test('peeling off the last decal gives focus to Stick it on', () => {
        const { garage } = setUp();
        click('bench-decal-add');
        click('bench-decal-add');
        const peel = byId('bench-decal-remove');
        peel.focus();
        fire(peel, 'click');
        // One left: Peel it off stays, and keeps focus.
        expect(garage.bench().decals).toHaveLength(1);
        expect(globalThis.document.activeElement).toBe(peel);
        fire(peel, 'click');
        expect(garage.bench().decals).toHaveLength(0);
        expect(globalThis.document.activeElement).toBe(byId('bench-decal-add'));
    });
});

describe('decals and name', () => {
    test('the name is typed, cleaned and kept, the number too', () => {
        const { garage, calls } = setUp();
        const name = byId('bench-name');
        expect(name.getAttribute('placeholder')).toBe('Blue Wedge');
        name.value = '  Lightning\u0007 McQ  ';
        fire(name, 'input');
        expect(dom.el('bench-summary').textContent).toMatch(/^Lightning McQ ·/);
        expect(G.createGarage({ C }).bench().name).toBe('');
        fire(name, 'change');
        expect(garage.bench().name).toBe('Lightning McQ');
        // The pings say only that a name was set, never the name.
        const ping = calls.track.find((c) => c[1].kind === 'name');
        expect(ping[1]).toEqual({ kind: 'name', outcome: 'set' });
        const number = byId('bench-number');
        number.value = '7a';
        fire(number, 'change');
        expect(garage.bench().number).toBe(7);
        number.value = '';
        fire(number, 'change');
        expect(garage.bench().number).toBeNull();
        expect(byId('bench-livery-box').children[0].textContent).toBe('Decals and name“Lightning McQ”');
    });

    test('decals: stuck on, moved by the sliders or a drag, sized, peeled off, six at most', () => {
        const { garage } = setUp();
        expect(byId('bench-decal-add').parentElement.parentElement.children.find((c) => c.classList && c.classList.contains('bench-placed')).hidden).toBe(true);
        pick('bench-decal-kind-star');
        click('bench-decal-add');
        expect(garage.bench().decals).toHaveLength(1);
        expect(garage.bench().decals[0].kind).toBe('star');
        expect(host()).toBe('Star stuck on. Move it with the sliders, or drag it on the picture.');
        const along = byId('bench-decal-x');
        along.value = '20';
        fire(along, 'change');
        expect(garage.bench().decals[0].x).toBeCloseTo(0.2 * C.kit.length, 9);
        const up = byId('bench-decal-y');
        up.value = '80';
        fire(up, 'change');
        expect(garage.bench().decals[0].y).toBeCloseTo(0.8 * C.kit.height, 9);
        pick('bench-decal-size-l');
        expect(garage.bench().decals[0].size).toBe('l');
        const preview = find(dom.el('bench-body'), (n) => n.classList && n.classList.contains('livery-preview'));
        fire(preview, 'pointerdown', { pointerId: 1, clientX: 400, clientY: 300 });
        fire(preview, 'pointermove', { clientX: 800, clientY: 600 });
        fire(preview, 'pointerup', { clientX: 800, clientY: 600 });
        expect(garage.bench().decals[0].x).toBeCloseTo(C.kit.length, 9);
        expect(garage.bench().decals[0].y).toBeCloseTo(0, 9);
        for (let i = 0; i < 7; i++) click('bench-decal-add');
        expect(garage.bench().decals).toHaveLength(C.workshop.maxDecals);
        expect(host()).toMatch(/^That’s as many decals as a car this size can wear\./);
        click('bench-decal-remove');
        expect(garage.bench().decals).toHaveLength(C.workshop.maxDecals - 1);
        expect(host()).toMatch(/ peeled off\.$/);
    });
});

test('the workshop\'s words keep the house style', () => {
    const style = (s) => {
        expect(typeof s).toBe('string');
        expect(s).not.toMatch(/—|;/);
        expect(s).not.toMatch(/\b(colour|centre|grey|metre)\b/i);
        expect(s).not.toMatch(/pinewood/i);
    };
    for (const v of Object.values(Copy.UI)) style(v);
    for (const v of Copy.SAND) style(v);
    style(Copy.SAY.cutting);
    style(Copy.SAY.cutAuto('5.00 oz'));
    for (const n of [0, 1, 2]) style(Copy.SAY.cutHand(n, '5.00 oz'));
    style(Copy.SAY.sanded('Rounded'));
    style(Copy.SAY.decalsFull);
    style(Copy.SAY.decalOn('Star'));
    style(Copy.SAY.decalOff('Star'));
    style(Copy.carveLine(0.02));
    for (const d of Object.values(D.DECALS)) style(d.label);
});

test('DONE WHEN: a custom car is built by keyboard alone, and its weight matches its volume', () => {
    const { garage, calls } = setUp();
    // Shape: a lower nose, a slimmer waist, a hollowed belly, by arrow keys.
    for (let i = 0; i < 4; i++) key('bench-top-0', 'ArrowDown');
    for (let i = 0; i < 3; i++) key('bench-top-3', 'PageDown');
    key('bench-bottom-3', 'PageUp');
    pick('bench-view-top');
    for (let i = 0; i < 4; i++) key('bench-width-0', 'ArrowDown');
    key('bench-width-4', 'PageDown');
    // A button pressed by Enter or Space is a click.
    click('bench-cut');
    // Sanded, named and numbered, a decal stuck on, all from the keyboard.
    const sand = byId('bench-sand');
    sand.value = '2';
    fire(sand, 'change');
    const name = byId('bench-name');
    name.value = 'Keyboard Comet';
    fire(name, 'change');
    const number = byId('bench-number');
    number.value = '42';
    fire(number, 'change');
    pick('bench-decal-kind-bolt');
    click('bench-decal-add');
    click('bench-race');
    expect(calls.race).toHaveLength(1);

    const build = garage.bench();
    expect(build.carve).not.toBeNull();
    expect(build.name).toBe('Keyboard Comet');
    expect(build.number).toBe(42);
    expect(build.decals).toHaveLength(1);
    const car = Car.describeCar(build, C);
    expect(Car.isLegal(car)).toBe(true);
    // Its wood is the surface's volume times the pine's density, and the
    // rest of its weight is the parts the kit counts.
    const r = Car.roundOf(build.tune.sand, C);
    const surface = Mesh.volumeOf(Mesh.loftOf(build.stations, r, C));
    const K = C.kit;
    let ballast = 0;
    let pocketWood = 0;
    for (const w of build.weights) {
        const m = Car.weightMass(w, C);
        ballast += m;
        if (C.weights[w.kind].pocket) pocketWood += (m / C.weights[w.kind].density) * K.woodDensity;
    }
    const parts = K.paintMass + 4 * (K.wheel.mass + K.axle.mass) + ballast - pocketWood;
    expect(Math.abs((surface * K.woodDensity + parts) / car.mass - 1)).toBeLessThan(0.002);
});

describe('the editors from source (the bench reaches them through their builds)', () => {
    /** The helpers bench.js hands the editors, kept minimal. */
    async function kitFor(build) {
        const { h } = await import('../www/derby/js/board.js');
        const listen = (n, t, fn) => n.addEventListener(t, fn);
        const choice = (type, name, value, label, blurb, onChange, cls = '') => {
            const input = document.createElement('input');
            input.type = type;
            input.name = name;
            input.value = value;
            input.id = `${name}-${value}`;
            listen(input, 'change', () => onChange(input));
            const text = h('span', 'choice-text', null, [h('span', 'choice-label', label), blurb ? h('span', 'choice-blurb', blurb) : null]);
            return { wrap: h('label', `choice ${cls}`, null, [input, text]), input, text };
        };
        const group = (legend, kids, cls) => h('fieldset', null, null, [h('legend', null, legend), h('div', cls, null, kids)]);
        const button = (id, text, fn, cls) => {
            const b = h('button', cls, text);
            b.id = id;
            listen(b, 'click', fn);
            return b;
        };
        const state = { build, said: [], cuts: [], drafts: [], sands: [] };
        const kit = {
            h, choice, group, button, listen, units: () => 'us', garage: { nameOf: () => 'Blue Wedge' },
            build: () => state.build,
            commit: (next, line) => { state.build = G.normalizeBuild(next, C); if (line) state.said.push(line); },
            say: (t) => state.said.push(t), status() {}, track() {},
            onDraft: (d) => state.drafts.push(d), onCut: (c) => state.cuts.push(c), onSand: (v, final) => state.sands.push([v, final])
        };
        return { kit, state };
    }
    const inside = (root, id) => find(root, (n) => n.id === id);

    test('the carver: keys, a drag, both views, rub out, cut, and the sanding', async () => {
        const { createCarver } = await import('../www/derby/js/carve.js');
        const { kit, state } = await kitFor(G.newCar(C));
        const body = document.createElement('div');
        const carver = createCarver(body, kit, C);
        carver.reset(state.build);
        expect(carver.changed()).toBe(false);
        for (const k of ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'x']) {
            fire(inside(body, 'bench-top-3'), 'keydown', { key: k });
        }
        fire(inside(body, 'bench-top-3'), 'keydown', { key: 'Home' });
        expect(carver.changed()).toBe(true);
        expect(state.drafts[state.drafts.length - 1]).not.toBeNull();
        const knob = inside(body, 'bench-bottom-4');
        fire(knob, 'pointermove', { clientY: 0 });
        fire(knob, 'pointerdown', { pointerId: 2, clientY: 0 });
        fire(knob, 'pointermove', { clientY: -50 });
        fire(knob, 'pointercancel', {});
        inside(body, 'bench-view-top').checked = true;
        fire(inside(body, 'bench-view-top'), 'change');
        fire(inside(body, 'bench-width-3'), 'keydown', { key: 'End' });
        fire(inside(body, 'bench-cut'), 'click');
        expect(state.cuts).toHaveLength(1);
        expect(P.isCarve(state.cuts[0], C)).toBe(true);
        fire(inside(body, 'bench-rubout'), 'click');
        expect(carver.changed()).toBe(false);
        expect(state.drafts[state.drafts.length - 1]).toBeNull();
        // Cut with nothing drawn does nothing.
        fire(inside(body, 'bench-cut'), 'click');
        expect(state.cuts).toHaveLength(1);
        const sand = inside(body, 'bench-sand');
        sand.value = '4';
        fire(sand, 'input');
        fire(sand, 'change');
        expect(state.sands).toEqual([[1, false], [1, true]]);
        carver.update();
        expect(carver.draft()).not.toBeNull();
        // The drawing's arithmetic.
        const C2 = await import('../www/derby/js/carve.js');
        expect(C2.fromView('side', 0, C)).toBeCloseTo(C.kit.height, 12);
        expect(C2.fromView('top', 0.5, C)).toBe(0);
        expect(C2.toView('top', 0, 0, C)).toEqual([0, C2.viewOf('top', C).h / 2]);
        expect(C2.handlesOf('top', C)).toEqual([['width', 0], ['width', 3], ['width', 4]]);
    });

    test('the livery section: the name, the number, and every decal control', async () => {
        const { createLivery } = await import('../www/derby/js/livery.js');
        const { kit, state } = await kitFor(G.newCar(C));
        const body = document.createElement('div');
        const livery = createLivery(body, kit, C);
        livery.update();
        const name = inside(body, 'bench-name');
        name.value = 'Zip';
        fire(name, 'input');
        fire(name, 'change');
        expect(state.build.name).toBe('Zip');
        const number = inside(body, 'bench-number');
        number.value = '9';
        fire(number, 'input');
        fire(number, 'change');
        expect(state.build.number).toBe(9);
        // Changing a decal before there is one does nothing.
        fire(inside(body, 'bench-decal-remove'), 'click');
        inside(body, 'bench-decal-size-s').checked = true;
        fire(inside(body, 'bench-decal-size-s'), 'change');
        for (const kind of ['flame', 'flame', 'checker']) {
            inside(body, `bench-decal-kind-${kind}`).checked = true;
            fire(inside(body, `bench-decal-kind-${kind}`), 'change');
            fire(inside(body, 'bench-decal-add'), 'click');
            livery.update();
        }
        expect(state.build.decals.map((d) => d.kind)).toEqual(['flame', 'flame', 'checker']);
        expect(livery.picked()).toBe(2);
        // Two of a kind are told apart.
        const chips = find(body, (n) => n.classList && n.classList.contains('bench-placed')).children[1];
        expect(chips.children.map((c) => c.textContent)).toEqual(['Flames 1', 'Flames 2', 'Checkered flag']);
        const first = chips.children[0].children[0];
        first.checked = true;
        fire(first, 'change');
        expect(livery.picked()).toBe(0);
        for (const id of ['bench-decal-x', 'bench-decal-y']) {
            const r = inside(body, id);
            r.value = '50';
            fire(r, 'input');
            fire(r, 'change');
        }
        expect(state.build.decals[0].x).toBeCloseTo(C.kit.length / 2, 9);
        const preview = find(body, (n) => n.classList && n.classList.contains('livery-preview'));
        fire(preview, 'pointermove', { clientX: 1, clientY: 1 });
        fire(preview, 'pointerup', { clientX: 1, clientY: 1 });
        fire(preview, 'pointerdown', { pointerId: 3, clientX: -10, clientY: 900 });
        fire(preview, 'pointermove', { clientX: -10, clientY: 900 });
        fire(preview, 'pointercancel', { clientX: -10, clientY: 900 });
        expect(state.build.decals[0].x).toBe(0);
        fire(inside(body, 'bench-decal-remove'), 'click');
        livery.update();
        expect(state.build.decals).toHaveLength(2);
        for (let i = 0; i < 6; i++) fire(inside(body, 'bench-decal-add'), 'click');
        expect(state.build.decals).toHaveLength(C.workshop.maxDecals);
        expect(state.said[state.said.length - 1]).toMatch(/as many decals/);
        number.value = '';
        fire(number, 'change');
        expect(state.build.number).toBeNull();
        livery.update();
    });
});
