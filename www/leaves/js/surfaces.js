// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * surfaces.js - concrete and asphalt, painted (Steve's QA, 2026-10-08: the
 * sidewalk and the walk to the porch "look a little too flat. It could be
 * cool if it looked a little more like cement and maybe had a few cracks",
 * and the street in asphalt to match).
 *
 * EVERYTHING STAYS FLAT. The sim's leaves rest on a flat ground, so a heaved
 * slab or a raised joint would float them or bury them. All the detail is
 * in the pictures: concrete with fine aggregate, blotchy curing, a faint
 * broom finish, tooled joints between poured slabs, a little dirt along the
 * edges, each slab a shade of its own, and here and there a hairline crack;
 * the porch in smoother large pavers to suit the house; the street in
 * asphalt with its aggregate, worn patches and a sealed crack or two.
 *
 * PURE PARTS (crackPath, slabCracks) are plain numbers, measured under Node.
 * The painters need a canvas, and give null without one (Node, the tests),
 * where the surfaces are drawn in their plain colors as before. Each picture
 * is painted once per visit and shared (`cache`).
 */
import { makeRandom } from './sim.min.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const cache = new Map();

/**
 * A hairline crack from (x, y), meters, `length` long, setting off at
 * `heading` radians and wandering by up to `wander` radians a step of
 * `step` meters. Stays inside `bounds` ({ minX, maxX, minY, maxY }),
 * stopping at its edge. Returns [[x, y], ...].
 */
export function crackPath(random, x, y, length, heading, bounds, wander = 0.5, step = 0.05) {
    const pts = [[x, y]];
    let a = heading;
    let px = x;
    let py = y;
    for (let s = 0; s < length; s += step) {
        a += (random() * 2 - 1) * wander;
        // Cracks run on roughly the way they started.
        a += (heading - a) * 0.15;
        const nx = px + Math.cos(a) * step;
        const ny = py + Math.sin(a) * step;
        if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) break;
        px = nx;
        py = ny;
        pts.push([px, py]);
    }
    return pts;
}

/**
 * The cracks in one slab ({ minX, maxX, minY, maxY }, meters): `n` of them,
 * each starting at an edge or a corner (where concrete cracks) and running
 * in, some with a short branch. Returns a list of polylines.
 */
export function slabCracks(random, slab, n) {
    const out = [];
    const w = slab.maxX - slab.minX;
    const h = slab.maxY - slab.minY;
    const inside = { minX: slab.minX + 0.02, maxX: slab.maxX - 0.02, minY: slab.minY + 0.02, maxY: slab.maxY - 0.02 };
    for (let k = 0; k < n; k++) {
        // From a random edge, heading inward.
        const edge = Math.floor(random() * 4);
        let x;
        let y;
        let a;
        if (edge === 0) { x = slab.minX + 0.03; y = slab.minY + random() * h; a = 0; }
        else if (edge === 1) { x = slab.maxX - 0.03; y = slab.minY + random() * h; a = Math.PI; }
        else if (edge === 2) { x = slab.minX + random() * w; y = slab.minY + 0.03; a = Math.PI / 2; }
        else { x = slab.minX + random() * w; y = slab.maxY - 0.03; a = -Math.PI / 2; }
        a += (random() - 0.5) * 0.9;
        const length = (0.35 + random() * 0.55) * Math.min(w, h) + random() * 0.4;
        const main = crackPath(random, x, y, length, a, inside);
        out.push(main);
        if (random() < 0.45 && main.length > 6) {
            const from = main[Math.floor(main.length * (0.3 + random() * 0.4))];
            out.push(crackPath(random, from[0], from[1], length * 0.35, a + (random() < 0.5 ? 0.9 : -0.9), inside, 0.6));
        }
    }
    return out;
}

// ---- Painting ----------------------------------------------------------------

/** A canvas `w` by `h` pixels and its 2D context, or null with no canvas. */
function canvasOf(w, h) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext && canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
}

const rgb = (hex, k = 1) => {
    const r = clamp(Math.round(((hex >> 16) & 255) * k), 0, 255);
    const g = clamp(Math.round(((hex >> 8) & 255) * k), 0, 255);
    const b = clamp(Math.round((hex & 255) * k), 0, 255);
    return `rgb(${r},${g},${b})`;
};

/** Dots of aggregate, lighter and darker than `base`, `density` of the
 *  picture's pixels. Painted once on a 128 pixel tile on clear and laid over
 *  the whole picture as a repeating pattern: a dot at a time over a whole
 *  sidewalk was a hundred thousand draws, slow on a phone. The blotches,
 *  slabs and cracks over it hide the repeat. */
function speckle(ctx, random, w, h, base, density, spread = 0.18, size = 1.4) {
    const T = 128;
    const tile = canvasOf(T, T);
    if (!tile || !ctx.createPattern) return;
    const t = tile.ctx;
    t.clearRect(0, 0, T, T);
    for (let i = 0; i < T * T * density; i++) {
        t.fillStyle = rgb(base, 1 + (random() * 2 - 1) * spread);
        const s = 0.6 + random() * size;
        t.fillRect(random() * T, random() * T, s, s);
    }
    const pattern = ctx.createPattern(tile.canvas, 'repeat');
    if (!pattern) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
}

