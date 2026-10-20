// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's workbench (M3): the panel's controls, from SOURCE (bench.js,
 * workbench.js, carmesh.js's paint), under the DOM stub with a real garage.
 * Each control is pressed the way a visitor would, and what it did to the
 * build is read back from the garage: a shape that re-weighs or drops what
 * no longer fits, paint, weights by hand and Auto-weigh, the axles, the
 * class and its sheet, the garage's four cars, the units, Forget my cars,
 * and Race it refusing a car that breaks its sheet. Also the host's words,
 * and the house style of every sentence the bench says.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

let dom;
let C;
let IN;
let OZ;
let Car;
let G;
let B;
let Copy;

beforeEach(async () => {
    jest.resetModules();
    installThree();
    dom = installDom();
    ({ DERBY_CONFIG: C, IN, OZ } = await import('../www/derby/js/config.js'));
    Car = await import('../www/derby/js/car.js');
    G = await import('../www/derby/js/garage.js');
    B = await import('../www/derby/js/bench.js');
    Copy = await import('../www/derby/js/copy.js');
});

afterEach(() => dom.uninstall());

const ELS = ['bench-body', 'bench-host', 'bench-host-actions', 'bench-summary', 'bench-race', 'bench-status'];

/** A bench on a fresh garage, its hooks recorded. `before` changes the
 *  garage before the bench opens. */
