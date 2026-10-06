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
 * and pressed into the heightfield, or AWAKE, on the active list and stepped
 * every frame. The blower wakes the sleeping leaves its air reaches (one scan
 * of the buckets under the jet per frame), and an awake leaf that has been
 * still for a moment goes back to sleep where it lies.
 *
 * ---- PILES ARE A HEIGHTFIELD ----
 *
 * A sleeping leaf adds its volume to a grid of small cells (spread over the
 * 3 by 3 around it, so the surface is smooth), and a leaf landing on top of
 * others rests on that surface. A leaf that lands on a slope steeper than the
 * angle of repose slides down to where it can stay, so piles grow as cones
 * and drifts bank against the fences. A sleeping leaf only feels the wind
 * while it lies within `shield` of the surface: a pile is blown away from the
 * top down, and the leaves underneath wait their turn.
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
        walls: Y.walls,
        cell,
        nx,
        nz,
        height: new Float32Array(nx * nz),
        maxStep: cell * Math.tan((K.reposeDegrees * Math.PI) / 180),
        // Set from the leaves' size by scatterLeaves().
        shield: 0.02,
        bnx,
        bnz,
        head: new Int32Array(bnx * bnz).fill(-1),
        next: new Int32Array(count).fill(-1),
        prev: new Int32Array(count).fill(-1),
        bucketOf: new Int32Array(count).fill(-1),
        deposit: new Int32Array(count).fill(-1),
        px: f32(), py: f32(), pz: f32(),
        vx: f32(), vy: f32(), vz: f32(),
        yaw: f32(), pitch: f32(), roll: f32(),
        wyaw: f32(), wpitch: f32(), wroll: f32(),
        size: f32(),
        dragK: f32(),
        wakeK: f32(),
        flutterHz: f32(),
        phase: f32(),
        still: f32(),
        cartwheel: new Uint8Array(count),
        awake: new Uint8Array(count),
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
        // Which cell boundaries a wall stands on (see wallGrid).
        blockE: new Uint8Array(nx * nz),
        blockN: new Uint8Array(nx * nz),
        low: -1
    };
    wallGrid(sim);
    return sim;
}

/**
 * Mark the cell boundaries the walls stand on: blockE[c] is the boundary
 * between cell c and the cell east of it (+x), blockN[c] between c and the
 * cell north of it (+z). A leaf never slides across one, and a pile's
 * footprint never spreads across one, so a drift banked against the picket
 * fence stays on its own side instead of raising a phantom bump on the
 * neighbor's lawn. Walls on the grid's own edge need no marks.
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

/**
 * How far the surface drops from cell `c` to its lowest neighbor that no
 * wall stands between (0 if none is lower). The neighbor is left in
 * `sim.low`. Kept allocation-free, since a sliding leaf asks every step.
 */
export function steepestDrop(sim, c) {
    const ix = c % sim.nx;
    const iz = (c - ix) / sim.nx;
    const h = sim.height;
    let low = c;
    let lowH = h[c];
    if (ix > 0 && !sim.blockE[c - 1] && h[c - 1] < lowH) { low = c - 1; lowH = h[low]; }
    if (ix < sim.nx - 1 && !sim.blockE[c] && h[c + 1] < lowH) { low = c + 1; lowH = h[low]; }
    if (iz > 0 && !sim.blockN[c - sim.nx] && h[c - sim.nx] < lowH) { low = c - sim.nx; lowH = h[low]; }
    if (iz < sim.nz - 1 && !sim.blockN[c] && h[c + sim.nx] < lowH) { low = c + sim.nx; lowH = h[low]; }
    sim.low = low;
    return h[c] - lowH;
}

/** Empty the yard in place, so scatterLeaves() can lay the same leaves down
 *  again for a new round. The arrays are kept, because the leaf mesh draws
 *  straight from `pose`, and a new sim would leave it drawing the old one. */
export function resetSim(sim) {
    sim.height.fill(0);
    sim.head.fill(-1);
    sim.next.fill(-1);
    sim.prev.fill(-1);
    sim.bucketOf.fill(-1);
    sim.deposit.fill(-1);
    ['vx', 'vy', 'vz', 'wyaw', 'wpitch', 'wroll', 'still'].forEach((k) => sim[k].fill(0));
    sim.awake.fill(0);
    sim.activeAt.fill(-1);
    sim.activeCount = 0;
    sim.time = 0;
    sim.random = makeRandom((sim.config.leaves.seed || 1) + 7);
    sim.stats = { woken: 0, slept: 0, steps: 0 };
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
}

// The 3 by 3 spread of a leaf's volume, summing to 16.
const SPREAD = [1, 2, 1, 2, 4, 2, 1, 2, 1];

/** Press a leaf's volume into the heightfield at cell `c` (sign 1), or take
 *  it back out (sign -1). Cells past the grid's edge, and cells across a
 *  wall from `c`, are skipped both ways, so a take always undoes its press
 *  exactly. */
