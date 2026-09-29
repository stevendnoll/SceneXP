// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * city.js - The city outside the office: where the land and the water are,
 * where every tower stands, how big it is and what shape.
 *
 * THE SCALE IS THE POINT (Steve, 2026-09-24): "the sheer size and scale of
 * the city, and the user being on the 40th floor, is what should add the
 * gravitas." So the towers are true to life and close: a Seattle-sized
 * downtown grid (76 m blocks, 22 m streets), towers that nearly fill their
 * blocks, and the ones across the street and down the hill standing 170 to
 * 300 m tall, most of them taller than the office floor. The bay is a sliver
 * seen between them, and the mountains across it are the far edge of the
 * view. Less is more: no port, no stadiums, no volcano, no south at all.
 *
 * SEATTLE-INSPIRED, NOT SEATTLE. A glass downtown on a hill above a bay to
 * the west, an island beyond whose waterfront is built up as more of the
 * city (islandTowers), and snowy mountains behind. No real building is
 * anybody's in particular.
 *
 * THE FRAME IS THE ROOM'S. The office is the northwest corner of its floor:
 * the back window (-z) faces WEST, down the hill to the water, and the side
 * window (+x) faces NORTH, along downtown. So west is -z, north is +x, east
 * is +z, south is -x. Meters, with y = 0 the office's floor, its own street
 * `altitude` below that, and the water `hill` lower again, because downtown
 * stands on a hill that falls to the waterfront.
 *
 * Pure and seeded: the same city on every visit, testable under Node.
 */

export const CITY = {
    /** The office floor above its own street: about the 40th floor. */
    altitude: 150,
    /** The office's street above the water. The land falls to the shore. */
    hill: 45,
    block: 76,
    street: 22,
    /** How far the built city reaches from the office. */
    radius: 2600,
    /** The office's own tower. Its northwest corner is the room's corner. */
    ownTower: { x0: -73, x1: 3, z0: -2.5, z1: 73.5 },
    /** The waterfront: where the land meets the water, at a point along the
     *  shore (x). It runs north and south, bending west to the north. */
    shore: { z: -640, bend: 0.28, bendFrom: 250 },
    seed: 20260924
};

/** The water, in the room's frame: `altitude` plus `hill` below the floor. */
export const WATER_Y = -(CITY.altitude + CITY.hill);

/** Where the waterfront is, as a z, at a point x along the shore. */
export function shoreZ(x, city = CITY) {
    // The bend stops after three kilometers, so the shore never reaches the
    // island across the bay.
    return city.shore.z - city.shore.bend * Math.min(3000, Math.max(0, x - city.shore.bendFrom));
}

const smooth = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * The ground's height above the water at a point: the full hill in
 * downtown, falling over the last few hundred meters to the waterfront, and
 * below the water past the shore (so the shoreline is simply where the
 * ground goes under).
 */
export function elevation(x, z, city = CITY) {
    const s = shoreZ(x, city);
    if (z < s) return -6;
    return 2 + (city.hill - 2) * smooth((z - s) / 560);
}

/** The ground's y in the room's frame. */
export function groundY(x, z, city = CITY) {
    return WATER_Y + elevation(x, z, city);
}

/** The far lands across the bay: an island, and the far shore under the
 *  mountains. Polygons of [x, z]. */
export const FAR_LAND = {
    island: [[-9000, -12500], [7000, -12000], [9000, -14800], [-7000, -15600]],
    farShore: [[-60000, -19000], [60000, -18500], [60000, -60000], [-60000, -60000]]
};

