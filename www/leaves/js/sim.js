// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sim.js - the leaves: where every one of them is, and how the air moves it.
 *
 * PURE. No THREE, no DOM: typed arrays in, typed arrays out, so all of it is
 * measured under Node. leafmesh.js draws what this writes into `sim.pose`.
 *
 * ---- A LEAF LYING STILL COSTS NOTHING ----
 *
 * A yard holds tens of thousands of leaves and the blower moves a few
 * hundred at a time, so a leaf is either ASLEEP, filed in a spatial bucket
 * and a cell, or AWAKE, on the active list and stepped every frame. The
 * blower wakes the sleeping leaves its air reaches (one scan of the buckets
 * under the jet per frame), and an awake leaf that has been still for a
 * moment goes to sleep EXACTLY WHERE IT LIES.
 *
 * ---- THE PILE'S SURFACE IS THE TOP OF THE LEAVES IN IT ----
 *
 * A grid of small cells holds the height of the top of the sleeping leaves
 * over each one (each leaf covers its own cell, a leaf's thickness above
 * where it lies), and a leaf arriving rests on that surface.
 * So the surface always matches what is drawn, and a leaf that comes to rest
 * never moves again until the air wakes it: no slide, no restack, no turn.
 * Steve's QA asked for exactly that on 2026-10-06 ("if the leaves could just
 * stay still where they initially land"). The model before it summed leaf
 * VOLUME into the grid and moved each leaf onto that sum as it fell asleep,
 * so a flat mat of leaves fluffed up a moment after it settled.
 *
 * Piles keep a slope because a MOVING leaf cannot climb a step steeper than
 * the angle of repose: it stops against it as it would against a wall, so a
 * drift builds outward from the wall as its leaves arrive. A sleeping leaf
 * only feels the wind while it lies within `shield` of the surface: a pile
 * is blown away from the top down, and the leaves underneath wait their
 * turn.
 *
 * ---- THE AIR ----
 *
 * The blower is a jet from the nozzle, a free jet that slows as 1 / distance
 * and widens as it goes, and once it hits the ground a wall jet that runs
 * along the lawn and fans out. A leaf takes the air's speed through
 * quadratic drag (so it falls at about 1.6 m/s in still air), swings side to
 * side as it falls, and on the ground skids against friction, hops up into
 * fast air, and sometimes cartwheels.
 *
 * ---- WHAT GETS UPLOADED ----
 *
 * `pose` holds six floats per leaf (x, y, z, yaw, pitch, roll), and every
 * write marks the leaf in a dirty range, so the mesh uploads only the slice
 * that changed. Leaves are numbered in Z-order across the yard at the start,
 * so the leaves under the blower sit close together in that range.
 */

const TAU = Math.PI * 2;

