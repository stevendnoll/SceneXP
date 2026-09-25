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
 * the west, an island and snowy mountains beyond. No real building is
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
 * The mountains west, beyond the far shore: a ridge of peaks `[x, height]`
 * along z = `z`, with snow above `snow`. Heights in meters above the water,
 * nearer and taller than life so they read above the water at all.
 */
export function olympics(city = CITY) {
    const random = seeded(city.seed + 7);
    const peaks = [];
    for (let x = -36000; x <= 36000; x += 1300) {
        const ridge = 1100 + 750 * Math.sin((x + 36000) / 8500) + random() * 800;
        peaks.push([x, Math.round(ridge)]);
    }
    return { z: -30000, depth: 9000, peaks, snow: 1600 };
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

/**
 * The low wooded hills across the water, in front of the mountains: the
 * island's back, and the far shore's ridge. Flat, they were each under a
 * pixel tall from the office. Raised, they give the horizon its layers. Each
 * is a ridge like the mountains' (`z` its middle, `depth` front to back,
 * peaks of [x, height]), no snow, tapering to the water at both ends.
 */
export function farHills(city = CITY) {
    const random = seeded(city.seed + 11);
    const ridge = (x0, x1, step, height) => {
        const peaks = [];
        for (let x = x0; x <= x1; x += step) {
            const t = (x - x0) / (x1 - x0);
            peaks.push([x, Math.round(Math.sin(Math.PI * t) ** 0.4 * height(x))]);
        }
        return peaks;
    };
    return {
        island: { z: -13800, depth: 2000, snow: Infinity, peaks: ridge(-7000, 6500, 500, () => 70 + random() * 50) },
        farShore: {
            z: -21200, depth: 4000, snow: Infinity,
            peaks: ridge(-58500, 58500, 1500, (x) => 70 + 40 * Math.sin(x / 7000) + random() * 40)
        }
    };
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