/** Whether a point is inside a polygon (even-odd rule). */
export function inPolygon(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

export function isLand(x, z, city = CITY) {
    return z >= shoreZ(x, city) || Object.values(FAR_LAND).some((p) => inPolygon(x, z, p));
}

export function isWater(x, z, city = CITY) {
    return !isLand(x, z, city);
}

/** A small seeded random source (a Park and Miller generator). */
export function seeded(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** Block (k, m)'s corners: k counts north along x, m east along z, and block
 *  (0, 0) is the office's own. */
export function blockAt(k, m, city = CITY) {
    const pitch = city.block + city.street;
    const x0 = city.ownTower.x0 + k * pitch;
    const z0 = city.ownTower.z0 + m * pitch;
    return { x0, x1: x0 + city.block, z0, z1: z0 + city.block, cx: x0 + city.block / 2, cz: z0 + city.block / 2 };
}

/**
 * What a block holds, by where it is: `district` (waterfront, core, mid or
 * outer) and the tower height range there. The core, within a few blocks
 * of the office, is the tall one, and most of it rises above the office.
 */
export function districtOf(b, city = CITY) {
    const d = Math.hypot(b.cx, b.cz);
    if (b.cz - shoreZ(b.cx, city) < 200) return { district: 'waterfront', lo: 14, hi: 40 };
    if (d < 480) return { district: 'core', lo: 90, hi: 300 };
    if (d < 1150) return { district: 'mid', lo: 90, hi: 220 };
    return { district: 'outer', lo: 35, hi: 140 };
}

/**
 * Every building: `{ x, z, w, d, h, base, form, tiers, podium, tone, low }`.
 * `base` is its ground's height above the water; `h` its height from that
 * ground. `form` is its plan: box, chamfer (the corners cut) or round.
 * `tiers` are its setbacks, each `{ from, inset }` (from: meters up where
 * the tower steps in by `inset`). `podium` is a lower base filling more of
 * the block, or null. `low` marks the low buildings of the open blocks.
 */
export function cityTowers(city = CITY) {
    const random = seeded(city.seed);
    const pitch = city.block + city.street;
    const n = Math.ceil(city.radius / pitch);
    const towers = [];
    for (let k = -n; k <= n; k++) {
        for (let m = -n; m <= n; m++) {
            if (k === 0 && m === 0) continue;
            const b = blockAt(k, m, city);
            if (Math.hypot(b.cx, b.cz) > city.radius) continue;
            // Nothing is built far behind the office: the east (+z) and the
            // south (-x) are never seen. The view is west and north.
            if (b.cz > 400 || b.cx < -600) continue;
            const corners = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
            if (!corners.every(([x, z]) => z >= shoreZ(x, city) + 8)) continue;
            const { district, lo, hi } = districtOf(b, city);
            const roll = random();
            const base = elevation(b.cx, b.cz, city);
            // THE FOREGROUND IS LOW. The blocks right across the street to the
            // west are low buildings the office looks 150 m DOWN onto, and the
            // towers that frame the view stand from the next block on, their
            // tops above the window. A tower right across the street filled
            // the whole window (measured 2026-09-24): scale, but no view.
            if (m === -1 && k >= -1 && k <= 2) {
                towers.push({
                    x: b.cx, z: b.cz, w: city.block - 8, d: city.block - 8, h: 18 + random() * 22, base,
                    form: 'box', tiers: [], podium: null, tone: random(), low: true
                });
                continue;
            }
            // Some blocks stay low or open: a plaza, a hotel, a park. Those
            // gaps are where the water shows.
            const open = district === 'core' ? 0.24 : district === 'mid' ? 0.3 : district === 'outer' ? 0.45 : 0;
            if (roll < open) {
                if (random() < 0.5) {
                    towers.push({
                        x: b.cx, z: b.cz, w: city.block - 10, d: city.block - 10, h: 12 + random() * 18, base,
                        form: 'box', tiers: [], podium: null, tone: random(), low: true
                    });
                }
                continue;
            }
            const pair = district !== 'waterfront' && random() < 0.22;
            const count = pair ? 2 : 1;
            for (let i = 0; i < count; i++) {
                // Skewed low, so the giants are the exception, as downtown.
                const tall = lo + (hi - lo) * random() ** 1.8;
                const w = pair ? 30 + random() * 8 : district === 'waterfront' ? city.block - 8 : 44 + random() * 22;
                const d = pair ? 30 + random() * 8 : district === 'waterfront' ? city.block - 12 : 44 + random() * 22;
                const x = pair ? b.cx + (i ? 1 : -1) * 19 : b.cx + (random() - 0.5) * (city.block - w) * 0.8;
                const z = pair ? b.cz + (i ? -1 : 1) * 17 : b.cz + (random() - 0.5) * (city.block - d) * 0.8;
                const formRoll = random();
                const form = pair && formRoll < 0.3 ? 'round' : formRoll < 0.35 ? 'chamfer' : 'box';
                const tiers = [];
                if (tall > 120 && random() < 0.65) tiers.push({ from: tall * (0.55 + random() * 0.2), inset: 3 + random() * 4 });
                if (tall > 200 && random() < 0.45) tiers.push({ from: tall * (0.82 + random() * 0.08), inset: 3 + random() * 3 });
                const podium = !pair && district !== 'waterfront' && random() < 0.5
                    ? { h: 14 + random() * 14, w: city.block - 6, d: city.block - 6 } : null;
                towers.push({
                    x, z, w, d, h: district === 'waterfront' ? tall * 0.9 : tall, base, form, tiers, podium,
                    tone: random(), low: false
                });
            }
        }
    }
    return towers;
}

/** The piers along the waterfront, the ferry dock at the foot of the
 *  office's own street (the corridor its back window looks down). */
export function piers(city = CITY) {
    // The dock stands in the middle of the office's street, and the other
    // piers are spaced out either side of it.
    const dock = city.ownTower.x1 + city.street / 2;
    const out = [];
    for (let i = -2; i <= 5; i++) {
        const x = dock + i * 140;
        const ferry = i === 0;
        out.push({ x, z: shoreZ(x, city), length: ferry ? 160 : 110, width: ferry ? 56 : 36, ferry });
    }
    return out;
}

/**
 * Where the reflections are captured from, in the room's frame. The glass
 * reflects the city as seen from `city`: over a street crossing two blocks
 * down the hill, 150 m up (the office's own height), among the towers, so
 * every tower's glass shows towers and, past them, the sky, the skyline and
 * the bay. Lower, in the canyon, the glass mirrored mostly dark street. The water reflects the world as seen from `bay`: just
 * over the water off the ferry dock, so the far water mirrors the far shore
 * and the mountains nearly where a true mirror would (they are far enough
 * off that the few hundred meters between here and any patch of water
 * hardly moves them).
 */
export function reflectionPoints(city = CITY) {
    const x = blockAt(1, 0, city).x0 - city.street / 2;
    const z = blockAt(0, -2, city).z0 - city.street / 2;
    return {
        city: [x, groundY(x, z, city) + 150, z],
        bay: [x, WATER_Y + 25, shoreZ(x, city) - 600]
    };
}

// ---- The land across the water -------------------------------------------------

/**
 * A smooth random field on the plane, -1 to 1 (gradient noise on a seeded
 * lattice): the raw stuff the mountains and hills are shaped from. The same
 * seed gives the same field on every visit.
 */
export function noiseField(seed) {
    const random = seeded(seed);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const angle = perm.map(() => random() * Math.PI * 2);
    const gx = Float64Array.from(angle, Math.cos);
    const gz = Float64Array.from(angle, Math.sin);
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    // The four corners worked out in line, with nothing made per call: the
    // land's ninety thousand points ask it near a million times.
    return (x, z) => {
        const i = Math.floor(x);
        const j = Math.floor(z);
        const fx = x - i;
        const fz = z - j;
        const p0 = perm[i & 255];
        const p1 = perm[(i + 1) & 255];
        const g00 = perm[(p0 + j) & 255];
        const g10 = perm[(p1 + j) & 255];
        const g01 = perm[(p0 + j + 1) & 255];
        const g11 = perm[(p1 + j + 1) & 255];
        const d00 = gx[g00] * fx + gz[g00] * fz;
        const d10 = gx[g10] * (fx - 1) + gz[g10] * fz;
        const d01 = gx[g01] * fx + gz[g01] * (fz - 1);
        const d11 = gx[g11] * (fx - 1) + gz[g11] * (fz - 1);
        const u = fade(fx);
        const v = fade(fz);
        const top = d00 + (d10 - d00) * u;
        const bottom = d01 + (d11 - d01) * u;
        return Math.max(-1, Math.min(1, (top + (bottom - top) * v) * 1.4));
    };
}

/**
 * Mountain crests, 0 to 1: ridged noise, where each octave's field is
 * folded along its zero line into a sharp crest, and the finer octaves
 * cut in hardest where the coarse ones already stand high (so the peaks
 * are rugged and the valleys smooth, as weather leaves real ranges).
 */
export function crests(field, x, z, octaves = 5) {
    let sum = 0;
    let total = 0;
    let amp = 1;
    let freq = 1;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
        let n = 1 - Math.abs(field(x * freq + o * 17.3, z * freq - o * 9.1));
        n *= n * weight;
        weight = Math.min(1, n * 2);
        sum += n * amp;
        total += amp;
        amp *= 0.55;
        freq *= 2.03;
    }
    return sum / total;
}

const smoothstep = (a, b, t) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
};

/**
 * The mountains across the bay (QA, 2026-09-25: "the weakest part of the
 * scene"). One landscape from the far shore back: wooded foothills, a
 * front range, and the high snowy range at the back about 34 km out, its
 * peaks near 4,200 m, drawn 1.5 times as tall as such a range would stand
 * (Steve's choice, so they rise clear of the water, as the jet is drawn
 * larger than life). `inland` is how far back from the shore each part
 * begins and ends, meters; `snow` and `trees` the lines, before their
 * wander; `step` the grid across and the rows back for each band.
 *
 * The grid is fine enough that a summit 35 km off is more than a handful
 * of triangles (QA, 2026-09-25: at 300 by 420 m each cell was 8 px across
 * and the tops looked folded from paper), and `octaves` stops the crests'
 * detail at what the grid can draw: a finer octave only jitters the points.
 */