function setUp({ before = null } = {}) {
    const el = Object.fromEntries(ELS.map((id) => [id, dom.el(id)]));
    const garage = G.createGarage({ C });
    if (before) before(garage);
    const calls = { changed: [], race: [], units: [], forgot: [], raceAgain: [], track: [] };
    const hooks = Object.fromEntries(Object.keys(calls).map((k) => [k, (...a) => calls[k].push(a)]));
    const bench = B.createBench(el, garage, hooks, C);
    return { el, garage, calls, bench };
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
const pick = (id) => {
    const i = byId(id);
    i.checked = true;
    fire(i, 'change');
};
const click = (id) => fire(byId(id) || dom.el(id), 'click');
const host = () => dom.el('bench-host').textContent;
const mass = (g) => Car.describeCar(g.bench(), C).mass / OZ;

test('it opens on the bench car, every section built, the summary in the visitor\'s units', () => {
    const { garage } = setUp();
    expect(byId('bench-design-wedge').checked).toBe(true);
    expect(byId('bench-body-blue').checked).toBe(true);
    expect(byId('bench-finish-gloss').checked).toBe(true);
    expect(byId('bench-class-standard').checked).toBe(true);
    expect(byId('bench-units-us').checked).toBe(true);
    expect(byId('bench-delete').hidden).toBe(true);
    for (const box of ['shape', 'paint', 'weights', 'axles', 'rules', 'settings']) expect(byId(`bench-${box}-box`)).not.toBeNull();
    expect(dom.el('bench-summary').textContent).toBe(`${garage.nameOf(garage.bench())} · 5.00 oz · balance 0.88 in`);
    expect(byId('bench-explore').getAttribute('href')).toBe('/');
});

test('a new shape: Auto-weigh follows it, or the weights that no longer fit come out', () => {
    const { garage, calls } = setUp();
    pick('bench-design-bullet');
    expect(garage.bench().design).toBe('bullet');
    expect(garage.bench().stations).toEqual(C.designs.bullet.stations.map((s) => [...s]));
    expect(mass(garage)).toBeCloseTo(5, 3);
    expect(host()).toBe('A Bullet now, and Auto-weigh moved the weights to suit it.');
    expect(calls.changed.length).toBeGreaterThan(0);
    // By hand on a block: six cylinders at the nose, then a wedge, whose
    // nose has room for only three.
    pick('bench-design-block');
    click('bench-allout');
    for (let i = 0; i < 6; i++) click('bench-pocket-0');
    expect(garage.bench().weights).toHaveLength(6);
    expect(garage.bench().ballast).toBe('hand');
    pick('bench-design-wedge');
    expect(garage.bench().weights).toHaveLength(3);
    expect(host()).toBe('A Wedge now. 3 weights no longer fit, so they’re back in the box.');
    // Picking the shape it already has does nothing.
    const before = calls.changed.length;
    pick('bench-design-wedge');
    expect(calls.changed.length).toBe(before);
});

test('paint: a swatch, a custom color while dragging and when chosen, a stripe, a finish', () => {
    const { garage } = setUp();
    pick('bench-body-red');
    expect(garage.bench().paint.body).toBe(0xd63c3c);
    expect(dom.el('bench-summary').textContent).toMatch(/^Red Wedge/);
    const custom = byId('bench-custom');
    custom.value = '#123456';
    fire(custom, 'input');
    // Dragging previews only: nothing is kept yet.
    expect(JSON.parse(localStorage.getItem('derby-garage')).cars[0].paint.body).toBe(0xd63c3c);
    fire(custom, 'change');
    expect(garage.bench().paint.body).toBe(0x123456);
    expect(JSON.parse(localStorage.getItem('derby-garage')).cars[0].paint.body).toBe(0x123456);
    expect(byId('bench-body-red').checked).toBe(false);
    expect(byId('bench-paint-box').children[0].textContent).toMatch(/Custom, gloss$/);
    pick('bench-stripe-white');
    expect(garage.bench().paint.stripe).toBe(0xf2f2ee);
    pick('bench-finish-metallic');
    expect(garage.bench().paint.finish).toBe('metallic');
    expect(byId('bench-paint-box').children[0].textContent).toMatch(/Custom, metallic, with a stripe$/);
    pick('bench-stripe-none');
    expect(garage.bench().paint.stripe).toBeNull();
});

test('weights by hand: a pocket fills and empties, says when it is full or too thin, and the weight is spoken', () => {
    const { garage } = setUp();
    click('bench-allout');
    expect(host()).toMatch(/^Every weight is out\. The car weighs 2\.\d\d oz now\.$/);
    expect(garage.bench().weights).toEqual([]);
    click('bench-pocket-9');
    expect(garage.bench().weights).toEqual([{ kind: 'cylinder', x: 6.6 * IN }]);
    expect(dom.el('bench-status').textContent).toMatch(/^2\.\d\d oz, balance /);
    expect(byId('bench-pocket-9').textContent).toBe('1');
    expect(byId('bench-pocket-9').getAttribute('aria-label')).toMatch(/^Pocket 6\.60 in from the nose: 1 cylinder, room for \d+ more cylinders$/);
    pick('bench-tool-strip');
    click('bench-pocket-9');
    click('bench-pocket-9');
    click('bench-pocket-9');
    expect(host()).toBe('Two strips is all that spot takes.');
    pick('bench-tool-out');
    click('bench-pocket-9');
    click('bench-pocket-9');
    click('bench-pocket-9');
    click('bench-pocket-9');
    expect(host()).toBe('That pocket is already empty.');
    // A cube is deeper than a wedge's nose has wood for, a cylinder is not.
    pick('bench-tool-cube');
    click('bench-pocket-0');
    expect(host()).toBe('There isn’t enough wood there for a pocket.');
    pick('bench-tool-cylinder');
    for (let i = 0; i < 40; i++) click('bench-pocket-0');
    expect(host()).toBe('That pocket is full.');
    expect(byId('bench-pocket-0').getAttribute('aria-label')).toMatch(/room for 0 more cylinders$/);
});

test('a pocket too thin for any tungsten says so, and takes strips only', () => {
    const { garage } = setUp({
        before: (g) => g.save({ ...g.bench(), stations: C.designs.thinWedge.stations.map((s) => [...s]), weights: [], ballast: 'hand' })
    });
    expect(garage.bench().weights).toEqual([]);
    click('bench-pocket-0');
    expect(host()).toBe('There isn’t enough wood there for a pocket.');
    expect(byId('bench-pocket-0').classList.contains('is-thin')).toBe(true);
    expect(byId('bench-pocket-0').getAttribute('aria-label')).toMatch(/: empty, too thin for tungsten, strips only$/);
    pick('bench-tool-strip');
    click('bench-pocket-0');
    expect(garage.bench().weights).toEqual([{ kind: 'strip', x: 0.5 * IN }]);
});

test('Auto-weigh: back to the limit in the sweet spot, or as close as a bulky body allows', () => {
    const { garage, calls } = setUp();
    click('bench-allout');
    click('bench-auto');
    expect(mass(garage)).toBeCloseTo(5, 3);
    expect(garage.bench().ballast).toBe('auto');
    expect(host()).toMatch(/^Auto-weigh brought it to 5\.00 oz, the weight 0\.88 in in front of the rear axle\./);
    pick('bench-design-block');
    click('bench-auto');
    expect(host()).toMatch(/^Auto-weigh did what this shape allows: 5\.00 oz, the weight 2\.0\d in in front of the rear axle\./);
    expect(calls.track.map((c) => c[1].kind)).toContain('auto-weigh');
});

test('the axles: each tune-up kept, the polish said in grits', () => {
    const { garage } = setUp();
    pick('bench-tune-deburr');
    const polish = byId('bench-polish');
    polish.value = '3';
    fire(polish, 'input');
    expect(garage.bench().tune.polish).toBe(3);
    expect(polish.getAttribute('aria-valuetext')).toBe('1200 grit');
    pick('bench-tune-graphite');
    pick('bench-tune-align');
    expect(garage.bench().tune).toEqual({ deburr: true, polish: 3, graphite: true, align: true, sand: 0 });
    expect(byId('bench-axles-box').children[0].textContent).toBe('Axles and wheelsde-burred, 1200 grit, graphite, aligned');
    expect(dom.el('bench-status').textContent).toBe('de-burred, 1200 grit, graphite, aligned');
    polish.value = 'x';
    fire(polish, 'input');
    expect(garage.bench().tune.polish).toBe(0);
});

test('Outlaw: the red sheet, Auto-weigh to the track\'s 16 oz, and back to Standard', () => {
    const { garage } = setUp();
    pick('bench-class-outlaw');
    expect(garage.bench().rules).toBe('outlaw');
    expect(mass(garage)).toBeCloseTo(16, 2);
    expect(host()).toMatch(/^Outlaw class\. The rule sheet is off, so the weight can go up to 16\.00 oz \(453\.6 g\)/);
    const sheet = find(dom.el('bench-body'), (n) => n.classList && n.classList.contains('bench-sheet'));
    expect(sheet.classList.contains('is-outlaw')).toBe(true);
    pick('bench-class-standard');
    expect(mass(garage)).toBeCloseTo(5, 3);
    expect(sheet.classList.contains('is-outlaw')).toBe(false);
    expect(host()).toBe('Standard class: 5.00 oz (141.7 g) at most, and the house rule sheet.');
    // By hand, an Outlaw's proud stacks come out on the way back.
    pick('bench-class-outlaw');
    click('bench-allout');
    for (let i = 0; i < 30; i++) click('bench-pocket-9');
    const heavy = garage.bench().weights.length;
    pick('bench-class-standard');
    expect(garage.bench().weights.length).toBeLessThan(heavy);
});

test('the sheet checks the car live, and Race it refuses a car that breaks it, politely', () => {
    const { garage, calls } = setUp();
    click('bench-race');
    expect(calls.race).toHaveLength(1);
    // Two more cylinders over the auto-weighed 5.00.
    click('bench-pocket-5');
    click('bench-pocket-5');
    const stats = B.statsOf(garage.bench(), 'us', C);
    expect(stats.legal).toBe(false);
    expect(stats.checks.find((c) => c.rule === 'mass').note).toMatch(/^0\.\d\d oz over\. Please take a weight out\.$/);
    click('bench-race');
    expect(calls.race).toHaveLength(1);
    expect(host()).toMatch(/^Blue Wedge can’t race just yet\. 0\.\d\d oz over\. Please take a weight out\.$/);
    expect(byId('bench-rules-box').open).toBe(true);
    expect(byId('bench-rules-box').children[0].textContent).toBe('RulesStandard, needs a fix');
    // In grams, the note is too.
    expect(B.statsOf(garage.bench(), 'metric', C).notes[0]).toMatch(/^\d+\.\d g over\./);
});

test('statsOf: each rule in the visitor\'s units, its limit in the sheet\'s, and the figures no rule limits', () => {
    const car = G.newCar(C);
    const s = B.statsOf(car, 'metric', C);
    expect(s.legal).toBe(true);
    expect(s.checks.map((c) => c.rule)).toEqual(['mass', 'length', 'width', 'wheelGap', 'clearance']);
    expect(s.checks[0]).toMatchObject({ label: 'Weight', value: '141.7 g', limit: '5.00 oz (141.7 g)', ok: true, note: '' });
    expect(s.checks[1]).toMatchObject({ label: 'Length', value: '17.8 cm', limit: '7 in (17.8 cm)' });
    expect(s.extra.map((x) => x.id)).toEqual(['height', 'balance']);
    expect(s.extra[1].value).toBe('2.2 cm in front of the rear axle');
    // A rule other than weight failing has its own note.
    expect(Copy.ruleNote('width', '0.10 in')).toBe('0.10 in too wide.');
    expect(Copy.ruleNote('clearance', '0.05 in')).toBe('0.05 in too low to the track.');
    expect(Copy.ruleNote('length', '1 in')).toBe('1 in too long.');
    expect(Copy.ruleNote('wheelGap', '1 in')).toBe('1 in too narrow between the wheels.');
});

test('the garage: new cars up to four, a copy, picking one, and deleting with a second tap', () => {
    const { garage, calls } = setUp();
    const first = garage.bench();
    click('bench-new');
    expect(garage.cars()).toHaveLength(2);
    expect(host()).toBe('A new car on the bench: Red Wedge, weighed to 5.00 oz. Your other cars wait in the garage.');
    expect(byId('bench-delete').hidden).toBe(false);
    pick('bench-car-' + first.id);
    expect(garage.bench().id).toBe(first.id);
    expect(host()).toBe('Blue Wedge is on the bench.');
    click('bench-copy');
    expect(host()).toBe('A copy of Blue Wedge, called Blue Wedge 2. Change one thing, then race the two in the Time Trial to see what it was worth.');
    click('bench-new');
    expect(garage.cars()).toHaveLength(4);
    expect(byId('bench-new').getAttribute('aria-disabled')).toBe('true');
    click('bench-new');
    expect(host()).toBe('The garage holds four cars. Please delete one to make room.');
    click('bench-copy');
    expect(garage.cars()).toHaveLength(4);
    // Delete asks first, and any other action lets it go.
    const doomed = garage.bench();
    click('bench-delete');
    expect(byId('bench-delete').textContent).toBe('Tap again to delete');
    expect(garage.cars()).toHaveLength(4);
    pick('bench-body-green');
    expect(byId('bench-delete').textContent).toBe('Delete this car');
    click('bench-delete');
    click('bench-delete');
    expect(garage.cars()).toHaveLength(3);
    expect(garage.cars().some((c) => c.id === doomed.id)).toBe(false);
    expect(host()).toMatch(/ is gone\. .+ is on the bench now\.$/);
    expect(calls.track.map((c) => c[1].kind)).toEqual(expect.arrayContaining(['new-car', 'copy-car', 'delete-car']));
});

test('units: everything in grams and centimeters, and remembered', () => {
    const { garage, calls } = setUp();
    pick('bench-units-metric');
    expect(garage.settings().units).toBe('metric');
    expect(calls.units).toEqual([['metric']]);
    expect(dom.el('bench-summary').textContent).toMatch(/· 141\.7 g · balance 2\.2 cm$/);
    expect(JSON.parse(localStorage.getItem('derby-settings')).units).toBe('metric');
    expect(byId('bench-tool-cylinder').parentElement.textContent).toBe('Cylinder7.1 g');
});

test('Forget my cars asks first, then leaves a fresh car and nothing kept', () => {
    const { garage, calls } = setUp();
    click('bench-new');
    garage.award('easy');
    click('bench-forget');
    expect(byId('bench-forget').textContent).toBe('Tap again to forget every car, result and trophy');
    expect(garage.cars()).toHaveLength(2);
    click('bench-forget');
    expect(garage.cars()).toHaveLength(1);
    expect(localStorage.getItem('derby-garage')).toBeNull();
    expect(localStorage.getItem('derby-trophies')).toBeNull();
    expect(calls.forgot).toHaveLength(1);
    expect(host()).toMatch(/^Everything is forgotten\. Here’s a fresh car to start with, Blue Wedge\.$/);
    expect(calls.track.map((c) => c[0])).toContain('garage-forget');
});

test('the host: a first visit, a return with its two ways on, and a tip after the results', () => {
    const { garage, calls, bench } = setUp();
    bench.arrive('first');
    expect(host()).toBe('Welcome to Derby Day! This is your car, Blue Wedge, already weighed to 5.00 oz. Choose a shape and a color, then race it whenever you’re ready.');
    bench.arrive('back', { last: null });
    expect(host()).toBe('Welcome back! Blue Wedge is on the bench, ready when you are.');
    expect(dom.el('bench-host-actions').children).toHaveLength(0);
    const id = garage.bench().id;
    bench.arrive('back', { last: { car: id, event: 'outlaw', place: 1, average: 3.2 } });
    expect(host()).toBe('Welcome back! Your car, Blue Wedge, finished 1st in the Outlaw exhibition. Would you like to tune it, or race again?');
    const [again, tune] = dom.el('bench-host-actions').children;
    fire(again, 'click');
    expect(calls.raceAgain).toEqual([['outlaw']]);
    fire(tune, 'click');
    expect(byId('bench-axles-box').open).toBe(true);
    bench.arrive('back', { last: { car: id, event: 'trial', place: null, average: 3.25 } });
    expect(host()).toBe('Welcome back! Blue Wedge averaged 3.250 seconds in the Time Trial. Would you like to tune it, or race again?');
    // Another car's last race is not this one's.
    bench.arrive('back', { last: { car: 'someone', event: 'easy', place: 2, average: 3.3 } });
    expect(host()).toBe('Welcome back! Blue Wedge is on the bench, ready when you are.');
    byId('bench-shape-box').open = false;
    bench.arrive('tune', { tip: { top: { id: 'shape', more: 0.01 }, sentence: 'A slimmer shape would save 0.010 seconds.' } });
    expect(host()).toBe('Here’s Blue Wedge back on the bench. A slimmer shape would save 0.010 seconds. You’ll find that under Shape.');
    expect(byId('bench-shape-box').open).toBe(true);
    bench.arrive('tune', { tip: { top: null, sentence: '' } });
    expect(host()).toMatch(/It’s about as fast as the rules allow\./);
    bench.arrive('tune');
    expect(host()).toMatch(/It’s about as fast as the rules allow\./);
});

test('the pockets on the car: a disc a hole in use, an Outlaw\'s stack standing proud', async () => {
    const Mesh = await import('../www/derby/js/carmesh.js');
    const W = await import('../www/derby/js/weights.js');
    const car = G.newCar(C);
    const t = Mesh.tungstenOf(car, C);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.proud === 0 && x.holes >= 1 && x.holes <= 3)).toBe(true);
    const outlaw = G.weighAuto({ ...car, rules: 'outlaw' }, C);
    expect(Mesh.tungstenOf(outlaw, C).some((x) => x.proud > 0)).toBe(true);
    expect(W.pocketsOf(outlaw, C).loose).toHaveLength(0);
    // The stripe faces up, the way the car is seen.
    const r = Mesh.stripeOf(car.stations, 0.01, C);
    const p = (i) => r.positions.slice(i * 3, i * 3 + 3);
    const [a, b, c] = r.indices.slice(0, 3).map(p);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
    expect(Mesh.finishOf('chrome', C)).toBe(C.paint.finishes.gloss);
    // And every finish, a stripe and the pockets build and let go.
    for (const finish of Object.keys(C.paint.finishes)) {
        const m = Mesh.buildCarMesh(outlaw, Car.describeCar(outlaw, C), { paint: { body: 0x123456, stripe: 0xffffff, finish }, pockets: true }, C);
        expect(() => m.dispose()).not.toThrow();
    }
});

