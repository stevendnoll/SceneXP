// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The house model on the turntable (www/whitestone/js/model.js): every
 * room sits on its level and every task in its room, lifted or not; a
 * lifted level opens enough to be seen into; the model is centered on the
 * turntable and fits its round lawn however it is turned, for any home; and
 * the built model draws exactly the home it was handed, in instanced
 * meshes, against the real three.js.
 *
 * Each random home draws from its own well-mixed seed.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    levelOffsets, centerOf, instancesFor, buildModel, fitScale, restack, wallHeight, EMPTY_HOME, HOUSE, ACCENTS, accentsFor,
    openingsFor, WINDOW_OF, WINDOWS, columnsFor, siteFor, lawnRadius
} from '../www/whitestone/js/model.js';
import { layoutHome, MODEL } from '../www/whitestone/js/layout.js';
import { KIT_OF, kitFor } from '../www/whitestone/js/rooms.js';
import { TAXONOMY, roomName } from '../www/whitestone/js/taxonomy.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { framePose } from '../www/whitestone/js/turntable.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const AREAS = TAXONOMY.cleaning.areas.map((a) => a.key);
const LEVELS = TAXONOMY.cleaning.levels.map((l) => l.key);
const LIFT = CONFIG.model.lift;
const T = CONFIG.stage.turntable;
const EPS = 1e-9;

const mix = (n) => {
    let z = (n + 0x9E3779B9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
};
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A random home: some levels, up to 40 rooms and 200 tasks. */
function randomHome(n) {
    const r = rng(mix(n));
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const levels = LEVELS.filter(() => r() < 0.5);
    if (!levels.length) levels.push('main');
    const rooms = Array.from({ length: int(0, 40) }, (_, i) => ({
        id: `room-${n}-${i}`, level: levels[int(0, levels.length - 1)], area: AREAS[int(0, AREAS.length - 1)], label: ''
    }));
    const items = rooms.length ? Array.from({ length: int(0, 200) }, (_, i) => ({
        id: `item-${n}-${i}`, roomId: rooms[int(0, rooms.length - 1)].id, order: int(1, 50), important: r() < 0.2
    })) : [];
    return { id: `home-${n}`, serviceType: 'cleaning', levels, rooms, items };
}

const HOMES = Array.from({ length: 300 }, (_, n) => randomHome(n));
/** Every home that has every level, so every lift is tried at its worst. */
const FULL = {
    id: 'full', serviceType: 'cleaning', levels: [...LEVELS],
    rooms: LEVELS.map((level, i) => ({ id: `r${i}`, level, area: 'kitchen', label: '' })),
    items: LEVELS.flatMap((_, i) => [0, 1, 2].map((k) => ({ id: `i${i}-${k}`, roomId: `r${i}`, order: k + 1, important: k === 0 })))
};

function example() {
    return withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];
}

const top = (b) => b.position[1] + b.scale[1] / 2;
const bottom = (b) => b.position[1] - b.scale[1] / 2;
const inside = (inner, outer, pad = EPS) => [0, 2].every((k) =>
    inner.position[k] - inner.scale[k] / 2 >= outer.position[k] - outer.scale[k] / 2 - pad
    && inner.position[k] + inner.scale[k] / 2 <= outer.position[k] + outer.scale[k] / 2 + pad);

// ---- The lift (pure) ----------------------------------------------------------------

describe('lifting a level', () => {
    const slabs = layoutHome(FULL).slabs;

    test('nothing lifted, nothing moves', () => {
        for (const v of levelOffsets(slabs, null, LIFT).values()) expect(v).toBe(0);
        for (const v of levelOffsets(slabs, 'cellar', LIFT).values()) expect(v).toBe(0);
    });

    test.each(['basement', 'main', 'second', 'third', 'attic'])('lifting the %s raises it a little, and every story above it and the roof a lot', (level) => {
        const off = levelOffsets(slabs, level, LIFT);
        const chosen = slabs.find((s) => s.level === level);
        for (const s of slabs) {
            const want = s.level === level ? LIFT.raise : (s.kind === 'story' && s.y > chosen.y ? LIFT.open : 0);
            expect(`${s.level}: ${off.get(s.level)}`).toBe(`${s.level}: ${want}`);
        }
        expect(off.get('roof')).toBe(LIFT.open);
        expect(off.get('roof:garage')).toBe(0);
    });

    test.each(['garage', 'detached-garage'])('lifting the %s opens its own roof and moves nothing else', (level) => {
        const off = levelOffsets(slabs, level, LIFT);
        for (const s of slabs) expect(off.get(s.level)).toBe(s.level === level ? LIFT.raise : 0);
        expect(off.get(`roof:${level}`)).toBe(LIFT.open);
        expect(off.get('roof')).toBe(0);
    });
});

// ---- Every instance in its place (pure) ----------------------------------------------