/** A small seeded generator (mulberry32): the same yard on every load. */
export function makeRandom(seed) {
    let a = seed >>> 0;
    return function random() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** An angle folded into [-PI, PI). */
export function wrapAngle(a) {
    return a - TAU * Math.floor((a + Math.PI) / TAU);
}

/** The nearest whole multiple of PI: flat, face up or face down. */
function nearestFlat(a) {
    return Math.PI * Math.round(a / Math.PI);
}

/** The area of a rectangle { minX, maxX, minZ, maxZ }. */
export function areaOf(r) {
    return Math.max(0, r.maxX - r.minX) * Math.max(0, r.maxZ - r.minZ);
}

/** How big a leaf is, in meters across, so `count` of them cover `area`
 *  `coverage` times over. Fewer leaves are bigger leaves. */
export function leafSize(count, area, L) {
    const s = Math.sqrt((L.coverage * area) / (Math.max(1, count) * L.fill));
    return clamp(s, L.minSize, L.maxSize);
}

/** A display (sRGB) channel to linear, the space the shader lights in. */
export function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Interleave the bits of two 16-bit numbers, for numbering leaves in
 *  Z-order so neighbors in the yard are neighbors in the buffer. */
export function morton(x, z) {
    const spread = (v) => {
        v &= 0xffff;
        v = (v | (v << 8)) & 0x00ff00ff;
        v = (v | (v << 4)) & 0x0f0f0f0f;
        v = (v | (v << 2)) & 0x33333333;
        v = (v | (v << 1)) & 0x55555555;
        return v;
    };
    return (spread(x) | (spread(z) << 1)) >>> 0;
}

// ---- The sim --------------------------------------------------------------

/**
 * An empty yard for `count` leaves. `config` is LEAVES_CONFIG (or a test's
 * copy of it). Nothing is placed until scatterLeaves().
 */
export function createSim(count, config) {
    const Y = config.yard;
    const K = config.pile;
    const b = Y.bounds;
    const cell = K.cell;
    const nx = Math.ceil((b.maxX - b.minX) / cell);
    const nz = Math.ceil((b.maxZ - b.minZ) / cell);
    const bnx = Math.ceil((b.maxX - b.minX) / K.bucket);
    const bnz = Math.ceil((b.maxZ - b.minZ) / K.bucket);
    const f32 = () => new Float32Array(count);
    const sim = {
        count,
        config,
        P: config.physics,
        K,
        bounds: b,
        // The fences and houses, and the four sides of every solid box (the
        // trees' trunks, M5).
        walls: [...Y.walls, ...solidBoxes(Y).flatMap(boxWalls)],
        cell,
        nx,
        nz,
        height: new Float32Array(nx * nz),
        // The ground under the leaves (M5): 0 on the lawn, and the top of any
        // solid box a leaf can land on (a `platform`: the porch, its step,
        // a pumpkin, the car). The surface never drops below it.
        floor: new Float32Array(nx * nz),
        // The tallest step a moving leaf can climb onto, from one cell to the
        // next: the slope of the angle of repose.
        maxStep: cell * Math.tan((K.reposeDegrees * Math.PI) / 180),
        thick: K.thick,
        reach: K.reach,
        shield: K.shieldLeaves * K.thick,
        bnx,
        bnz,
        head: new Int32Array(bnx * bnz).fill(-1),
        next: new Int32Array(count).fill(-1),
        prev: new Int32Array(count).fill(-1),
        bucketOf: new Int32Array(count).fill(-1),
        // The cell a sleeping leaf is filed in (-1 while awake), and the
        // cells' own lists, for working out a surface again when a leaf
        // leaves it.
        restCell: new Int32Array(count).fill(-1),
        cellHead: new Int32Array(nx * nz).fill(-1),
        cellNext: new Int32Array(count).fill(-1),
        cellPrev: new Int32Array(count).fill(-1),
        // Cells whose surface needs working out again, gathered while the
        // blower wakes leaves and settled once after (see wakeUnderJet).
        dirtyCells: new Int32Array(nx * nz),
        dirtyStamp: new Uint32Array(nx * nz),
        stamp: 1,
        dirtyCount: 0,
        px: f32(), py: f32(), pz: f32(),
        vx: f32(), vy: f32(), vz: f32(),
        yaw: f32(), pitch: f32(), roll: f32(),
        wyaw: f32(), wpitch: f32(), wroll: f32(),
        size: f32(),
        // A few millimeters each leaf rests above the surface, fixed for the
        // leaf, so leaves overlapping at the same height draw in a settled
        // order instead of flickering, and nothing shifts when one rests.
        lift: f32(),
        dragK: f32(),
        wakeK: f32(),
        flutterHz: f32(),
        phase: f32(),
        still: f32(),
        cartwheel: new Uint8Array(count),
        awake: new Uint8Array(count),
        // Leaves up in a tree's crown (M5): out of the yard, out of the
        // blower's reach and out of the count, until they are let go.
        hanging: new Uint8Array(count),
        active: new Int32Array(count),
        activeAt: new Int32Array(count).fill(-1),
        pending: new Int32Array(count),
        activeCount: 0,
        pose: new Float32Array(count * 6),
        dirtyMin: Infinity,
        dirtyMax: -1,
        time: 0,
        random: makeRandom((config.leaves.seed || 1) + 7),
        stats: { woken: 0, slept: 0, steps: 0 },
        air: new Float32Array(3),
        air2: new Float32Array(3),
        airJet: null,
        // Gusts from a body landing in a pile (burst), each { x, z, radius,
        // speed, born }: up and out for `physics.gust.life` seconds.
        gusts: [],
        // Which cell boundaries a wall stands on (see wallGrid).
        blockE: new Uint8Array(nx * nz),
        blockN: new Uint8Array(nx * nz)
    };
    wallGrid(sim);
    floorGrid(sim, solidBoxes(Y));
    return sim;
}

/**
 * Raise the floor under every platform box to its top, over the cells whose
 * middles it covers, so a leaf blown up onto the porch rests on the porch
 * rather than inside it. The box's own walls keep the lawn's leaves out
 * below its top, and a step low enough to climb (a pushed leaf climbs
 * maxStep * pushClimb) lets them up it a stair at a time.
 */
function floorGrid(sim, boxes) {
    const b = sim.bounds;
    for (const box of boxes) {
        if (!box.platform) continue;
        for (let iz = 0; iz < sim.nz; iz++) {
            const z = b.minZ + (iz + 0.5) * sim.cell;
            if (z < box.minZ || z > box.maxZ) continue;
            for (let ix = 0; ix < sim.nx; ix++) {
                const x = b.minX + (ix + 0.5) * sim.cell;
                const c = iz * sim.nx + ix;
                if (x >= box.minX && x <= box.maxX && sim.floor[c] < box.height) sim.floor[c] = box.height;
            }
        }
    }
    sim.height.set(sim.floor);
}

/**
 * Mark the cell boundaries the walls stand on: blockE[c] is the boundary
 * between cell c and the cell east of it (+x), blockN[c] between c and the
 * cell north of it (+z). A leaf's cover never reaches across one, so a
 * drift banked against the picket fence stays on its own side instead of
 * raising a phantom bump on the neighbor's lawn. Walls on the grid's own
 * edge need no marks.
 */
function wallGrid(sim) {
    const b = sim.bounds;
    for (const w of sim.walls) {
        if (w.axis === 'x') {
            const ix = Math.round((w.at - b.minX) / sim.cell) - 1;
            if (ix < 0 || ix >= sim.nx - 1) continue;
            for (let iz = 0; iz < sim.nz; iz++) {
                const z = b.minZ + (iz + 0.5) * sim.cell;
                if (z >= w.from && z <= w.to) sim.blockE[iz * sim.nx + ix] = 1;
            }
        } else {
            const iz = Math.round((w.at - b.minZ) / sim.cell) - 1;
            if (iz < 0 || iz >= sim.nz - 1) continue;
            for (let ix = 0; ix < sim.nx; ix++) {
                const x = b.minX + (ix + 0.5) * sim.cell;
                if (x >= w.from && x <= w.to) sim.blockN[iz * sim.nx + ix] = 1;
            }
        }
    }
}

/** A box on the ground as four walls of its height, one along each side:
 *  { minX, maxX, minZ, maxZ, height, platform }. */
export function boxWalls(box) {
    const h = box.height;
    return [
        { axis: 'x', at: box.minX, from: box.minZ, to: box.maxZ, height: h },
        { axis: 'x', at: box.maxX, from: box.minZ, to: box.maxZ, height: h },
        { axis: 'z', at: box.minZ, from: box.minX, to: box.maxX, height: h },
        { axis: 'z', at: box.maxZ, from: box.minX, to: box.maxX, height: h }
    ];
}

/** Every solid box on the ground: the yard's own (`yard.boxes`), the
 *  trunk of each tree that stands on the sim's ground (M5), three meters
 *  tall, so no leaf goes through a trunk, each pumpkin, as a platform
 *  as tall as the pumpkin over the square inside its belly, and his
 *  boxwoods the same way. */
export function solidBoxes(Y) {
    const b = Y.bounds;
    const trunks = (Y.trees || [])
        .filter((t) => t.x > b.minX && t.x < b.maxX && t.z > b.minZ && t.z < b.maxZ)
        .map((t) => ({ minX: t.x - t.trunk, maxX: t.x + t.trunk, minZ: t.z - t.trunk, maxZ: t.z + t.trunk, height: 3 }));
    const pumpkins = (Y.pumpkins || []).map((p) => {
        const half = p.r * 0.75;
        return { minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half, height: p.y + p.r * 1.44, platform: true };
    });
    // His boxwoods by his side fence (yard.js boxwood: about r tall), on the
    // sim's ground since it reached past his fence (2026-10-08).
    const boxwoods = ((Y.neighborYard && Y.neighborYard.boxwoods) || []).map((p) => {
        const half = p.r * 0.75;
        return { minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half, height: p.r * 1.05, platform: true };
    });
    return [...(Y.boxes || []), ...trunks, ...pumpkins, ...boxwoods];
}

/** Whether (x, z) is inside any of `boxes`, grown by `margin`. */
export function inBox(boxes, x, z, margin = 0) {
    for (const b of boxes || []) {
        if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
    }
    return false;
}

/**
 * Whether cells `a` and `b` (neighbors, diagonals included) see each other,
 * with no wall on the boundaries between them. Asked the same way from
 * either side, so a leaf's cover and the working out of a surface agree.
 */
function open(sim, a, b) {
    const nx = sim.nx;
    const ax = a % nx;
    const az = (a - ax) / nx;
    const bx = b % nx;
    const bz = (b - bx) / nx;
    if (ax !== bx) {
        const west = Math.min(ax, bx);
        if (sim.blockE[az * nx + west] || sim.blockE[bz * nx + west]) return false;
    }
    if (az !== bz) {
        const south = Math.min(az, bz);
        if (sim.blockN[south * nx + ax] || sim.blockN[south * nx + bx]) return false;
    }
    return true;
}

/** Empty the yard in place, so scatterLeaves() can lay the same leaves down
 *  again for a new round. The arrays are kept, because the leaf mesh draws
 *  straight from `pose`, and a new sim would leave it drawing the old one. */
export function resetSim(sim) {
    sim.height.set(sim.floor);
    sim.head.fill(-1);
    sim.next.fill(-1);
    sim.prev.fill(-1);
    sim.bucketOf.fill(-1);
    sim.restCell.fill(-1);
    sim.cellHead.fill(-1);
    sim.cellNext.fill(-1);
    sim.cellPrev.fill(-1);
    ['vx', 'vy', 'vz', 'wyaw', 'wpitch', 'wroll', 'still'].forEach((k) => sim[k].fill(0));
    sim.awake.fill(0);
    sim.hanging.fill(0);
    sim.activeAt.fill(-1);
    sim.activeCount = 0;
    sim.time = 0;
    sim.random = makeRandom((sim.config.leaves.seed || 1) + 7);
    sim.stats = { woken: 0, slept: 0, steps: 0 };
    sim.gusts = [];
    clearDirty(sim);
}

// ---- The grids ------------------------------------------------------------

export function cellIndex(sim, x, z) {
    const b = sim.bounds;
    const ix = clamp(Math.floor((x - b.minX) / sim.cell), 0, sim.nx - 1);
    const iz = clamp(Math.floor((z - b.minZ) / sim.cell), 0, sim.nz - 1);
    return iz * sim.nx + ix;
}

/** The top of the leaves (or the lawn) at a point. */
export function surfaceAt(sim, x, z) {
    const h = sim.height[cellIndex(sim, x, z)];
    return h > 0 ? h : 0;
}

function bucketIndex(sim, x, z) {
    const b = sim.bounds;
    const ix = clamp(Math.floor((x - b.minX) / sim.K.bucket), 0, sim.bnx - 1);
    const iz = clamp(Math.floor((z - b.minZ) / sim.K.bucket), 0, sim.bnz - 1);
    return iz * sim.bnx + ix;
}

function file(sim, i) {
    const k = bucketIndex(sim, sim.px[i], sim.pz[i]);
    const first = sim.head[k];
    sim.next[i] = first;
    sim.prev[i] = -1;
    if (first !== -1) sim.prev[first] = i;
    sim.head[k] = i;
    sim.bucketOf[i] = k;
    const c = cellIndex(sim, sim.px[i], sim.pz[i]);
    const top = sim.cellHead[c];
    sim.cellNext[i] = top;
    sim.cellPrev[i] = -1;
    if (top !== -1) sim.cellPrev[top] = i;
    sim.cellHead[c] = i;
    sim.restCell[i] = c;
}

function unfile(sim, i) {
    const k = sim.bucketOf[i];
    if (k < 0) return;
    const p = sim.prev[i];
    const n = sim.next[i];
    if (p !== -1) sim.next[p] = n; else sim.head[k] = n;
    if (n !== -1) sim.prev[n] = p;
    sim.next[i] = -1;
    sim.prev[i] = -1;
    sim.bucketOf[i] = -1;
    const c = sim.restCell[i];
    if (c < 0) return;
    const cp = sim.cellPrev[i];
    const cn = sim.cellNext[i];
    if (cp !== -1) sim.cellNext[cp] = cn; else sim.cellHead[c] = cn;
    if (cn !== -1) sim.cellPrev[cn] = cp;
    sim.cellNext[i] = -1;
    sim.cellPrev[i] = -1;
    sim.restCell[i] = -1;
}

/** Raise the surface over the cells a sleeping leaf covers (its own, and
 *  `reach` cells around it) to its own top, a leaf's thickness above where
 *  it lies. */
function cover(sim, i) {
    const c = sim.restCell[i];
    const top = sim.py[i] + sim.thick;
    const ix = c % sim.nx;
    const iz = (c - ix) / sim.nx;
    const r = sim.reach;
    for (let dz = -r; dz <= r; dz++) {
        const z = iz + dz;
        if (z < 0 || z >= sim.nz) continue;
        for (let dx = -r; dx <= r; dx++) {
            const x = ix + dx;
            if (x < 0 || x >= sim.nx) continue;
            const n = z * sim.nx + x;
            if (n !== c && !open(sim, c, n)) continue;
            if (sim.height[n] < top) sim.height[n] = top;
        }
    }
}

/** Work out the surface over cell `c` again from the sleeping leaves that
 *  cover it, after one of them has gone. */
function settleCell(sim, c) {
    const ix = c % sim.nx;
    const iz = (c - ix) / sim.nx;
    const r = sim.reach;
    let top = sim.floor[c];
    for (let dz = -r; dz <= r; dz++) {
        const z = iz + dz;
        if (z < 0 || z >= sim.nz) continue;
        for (let dx = -r; dx <= r; dx++) {
            const x = ix + dx;
            if (x < 0 || x >= sim.nx) continue;
            const n = z * sim.nx + x;
            if (n !== c && !open(sim, c, n)) continue;
            for (let j = sim.cellHead[n]; j !== -1; j = sim.cellNext[j]) {
                const t = sim.py[j] + sim.thick;
                if (t > top) top = t;
            }
        }
    }
    sim.height[c] = top;
}

/** Note the 3 by 3 cells around `c` as needing their surface worked out
 *  again, once each. */
function markCells(sim, c) {
    const ix = c % sim.nx;
    const iz = (c - ix) / sim.nx;
    const r = sim.reach;
    for (let dz = -r; dz <= r; dz++) {
        const z = iz + dz;
        if (z < 0 || z >= sim.nz) continue;
        for (let dx = -r; dx <= r; dx++) {
            const x = ix + dx;
            if (x < 0 || x >= sim.nx) continue;
            const n = z * sim.nx + x;
            if (sim.dirtyStamp[n] === sim.stamp) continue;
            sim.dirtyStamp[n] = sim.stamp;
            sim.dirtyCells[sim.dirtyCount++] = n;
        }
    }
}

/** Work out every noted cell's surface again, and start a fresh note. */
function settleMarked(sim) {
    for (let k = 0; k < sim.dirtyCount; k++) settleCell(sim, sim.dirtyCells[k]);
    sim.dirtyCount = 0;
    sim.stamp++;
}

// ---- Writing what is drawn -------------------------------------------------

function markDirty(sim, i) {
    if (i < sim.dirtyMin) sim.dirtyMin = i;
    if (i > sim.dirtyMax) sim.dirtyMax = i;
}

/** The slice of `pose` written since the last clearDirty(), as leaf indices
 *  [from, to), or null when nothing moved. */
export function dirtyRange(sim) {
    return sim.dirtyMax < 0 ? null : { from: sim.dirtyMin, to: sim.dirtyMax + 1 };
}

export function clearDirty(sim) {
    sim.dirtyMin = Infinity;
    sim.dirtyMax = -1;
}

/** Copy a leaf's state into the pose buffer. A leaf tipped on its edge is
 *  lifted by half its tip, so a cartwheel rolls over the lawn rather than
 *  through it. */
function writePose(sim, i, swing = 0) {
    const o = i * 6;
    const half = sim.size[i] * 0.5;
    const tip = Math.max(Math.abs(Math.sin(sim.pitch[i] + swing)), Math.abs(Math.sin(sim.roll[i])));
    sim.pose[o] = sim.px[i];
    sim.pose[o + 1] = sim.py[i] + half * tip;
    sim.pose[o + 2] = sim.pz[i];
    sim.pose[o + 3] = sim.yaw[i];
    sim.pose[o + 4] = sim.pitch[i] + swing;
    sim.pose[o + 5] = sim.roll[i];
    markDirty(sim, i);
}

// ---- Sleeping and waking ---------------------------------------------------

/** Put leaf `i` to sleep exactly where it is, as it is: filed in its bucket
 *  and cell, its velocity gone, and the surface raised over it. Its pose is
 *  not touched, so a leaf that came to rest is drawn exactly where it came
 *  to rest. */
function rest(sim, i) {
    sim.vx[i] = 0;
    sim.vy[i] = 0;
    sim.vz[i] = 0;
    sim.wyaw[i] = 0;
    sim.wpitch[i] = 0;
    sim.wroll[i] = 0;
    file(sim, i);
    cover(sim, i);
    sim.awake[i] = 0;
    sim.still[i] = 0;
}

/** The lowest neighbor of cell `c` that no wall stands between, and how far
 *  below `c` it is (0 and `c` itself if none is lower). */
export function lowestNeighbor(sim, c) {
    const ix = c % sim.nx;
    const iz = (c - ix) / sim.nx;
    let low = c;
    for (let dz = -1; dz <= 1; dz++) {
        const z = iz + dz;
        if (z < 0 || z >= sim.nz) continue;
        for (let dx = -1; dx <= 1; dx++) {
            const x = ix + dx;
            if (x < 0 || x >= sim.nx || (dx === 0 && dz === 0)) continue;
            const n = z * sim.nx + x;
            if (sim.height[n] < sim.height[low] && open(sim, c, n)) low = n;
        }
    }
    return { cell: low, drop: sim.height[c] - sim.height[low] };
}

/** Lay leaf `i` down at (x, z) on top of whatever is there, settled flat
 *  (face up, or face down if it was that way) with a little tilt: the first
 *  scatter, and the tests.
 *
 *  A leaf laid on a slope steeper than the angle of repose is moved down it
 *  first, so the drifts the scatter heaps against the house and the hedge
 *  are banks rather than towers. THIS IS NEVER USED ON A LEAF ANYBODY HAS
 *  SEEN: it happens before the first frame, and a leaf in play comes to rest
 *  exactly where it is (rest). */
export function layDown(sim, i, x, z) {
    const b = sim.bounds;
    // Laid down, it is in the yard (and no longer up in a crown, M5).
    sim.hanging[i] = 0;
    let c = cellIndex(sim, x, z);
    for (let n = 0; n < 64; n++) {
        const down = lowestNeighbor(sim, c);
        if (down.drop <= sim.maxStep) break;
        c = down.cell;
        const lx = c % sim.nx;
        const lz = (c - lx) / sim.nx;
        x = b.minX + (lx + 0.2 + 0.6 * sim.random()) * sim.cell;
        z = b.minZ + (lz + 0.2 + 0.6 * sim.random()) * sim.cell;
    }
    sim.px[i] = x;
    sim.pz[i] = z;
    sim.py[i] = surfaceAt(sim, x, z) + sim.lift[i];
    sim.pitch[i] = nearestFlat(sim.pitch[i]) + (sim.random() - 0.5) * 0.3;
    sim.roll[i] = nearestFlat(sim.roll[i]) + (sim.random() - 0.5) * 0.3;
    rest(sim, i);
    writePose(sim, i);
}

/** Wake leaf `i`: off its bucket and cell, onto the active list. The surface
 *  it covered is worked out again now, or, with `later`, noted for
 *  settleMarked() (the blower wakes many at once). */
export function wake(sim, i, later = false) {
    if (sim.awake[i]) return;
    const c = sim.restCell[i];
    unfile(sim, i);
    if (c >= 0) {
        markCells(sim, c);
        if (!later) settleMarked(sim);
    }
    sim.awake[i] = 1;
    sim.still[i] = 0;
    sim.activeAt[i] = sim.activeCount;
    sim.active[sim.activeCount++] = i;
    sim.stats.woken++;
}

function sleep(sim, i) {
    const at = sim.activeAt[i];
    const last = sim.active[--sim.activeCount];
    sim.active[at] = last;
    sim.activeAt[last] = at;
    sim.activeAt[i] = -1;
    sim.stats.slept++;
    rest(sim, i);
}

// ---- The yard's leaf fall ----------------------------------------------------

/** A key of `weights` ({ key: weight }), picked by `r` (0 to 1) in
 *  proportion to its weight. Also rooftops.js's, for its leaves' kinds. */
export function pickWeighted(weights, r) {
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let t = r * total;
    for (const k of keys) {
        t -= weights[k];
        if (t <= 0) return k;
    }
    return keys[keys.length - 1];
}

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/**
 * Cover the lawn in leaves, all asleep. Most fall evenly, and `driftShare`
 * of them bank against the house, the hedge and the fence. The tarp starts
 * clear. Leaves are numbered in Z-order across the yard (see the header).
 *
 * Returns the leaves' look for the mesh: six floats a leaf, (r, g, b) in
 * linear light, the kind's index in `kinds`, the size, and the cup.
 */
export function scatterLeaves(sim, config) {
    const L = config.leaves;
    const Y = config.yard;
    const look = config.look;
    const random = makeRandom(L.seed);
    const lawn = Y.lawn;
    const base = leafSize(sim.count, areaOf(lawn), L);
    const solids = solidBoxes(Y);
    const kinds = Object.keys(look.palettes);
    const leaves = new Array(sim.count);

    for (let i = 0; i < sim.count; i++) {
        let x;
        let z;
        for (let tries = 0; tries < 20; tries++) {
            if (random() < L.driftShare) {
                // A drift: against the house, the hedge or the fence, deepest
                // at the wall and thinning out.
                const d = -Math.log(1 - random() * 0.98) * L.driftWidth * 0.5;
                const side = random();
                if (side < 0.45) { x = lawn.minX + random() * (lawn.maxX - lawn.minX); z = lawn.minZ + d; }
                else if (side < 0.75) { x = lawn.minX + d; z = lawn.minZ + random() * (lawn.maxZ - lawn.minZ); }
                else { x = lawn.maxX - d; z = lawn.minZ + random() * (lawn.maxZ - lawn.minZ); }
            } else {
                x = lawn.minX + random() * (lawn.maxX - lawn.minX);
                z = lawn.minZ + random() * (lawn.maxZ - lawn.minZ);
            }
            x = clamp(x, lawn.minX + 0.05, lawn.maxX - 0.05);
            z = clamp(z, lawn.minZ + 0.05, lawn.maxZ - 0.05);
            if (!inRect(Y.tarp, x, z) && !inBox(solids, x, z, 0.05)) break;
        }
        const kind = pickWeighted(look.kinds, random());
        const palette = look.palettes[kind];
        const hex = palette[Math.floor(random() * palette.length) % palette.length];
        const j = 1 + (random() * 2 - 1) * look.colorJitter;
        const rgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
            .map((v) => srgbToLinear(clamp((v / 255) * j, 0, 1)));
        leaves[i] = {
            x,
            z,
            key: morton(Math.floor((x - sim.bounds.minX) / sim.K.bucket), Math.floor((z - sim.bounds.minZ) / sim.K.bucket)),
            rgb,
            kind: kinds.indexOf(kind),
            size: base * (1 + (random() * 2 - 1) * L.sizeJitter),
            cup: look.curl.min + random() * (look.curl.max - look.curl.min),
            yaw: random() * TAU,
            flip: random() < 0.3,
            r: [random(), random(), random(), random(), random()]
        };
    }
    leaves.sort((a, b) => a.key - b.key);

    const P = config.physics;
    const out = new Float32Array(sim.count * 6);
    leaves.forEach((leaf, i) => {
        sim.size[i] = leaf.size;
        sim.lift[i] = 0.002 + leaf.r[4] * sim.K.lift;
        sim.dragK[i] = P.drag * (1 + (leaf.r[0] * 2 - 1) * P.dragJitter);
        sim.wakeK[i] = 1 + (leaf.r[1] * 2 - 1) * P.wakeJitter;
        sim.flutterHz[i] = P.flutter.minHz + leaf.r[2] * (P.flutter.maxHz - P.flutter.minHz);
        sim.phase[i] = leaf.r[3] * TAU;
        sim.cartwheel[i] = leaf.r[4] < P.cartwheelShare ? 1 : 0;
        sim.yaw[i] = leaf.yaw;
        sim.pitch[i] = leaf.flip ? Math.PI : 0;
        sim.roll[i] = 0;
        layDown(sim, i, leaf.x, leaf.z);
        const o = i * 6;
        out[o] = leaf.rgb[0];
        out[o + 1] = leaf.rgb[1];
        out[o + 2] = leaf.rgb[2];
        out[o + 3] = leaf.kind;
        out[o + 4] = leaf.size;
        out[o + 5] = leaf.cup;
    });
    return { look: out, size: base };
}

// ---- The blower's air --------------------------------------------------------

/**
 * The jet for this frame, from the person at (x, z) facing the unit
 * direction (fx, fz). `on` false is still air. Everything the air needs per
 * leaf is worked out here once.
 */
export function makeJet(B, x, z, fx, fz, on) {
    const len = Math.hypot(fx, fz) || 1;
    fx /= len;
    fz /= len;
    const cp = Math.cos(B.pitch);
    const sp = Math.sin(B.pitch);
    // The person's right hand is (-fz, fx) from where they face.
    const side = B.side || 0;
    const nx = x + fx * B.reach - fz * side;
    const nz = z + fz * B.reach + fx * side;
    // Where the jet's axis meets the lawn, and how fast it is going there.
    const sImpact = B.height / Math.max(sp, 0.05);
    const impactSpeed = B.speed * Math.min(1, B.core / sImpact);
    return {
        on: Boolean(on),
        B,
        person: { x, z },
        fx, fz,
        nx, ny: B.height, nz,
        dx: fx * cp, dy: -sp, dz: fz * cp,
        sImpact,
        ix: nx + fx * cp * sImpact,
        iz: nz + fz * cp * sImpact,
        impactSpeed,
        impactWidth: B.width + B.spread * sImpact
    };
}

/**
 * The blower's air at (x, y, z), over ground at height `ground`, written to
 * `out` as (x, y, z) in m/s. Returns its speed. Zero when the jet is off.
 */
export function airAt(jet, x, y, z, ground, out) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    if (!jet || !jet.on) return 0;
    const B = jet.B;
    let best = 0;

    // The free jet, from the nozzle down to the lawn.
    const rx = x - jet.nx;
    const ry = y - jet.ny;
    const rz = z - jet.nz;
    const s = rx * jet.dx + ry * jet.dy + rz * jet.dz;
    if (s > 0 && s < jet.sImpact + 0.3) {
        const perp2 = Math.max(0, rx * rx + ry * ry + rz * rz - s * s);
        const w = B.width + B.spread * s;
        const u = B.speed * Math.min(1, B.core / s) * Math.exp(-perp2 / (w * w));
        if (u > best) {
            best = u;
            out[0] = jet.dx * u; out[1] = jet.dy * u; out[2] = jet.dz * u;
        }
    }

    // The wall jet, along the ground from where the jet lands.
    const qx = x - jet.ix;
    const qz = z - jet.iz;
    const s2 = qx * jet.fx + qz * jet.fz;
    if (s2 > -0.5 && s2 < B.range) {
        const along = s2 > 0 ? s2 : 0;
        const lat = -qx * jet.fz + qz * jet.fx;
        const w2 = jet.impactWidth + B.wallSpread * along;
        const above = y - ground > 0 ? y - ground : 0;
        const depth = B.wallDepth * (1 + along * (B.wallThicken || 0));
        let u = (jet.impactSpeed / (1 + along / B.wallDecay))
            * Math.exp(-(lat * lat) / (w2 * w2))
            * Math.exp(-above / depth);
        if (s2 < 0) u *= 1 + s2 / 0.5;
        if (u > best) {
            best = u;
            // Fanning out: the air turns away from the jet's center line.
            const fan = (0.35 * lat) / w2;
            let ax = jet.fx - jet.fz * fan;
            let az = jet.fz + jet.fx * fan;
            const n = Math.hypot(ax, az);
            ax /= n;
            az /= n;
            // The kick upward where it lands.
            const lift = (B.updraft || 0) * Math.exp(-along / (B.updraftLength || 1));
            out[0] = ax * u;
            out[1] = (0.08 + lift) * u;
            out[2] = az * u;
        }
    }
    return best;
}

