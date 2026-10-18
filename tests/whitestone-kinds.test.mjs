// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The kinds of residence on the turntable (M2 step 4c-2, PRD 8.9): a
 * townhome, narrower and deeper, its garage tucked under its main floor and
 * its stoop coming down toward the street, between plain white neighbors; a
 * condo, wider and shallower, a slice of a small white building with a
 * balcony, on a paved plaza. Every form fits the turntable, nothing it adds
 * fights another part, and the massing is never a place to tap.
 *
 * Checked by eye in scripts/whitestone-model-preview.mjs --kinds.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { layoutHome, slabsFor, neighborsFor, kindOf, tuckedGarage, extentOf, MODEL } from '../www/whitestone/js/layout.js';
import { instancesFor, levelOffsets, fitScale, siteFor, lawnRadius, buildModel, layoutKey, HOUSE } from '../www/whitestone/js/model.js';
import { TAXONOMY } from '../www/whitestone/js/taxonomy.js';
import { firstPick } from '../www/whitestone/js/stage.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';

const NOW = new Date('2026-10-14T16:00:00Z');
const T = CONFIG.stage.turntable;
const LIFT = CONFIG.model.lift;
const AREAS = TAXONOMY.cleaning.areas.map((a) => a.key);
const example = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];
const upstairs = example.rooms.filter((r) => r.level !== 'basement');
const garageRoom = { id: 'garage-room', level: 'garage', area: 'garage', label: '' };

const TOWN_END = { kind: 'townhome', attached: 'end' };
const TOWN_MID = { kind: 'townhome', attached: 'middle' };
const CONDO = { kind: 'condo', attached: null };
const home = (residence, levels, rooms = [], id = 'home') => ({ id, serviceType: 'cleaning', residence, levels, rooms, items: [] });

/** Every part of a home on its site, with the scale it is drawn at. */
function drawn(h, lifted = null) {
    const layout = layoutHome(h);
    const k = fitScale(layout, T, CONFIG.model.scale);
    const areas = new Map((h.rooms || []).map((r) => [r.id, r.area]));
    const inst = instancesFor(layout, levelOffsets(layout.slabs, lifted, LIFT), { lifted, areas, site: siteFor(layout, T, k) });
    return { layout, k, inst };
}
const lo = (b, a) => b.position[a] - b.scale[a] / 2;
const hi = (b, a) => b.position[a] + b.scale[a] / 2;
const overlapIn = (A, B, axes) => axes.every((x) => Math.min(hi(A, x), hi(B, x)) - Math.max(lo(A, x), lo(B, x)) > 1e-6);

/** A seeded random home of each kind, from the kinds' own levels. */
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
function randomHome(n, residence) {
    const r = rng(n * 7919 + 17);
    const allowed = residence.kind === 'condo' ? ['main', 'second'] : ['basement', 'main', 'second', 'third', 'attic', 'garage'];
    const levels = allowed.filter((l) => l === 'main' || r() < 0.45);
    const rooms = Array.from({ length: Math.floor(r() * 14) }, (_, i) => ({
        id: `r${n}-${i}`, level: levels[Math.floor(r() * levels.length)], area: AREAS[Math.floor(r() * AREAS.length)], label: ''
    }));
    return home(residence, levels, rooms, `${residence.kind}-${residence.attached}-${n}`);
}
const HOMES = [TOWN_END, TOWN_MID, CONDO].flatMap((res) => Array.from({ length: 60 }, (_, n) => randomHome(n, res)));