describe('instances', () => {
    function check(home, lifted) {
        const layout = layoutHome(home);
        const off = levelOffsets(layout.slabs, lifted, LIFT);
        const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
        const inst = instancesFor(layout, off, { lifted, areas });
        // The fixtures are checked below, so there must be some to check.
        if (home.rooms.some((r) => KIT_OF[r.area]) && home.rooms.length < 10) expect(inst.fixtures.length).toBeGreaterThan(0);
        const slabOf = new Map(inst.slabs.map((s) => [s.level, s]));
        const tileOf = new Map(inst.tiles.map((t) => [t.roomId, t]));
        for (const t of inst.tiles) {
            const s = slabOf.get(t.level);
            expect(Math.abs(bottom(t) - top(s))).toBeLessThan(1e-9);
            expect(inside(t, s)).toBe(true);
        }
        for (const m of inst.markers) {
            const room = layout.markers.find((x) => x.itemId === m.itemId).roomId;
            const t = tileOf.get(room);
            expect(m.level).toBe(t.level);
            expect(Math.abs(m.position[1] - top(t))).toBeLessThan(1e-9);
            expect(inside(m, t)).toBe(true);
            // A dot, in the front half of its room, where the fixture is not.
            expect(m.scale[1]).toBe(HOUSE.dot.height);
            expect(m.position[2] - m.scale[2] / 2).toBeGreaterThanOrEqual(t.position[2] - 1e-9);
            // A starred task carries a flag, pole and pennant, and no other does.
            expect(inst.flags.filter((f) => f.itemId === m.itemId)).toHaveLength(m.important ? 2 : 0);
        }
        for (const f of [...inst.fixtures, ...inst.rounds]) {
            const t = tileOf.get(f.roomId);
            expect(inside(f, t)).toBe(true);
            expect(Math.abs(bottom(f) - top(t)) < 1e-9 || bottom(f) > top(t)).toBe(true);
            // Against the back, clear of the tasks in the front.
            expect(f.position[2] + f.scale[2] / 2).toBeLessThanOrEqual(t.position[2] - t.scale[2] / 2 + t.scale[2] * HOUSE.fixtureBand + 1e-9);
        }
        return { layout, inst };
    }

    test('every room on its level and every task in its room, for any home, lifted or not', () => {
        for (const home of HOMES) {
            check(home, null);
            check(home, home.levels[0]);
        }
    });

    test('closed, each story stands on the walls of the one below, and the roof on the top one', () => {
        const { inst } = check(FULL, null);
        const stories = ['basement', 'main', 'second', 'third', 'attic'];
        const wallTop = (level) => Math.max(...inst.walls.filter((w) => w.level === level && w.role === 'wall').map(top));
        for (let i = 1; i < stories.length; i++) {
            const plate = inst.slabs.find((p) => p.level === stories[i]);
            expect(bottom(plate)).toBeCloseTo(wallTop(stories[i - 1]), 9);
        }
        const house = inst.gables.find((g) => g.level === 'attic');
        expect(house.position[1]).toBeCloseTo(wallTop('attic'), 9);
        // The attic's walls are low, under the roof.
        expect(wallTop('attic') - top(inst.slabs.find((p) => p.level === 'attic'))).toBeCloseTo(HOUSE.knee, 9);
    });

    test('a lifted story opens like a dollhouse: room above it to see in, and its front wall stepped aside', () => {
        for (const level of ['basement', 'main', 'second', 'third', 'attic']) {
            const { inst } = check(FULL, level);
            const plate = inst.slabs.find((p) => p.level === level);
            const above = inst.slabs.filter((p) => bottom(p) > top(plate) + 1e-6 && Math.abs(p.position[0] - plate.position[0]) < 1e-6)
                .sort((a, b) => bottom(a) - bottom(b))[0];
            const ceiling = above ? bottom(above) : Math.min(...inst.gables.filter((g) => g.level === 'attic').map((g) => g.position[1]));
            const highest = Math.max(...inst.flags.filter((f) => f.level === level).map(top), top(plate));
            // From the top of the tallest flag to whatever is above: a good
            // hand's width in the model (a third more as drawn). Whether every
            // room can be seen is measured from the station itself below.
            expect(ceiling - highest).toBeGreaterThan(0.25);
            const sides = inst.walls.filter((w) => w.level === level && w.role === 'wall').map((w) => w.side).sort();
            expect(sides).toEqual(['back', 'left', 'right']);
            expect(inst.windows.some((w) => w.level === level && w.side === 'front')).toBe(false);
        }
        const closed = check(FULL, null).inst;
        for (const level of ['basement', 'main', 'second']) {
            expect(closed.walls.filter((w) => w.level === level && w.role === 'wall').map((w) => w.side).sort()).toEqual(['back', 'front', 'left', 'right']);
        }
    });

    test('a house has windows on every side, a front door on the main floor, and garages have garage doors', () => {
        const { inst } = check(FULL, null);
        const doors = inst.windows.filter((w) => w.color === 'door');
        expect(doors.map((d) => [d.level, d.side])).toEqual([['main', 'front']]);
        for (const level of ['basement', 'main', 'second', 'third']) {
            for (const side of ['front', 'back', 'left', 'right']) {
                expect(`${level} ${side}: ${inst.windows.some((w) => w.level === level && w.side === side && w.color === 'glass')}`).toBe(`${level} ${side}: true`);
            }
        }
        for (const level of ['garage', 'detached-garage']) {
            expect(inst.windows.filter((w) => w.level === level && w.role === 'garageDoor').map((w) => w.side)).toEqual(['front']);
        }
        // Every panel lies on its own wall's outside face, within it.
        for (const w of inst.windows) {
            const wall = inst.walls.find((x) => x.level === w.level && x.side === w.side && x.role === 'wall');
            expect(bottom(w)).toBeGreaterThanOrEqual(bottom(wall) - 1e-9);
            expect(top(w)).toBeLessThanOrEqual(top(wall) + 1e-9);
            const along = w.side === 'front' || w.side === 'back' ? 0 : 2;
            expect(w.position[along] - w.scale[along] / 2).toBeGreaterThanOrEqual(wall.position[along] - wall.scale[along] / 2 - 1e-9);
            expect(w.position[along] + w.scale[along] / 2).toBeLessThanOrEqual(wall.position[along] + wall.scale[along] / 2 + 1e-9);
        }
        // A home with no main floor puts its door on its lowest story.
        const up = { ...FULL, levels: ['second', 'third'], rooms: [] , items: [] };
        expect(check(up, null).inst.windows.filter((w) => w.color === 'door').map((d) => d.level)).toEqual(['second']);
    });

    test('every roof is a gable: the house, a white cross gable facing the street, and each garage', () => {
        const { inst } = check(FULL, null);
        expect(inst.walls.filter((w) => w.role === 'link').map((w) => w.level)).toEqual(['garage']);
        const main = inst.gables.filter((g) => g.role === 'roof').map((g) => g.level).sort();
        expect(main).toEqual(['attic', 'detached-garage', 'garage']);
        const cross = inst.gables.filter((g) => g.role === 'cross');
        expect(cross).toHaveLength(1);
        expect(cross[0].color).toBe('gable');
        expect(cross[0].rotation[1]).toBeCloseTo(Math.PI / 2, 9);
        // Its triangle is at the front of the house, in the left wing, lower
        // than the main ridge, and carries battens.
        const house = inst.gables.find((g) => g.role === 'roof' && g.level === 'attic');
        expect(cross[0].top).toBeLessThan(house.top);
        expect(cross[0].position[0]).toBeLessThan(house.position[0]);
        expect(inst.siding.filter((b) => b.role === 'batten').length).toBeGreaterThan(5);
        // Each gable carries two slopes, mirror images, rising to its ridge.
        for (const g of inst.gables) {
            const slopes = inst.roofs.filter((r) => r.level === g.level && r.role === g.role);
            expect(slopes).toHaveLength(2);
            const axis = g.role === 'cross' ? 2 : 0;
            expect(slopes[0].rotation[axis]).toBeCloseTo(-slopes[1].rotation[axis], 9);
            for (const r of slopes) expect(r.top).toBeGreaterThan(g.top);
        }
    });

    test('windows follow the rooms behind them', () => {
        const living = { a: 0, b: 0.6, along: 0 };
        const t = (id, x, width) => ({ roomId: id, x, z: 0, width, depth: 0.3 });
        const areas = new Map([['l', 'living'], ['b', 'bathroom'], ['c', 'closet'], ['k', 'kitchen'], ['s', 'bedroom']]);
        const o = openingsFor([t('l', 0.15, 0.28), t('b', 0.35, 0.1), t('c', 0.45, 0.08), t('s', 0.55, 0.1)], areas, living);
        expect(o.map((x) => [x.roomId, x.kind])).toEqual([['l', 'picture'], ['b', 'small'], ['s', 'pair']]);
        // Each window sits on its own room's stretch of the wall.
        expect(o[0].a).toBeCloseTo(0.15 - 0.14 - MODEL.tileGap / 2, 9);
        expect(o[0].b).toBeCloseTo(0.15 + 0.14 + MODEL.tileGap / 2, 9);
        // In a basement every room's window is small and high.
        expect(openingsFor([t('l', 0.15, 0.28)], areas, { ...living, basement: true })[0].kind).toBe('basement');
        // An empty level still has windows, evenly spaced.
        const empty = openingsFor([], areas, { a: 0, b: 1.2, along: 0 });
        expect(empty.length).toBeGreaterThan(2);
        expect(empty.every((x) => x.kind === 'single')).toBe(true);
        // In the built house, a wide living room gets its picture window
        // more than once, and a bath one small high window.
        const home = example();
        const { inst } = check(home, null);
        const front = (area) => {
            const room = home.rooms.find((r) => r.area === area);
            const tile = inst.tiles.find((x) => x.roomId === room.id);
            return inst.windows.filter((w) => w.level === tile.level && w.side === 'front' && w.color === 'glass'
                && w.position[0] > tile.position[0] - tile.scale[0] / 2 && w.position[0] < tile.position[0] + tile.scale[0] / 2);
        };
        for (const area of ['kitchen', 'living', 'primary-bedroom', 'bedroom', 'bathroom', 'dining', 'office', 'entry', 'powder-room', 'primary-bathroom', 'family']) {
            const room = home.rooms.find((r) => r.area === area);
            if (!room) continue;
            const tile = inst.tiles.find((x) => x.roomId === room.id);
            const s2 = inst.slabs.find((x) => x.level === tile.level);
            const touches = Math.abs(tile.position[2] + tile.scale[2] / 2 + MODEL.tileGap / 2 - (s2.position[2] + s2.scale[2] / 2 - MODEL.margin)) < 1e-6;
            if (!touches) continue;
            const panes = front(area);
            const kind = WINDOW_OF[area];
            if (area === 'entry') continue;
            if (tile.level === 'basement') {
                expect(panes.every((p) => Math.abs(p.scale[1] - WINDOWS.basement.h) < 1e-9)).toBe(true);
            } else if (kind === 'small') {
                expect(panes.length).toBeLessThanOrEqual(1);
                for (const p2 of panes) expect(p2.scale[1]).toBeCloseTo(WINDOWS.small.h, 9);
            } else if (panes.length) {
                expect(panes.every((p2) => Math.abs(p2.scale[1] - WINDOWS[kind].h) < 1e-9)).toBe(true);
            }
        }
    });

    test('windows stand on the facade\'s columns, so they stack floor over floor', () => {
        const home = example();
        const { inst } = check(home, null);
        const glass = inst.windows.filter((w) => w.color === 'glass' && w.at !== undefined);
        // Nearly every window is on a column, and one off a column sits at
        // its room's middle.
        const on = glass.filter((w) => w.onColumn);
        expect(on.length / glass.length).toBeGreaterThan(0.8);
        // The columns are shared: where the second floor has a front window,
        // the main floor's front windows use the same columns.
        const cols = (level) => new Set(glass.filter((w) => w.level === level && w.side === 'front' && w.onColumn).map((w) => w.at.toFixed(6)));
        const second = cols('second');
        const main = cols('main');
        const shared = [...second].filter((c) => main.has(c));
        expect(shared.length).toBeGreaterThan(0);
        // And every column is one of the wall's evenly spaced columns.
        const s2 = inst.slabs.find((x) => x.level === 'main');
        const n = columnsFor(s2.scale[0]);
        const x0 = s2.position[0] - s2.scale[0] / 2;
        const columns = Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) * s2.scale[0]) / n);
        for (const w of glass.filter((x) => x.onColumn && x.side === 'front')) {
            expect(columns.some((c) => Math.abs(c - w.at) < 1e-9)).toBe(true);
        }
    });

    test('white trim: corner boards on every wall, a band at each upper floor, white gutters', () => {
        const { inst } = check(FULL, null);
        for (const w of inst.walls.filter((x) => x.role === 'wall')) {
            expect(inst.siding.filter((b) => b.role === 'corner' && b.level === w.level && b.side === w.side)).toHaveLength(2);
        }
        const bands = new Set(inst.siding.filter((b) => b.role === 'band').map((b) => b.level));
        expect([...bands].sort()).toEqual(['attic', 'main', 'second', 'third']);
        for (const g of inst.trims.filter((t) => t.role === 'gutter')) expect(g.color).toBe('whiteTrim');
    });

    test('the front door has a white casing and a glass sidelight, and the gable a window', () => {
        const { inst } = check(example(), null);
        const door = inst.windows.find((w) => w.color === 'door');
        const casing = inst.windows.find((w) => w.role === 'casing');
        const side = inst.windows.find((w) => w.role === 'sidelight');
        expect(casing.color).toBe('whiteTrim');
        expect(casing.scale[0]).toBeGreaterThan(door.scale[0] + side.scale[0]);
        expect(side.position[0]).toBeGreaterThan(door.position[0] + door.scale[0] / 2);
        expect(side.position[0] + side.scale[0] / 2).toBeLessThanOrEqual(casing.position[0] + casing.scale[0] / 2 + 1e-9);
        const gw = inst.siding.filter((b) => b.role === 'gableWindow');
        expect(gw.map((b) => b.color).sort()).toEqual(['frame', 'glass']);
        const cross = inst.gables.find((g) => g.role === 'cross');
        expect(Math.abs(gw[0].position[0] - cross.position[0])).toBeLessThan(1e-9);
        expect(top(gw[0])).toBeLessThan(cross.top);
    });

    test('the front door is in the entry, when the entry is at the front', () => {
        const home = {
            id: 'd', serviceType: 'cleaning', levels: ['main'],
            rooms: [{ id: 'k1', level: 'main', area: 'kitchen', label: '' }, { id: 'e1', level: 'main', area: 'entry', label: '' }, { id: 'l1', level: 'main', area: 'living', label: '' }],
            items: []
        };
        const { inst } = check(home, null);
        const door = inst.windows.find((w) => w.color === 'door');
        const entry = inst.tiles.find((t) => t.roomId === 'e1');
        const entryFront = Math.abs(entry.position[2] + entry.scale[2] / 2 + MODEL.tileGap / 2 - (inst.slabs[0].position[2] + inst.slabs[0].scale[2] / 2 - MODEL.margin)) < 1e-6;
        if (entryFront) {
            expect(door.position[0]).toBeGreaterThan(entry.position[0] - entry.scale[0] / 2);
            expect(door.position[0]).toBeLessThan(entry.position[0] + entry.scale[0] / 2);
        }
        expect(door).toBeTruthy();
    });

    test('rooms are divided by low walls with doorways, which never cross a room', () => {
        for (const home of [example(), ...HOMES.slice(0, 120)]) {
            const { inst } = check(home, null);
            const parts = inst.walls.filter((w) => w.role === 'partition');
            for (const w of parts) {
                expect(w.scale[1]).toBe(HOUSE.partition.height);
                for (const t of inst.tiles.filter((x) => x.level === w.level)) {
                    const overlap = [0, 2].map((k) => Math.min(w.position[k] + w.scale[k] / 2, t.position[k] + t.scale[k] / 2)
                        - Math.max(w.position[k] - w.scale[k] / 2, t.position[k] - t.scale[k] / 2));
                    expect(Math.min(...overlap)).toBeLessThanOrEqual(1e-9);
                }
            }
            // A level of several rooms has walls between them; one room has none.
            for (const level of new Set(inst.tiles.map((t) => t.level))) {
                const rooms = inst.tiles.filter((t) => t.level === level).length;
                const walls = parts.filter((w) => w.level === level).length;
                expect(`${level}: ${rooms > 1 ? walls > 0 : walls === 0}`).toBe(`${level}: true`);
            }
        }
    });

    test('each kind of room has its fixture, and a room too small for one has none', () => {
        const home = example();
        const { inst } = check(home, null);
        // A room with no fixture of its kind has none, and the rooms a
        // visitor would look for first all have theirs.
        const plain = { ...FULL, levels: ['main'], rooms: [{ id: 'o1', level: 'main', area: 'other', label: '' }, { id: 'k1', level: 'main', area: 'kitchen', label: '' }], items: [] };
        const plainParts = instancesFor(layoutHome(plain), new Map(), { areas: new Map([['o1', 'other'], ['k1', 'kitchen']]) }).fixtures;
        // An "other" room has only a plant; a kitchen its counters.
        expect(plainParts.some((f) => f.roomId === 'o1' && f.role !== 'pot')).toBe(false);
        expect(plainParts.some((f) => f.roomId === 'k1' && f.role === 'counter')).toBe(true);
        for (const area of ['kitchen', 'living', 'dining', 'office', 'primary-bedroom', 'bedroom', 'primary-bathroom', 'family']) {
            for (const r of home.rooms.filter((x) => x.area === area)) {
                expect(`${area} ${r.id}: ${inst.fixtures.some((f) => f.roomId === r.id)}`).toBe(`${area} ${r.id}: true`);
            }
        }
        // The garage's car, in a garage of its own.
        const g = { ...FULL, levels: ['main', 'garage'], rooms: [{ id: 'g1', level: 'garage', area: 'garage', label: '' }], items: [] };
        const layout = layoutHome(g);
        const cars = instancesFor(layout, new Map(), { areas: new Map([['g1', 'garage']]) }).fixtures.filter((f) => f.role === 'car');
        expect(cars.length).toBeGreaterThanOrEqual(2);
        // Forty rooms on one floor: tiny rooms, and their fixtures shrink or go.
        const crowd = { ...FULL, levels: ['main'], rooms: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, level: 'main', area: 'bedroom', label: '' })), items: [] };
        const small = instancesFor(layoutHome(crowd), new Map(), { areas: new Map(crowd.rooms.map((r) => [r.id, 'bedroom'])) });
        expect(small.fixtures.length).toBeLessThan(40 * 16);
    });

    test('the model is centered on the turntable and fits its lawn however it is turned, for any home', () => {
        const { scale } = CONFIG.model;
        for (const home of [...HOMES, FULL, EMPTY_HOME]) {
            const layout = layoutHome(home);
            const k = fitScale(layout, T, scale);
            expect(k).toBeGreaterThan(0);
            expect(k).toBeLessThanOrEqual(scale.max);
            const { slabs } = instancesFor(layout, new Map());
            const xs = slabs.flatMap((s) => [s.position[0] - s.scale[0] / 2, s.position[0] + s.scale[0] / 2]);
            const zs = slabs.flatMap((s) => [s.position[2] - s.scale[2] / 2, s.position[2] + s.scale[2] / 2]);
            expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
            expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 9);
            // Every corner of the house, at any turn, stays `margin` inside
            // the lawn's edge.
            const half = Math.hypot((Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...zs) - Math.min(...zs)) / 2);
            expect(k * half).toBeLessThanOrEqual(lawnRadius(T) - scale.margin + 1e-9);
            // The lowest level stands on the turntable's top.
            expect(Math.min(...slabs.map(bottom))).toBeCloseTo(0, 9);
        }
    });

    describe('the site and the details', () => {
        function sited(home, lifted = null) {
            const layout = layoutHome(home);
            const k = fitScale(layout, T, CONFIG.model.scale);
            const site = siteFor(layout, T, k);
            const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
            return { site, inst: instancesFor(layout, levelOffsets(layout.slabs, lifted, LIFT), { lifted, areas, site }) };
        }
        /** A part's footprint on the lawn, its tilt (a sloped railing, a
         *  roof's slope) taken into account. */
        const rect = (b) => {
            const [rx, , rz] = b.rotation || [0, 0, 0];
            const hx = (Math.abs(b.scale[0] * Math.cos(rz)) + Math.abs(b.scale[1] * Math.sin(rz))) / 2;
            const hz = (Math.abs(b.scale[2] * Math.cos(rx)) + Math.abs(b.scale[1] * Math.sin(rx))) / 2;
            return [b.position[0] - hx, b.position[2] - hz, b.position[0] + hx, b.position[2] + hz];
        };
        const overlaps = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1e-9 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1e-9;

        test.each([['the example', () => example()], ['every level', () => FULL], ['an empty home', () => ({ ...EMPTY_HOME, id: 'e' })],
            ...HOMES.slice(0, 60).map((h, i) => [`random home ${i}`, () => h])])('%s: everything on the site stays on the lawn, and nothing crosses anything', (_name, make) => {
            const { site, inst } = sited(make());
            expect(inst.lawn).toHaveLength(1);
            const lawn = inst.lawn[0];
            // Inside the yard's rectangle, and every corner on the round lawn.
            const inYard = (b) => rect(b).every((v, i) => (i % 2 === 0 ? Math.abs(v) <= site.halfWidth + 1e-9 : Math.abs(v) <= site.halfDepth + 1e-9));
            const onLawn = (b) => {
                const [x0, z0, x1, z1] = rect(b);
                return [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].every(([x, z]) => Math.hypot(x, z) <= site.radius + 1e-9);
            };
            // The house, its paving and its beds in the yard; the trees round
            // the lawn's edge, and on it.
            const trees = ['trunk', 'maple', 'shade', 'fir'];
            const flat = (c) => ({ ...c, scale: [c.scale[0], 0, c.scale[2]] });
            for (const b of [...inst.site, ...inst.slabs, ...inst.canopies.map(flat), ...inst.firs.map(flat)]) {
                // A tree is round: its middle, plus its reach, on the lawn.
                const round = (t) => Math.hypot(t.position[0], t.position[2]) + Math.max(t.scale[0], t.scale[2]) / 2 <= site.radius + 1e-9;
                const fine = trees.includes(b.role) ? round(b) : inYard(b) && onLawn(b);
                expect(`${b.role} ${fine}`).toBe(`${b.role} true`);
            }
            expect(lawn.scale[0]).toBeCloseTo(2 * site.radius, 9);
            expect(lawn.scale[2]).toBeCloseTo(2 * site.radius, 9);
            expect([lawn.position[0], lawn.position[2]]).toEqual([0, 0]);
            const house = inst.slabs.map(rect);
            const ways = inst.site.filter((b) => ['path', 'drive', 'stoop'].includes(b.role)).map(rect);
            for (const hedge of inst.site.filter((b) => b.role === 'hedge').map(rect)) {
                for (const w of [...ways, ...house]) expect(overlaps(hedge, w)).toBe(false);
            }
            // The flower bed and the mailbox keep off the stair, the path and the drives.
            for (const thing of inst.site.filter((b) => b.role === 'bed' || b.role === 'mailbox').map(rect)) {
                for (const w of ways) expect(overlaps(thing, w)).toBe(false);
            }
            for (const t of inst.site.filter((b) => b.role === 'trunk')) {
                for (const w of [...ways, ...house]) {
                    const r = rect(t);
                    const dx = Math.max(w[0] - r[2], 0, r[0] - w[2]);
                    const dz = Math.max(w[1] - r[3], 0, r[1] - w[3]);
                    expect(Math.hypot(dx, dz)).toBeGreaterThan(HOUSE.site.tree.radius);
                }
            }
            for (const w of ways) for (const h of house) expect(overlaps(w, h)).toBe(false);
        });

        test('a path runs from the front door to the front of the site, by a landing and steps down beside the house', () => {
            const { site, inst } = sited(example());
            const door = inst.windows.find((w) => w.color === 'door');
            const stoop = inst.site.filter((b) => b.role === 'stoop');
            const path = inst.site.find((b) => b.role === 'path');
            const landing = stoop[0];
            // The landing meets the door's threshold, in front of the door.
            expect(top(landing)).toBeCloseTo(bottom(door), 9);
            expect(landing.position[0]).toBeCloseTo(door.position[0], 9);
            // The steps run along the house, each lower than the one before,
            // a comfortable rise at a time, and the path leaves from the last.
            const steps = stoop.slice(1);
            expect(steps.length).toBeGreaterThan(2);
            const order = steps.slice().sort((a, b) => Math.abs(a.position[0] - door.position[0]) - Math.abs(b.position[0] - door.position[0]));
            const heights = [top(landing), ...order.map(top)];
            for (let i = 1; i < heights.length; i++) {
                expect(heights[i]).toBeLessThan(heights[i - 1]);
                expect(heights[i - 1] - heights[i]).toBeLessThanOrEqual(HOUSE.site.stoop.rise + 1e-9);
            }
            for (const st of steps) expect(st.position[2]).toBeCloseTo(landing.position[2], 9);
            const foot = order[order.length - 1];
            expect(path.position[0]).toBeCloseTo(foot.position[0], 9);
            expect(path.position[2] - path.scale[2] / 2).toBeCloseTo(landing.position[2] + landing.scale[2] / 2, 9);
            expect(path.position[2] + path.scale[2] / 2).toBeCloseTo(site.halfDepth, 9);
            // The house stands back, so the front yard is the bigger.
            const front = site.halfDepth - Math.max(...inst.slabs.map((s2) => s2.position[2] + s2.scale[2] / 2));
            const back = Math.min(...inst.slabs.map((s2) => s2.position[2] - s2.scale[2] / 2)) + site.halfDepth;
            expect(front).toBeGreaterThan(back);
        });

        test('over a basement the landing is stone-clad with a concrete top, and railed', () => {
            const { inst } = sited(example());
            const landing = inst.site.find((b) => b.role === 'stoop');
            expect(landing.color).toBe('stone');
            const topSlab = inst.site.find((b) => b.role === 'landingTop');
            expect(top(topSlab)).toBeGreaterThanOrEqual(top(landing) - 1e-9);
            const rails = inst.site.filter((b) => b.role === 'rail');
            expect(rails.length).toBeGreaterThanOrEqual(4);
            // One rail slopes down the stair, from the landing toward the foot.
            const sloped = rails.find((b) => b.rotation);
            expect(Math.abs(sloped.rotation[2])).toBeGreaterThan(0.2);
            // A door at the lawn needs neither.
            const flat = sited({ ...EMPTY_HOME, id: 'e' }).inst;
            expect(flat.site.some((b) => b.role === 'rail')).toBe(false);
            expect(flat.site.find((b) => b.role === 'stoop').color).toBe('path');
        });

        test('a door just above the lawn needs only its landing and one step', () => {
            const { inst } = sited({ ...EMPTY_HOME, id: 'e' });
            const stoop = inst.site.filter((b) => b.role === 'stoop');
            expect(stoop).toHaveLength(2);
            expect(inst.site.find((b) => b.role === 'path')).toBeTruthy();
        });

        test('each garage has a driveway to the front, and the lawn has trees', () => {
            const { site, inst } = sited(FULL);
            const drives = inst.site.filter((b) => b.role === 'drive');
            expect(drives).toHaveLength(2);
            for (const d of drives) expect(d.position[2] + d.scale[2] / 2).toBeCloseTo(site.halfDepth, 9);
            const garageDoors = inst.windows.filter((w) => w.color === 'garageDoor');
            for (const g of garageDoors) expect(drives.some((d) => Math.abs(d.position[0] - g.position[0]) < 1e-9)).toBe(true);
            expect(sited(example()).inst.site.filter((b) => b.role === 'trunk').length).toBeGreaterThan(1);
            expect(sited(example()).inst.canopies.length).toBeGreaterThan(1);
        });

        test('the front door has a porch roof on cedar posts and stone piers, a lamp each side, and every window a frame', () => {
            const { inst } = sited(example());
            const door = inst.windows.find((w) => w.color === 'door');
            const porch = inst.site.find((t) => t.role === 'porch');
            expect(bottom(porch)).toBeGreaterThan(top(door));
            expect(porch.position[0]).toBeCloseTo(door.position[0], 9);
            const landing = inst.site.find((b) => b.role === 'stoop');
            const posts = inst.site.filter((b) => b.role === 'post');
            const piers = inst.site.filter((b) => b.role === 'pier');
            expect(posts).toHaveLength(2);
            expect(piers).toHaveLength(2);
            for (const post of posts) {
                expect(post.color).toBe('cedar');
                // From its pier on the landing up to the porch roof.
                expect(top(post)).toBeCloseTo(bottom(porch), 9);
                const pier = piers.find((x) => Math.abs(x.position[0] - post.position[0]) < 1e-9);
                expect(bottom(pier)).toBeCloseTo(top(landing), 9);
                expect(bottom(post)).toBeCloseTo(top(pier), 9);
                expect(Math.abs(post.position[0] - landing.position[0])).toBeLessThan(landing.scale[0] / 2);
            }
            const lamps = inst.trims.filter((t) => t.role === 'lamp');
            expect(lamps).toHaveLength(2);
            expect(lamps.map((l) => Math.sign(l.position[0] - door.position[0])).sort()).toEqual([-1, 1]);
            const glass = inst.windows.filter((w) => w.color === 'glass');
            const frames = inst.windows.filter((w) => w.role === 'frame');
            expect(frames).toHaveLength(glass.length);
            // Each pane's frame: the same middle along its wall and in
            // height, just behind it, and larger all round.
            for (const g of glass) {
                const along = g.side === 'front' || g.side === 'back' ? 0 : 2;
                expect(frames.some((f) => f.side === g.side && Math.abs(f.position[along] - g.position[along]) < 1e-9
                    && Math.abs(f.position[1] - g.position[1]) < 1e-9 && f.scale[along] > g.scale[along] && f.scale[1] > g.scale[1])).toBe(true);
            }
        });

        test('the roof has a ridge and gutters, and the walls their materials', () => {
            const { inst } = sited(FULL);
            // A ridge cap for each gable and a gutter along each of its eaves.
            for (const level of ['attic', 'detached-garage', 'garage']) {
                const gables = inst.gables.filter((x) => x.level === level);
                expect(inst.trims.filter((t) => t.level === level && t.role === 'ridge')).toHaveLength(gables.length);
                expect(inst.trims.filter((t) => t.level === level && t.role === 'gutter')).toHaveLength(2 * gables.length);
                const highest = Math.max(...gables.map((g) => g.top));
                const ridges = inst.trims.filter((t) => t.level === level && t.role === 'ridge');
                expect(Math.max(...ridges.map(bottom))).toBeGreaterThanOrEqual(highest - 1e-9);
            }
            // Gray lap siding all round, its courses on every outside wall, a
            // stone base along the front of the lowest story and the garage,
            // white walls inside.
            const colorOf = (level) => [...new Set(inst.walls.filter((w) => w.level === level && w.role === 'wall').map((w) => w.color))];
            for (const level of ['basement', 'main', 'garage']) expect(colorOf(level)).toEqual(['wall']);
            for (const w of inst.walls.filter((x) => x.role === 'wall' && x.level !== 'attic')) {
                expect(inst.siding.some((c) => c.role === 'course' && c.level === w.level && c.side === w.side)).toBe(true);
            }
            expect([...new Set(inst.siding.filter((b) => b.role === 'stoneBase').map((b) => b.level))].sort()).toEqual(['basement', 'detached-garage', 'garage']);
            // A garage's stone stops at its door, either side.
            for (const gd of inst.windows.filter((w) => w.role === 'garageDoor')) {
                const across = inst.siding.filter((b) => b.role === 'stoneBase' && b.level === gd.level
                    && Math.abs(b.position[0] - gd.position[0]) < (b.scale[0] + gd.scale[0]) / 2 - 1e-6);
                expect(`${gd.level}: ${across.length}`).toBe(`${gd.level}: 0`);
            }
            const inside = sited(example()).inst.walls.filter((w) => w.role === 'partition');
            expect(inside.length).toBeGreaterThan(5);
            for (const p2 of inside) expect(p2.color).toBe('interior');
        });

        test('a stair with no room on its outer side turns in, and it and its path stay in the yard', () => {
            // An entry at the front corner of a narrow house over a
            // basement: outward, the stair and its path would leave the yard.
            const home = {
                serviceType: 'cleaning', levels: ['basement', 'main', 'second'], items: [],
                rooms: [{ id: 'r0', level: 'main', area: 'entry', label: '' }, { id: 'r1', level: 'main', area: 'closet', label: '' }]
            };
            const { site, inst } = sited(home);
            const [landing, ...steps] = inst.site.filter((b) => b.role === 'stoop');
            expect(steps.length).toBeGreaterThan(0);
            const outward = landing.position[0] <= 0 ? -1 : 1;
            expect(Math.sign(steps[0].position[0] - landing.position[0])).toBe(-outward);
            for (const b of inst.site.filter((p) => ['stoop', 'path'].includes(p.role))) {
                const [x0, , x1] = rect(b);
                expect(Math.max(Math.abs(x0), Math.abs(x1))).toBeLessThanOrEqual(site.halfWidth + 1e-9);
            }
        });

        test("the porch's roof and posts step aside while the door's floor is open, its landing stays", () => {
            const roles = (inst) => inst.site.map((b) => b.role);
            const closed = sited(example()).inst;
            const open = sited(example(), 'main').inst;
            for (const role of ['porch', 'post', 'pier']) {
                expect(roles(closed)).toContain(role);
                expect(roles(open)).not.toContain(role);
            }
            expect(open.site.filter((b) => b.role === 'stoop')).toEqual(closed.site.filter((b) => b.role === 'stoop'));
            // Another floor open: the porch stays.
            expect(roles(sited(example(), 'second').inst)).toContain('porch');
        });

        test('a lift opens the house, never the garden', () => {
            const closed = sited(example()).inst;
            const open = sited(example(), 'basement').inst;
            expect(open.site).toEqual(closed.site);
            expect(open.canopies).toEqual(closed.canopies);
        });
    });

    test('even the tallest home, its lowest level lifted, is no taller than the turntable is wide', () => {
        const { layout, inst } = check(FULL, 'basement');
        const k = fitScale(layout, T, CONFIG.model.scale);
        const highest = Math.max(...Object.values(inst).flat().map((p) => p.top));
        expect(T.height + k * highest).toBeLessThan(2 * T.radius);
    });

    test('the example closed is no taller than a person standing beside the turntable', () => {
        const layout = layoutHome(example());
        const inst = instancesFor(layout, levelOffsets(layout.slabs, null, LIFT));
        const k = fitScale(layout, T, CONFIG.model.scale);
        const highest = Math.max(...Object.values(inst).flat().map((p) => p.top));
        expect(T.height + k * highest).toBeLessThan(1.7);
    });

    test('the stack: stories on walls, a garage on the ground', () => {
        const { tops, roof } = restack(layoutHome(FULL));
        expect(tops.get('main') - tops.get('basement')).toBeCloseTo(MODEL.slabThickness + wallHeight('basement'), 9);
        // Over a basement the garage stands at ground level, not beside the
        // main floor in the air; beside a ground floor, a step below it.
        expect(tops.get('garage')).toBeCloseTo(tops.get('basement'), 9);
        const ground = restack(layoutHome({ ...FULL, levels: ['main', 'garage'], rooms: [], items: [] })).tops;
        expect(ground.get('garage')).toBeCloseTo(ground.get('main') - MODEL.annex.drop, 9);
        expect(tops.get('detached-garage')).toBeCloseTo(tops.get('basement'), 9);
        expect(roof).toBeCloseTo(tops.get('attic') + HOUSE.knee, 9);
        expect(restack(layoutHome({ ...FULL, levels: ['garage'], rooms: [], items: [] })).roof).toBeNull();
    });

    test('a typical home is drawn larger than laid out, and only the widest smaller', () => {
        const { scale } = CONFIG.model;
        expect(fitScale(layoutHome(example()), T, scale)).toBe(scale.max);
        expect(fitScale(layoutHome(EMPTY_HOME), T, scale)).toBe(scale.max);
        const k = fitScale(layoutHome(FULL), T, scale);
        expect(k).toBeLessThan(scale.max);
        expect(k).toBeGreaterThan(0.85);
    });

    test('the yard grows the house by one margin on every side, its corners on the lawn', () => {
        for (const home of [example(), FULL, EMPTY_HOME]) {
            const layout = layoutHome(home);
            const k = fitScale(layout, T, CONFIG.model.scale);
            const site = siteFor(layout, T, k);
            expect(site.radius).toBeCloseTo(lawnRadius(T) / k, 9);
            expect(Math.hypot(site.halfWidth, site.halfDepth)).toBeCloseTo(site.radius, 9);
            const { slabs } = instancesFor(layout, new Map());
            const xs = slabs.flatMap((s) => [s.position[0] - s.scale[0] / 2, s.position[0] + s.scale[0] / 2]);
            const zs = slabs.flatMap((s) => [s.position[2] - s.scale[2] / 2, s.position[2] + s.scale[2] / 2]);
            const gx = site.halfWidth - (Math.max(...xs) - Math.min(...xs)) / 2;
            const gz = site.halfDepth - (Math.max(...zs) - Math.min(...zs)) / 2;
            expect(gx).toBeGreaterThan(0);
            expect(gx).toBeCloseTo(gz, 9);
        }
    });

    test('a garage beside the lowest floor rises with the model rather than sinking into the turntable', () => {
        const low = { ...FULL, levels: ['main', 'garage'], rooms: FULL.rooms.filter((r) => ['main', 'garage'].includes(r.level)) };
        const [cx, cy] = centerOf(layoutHome(low));
        expect(cy).toBeCloseTo(MODEL.annex.drop, 9);
        expect(cx).toBeLessThan(0);   // the garage is on the right, so the model shifts left
        const { slabs } = instancesFor(layoutHome(low), new Map());
        const main = slabs.find((s) => s.level === 'main');
        const garage = slabs.find((s) => s.level === 'garage');
        expect(bottom(garage)).toBeCloseTo(0, 9);
        expect(top(main) - top(garage)).toBeCloseTo(MODEL.annex.drop, 9);
        // With a basement under the main floor, nothing needs to rise.
        expect(centerOf(layoutHome(FULL))[1]).toBeCloseTo(0, 9);
    });
});

