// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * backdrops.js - painted backdrops (specs/meme TASKS M8, Steve 2026-10-28):
 * a box's back wall, and its floor, painted where a plain color would not
 * carry the meme. Always Has Been showed the way: a backdrop that is only a
 * stage flat, a little amateur, is half the joke.
 *
 * PAINTED AS PIXELS, NOT FETCHED AND NOT DRAWN ON A CANVAS. Each painter
 * fills an RGBA array, row 0 at the bottom (a texture's v = 0, the floor
 * end of a wall, the open end of a floor), so nothing downloads, the page's
 * policy needs nothing new, the preview renderer reads it as the browser
 * does, and the suite measures it without a DOM. Each is painted once a
 * visit and shared by every panel that names it (`paintTexture`).
 *
 * A cell names `paint: { wall, floor }` (ids of PAINTS), and each painter
 * takes that surface's own color as its base (the cell's `backdrop` for the
 * wall, its `floor` for the floor), so a template retunes a painted wall by
 * its color alone. Generic (PRD section 7): a street is a street.
 */

/**
 * The painters' measures. `size` is the texture's side in pixels (a soft
 * wall needs few, the city's windows more). Lengths are meters on the
 * surface, shares are of its width or height.
 *
 *   city      a block across the street, the sky the base color: five
 *             facades (`buildings`, left to right, widths in meters summing
 *             to the wall's), a shopfront on each (`shop`: the window, the
 *             door, an awning in `awnings`), rows of windows above
 *             (`floors`), all hazed toward the sky by `haze` and softened
 *             by a `blur` of pixels, as a photo's background is
 *   sidewalk  slabs `slab` meters square with dark joints `joint` wide
 *   storm     dark clouds (value noise, `scale` across, `octaves`) and a
 *             pool of `light` behind the handshake, the corners darker by
 *             `vignette`
 *   wash      a soft gradient, lighter round `at` (shares) and darker
 *             toward the edges
 *   soot      the base below and `color` creeping down from the top past
 *             `line` (a share of the height), its edge ragged
 */
export const PAINTS = Object.freeze({
    city: Object.freeze({
        size: 512,
        buildings: Object.freeze([
            Object.freeze({ w: 0.46, h: 1.86, color: '#C98B6B' }),
            Object.freeze({ w: 0.58, h: 2.45, color: '#E3D3B5' }),
            Object.freeze({ w: 0.40, h: 1.70, color: '#9FB3A0' }),
            Object.freeze({ w: 0.52, h: 2.10, color: '#B86F58' }),
            Object.freeze({ w: 0.44, h: 1.92, color: '#D9B46A' })
        ]),
        awnings: Object.freeze(['#A8463C', '#3F6B5A', '#2F4A6D', '#B8862E', '#7A4B6E']),
        shop: Object.freeze({ glass: Object.freeze([0.06, 0.44]), door: 0.11, awning: Object.freeze([0.47, 0.58]), stripe: 0.035 }),
        floors: Object.freeze({ from: 0.76, every: 0.33, window: Object.freeze([0.085, 0.15]), pitch: 0.16, top: 0.14 }),
        glass: '#36404B',
        haze: 0.1,
        blur: 1
    }),
    sidewalk: Object.freeze({ size: 256, slab: 0.6, joint: 0.012 }),
    storm: Object.freeze({
        size: 256, scale: 3.4, octaves: 5, vignette: 0.35,
        // Where The Handshake's camera sees the clasp on the wall
        // (scenes/handshake.js lays its glow there; the suite holds the two
        // together).
        light: Object.freeze({ at: Object.freeze([0.42, 0.55]), radius: 0.42, color: '#E2D5BA', strength: 0.9 })
    }),
    wash: Object.freeze({ size: 256, at: Object.freeze([0.5, 0.62]), light: 0.3, dark: 0.2 }),
    soot: Object.freeze({ size: 256, color: '#2A2320', line: 0.66, depth: 0.88, scale: 4, octaves: 4 })
});

export const PAINT_IDS = Object.freeze(Object.keys(PAINTS));