describe('the layout (layout.js)', () => {
    test('a townhome is narrower and deeper than a house, a condo wider and shallower', () => {
        const width = (res) => slabsFor(home(res, ['main']))[0].width;
        const depth = (res) => slabsFor(home(res, ['main']))[0].depth;
        expect(width(TOWN_END)).toBeLessThan(width(null));
        expect(depth(TOWN_END)).toBeGreaterThan(depth(null));
        expect(depth(CONDO)).toBeLessThan(depth(null));
        expect([width(null), depth(null)]).toEqual([MODEL.footprint.width, MODEL.footprint.depth]);
        expect(kindOf(home(null, ['main']))).toBe('house');
        expect(kindOf(home({ kind: 'castle' }, ['main']))).toBe('house');
    });

    test('a townhome\'s garage is a story under its main floor, over a basement; a house\'s an annex beside it', () => {
        const stack = (res, levels) => slabsFor(home(res, levels)).map((s) => `${s.level}:${s.kind}`);
        expect(stack(TOWN_END, ['main', 'second', 'garage'])).toEqual(['garage:story', 'main:story', 'second:story']);
        expect(stack(TOWN_END, ['basement', 'main', 'garage'])).toEqual(['basement:story', 'garage:story', 'main:story']);
        expect(stack(null, ['main', 'garage'])).toEqual(['main:story', 'garage:annex']);
        expect(tuckedGarage(home(TOWN_END, ['main', 'garage']))).toBe(true);
        expect(tuckedGarage(home(TOWN_END, ['main']))).toBe(false);
        expect(tuckedGarage(home(null, ['main', 'garage']))).toBe(false);
        // Stacked in order, a step apart, as every story is.
        const ys = slabsFor(home(TOWN_END, ['basement', 'main', 'garage'])).map((s) => s.y);
        expect(ys).toEqual([...ys].sort((a, b) => a - b));
    });

    test('neighbors: an end unit one, on the right; between two, and a condo, one each side; a house none', () => {
        expect(neighborsFor(home(TOWN_END, ['main'])).map((n) => n.side)).toEqual([1]);
        expect(neighborsFor(home(TOWN_MID, ['main'])).map((n) => n.side)).toEqual([-1, 1]);
        expect(neighborsFor(home(CONDO, ['main'])).map((n) => n.side)).toEqual([-1, 1]);
        expect(neighborsFor(home(null, ['main']))).toEqual([]);
        for (const res of [TOWN_MID, CONDO]) {
            const h = home(res, ['main']);
            const unit = slabsFor(h)[0];
            for (const n of neighborsFor(h)) {
                // Against the home's side wall, and set back front and back.
                expect(Math.abs(Math.abs(n.x - unit.x) - (unit.width + n.width) / 2)).toBeLessThan(1e-9);
                expect(n.z + n.depth / 2).toBeLessThan(unit.z + unit.depth / 2 - 0.01);
                expect(n.z - n.depth / 2).toBeGreaterThan(unit.z - unit.depth / 2 + 0.01);
            }
            // In the extent, so the whole group is fitted to the turntable.
            const e = extentOf(layoutHome(h));
            expect(e.maxX - e.minX).toBeGreaterThan(unit.width + 0.1);
        }
    });

    test('a change of kind is a change to the model', () => {
        const h = home(null, ['main']);
        expect(layoutKey(home(TOWN_END, ['main']))).not.toBe(layoutKey(h));
        expect(layoutKey(home(TOWN_MID, ['main']))).not.toBe(layoutKey(home(TOWN_END, ['main'])));
        expect(layoutKey(home(CONDO, ['main']))).not.toBe(layoutKey(h));
    });
});

describe('every form on the turntable', () => {
    test.each([['townhomes', HOMES.slice(0, 120)], ['condos', HOMES.slice(120)]])('%s: everything inside the lawn, however far it turns', (_name, homes) => {
        const R = lawnRadius(T);
        for (const h of homes) {
            const { k, inst } = drawn(h);
            for (const p of [...inst.slabs, ...inst.massing, ...inst.walls]) {
                const corners = [[lo(p, 0), lo(p, 2)], [lo(p, 0), hi(p, 2)], [hi(p, 0), lo(p, 2)], [hi(p, 0), hi(p, 2)]];
                const far = Math.max(...corners.map(([x, z]) => Math.hypot(x, z))) * k;
                expect(`${h.id} ${p.role || p.color}: ${far <= R + 1e-6}`).toBe(`${h.id} ${p.role || p.color}: true`);
            }
        }
    });

    test('the context is a sketch, never a place to tap (no level)', () => {
        for (const h of HOMES.filter((_, i) => i % 10 === 0)) {
            const { inst } = drawn(h);
            expect(inst.massing.length).toBeGreaterThan(0);
            for (const p of inst.massing) expect([p.level, p.color]).toEqual([null, 'massing']);
            expect(inst.gables.filter((x) => x.role === 'neighborRoof')).toEqual([]);
            for (const g of inst.contextRoofs) expect([g.level, g.color, g.role]).toEqual([null, 'massing', 'neighborRoof']);
            // A sketch: every fill's twelve edges, and each gable's ridge
            // and four slopes, in slate, none a place to tap.
            expect(inst.edges).toHaveLength(inst.massing.length * 12 + inst.contextRoofs.length * 5);
            for (const e of inst.edges) expect([e.level, e.color, e.role]).toEqual([null, 'contextEdge', 'edge']);
        }
        expect(drawn(example).inst.massing).toEqual([]);
    });
});