export const MOUNTAINS = {
    x: [-52000, 52000],
    step: 150,
    bands: {
        farShore: { from: 0, to: 3500, row: 250 },
        mountains: { from: 3500, to: 27000, row: 210 }
    },
    octaves: 4,
    snow: 2050,
    trees: 1200,
    seed: CITY.seed + 17
};

/** Where the far shore's water line is, as a z, at a point along it (the
 *  near edge of FAR_LAND.farShore). */
export function farCoastZ(x) {
    const [[x0, z0], [x1, z1]] = FAR_LAND.farShore;
    return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
}

/**
 * The land across the bay's height above the water at a point, meters:
 * nothing (below the water) short of the far shore, and back from it the
 * foothills rolling up to the front range and the high range behind it,
 * the ranges' crests rising and falling in massifs along their length.
 */
export function mountainHeight(x, z, fields = mountainFields()) {
    const d = farCoastZ(x) - z;
    if (d <= 0) return -8;
    const shore = smoothstep(0, 700, d);
    const front = smoothstep(4000, 9000, d) * (1 - 0.35 * smoothstep(15000, 22000, d));
    const high = smoothstep(9000, 16000, d) * (1 - smoothstep(21000, 26000, d));
    // The massifs: stretches of the range standing high, and between them
    // saddles where the range behind the front one shows through.
    const massif = 0.35 + 0.65 * smoothstep(-0.55, 0.6, fields.massif(x / 14000, 0.37));
    const ridges = crests(fields.ridge, x / 5200, d / 5200, MOUNTAINS.octaves);
    const rolling = 0.5 + 0.5 * fields.roll(x / 2500, d / 2500);
    // The foothills stay low (about a degree over the water from the
    // office), so the ranges' slopes show above them even in a frame that
    // looks down, as the window's does on a wide screen.
    const foot = 120 + 300 * smoothstep(500, 5000, d);
    return shore * (foot + 180 * rolling * (1 - front) + front * (300 + 1700 * massif * ridges) + high * (200 + 1400 * massif * ridges));
}

/** The seeded fields the land is shaped from, made once. */
let fieldsMade = null;
export function mountainFields() {
    if (!fieldsMade) {
        const seed = MOUNTAINS.seed;
        fieldsMade = {
            ridge: noiseField(seed),
            massif: noiseField(seed + 1),
            roll: noiseField(seed + 2),
            lines: noiseField(seed + 3),
            island: noiseField(seed + 4)
        };
    }
    return fieldsMade;
}

/** The land's colors, sRGB. */
export const LAND_COLORS = {
    forest: 0x213a2d,
    alpine: 0x46504b,
    rock: 0x4f5764,
    cliff: 0x363c46,
    snow: 0xf1f4f7,
    far: 0x3d4d68
};

const mixHex = (a, b, t) => {
    const k = Math.min(1, Math.max(0, t));
    const ch = (c, s) => (c >> s) & 255;
    const one = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (one(16) << 16) | (one(8) << 8) | one(0);
};

/**
 * How the snow lies. It is drawn a pixel at a time (world.js landSnow), not
 * a grid point at a time, so its edge follows the ground however coarse the
 * grid (QA, 2026-09-25: colored per point, it could only change every 300 m
 * and smeared to gray across each triangle between).
 *
 * SOFT, NOT SHARP (QA, 2026-09-26: "a little too sharp and jagged"). A
 * range 35 km off is some 40 m a pixel, so an edge a few tens of meters wide
 * was a pixel wide, and a pixel-wide edge drawn in a shader stair-steps
 * (nothing smooths it, not even the canvas's antialiasing, which only
 * smooths the edges of triangles). So the snow thins out over a hundred
 * meters or more of height and a wide range of steepness, and a light veil
 * of it lies over the rock near the tops, so the snowfields fade into the
 * faces rather than stopping at them.
 *
 * `soft` is how far either side of the snow line, in height, the snow thins
 * out; `holds` the steepness (0 flat, 1 sheer) over which it gives way to
 * rock at the snow line, about 28 to 49 degrees; `high` how much steeper
 * ground it holds, and how far above the line, since near the summits snow
 * and ice cling to the faces (without it the snow sat in thin rims on the
 * crests over bare gray faces); `fray` how far the finest grain of the snow
 * line (snowFray) moves it, meters of height and a share of the steepness;
 * `dust` the veil over the rock: its `share` of snow, reached `over` that
 * many meters above the line, on ground up to `holds` steep (none on sheer
 * rock); `distance` the far ranges' share of blue on the snow, a little of
 * the ground's.
 */
export const SNOW = {
    soft: 110,
    holds: [0.12, 0.34],
    high: [0.14, 1000],
    fray: [45, 0.03],
    dust: { share: 0.2, over: 700, holds: [0.3, 0.6] },
    distance: 0.3
};

/**
 * The snow line's finest grain, -1 to 1: three ripples a hundred to three
 * hundred meters long, crossing, finer than the grid, so the snow runs down
 * the gullies in tongues and the rock breaks through it in ribs. Waves, not a
 * hash, so a GPU draws it as this does (the "GLSL hash differs offline"
 * note). world.js draws the same three.
 */
export const SNOW_FRAY = [[0.0467, 0.0229, 0], [-0.0118, 0.0287, 1.7], [0.0171, -0.0174, 4.1]];

export function snowFray(x, z, waves = SNOW_FRAY) {
    let sum = 0;
    for (const [kx, kz, phase] of waves) sum += Math.sin(kx * x + kz * z + phase);
    return sum / waves.length;
}

/** The snow line at a point, meters above the water, before its finest
 *  grain: wandering over kilometers, and fraying at a finer one, tongues of
 *  snow down the valleys and rock pushing up between. */
export function snowLineAt(x, z, fields = mountainFields()) {
    const wander = fields.lines(x / 3000, z / 3000);
    const fray = fields.lines(x / 700 + 31.7, z / 700 - 12.9);
    return MOUNTAINS.snow + 300 * wander + 220 * fray;
}

/** How much snow covers a point, 0 to 1: `h` its height, `steep` its
 *  steepness, `line` the snow line there (snowLineAt), `fray` the finest
 *  grain there (snowFray). Snow holds on the gentler ground and slides off
 *  the steep faces, which stand out darker between the snowfields, under
 *  a light veil of it (SNOW.dust) near the tops. */