/** Soft blotches of a lighter or darker shade, the way concrete cures. */
function blotches(ctx, random, w, h, base, n, radius, strength) {
    for (let i = 0; i < n; i++) {
        const x = random() * w;
        const y = random() * h;
        const r = radius * (0.5 + random());
        const k = 1 + (random() * 2 - 1) * strength;
        if (!ctx.createRadialGradient) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgb(base, k).replace('rgb', 'rgba').replace(')', ',0.5)'));
        g.addColorStop(1, rgb(base, k).replace('rgb', 'rgba').replace(')', ',0)'));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
}

/** A polyline in meters, drawn at `ppm` pixels a meter. */
function stroke(ctx, pts, ppm, color, width) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * ppm, pts[0][1] * ppm);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * ppm, pts[i][1] * ppm);
    ctx.stroke();
}

function textureOf(canvas, repeat = true) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
    }
    texture.anisotropy = 4;
    return texture;
}

/**
 * Poured concrete, a picture `w` by `h` meters at `ppm` pixels a meter,
 * in `base` (a hex color). Slabs `slab` meters long along `along` ('x' or
 * 'y'), or a grid of `grid` meter pavers. `cracks` is how many slabs have a
 * crack. `broom` adds the faint finish across each slab, `edges` the dirt
 * along the long sides. Cached by `key`. Null without a canvas.
 */