function press(sim, i, c, sign) {
    const volume = sim.size[i] * sim.size[i] * sim.K.loft;
    const per = (sign * volume) / (16 * sim.cell * sim.cell);
    const ix = c % sim.nx;
    const iz = (c - ix) / sim.nx;
    // Which side of the center cell a wall closes off.
    const westShut = ix > 0 && sim.blockE[c - 1];
    const eastShut = sim.blockE[c];
    const southShut = iz > 0 && sim.blockN[c - sim.nx];
    const northShut = sim.blockN[c];
    let w = 0;
    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++, w++) {
            const x = ix + dx;
            const z = iz + dz;
            if (x < 0 || z < 0 || x >= sim.nx || z >= sim.nz) continue;
            if ((dx < 0 && westShut) || (dx > 0 && eastShut) || (dz < 0 && southShut) || (dz > 0 && northShut)) continue;
            sim.height[z * sim.nx + x] += per * SPREAD[w];
        }
    }
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

/** Lay leaf `i` down at (x, z): it settles flat (face up, or face down if
 *  it landed that way), presses into the heightfield and is filed in its
 *  bucket.
 *
 *  A leaf laid on a slope steeper than the angle of repose is moved down it
 *  first. THAT MOVE IS INSTANT, so it is the last resort: an awake leaf on a
 *  steep slope slides down it under the physics before it is allowed to
 *  sleep (stepLeaf), and this only catches what is laid down directly (the
 *  first scatter, the tests) or a leaf that could not slide. Until
 *  2026-10-06 it was the only way down, and a drift settling against a wall
 *  jumped outward in one frame, one leaf in ten by a quarter meter or more
 *  (Steve's QA: the leaves "suddenly puff up"). */
export function layDown(sim, i, x, z) {
    const b = sim.bounds;
    let c = cellIndex(sim, x, z);
    for (let n = 0; n < 32; n++) {
        // The same line stepLeaf slides at, or a leaf allowed to sleep on a
        // slope would be moved off it here in one frame.
        if (steepestDrop(sim, c) <= sim.maxStep * sim.P.slide.start) break;
        c = sim.low;
        const lx = c % sim.nx;
        const lz = (c - lx) / sim.nx;
        x = b.minX + (lx + 0.2 + 0.6 * sim.random()) * sim.cell;
        z = b.minZ + (lz + 0.2 + 0.6 * sim.random()) * sim.cell;
    }
    sim.px[i] = x;
    sim.pz[i] = z;
    sim.py[i] = Math.max(0, sim.height[c]) + 0.003;
    sim.vx[i] = 0;
    sim.vy[i] = 0;
    sim.vz[i] = 0;
    sim.wyaw[i] = 0;
    sim.wpitch[i] = 0;
    sim.wroll[i] = 0;
    // Settle flat, keeping which face is up, with a little tilt.
    sim.pitch[i] = nearestFlat(sim.pitch[i]) + (sim.random() - 0.5) * 0.3;
    sim.roll[i] = nearestFlat(sim.roll[i]) + (sim.random() - 0.5) * 0.3;
    sim.deposit[i] = c;
    press(sim, i, c, 1);
    file(sim, i);
    sim.awake[i] = 0;
    sim.still[i] = 0;
    writePose(sim, i);
}

/** Whether an awake leaf at cell `c` is on a slope it must slide down: past
 *  the angle of repose by `slide.start`, so a pile sitting right at its
 *  angle does not creep for seconds as tiny bumps tip over the line. Leaves
 *  `sim.low` set. The sleep and layDown() ask the same question, so no leaf
 *  is laid down on a slope it would then be moved off in one frame. */
function mustSlide(sim, c) {
    return steepestDrop(sim, c) > sim.maxStep * sim.P.slide.start;
}

export function wake(sim, i) {
    if (sim.awake[i]) return;
    unfile(sim, i);
    if (sim.deposit[i] >= 0) press(sim, i, sim.deposit[i], -1);
    sim.deposit[i] = -1;
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
    layDown(sim, i, sim.px[i], sim.pz[i]);
}

// ---- The yard's leaf fall ----------------------------------------------------

function pickWeighted(weights, r) {
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
    // How deep one leaf of the usual size stacks where it lies (the middle of
    // its 3 by 3 spread), and so how deep the wind reaches.
    sim.shield = sim.K.shieldLeaves * (base * base * sim.K.loft * 4) / (16 * sim.cell * sim.cell);
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
            if (!inRect(Y.tarp, x, z)) break;
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
    for (let k = 0; k < n; k++) wake(sim, pending[k]);
}

// ---- Stepping -------------------------------------------------------------------