describe('a townhome', () => {
    const tall = home(TOWN_END, ['main', 'second', 'garage'], [...upstairs, garageRoom]);

    test('the walls a neighbor stands against have no windows; the free side has', () => {
        const { inst } = drawn(tall);
        expect(inst.windows.filter((w) => w.side === 'right')).toEqual([]);
        expect(inst.windows.filter((w) => w.side === 'left').length).toBeGreaterThan(0);
        const between = drawn(home(TOWN_MID, ['main', 'second'], upstairs)).inst;
        expect(between.windows.filter((w) => w.side === 'left' || w.side === 'right')).toEqual([]);
    });

    test('its garage door is on the garage story\'s front, beside the stoop, and the drive never meets the stair or the path', () => {
        for (const h of [tall, ...HOMES.slice(0, 120).filter((x) => x.levels.includes('garage'))]) {
            const { inst } = drawn(h);
            const doors = inst.windows.filter((w) => w.role === 'garageDoor');
            expect(`${h.id}: ${doors.map((d) => d.level).join()}`).toBe(`${h.id}: garage`);
            const drive = inst.site.filter((p) => p.role === 'drive');
            const walk = inst.site.filter((p) => ['stoop', 'path', 'landingTop'].includes(p.role));
            for (const d of drive) {
                for (const w of walk) {
                    expect(`${h.id} drive and ${w.role}: ${overlapIn(d, w, [0, 2])}`).toBe(`${h.id} drive and ${w.role}: false`);
                }
            }
        }
    });

    test('its tucked garage is a garage\'s height, under a story of the usual height', () => {
        const { inst } = drawn(tall);
        const wallsOf = (level) => inst.walls.filter((w) => w.role === 'wall' && w.level === level).map((w) => w.scale[1]);
        expect(new Set(wallsOf('garage'))).toEqual(new Set([HOUSE.garageWall]));
        expect(new Set(wallsOf('main'))).toEqual(new Set([HOUSE.wall]));
    });

    test('its stoop comes down toward the street, between railings', () => {
        const { inst } = drawn(tall);
        const steps = inst.site.filter((p) => p.role === 'stoop');
        expect(steps.length).toBeGreaterThan(3);
        // The landing and its steps share a line across, and run forward.
        const xs = new Set(steps.map((p) => p.position[0].toFixed(6)));
        expect(xs.size).toBe(1);
        const zs = steps.map((p) => p.position[2]);
        expect(zs).toEqual([...zs].sort((a, b) => a - b));
        const sloped = inst.site.filter((p) => p.role === 'rail' && p.rotation);
        expect(sloped).toHaveLength(2);
        for (const r of sloped) expect(r.rotation[0]).toBeGreaterThan(0);
    });

    test('over a basement, its garage a story up is reached by a ramp', () => {
        const { inst } = drawn(home(TOWN_END, ['basement', 'main', 'garage'], [garageRoom]));
        const ramp = inst.site.find((p) => p.role === 'drive');
        expect(ramp.rotation[0]).toBeGreaterThan(0.1);
        const { inst: flat } = drawn(tall);
        expect(flat.site.find((p) => p.role === 'drive').rotation).toBeUndefined();
    });

    test('its neighbors\' roofs never lie in the plane of its own', () => {
        const { inst } = drawn(home(TOWN_MID, ['main', 'second'], upstairs));
        const own = inst.gables.find((g) => g.role === 'roof');
        const roofs = inst.contextRoofs;
        expect(roofs).toHaveLength(2);
        for (const n of roofs) {
            // The same pitch on a shallower footprint: a lower ridge, and
            // each slope's plane a clear distance in from the home's.
            expect(own.top - n.top).toBeGreaterThan(0.01);
            const shift = (own.scale[2] - n.scale[2]) / 2;
            const angle = Math.atan(HOUSE.roof.pitch);
            expect(shift * Math.sin(angle)).toBeGreaterThan(0.005);
        }
    });
});