/** The fastest air any of `jets` blows at (x, y, z), left in `sim.air`,
 *  with the jet it came from in `sim.airJet`. Returns its speed. */
function airOf(sim, jets, x, y, z, ground) {
    const out = sim.air;
    out[0] = 0; out[1] = 0; out[2] = 0;
    sim.airJet = null;
    let best = 0;
    for (let k = 0; k < jets.length; k++) {
        const u = airAt(jets[k], x, y, z, ground, sim.air2);
        if (u > best) {
            best = u;
            out[0] = sim.air2[0]; out[1] = sim.air2[1]; out[2] = sim.air2[2];
            sim.airJet = jets[k];
        }
    }
    // A landing's gust: straight up over the middle, leaning outward toward
    // the edge, fading with height above the pile and with time.
    const G = sim.P.gust;
    for (let k = 0; k < sim.gusts.length; k++) {
        const g = sim.gusts[k];
        const dx = x - g.x;
        const dz = z - g.z;
        const d = Math.hypot(dx, dz);
        const age = (sim.time - g.born) / G.life;
        if (d >= g.radius || age >= 1 || age < 0) continue;
        const above = y - ground > 0 ? y - ground : 0;
        const u = g.speed * (1 - d / g.radius) * (1 - age) * Math.exp(-above / G.height);
        if (u > best) {
            best = u;
            const lean = d > 1e-3 ? G.spread / d : 0;
            out[0] = dx * lean * u;
            out[1] = u;
            out[2] = dz * lean * u;
            sim.airJet = null;
        }
    }
    return best;
}