export function snowCover(h, steep, line, fray = 0) {
    const edge = line + SNOW.fray[0] * fray;
    const give = SNOW.fray[1] * fray + SNOW.high[0] * smoothstep(edge, edge + SNOW.high[1], h);
    const field = smoothstep(edge - SNOW.soft, edge + SNOW.soft, h) * (1 - smoothstep(SNOW.holds[0] + give, SNOW.holds[1] + give, steep));
    const { share, over, holds } = SNOW.dust;
    const veil = share * smoothstep(edge, edge + over, h) * (1 - smoothstep(holds[0], holds[1], steep));
    return Math.max(field, veil);
}

/** The blue of distance: how much of LAND_COLORS.far the land takes, going
 *  from none at `from` meters off to `share` at `to`. */
export const DISTANCE_BLUE = { share: 0.45, from: 12000, to: 40000 };

/** How far a point's color has gone to the blue of distance, 0 to 1. */
export function distanceBlue(distance) {
    return DISTANCE_BLUE.share * smoothstep(DISTANCE_BLUE.from, DISTANCE_BLUE.to, distance);
}

/**
 * The land at a point without its snow: `h` its height above the water,
 * `steep` 0 (flat) to 1 (sheer), `distance` from the office. Forest up to a
 * wandering tree line, alpine meadow and rock above it, dark cliff where it
 * is steep, and the far ranges a little bluer (the blue of distance, which
 * the pale haze alone washes white). What world.js gives each grid point.
 */
export function landGround(h, steep, x, z, distance, fields = mountainFields()) {
    const treeLine = MOUNTAINS.trees + 220 * fields.lines(x / 3000, z / 3000);
    let c = mixHex(LAND_COLORS.forest, LAND_COLORS.alpine, smoothstep(treeLine - 200, treeLine + 200, h));
    c = mixHex(c, LAND_COLORS.rock, smoothstep(treeLine + 200, treeLine + 700, h));
    c = mixHex(c, LAND_COLORS.cliff, smoothstep(0.12, 0.3, steep));
    return mixHex(c, LAND_COLORS.far, distanceBlue(distance));
}

/** The snow's own color at a distance: it takes a little of the blue. */
export function snowColor(distance) {
    return mixHex(LAND_COLORS.snow, LAND_COLORS.far, SNOW.distance * distanceBlue(distance));
}

/**
 * The color of the land at a point, snow and all: the ground (landGround)
 * under the snow (snowCover). world.js draws it in two halves, the ground
 * per grid point and the snow per pixel.
 */
export function landColor(h, steep, x, z, distance, fields = mountainFields()) {
    const snow = snowCover(h, steep, snowLineAt(x, z, fields), snowFray(x, z));
    return mixHex(landGround(h, steep, x, z, distance, fields), snowColor(distance), snow);
}

/**
 * The island's height above the water: gently rolling wooded hills,
 * highest in its middle, down to the water at its shore, and below the
 * water off it. Under the office's eye (it sits lower than the far shore).
 */
export function islandHeight(x, z, fields = mountainFields()) {
    const poly = FAR_LAND.island;
    if (!inPolygon(x, z, poly)) return -8;
    let edge = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, az] = poly[j];
        const [bx, bz] = poly[i];
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
        edge = Math.min(edge, Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))));
    }
    const rolling = 0.5 + 0.5 * fields.island(x / 2600, z / 2600);
    const natural = smoothstep(0, 1400, edge) * (70 + 100 * rolling);
    // Leveled where the airport stands (airportFlat).
    return natural + (AIRPORT.elevation - natural) * airportFlat(x, z);
}

/**
 * The ranges' skyline as the office sees it: for each bearing (degrees north
 * of west, `from` to `to` by `step`), how high the crest stands, in degrees
 * over level from an eye `eye` meters over the office's floor, found by
 * walking out from `near` to `far` meters every `stride`. The sun goes behind
 * it about five degrees up, so its light leaves the city half an hour before
 * the clock's sunset, as it does behind real mountains (sky.js sunClear).
 */
export const RIDGE = { from: -45, to: 45, step: 1, near: 2000, far: 50000, stride: 200, eye: 1.5 };

let ridgeMade = null;
export function ridgeLine() {
    if (!ridgeMade) {
        const fields = mountainFields();
        const n = Math.round((RIDGE.to - RIDGE.from) / RIDGE.step) + 1;
        ridgeMade = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const a = ((RIDGE.from + i * RIDGE.step) * Math.PI) / 180;
            let best = -90;
            for (let d = RIDGE.near; d <= RIDGE.far; d += RIDGE.stride) {
                const x = Math.sin(a) * d;
                const z = -Math.cos(a) * d;
                const h = Math.max(mountainHeight(x, z, fields), islandHeight(x, z, fields));
                best = Math.max(best, (Math.atan2(WATER_Y + h - RIDGE.eye, d) * 180) / Math.PI);
            }
            ridgeMade[i] = best;
        }
    }
    return ridgeMade;
}

/** The crest's height at a bearing (degrees north of west), in degrees,
 *  between the measured bearings a straight line; off either end of them
 *  there is no range to hide anything, and it is -90. */
export function ridgeAt(bearing) {
    const line = ridgeLine();
    const f = (bearing - RIDGE.from) / RIDGE.step;
    if (!(f >= 0 && f <= line.length - 1)) return -90;
    const i = Math.min(line.length - 2, Math.floor(f));
    return line[i] + (line[i + 1] - line[i]) * (f - i);
}

// ---- The airport across the bay -------------------------------------------------

/**
 * An airport on the island's south end, where the jets land (QA, 2026-09-28:
 * "a cool way to really anchor the passenger jet animation to the
 * environment"). Every jet comes in from the visitor's right and lands
 * toward their left, so the runway runs the way they land: `heading`
 * degrees west of south, down and away from the office.
 *
 * WHERE THE WINDOWS SEE IT (measured 2026-09-28, with the windows floor to
 * ceiling): the desk sees the island's south end from x -6,250 to -4,000
 * on a laptop, the window from -9,000 to -4,250, and the big tower left of
 * the office's street hides the island from there to x 0. So the jets
 * touch down at `touchdown` (x, and meters `back` from the shore), just
 * left of that tower, and roll out and taxi in across the stretch every
 * desk sees.
 *
 * DRAWN LIKE THE JET. The jet is drawn 3.5 times its size (life.js JET) so
 * it reads as an airliner 13 km off; the airport is drawn to match it, a
 * control tower 95 m tall and a runway 140 m wide, or a jet would not fit
 * on it. By day, from 195 m up and 13 km off, its flat ground is a line a
 * pixel tall, so it is the tower, the terminal, the hangars and the jets
 * at the gates that say airport; by night, its lights.
 *
 * THE RUNWAY POINTS BACK AT THE CITY (QA, 2026-09-29: the jet "looks really
 * small"). Laid across the view, 30 degrees west of south, its approach ran
 * 10 to 13 km out the whole way. Turned to 60 degrees, the approach starts
 * over downtown behind the office's right shoulder, and the jet crosses the
 * view 3 to 5 km out on its way down to the island, two to three times the
 * size.
 *
 * The airport's frame: `a` meters along the runway the way the jets land
 * (from the touchdown point), `b` meters across it, to the left of a jet
 * landing: south, and toward the office's side, which is why what stands
 * there is kept low. `site` is the airfield, rectangles of a and b (narrower
 * by the threshold, where the shore is near), `flat` how far past the site
 * the ground is fully level and how far it then blends back into the hills
 * (the island's grid is 250 m, so the level core must be wider than a cell
 * past everything built on it; from the office the view of the runway skims
 * 25 to 45 m over the ground before it, and the island's hills and
 * buildings there once hid the rollout and the taxi). `elevation` its height
 * above the
 * water, `runway` its ends and width, `taxiway` the parallel taxiway's
 * offset and width, `apron` and `gates` where the jets wait (all of them
 * taken), `hangar` the one the arrivals taxi into at the runway's far end
 * (from the office it hides a jet inside it, so the arrivals leave the
 * scene there rather than vanishing from a gate), and `approach` the lights
 * reaching out over the water before the runway.
 */