/** '#rrggbb' as [r, g, b], 0 to 255. */
export function rgb(hex) {
    const n = parseInt(String(hex).slice(1), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
};
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/** A seeded roll, so a painting is the same every visit. */
function rng(seed) {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

/** Smooth value noise on a wrapping lattice, 0 to 1. */
function valueNoise(seed, n = 64) {
    const roll = rng(seed);
    const table = new Float32Array(n * n);
    for (let i = 0; i < table.length; i++) table[i] = roll();
    const at = (i, j) => table[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    return (x, y) => {
        const i = Math.floor(x);
        const j = Math.floor(y);
        const fx = x - i;
        const fy = y - j;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i, j + 1);
        const d = at(i + 1, j + 1);
        return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
}

/** Octaves of `noise` summed, each half the last, 0 to 1. */
function fbm(noise, x, y, octaves) {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let total = 0;
    for (let k = 0; k < octaves; k++) {
        sum += amp * noise(x * f, y * f);
        total += amp;
        amp *= 0.5;
        f *= 2;
    }
    return sum / total;
}

/** A `size` square RGBA picture, row 0 at the bottom, every pixel opaque,
 *  drawn through `fn(u, v)` (shares, 0 to 1, at the pixel's middle)
 *  returning [r, g, b]. */
function fill(size, fn) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const c = fn((x + 0.5) / size, (y + 0.5) / size);
            const o = (y * size + x) * 4;
            data[o] = Math.round(Math.min(255, Math.max(0, c[0])));
            data[o + 1] = Math.round(Math.min(255, Math.max(0, c[1])));
            data[o + 2] = Math.round(Math.min(255, Math.max(0, c[2])));
            data[o + 3] = 255;
        }
    }
    return { width: size, height: size, data };
}

/** A box blur of `r` pixels over a picture's color, twice (near enough a
 *  soft focus), in place. */
function blur(pic, r) {
    if (!(r > 0)) return pic;
    const { width: w, height: h, data } = pic;
    const tmp = new Float32Array(w * h * 3);
    const pass = (horizontal) => {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const sum = [0, 0, 0];
                let n = 0;
                for (let k = -r; k <= r; k++) {
                    const xx = horizontal ? Math.min(w - 1, Math.max(0, x + k)) : x;
                    const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + k));
                    const o = (yy * w + xx) * 4;
                    sum[0] += data[o];
                    sum[1] += data[o + 1];
                    sum[2] += data[o + 2];
                    n++;
                }
                const t = (y * w + x) * 3;
                tmp[t] = sum[0] / n;
                tmp[t + 1] = sum[1] / n;
                tmp[t + 2] = sum[2] / n;
            }
        }
        for (let i = 0; i < w * h; i++) {
            data[i * 4] = Math.round(tmp[i * 3]);
            data[i * 4 + 1] = Math.round(tmp[i * 3 + 1]);
            data[i * 4 + 2] = Math.round(tmp[i * 3 + 2]);
        }
    };
    for (let k = 0; k < 2; k++) {
        pass(true);
        pass(false);
    }
    return pic;
}

/**
 * The city block on a wall `dims` meters ({ width, height }), the sky in
 * `base`: what stands at each point, a facade, its windows, its shop, or
 * the sky above the rooflines. Pure.
 */