/** Wake the sleeping leaves the jet reaches: the buckets under its
 *  footprint, and in them the leaves near the surface in fast enough air.
 *
 *  EVERY LEAF IS JUDGED AGAINST THE SURFACE AS IT STOOD AT THE START OF THE
 *  FRAME. Waking a leaf takes its volume out of the pile, so waking them as
 *  they were found let each one uncover the next within the same pass, and
 *  a whole pile went up in one frame instead of from the top down. The ones
 *  to wake are gathered first and woken after the scan. */
function wakeUnderJet(sim, jet) {
    const B = jet.B;
    const reachEnd = B.range;
    const wEnd = jet.impactWidth + B.wallSpread * reachEnd;
    const ex = jet.ix + jet.fx * reachEnd;
    const ez = jet.iz + jet.fz * reachEnd;
    const px = -jet.fz;
    const pz = jet.fx;
    const xs = [jet.nx, ex + px * wEnd, ex - px * wEnd, jet.ix + px * jet.impactWidth * 3, jet.ix - px * jet.impactWidth * 3];
    const zs = [jet.nz, ez + pz * wEnd, ez - pz * wEnd, jet.iz + pz * jet.impactWidth * 3, jet.iz - pz * jet.impactWidth * 3];
    const b = sim.bounds;
    const q = sim.K.bucket;
    const x0 = clamp(Math.floor((Math.min(...xs) - b.minX) / q), 0, sim.bnx - 1);
    const x1 = clamp(Math.floor((Math.max(...xs) - b.minX) / q), 0, sim.bnx - 1);
    const z0 = clamp(Math.floor((Math.min(...zs) - b.minZ) / q), 0, sim.bnz - 1);
    const z1 = clamp(Math.floor((Math.max(...zs) - b.minZ) / q), 0, sim.bnz - 1);
    const reach = q * 0.75;
    const air = sim.air;
    const P = sim.P;
    const pending = sim.pending;
    let n = 0;
    for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
            // Skip a bucket well clear of the jet's band.
            const cx = b.minX + (bx + 0.5) * q - jet.ix;
            const cz = b.minZ + (bz + 0.5) * q - jet.iz;
            const along = cx * jet.fx + cz * jet.fz;
            const lat = Math.abs(-cx * jet.fz + cz * jet.fx);
            const band = jet.impactWidth + B.wallSpread * Math.max(0, along);
            if (lat > band * 2.2 + reach && along > -1.6) continue;
            for (let i = sim.head[bz * sim.bnx + bx]; i !== -1; i = sim.next[i]) {
                const x = sim.px[i];
                const z = sim.pz[i];
                const top = surfaceAt(sim, x, z);
                if (sim.py[i] >= top - sim.shield) {
                    const u = airAt(jet, x, sim.py[i], z, top, air);
                    if (u > P.wakeSpeed * sim.wakeK[i]) pending[n++] = i;
                }
            }
        }
    }
    for (let k = 0; k < n; k++) wake(sim, pending[k], true);
    settleMarked(sim);
}