export const AIRPORT = {
    touchdown: { x: -4300, back: 500 },
    heading: 60,
    elevation: 12,
    site: [{ a: [-350, 800], b: [-150, 360] }, { a: [800, 3000], b: [-150, 880] }],
    flat: { margin: 380, blend: 350 },
    runway: { from: -300, to: 2700, width: 140 },
    taxiway: { b: 300, width: 70, exits: [150, 1350, 2550] },
    apron: { a: [800, 2500], b: [380, 620] },
    gates: { a: [1250, 1500, 1750, 2000, 2250], b: 520 },
    hangar: { a: 2700, b: 560, len: 200, wid: 170, h: 44 },
    approach: { reach: 900, every: 30 },
    lampEvery: 60
};

const DEG = Math.PI / 180;

/** The airport's frame in the room's: the touchdown point `origin` [x, z],
 *  `along` the runway the way the jets land, and `across` it, away from the
 *  office, both unit [x, z]. */
export function airportFrame() {
    const x = AIRPORT.touchdown.x;
    const h = AIRPORT.heading * DEG;
    return {
        origin: [x, islandShoreZ(x) - AIRPORT.touchdown.back],
        along: [-Math.cos(h), -Math.sin(h)],
        across: [-Math.sin(h), Math.cos(h)]
    };
}

/** A point of the airport's frame (a along, b across) as [x, z]. */
export function airportPoint(a, b = 0) {
    const { origin, along, across } = airportFrame();
    return [origin[0] + a * along[0] + b * across[0], origin[1] + a * along[1] + b * across[1]];
}

/** A point [x, z] in the airport's frame: { a, b }. */
export function airportLocal(x, z) {
    const { origin, along, across } = airportFrame();
    const dx = x - origin[0];
    const dz = z - origin[1];
    return { a: dx * along[0] + dz * along[1], b: dx * across[0] + dz * across[1] };
}

/** How far a point is from the airport's site, meters (0 inside it). */
export function airportDistance(x, z) {
    const { a, b } = airportLocal(x, z);
    return Math.min(...AIRPORT.site.map((r) => Math.hypot(
        Math.max(r.a[0] - a, 0, a - r.a[1]),
        Math.max(r.b[0] - b, 0, b - r.b[1])
    )));
}

/** How level the ground is at a point for the airport, 0 to 1: all of it
 *  on the site and a margin round it, blending back to the hills. */
export function airportFlat(x, z) {
    const { margin, blend } = AIRPORT.flat;
    return 1 - smoothstep(margin, margin + blend, airportDistance(x, z));
}

/** The airport's yaw for a direction along its frame (a, b), for a mesh
 *  built facing -z (life.js yawFor's convention). */
export function airportYaw(da, db) {
    const { along, across } = airportFrame();
    const dx = da * along[0] + db * across[0];
    const dz = da * along[1] + db * across[1];
    return Math.atan2(-dx, -dz);
}

/** The airport's colors, sRGB. */
export const AIRPORT_COLORS = {
    field: 0x5d6a52,
    runway: 0x33363a,
    taxiway: 0x44474b,
    apron: 0x8a8d8c,
    terminal: 0x9fb2bf,
    concourse: 0xc9ccc8,
    tower: 0xdad6ce,
    cab: 0x3f4d58,
    hangar: 0xd2d4d1,
    garage: 0xa7a7a0
};

/**
 * What the airport is built of, as boxes in its frame: `{ a, b, len, wid, y,
 * h, color, kind }`, `a` and `b` the box's center, `len` along the runway,
 * `wid` across it, `y` its foot above the airport's ground and `h` its
 * height. The flat things (the field, the runway, the taxiways, the apron)
 * stand a little proud of each other, so none fights another for the same
 * depth.
 */
export function airportParts() {
    const C = AIRPORT_COLORS;
    const { site, runway, taxiway, apron } = AIRPORT;
    const mid = (r) => (r[0] + r[1]) / 2;
    const span = (r) => r[1] - r[0];
    const parts = [
        ...site.map((r) => ({ a: mid(r.a), b: mid(r.b), len: span(r.a), wid: span(r.b), y: 0, h: 0.3, color: C.field, kind: 'field' })),
        { a: (runway.from + runway.to) / 2, b: 0, len: runway.to - runway.from, wid: runway.width, y: 0, h: 0.8, color: C.runway, kind: 'runway' },
        { a: 1300, b: taxiway.b, len: 2600, wid: taxiway.width, y: 0, h: 0.6, color: C.taxiway, kind: 'taxiway' },
        ...taxiway.exits.map((a) => ({ a, b: taxiway.b / 2, len: taxiway.width, wid: taxiway.b, y: 0, h: 0.6, color: C.taxiway, kind: 'taxiway' })),
        { a: mid(apron.a), b: mid(apron.b), len: span(apron.a), wid: span(apron.b), y: 0, h: 0.7, color: C.apron, kind: 'apron' },
        // The terminal: a long, low concourse along the apron's edge and the
        // glass hall behind it, the garage beyond. They stand on the office's
        // side of the gates, so they are kept low: from 15 km the view drops
        // only about 10 m in the 800 m to the gates, and a hall 26 m tall hid
        // the jets at them (measured 2026-09-29).
        { a: 1600, b: 650, len: 1400, wid: 40, y: 0, h: 10, color: C.concourse, kind: 'terminal' },
        { a: 1600, b: 790, len: 1000, wid: 110, y: 0, h: 14, color: C.terminal, kind: 'terminal' },
        { a: 2450, b: 800, len: 400, wid: 70, y: 0, h: 12, color: C.garage, kind: 'garage' },
        // The control tower: a shaft, its glass cab, and the cab's roof.
        { a: 950, b: 640, len: 18, wid: 18, y: 0, h: 95, color: C.tower, kind: 'tower' },
        { a: 950, b: 640, len: 36, wid: 36, y: 95, h: 16, color: C.cab, kind: 'tower' },
        { a: 950, b: 640, len: 40, wid: 40, y: 111, h: 3, color: C.tower, kind: 'tower' },
        // The hangars, by the runway's far end.
        { ...AIRPORT.hangar, y: 0, color: C.hangar, kind: 'hangar' },
        { a: 2920, b: 600, len: 150, wid: 150, y: 0, h: 38, color: C.hangar, kind: 'hangar' }
    ];
    return parts;
}