test('the workbench builds, frames the car in the part of the screen left clear, and shows the trophies', async () => {
    const Wb = await import('../www/derby/js/workbench.js');
    const wb = Wb.buildWorkbench(C);
    expect(() => wb.setSheet({ title: 'HOUSE RULES', lines: ['A'] }, false)).not.toThrow();
    expect(() => wb.setScale('5.00 oz')).not.toThrow();
    expect(() => wb.setTrophies({ easy: '2026-10-19', medium: null, hard: '2026-10-19', outlaw: null })).not.toThrow();
    // A phone: the panel covers the bottom, so the picture slides up.
    const phone = Wb.benchFraming({ width: 390, height: 844, panel: { side: 'bottom', size: 490 } }, C);
    expect(phone.offsetX).toBe(0);
    expect(phone.offsetY).toBe(245);
    // A computer: the panel is on the left, so the picture slides right.
    const desk = Wb.benchFraming({ width: 1440, height: 900, panel: { side: 'left', size: 416 } }, C);
    expect(desk.offsetX).toBe(-208);
    expect(desk.offsetY).toBe(0);
    // A smaller clear part means standing further back, never nearer than the minimum.
    const open = Wb.benchFraming({ width: 390, height: 844 }, C);
    expect(phone.distance).toBeGreaterThan(open.distance);
    expect(open.distance).toBeGreaterThanOrEqual(C.workbench.minDistance);
    // Held to 80% of the screen, however big the panel claims to be.
    expect(Wb.benchFraming({ width: 390, height: 844, panel: { side: 'bottom', size: 5000 } }, C).offsetY).toBeCloseTo(844 * 0.4, 9);
});

