// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The house model on the plinth (www/whitestone/js/model.js): every room
 * sits on its level and every task in its room, lifted or not; a lifted
 * level opens enough to be seen into; the model is centered on the plinth
 * and fits it for any home; and the built model draws exactly the home it
 * was handed, in three instanced meshes, against the real three.js.
 *
 * Each random home draws from its own well-mixed seed.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { levelOffsets, centerOf, instancesFor, buildModel, EMPTY_HOME } from '../www/whitestone/js/model.js';
import { layoutHome, MODEL } from '../www/whitestone/js/layout.js';
import { TAXONOMY, roomName } from '../www/whitestone/js/taxonomy.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { poseFor } from '../www/whitestone/js/stations.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const AREAS = TAXONOMY.cleaning.areas.map((a) => a.key);
const LEVELS = TAXONOMY.cleaning.levels.map((l) => l.key);
const LIFT = CONFIG.model.lift;
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

    test.each(['basement', 'main', 'second', 'third', 'attic'])('lifting the %s raises it a little and every story above it a lot', (level) => {
        const off = levelOffsets(slabs, level, LIFT);
        const chosen = slabs.find((s) => s.level === level);
        for (const s of slabs) {
            const want = s.level === level ? LIFT.raise : (s.kind === 'story' && s.y > chosen.y ? LIFT.open : 0);
            expect(`${s.level}: ${off.get(s.level)}`).toBe(`${s.level}: ${want}`);
        }
    });

    test.each(['garage', 'detached-garage'])('lifting the %s moves nothing else', (level) => {
        const off = levelOffsets(slabs, level, LIFT);
        for (const s of slabs) expect(off.get(s.level)).toBe(s.level === level ? LIFT.open : 0);
    });
});

// ---- Every instance in its place (pure) ----------------------------------------------