// ---- Stepping -------------------------------------------------------------------

/** One step of one awake leaf. Returns true if it went back to sleep. */
function stepLeaf(sim, i, h, jets) {
    const P = sim.P;
    const air = sim.air;
    let x = sim.px[i];
    let y = sim.py[i];
    let z = sim.pz[i];
    let vx = sim.vx[i];
    let vy = sim.vy[i];
    let vz = sim.vz[i];
    const ground = surfaceAt(sim, x, z);
    // The same line the landing below uses (the leaf's own resting height,
    // and 3 mm), or a leaf between two lines feels no gravity, never lands,
    // and hangs there awake.
    const onGround = y <= ground + sim.lift[i] + 0.003;

    const u = airOf(sim, jets, x, y, z, ground);
    const B = sim.airJet ? sim.airJet.B : null;
    let ax = air[0];
    let ay = air[1];
    let az = air[2];
    if (u > 0 && B) {
        // Turbulence: the air wanders around its mean, differently for each
        // leaf, so a cloud of leaves billows rather than marching.
        const t = sim.time;
        const ph = sim.phase[i];
        const k = u * B.turbulence;
        ax += k * Math.sin(t * 5.3 + ph * 7.1);
        az += k * Math.cos(t * 4.7 + ph * 5.3);
        ay += k * 0.6 * Math.sin(t * 6.1 + ph * 3.7);
    }

    // Quadratic drag toward the air, implicit so a fast jet cannot overshoot.
    const rx = ax - vx;
    const ry = ay - vy;
    const rz = az - vz;
    const rel = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const k = sim.dragK[i] * (onGround ? P.groundDrag : 1) * rel;
    const g = onGround ? 0 : P.gravity;
    vx = (vx + h * k * ax) / (1 + h * k);
    vy = (vy + h * (k * ay - g)) / (1 + h * k);
    vz = (vz + h * k * az) / (1 + h * k);

    const hs = Math.hypot(vx, vz);
    if (onGround) {
        if (vy < 0) vy = 0;
        // Friction.
        const drop = P.friction * h;
        if (hs <= drop) { vx = 0; vz = 0; } else { vx *= 1 - drop / hs; vz *= 1 - drop / hs; }
        // A hop up into fast air.
        const flow = Math.hypot(ax, az);
        if (flow > P.liftSpeed && sim.random() < P.hopRate * (flow / P.liftSpeed - 1) * h) {
            vy = (P.hop.min + sim.random() * (P.hop.max - P.hop.min)) * Math.min(1.4, flow / (2 * P.liftSpeed));
            sim.wpitch[i] = (sim.random() - 0.5) * 30;
            sim.wroll[i] = (sim.random() - 0.5) * 30;
        }
    } else if (vy < 0) {
        // The falling swing, along a direction that turns slowly.
        const F = P.flutter;
        const swing = Math.sin(sim.time * sim.flutterHz[i] * TAU + sim.phase[i]);
        const fall = Math.min(1, -vy / 1.6);
        const dir = sim.phase[i] + sim.time * 0.4;
        vx += Math.cos(dir) * F.accel * swing * fall * h;
        vz += Math.sin(dir) * F.accel * swing * fall * h;
    }

    // Move, then meet the walls, the edges and the ground.
    const ox = x;
    const oz = z;
    x += vx * h;
    y += vy * h;
    z += vz * h;
    // A wall stops a leaf below its top. AIR DRIVEN INTO A WALL GOES UP IT,
    // and a leaf the air pins there rides it upward. Built for M2, measured
    // as adding next to nothing to the visitor's blowing (the updraft where
    // the air lands already carries leaves over the fence), and removed.
    // Restored after Steve's M3 QA: leaves the NEIGHBOR's air pinned against
    // the pickets on his side stayed there by the hundred, and he went back
    // in with his lawn full of them.
    const lift = u > P.wallLift.air ? P.wallLift.share : 0;
    // A wall that `stops` higher than it stands (the hedge, with the side
    // yard drawn behind it) stops a leaf up to there, but only lifts one
    // below its top.
    for (let w = 0; w < sim.walls.length; w++) {
        const wall = sim.walls[w];
        if (y >= (wall.stops ?? wall.height)) continue;
        const up = lift && y < wall.height ? lift : 0;
        if (wall.axis === 'x') {
            if ((ox < wall.at) !== (x < wall.at) && z >= wall.from && z <= wall.to) {
                x = ox < wall.at ? wall.at - 0.01 : wall.at + 0.01;
                if (up) vy = Math.max(vy, up * Math.abs(vx));
                vx = -vx * P.wallBounce;
            }
        } else if ((oz < wall.at) !== (z < wall.at) && x >= wall.from && x <= wall.to) {
            z = oz < wall.at ? wall.at - 0.01 : wall.at + 0.01;
            if (up) vy = Math.max(vy, up * Math.abs(vz));
            vz = -vz * P.wallBounce;
        }
    }
    const b = sim.bounds;
    if (x < b.minX) { x = b.minX + 0.01; vx = -vx * P.wallBounce; }
    if (x > b.maxX) { x = b.maxX - 0.01; vx = -vx * P.wallBounce; }
    if (z < b.minZ) { z = b.minZ + 0.01; vz = -vz * P.wallBounce; }
    if (z > b.maxZ) { z = b.maxZ - 0.01; vz = -vz * P.wallBounce; }
    // A STEP TOO TALL TO CLIMB STOPS A LEAF like a wall: a face of the pile
    // higher above it than the angle of repose allows from one cell to the
    // next, unless the blower is pushing it. That is what gives a drift its slope, built as its leaves come
    // in, with nothing moved after they land.
    // The blower can push a leaf up a steeper face than it would climb on
    // its own (`pushClimb` times as steep), or a pile would stop growing the
    // moment its foot became a step.
    let floor = surfaceAt(sim, x, z) + sim.lift[i];
    const climb = sim.maxStep * (u > P.wakeSpeed ? P.pushClimb : 1);
    if (y < floor - climb) {
        // Blocked: keep whichever half of the move still clears the face,
        // so a leaf pushed along a drift slides along it (as along a wall)
        // instead of stopping dead.
        const alongX = surfaceAt(sim, x, oz) + sim.lift[i];
        const alongZ = surfaceAt(sim, ox, z) + sim.lift[i];
        if (y >= alongX - climb) { z = oz; vz = 0; floor = alongX; }
        else if (y >= alongZ - climb) { x = ox; vx = 0; floor = alongZ; }
        else {
            x = ox;
            z = oz;
            vx = 0;
            vz = 0;
            floor = surfaceAt(sim, x, z) + sim.lift[i];
        }
    }
    // On the ground is within the same band onGround used above. A leaf
    // arriving is set down on the surface. A slow leaf the surface rose
    // around (other leaves coming to rest beside it, in the same cell) stays
    // where it is rather than being lifted onto them.
    let landed = false;
    if (y <= floor + 0.003) {
        const sameCell = cellIndex(sim, ox, oz) === cellIndex(sim, x, z);
        const speedNow = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (!(y < floor && sameCell && speedNow < P.settleSpeed && onGround)) y = floor;
        if (vy < 0) vy = 0;
        landed = true;
    }

    // Orientation.
    let swing = 0;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (!landed) {
        // Tumbling in the air: spin picks up with the air rushing past.
        const spin = 0.6 + rel * 1.4;
        sim.wpitch[i] += (Math.sign(sim.wpitch[i] || 1) * spin - sim.wpitch[i]) * Math.min(1, 3 * h);
        sim.wroll[i] += (Math.sign(sim.wroll[i] || -1) * spin * 0.7 - sim.wroll[i]) * Math.min(1, 3 * h);
        sim.pitch[i] += sim.wpitch[i] * h;
        sim.roll[i] += sim.wroll[i] * h;
        sim.yaw[i] += sim.wyaw[i] * h;
        if (vy < 0) swing = P.flutter.swing * Math.sin(sim.time * sim.flutterHz[i] * TAU + sim.phase[i]);
    } else if (sim.cartwheel[i] && hs > P.cartwheelSpeed) {
        // End over end along the lawn.
        sim.yaw[i] = Math.atan2(vx, vz);
        sim.pitch[i] += (hs / (0.5 * sim.size[i])) * h;
        sim.roll[i] += (nearestFlat(sim.roll[i]) - sim.roll[i]) * Math.min(1, 12 * h);
    } else {
        // Skidding flat, and settling as it slows.
        const settle = Math.min(1, 14 * h);
        sim.pitch[i] += (nearestFlat(sim.pitch[i]) - sim.pitch[i]) * settle;
        sim.roll[i] += (nearestFlat(sim.roll[i]) - sim.roll[i]) * settle;
        sim.yaw[i] += sim.wyaw[i] * h;
        sim.wyaw[i] *= 1 - settle;
        if (hs > 0.3) sim.wyaw[i] += (sim.random() - 0.5) * hs * 2 * h * 10;
    }
    sim.pitch[i] = wrapAngle(sim.pitch[i]);
    sim.roll[i] = wrapAngle(sim.roll[i]);
    sim.yaw[i] = wrapAngle(sim.yaw[i]);

    sim.px[i] = x; sim.py[i] = y; sim.pz[i] = z;
    sim.vx[i] = vx; sim.vy[i] = vy; sim.vz[i] = vz;


    // Back to sleep once it has been still a moment and the air has let go,
    // exactly where it is.
    if (landed && speed < P.sleepSpeed && u < P.wakeSpeed * sim.wakeK[i]) {
        sim.still[i] += h;
        if (sim.still[i] >= P.sleepSeconds) {
            writePose(sim, i, swing);
            sleep(sim, i);
            return true;
        }
    } else {
        sim.still[i] = 0;
    }
    writePose(sim, i, swing);
    return false;
}