// ---- Seen from the camera (pure) --------------------------------------------------

describe('seen from the camera, the floor open and its front turned to the visitor', () => {
    /** Whether the segment from a to b passes through a box (slab method). */
    function crosses(a, b, box) {
        let t0 = 0;
        let t1 = 1;
        for (let k = 0; k < 3; k++) {
            const d = b[k] - a[k];
            const lo = box.position[k] - box.scale[k] / 2;
            const hi = box.position[k] + box.scale[k] / 2;
            if (Math.abs(d) < 1e-12) {
                if (a[k] < lo || a[k] > hi) return false;
                continue;
            }
            let u = (lo - a[k]) / d;
            let v = (hi - a[k]) / d;
            if (u > v) [u, v] = [v, u];
            t0 = Math.max(t0, u);
            t1 = Math.min(t1, v);
            if (t0 > t1) return false;
        }
        return true;
    }

    /** A box in the model's frame, as drawn on the stage: scaled, on the
     *  turntable's top, the house turned to face the camera. */
    const worldAt = (k) => (b) => ({
        ...b,
        position: [k * b.position[0], T.height + k * b.position[1], k * b.position[2]],
        scale: b.scale.map((v) => k * v)
    });

    /** A gable's record has its base at `position`: as a box for the
     *  sight test, its middle (a box round the prism, so a ray is blocked a
     *  little more than it would be). Roof slopes are tilted: their box
     *  round is wider still. */
    const asBox = (kind) => (b) => {
        if (kind === 'gables') return { ...b, position: [b.position[0], b.position[1] + b.scale[1] / 2, b.position[2]] };
        if (kind === 'roofs' && b.rotation) {
            const a = Math.abs(b.rotation[0]);
            const h = b.scale[2] * Math.sin(a) + b.scale[1] * Math.cos(a);
            const d = b.scale[2] * Math.cos(a) + b.scale[1] * Math.sin(a);
            return { ...b, scale: [b.scale[0], h, d] };
        }
        return b;
    };

    function seen(home, level, pointsFor) {
        const layout = layoutHome(home);
        const k = fitScale(layout, T, CONFIG.model.scale);
        const world = worldAt(k);
        const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
        const site = siteFor(layout, T, k);
        const inst = instancesFor(layout, levelOffsets(layout.slabs, level, LIFT), { lifted: level, areas, site });
        // What can stand in the way: everything but the lifted level's own
        // floors, fixtures, dots and flags (and, for its back row, its own
        // low walls, which a ray to the back of a room passes over by design).
        const solid = (withPartitions) => [
            ...inst.slabs.map(asBox('slabs')),
            ...inst.walls.filter((w) => withPartitions || !(w.level === level && w.role === 'partition')).map(asBox('walls')),
            ...inst.gables.map(asBox('gables')),
            ...inst.roofs.map(asBox('roofs')),
            ...inst.trims,
            ...inst.site,
            ...inst.canopies
        ].map(world);
        const misses = [];
        const height = k * Math.max(...Object.values(instancesFor(layout, new Map(), { areas, site })).flat().map((b) => b.top));
        const views = CONFIG.view.tilt;
        for (const aspect of [16 / 10, 0.45]) {
          // As a floor opens (turntable faceFront), and as low as it goes.
          for (const tilt of [views.open, views.min]) {
            const { eye } = framePose(aspect, height, { tilt, zoom: 1 }, CONFIG);
            for (const t of inst.tiles.filter((x) => x.level === level).map(world)) {
                for (const [at, withPartitions] of pointsFor(t)) {
                    const blocked = solid(withPartitions).find((o) => crosses(eye, at, o));
                    if (blocked) misses.push(`${level} ${t.roomId} at ${aspect.toFixed(2)}, tilt ${tilt}: ${blocked.level} ${blocked.role || ''}`);
                }
            }
          }
        }
        return misses;
    }

    test.each(['basement', 'main', 'second', 'third', 'attic'])('every room of the lifted %s can be seen, on a wide screen and a phone', (level) => {
        const misses = seen(FULL, level, (t) => {
            const k = t.scale[1] / MODEL.tileHeight;
            const floor = t.position[1] + t.scale[1] / 2;
            return [
                // The room's middle, over its low walls.
                [[t.position[0], floor + 0.001, t.position[2]], true],
                // Its back edge, at a flag's height: the whole room, back row included.
                [[t.position[0], floor + k * HOUSE.flag.pole, t.position[2] - t.scale[2] / 2 + 0.02 * k], false]
            ];
        });
        expect(misses).toEqual([]);
    });

    test.each(['basement', 'main', 'second'])('every room of the example\'s lifted %s can be seen', (level) => {
        const misses = seen(example(), level, (t) => [[[t.position[0], t.position[1] + t.scale[1] / 2 + 0.002, t.position[2]], true]]);
        expect(misses).toEqual([]);
    });
});