function city(base, size, dims) {
    const C = PAINTS.city;
    const sky = rgb(base);
    const skyLow = mix(sky, WHITE, 0.45);
    const glass = rgb(C.glass);
    // Where each facade starts, scaled so they span the wall.
    const total = C.buildings.reduce((n, b) => n + b.w, 0);
    let edge = 0;
    const blocks = C.buildings.map((b, i) => {
        const w = (b.w / total) * dims.width;
        const block = { ...b, x0: edge, x1: edge + w, i, color: rgb(b.color), awning: rgb(C.awnings[i % C.awnings.length]) };
        edge += w;
        return block;
    });
    const F = C.floors;
    const S = C.shop;
    /** The color at a point of a facade, `x` and `y` meters from its
     *  bottom left. */
    const facade = (b, x, y) => {
        const w = b.x1 - b.x0;
        const wall = mix(b.color, BLACK, 0.12 * (1 - y / b.h));
        // The parting line between neighbors, and the cornice.
        if (x < 0.006) return mix(b.color, BLACK, 0.45);
        if (y > b.h - 0.05) return mix(b.color, BLACK, 0.28);
        if (y > b.h - 0.065) return mix(b.color, WHITE, 0.25);
        // The shop: an awning in stripes, the window under it, the door at
        // one end (alternating by building).
        if (y >= S.awning[0] && y < S.awning[1]) {
            const stripe = Math.floor(x / S.stripe) % 2 === 0;
            const shade = (y - S.awning[0]) / (S.awning[1] - S.awning[0]);
            return mix(stripe ? b.awning : mix(b.awning, WHITE, 0.7), BLACK, 0.18 * (1 - shade));
        }
        const doorLeft = b.i % 2 === 0;
        const inDoor = doorLeft ? x > 0.04 && x < 0.04 + S.door : x > w - 0.04 - S.door && x < w - 0.04;
        if (inDoor && y < S.awning[0] - 0.02) return mix(b.color, BLACK, 0.62);
        const inGlass = (doorLeft ? x > 0.08 + S.door : x > 0.04) && (doorLeft ? x < w - 0.04 : x < w - 0.08 - S.door);
        if (inGlass && y > S.glass[0] && y < S.glass[1]) return mix(glass, sky, 0.25 + 0.3 * ((y - S.glass[0]) / (S.glass[1] - S.glass[0])));
        // The rows of windows: as many as fit under the cornice, as many
        // columns as fit across at the pitch, centered.
        const cols = Math.max(1, Math.round((w - 0.1) / F.pitch));
        const pitch = (w - 0.1) / cols;
        for (let row = F.from; row + F.window[1] < b.h - F.top; row += F.every) {
            if (y < row - 0.014 || y > row + F.window[1]) continue;
            const k = Math.floor((x - 0.05) / pitch);
            if (k < 0 || k >= cols) break;
            const mid = 0.05 + (k + 0.5) * pitch;
            if (Math.abs(x - mid) > F.window[0] / 2 + 0.008) break;
            // The sill under the window, a little proud of it.
            if (y < row) return mix(b.color, WHITE, 0.35);
            if (Math.abs(x - mid) > F.window[0] / 2) break;
            // Dark glass, catching a little sky toward its top: dark
            // enough to read against the brick as well as the cream.
            return mix(glass, sky, 0.1 + 0.25 * ((y - row) / F.window[1]));
        }
        return wall;
    };
    const pic = fill(size, (u, v) => {
        const x = u * dims.width;
        const y = v * dims.height;
        const b = blocks.find((k) => x >= k.x0 && x < k.x1) || blocks[blocks.length - 1];
        const at = y < b.h ? facade(b, x - b.x0, y) : mix(skyLow, sky, smooth(1.5, dims.height, y));
        // A city across the street is a little hazed toward its sky.
        return mix(at, skyLow, C.haze);
    });
    return blur(pic, C.blur);
}

/** Sidewalk slabs on a floor `dims` meters, in `base`, a little uneven. */
function sidewalk(base, size, dims) {
    const S = PAINTS.sidewalk;
    const c = rgb(base);
    const noise = valueNoise(5);
    return fill(size, (u, v) => {
        const x = u * dims.width;
        const z = v * dims.height;
        const sx = x / S.slab;
        const sz = z / S.slab;
        const joint = (sx - Math.floor(sx)) * S.slab < S.joint || (sz - Math.floor(sz)) * S.slab < S.joint;
        if (joint) return mix(c, BLACK, 0.28);
        // Each slab a shade of its own, and a fine grain.
        const tint = (noise(Math.floor(sx) * 7.3, Math.floor(sz) * 7.3) - 0.5) * 0.08;
        const grain = (noise(u * 60, v * 60) - 0.5) * 0.06;
        return mix(c, tint + grain > 0 ? WHITE : BLACK, Math.abs(tint + grain));
    });
}

/** Dark clouds in `base` with a pool of light behind the handshake. */
function storm(base, size) {
    const S = PAINTS.storm;
    const c = rgb(base);
    const low = mix(c, BLACK, 0.4);
    const high = mix(c, WHITE, 0.22);
    const light = rgb(S.light.color);
    const noise = valueNoise(13);
    return fill(size, (u, v) => {
        const n = fbm(noise, u * S.scale, v * S.scale, S.octaves);
        const billow = smooth(0.3, 0.72, n);
        let out = mix(low, high, billow);
        const d = Math.hypot(u - S.light.at[0], v - S.light.at[1]) / S.light.radius;
        const pool = (1 - smooth(0, 1, d)) * S.light.strength;
        out = mix(out, light, pool * (0.5 + 0.5 * billow));
        const e = Math.hypot(u - 0.5, v - 0.5) / 0.7;
        return mix(out, BLACK, S.vignette * smooth(0.45, 1, e));
    });
}

