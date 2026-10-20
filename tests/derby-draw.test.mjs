// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's drawing parts (M1), from SOURCE: hall.js, track.js's mesh,
 * carmesh.js, and board.js's timer and results. main.js reaches them
 * through their .min builds, which the coverage report does not count
 * against the source (the ".min imports hide coverage" lesson), so they are
 * run here under the stubs, with what they build checked.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom } from './helpers/dom-stub.mjs';

let dom;
let C;
let Car;

beforeEach(async () => {
    jest.resetModules();
    installThree();
    dom = installDom();
    ({ DERBY_CONFIG: C } = await import('../www/derby/js/config.js'));
    Car = await import('../www/derby/js/car.js');
});

afterEach(() => dom.uninstall());

test('the hall builds, with its one shadowed light only when shadows are on', async () => {
    const { buildHall, HALL } = await import('../www/derby/js/hall.js');
    expect(() => buildHall(C, { shadows: true })).not.toThrow();
    expect(() => buildHall(C)).not.toThrow();
    expect(HALL.x1).toBeGreaterThan(C.track.courseLength + C.track3d.braking);
});

test('the track builds, its gate has a pin a lane, and the pins drop flat', async () => {
    const { buildTrack } = await import('../www/derby/js/track.js');
    const t = buildTrack(C, { shadows: true });
    expect(t.gate.pins).toHaveLength(C.track.lanes);
    expect(t.finishX).toBeGreaterThan(11);
    expect(() => t.gate.set(1)).not.toThrow();
    expect(() => t.gate.set(0)).not.toThrow();
});

test('a car mesh builds from any design, rolls its wheels, and lets go of what it made', async () => {
    const { buildCarMesh } = await import('../www/derby/js/carmesh.js');
    for (const design of Object.keys(C.designs)) {
        const build = Car.buildFromDesign(design);
        const m = buildCarMesh(build, Car.describeCar(build), { color: 0x123456, shadows: true });
        expect(m.wheels).toHaveLength(4);
        expect(() => m.roll(1.5)).not.toThrow();
        expect(() => m.dispose()).not.toThrow();
    }
});

test('the timer fills each lane as its car crosses, lights the visitor\'s row, and clears an empty lane', async () => {
    const { createTimer } = await import('../www/derby/js/board.js');
    const root = document.createElement('div');
    const timer = createTimer(root);
    timer.build(['Mine', 'B', 'C'], new Set([0]), 4);
    const rows = root.children[1].children;
    expect(rows).toHaveLength(4);
    timer.heat(2, 4);
    expect(root.children[0].textContent).toBe('Heat 2 of 4');
    timer.heat(2, 4, 'Slow motion');
    expect(root.children[0].textContent).toBe('Heat 2 of 4 · Slow motion');
    timer.lanes([{ car: 0, time: 3.2, place: 1 }, { car: 1, time: null, place: null }, { car: 2, time: 3.3, place: 2 }, null]);
    const text = (row, k) => row.children[k].textContent;
    expect(text(rows[0], 1)).toBe('Mine');
    expect(text(rows[0], 2)).toBe('3.200');
    expect(text(rows[0], 3)).toBe('1st');
    expect(rows[0].classList.contains('is-mine')).toBe(true);
    expect(rows[0].classList.contains('is-first')).toBe(true);
    expect(text(rows[1], 2)).toBe('');
    expect(rows[1].classList.contains('is-in')).toBe(false);
    expect(text(rows[3], 1)).toBe('');
    timer.show(true);
    expect(root.classList.contains('visible')).toBe(true);
    // A heat before the timer is built, and a lane past its rows, are no-ops.
    const bare = createTimer(document.createElement('div'));
    expect(() => bare.heat(1, 4)).not.toThrow();
    expect(() => timer.lanes([null, null, null, null, { car: 0, time: 1, place: 1 }])).not.toThrow();
});

test('the results: a real table fastest first, the visitor\'s row lit, the lanes, and the Why lines', async () => {
    const { fillResults } = await import('../www/derby/js/board.js');
    const Sim = await import('../www/derby/js/sim.js');
    const cars = [C.field[8], C.field[0]].map((e) => Car.describeCar(Car.buildFromField(e)));
    const race = Sim.runRace(cars);
    const table = document.createElement('table');
    const lanesEl = document.createElement('ul');
    const whyEl = document.createElement('ul');
    const whyHeading = document.createElement('h3');
    fillResults({ table, lanesEl, whyEl, whyHeading }, race, ['Phantom', 'Brick'], new Set([1]), ['One.', 'Two.'], 'Why');
    const [head, body] = table.children;
    expect(head.children[0].children.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col']);
    // The car's name is the row's header, and the visitor's row says so in
    // words, not by its tint alone (M7.1).
    expect(body.children.map((r) => [r.children[1].tagName, r.children[1].getAttribute('scope')])).toEqual([['TH', 'row'], ['TH', 'row']]);
    expect(body.children.map((r) => r.children[1].children[0].textContent)).toEqual(['Phantom', 'Brick You']);
    expect(body.children[1].classList.contains('is-mine')).toBe(true);
    const tag = body.children[1].children[1].children[0].children[1];
    expect([tag.className, tag.textContent]).toEqual(['res-you', 'You']);
    expect(body.children[0].children[0].textContent).toBe('1st');
    expect(body.children[0].children[1].children[1].textContent).toMatch(/^Heats: 3\.\d{3} {2}3\.\d{3}/);
    expect(lanesEl.children).toHaveLength(4);
    expect(whyEl.children.map((li) => li.textContent)).toEqual(['One.', 'Two.']);
    expect(whyHeading.textContent).toBe('Why');
    // A lane nobody ran is left off.
    fillResults({ table, lanesEl, whyEl }, { ...race, laneAverage: [3.1, null, null, null] }, ['A', 'B'], new Set(), [], '');
    expect(lanesEl.children).toHaveLength(1);
});