// ---- Built (real three) ----------------------------------------------------------------

describe('built with the real three.js', () => {
    let REAL;
    beforeAll(async () => {
        REAL = await loadRealThree();
    });
    beforeEach(() => {
        globalThis.THREE = REAL;
    });

    const AT = [0, CONFIG.stage.turntable.height, 0];
    const meshes = (m) => m.meshes;
    const positionOf = (mesh, i) => {
        const matrix = new REAL.Matrix4();
        mesh.getMatrixAt(i, matrix);
        return new REAL.Vector3().setFromMatrixPosition(matrix);
    };

    test('an empty turntable shows one empty floor', () => {
        const m = buildModel(CONFIG, AT);
        const { slabs, tiles, markers } = meshes(m);
        expect([slabs.count, tiles.count, markers.count]).toEqual([1, 0, 0]);
        expect(m.group.position.toArray()).toEqual(AT);
        // Colored from the start, so the shader that colors them is built
        // behind the loading screen, not when the first room arrives.
        expect(tiles.instanceColor).not.toBeNull();
        expect(markers.instanceColor).not.toBeNull();
        expect(tiles.instanceColor.count).toBe(CONFIG.limits.rooms);
    });

    test('the example home: three levels, thirteen rooms, twenty-seven tasks, in twenty-one draw calls', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        expect(m.show(home)).toBe(true);
        const { slabs, tiles, markers, flags, gables, roofs, windows } = meshes(m);
        expect([slabs.count, tiles.count, markers.count]).toEqual([3, 13, 27]);
        expect(flags.count).toBe(2 * home.items.filter((i) => i.important).length);
        expect(gables.count).toBe(2);   // the house and its cross gable
        expect(roofs.count).toBe(4);
        expect(windows.count).toBe(m.placed.windows.length);
        let n = 0;
        m.group.traverse((o) => { if (o.isMesh) n++; });
        expect(n).toBe(21);
        // Every part fits its mesh: nothing is dropped for want of room.
        for (const [kind, mesh] of Object.entries(meshes(m))) {
            expect(`${kind}: ${m.placed[kind].length <= mesh.instanceMatrix.count}`).toBe(`${kind}: true`);
            expect(mesh.count).toBe(m.placed[kind].length);
        }
        // Each instance is drawn where the arithmetic put it.
        for (let i = 0; i < markers.count; i++) {
            const want = m.placed.markers[i].position;
            expect(positionOf(markers, i).toArray().map((v, k) => v - want[k]).every((d) => Math.abs(d) < 1e-6)).toBe(true);
        }
        // In the accent, glowing a little so they never go black in shade.
        const c = new REAL.Color();
        markers.getColorAt(0, c);
        expect(`#${c.getHexString()}`.toUpperCase()).toBe(CONFIG.model.marker.toUpperCase());
        expect(`#${markers.material.emissive.getHexString()}`.toUpperCase()).toBe(CONFIG.model.marker.toUpperCase());
        expect(markers.material.emissiveIntensity).toBe(CONFIG.model.markerGlow);
        expect(CONFIG.model.markerGlow).toBeGreaterThan(0);
    });

    test('each bathroom is drawn by its own type of bath, and a new type redraws it', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        const primary = home.rooms.find((r) => r.area === 'primary-bathroom');
        const hall = home.rooms.find((r) => r.label === 'Hall bath');
        const roles = (roomId) => new Set([...m.placed.fixtures, ...m.placed.rounds].filter((p) => p.roomId === roomId).map((p) => p.role));
        m.show(home);
        expect(primary.bath).toBe('shower');
        expect(roles(primary.id).has('shower')).toBe(true);
        expect(roles(primary.id).has('tub')).toBe(false);
        expect(roles(hall.id).has('tub')).toBe(true);
        const allShowers = { ...home, rooms: home.rooms.map((r) => (r.id === hall.id ? { ...r, bath: 'shower' } : r)) };
        expect(m.show(allShowers)).toBe(true);
        expect(roles(hall.id).has('tub')).toBe(false);
        expect(roles(hall.id).has('shower')).toBe(true);
    });

    test('the same home again changes nothing, and one more task changes the model', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        m.show(home);
        expect(m.show({ ...home, title: 'Renamed' })).toBe(false);
        const extra = { ...home, items: [...home.items, { ...home.items[0], id: 'one-more', order: 9 }] };
        expect(m.show(extra)).toBe(true);
        expect(meshes(m).markers.count).toBe(28);
        // A star makes its pin taller.
        const starredNow = { ...extra, items: extra.items.map((i) => (i.id === 'one-more' ? { ...i, important: !i.important } : i)) };
        expect(m.show(starredNow)).toBe(true);
        const fewer = { ...extra, items: extra.items.map((i) => (i.id === 'one-more' ? { ...i, deletedAt: NOW.toISOString() } : i)) };
        expect(m.show(fewer)).toBe(true);
        expect(meshes(m).markers.count).toBe(27);
    });

    test('a lift is eased over its time, and lands exactly', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        const yOf = (level) => m.placed.slabs.find((s) => s.level === level).position[1];
        const restSecond = yOf('second');
        expect(m.lift('main')).toBe(true);
        expect(m.moving).toBe(true);
        expect(m.tick(LIFT.seconds * 0.1)).toBe(true);
        const early = yOf('second') - restSecond;
        expect(early).toBeGreaterThan(0);
        expect(early).toBeLessThan(LIFT.open * 0.1);
        m.tick(LIFT.seconds);
        expect(m.moving).toBe(false);
        expect(yOf('second') - restSecond).toBeCloseTo(LIFT.open, 9);
        expect(m.tick(0.016)).toBe(false);
        // And back down.
        m.lift(null);
        m.tick(LIFT.seconds * 2);
        expect(yOf('second')).toBeCloseTo(restSecond, 9);
    });

    test('under reduced motion a lift is instant', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        m.lift('basement', true);
        expect(m.moving).toBe(false);
        expect(m.lifted).toBe('basement');
        const closed = buildModel(CONFIG, AT);
        closed.show(example());
        const yOf = (mm, level) => mm.placed.slabs.find((s) => s.level === level).position[1];
        expect(yOf(m, 'main') - yOf(closed, 'main')).toBeCloseTo(LIFT.open, 9);
        expect(yOf(m, 'basement') - yOf(closed, 'basement')).toBeCloseTo(LIFT.raise, 9);
    });

    test('only a level the home has can be lifted', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        expect(m.lift('attic')).toBe(false);
        expect(m.lifted).toBeNull();
    });

    test("the lifted level's rooms are named, each over its own tile", () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        m.show(home);
        expect(m.labels()).toEqual([]);
        m.lift('second', true);
        const labels = m.labels();
        const second = home.rooms.filter((r) => r.level === 'second');
        expect(labels.map((l) => l.text).sort()).toEqual(second.map((r) => roomName('cleaning', r)).sort());
        // Over each tile as drawn: scaled up, on the turntable.
        const k = m.scale;
        expect(k).toBe(CONFIG.model.scale.max);
        expect(m.group.scale.x).toBe(k);
        for (const l of labels) {
            const tile = m.placed.tiles.find((t) => t.roomId === l.roomId);
            expect(l.point[0]).toBeCloseTo(AT[0] + k * tile.position[0], 9);
            expect(l.point[1]).toBeCloseTo(AT[1] + k * top(tile), 9);
            expect(l.point[2]).toBeCloseTo(AT[2] + k * tile.position[2], 9);
        }
    });

    test('another home, or the lifted level removed, sets the model down', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        m.show(home);
        m.lift('basement', true);
        m.show({ ...home, levels: home.levels.filter((l) => l !== 'basement'), rooms: home.rooms.filter((r) => r.level !== 'basement') });
        expect(m.lifted).toBeNull();
        m.lift('second', true);
        m.show(FULL);
        expect(m.lifted).toBeNull();
        expect(meshes(m).slabs.count).toBe(LEVELS.length);
    });

    test('a hit on the model says which level it met', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        m.show(home);
        const { tiles, markers, slabs } = meshes(m);
        const k = m.placed.tiles.findIndex((t) => t.level === 'basement');
        expect(m.levelOfHit({ object: tiles, instanceId: k })).toBe('basement');
        expect(m.levelOfHit({ object: markers, instanceId: 0 })).toBe(m.placed.markers[0].level);
        expect(m.levelOfHit({ object: slabs, instanceId: 2 })).toBe(m.placed.slabs[2].level);
        expect(m.levelOfHit({ object: {}, instanceId: 0 })).toBeNull();
        expect(m.levelOfHit(null)).toBeNull();
    });

    test('a hit says its level, the room of anything in one, and the task of a dot', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        const { markers, tiles, fixtures, walls, roofs } = meshes(m);
        const dot = m.placed.markers[2];
        expect(m.hitOf({ object: markers, instanceId: 2 })).toEqual({ level: dot.level, roomId: dot.roomId, itemId: dot.itemId });
        const tile = m.placed.tiles[4];
        expect(m.hitOf({ object: tiles, instanceId: 4 })).toEqual({ level: tile.level, roomId: tile.roomId, itemId: null });
        // A bed or a sofa is its room.
        const fx = m.placed.fixtures.findIndex((f) => f.roomId);
        expect(m.hitOf({ object: fixtures, instanceId: fx }).roomId).toBe(m.placed.fixtures[fx].roomId);
        expect(m.placed.fixtures.every((f) => f.roomId)).toBe(true);
        // An outside wall or the roof is only its level.
        const wall = m.placed.walls.findIndex((w) => w.role === 'wall');
        expect(m.hitOf({ object: walls, instanceId: wall })).toEqual({ level: m.placed.walls[wall].level, roomId: null, itemId: null });
        expect(m.hitOf({ object: roofs, instanceId: 0 }).roomId).toBeNull();
        expect(m.hitOf({ object: {}, instanceId: 0 })).toBeNull();
        expect(m.hitOf(null)).toBeNull();
    });

    test('a selected room is outlined in the accent just inside its floor, a hovered one faintly, and a selected dot stands out', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        m.show(home);
        expect(m.placed.outlines).toHaveLength(0);
        const tile = m.placed.tiles[3];
        const item = home.items.find((i) => i.roomId === tile.roomId);
        expect(m.select({ roomId: tile.roomId, itemId: item.id })).toBe(true);
        expect(m.select({ roomId: tile.roomId, itemId: item.id })).toBe(false);
        const lines = m.placed.outlines;
        expect(lines).toHaveLength(4);
        expect(lines.every((l) => l.roomId === tile.roomId && l.color === 'outline')).toBe(true);
        const floorTop = tile.position[1] + tile.scale[1] / 2;
        for (const l of lines) {
            expect(l.position[1] - l.scale[1] / 2).toBeCloseTo(floorTop, 9);
            expect(Math.abs(l.position[0] - tile.position[0]) + l.scale[0] / 2).toBeLessThanOrEqual(tile.scale[0] / 2 + 1e-9);
            expect(Math.abs(l.position[2] - tile.position[2]) + l.scale[2] / 2).toBeLessThanOrEqual(tile.scale[2] / 2 + 1e-9);
        }
        const dot = m.placed.markers.find((d) => d.itemId === item.id);
        const other = m.placed.markers.find((d) => d.itemId !== item.id);
        expect(dot.selected).toBe(true);
        expect(dot.scale[0]).toBeCloseTo(other.scale[0] * HOUSE.dot.selected, 9);
        // Painted: the selected dot and the outline in the accent.
        const accent = new REAL.Color(CONFIG.colors.accent);
        const c = new REAL.Color();
        m.meshes.markers.getColorAt(m.placed.markers.indexOf(dot), c);
        expect(c.getHex()).toBe(accent.getHex());
        m.meshes.outlines.getColorAt(0, c);
        expect(c.getHex()).toBe(accent.getHex());
        // Hovering another room adds its faint outline, the selected room's own never doubles.
        const near = m.placed.tiles.find((t) => t.roomId !== tile.roomId);
        expect(m.hover(near.roomId)).toBe(true);
        expect(m.placed.outlines.filter((l) => l.color === 'outlineHover')).toHaveLength(4);
        expect(m.hover(tile.roomId)).toBe(true);
        expect(m.placed.outlines).toHaveLength(4);
        expect(m.hover(null)).toBe(false);
        // Another home clears it.
        m.show({ ...EMPTY_HOME, id: 'other' });
        expect(m.selection).toEqual({ roomId: null, itemId: null, hoverRoomId: null });
    });

    test('a range hood and a mirror hang on an outside wall, and not over a low partition', () => {
        // The example's kitchen backs onto the living room: only a partition.
        const ex = example();
        const kitchen = ex.rooms.find((r) => r.area === 'kitchen');
        const areas = new Map(ex.rooms.map((r) => [r.id, r.area]));
        const parts = instancesFor(layoutHome(ex), new Map(), { areas }).fixtures.filter((f) => f.roomId === kitchen.id);
        expect(parts.some((f) => f.role === 'range')).toBe(true);
        expect(parts.some((f) => f.role === 'hood')).toBe(false);
        // A kitchen alone on its floor backs onto the outside wall.
        const alone = { ...EMPTY_HOME, id: 'k', rooms: [{ id: 'k1', level: 'main', area: 'kitchen', label: '' }] };
        const own = instancesFor(layoutHome(alone), new Map(), { areas: new Map([['k1', 'kitchen']]) }).fixtures;
        expect(own.some((f) => f.role === 'hood')).toBe(true);
    });

    test('a hit on a dot or its flag says which task it is, and anything else none', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        const { markers, flags, tiles } = meshes(m);
        expect(m.itemOfHit({ object: markers, instanceId: 3 })).toBe(m.placed.markers[3].itemId);
        expect(m.placed.markers[3].itemId).toBeTruthy();
        expect(m.itemOfHit({ object: flags, instanceId: 1 })).toBe(m.placed.flags[1].itemId);
        expect(m.itemOfHit({ object: tiles, instanceId: 0 })).toBeNull();
        expect(m.itemOfHit({ object: markers, instanceId: 9999 })).toBeNull();
        expect(m.itemOfHit({ object: markers })).toBeNull();
        expect(m.itemOfHit(null)).toBeNull();
    });

    test('every part is painted its own color from the palette', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        const pal = CONFIG.model.palette;
        const c = new REAL.Color();
        const hex = () => `#${c.getHexString()}`.toUpperCase();
        for (const kind of ['slabs', 'tiles', 'walls', 'siding', 'windows', 'gables', 'fixtures', 'trims', 'site', 'canopies', 'blooms', 'firs']) {
            const mesh = meshes(m)[kind];
            expect(mesh.count).toBeGreaterThan(0);
            m.placed[kind].forEach((p, i) => {
                mesh.getColorAt(i, c);
                expect(`${kind} ${i}: ${hex()}`).toBe(`${kind} ${i}: ${(pal[p.color] || pal.wall).toUpperCase()}`);
            });
        }
        // The rooms' floors follow the kind of room.
        const home = example();
        const floorOf = (area) => m.placed.tiles.find((t) => home.rooms.find((r) => r.id === t.roomId).area === area).color;
        expect(floorOf('kitchen')).toBe('oak');   // white cabinets on white oak
        expect(floorOf('living')).toBe('oak');
        expect(floorOf('primary-bathroom')).toBe('tileBath');
    });

    test('every fixture is painted from the palette, each room in two colors of its own', () => {
        const pal = CONFIG.model.palette;
        for (const area of Object.keys(KIT_OF)) {
            for (const bath of ['tub', 'shower']) {
                for (const p of kitFor(area, 0.5, 0.4, { bath })) {
                    expect(`${area} ${p.role}: ${p.color in pal || ['accent', 'accent2'].includes(p.color)}`).toBe(`${area} ${p.role}: true`);
                }
            }
        }
        for (let i = 1; i <= ACCENTS; i++) expect(pal[`accent${i}`]).toBeTruthy();
        const m = buildModel(CONFIG, AT);
        const home = example();
        m.show(home);
        for (const f of [...m.placed.fixtures, ...m.placed.blooms, ...m.placed.rounds]) expect(`${f.color}: ${f.color in pal}`).toBe(`${f.color}: true`);
        // A room's two colors differ, the same room always gets the same,
        // and the home's rooms are not all one color.
        for (const r of home.rooms) {
            const own = accentsFor(r.id);
            expect(own.accent).not.toBe(own.accent2);
            expect(accentsFor(r.id)).toEqual(own);
        }
        expect(new Set(home.rooms.map((r) => accentsFor(r.id).accent)).size).toBeGreaterThan(3);
        // The sofa and the bedspread wear the room's color.
        const sofaRoom = home.rooms.find((r) => r.area === 'living');
        expect(m.placed.fixtures.filter((f) => f.roomId === sofaRoom.id).map((f) => f.color)).toContain(accentsFor(sofaRoom.id).accent);
        // Plants in the living room, in white planters.
        expect(m.placed.blooms.some((b) => b.roomId === sofaRoom.id && b.color === 'plant')).toBe(true);
        expect(m.placed.rounds.some((f) => f.roomId === sofaRoom.id && f.color === 'pot')).toBe(true);
    });

    test('an Eastside new build: gray siding, a white gable, a black door, cedar posts, clipped shrubs, a maple in front and firs behind', () => {
        const m = buildModel(CONFIG, AT);
        m.show({ ...example(), levels: [...example().levels, 'garage'], rooms: [...example().rooms, { id: 'gar-1', level: 'garage', area: 'garage', label: '' }] });
        const pl = m.placed;
        const pal = CONFIG.model.palette;
        expect(new Set(pl.walls.filter((w) => w.role === 'wall').map((w) => w.color))).toEqual(new Set(['wall']));
        expect(pl.gables.find((g) => g.role === 'cross').color).toBe('gable');
        expect(pl.windows.find((w) => w.color === 'door')).toBeTruthy();
        expect(pal.door).toBe(pal.frame);
        expect(pl.windows.find((w) => w.role === 'garageDoor').color).toBe('cedar');
        // No window boxes, flower beds of five colors or mailbox: those were
        // the toy house. Clipped shrubs, a hydrangea every third.
        expect(pl.trims.some((t) => t.role === 'windowbox')).toBe(false);
        expect(pl.site.some((b) => b.role === 'mailbox')).toBe(false);
        const shrubs = pl.canopies.filter((c) => c.role === 'shrub');
        expect(shrubs.length).toBeGreaterThan(6);
        expect(new Set(shrubs.map((c) => c.color))).toEqual(new Set(['shrub', 'hydrangea']));
        expect(pl.canopies.some((c) => c.role === 'maple')).toBe(true);
        expect(pl.firs.length).toBeGreaterThan(0);
        // The maple in front of the house, the firs behind it.
        const houseFront = Math.max(...pl.slabs.map((x) => x.position[2] + x.scale[2] / 2));
        const houseBack = Math.min(...pl.slabs.map((x) => x.position[2] - x.scale[2] / 2));
        for (const c of pl.canopies.filter((x) => x.role === 'maple')) expect(c.position[2]).toBeGreaterThan(houseFront);
        for (const f of pl.firs) expect(f.position[2]).toBeLessThan(houseBack + 0.1);
        // The roof is asphalt, and mirrors nothing.
        expect(m.shiny).toEqual([]);
    });

    test("Steve's palette: no walnut and no brass anywhere in the house", () => {
        // A dark, saturated warm hue (orange through yellow) reads as walnut
        // or brass, "cheap 90's". Pale oak and sand are light; the trunks are
        // nearly gray.
        const hsl = (hex) => {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const l = (max + min) / 2;
            const d = max - min;
            if (!d) return [0, 0, l];
            const sat = d / (1 - Math.abs(2 * l - 1));
            let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
            return [h, sat, l];
        };
        // Warm color is wanted on the model (QA, 2026-10-13); what is not is
        // a dark, saturated brown (walnut) or a dull olive gold (brass).
        const walnut = ([h, sat, l]) => h >= 15 && h <= 45 && sat > 0.25 && l < 0.42;
        const brass = ([h, sat, l]) => h >= 48 && h <= 62 && sat > 0.35 && l < 0.6;
        for (const [name, hex] of Object.entries(CONFIG.model.palette)) {
            const c = hsl(hex);
            expect(`${name} ${hex}: ${walnut(c) || brass(c)}`).toBe(`${name} ${hex}: false`);
        }
        // The check itself catches walnut and brass, and passes cedar and mustard.
        expect(walnut(hsl('#5C4033'))).toBe(true);
        expect(brass(hsl('#B5A642'))).toBe(true);
        expect(walnut(hsl('#C08A5B')) || brass(hsl('#C08A5B'))).toBe(false);
        expect(walnut(hsl('#D9A441')) || brass(hsl('#D9A441'))).toBe(false);
    });

    test('the lawn fills the turntable inside its rim, round, and the house stands on it', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        expect(m.placed.site.some((p) => p.role === 'lawn')).toBe(false);
        const [lawn] = m.placed.lawn;
        const k = m.scale;
        expect(k * lawn.scale[0]).toBeCloseTo(2 * (T.radius - T.rim), 9);
        expect(k * lawn.scale[2]).toBeCloseTo(2 * (T.radius - T.rim), 9);
        expect(m.toWorld([lawn.position[0], 0, lawn.position[2]])).toEqual([AT[0], AT[1], AT[2]]);
        // The lawn is a disc: a cylinder drawn once.
        const mesh = m.meshes.lawn;
        expect(mesh.count).toBe(1);
        expect(mesh.geometry.type).toBe('CylinderGeometry');
    });

    test("the house's height is its highest point standing closed, in the stage's meters", () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        const closed = Math.max(...Object.values(m.placed).flat().map((p) => p.top)) * m.scale;
        expect(m.height).toBeCloseTo(closed, 9);
        // Opening a floor lifts the stories above it, but the frame keeps
        // the house's closed height.
        m.lift('basement', true);
        expect(Math.max(...Object.values(m.placed).flat().map((p) => p.top)) * m.scale).toBeGreaterThan(closed);
        expect(m.height).toBeCloseTo(closed, 9);
    });
});