export function concreteTexture(key, o) {
    if (cache.has(key)) return cache.get(key);
    const ppm = o.ppm;
    const W = Math.max(8, Math.round(o.w * ppm));
    const H = Math.max(8, Math.round(o.h * ppm));
    const c = canvasOf(W, H);
    if (!c) return null;
    const { ctx } = c;
    const random = makeRandom(o.seed || 1);
    ctx.fillStyle = rgb(o.base);
    ctx.fillRect(0, 0, W, H);
    // The slabs, each its own shade.
    const slabs = [];
    if (o.grid) {
        for (let x = 0; x < o.w - 1e-6; x += o.grid) {
            for (let y = 0; y < o.h - 1e-6; y += o.grid) slabs.push({ minX: x, maxX: Math.min(o.w, x + o.grid), minY: y, maxY: Math.min(o.h, y + o.grid) });
        }
    } else if (o.along === 'x') {
        for (let x = 0; x < o.w - 1e-6; x += o.slab) slabs.push({ minX: x, maxX: Math.min(o.w, x + o.slab), minY: 0, maxY: o.h });
    } else {
        for (let y = 0; y < o.h - 1e-6; y += o.slab) slabs.push({ minX: 0, maxX: o.w, minY: y, maxY: Math.min(o.h, y + o.slab) });
    }
    for (const s of slabs) {
        ctx.fillStyle = rgb(o.base, 1 + (random() * 2 - 1) * (o.slabShade ?? 0.035));
        ctx.fillRect(s.minX * ppm, s.minY * ppm, (s.maxX - s.minX) * ppm, (s.maxY - s.minY) * ppm);
    }
    blotches(ctx, random, W, H, o.base, Math.round(o.w * o.h * 3), ppm * 0.35, 0.07);
    speckle(ctx, random, W, H, o.base, o.speckle ?? 0.05, 0.2);
    // The broom: faint strokes across the slab, the way it was finished.
    if (o.broom) {
        ctx.globalAlpha = 0.07;
        for (let i = 0; i < (o.along === 'x' ? W : H) * 0.6; i++) {
            const t = random() * (o.along === 'x' ? W : H);
            ctx.strokeStyle = random() < 0.5 ? '#ffffff' : '#000000';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            if (o.along === 'x') { ctx.moveTo(t, 0); ctx.lineTo(t + (random() - 0.5) * 3, H); }
            else { ctx.moveTo(0, t); ctx.lineTo(W, t + (random() - 0.5) * 3); }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    // Dirt along the long edges, where the lawn meets it.
    if (o.edges) {
        ctx.globalAlpha = 0.18;
        const band = ppm * 0.06;
        ctx.fillStyle = rgb(o.base, 0.68);
        if (o.along === 'x') { ctx.fillRect(0, 0, W, band); ctx.fillRect(0, H - band, W, band); }
        else { ctx.fillRect(0, 0, band, H); ctx.fillRect(W - band, 0, band, H); }
        ctx.globalAlpha = 1;
    }
    // Cracks: dark hairlines with a pale lip beside them.
    const order = slabs.map((s, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    const cracked = order.slice(0, o.cracks || 0).map((i) => slabs[i]);
    for (const s of cracked) {
        for (const line of slabCracks(random, s, 1)) {
            stroke(ctx, line.map(([x, y]) => [x + 0.004, y + 0.004]), ppm, rgb(o.base, 1.12), 1.2);
            stroke(ctx, line, ppm, rgb(o.base, 0.5), 1);
        }
    }
    // The tooled joints between slabs: a dark groove and a lit edge.
    const joint = (x0, y0, x1, y1) => {
        stroke(ctx, [[x0, y0], [x1, y1]], ppm, rgb(o.base, 0.55), Math.max(1.5, ppm * 0.012));
        stroke(ctx, [[x0 + 0.008, y0 + 0.008], [x1 + 0.008, y1 + 0.008]], ppm, rgb(o.base, 1.1), 1);
    };
    for (const s of slabs) {
        if (s.minX > 1e-6) joint(s.minX, s.minY, s.minX, s.maxY);
        if (s.minY > 1e-6) joint(s.minX, s.minY, s.maxX, s.minY);
    }
    // And at the picture's own edge, so a repeating picture has a joint
    // where it wraps.
    if (o.wrapJoint) {
        if (o.along === 'x' || o.grid) joint(0.001, 0, 0.001, o.h);
        if (o.along !== 'x' || o.grid) joint(0, 0.001, o.w, 0.001);
    }
    const texture = textureOf(c.canvas, o.repeat !== false);
    cache.set(key, texture);
    return texture;
}

/** Asphalt, a picture `w` meters square at `ppm`, in `base`: aggregate,
 *  worn patches, and a sealed crack. Cached by `key`. */
export function asphaltTexture(key, o) {
    if (cache.has(key)) return cache.get(key);
    const ppm = o.ppm;
    const W = Math.round(o.w * ppm);
    const c = canvasOf(W, W);
    if (!c) return null;
    const { ctx } = c;
    const random = makeRandom(o.seed || 1);
    ctx.fillStyle = rgb(o.base);
    ctx.fillRect(0, 0, W, W);
    blotches(ctx, random, W, W, o.base, Math.round(o.w * o.w * 1.2), ppm * 0.9, 0.12);
    speckle(ctx, random, W, W, o.base, 0.12, 0.45, 1.1);
    // A few pale stones of the aggregate showing through.
    speckle(ctx, random, W, W, 0x9a968e, 0.006, 0.15, 1.2);
    // A sealed crack: a wandering band of glossier, darker sealant.
    const bounds = { minX: 0.1, maxX: o.w - 0.1, minY: 0.1, maxY: o.w - 0.1 };
    for (let k = 0; k < (o.snakes ?? 1); k++) {
        const line = crackPath(random, 0.2 + random() * (o.w - 0.4), 0.15, o.w * 0.9, Math.PI / 2 + (random() - 0.5) * 0.6, bounds, 0.35, 0.08);
        stroke(ctx, line, ppm, rgb(o.base, 0.6), Math.max(2, ppm * 0.03));
    }
    const texture = textureOf(c.canvas);
    cache.set(key, texture);
    return texture;
}

/** The paving pictures the yard and the houses use, and how many meters
 *  each covers before it repeats ({ map, tileX, tileZ }). `look` is
 *  config.look and `mobile` halves the detail. Null maps without a canvas. */
export function paving(look, mobile = false) {
    const k = mobile ? 0.5 : 1;
    return {
        // Eight sidewalk slabs, 1.6 m each, before it repeats.
        sidewalk: {
            map: concreteTexture(`sidewalk${k}`, { w: 12.8, h: 1.6, ppm: 160 * k, base: look.sidewalk, along: 'x', slab: 1.6, cracks: 3, broom: true, edges: true, wrapJoint: true, seed: 71 }),
            tileX: 12.8,
            tileZ: 1.6
        },
        // The walk to the porch, painted whole: its own slabs and a crack or two.
        walk: (len) => ({
            map: concreteTexture(`walk${k}:${len.toFixed(2)}`, { w: 1.1, h: len, ppm: 128 * k, base: look.walk, along: 'y', slab: len / Math.max(1, Math.round(len / 1.2)), cracks: 2, broom: true, edges: true, seed: 83, repeat: false }),
            tileX: 1.1,
            tileZ: len
        }),
        // A driveway, a slab 3.6 m square at a time.
        drive: {
            map: concreteTexture(`drive${k}`, { w: 3.6, h: 3.6, ppm: 96 * k, base: look.walk, along: 'y', slab: 3.6, cracks: 1, broom: true, wrapJoint: true, seed: 97 }),
            tileX: 3.6,
            tileZ: 3.6
        },
        // The porch: smooth large pavers, 0.9 m, tight joints.
        porch: {
            map: concreteTexture(`porch${k}`, { w: 1.8, h: 1.8, ppm: 128 * k, base: look.porch, grid: 0.9, cracks: 0, speckle: 0.025, slabShade: 0.025, wrapJoint: true, seed: 59 }),
            tileX: 1.8,
            tileZ: 1.8
        },
        // The street, 12 m square before it repeats, so its one sealed
        // crack does not read as a grid.
        street: {
            map: asphaltTexture(`street${k}`, { w: 12, ppm: 64 * k, base: look.street, snakes: 1, seed: 113 }),
            tileX: 12,
            tileZ: 12
        }
    };
}
