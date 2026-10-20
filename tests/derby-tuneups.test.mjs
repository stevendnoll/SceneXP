// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's tune-ups and check-in (M5), from SOURCE: what each tune-up is
 * worth (sim.tuneupWorth, the Done-when: it shows in the results' Why
 * lines), the tune-ups' animations (tuneups.js), the axle heads' shine
 * (carmesh.shineOf), and the weigh-in (checkin.js) with the page's flows
 * around it: a car that passes, one turned back, Skip, and Escape.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

const { DERBY_CONFIG: C, OZ } = await import('../www/derby/js/config.js');
const Car = await import('../www/derby/js/car.js');
const Sim = await import('../www/derby/js/sim.js');
const Copy = await import('../www/derby/js/copy.js');
const G = await import('../www/derby/js/garage.js');

const STOCK = { deburr: false, polish: 0, graphite: false, align: false, sand: 0 };
const FULL = { deburr: true, polish: 5, graphite: true, align: true, sand: 0 };
const wedge = (tune) => ({ ...G.newCar(C), tune: { ...tune } });
const time = (build) => Sim.neutralTime(Car.describeCar(build, C), C);

describe('what each tune-up is worth', () => {
    test('a stock car: every tune-up still to do, each figure that one change alone', () => {
        const b = wedge(STOCK);
        const rows = Sim.tuneupWorth(b, C);
        expect(rows.map((r) => r.id)).toEqual(['deburr', 'polish', 'graphite', 'align']);
        for (const r of rows) {
            expect(r.done).toBe(false);
            expect(r.saved).toBe(0);
            expect(r.more).toBeGreaterThan(0.002);
        }
        const graphite = rows.find((r) => r.id === 'graphite');
        expect(graphite.more).toBeCloseTo(time(b) - time({ ...b, tune: { ...STOCK, graphite: true } }), 12);
        const polish = rows.find((r) => r.id === 'polish');
        expect(polish.more).toBeCloseTo(time(b) - time({ ...b, tune: { ...STOCK, polish: 5 } }), 12);
        // Graphite is worth the most of the four, then polish (M0's order).
        const sorted = rows.slice().sort((p, q) => q.more - p.more).map((r) => r.id);
        expect(sorted.slice(0, 2)).toEqual(['graphite', 'polish']);
    });

    test('a tuned car: what each was worth, and polish part way says what is left', () => {
        const full = Sim.tuneupWorth(wedge(FULL), C);
        for (const r of full) {
            expect(r.done).toBe(true);
            expect(r.saved).toBeGreaterThan(0.001);
            expect(r.more).toBe(0);
        }
        // Each figure is against the car without that one tune-up, wholly.
        const tuned = wedge(FULL);
        expect(full.find((r) => r.id === 'polish').saved).toBeCloseTo(time({ ...tuned, tune: { ...FULL, polish: 0 } }) - time(tuned), 12);
        expect(full.find((r) => r.id === 'deburr').saved).toBeCloseTo(time({ ...tuned, tune: { ...FULL, deburr: false } }) - time(tuned), 12);
        const part = Sim.tuneupWorth(wedge({ ...FULL, polish: 2 }), C).find((r) => r.id === 'polish');
        expect(part.level).toBe(2);
        expect(part.saved).toBeGreaterThan(0);
        expect(part.more).toBeGreaterThan(0);
        // A step's gain is the bench's word for it.
        const b = wedge(STOCK);
        expect(Sim.tuneGain(b, STOCK, { ...STOCK, deburr: true }, C)).toBeCloseTo(Sim.tuneupWorth(b, C)[0].more, 12);
    });

    test('the results say each one, done or not (the Done-when)', () => {
        const stock = Copy.tuneupLines(Sim.tuneupWorth(wedge(STOCK), C));
        expect(stock).toHaveLength(4);
        expect(stock[0]).toMatch(/^Filing off the burrs would save 0\.\d{3} seconds\.$/);
        expect(stock[1]).toMatch(/^Polishing the axles would save 0\.\d{3} seconds\.$/);
        expect(stock[2]).toMatch(/^A puff of graphite would save 0\.\d{3} seconds\.$/);
        expect(stock[3]).toMatch(/^Aligning the wheels would save 0\.\d{3} seconds\.$/);
        const full = Copy.tuneupLines(Sim.tuneupWorth(wedge(FULL), C));
        expect(full[0]).toMatch(/^De-burred axles: worth /);
        expect(full[1]).toMatch(/^Axles polished through the compound: worth /);
        expect(full[2]).toMatch(/^Graphite in the wheels: worth /);
        expect(full[3]).toMatch(/^Straight wheels: worth /);
        const part = Copy.tuneupLines(Sim.tuneupWorth(wedge({ ...FULL, polish: 3 }), C))[1];
        expect(part).toMatch(/^Axles polished to 1200 grit: worth 0\.\d{3} seconds\. Polishing on through the compound would save 0\.\d{3} seconds more\.$/);
        for (const l of [...stock, ...full, part]) expect(l).not.toMatch(/—|;/);
        expect(Copy.polishButton(0)).toBe('Polish with 400 grit');
        expect(Copy.polishButton(4)).toBe('Polish with compound');
        expect(Copy.polishButton(5)).toBe('');
    });
});