// ---- Nothing fights at the front door (pure) ------------------------------------------

describe('the front door, without z-fighting', () => {
    // QA, 2026-10-14: a window was drawn on the door of a house with no
    // rooms by it, the stone base ran across the door and the low windows a
    // tenth of a millimeter proud of them, and the railing's posts stood in
    // the piers at their depth. Two parts of different colors whose faces
    // turned the same way overlap closer than this fight on a real GPU.
    const CLEAR = 0.0005;   // model meters, about three quarters of a millimeter on the turntable

    function fights(home) {
        const layout = layoutHome(home);
        const k = fitScale(layout, T, CONFIG.model.scale);
        const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
        const inst = instancesFor(layout, new Map(), { areas, site: siteFor(layout, T, k) });
        const boxes = [...inst.windows, ...inst.siding, ...inst.trims, ...inst.site].filter((p) => !p.rotation);
        const door = inst.windows.find((p) => p.color === 'door');
        if (!door) return [];
        const lo = (b, a) => b.position[a] - b.scale[a] / 2;
        const hi = (b, a) => b.position[a] + b.scale[a] / 2;
        // The door's neighborhood, out to its lamps, piers and railing.
        const near = boxes.filter((b) => Math.abs(b.position[0] - door.position[0]) < 0.12 && hi(b, 2) > lo(door, 2) - 0.01 && lo(b, 1) < hi(door, 1) + 0.03);
        const out = [];
        for (let i = 0; i < near.length; i++) {
            for (let j = i + 1; j < near.length; j++) {
                const A = near[i];
                const B = near[j];
                if (A.color === B.color) continue;
                // Their faces toward the street (+z) and toward each side.
                for (const [ax, face] of [[2, hi], [0, lo], [0, hi]]) {
                    if (Math.abs(face(A, ax) - face(B, ax)) > CLEAR) continue;
                    const overlap = [0, 1, 2].filter((x) => x !== ax).every((x) => Math.min(hi(A, x), hi(B, x)) - Math.max(lo(A, x), lo(B, x)) > 1e-6);
                    if (overlap) out.push(`${A.role || A.color} and ${B.role || B.color} on ${'xyz'[ax]}`);
                }
            }
        }
        return out;
    }

    test('on the plain houses a first visit meets, the example, and three hundred others', () => {
        const plain = (levels) => ({ id: levels.join('-'), serviceType: 'cleaning', levels, rooms: [], items: [] });
        const homes = [plain(['main']), plain(['main', 'second']), plain(['basement', 'main']), plain(['basement', 'main', 'second', 'third']), example(), ...HOMES];
        for (const home of homes) expect(`${home.id}: ${fights(home).join(', ') || 'none'}`).toBe(`${home.id}: none`);
    });

    test('the stone base stops at every window that comes down into it, all along the front', () => {
        const plain = { id: 'plain', serviceType: 'cleaning', levels: ['main', 'second'], rooms: [], items: [] };
        let cut = 0;
        for (const home of [plain, ...HOMES]) {
            const layout = layoutHome(home);
            const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
            const inst = instancesFor(layout, new Map(), { areas });
            const stone = inst.siding.filter((p) => p.role === 'stoneBase');
            const low = inst.windows.filter((p) => p.side === 'front' && (p.color === 'glass' || p.role === 'frame') && p.level === (stone[0] || {}).level);
            for (const w of low) {
                const reaches = w.position[1] - w.scale[1] / 2 < stone[0].position[1] + stone[0].scale[1] / 2;
                if (!reaches) continue;
                cut++;
                const under = stone.filter((st) => Math.abs(st.position[0] - w.position[0]) < (st.scale[0] + w.scale[0]) / 2 - 1e-6);
                expect(`${home.id}: ${under.length}`).toBe(`${home.id}: 0`);
            }
        }
        expect(cut).toBeGreaterThan(0);
    });

    test('a window never covers the door, and the stone base stops at it', () => {
        const home = { id: 'plain', serviceType: 'cleaning', levels: ['main'], rooms: [], items: [] };
        const layout = layoutHome(home);
        const inst = instancesFor(layout, new Map(), { areas: new Map(), site: siteFor(layout, T, fitScale(layout, T, CONFIG.model.scale)) });
        const door = inst.windows.find((p) => p.color === 'door');
        const casing = inst.windows.find((p) => p.role === 'casing');
        const across = (b, d) => Math.abs(b.position[0] - d.position[0]) < (b.scale[0] + d.scale[0]) / 2;
        expect(inst.windows.filter((p) => p.side === 'front' && p.color === 'glass' && across(p, door))).toEqual([]);
        const stone = inst.siding.filter((p) => p.role === 'stoneBase');
        expect(stone.length).toBeGreaterThan(1);
        expect(stone.filter((p) => across(p, casing))).toEqual([]);
        // Still a base the length of the front, short of the door and the windows.
        const front = stone.reduce((n, p) => n + p.scale[0], 0);
        expect(front).toBeGreaterThan(layout.slabs[0].width * 0.6);
    });
});