/** One step of one awake leaf. Returns true if it went back to sleep. */
function stepLeaf(sim, i, h, jet) {
    const P = sim.P;
    const B = jet ? jet.B : null;
    const air = sim.air;
    let x = sim.px[i];
    let y = sim.py[i];
    let z = sim.pz[i];
    let vx = sim.vx[i];
    let vy = sim.vy[i];
    let vz = sim.vz[i];
    const ground = surfaceAt(sim, x, z);
    const onGround = y <= ground + 0.006;

    let u = airAt(jet, x, y, z, ground, air);
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
        if (mustSlide(sim, cellIndex(sim, x, z))) {
            // ON A SLOPE STEEPER THAN A PILE HOLDS, the leaf slides down it
            // toward the lowest neighboring cell, in place of friction, at no
            // more than a slide's speed unless the air is driving it.
            const S = P.slide;
            const low = sim.low;
            const lx = low % sim.nx;
            const lz = (low - lx) / sim.nx;
            const tx = sim.bounds.minX + (lx + 0.5) * sim.cell - x;
            const tz = sim.bounds.minZ + (lz + 0.5) * sim.cell - z;
            const len = Math.hypot(tx, tz) || 1;
            vx += (tx / len) * S.accel * h;
            vz += (tz / len) * S.accel * h;
            const now = Math.hypot(vx, vz);
            if (now > S.maxSpeed && u < P.wakeSpeed) {
                vx *= S.maxSpeed / now;
                vz *= S.maxSpeed / now;
            }
        } else {
            // Friction.
            const drop = P.friction * h;
            if (hs <= drop) { vx = 0; vz = 0; } else { vx *= 1 - drop / hs; vz *= 1 - drop / hs; }
        }
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
    for (let w = 0; w < sim.walls.length; w++) {
        const wall = sim.walls[w];
        if (y >= wall.height) continue;
        if (wall.axis === 'x') {
            if ((ox < wall.at) !== (x < wall.at) && z >= wall.from && z <= wall.to) {
                x = ox < wall.at ? wall.at - 0.01 : wall.at + 0.01;
                vx = -vx * P.wallBounce;
            }
        } else if ((oz < wall.at) !== (z < wall.at) && x >= wall.from && x <= wall.to) {
            z = oz < wall.at ? wall.at - 0.01 : wall.at + 0.01;
            vz = -vz * P.wallBounce;
        }
    }
    const b = sim.bounds;
    if (x < b.minX) { x = b.minX + 0.01; vx = -vx * P.wallBounce; }
    if (x > b.maxX) { x = b.maxX - 0.01; vx = -vx * P.wallBounce; }
    if (z < b.minZ) { z = b.minZ + 0.01; vz = -vz * P.wallBounce; }
    if (z > b.maxZ) { z = b.maxZ - 0.01; vz = -vz * P.wallBounce; }
    // On the ground is within the same band onGround used above, and a leaf
    // in it is set down on the surface, so it can come to rest.
    const floor = surfaceAt(sim, x, z) + 0.003;
    let landed = false;
    if (y <= floor + 0.003) {
        y = floor;
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
    // and only where the pile can hold it: a leaf on a slope too steep keeps
    // sliding instead, unless it has been stuck there for `slide.giveUp`.
    if (landed && speed < P.sleepSpeed && u < P.wakeSpeed * sim.wakeK[i]) {
        sim.still[i] += h;
        if (sim.still[i] >= P.sleepSeconds
            && (sim.still[i] >= P.slide.giveUp || !mustSlide(sim, cellIndex(sim, x, z)))) {
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
 * Advance the yard by `dt` seconds with this frame's jet (or null for still
 * air). Long frames are cut into steps no longer than physics.maxStep.
 */
export function stepSim(sim, dt, jet) {
    if (!(dt > 0)) return;
    if (jet && jet.on) wakeUnderJet(sim, jet);
    const n = Math.max(1, Math.ceil(dt / sim.P.maxStep));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
        sim.time += h;
        // Backwards, because a leaf that sleeps is swapped out for the last.
        for (let a = sim.activeCount - 1; a >= 0; a--) {
            stepLeaf(sim, sim.active[a], h, jet);
        }
        sim.stats.steps++;
    }
}

/** Drop a leaf from height `y` at (x, z): for tests, and for leaves that
 *  fall from the trees later on. */
export function dropLeaf(sim, i, x, y, z) {
    wake(sim, i);
    sim.px[i] = x;
    sim.py[i] = y;
    sim.pz[i] = z;
    sim.vx[i] = 0;
    sim.vy[i] = 0;
    sim.vz[i] = 0;
    writePose(sim, i);
}

/** How many leaves lie inside a rectangle, asleep or awake. */
export function countIn(sim, r) {
    let n = 0;
    for (let i = 0; i < sim.count; i++) {
        if (inRect(r, sim.px[i], sim.pz[i])) n++;
    }
    return n;
}

/** The total volume pressed into the heightfield, in cubic meters. */
export function pileVolume(sim) {
    let v = 0;
    for (let c = 0; c < sim.height.length; c++) v += sim.height[c];
    return v * sim.cell * sim.cell;
}