/**
 * Advance the yard by `dt` seconds with this frame's jets: one jet, a list
 * of them, or null for still air. Where two blow on the same leaf, it feels
 * the faster air. Long frames are cut into steps no longer than
 * physics.maxStep.
 */
export function stepSim(sim, dt, jets) {
    if (!(dt > 0)) return;
    // One jet, a list of them (the visitor's and the neighbor's), or none.
    const list = Array.isArray(jets) ? jets.filter((j) => j && j.on) : (jets && jets.on ? [jets] : []);
    for (let k = 0; k < list.length; k++) wakeUnderJet(sim, list[k]);
    const n = Math.max(1, Math.ceil(dt / sim.P.maxStep));
    const h = dt / n;
    if (sim.gusts.length) sim.gusts = sim.gusts.filter((g) => sim.time - g.born < sim.P.gust.life);
    for (let s = 0; s < n; s++) {
        sim.time += h;
        // Backwards, because a leaf that sleeps is swapped out for the last.
        for (let a = sim.activeCount - 1; a >= 0; a--) {
            stepLeaf(sim, sim.active[a], h, list);
        }
        sim.stats.steps++;
    }
}

/**
 * WARM THE PHYSICS UP behind the loading screen (the phone pass, 2026-10-09).
 * The first blow of a visit woke some 700 leaves in one frame while the
 * engine compiled the code that steps them for the first time: 25 ms on a
 * computer, several frames' stutter on a phone, at the moment a visitor
 * first touches the blower. A second blow had no such frame. So a small
 * throwaway yard of `count` leaves is blown across the lawn into the hedge
 * and then the house for `seconds`, the same code on the same shapes of
 * data, and the real yard's first blow runs compiled. Returns the steps
 * taken. Nothing it does touches any other sim.
 */