describe('the tune-ups on the turntable', () => {
    let dom;
    beforeEach(() => {
        jest.resetModules();
        installThree();
        dom = installDom();
    });
    afterEach(() => dom.uninstall());

    test('the axle heads shine more with each grit', async () => {
        const Mesh = await import('../www/derby/js/carmesh.js');
        const steps = [0, 1, 2, 3, 4, 5].map((polish) => Mesh.shineOf({ ...FULL, polish }, C));
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].roughness).toBeLessThan(steps[i - 1].roughness);
            expect(steps[i].metalness).toBeGreaterThan(steps[i - 1].metalness);
        }
        expect(Mesh.shineOf(STOCK, C)).toEqual({ roughness: C.tuneups.shine.roughness[0], metalness: C.tuneups.shine.metalness[0] });
        expect(Mesh.shineOf(null, C).roughness).toBe(C.tuneups.shine.roughness[0]);
        expect(Mesh.shineOf({ ...STOCK, deburr: true }, C).roughness).toBeLessThan(C.tuneups.shine.roughness[0]);
        expect(Mesh.buildCarMesh(wedge(FULL), Car.describeCar(wedge(FULL), C), {}, C).heads).toHaveLength(4);
    });

    test('Align rolls the car down the board drifting, taps it straight, and rolls it true', async () => {
        const T = await import('../www/derby/js/tuneups.js');
        const A = C.tuneups.align;
        expect(T.alignAt(0, C)).toEqual({ x: 0, z: 0, tapping: false });
        const drifted = T.alignAt(A.run - 1e-9, C);
        expect(drifted.x).toBeCloseTo(C.tuneups.board, 6);
        expect(drifted.z).toBeCloseTo(C.tuneups.drift, 6);
        expect(T.alignAt(A.run + A.back + A.fix / 2, C).tapping).toBe(true);
        const straight = T.alignAt(A.run + A.back + A.fix + A.run * 0.99, C);
        expect(straight.z).toBe(0);
        expect(straight.x).toBeGreaterThan(C.tuneups.board * 0.9);
        const end = T.alignAt(T.lengthOf('align', C), C);
        expect(end.x).toBeCloseTo(0, 9);
        expect(T.lengthOf('deburr', C)).toBe(C.tuneups.deburr);
        expect(T.lengthOf('nothing', C)).toBe(0);
    });

    test('each animation swaps the car once, at its change, and ends; reduced motion is the after', async () => {
        const T = await import('../www/derby/js/tuneups.js');
        const Mesh = await import('../www/derby/js/carmesh.js');
        const sounds = { file: jest.fn(), drill: jest.fn(), puff: jest.fn(), tap: jest.fn(), roll: jest.fn() };
        const tools = T.createTuneups(C, sounds);
        const wheels = Mesh.wheelSpots(Car.describeCar(wedge(STOCK), C), C);
        const step = (s) => {
            let off = null;
            for (let k = 0; k < Math.round(s * 60); k++) off = tools.update(1 / 60) || off;
            return off;
        };
        for (const kind of ['deburr', 'polish', 'graphite', 'align']) {
            const swap = jest.fn();
            const done = jest.fn();
            const spin = jest.fn();
            tools.play(kind, { wheels, spin, swap, done });
            expect(tools.busy()).toBe(true);
            expect(tools.turning()).toBe(true);
            const mid = step(T.lengthOf(kind, C) * 0.15);
            if (kind === 'align') expect(mid.x).toBeGreaterThan(0);
            step(T.lengthOf(kind, C) * 0.9 + 0.1);
            expect(swap).toHaveBeenCalledTimes(1);
            expect(done).toHaveBeenCalledTimes(1);
            expect(tools.busy()).toBe(false);
            if (kind === 'graphite' || kind === 'align') expect(spin).toHaveBeenCalled();
        }
        expect(sounds.file).toHaveBeenCalled();
        expect(sounds.drill).toHaveBeenCalled();
        expect(sounds.puff).toHaveBeenCalledTimes(2);
        expect(sounds.tap).toHaveBeenCalled();
        expect(tools.update(1)).toBeNull();
        // A second step pressed mid-way finishes the first.
        const first = jest.fn();
        tools.play('deburr', { wheels, swap: first });
        step(0.2);
        tools.play('graphite', { wheels });
        expect(first).toHaveBeenCalledTimes(1);
        tools.finish();
        const after = jest.fn();
        tools.play('align', { wheels, swap: after, reducedMotion: true });
        expect(after).toHaveBeenCalledTimes(1);
        expect(tools.busy()).toBe(false);
    });
});