/** Where the jets wait: each gate's [x, z] and the yaw that points a
 *  jet's nose at the terminal. */
export function airportGates() {
    const yaw = airportYaw(0, 1);
    return AIRPORT.gates.a.map((a) => {
        const [x, z] = airportPoint(a, AIRPORT.gates.b);
        return { x, z, a, b: AIRPORT.gates.b, yaw };
    });
}

/** The airport's height in the room's frame: its ground, the water's depth
 *  below the office and its elevation above the water. */
export function airportY(above = 0) {
    return WATER_Y + AIRPORT.elevation + above;
}

/**
 * The airport's lights by night, `{ positions, colors }` ([x, y, z] and
 * [r, g, b], 0 to 1): white along both edges of the runway, green across
 * its threshold and red across its end, blue along the taxiway, a line of
 * white reaching out over the water before the runway, warm floods over the
 * apron, the terminal's windows, and a red beacon on the tower. And
 * `rabbit`, the approach's sequenced flashers in the order they run, from
 * farthest out toward the runway.
 */
export function airportLights() {
    const { runway, taxiway, apron, approach, lampEvery } = AIRPORT;
    const positions = [];
    const colors = [];
    const add = (a, b, up, rgb) => {
        const [x, z] = airportPoint(a, b);
        positions.push([x, airportY(up), z]);
        colors.push(rgb);
    };
    const white = [1, 0.97, 0.9];
    const half = runway.width / 2;
    for (let a = runway.from; a <= runway.to + 1e-6; a += lampEvery) {
        add(a, -half, 1, white);
        add(a, half, 1, white);
    }
    for (let b = -half; b <= half + 1e-6; b += runway.width / 10) {
        add(runway.from, b, 1, [0.35, 1, 0.45]);
        add(runway.to, b, 1, [1, 0.2, 0.15]);
    }
    for (let a = 0; a <= 2600; a += lampEvery) {
        add(a, taxiway.b - taxiway.width / 2, 1, [0.3, 0.45, 1]);
        add(a, taxiway.b + taxiway.width / 2, 1, [0.3, 0.45, 1]);
    }
    for (let a = runway.from - approach.every; a >= runway.from - approach.reach; a -= approach.every) add(a, 0, 1, white);
    for (let a = apron.a[0]; a <= apron.a[1]; a += 100) add(a, apron.b[0], 18, [1, 0.85, 0.6]);
    for (let a = 1120; a <= 2080; a += 40) add(a, 735, 9, [1, 0.88, 0.66]);
    add(950, 640, 116, [1, 0.15, 0.1]);
    const rabbit = [];
    for (let a = runway.from - approach.reach; a <= runway.from - approach.every + 1e-6; a += approach.every) {
        const [x, z] = airportPoint(a, 0);
        rabbit.push([x, airportY(2), z]);
    }
    return { positions, colors, rabbit };
}

// ---- The city across the bay ---------------------------------------------------

/**
 * The island's waterfront built up as part of the city (QA, 2026-09-26:
 * "buildings along the waterfront across the water", an Alki-like shore as
 * a modern extension of downtown). It faces the office along the island's
 * east shore, 12 km out, where a 150 m tower is about 1.5% of the frame's
 * height: a skyline, not a facade, so the forms stay simple and it is the
 * heights and the gaps that make it read.
 *
 * WHERE THE WINDOWS SEE IT (measured 2026-09-26): the office's own street
 * opens on the shore from x 0 to about 3,900 on every screen, and the wider
 * frames see it again from about -9,000 to -3,900. The city's center stands
 * in the first opening, opposite the street; the second is the airport's
 * (AIRPORT, QA 2026-09-28, where a second center stood), and elsewhere the
 * city is low, keeping `airportClear` meters off the airport. A SKYLINE HAS A PROFILE: measured in a
 * preview, towers of much the same height all along the shore read as a
 * picket fence, so the towers gather in the centers, tallest in the middle
 * and near the water, and a few `landmarks` (`x` along the shore, `d` back
 * from it, `h` tall) stand over them. `block` and `street` are its grid,
 * `beach` the open strip along the water, `inland` how far back it is built,
 * `landing` the plaza left open round the ferry's berth, `ground` the color
 * its streets and roofs give the hillside from 12 km, and `lamps` the
 * spacing of the street lights by night.
 */
export const ISLAND_CITY = {
    block: 70,
    street: 20,
    beach: 45,
    inland: 1000,
    landing: 70,
    centers: [{ x: 1900, spread: 1200, lift: 1 }],
    landmarks: [{ x: 1700, d: 170, h: 290 }, { x: 2470, d: 260, h: 245 }, { x: 1070, d: 80, h: 215 }],
    /** How far the city keeps from the airport's site, meters. */
    airportClear: 120,
    /** Only towers this tall carry red aviation lights (QA, 2026-09-29:
     *  from 12 km, one on every tower over 120 m ran together into a red
     *  bar, and the bay mirrored it as a red blot). */
    beaconAbove: 200,
    ground: 0x4c5249,
    lamps: 80,
    seed: CITY.seed + 29
};

/** Where the island's shore facing the office is, as a z, at a point along
 *  it (the edge of FAR_LAND.island between its first two corners). */
export function islandShoreZ(x) {
    const [[x0, z0], [x1, z1]] = FAR_LAND.island;
    return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
}

/** How strongly the island city rises at a point along its shore, 0 to 1:
 *  high in its two centers, low between. */
export function islandCenter(x) {
    return Math.max(...ISLAND_CITY.centers.map((c) => c.lift * Math.exp(-(((x - c.x) / c.spread) ** 2))));
}

/** The x of the ferry's berth on the island: straight out from the dock at
 *  the foot of the office's street (life.js ferryRoute runs along it). */
export function islandLandingX(city = CITY) {
    return piers(city).find((p) => p.ferry).x;
}

/**
 * The island's buildings, in the same form as cityTowers (`base` is the
 * ground's height above the water, the lowest of its corners, so no
 * building floats on the slope). Along the water, condominiums and offices
 * of six to eighteen floors, as a waterfront has; in the two centers,
 * glass towers up to about 250 m, the tallest near the water; farther back
 * up the hill, lower buildings and more open ground. Seeded: the same
 * skyline on every visit.
 */
