// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's city (city.js), pure: the land falling to the bay, where
 * every tower stands and how big, their forms, and the rules that give the
 * view its scale (Steve, 2026-09-24: "the sheer size and scale of the city,
 * and the user being on the 40th floor, is what should add the gravitas").
 * The frame is the room's: west is -z, north is +x.
 */
import {
    CITY, WATER_Y, shoreZ, elevation, groundY, FAR_LAND, inPolygon, isLand, isWater, seeded, blockAt, districtOf,
    cityTowers, piers, olympics, farHills, reflectionPoints, PANEL, FACADE_TILE, towerStyle, outline, sections, rooftop, aviationLights, facadeUv
} from '../www/office/js/city.js';

const towers = cityTowers();
const floorAboveWater = CITY.altitude + CITY.hill;

describe('the land and the water', () => {
    test('downtown stands on a hill that falls west to the waterfront, then under the bay', () => {
        expect(elevation(0, 0)).toBeCloseTo(CITY.hill, 0);
        expect(elevation(0, shoreZ(0) + 1)).toBeLessThan(5);
        expect(elevation(0, shoreZ(0) - 1)).toBeLessThan(0);
        expect(isLand(0, 0)).toBe(true);
        expect(isWater(0, shoreZ(0) - 50)).toBe(true);
        expect(groundY(0, 0)).toBeCloseTo(-CITY.altitude, 0);
        expect(WATER_Y).toBe(-floorAboveWater);
        // Falling all the way: never uphill toward the water.
        let last = Infinity;
        for (let z = 0; z > shoreZ(0); z -= 20) {
            const e = elevation(0, z);
            expect(e).toBeLessThanOrEqual(last + 1e-9);
            last = e;
        }
    });

    test('the shore bends west to the north, and stops short of the island', () => {
        expect(shoreZ(2000)).toBeLessThan(shoreZ(0));
        expect(shoreZ(100000)).toBe(shoreZ(3000 + CITY.shore.bendFrom));
        expect(isLand(0, -13800)).toBe(true);
        expect(isWater(0, -8000)).toBe(true);
        expect(isLand(0, -40000)).toBe(true);
        expect(Object.keys(FAR_LAND)).toEqual(['island', 'farShore']);
        expect(inPolygon(0, 0, [[-1, -1], [1, -1], [1, 1], [-1, 1]])).toBe(true);
    });

    test('the random source is seeded and in range', () => {
        const a = seeded(7);
        const b = seeded(7);
        const xs = Array.from({ length: 50 }, () => a());
        expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
        expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
        expect(seeded(0)()).toBeGreaterThanOrEqual(0);
    });
});

describe('the grid and its districts', () => {
    test('the office’s own block is block (0, 0), and its corner is the room’s', () => {
        const home = blockAt(0, 0);
        expect([home.x1, home.z0]).toEqual([CITY.ownTower.x1, CITY.ownTower.z0]);
        expect(blockAt(1, 0).x0 - home.x1).toBe(CITY.street);
        expect(home.z0 - blockAt(0, -1).z1).toBe(CITY.street);
    });

    test('the core is tall, the waterfront low', () => {
        expect(districtOf(blockAt(2, -3)).district).toBe('core');
        expect(districtOf(blockAt(0, -6)).district).toBe('waterfront');
        expect(districtOf(blockAt(0, -6)).hi).toBeLessThan(60);
        expect(districtOf(blockAt(2, -3)).hi).toBeGreaterThan(floorAboveWater);
    });
});

describe('the towers', () => {
    test('the same city every visit', () => {
        expect(cityTowers()).toEqual(towers);
        expect(towers.length).toBeGreaterThan(200);
    });

    test('every building stands wholly on land, none on the office’s block, none behind the office', () => {
        const home = blockAt(0, 0);
        for (const t of towers) {
            for (const [x, z] of outline(t)) expect(z).toBeGreaterThan(shoreZ(x));
            const inHome = t.x > home.x0 && t.x < home.x1 && t.z > home.z0 && t.z < home.z1;
            expect(inHome).toBe(false);
            expect(t.z).toBeLessThan(400 + CITY.block);
            expect(t.x).toBeGreaterThan(-600 - CITY.block);
            expect(t.base).toBeCloseTo(elevation(t.x, t.z), -1);
        }
    });

    test('the towers are true to life: big footprints, and dozens rise above the office', () => {
        const tall = towers.filter((t) => !t.low);
        const wide = tall.filter((t) => t.w >= 44).length;
        expect(wide / tall.length).toBeGreaterThan(0.5);
        const above = towers.filter((t) => t.base + t.h > floorAboveWater);
        expect(above.length).toBeGreaterThanOrEqual(30);
        expect(Math.max(...towers.map((t) => t.h))).toBeGreaterThan(250);
        // Some are giants near the office, towering over it.
        expect(towers.some((t) => Math.hypot(t.x, t.z) < 450 && t.base + t.h > floorAboveWater + 60)).toBe(true);
    });

    test('the foreground is low: the blocks across the street west are looked DOWN onto', () => {
        for (const k of [-1, 0, 1, 2]) {
            const b = blockAt(k, -1);
            const here = towers.filter((t) => t.x > b.x0 && t.x < b.x1 && t.z > b.z0 && t.z < b.z1);
            expect(here.length).toBeGreaterThan(0);
            for (const t of here) {
                expect(t.low).toBe(true);
                expect(t.base + t.h).toBeLessThan(floorAboveWater - 100);
            }
        }
    });

    test('some blocks stay open, and the waterfront is low', () => {
        expect(towers.filter((t) => t.low).length).toBeGreaterThan(20);
        const front = towers.filter((t) => t.z - shoreZ(t.x) < 200 && !t.low);
        expect(front.length).toBeGreaterThan(0);
        for (const t of front) expect(t.h).toBeLessThanOrEqual(40);
    });
});

describe('forms', () => {
    const box = { x: 0, z: 0, w: 40, d: 30, h: 200, form: 'box', tiers: [{ from: 120, inset: 5 }], tone: 0.2, low: false };

    test('every outline runs counterclockwise from above, the way the walls expect', () => {
        const area = (pts) => pts.reduce((a, [x, z], i) => {
            const [nx, nz] = pts[(i + 1) % pts.length];
            return a + (x * nz - nx * z);
        }, 0) / 2;
        for (const form of ['box', 'chamfer', 'round']) {
            const pts = outline({ ...box, form });
            expect(area(pts)).toBeGreaterThan(0);
        }
        expect(outline({ ...box, form: 'chamfer' })).toHaveLength(8);
        expect(outline({ ...box, form: 'round' })).toHaveLength(20);
    });

    test('a setback steps the tower in, section by section', () => {
        const low = outline(box, 0);
        const high = outline(box, 150);
        expect(high[1][0] - high[0][0]).toBeCloseTo(low[1][0] - low[0][0] - 10, 9);
        expect(sections(box)).toEqual([{ y0: 0, y1: 120, at: 0 }, { y0: 120, y1: 200, at: 120 }]);
        expect(sections({ ...box, tiers: [] })).toEqual([{ y0: 0, y1: 200, at: 0 }]);
    });

    test('every tower wears one of three facades, and low buildings the ribbons', () => {
        expect(new Set(towers.map(towerStyle))).toEqual(new Set(['grid', 'bands', 'fins']));
        expect(towerStyle({ low: true, h: 20, tone: 0.9 })).toBe('bands');
    });

    test('roofs: a penthouse on every one, helipads on some tall ones, spires on the tallest', () => {
        for (const t of towers) {
            const top = rooftop(t);
            expect(top.find((b) => b.kind === 'penthouse').y).toBe(t.h);
            expect(top.some((b) => b.kind === 'spire')).toBe(t.h > 260);
        }
    });

    test('the aviation lights sit at the very tops of the tall towers, measured from the water', () => {
        const lights = aviationLights(towers);
        expect(lights.length).toBeGreaterThan(10);
        const tallest = towers.reduce((a, b) => (b.base + b.h > a.base + a.h ? b : a));
        const top = Math.max(...lights.map(([, y]) => y));
        expect(top).toBeGreaterThan(tallest.base + tallest.h);
    });

    test('a facade tile spans its panels in meters', () => {
        expect(facadeUv(PANEL.width * FACADE_TILE.cols, PANEL.width, FACADE_TILE.cols)).toBe(1);
        expect(facadeUv(38, 3.8, 4)).toBeCloseTo(2.5, 9);
    });
});

describe('the waterfront and the far things', () => {
    test('the piers reach into the bay, the ferry dock at the foot of the office’s street', () => {
        const all = piers();
        const ferry = all.filter((p) => p.ferry);
        expect(ferry).toHaveLength(1);
        expect(ferry[0].x).toBeGreaterThan(CITY.ownTower.x1);
        expect(ferry[0].x).toBeLessThan(CITY.ownTower.x1 + CITY.street);
        for (const p of all) expect(isWater(p.x, p.z - p.length / 2)).toBe(true);
    });

    test('the mountains stand across the bay on the far shore, with snow on their tops', () => {
        const o = olympics();
        expect(isLand(0, o.z)).toBe(true);
        expect(o.peaks.some(([, h]) => h > o.snow)).toBe(true);
        expect(o.peaks.some(([, h]) => h < o.snow)).toBe(true);
    });

    test('the reflections are captured from an open street among the towers, and from just over the bay', () => {
        const { city, bay } = reflectionPoints();
        const [x, y, z] = city;
        // In the open: inside no tower or podium, above the street.
        for (const t of towers) {
            const half = Math.max(t.w, t.d, t.podium ? Math.max(t.podium.w, t.podium.d) : 0) / 2;
            expect(Math.abs(x - t.x) > half || Math.abs(z - t.z) > half).toBe(true);
        }
        expect(y).toBeGreaterThan(groundY(x, z) + 50);
        expect(isLand(x, z)).toBe(true);
        // Among towers: several taller ones close by, whose glass it sees.
        const around = towers.filter((t) => Math.hypot(t.x - x, t.z - z) < 300 && WATER_Y + t.base + t.h > y);
        expect(around.length).toBeGreaterThanOrEqual(4);
        // Over open water, low, off the office's own street.
        expect(isWater(bay[0], bay[2])).toBe(true);
        expect(bay[1] - WATER_Y).toBeGreaterThan(5);
        expect(bay[1] - WATER_Y).toBeLessThan(60);
        expect(bay[0]).toBe(x);
    });

    test('low wooded hills stand across the water, wholly on their own land, below the eye and the mountains', () => {
        const hills = farHills();
        expect(Object.keys(hills)).toEqual(['island', 'farShore']);
        expect(farHills()).toEqual(hills);
        const tallestMountain = Math.max(...olympics().peaks.map(([, h]) => h));
        for (const ridge of Object.values(hills)) {
            const xs = ridge.peaks.map(([x]) => x);
            const near = ridge.z + ridge.depth / 2;
            const far = ridge.z - ridge.depth / 2;
            for (const x of xs) {
                expect(isLand(x, near)).toBe(true);
                expect(isLand(x, far)).toBe(true);
            }
            // They taper to the water at both ends, no cliff at the tips.
            expect(ridge.peaks[0][1]).toBe(0);
            expect(ridge.peaks.at(-1)[1]).toBe(0);
            // Low: a band under the horizon, never in front of the mountains' snow.
            const top = Math.max(...ridge.peaks.map(([, h]) => h));
            expect(top).toBeGreaterThan(50);
            expect(top).toBeLessThan(floorAboveWater);
            expect(top).toBeLessThan(tallestMountain / 10);
            expect(ridge.snow).toBe(Infinity);
        }
        // In order across the bay: the island, then the far shore, then the mountains.
        expect(hills.island.z).toBeGreaterThan(hills.farShore.z);
        expect(hills.farShore.z - hills.farShore.depth / 2).toBeGreaterThan(olympics().z + olympics().depth / 2);
    });
});