export function warmUp(config, count = 600, seconds = 1.5) {
    const sim = createSim(count, config);
    scatterLeaves(sim, config);
    const B = config.blower;
    const L = config.yard.lawn;
    const frames = Math.max(1, Math.round(seconds * 60));
    const midX = (L.minX + L.maxX) / 2;
    const midZ = (L.minZ + L.maxZ) / 2;
    for (let f = 0; f < frames; f++) {
        const u = f / frames;
        // Across the lawn toward the hedge, then up it toward the house:
        // a ground skid, a hop into the air, a landing, a wall, a drift.
        const jet = u < 0.5
            ? makeJet(B, midX - (L.maxX - L.minX) * 0.4 * u, midZ, -1, -0.15, true)
            : makeJet(B, midX, midZ - (L.maxZ - L.minZ) * 0.6 * (u - 0.5), 0.1, -1, true);
        stepSim(sim, 1 / 60, [jet]);
    }
    return sim.stats.steps;
}

/** Drop a leaf from height `y` at (x, z): for tests, and for leaves that
 *  fall from the trees later on. */
export function dropLeaf(sim, i, x, y, z) {
    sim.hanging[i] = 0;
    wake(sim, i);
    sim.px[i] = x;
    sim.py[i] = y;
    sim.pz[i] = z;
    sim.vx[i] = 0;
    sim.vy[i] = 0;
    sim.vz[i] = 0;
    writePose(sim, i);
}