describe('instances', () => {
    function check(home, lifted) {
        const layout = layoutHome(home);
        const off = levelOffsets(layout.slabs, lifted, LIFT);
        const inst = instancesFor(layout, off);
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
            expect(m.scale[1]).toBe(m.important ? MODEL.marker.starHeight : MODEL.marker.height);
        }
        return { layout, inst };
    }

    test('every room on its level and every task in its room, for any home, lifted or not', () => {
        for (const home of HOMES) {
            check(home, null);
            check(home, home.levels[0]);
        }
    });

    test('a lifted story opens far enough to see into, and the rest stay closed', () => {
        for (const level of ['basement', 'main', 'second', 'third']) {
            const { inst } = check(FULL, level);
            const stories = inst.slabs.filter((s) => !['garage', 'detached-garage'].includes(s.level))
                .sort((a, b) => a.position[1] - b.position[1]);
            const k = stories.findIndex((s) => s.level === level);
            const above = stories[k + 1];
            const highest = Math.max(...inst.markers.filter((m) => m.level === level).map((m) => m.position[1] + m.scale[1]));
            // From the top of the tallest pin to the underside of the level
            // above: at least a hand's width, where closed it is a finger's.
            expect(bottom(above) - highest).toBeGreaterThan(0.3);
            const closed = check(FULL, null).inst;
            const closedHighest = Math.max(...closed.markers.filter((m) => m.level === level).map((m) => m.position[1] + m.scale[1]));
            expect(bottom(closed.slabs.find((s) => s.level === above.level)) - closedHighest).toBeLessThan(0.15);
        }
    });

    test('the model is centered on the plinth and fits on it, for any home', () => {
        const p = CONFIG.studio.plinth;
        for (const home of [...HOMES, FULL, EMPTY_HOME]) {
            const { slabs } = instancesFor(layoutHome(home), new Map());
            const xs = slabs.flatMap((s) => [s.position[0] - s.scale[0] / 2, s.position[0] + s.scale[0] / 2]);
            const zs = slabs.flatMap((s) => [s.position[2] - s.scale[2] / 2, s.position[2] + s.scale[2] / 2]);
            expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
            expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 9);
            expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(p.width - 0.1);
            expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(p.depth - 0.1);
            // The lowest level stands on the plinth's top.
            expect(Math.min(...slabs.map(bottom))).toBeCloseTo(0, 9);
        }
    });

    test('even the tallest home, its top level lifted, stays well under the ceiling', () => {
        const { inst } = check(FULL, 'basement');
        const highest = Math.max(...inst.slabs.map(top), ...inst.markers.map((m) => m.position[1] + m.scale[1]));
        expect(CONFIG.studio.plinth.height + highest).toBeLessThan(CONFIG.room.height - 0.8);
    });

    test('a garage beside the lowest floor rises with the model rather than sinking into the plinth', () => {
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

// ---- Seen from the model station (pure) --------------------------------------------------

describe('seen from the model station', () => {
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

    const p = CONFIG.studio.plinth;
    const world = (b) => ({ ...b, position: [b.position[0] + p.x, b.position[1] + p.height, b.position[2] + p.z] });

    test.each(['basement', 'main', 'second', 'third'])('every room of the lifted %s can be seen, on a wide screen and a phone', (level) => {
        const layout = layoutHome(FULL);
        const inst = instancesFor(layout, levelOffsets(layout.slabs, level, LIFT));
        const others = inst.slabs.filter((s) => s.level !== level).map(world);
        for (const aspect of [16 / 10, 0.45]) {
            const { eye } = poseFor('model', aspect, CONFIG);
            for (const t of inst.tiles.filter((x) => x.level === level).map(world)) {
                // The room's middle, and its back edge with a starred pin's
                // head on it: the whole room, back row included.
                for (const [dz, up] of [[0, 0.001], [-t.scale[2] / 2 + 0.02, MODEL.marker.starHeight]]) {
                    const at = [t.position[0], t.position[1] + t.scale[1] / 2 + up, t.position[2] + dz];
                    const blocked = others.find((o) => crosses(eye, at, o));
                    expect(`${level} ${t.roomId} at ${aspect.toFixed(2)}: ${blocked ? blocked.level : 'clear'}`)
                        .toBe(`${level} ${t.roomId} at ${aspect.toFixed(2)}: clear`);
                }
            }
        }
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

    const AT = [0, 0.82, -0.7];
    const meshes = (m) => {
        const [slabs, tiles, markers] = m.pickable;
        return { slabs, tiles, markers };
    };
    const positionOf = (mesh, i) => {
        const matrix = new REAL.Matrix4();
        mesh.getMatrixAt(i, matrix);
        return new REAL.Vector3().setFromMatrixPosition(matrix);
    };

    test('the empty plinth shows one empty floor', () => {
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

    test('the example home: three levels, thirteen rooms, twenty-seven tasks, in three draw calls', () => {
        const m = buildModel(CONFIG, AT);
        const home = example();
        expect(m.show(home)).toBe(true);
        const { slabs, tiles, markers } = meshes(m);
        expect([slabs.count, tiles.count, markers.count]).toEqual([3, 13, 27]);
        let n = 0;
        m.group.traverse((o) => { if (o.isMesh) n++; });
        expect(n).toBe(3);
        // Each instance is drawn where the arithmetic put it.
        for (let i = 0; i < markers.count; i++) {
            const want = m.placed.markers[i].position;
            expect(positionOf(markers, i).toArray().map((v, k) => v - want[k]).every((d) => Math.abs(d) < 1e-6)).toBe(true);
        }
        // In the accent.
        const c = new REAL.Color();
        markers.getColorAt(0, c);
        expect(`#${c.getHexString()}`.toUpperCase()).toBe(CONFIG.model.marker.toUpperCase());
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
        const off = m.placed.slabs.find((s) => s.level === 'main').position[1] - layoutHome(example()).slabs.find((s) => s.level === 'main').y;
        // The example has a basement, so the model stands as laid out.
        expect(off).toBeCloseTo(LIFT.open - MODEL.slabThickness / 2, 9);
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
        for (const l of labels) {
            const tile = m.placed.tiles.find((t) => t.roomId === l.roomId);
            expect(l.point[0]).toBeCloseTo(AT[0] + tile.position[0], 9);
            expect(l.point[1]).toBeCloseTo(AT[1] + top(tile), 9);
            expect(l.point[2]).toBeCloseTo(AT[2] + tile.position[2], 9);
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

    test('a lifted level wears the lifted tint, and only its rooms', () => {
        const m = buildModel(CONFIG, AT);
        m.show(example());
        m.lift('main', true);
        const { tiles } = meshes(m);
        const c = new REAL.Color();
        m.placed.tiles.forEach((t, i) => {
            tiles.getColorAt(i, c);
            const want = t.level === 'main' ? CONFIG.model.lifted : CONFIG.model.tile;
            expect(`#${c.getHexString()}`.toUpperCase()).toBe(want.toUpperCase());
        });
    });
});