/** A soft gradient of `base`, lighter round `at`, darker to the edges. */
function wash(base, size) {
    const W = PAINTS.wash;
    const c = rgb(base);
    const inner = mix(c, WHITE, W.light);
    const outer = mix(c, BLACK, W.dark);
    const roll = rng(17);
    return fill(size, (u, v) => {
        const d = Math.hypot(u - W.at[0], (v - W.at[1]) * 1.15);
        const out = mix(inner, outer, smooth(0.05, 0.85, d));
        // A whisper of dither, so the long gradient never bands.
        const n = (roll() - 0.5) * 2;
        return [out[0] + n, out[1] + n, out[2] + n];
    });
}

/** `base` below and soot creeping down from the top, its edge ragged. */
function soot(base, size) {
    const S = PAINTS.soot;
    const c = rgb(base);
    const dark = rgb(S.color);
    const noise = valueNoise(21);
    return fill(size, (u, v) => {
        const n = fbm(noise, u * S.scale, v * S.scale, S.octaves);
        const line = S.line + (n - 0.5) * 0.24;
        return mix(c, dark, S.depth * smooth(line - 0.1, line + 0.24, v));
    });
}

const PAINTERS = Object.freeze({ city, sidewalk, storm, wash, soot });

/** [r, g, b] (0 to 255) with its HSL lightness held to `cap` at most. */
function capLightness([r, g, b], cap) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (l <= cap) return [r, g, b];
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) {
        if (max === R) h = ((G - B) / d) % 6;
        else if (max === G) h = (B - R) / d + 2;
        else h = (R - G) / d + 4;
    }
    h = (h * 60 + 360) % 360;
    const c = (1 - Math.abs(2 * cap - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = cap - c / 2;
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/**
 * The color a row of a tinted template wears (Galaxy Brain's background,
 * Steve M8): the visitor's pick `hex`, darkened if need be to `cap`
 * lightness so the deepest row stays dark enough for an additive glow to
 * bloom on it, `share` of the way from `paper` to it (0 the paper, 1 the
 * deep color). '#rrggbb'. Pure.
 */
export function tintOf(hex, share, { paper = '#F4F1EA', cap = 0.42 } = {}) {
    const deep = capLightness(rgb(hex), cap);
    const c = mix(rgb(paper), deep, clamp01(share));
    return `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The picture painter `id` makes on a surface `dims` meters ({ width,
 * height }) in `base` ('#rrggbb'), `size` pixels square (the painter's own
 * unless given): `{ width, height, data }`, RGBA, row 0 at the bottom.
 * Null for an id that is not a painter. Pure.
 */
export function paintPixels(id, base, dims = { width: 1, height: 1 }, size = undefined) {
    const painter = Object.prototype.hasOwnProperty.call(PAINTERS, id) ? PAINTERS[id] : null;
    if (!painter) return null;
    return painter(base, size || PAINTS[id].size, dims);
}

const textures = new Map();
let haloMap = null;

/** The halo's soft disc (Galaxy Brain's glow, The Handshake's), drawn in
 *  code once a visit as a data texture (no picture file ships, and the
 *  preview rasterizer can read it): white, its alpha fading from the
 *  middle to the rim. */
export function haloTexture(n = 64) {
    if (haloMap) return haloMap;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const r = Math.hypot(((x + 0.5) / n) * 2 - 1, ((y + 0.5) / n) * 2 - 1);
            const k = Math.max(0, Math.min(1, 1 - r));
            const a = k * k * (3 - 2 * k);
            const o = (y * n + x) * 4;
            data[o] = 255;
            data[o + 1] = 255;
            data[o + 2] = 255;
            data[o + 3] = Math.round(255 * a);
        }
    }
    haloMap = new THREE.DataTexture(data, n, n);
    haloMap.needsUpdate = true;
    return haloMap;
}

/**
 * Painter `id`'s picture in `base` on a surface `dims` meters as a texture,
 * painted once a visit and shared by every panel that asks for the same.
 * Null for an id that is not a painter.
 */
export function paintTexture(id, base, dims) {
    const key = `${id}|${base}|${dims.width}x${dims.height}`;
    if (textures.has(key)) return textures.get(key);
    const pic = paintPixels(id, base, dims);
    if (!pic) return null;
    const map = new THREE.DataTexture(pic.data, pic.width, pic.height);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    textures.set(key, map);
    return map;
}