describe('a condo', () => {
    const two = home(CONDO, ['main', 'second'], upstairs);

    test('a story of its building under it, one over it, and no front door, porch, garden or roof of its own', () => {
        const { inst } = drawn(two);
        const roles = inst.massing.map((p) => p.role).sort();
        expect(roles).toEqual(['above', 'cap', 'neighbor', 'neighbor', 'podium']);
        const podium = inst.massing.find((p) => p.role === 'podium');
        const main = inst.slabs.find((s) => s.level === 'main');
        expect(Math.abs(lo(main, 1) - hi(podium, 1))).toBeLessThan(1e-9);
        expect(inst.windows.filter((w) => w.color === 'door')).toEqual([]);
        expect(inst.site.filter((p) => ['stoop', 'porch', 'path', 'bed', 'drive'].includes(p.role))).toEqual([]);
        expect(inst.roofs).toEqual([]);
        expect(inst.firs).toEqual([]);
    });

    test('a paved plaza with planters clear of the building', () => {
        const { inst, layout } = drawn(two);
        expect(inst.lawn.map((p) => [p.color, p.role])).toEqual([['paving', 'plaza']]);
        const planters = inst.site.filter((p) => p.role === 'planter');
        expect(planters.length).toBeGreaterThan(0);
        const building = [...inst.massing, ...inst.slabs];
        for (const p of planters) for (const b of building) expect(overlapIn(p, b, [0, 2])).toBe(false);
        expect(layout.kind).toBe('condo');
        // A building out to a planter's spot leaves that planter out. No
        // real condo reaches one, so a plaza drawn smaller than its
        // turntable brings the planters' ring in over the building.
        const k = fitScale(layout, T, CONFIG.model.scale);
        const site = siteFor(layout, T, k);
        const some = instancesFor(layout, new Map(), { areas: new Map(), site: { ...site, radius: site.radius * 0.5 } });
        const fewer = some.site.filter((p) => p.role === 'planter');
        expect(fewer.length).toBeLessThan(planters.length);
        for (const p of fewer) for (const b of some.massing) expect(overlapIn(p, b, [0, 2])).toBe(false);
    });

    test('a balcony on its lowest story, clear of the siding, gone while that story is open', () => {
        const { inst } = drawn(two);
        const slab = inst.walls.find((w) => w.role === 'balcony');
        expect(slab.level).toBe('main');
        const rails = inst.trims.filter((t) => t.role === 'balconyRail' || t.role === 'balconyPost');
        expect(rails.length).toBeGreaterThan(4);
        const courses = inst.siding.filter((c) => c.role === 'course' && c.side === 'front' && c.level === 'main');
        for (const r of rails) for (const c of courses) expect(overlapIn(r, c, [0, 1, 2])).toBe(false);
        const open = drawn(two, 'main').inst;
        expect(open.walls.filter((w) => w.role === 'balcony')).toEqual([]);
    });

    test('opening a floor lifts the building over it with the floors above', () => {
        const closed = drawn(two).inst.massing.find((p) => p.role === 'above');
        const open = drawn(two, 'main').inst.massing.find((p) => p.role === 'above');
        expect(open.position[1] - closed.position[1]).toBeCloseTo(LIFT.open, 9);
        const podium = (inst) => inst.massing.find((p) => p.role === 'podium').position[1];
        expect(podium(drawn(two, 'main').inst)).toBe(podium(drawn(two).inst));
    });
});

describe('built with the real three.js', () => {
    let REAL;
    beforeAll(async () => {
        REAL = await loadRealThree();
    });
    beforeEach(() => {
        globalThis.THREE = REAL;
    });
    const AT = [0, T.height, 0];

    test.each([
        ['a townhome', home(TOWN_MID, ['basement', 'main', 'second', 'garage'], [...example.rooms, garageRoom])],
        ['a condo', home(CONDO, ['main', 'second'], upstairs)]
    ])('%s: every part fits its mesh, in twenty-one draw calls, and a tap goes through the sketch', (_name, h) => {
        const m = buildModel(CONFIG, AT);
        expect(m.show(h)).toBe(true);
        for (const [kind, mesh] of Object.entries(m.meshes)) {
            expect(`${kind}: ${m.placed[kind].length <= mesh.instanceMatrix.count}`).toBe(`${kind}: true`);
            expect(mesh.count).toBe(m.placed[kind].length);
        }
        let n = 0;
        m.group.traverse((o) => { if (o.isMesh) n++; });
        expect(n).toBe(21);
        expect(m.meshes.massing.count).toBeGreaterThan(0);
        expect(m.meshes.edges.count).toBeGreaterThan(0);
        expect(m.hitOf({ object: m.meshes.massing, instanceId: 0 })).toEqual({ level: null, roomId: null, itemId: null });
        // A faint see-through fill that casts no shadow, solid edges, and a
        // tap through all of it to the house behind.
        for (const kind of ['massing', 'contextRoofs']) {
            const mat = m.meshes[kind].material;
            expect([mat.transparent, mat.opacity, mat.depthWrite]).toEqual([true, CONFIG.model.context.opacity, false]);
        }
        for (const kind of ['massing', 'contextRoofs', 'edges']) {
            expect([m.meshes[kind].castShadow, m.meshes[kind].userData.through]).toEqual([false, true]);
        }
        const wall = { object: m.meshes.walls, instanceId: 0 };
        expect(firstPick([{ object: m.meshes.massing, instanceId: 0 }, { object: m.meshes.edges, instanceId: 0 }, wall])).toEqual({ key: 'model', hit: wall });
    });
});