describe('the weigh-in', () => {
    let Ck;
    beforeEach(async () => {
        Ck = await import('../www/derby/js/checkin.js');
    });

    const over = () => {
        const b = G.newCar(C);
        return { ...b, weights: b.weights.concat([{ kind: 'cylinder', x: b.weights[0].x }, { kind: 'cylinder', x: b.weights[0].x }]) };
    };

    test('its verdict is the sheet\'s: the scale judges the weight, the gauge box the rest', () => {
        expect(Ck.verdictOf(G.newCar(C), C)).toMatchObject({ ok: true, failed: null });
        expect(Ck.verdictOf(over(), C)).toMatchObject({ ok: false, failed: 'mass' });
        const wide = { ...G.newCar(C), weights: [], stations: [[0, 0, 0.02, 0.08], [C.kit.length, 0, 0.02, 0.08]] };
        expect(Ck.verdictOf(wide, C)).toMatchObject({ ok: false, failed: 'shape' });
        // An Outlaw car at 16 oz keeps its own sheet.
        const outlaw = G.weighAuto({ ...G.newCar(C), rules: 'outlaw' }, C);
        expect(Ck.verdictOf(outlaw, C).ok).toBe(true);
    });

    test('the timeline: on the scale, the count, the gauge box, the result; a second car faster; a fail stops it', () => {
        const one = Ck.planWeighIn([G.newCar(C)], {}, C);
        expect(one.segments.map((s) => s.kind)).toEqual(['place', 'count', 'hold', 'gauge', 'result']);
        expect(one.failedAt).toBe(-1);
        const W = C.weighIn;
        expect(one.total).toBeCloseTo(W.place + W.count + W.hold + W.gauge + W.result, 9);
        const two = Ck.planWeighIn([G.newCar(C), G.newCar(C)], {}, C);
        expect(two.segments.filter((s) => s.car === 1)).toHaveLength(5);
        expect(two.total).toBeLessThan(one.total * 2);
        const failing = Ck.planWeighIn([over(), G.newCar(C)], {}, C);
        expect(failing.failedAt).toBe(0);
        expect(failing.segments.map((s) => s.kind)).toEqual(['place', 'count', 'over']);
        const wide = { ...G.newCar(C), weights: [], stations: [[0, 0, 0.02, 0.08], [C.kit.length, 0, 0.02, 0.08]] };
        expect(Ck.planWeighIn([wide], {}, C).segments.map((s) => s.kind)).toEqual(['place', 'count', 'hold', 'gauge', 'stuck']);
        const still = Ck.planWeighIn([G.newCar(C), over()], { reducedMotion: true }, C);
        expect(still.segments.map((s) => s.kind)).toEqual(['still', 'over']);
        expect(Ck.planWeighIn([wide], { reducedMotion: true }, C).segments[0].kind).toBe('stuck');
        // Moments, and the reading's count-up.
        expect(Ck.weighMoment(one, 0).kind).toBe('place');
        expect(Ck.weighMoment(one, one.total + 1)).toMatchObject({ kind: 'result', done: true, progress: 1 });
        expect(Ck.readingShare('place', 0.5)).toBe(0);
        expect(Ck.readingShare('count', 0)).toBe(0);
        expect(Ck.readingShare('count', 1)).toBe(1);
        expect(Ck.readingShare('count', 0.5)).toBeGreaterThan(0.5);
        expect(Ck.readingShare('gauge', 0.2)).toBe(1);
    });

    test('the table: the car on the scale, through the gauge box, and the camera on it', () => {
        jest.resetModules();
        installThree();
        const dom = installDom();
        try {
            const t = Ck.buildCheckinTable(C);
            const on = t.carAt('hold', 0);
            const start = t.carAt('gauge', 0);
            const end = t.carAt('gauge', 1);
            expect(end.x).toBeGreaterThan(start.x);
            expect(start.x).toBeCloseTo(on.x, 9);
            // Off the scale without a jump, and down onto the table.
            expect(start.y).toBeCloseTo(on.y, 9);
            expect(t.carAt('gauge', 0.02).y).toBeGreaterThan(end.y);
            expect(end.y).toBeLessThan(on.y - 0.03);
            expect(t.carAt('result', 0).x).toBeCloseTo(end.x, 9);
            expect(t.carAt('stuck', 0).x).toBeLessThan(end.x);
            expect(t.carAt('place', 0).y).toBeGreaterThan(on.y);
            const shot = t.shot(390 / 844);
            expect(shot.position.z).toBeGreaterThan(shot.target.z);
            expect(() => t.setReading('5.00 oz', false)).not.toThrow();
            expect(() => t.setReading('5.50 oz', true)).not.toThrow();
        } finally {
            dom.uninstall();
        }
    });

    test('its words keep the house style', () => {
        for (const [k, v] of Object.entries(Copy.WEIGH)) {
            const s = typeof v === 'string' ? v : v('Blue Wedge', k === 'spoken' ? '5.00 oz' : '0.12 oz', true);
            expect(s).not.toMatch(/—|;/);
        }
        expect(Copy.WEIGH.spoken('A', '5 oz', false)).toBe('A does not pass the weigh-in.');
    });
});