test('every sentence the bench and the host say keeps the house style', () => {
    const style = (s) => {
        expect(typeof s).toBe('string');
        expect(s).not.toMatch(/—|;/);
        expect(s).not.toMatch(/\b(colour|centre|grey|metre|litre|favour|tyre)\b/i);
        expect(s).not.toMatch(/pinewood/i);
    };
    for (const v of Object.values(Copy.UI)) style(v);
    for (const v of Object.values(Copy.ENTRY)) style(v);
    for (const v of Copy.POLISH) style(v);
    for (const [k, v] of Object.entries(Copy.SAY)) {
        if (typeof v === 'string') style(v);
        else style(v('5.00 oz', '0.88 in', 2) + k);
    }
    style(Copy.SAY.shapeHand('Wedge', 1));
    style(Copy.SAY.shapeHand('Wedge', 0));
    for (const e of ['easy', 'medium', 'outlaw']) {
        style(Copy.trophyLine(e, true));
        style(Copy.trophyLine(e, false));
    }
    expect(Copy.harderLabel('hard')).toBe('');
    expect(Copy.trophyList({ easy: 'x', outlaw: 'y' })).toBe('Trophies: Easy, Outlaw exhibition.');
    expect(Copy.bestLine('A', { easy: { place: 2, average: 3.3 }, outlaw: { place: 1, average: 3.2 }, trial: { place: null, average: 3.25 } }))
        .toBe('A’s best: 2nd in Easy division, 1st in the Outlaw exhibition, 3.250 seconds in the Time Trial.');
    expect(Copy.bestLine('A', {})).toBe('A hasn’t raced yet.');
    for (const rules of ['standard', 'outlaw']) {
        const sheet = Copy.sheetLines(rules, C.rules[rules], { mass: () => '5 oz', length: () => '1 in' });
        style(sheet.title);
        for (const l of sheet.lines) style(l);
    }
    expect(Copy.eventLabel('outlaw')).toBe('Outlaw exhibition');
    // The host's lines, from source (bench.js reaches them through the build).
    style(Copy.hostFirst('A', '5.00 oz'));
    style(Copy.hostStep('A'));
    for (const last of [null, { event: 'trial', average: 3.2 }, { event: 'outlaw', place: 1, average: 3.2 }, { event: 'easy', place: 3, average: 3.3 }]) style(Copy.hostBack('A', last));
    expect(Copy.hostBack('A', { event: 'hard', place: 2, average: 3.2 })).toBe('Welcome back! Your car, A, finished 2nd in the Hard division. Would you like to tune it, or race again?');
    for (const id of Object.keys(Copy.FIX_SECTION)) style(Copy.hostTune('A', { id, more: 0.05 }, 'X.'));
    expect(Copy.hostTune('A', { id: 'balance', more: 0.05 }, 'X.')).toBe('Here’s A back on the bench. X. You’ll find that under Weights.');
    expect(Copy.hostTune('A', { id: 'axles', more: 0.001 }, 'X.')).toMatch(/about as fast as the rules allow/);
});