export function islandTowers(city = CITY) {
    const S = ISLAND_CITY;
    const random = seeded(S.seed);
    const pitch = S.block + S.street;
    const [[x0], [x1]] = FAR_LAND.island;
    const landing = islandLandingX(city);
    const out = [];
    for (let x = x0 + 400; x <= x1 - 300; x += pitch) {
        const center = islandCenter(x);
        for (let d = S.beach + S.block / 2; d <= S.inland; d += pitch) {
            const z = islandShoreZ(x) - d;
            const roll = random();
            const shape = random();
            const size = random();
            const tone = random();
            // The ferry's plaza, open to the water, and the airport.
            if (Math.abs(x - landing) < S.landing && d < 260) continue;
            if (airportFlat(x, z) > 0 || airportDistance(x, z) < S.airportClear + S.block) continue;
            const half = S.block / 2;
            const corners = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
            // Every corner on the island. (The ground is under a meter for
            // the first sixty meters back from the water, so asking for more
            // than none took the whole waterfront row.)
            const grounds = corners.map(([cx, cz]) => islandHeight(cx, cz));
            if (Math.min(...grounds) < 0) continue;
            const back = d / S.inland;
            const landmark = S.landmarks.find((l) => Math.abs(l.x - x) < pitch / 2 && Math.abs(l.d - d) < pitch / 2);
            // Open blocks: parks and plazas, more of them up the hill and
            // fewer in the centers.
            if (!landmark && roll < 0.12 + 0.4 * back - 0.15 * center) continue;
            const base = Math.min(...grounds);
            const tallness = center * (0.4 + 0.6 * Math.exp(-d / 400));
            let h;
            let w;
            let form = 'box';
            if (landmark || shape < 0.9 * tallness ** 1.3) {
                h = landmark ? landmark.h : 55 + 170 * tallness ** 1.2 * (0.4 + 0.6 * size);
                w = landmark ? 46 : 30 + 18 * random();
                const f = random();
                form = landmark ? 'chamfer' : f < 0.1 ? 'round' : f < 0.45 ? 'chamfer' : 'box';
            } else if (d < 200) {
                h = 20 + 38 * size;
                w = S.block - 12 - 8 * random();
            } else {
                h = 10 + 24 * size;
                w = S.block - 14 - 10 * random();
            }
            const deep = form === 'box' ? w * (0.75 + 0.25 * random()) : w;
            const tiers = h > 120 && random() < 0.55 ? [{ from: h * (0.6 + 0.2 * random()), inset: 3 + 3 * random() }] : [];
            if (landmark) tiers.splice(0, tiers.length, { from: h * 0.62, inset: 4 }, { from: h * 0.84, inset: 4 });
            out.push({ x, z, w, d: deep, h, base, form, tiers, podium: null, tone, low: h < 35, island: true });
        }
    }
    return out;
}

/**
 * The island city's street lights, `[x, y, z]` in the room's frame: along
 * the waterfront promenade, and up each cross street toward the hill every
 * ISLAND_CITY.lamps meters. Lit by night (world.js), a glitter along the far
 * shore under the lit towers.
 */
export function islandLamps() {
    const S = ISLAND_CITY;
    const pitch = S.block + S.street;
    const [[x0], [x1]] = FAR_LAND.island;
    const out = [];
    const lamp = (x, z) => {
        const h = islandHeight(x, z);
        if (h >= 0 && airportFlat(x, z) === 0 && airportDistance(x, z) > S.airportClear) out.push([x, WATER_Y + h + 6, z]);
    };
    for (let x = x0 + 400; x <= x1 - 300; x += S.lamps) lamp(x, islandShoreZ(x) - S.beach * 0.6);
    for (let x = x0 + 400 + pitch / 2; x <= x1 - 300; x += pitch) {
        for (let d = S.beach + S.lamps; d <= S.inland; d += S.lamps) lamp(x, islandShoreZ(x) - d);
    }
    return out;
}

/** How built up the island's ground is at a point, 0 to 1: all of it over
 *  the city's band along the shore, fading out a little way beyond. */
export function islandBuilt(x, z) {
    const [[x0], [x1]] = FAR_LAND.island;
    const d = islandShoreZ(x) - z;
    const along = smoothstep(x0 + 200, x0 + 600, x) * (1 - smoothstep(x1 - 500, x1 - 100, x));
    const clear = smoothstep(0, ISLAND_CITY.airportClear, airportDistance(x, z));
    return clear * along * (1 - smoothstep(ISLAND_CITY.inland, ISLAND_CITY.inland + 300, d)) * smoothstep(0, ISLAND_CITY.beach, d);
}

/** The island's ground color at a point, from the forest's (`hex`) toward
 *  the city's where it is built (islandBuilt), and the airfield's grass
 *  where the airport has leveled it. */
export function islandGround(hex, x, z) {
    return mixHex(mixHex(hex, ISLAND_CITY.ground, 0.8 * islandBuilt(x, z)), AIRPORT_COLORS.field, airportFlat(x, z));
}

/**
 * A band of land as a grid: `x` across [from, to] every `dx` meters, and
 * `rows` of z. Heights from `height(x, z)`, y in the room's frame. Returns
 * the grid's `positions` (x, y, z each), and `cols` and `rows` counts.
 */
export function landGrid(xs, zs, height) {
    const positions = new Float32Array(xs.length * zs.length * 3);
    let k = 0;
    for (const z of zs) {
        for (const x of xs) {
            positions[k++] = x;
            positions[k++] = WATER_Y + height(x, z);
            positions[k++] = z;
        }
    }
    return { positions, cols: xs.length, rows: zs.length };
}