describe('on the page', () => {
    let dom;
    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
        installThree();
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
    });

    async function boot() {
        const main = await import('../www/derby/js/main.js');
        await flushAsync(30);
        await jest.advanceTimersByTimeAsync(500);
        return main;
    }
    function frames(main, seconds, fps = 30) {
        const loop = dom.loops[dom.loops.length - 1];
        const spy = jest.spyOn(performance, 'now');
        let now = main.getState().lastTime;
        for (let i = 1; i <= Math.round(seconds * fps); i++) {
            now += 1000 / fps;
            spy.mockReturnValue(now);
            loop();
        }
        spy.mockRestore();
    }
    function find(root, test) {
        for (const c of root.children || []) {
            if (test(c)) return c;
            const deeper = find(c, test);
            if (deeper) return deeper;
        }
        return null;
    }
    const control = (id) => find(dom.el('bench-body'), (n) => n.id === id);
    const host = () => dom.el('bench-host').textContent;

    test('a tune-up plays on the turntable: the old car until the change, then the tuned one and its worth', async () => {
        const main = await boot();
        const before = main.__test__.benchMesh();
        fire(control('bench-graphite'), 'click');
        expect(host()).toBe('Puff in graphite…');
        expect(main.__test__.garage().bench().tune.graphite).toBe(true);
        frames(main, 0.5);
        expect(main.__test__.benchMesh()).toBe(before);
        frames(main, 1.5);
        expect(main.__test__.benchMesh()).not.toBe(before);
        expect(host()).toMatch(/^A puff of graphite in every wheel/);
        // Align rolls the car off the turntable and brings it back.
        fire(control('bench-align'), 'click');
        frames(main, 0.6);
        expect(main.getState().benchOffset).toBeGreaterThan(0);
        frames(main, 4);
        expect(main.getState().benchOffset).toBe(0);
        expect(host()).toMatch(/^It drifted toward the rail/);
    });

    test('the results show what each tune-up was worth, and not for a Time Trial', async () => {
        const main = await boot();
        fire(dom.el('bench-race'), 'click');
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        main.__test__.finishRace('skip');
        expect(dom.el('results-tuneups').children.map((li) => li.textContent)).toEqual(
            Copy.tuneupLines(Sim.tuneupWorth(main.__test__.garage().bench(), C)));
        expect(dom.el('results-tuneups').hidden).toBe(false);
        fire(dom.el('results-another'), 'click');
        const trial = dom.el('event-options').children.map((l) => l.children[0]).find((i) => i.value === 'trial');
        trial.checked = true;
        fire(trial, 'change');
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        main.__test__.finishRace('skip');
        expect(dom.el('results-tuneups').hidden).toBe(true);
        expect(dom.el('results-tuneups-heading').hidden).toBe(true);
    });

    test('a car over the limit is weighed, buzzed, and handed back kindly to the bench', async () => {
        const main = await boot();
        const state = main.getState();
        // Two cylinders over: the bench lets it go, the weigh-in will not.
        fire(control('bench-pocket-5'), 'click');
        fire(control('bench-pocket-5'), 'click');
        fire(dom.el('bench-race'), 'click');
        expect(state.phase).toBe('checkin');
        expect(dom.el('car-options').children[0].textContent).toMatch(/the weigh-in will hand it back/);
        fire(dom.el('go-btn'), 'click');
        expect(state.phase).toBe('weighin');
        frames(main, state.weigh.plan.total + 0.2);
        expect(state.phase).toBe('weighin');
        expect(dom.el('weighin-note').classList.contains('hidden')).toBe(false);
        expect(dom.el('weighin-text').textContent).toMatch(/^Blue Wedge weighs in 0\.\d\d oz over the limit, so it can’t race just yet\./);
        expect(dom.el('race-status').textContent).toBe('Blue Wedge does not pass the weigh-in.');
        expect(dom.el('skip-btn').classList.contains('visible')).toBe(false);
        // Frames after the note change nothing.
        frames(main, 1);
        expect(state.phase).toBe('weighin');
        fire(dom.el('weighin-back'), 'click');
        expect(state.phase).toBe('bench');
        expect(dom.el('weighin-note').classList.contains('hidden')).toBe(true);
        expect(host()).toMatch(/^The weigh-in sent Blue Wedge back to the bench\. 0\.\d\d oz over\. Please take a weight out\.$/);
        expect(find(dom.el('bench-body'), (n) => n.id === 'bench-rules-box').open).toBe(true);
        // The back button with nothing to go back from does nothing.
        fire(dom.el('weighin-back'), 'click');
        expect(state.phase).toBe('bench');
    });

    test('Skip goes straight to the race, or to the note of a car that would not have passed; Escape goes back to check-in', async () => {
        const main = await boot();
        const state = main.getState();
        fire(dom.el('bench-race'), 'click');
        fire(dom.el('go-btn'), 'click');
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(state.phase).toBe('checkin');
        expect(state.weigh).toBeNull();
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('help-btn'), 'click');
        expect(state.phase).toBe('checkin');
        fire(dom.el('checkin-back'), 'click');
        fire(control('bench-pocket-5'), 'click');
        fire(control('bench-pocket-5'), 'click');
        fire(dom.el('bench-race'), 'click');
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        expect(state.phase).toBe('weighin');
        expect(dom.el('weighin-note').classList.contains('hidden')).toBe(false);
        // A second skip, the note up, does nothing.
        fire(dom.el('skip-btn'), 'click');
        expect(state.phase).toBe('weighin');
    });

    test('reduced motion: each car held still at its reading, then the race', async () => {
        dom.windowStub.matchMedia = (q) => ({
            media: q, matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
        });
        const main = await boot();
        const state = main.getState();
        fire(dom.el('bench-race'), 'click');
        fire(dom.el('go-btn'), 'click');
        expect(state.weigh.plan.segments.map((s) => s.kind)).toEqual(['still']);
        frames(main, C.weighIn.still + 0.2);
        expect(state.phase).toBe('race');
        // A reduced-motion tune-up is the after, at once.
        fire(dom.el('help-btn'), 'click');
        fire(dom.el('checkin-back'), 'click');
        const before = main.__test__.benchMesh();
        fire(control('bench-deburr'), 'click');
        expect(main.__test__.benchMesh()).not.toBe(before);
        expect(host()).toMatch(/^The burrs are filed off every axle\./);
        expect(OZ).toBeGreaterThan(0);
    });
});