/** The top of the pile inside rectangle `r`: { x, z, height } at the
 *  middle of its highest cell, or the rectangle's middle and 0 where
 *  nothing lies (M3: what the dive aims at). */
export function pilePeak(sim, r) {
    const b = sim.bounds;
    const x0 = clamp(Math.floor((r.minX - b.minX) / sim.cell), 0, sim.nx - 1);
    const x1 = clamp(Math.floor((r.maxX - b.minX) / sim.cell), 0, sim.nx - 1);
    const z0 = clamp(Math.floor((r.minZ - b.minZ) / sim.cell), 0, sim.nz - 1);
    const z1 = clamp(Math.floor((r.maxZ - b.minZ) / sim.cell), 0, sim.nz - 1);
    let best = -1;
    let top = 0;
    for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
            const c = iz * sim.nx + ix;
            const h = sim.height[c] - sim.floor[c];
            if (h > top) { top = h; best = c; }
        }
    }
    if (best < 0) return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, height: 0 };
    const ix = best % sim.nx;
    const iz = (best - ix) / sim.nx;
    return { x: b.minX + (ix + 0.5) * sim.cell, z: b.minZ + (iz + 0.5) * sim.cell, height: top };
}

/**
 * Throw the leaves around (x, z) into the air, the way a body landing in a
 * pile does (M3): every sleeping leaf within `radius` is woken and sent up
 * at up to `speed` m/s and out from the middle, hardest near the middle.
 * Returns how many went up.
 */
export function burst(sim, x, z, radius, speed) {
    const b = sim.bounds;
    const q = sim.K.bucket;
    const x0 = clamp(Math.floor((x - radius - b.minX) / q), 0, sim.bnx - 1);
    const x1 = clamp(Math.floor((x + radius - b.minX) / q), 0, sim.bnx - 1);
    const z0 = clamp(Math.floor((z - radius - b.minZ) / q), 0, sim.bnz - 1);
    const z1 = clamp(Math.floor((z + radius - b.minZ) / q), 0, sim.bnz - 1);
    const pending = sim.pending;
    let n = 0;
    for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
            for (let i = sim.head[bz * sim.bnx + bx]; i !== -1; i = sim.next[i]) {
                if (Math.hypot(sim.px[i] - x, sim.pz[i] - z) < radius) pending[n++] = i;
            }
        }
    }
    for (let k = 0; k < n; k++) wake(sim, pending[k], true);
    settleMarked(sim);
    // THE AIR GOES UP WITH THEM. Thrown alone, a leaf's drag stops it within
    // a few centimeters (measured: 20 cm at 5.5 m/s), so the landing also
    // pushes a gust of air up and out, and the leaves ride it.
    sim.gusts.push({ x, z, radius: radius * 1.15, speed, born: sim.time });
    for (let k = 0; k < n; k++) {
        const i = pending[k];
        const dx = sim.px[i] - x;
        const dz = sim.pz[i] - z;
        const d = Math.hypot(dx, dz);
        const near = 1 - d / radius;
        const a = d > 1e-3 ? Math.atan2(dz, dx) : sim.random() * Math.PI * 2;
        const out = speed * 0.45 * (0.4 + near) * (0.6 + 0.8 * sim.random());
        sim.vx[i] = Math.cos(a) * out;
        sim.vz[i] = Math.sin(a) * out;
        sim.vy[i] = speed * (0.35 + 0.65 * near) * (0.7 + 0.6 * sim.random());
        sim.py[i] += 0.01;
        sim.wpitch[i] = (sim.random() - 0.5) * 24;
        sim.wroll[i] = (sim.random() - 0.5) * 24;
        writePose(sim, i);
    }
    return n;
}

/**
 * Take leaf `i` out of the yard and hang it at (x, y, z), up in a tree's
 * crown (M5): off the pile (the surface under it is worked out again), out
 * of the blower's reach, and out of the count, turned however `random` says,
 * until dropLeaf() lets it go. Only a sleeping leaf can be hung.
 */
export function hangLeaf(sim, i, x, y, z, random = sim.random) {
    if (sim.awake[i] || sim.hanging[i]) return false;
    const c = sim.restCell[i];
    unfile(sim, i);
    if (c >= 0) {
        markCells(sim, c);
        settleMarked(sim);
    }
    sim.hanging[i] = 1;
    sim.px[i] = x;
    sim.py[i] = y;
    sim.pz[i] = z;
    sim.yaw[i] = random() * TAU;
    sim.pitch[i] = (random() - 0.5) * 1.6;
    sim.roll[i] = (random() - 0.5) * 1.6;
    writePose(sim, i);
    return true;
}

/** How many leaves are lying still within `r` of (x, z): a look through
 *  the buckets there, changing nothing (M6: a trick-or-treater only kicks
 *  where there are leaves to kick). */
export function restingNear(sim, x, z, r) {
    const b = sim.bounds;
    const q = sim.K.bucket;
    const x0 = clamp(Math.floor((x - r - b.minX) / q), 0, sim.bnx - 1);
    const x1 = clamp(Math.floor((x + r - b.minX) / q), 0, sim.bnx - 1);
    const z0 = clamp(Math.floor((z - r - b.minZ) / q), 0, sim.bnz - 1);
    const z1 = clamp(Math.floor((z + r - b.minZ) / q), 0, sim.bnz - 1);
    let n = 0;
    for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
            for (let i = sim.head[bz * sim.bnx + bx]; i !== -1; i = sim.next[i]) {
                const dx = sim.px[i] - x;
                const dz = sim.pz[i] - z;
                if (dx * dx + dz * dz < r * r) n++;
            }
        }
    }
    return n;
}

/** How many leaves lie inside a rectangle, asleep or awake. */
export function countIn(sim, r) {
    let n = 0;
    for (let i = 0; i < sim.count; i++) {
        if (inRect(r, sim.px[i], sim.pz[i])) n++;
    }
    return n;
}

/** The volume under the pile's surface, in cubic meters. */
export function pileVolume(sim) {
    let v = 0;
    for (let c = 0; c < sim.height.length; c++) v += sim.height[c] - sim.floor[c];
    return v * sim.cell * sim.cell;
}
