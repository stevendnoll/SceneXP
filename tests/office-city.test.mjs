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
    cityTowers, piers, reflectionPoints, noiseField, crests, MOUNTAINS, farCoastZ, mountainHeight, landColor, LAND_COLORS,
    islandHeight, islandShoreZ, islandCenter, islandLandingX, islandTowers, islandLamps, islandBuilt, islandGround, ISLAND_CITY,
    AIRPORT, AIRPORT_COLORS, airportFrame, airportPoint, airportLocal, airportDistance, airportFlat, airportYaw, airportParts, airportGates,
    airportLights, airportY,
    landGrids, stops, SNOW, snowCover, snowFray, snowLineAt, snowColor, landGround, paneNormals, PANE_TILT, PANE_STORE, PANEL, FACADE_TILE, towerStyle, outline, sections, rooftop, aviationLights, facadeUv
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

    test('each pane leans its own little way, all of it within PANE_TILT, so the reflection breaks pane by pane', () => {
        const per = 4;
        const { data, width, height } = paneNormals(per);
        expect([width, height]).toEqual([FACADE_TILE.cols * per, FACADE_TILE.rows * per]);
        expect(paneNormals(per)).toEqual({ data, width, height });
        const decode = (i, j) => [0, 1, 2].map((k) => (data[(j * width + i) * 4 + k] / 255) * 2 - 1);
        const tilts = new Set();
        for (let j = 0; j < height; j += per) {
            for (let i = 0; i < width; i += per) {
                const n = decode(i, j);
                // One lean across the whole pane.
                expect(decode(i + per - 1, j + per - 1)).toEqual(n);
                // Stored PANE_STORE times its true lean, which is within PANE_TILT.
                expect(Math.hypot(n[0], n[1]) / n[2] / PANE_STORE).toBeLessThanOrEqual(PANE_TILT * Math.SQRT2 + 0.003);
                expect(n[2]).toBeGreaterThan(0.98);
                tilts.add(n.join());
            }
        }
        expect(tilts.size).toBeGreaterThan(FACADE_TILE.cols * FACADE_TILE.rows * 0.5);
        expect(PANE_TILT).toBeLessThan(0.05);
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


    test('the reflections are captured from an open street among the towers, and from just over the bay', () => {
        const { city, bay } = reflectionPoints();
        const [x, y, z] = city;
        // In the open: inside no tower or podium, above the street.
        for (const t of towers) {
            const half = Math.max(t.w, t.d, t.podium ? Math.max(t.podium.w, t.podium.d) : 0) / 2;
            expect(Math.abs(x - t.x) > half || Math.abs(z - t.z) > half).toBe(true);
        }
        expect(y).toBeGreaterThan(groundY(x, z) + 50);
        // At the office's own height, so the glass mirrors sky and skyline
        // past its neighbors, not only the dark canyon below.
        expect(Math.abs(y)).toBeLessThan(15);
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

});

// ---- The land across the water (QA, 2026-09-25: "the weakest part of the scene")

describe('the land across the water', () => {
    const grids = landGrids();
    const heights = (g) => Array.from({ length: g.cols * g.rows }, (_, i) => g.positions[i * 3 + 1] - WATER_Y);
    const eye = [0.35, 1.5, 0.9];
    /** The highest angle over the horizon the land reaches, looking along
     *  bearing `a` (degrees from west toward north), from the desk's eye. */
    function skylineAt(a) {
        let best = -90;
        for (const g of [grids.farShore, grids.mountains]) {
            for (let k = 0; k < g.positions.length; k += 3) {
                const dx = g.positions[k] - eye[0];
                const dz = g.positions[k + 2] - eye[2];
                if (Math.abs(Math.atan2(dx, -dz) * 180 / Math.PI - a) > 0.3) continue;
                best = Math.max(best, Math.atan2(g.positions[k + 1] - eye[1], Math.hypot(dx, dz)) * 180 / Math.PI);
            }
        }
        return best;
    }

    test('its raw stuff: a smooth seeded field, the same every visit, and crests between nothing and one', () => {
        const f = noiseField(7);
        const g = noiseField(7);
        let lo = 0;
        let hi = 0;
        for (let i = 0; i < 2000; i++) {
            const x = i * 0.137;
            const z = i * 0.071;
            expect(f(x, z)).toBe(g(x, z));
            lo = Math.min(lo, f(x, z));
            hi = Math.max(hi, f(x, z));
            const c = crests(f, x, z);
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1);
        }
        expect(lo).toBeGreaterThanOrEqual(-1);
        expect(hi).toBeLessThanOrEqual(1);
        expect(hi - lo).toBeGreaterThan(1);
        // Smooth: a step of a hundredth moves it a little, never a jump.
        expect(Math.abs(f(3.2, 4.1) - f(3.21, 4.1))).toBeLessThan(0.05);
        expect(noiseField(8)(1.5, 2.5)).not.toBe(f(1.5, 2.5));
        expect(stops(0, 10, 3)).toEqual([0, 2.5, 5, 7.5, 10]);
    });

    test('the land rises from the far shore: nothing short of it, low wooded foothills, the ranges behind', () => {
        for (const x of [-30000, 0, 25000]) {
            expect(mountainHeight(x, farCoastZ(x) + 100)).toBeLessThan(0);
            expect(isLand(x, farCoastZ(x) - 50)).toBe(true);
        }
        const foot = heights(grids.farShore);
        // Low: about a degree over the water from the office, never snowy.
        expect(Math.max(...foot)).toBeLessThan(650);
        // Its first row, on the shore line, a little under the water, so
        // the land meets the water with no gap along it.
        const shore = foot.slice(0, grids.farShore.cols);
        for (const h of shore) expect(h).toBe(-8);
        expect(Math.min(...foot.slice(grids.farShore.cols))).toBeGreaterThanOrEqual(0);
        const ranges = heights(grids.mountains);
        // The high range stands near 4,000 m: 1.5 times the old range's
        // 2,650 m tallest (Steve's choice, 2026-09-25).
        expect(Math.max(...ranges)).toBeGreaterThan(3400);
        expect(Math.max(...ranges)).toBeLessThan(4400);
        // The foothills' back row is the ranges' front row: no crack.
        const seam = grids.farShore.positions.slice((grids.farShore.rows - 1) * grids.farShore.cols * 3);
        expect(Array.from(seam)).toEqual(Array.from(grids.mountains.positions.slice(0, seam.length)));
    });

    test('a skyline, not a wall: massifs and saddles along the range, peaks well over the water', () => {
        const line = [];
        for (let a = -38; a <= 38; a += 2) line.push(skylineAt(a));
        const top = Math.max(...line);
        const low = Math.min(...line);
        // Its tallest a good way up the sky, as Steve asked; its saddles low.
        expect(top).toBeGreaterThan(5);
        expect(top).toBeLessThan(7.5);
        expect(top - low).toBeGreaterThan(2);
        // Up and down along its length, not one long rise.
        let turns = 0;
        for (let i = 1; i < line.length - 1; i++) if ((line[i] - line[i - 1]) * (line[i + 1] - line[i]) < 0) turns++;
        expect(turns).toBeGreaterThan(5);
    });

    test('snow on the heights and never where it is sheer, forest below, cliff where it is steep, the far ranges bluer', () => {
        const lum = (hex) => ((hex >> 16) & 255) + ((hex >> 8) & 255) + (hex & 255);
        const green = (hex) => ((hex >> 8) & 255) - ((hex >> 16) & 255);
        const x = 1000;
        const z = -32000;
        // Gentle ground (steep 0.05, under about 18 degrees) holds snow; the
        // snow starts to slide off from about 28 degrees (steep 0.12) on.
        expect(landColor(3900, 0.05, x, z, 30000)).toBeGreaterThan(0);
        expect(lum(landColor(3900, 0.05, x, z, 30000))).toBeGreaterThan(lum(LAND_COLORS.snow) * 0.8);
        expect(lum(landColor(3900, 0.95, x, z, 30000))).toBeLessThan(lum(LAND_COLORS.rock) * 1.2);
        expect(green(landColor(400, 0.1, x, z, 20000))).toBeGreaterThan(0);
        expect(lum(landColor(1900, 0.9, x, z, 20000))).toBeLessThan(lum(landColor(1900, 0.1, x, z, 20000)));
        const near = landColor(2000, 0.3, x, z, 15000);
        const far = landColor(2000, 0.3, x, z, 45000);
        expect(far & 255).toBeGreaterThan(near & 255);
        // Over the whole range some of it is snow, most of it not.
        let snowy = 0;
        let all = 0;
        const g = grids.mountains;
        for (let k = 0; k < g.positions.length; k += 3 * 7) {
            const h = g.positions[k + 1] - WATER_Y;
            all++;
            if (lum(landColor(h, 0.05, g.positions[k], g.positions[k + 2], 30000)) > lum(LAND_COLORS.snow) * 0.8) snowy++;
        }
        expect(snowy / all).toBeGreaterThan(0.05);
        expect(snowy / all).toBeLessThan(0.5);
    });

    test('the grid is fine enough for a summit, and the crests no finer than it can draw (QA, 2026-09-25)', () => {
        // A cell of the high range, 35 km off, under a quarter of a degree:
        // at 300 by 420 m it was half a degree, 8 px, and every top a
        // handful of flat triangles.
        const cell = Math.max(MOUNTAINS.step, MOUNTAINS.bands.mountains.row);
        expect(Math.atan(cell / 35000) * 180 / Math.PI).toBeLessThan(0.36);
        // The finest octave of the crests at least two cells long, or it
        // only jitters the points (the fifth, at 306 m, did).
        const finest = 5200 / 2.03 ** (MOUNTAINS.octaves - 1);
        expect(finest).toBeGreaterThanOrEqual(2 * cell);
        // Still a range the phone can hold: under 100k points in all.
        const points = Object.values(grids).reduce((sum, g) => sum + g.cols * g.rows, 0);
        expect(points).toBeLessThan(100000);
    });

    test('the snow: a soft, ragged edge, holding on steeper ground near the tops, and bluer far off', () => {
        const line = 2400;
        // Soft (QA, 2026-09-26: "a little too sharp and jagged"): a range
        // 35 km off is about 40 m a pixel, and an edge thinner than a few
        // pixels stair-steps in a shader. From bare to covered over at least
        // 200 m of height, and on gentle ground no more than 300.
        expect(snowCover(line - SNOW.soft, 0.05, line)).toBe(0);
        expect(snowCover(line + SNOW.soft, 0.05, line)).toBe(1);
        expect(2 * SNOW.soft).toBeGreaterThanOrEqual(200);
        expect(2 * SNOW.soft).toBeLessThanOrEqual(300);
        const halfway = snowCover(line, 0.05, line);
        expect(halfway).toBeGreaterThan(0.3);
        expect(halfway).toBeLessThan(0.7);
        // And over a wide range of steepness, not at one angle: at the line
        // a slope halfway through the range holds about half.
        const mid = (SNOW.holds[0] + SNOW.holds[1]) / 2;
        expect(SNOW.holds[1] - SNOW.holds[0]).toBeGreaterThan(0.18);
        expect(snowCover(line + SNOW.soft, mid, line)).toBeCloseTo(0.5, 1);
        // A light veil over the rock near the tops, so the snowfields fade
        // into the faces: on a 57 degree face (steep 0.45, too steep for the
        // snowfields) well above the line, never more than the veil's share...
        const face = 0.45;
        expect(snowCover(line + 400, face, line)).toBeGreaterThan(0);
        expect(snowCover(line + 400, face, line)).toBeLessThanOrEqual(SNOW.dust.share);
        // ...and none of it below the line.
        expect(snowCover(line - 20, face, line)).toBe(0);
        // Ragged: the finest grain moves the edge, and changes within a grid
        // cell (it is drawn per pixel, so the grid does not hold it back).
        let lo = 0;
        let hi = 0;
        let changes = 0;
        for (let i = 0; i < 400; i++) {
            const f = snowFray(i * 37.1, -30000 + i * 11.3);
            lo = Math.min(lo, f);
            hi = Math.max(hi, f);
            if (Math.abs(f - snowFray(i * 37.1 + 75, -30000 + i * 11.3)) > 0.2) changes++;
        }
        expect(lo).toBeGreaterThanOrEqual(-1);
        expect(hi).toBeLessThanOrEqual(1);
        expect(hi - lo).toBeGreaterThan(1);
        expect(changes).toBeGreaterThan(100);
        // Near the snow line a 44 degree face (steep 0.28) sheds most of its
        // snow; a kilometer up it holds it, as ice and snow cling near the
        // tops.
        expect(snowCover(line + 60, 0.28, line)).toBeLessThan(0.2);
        expect(snowCover(line + 1100, 0.28, line)).toBeGreaterThan(0.9);
        // Sheer rock holds none, however high.
        expect(snowCover(line + 1500, 0.6, line)).toBe(0);
        // Where there is no snow the color is the ground's; the far snow bluer.
        expect(landColor(900, 0.1, 1000, -30000, 20000)).toBe(landGround(900, 0.1, 1000, -30000, 20000));
        expect(snowColor(45000) & 255).toBeLessThan(snowColor(10000) & 255);
        expect(snowColor(10000)).toBe(LAND_COLORS.snow);
        expect(snowLineAt(1000, -30000)).toBeGreaterThan(MOUNTAINS.snow - 600);
        expect(snowLineAt(1000, -30000)).toBeLessThan(MOUNTAINS.snow + 600);
    });

    test('the island rolls, wooded, under the office’s eye, down to the water at its shore', () => {
        const h = heights(grids.island);
        expect(Math.max(...h)).toBeGreaterThan(100);
        expect(Math.max(...h)).toBeLessThan(floorAboveWater);
        expect(islandHeight(0, -5000)).toBeLessThan(0);
        const [[x0, z0]] = FAR_LAND.island;
        expect(islandHeight(x0, z0)).toBeLessThan(1);
        // Every point above the water is on the island.
        const g = grids.island;
        for (let k = 0; k < g.positions.length; k += 3) {
            if (g.positions[k + 1] > WATER_Y) expect(isLand(g.positions[k], g.positions[k + 2])).toBe(true);
        }
        // In order across the bay: the island, then the far shore.
        expect(Math.max(...FAR_LAND.island.map(([, z]) => z))).toBeLessThan(shoreZ(0));
        expect(Math.min(...FAR_LAND.island.map(([, z]) => z))).toBeGreaterThan(farCoastZ(0));
        expect(MOUNTAINS.bands.farShore.to).toBe(MOUNTAINS.bands.mountains.from);
    });
});

describe('the city across the bay (QA, 2026-09-26)', () => {
    const island = islandTowers();
    const back = (t) => islandShoreZ(t.x) - t.z;
    const mean = (list) => list.reduce((sum, t) => sum + t.h, 0) / list.length;

    test('the same skyline every visit, and a city of it: a thousand buildings or so', () => {
        expect(islandTowers()).toEqual(island);
        expect(island.length).toBeGreaterThan(800);
        expect(island.length).toBeLessThan(1800);
        expect(island.every((t) => t.island === true)).toBe(true);
        expect(towers.some((t) => t.island)).toBe(false);
    });

    test('every building stands wholly on the island, along the shore that faces the office, on its own ground', () => {
        for (const t of island) {
            for (const [x, z] of outline({ ...t, tiers: [] })) expect(inPolygon(x, z, FAR_LAND.island)).toBe(true);
            expect(back(t)).toBeGreaterThan(ISLAND_CITY.beach);
            expect(back(t)).toBeLessThan(ISLAND_CITY.inland + ISLAND_CITY.block);
            // On the lowest of its corners, so none floats on the slope.
            expect(t.base).toBeGreaterThanOrEqual(0);
            expect(t.base).toBeLessThanOrEqual(islandHeight(t.x, t.z));
            expect(['box', 'chamfer', 'round']).toContain(t.form);
        }
        // The waterfront row is built (the ground there is under a meter,
        // and a rule asking for more once left the shore bare).
        expect(island.filter((t) => back(t) < 100).length).toBeGreaterThan(60);
    });

    test('the ferry berths at an open plaza, straight out from the office’s dock', () => {
        const landing = islandLandingX();
        expect(landing).toBe(piers().find((p) => p.ferry).x);
        for (const t of island) {
            if (back(t) < 260) expect(Math.abs(t.x - landing)).toBeGreaterThanOrEqual(ISLAND_CITY.landing);
        }
    });

    test('a skyline with a profile, not a picket fence: towers gathered in the centers, landmarks over them', () => {
        // The main center stands in the opening the office's street gives
        // every screen (x 0 to about 3,900, measured 2026-09-26).
        const main = ISLAND_CITY.centers[0];
        expect(main.x).toBeGreaterThan(0);
        expect(main.x).toBeLessThan(3900);
        // Along the water, where the skyline stands, the opening's buildings
        // average twice the height of those between the centers.
        const front = (t) => back(t) < 300;
        const opening = island.filter((t) => front(t) && t.x > 0 && t.x < 3900);
        const between = island.filter((t) => front(t) && t.x > -3500 && t.x < -1000);
        expect(mean(opening)).toBeGreaterThan(2 * mean(between));
        // Low where the centers are not: a waterfront of mid-rises.
        for (const t of island) if (islandCenter(t.x) < 0.1) expect(t.h).toBeLessThan(60);
        // Every landmark is built, and the tallest of them tops the rest.
        for (const l of ISLAND_CITY.landmarks) {
            expect(island.some((t) => t.h === l.h && Math.abs(t.x - l.x) < 50 && Math.abs(back(t) - l.d) < 50)).toBe(true);
        }
        const tallest = island.reduce((a, t) => (t.h > a.h ? t : a));
        expect(tallest.h).toBe(Math.max(...ISLAND_CITY.landmarks.map((l) => l.h)));
        expect(tallest.x).toBeGreaterThan(0);
        expect(tallest.x).toBeLessThan(3900);
        // A skyline from 12 km: dozens of towers over 100 m, a few over 150.
        expect(island.filter((t) => t.h > 100).length).toBeGreaterThan(40);
        expect(island.filter((t) => t.h > 150).length).toBeGreaterThan(8);
    });

    test('by night its streets are strung with lamps, along the promenade and up the hill', () => {
        const lamps = islandLamps();
        expect(lamps.length).toBeGreaterThan(1000);
        expect(lamps.length).toBeLessThan(4000);
        for (const [x, y, z] of lamps) {
            expect(inPolygon(x, z, FAR_LAND.island)).toBe(true);
            expect(y - WATER_Y).toBeCloseTo(islandHeight(x, z) + 6, 3);
            expect(islandShoreZ(x) - z).toBeLessThanOrEqual(ISLAND_CITY.inland);
        }
        // The promenade runs along the water, in front of the first row
        // (short of the airport, which has its own lights).
        expect(lamps.filter(([x, , z]) => islandShoreZ(x) - z < ISLAND_CITY.beach).length).toBeGreaterThan(100);
    });

    test('its hillside is grayer where it is built, and the rest of the island stays forest', () => {
        const x = 1900;
        const forest = LAND_COLORS.forest;
        expect(islandBuilt(x, islandShoreZ(x) - 400)).toBe(1);
        expect(islandBuilt(x, islandShoreZ(x) - 2000)).toBe(0);
        expect(islandBuilt(x, islandShoreZ(x) + 10)).toBe(0);
        expect(islandGround(forest, x, islandShoreZ(x) - 2000)).toBe(forest);
        const built = islandGround(forest, x, islandShoreZ(x) - 400);
        expect(built).not.toBe(forest);
        // Still a green gray, never white or brown: the hills stay hills.
        expect((built >> 8) & 255).toBeGreaterThan((built >> 16) & 255);
    });
});

describe('the airport across the bay (QA, 2026-09-28)', () => {
    const { origin, along, across } = airportFrame();
    const corners = (p) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => airportPoint(p.a + (i * p.len) / 2, p.b + (j * p.wid) / 2));

    test('its runway runs the way the jets land: west and south, away from the office and to the visitor’s left', () => {
        expect(Math.hypot(...along)).toBeCloseTo(1, 12);
        expect(along[0] * across[0] + along[1] * across[1]).toBeCloseTo(0, 12);
        // West (-z, away from the office) mostly, and south (-x) some: its
        // approach comes from over downtown (QA, 2026-09-29).
        expect(along[1]).toBeLessThan(-0.8);
        expect(along[0]).toBeLessThan(0);
        // Across is the landing jet's left: south, and toward the office's
        // side, where the terminal stands low.
        expect(across[0]).toBeLessThan(0);
        expect(across[1]).toBeGreaterThan(0);
        // The runway's line runs back past the office within 3.5 km, to its
        // north: that is how the jet comes close.
        const { a, b } = airportLocal(0, 0);
        expect(a).toBeLessThan(0);
        expect(Math.abs(b) / Math.hypot(a, b)).toBeLessThan(0.25);
        const back = airportLocal(...airportPoint(1234, 567));
        expect(back.a).toBeCloseTo(1234, 9);
        expect(back.b).toBeCloseTo(567, 9);
        // A jet built facing -z, turned by airportYaw, faces along.
        const yaw = airportYaw(1, 0);
        expect(-Math.sin(yaw)).toBeCloseTo(along[0], 12);
        expect(-Math.cos(yaw)).toBeCloseTo(along[1], 12);
    });

    test('where the desk and the window see it: touchdown just left of the tower that hides the island, the rollout in the desk’s stretch', () => {
        // Measured 2026-09-28: the desk sees the island from x -6,250 to
        // -4,000 on a laptop, and a tower hides it from there to x 0.
        expect(origin[0]).toBeLessThan(-4000);
        expect(origin[0]).toBeGreaterThan(-4600);
        const [rollX] = airportPoint(1300, 0);
        expect(rollX).toBeGreaterThan(-6250);
        for (const g of airportGates()) expect(g.x).toBeGreaterThan(-6250);
    });

    test('everything it is built of stands on the island, on level ground at its elevation', () => {
        for (const p of airportParts()) {
            for (const [x, z] of corners(p)) {
                expect(inPolygon(x, z, FAR_LAND.island)).toBe(true);
                expect(islandHeight(x, z)).toBeCloseTo(AIRPORT.elevation, 6);
            }
        }
        // Level before the runway on the office's side, over which the view
        // of the runway skims, so no hill nor building stands in the way.
        const [x, z] = airportPoint(0, 300);
        expect(airportFlat(x, z)).toBe(1);
        // And back to the island's own hills well away from it.
        expect(airportFlat(0, islandShoreZ(0) - 800)).toBe(0);
        const kinds = new Set(airportParts().map((p) => p.kind));
        for (const k of ['field', 'runway', 'taxiway', 'apron', 'terminal', 'tower', 'hangar']) expect(kinds.has(k)).toBe(true);
        // A control tower that stands out: the tallest thing there.
        const tops = airportParts().map((p) => ({ kind: p.kind, top: p.y + p.h }));
        const tallest = tops.reduce((m, t) => (t.top > m.top ? t : m));
        expect(tallest.kind).toBe('tower');
        expect(tallest.top).toBeGreaterThan(90);
    });

    test('its ground reads as airfield, and the island city keeps off it', () => {
        for (const t of islandTowers()) {
            expect(airportFlat(t.x, t.z)).toBe(0);
            expect(airportDistance(t.x, t.z)).toBeGreaterThan(ISLAND_CITY.airportClear);
        }
        for (const [x, , z] of islandLamps()) expect(airportFlat(x, z)).toBe(0);
        const [x, z] = airportPoint(1500, 300);
        expect(islandGround(LAND_COLORS.forest, x, z)).toBe(AIRPORT_COLORS.field);
        expect(islandBuilt(x, z)).toBe(0);
    });

    test('gates along the apron, noses to the terminal, one kept free for the jet coming in', () => {
        const gates = airportGates();
        expect(gates).toHaveLength(AIRPORT.gates.a.length);
        expect(gates.filter((g) => g.free)).toEqual([gates[AIRPORT.arrivalGate]]);
        for (const g of gates) {
            expect(-Math.sin(g.yaw)).toBeCloseTo(across[0], 12);
            expect(-Math.cos(g.yaw)).toBeCloseTo(across[1], 12);
            const { b } = airportLocal(g.x, g.z);
            expect(b).toBeGreaterThan(AIRPORT.apron.b[0]);
            expect(b).toBeLessThan(AIRPORT.apron.b[1]);
        }
        for (let i = 1; i < gates.length; i++) expect(Math.hypot(gates[i].x - gates[i - 1].x, gates[i].z - gates[i - 1].z)).toBeGreaterThan(200);
    });

    test('by night: runway edges, green threshold, red end, blue taxiway, approach lights over the water, and the flashers running in', () => {
        const { positions, colors, rabbit } = airportLights();
        expect(positions).toHaveLength(colors.length);
        const green = colors.filter(([r, g]) => g > 0.8 && r < 0.5).length;
        const red = colors.filter(([r, g]) => r > 0.8 && g < 0.3).length;
        const blue = colors.filter(([r, , b]) => b > 0.8 && r < 0.5).length;
        expect(green).toBeGreaterThanOrEqual(10);
        expect(red).toBeGreaterThanOrEqual(11);
        expect(blue).toBeGreaterThan(40);
        for (const [x, y, z] of positions) {
            expect(y).toBeGreaterThan(airportY(0));
            expect(Number.isFinite(x + z)).toBe(true);
        }
        // The approach reaches out over the water before the runway.
        expect(positions.some(([x, , z]) => isWater(x, z))).toBe(true);
        // The flashers, from farthest out toward the runway.
        const [tx, tz] = airportPoint(AIRPORT.runway.from, 0);
        const d = rabbit.map(([x, , z]) => Math.hypot(x - tx, z - tz));
        for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]);
        expect(rabbit.length).toBeGreaterThan(20);
    });
});