/** Evenly from `a` to `b`, every `step` or a little less, both ends in. */
export function stops(a, b, step) {
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/**
 * The land across the bay as grids: `farShore` (the wooded foothills) and
 * `mountains` (the ranges behind), sharing their seam row so they meet
 * without a crack, and the `island`. Rows run from the shore back, the
 * grid following the far shore's line. Made once and shared: the same on
 * every visit, and the finer grid is ninety thousand points to work out.
 * Nothing changes them once made.
 */
let gridsMade = null;
export function landGrids() {
    if (!gridsMade) gridsMade = makeLandGrids();
    return gridsMade;
}

function makeLandGrids() {
    const xs = stops(MOUNTAINS.x[0], MOUNTAINS.x[1], MOUNTAINS.step);
    const bands = {};
    for (const [name, band] of Object.entries(MOUNTAINS.bands)) {
        const ds = stops(band.from, band.to, band.row);
        // Each row follows the shore: z at a distance d inland.
        const positions = new Float32Array(xs.length * ds.length * 3);
        let k = 0;
        for (const d of ds) {
            for (const x of xs) {
                const z = farCoastZ(x) - d;
                positions[k++] = x;
                positions[k++] = WATER_Y + mountainHeight(x, z);
                positions[k++] = z;
            }
        }
        bands[name] = { positions, cols: xs.length, rows: ds.length };
    }
    // The island's grid covers it and a little water round it.
    bands.island = landGrid(stops(-9500, 9500, 250), stops(-11800, -15800, 250), (x, z) => islandHeight(x, z));
    return bands;
}

// ---- Glass and rooftops ---------------------------------------------------------

/** A curtain-wall panel's width and a floor's height, in meters: the scale
 *  every facade is drawn at, on every tower. */
export const PANEL = { width: 1.5, floor: 3.8 };

/** How many panels across and floors up one facade texture holds. paint.js
 *  paints to it and world.js maps to it, so the two always agree. */
export const FACADE_TILE = { cols: 16, rows: 12 };

/** Which facade a tower wears. */
export function towerStyle(t) {
    if (t.low) return 'bands';
    if (t.h > 160) return t.tone < 0.55 ? 'grid' : 'fins';
    return ['grid', 'bands', 'fins'][Math.floor(t.tone * 3) % 3];
}

/**
 * A tower's plan at a height: its outline as [x, z] points around it,
 * counterclockwise seen from above, for its form, stepped in by every
 * setback at or below that height.
 */
export function outline(t, at = 0) {
    const inset = t.tiers.filter((tier) => at >= tier.from).reduce((sum, tier) => sum + tier.inset, 0);
    const hw = Math.max(4, t.w / 2 - inset);
    const hd = Math.max(4, t.d / 2 - inset);
    if (t.form === 'round') {
        const n = 20;
        return Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2;
            return [t.x + Math.cos(a) * hw, t.z + Math.sin(a) * hd];
        });
    }
    if (t.form === 'chamfer') {
        const c = Math.min(hw, hd) * 0.28;
        return [
            [t.x - hw + c, t.z - hd], [t.x + hw - c, t.z - hd], [t.x + hw, t.z - hd + c], [t.x + hw, t.z + hd - c],
            [t.x + hw - c, t.z + hd], [t.x - hw + c, t.z + hd], [t.x - hw, t.z + hd - c], [t.x - hw, t.z - hd + c]
        ];
    }
    return [[t.x - hw, t.z - hd], [t.x + hw, t.z - hd], [t.x + hw, t.z + hd], [t.x - hw, t.z + hd]];
}

/** A tower's stacked sections, from its ground up: `{ y0, y1, at }` where
 *  `at` is the height its outline is taken at. */
export function sections(t) {
    const cuts = [0, ...t.tiers.map((tier) => tier.from).filter((f) => f > 0 && f < t.h), t.h];
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) out.push({ y0: cuts[i], y1: cuts[i + 1], at: cuts[i] });
    return out;
}

/**
 * What stands on a tower's roof, as boxes `{ x, z, w, d, y, h, kind }` (y is
 * the box's foot, from the tower's ground): a screened mechanical penthouse
 * on every tower, a helipad on some of the tall ones, and a spire on the
 * tallest.
 */
export function rooftop(t) {
    const out = [];
    const pts = outline(t, t.h);
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const tw = Math.max(...xs) - Math.min(...xs);
    const td = Math.max(...zs) - Math.min(...zs);
    const pw = tw * (0.4 + t.tone * 0.2);
    const pd = td * (0.35 + (1 - t.tone) * 0.2);
    const ph = t.low ? 3 : Math.min(12, 4 + t.h * 0.025);
    out.push({ x: t.x, z: t.z, w: pw, d: pd, y: t.h, h: ph, kind: 'penthouse' });
    if (t.h > 200 && t.tone < 0.35) {
        out.push({ x: t.x, z: t.z + td * 0.22, w: Math.min(20, tw * 0.5), d: Math.min(20, td * 0.4), y: t.h, h: 0.6, kind: 'helipad' });
    }
    if (t.h > 260) out.push({ x: t.x, z: t.z, w: 1.4, d: 1.4, y: t.h + ph, h: 30, kind: 'spire' });
    return out;
}

/** The towers that carry red aviation lights: every one downtown (over
 *  aviationLights' own height), and across the bay only the landmarks. */
export function beaconTowers(towers) {
    return towers.filter((t) => !t.island || t.h > ISLAND_CITY.beaconAbove);
}

/** The red aviation lights: at the top of every tower taller than `above`
 *  meters, on its spire when it has one. `[x, y, z]` with y above the
 *  WATER (the tower's ground and its height together). */
export function aviationLights(towers, above = 120) {
    const out = [];
    for (const t of towers) {
        if (t.h <= above) continue;
        const top = rooftop(t).reduce((y, b) => Math.max(y, b.y + b.h), t.h);
        out.push([t.x, t.base + top + 1, t.z]);
    }
    return out;
}

/** How far a curtain wall's panes lean off true, at most, as a slope. A
 *  real wall's panes are never quite flat nor quite in line, and that is
 *  what breaks its reflection pane by pane, the look of polished glass. */
export const PANE_TILT = 0.02;

/** Tilts that small are only a step or two of a byte, so they are stored
 *  this many times larger and the material scales them back (world.js
 *  normalScale). */
export const PANE_STORE = 5;

/**
 * The panes' tilts as a normal map, one facade tile (FACADE_TILE panes)
 * across at `per` texels a pane: RGBA bytes, each pane leaning its own way,
 * (-slope across, -slope up, 1) with the slope PANE_STORE times its true
 * size, normalized and stored 0 to 255.
 */
export function paneNormals(per = 4, seed = CITY.seed + 13) {
    const { cols, rows } = FACADE_TILE;
    const random = seeded(seed);
    const tilts = Array.from({ length: cols * rows }, () => [(random() * 2 - 1) * PANE_TILT, (random() * 2 - 1) * PANE_TILT]);
    const W = cols * per;
    const H = rows * per;
    const data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
            const [tx, ty] = tilts[Math.floor(j / per) * cols + Math.floor(i / per)];
            const sx = tx * PANE_STORE;
            const sy = ty * PANE_STORE;
            const len = Math.hypot(sx, sy, 1);
            const at = (j * W + i) * 4;
            data[at] = Math.round(((-sx / len) * 0.5 + 0.5) * 255);
            data[at + 1] = Math.round(((-sy / len) * 0.5 + 0.5) * 255);
            data[at + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
            data[at + 3] = 255;
        }
    }
    return { data, width: W, height: H };
}

/** The facade's texture coordinate for a length in meters along a wall (or
 *  up it), for a tile `count` panels (or floors) of `size` meters each. */
export function facadeUv(meters, size, count) {
    return meters / (size * count);
}
