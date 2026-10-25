// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-hair.js - the avatar's hair styles (specs/avatar, Steve's QA of
 * 2026-10-24): a short cut that lies on the head, and the styles a visitor
 * asked for, from a quiff to locs.
 *
 * THE RIG'S SHORT HAIR IS A BOWL: a cap with a hard level rim and a lump at
 * the back, standing off the head ("a cross between a bowl cut and a
 * mullet"). Every style here is built instead from CLOSED SOLIDS lying on the
 * scalp (avatar-shapes): a cap of hair all the way round, thickest on top and
 * thinning to almost nothing at a hairline that follows the head (high at
 * the forehead, above the ears, low at the nape), so no edge can stand off
 * it. Curtains (a bob, a mullet), fins (a mohawk), tubes (tails, braids,
 * locs) and small solids (buns, spikes, curls) are added to it.
 *
 * The rig's own buzz cut and long hair stay (Steve: they look good), and
 * `HAIR_DRAWN` says which styles are drawn here.
 *
 * Built in the head's own coordinates (avatar-figure's head group): the
 * middle of the 0.12 m head at the origin, the face toward +z. A piece a hat
 * would squash (a bun, a spike, a mohawk's fin) is tagged
 * `userData.hatHides`, and avatar-hats tucks it away under a hat.
 *
 * STRANDS (Steve's QA, 2026-10-25: all one color, the hair was "a monochrome
 * blob"): nearly every piece wears a map of strands, a gray picture
 * multiplied into the hair's color, drawn in code the first time a style is
 * built (no image file, nothing fetched, so the page's same-origin policy
 * holds) and kept for the session. The strands follow a FLOW over the head,
 * read at each texel's own point on the piece: down from the crown's whorl
 * on a short cut, away from the part and bending forward on a parted one (so
 * the lines draw the swoosh even where the light is flat), back from the
 * brow on a quiff, in to the tie on hair worn back, and down a tail, a
 * braid or a curtain. The afro, the shaved sides and the fin go without.
 */

import { solidGrid, taperTube, onSphere } from './avatar-shapes-1.0.0.min.js';

/** The styles drawn here. The rest (none, buzzed, long) are the rig's. */
export const HAIR_DRAWN = Object.freeze([
    'short', 'leftPart', 'rightPart', 'centerPart', 'quiff', 'spiky', 'curly', 'afro', 'mohawk', 'mullet', 'ponytail', 'pigtails',
    'topKnot', 'lowBun', 'spaceBuns', 'bob', 'braids', 'locs', 'cornrows'
]);

/** The skin a part shows when none is given. */
export const DEFAULT_SKIN = 0xd9a37a;

/** Where the hair's inner surface lies: just outside the 0.12 m head. */
export const SCALP = 0.1204;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const norm3 = ([x, y, z]) => {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
};
const smoothstep = (x) => {
    const t = clamp01(x);
    return t * t * (3 - 2 * t);
};

/** `points` ([x, y] pairs, x rising) read at `x`, straight between them and
 *  flat past the ends. */
export function along(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i];
        if (x <= x1) {
            const [x0, y0] = points[i - 1];
            return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        }
    }
    return points[points.length - 1][1];
}

/**
 * The hairlines and the volumes. An `edge` is [angle round from the front,
 * radians down from the crown] points: where the hair ends at each side of
 * the head. A `volume` is how thick the hair is toward the `front`, the
 * `side`s and the `back`, plus `crown` more on top; it thins to `min` over
 * the last `fade` of the way to the edge.
 */
export const HAIR_SIZE = Object.freeze({
    edges: {
        // Above the brows, back past the temples, over the tops of the ears,
        // down the back to the nape.
        short: [[0, 1.06], [0.45, 1.12], [0.9, 1.3], [1.35, 1.45], [1.9, 1.58], [2.5, 1.8], [Math.PI, 1.92]],
        quiff: [[0, 1.0], [0.45, 1.1], [0.9, 1.3], [1.35, 1.45], [1.9, 1.58], [2.5, 1.8], [Math.PI, 1.92]],
        sleek: [[0, 1.05], [0.5, 1.12], [0.9, 1.32], [1.4, 1.5], [2.0, 1.7], [Math.PI, 1.95]],
        afro: [[0, 1.0], [0.6, 1.1], [1.2, 1.4], [1.6, 1.6], [2.4, 1.85], [Math.PI, 1.95]],
        bob: [[0, 1.08], [0.5, 1.15], [0.9, 1.35], [1.4, 1.55], [Math.PI, 1.62]]
    },
    volumes: {
        short: { front: 0.0065, side: 0.0045, back: 0.0055, crown: 0.004, fade: 0.3, min: 0.0006 },
        sleek: { front: 0.0035, side: 0.0035, back: 0.004, crown: 0.002, fade: 0.25, min: 0.0006 },
        shaved: { front: 0.0013, side: 0.0013, back: 0.0013, crown: 0, fade: 0.15, min: 0.0005 },
        afro: { front: 0.03, side: 0.04, back: 0.045, crown: 0.02, fade: 0.45, min: 0.001, texture: 0.06 },
        /** Curls (Steve's QA, 2026-10-24: balls on a short cut "just looks
         *  like a bunch of spheres"): one full cap, its surface lumpy with
         *  curl-sized bumps (`curl` deep, two octaves), full to near the
         *  hairline. */
        curly: { front: 0.022, side: 0.024, back: 0.027, crown: 0.012, fade: 0.3, min: 0.001, curl: 0.3 },
        // Full at the sides, so the curtain grows out of it with no step
        // (preview, 2026-10-24: a thin cap over a thick curtain read as
        // headphones).
        bob: { front: 0.012, side: 0.011, back: 0.012, crown: 0.004, fade: 0.06, min: 0.009 },
        locs: { front: 0.006, side: 0.006, back: 0.007, crown: 0.003, fade: 0.25, min: 0.0008 },
        cornrows: { front: 0.0018, side: 0.0018, back: 0.0018, crown: 0, fade: 0.2, min: 0.0006 }
    },
    /** The quiff (Steve's QA, 2026-10-24: a smooth bulge "doesn't look
     *  right", and a crest set back "needs to come forward more, it's
     *  still too close to the middle of the head"): the front swept up and
     *  out over the forehead into a crest `height` tall, rising from the
     *  hairline over `rise` radians to its top `peak` radians forward of
     *  the crown (the hairline is at 1.0), then sweeping back over `fall`;
     *  `spread` radians wide; lifted along `lean` (up and well forward), not
     *  out from the head, so its front leans out over the brow. Its own
     *  piece, so a hat can squash it. */
    quiff: { height: 0.055, peak: 0.97, rise: 0.06, fall: 0.5, spread: 0.8, lean: [0, 1, 0.9], ripple: 0.1 },
    /** A part (Steve's QA, 2026-10-24): a line of scalp showing through the
     *  short cut, `x` meters to the wearer's left of the middle (+x; a right
     *  part is to the right), from the front hairline back over the top to
     *  `back` radians behind the crown. The hair thins to `depth` of itself
     *  across `width` either side of it, and the scalp shows as a `line`
     *  thick strand in the skin's color along the bottom (the grid is too
     *  coarse to cut a 9 mm groove cleanly, so the line is drawn as well).
     *  Either side of it the hair comes up out of the part in ONE SWOOSH
     *  with volume (Steve's QA, 2026-10-24: lobes 6 mm high read as a bald
     *  line down the head; rolls with repeating swells "look really bad":
     *  "there's usually like a swoosh with volume coming up from the
     *  part"): rising steeply out of the groove to a crest `crest` widths
     *  from the part, `lift` high, then falling away gently over `tail`
     *  widths, and leaning over away from the part by `lean` of its
     *  height. A side part's `heavy` side (the far one, where the hair is
     *  swept to) is the big swoosh, its `light` side a small one; a center
     *  part has `center` on both. The swooshes are their own piece on the
     *  cut, so a hat can squash them. */
    // Steve, 2026-10-24, two rounds: a narrower part, more swoosh, the side
    // parts further out from the middle, and the swoosh coming forward
    // over the forehead: toward the hairline its lift turns from out of
    // the head to `forward` (up and out over the brow), full to within
    // `edge` of the hairline.
    parts: { leftPart: 0.058, rightPart: -0.058, centerPart: 0 },
    // Steve, 2026-10-25 ("still don't look very swooshy"): the swoosh was
    // gated by the GROOVE's run, nothing at the crown and full only at the
    // hairline, where the hairline fade and the forward turn took over, so
    // over the top of the head it never showed. It now runs over the whole
    // top: full from `wave.back` radians behind the crown forward, out to
    // `wave.temple` radians round at the sides, and fullest toward the
    // front (`wave.swoop` of it over the crown, all of it over the brow),
    // where a side part swoops. With the whole top carrying it, the lifts
    // came down from 40/16/26 mm.
    part: {
        width: 0.0045, depth: 0.8, back: 0, fade: 0.9, line: 0.001, grid: [144, 24], edge: 0.86, lean: 0.35, forward: [0, 1, 0.9], turn: 0.5,
        wave: {
            back: -0.5, fade: 0.6, temple: 1.15, swoop: 0.55,
            heavy: { lift: 0.03, crest: 4.5, tail: 12 }, light: { lift: 0.012, crest: 3.2, tail: 6 }, center: { lift: 0.02, crest: 3.7, tail: 8 }
        }
    },
    spikes: { count: 26, height: 0.028, radius: 0.0095, reach: 0.78 },
    curls: { grid: [144, 36] },
    /** A fin in the head's middle plane, `front` radians forward of the
     *  crown (the hairline) back over the top to `back` (the nape). */
    mohawk: { front: 0.95, back: -1.95, height: 0.05, width: 0.014 },
    mullet: { half: 0.95, top: -0.025, bottom: -0.175, inner: 0.112, thick: 0.014, flip: 0.012 },
    ponytail: { tie: [0, -0.03, -0.122], tail: [[0, -0.028, -0.118], [0, -0.045, -0.145], [0, -0.09, -0.165], [0, -0.15, -0.16], [0, -0.2, -0.145]], radius: 0.02 },
    // Hanging down behind the ears, full at the tie (preview, 2026-10-24:
    // thin and out at the sides, they read as antennae).
    pigtails: { tie: [0.1, -0.012, -0.056], tail: [[0.104, -0.012, -0.06], [0.122, -0.04, -0.062], [0.128, -0.09, -0.05], [0.122, -0.15, -0.035]], radius: 0.021 },
    buns: { topKnot: [[Math.PI, 0.45, 0.032]], lowBun: [[Math.PI, 1.35, 0.028]], spaceBuns: [[0.95, 0.62, 0.027], [-0.95, 0.62, 0.027]] },
    bob: { from: 0.72, top: 0.02, bottom: -0.085, inner: 0.1205, flare: 0.008, thick: 0.011 },
    braids: { start: [0.095, -0.035, -0.07], path: [[0.095, -0.035, -0.07], [0.125, -0.08, -0.03], [0.13, -0.15, 0.02], [0.122, -0.22, 0.045]], plaits: 10, radius: 0.016 },
    // Many and full, close to the head (preview, 2026-10-24: eighteen thin
    // ones read as a bead curtain).
    locs: { count: 30, from: 0.9, length: 0.15, radius: 0.0115 },
    /** Rows `rows` meters either side of the middle, from `front` (radians
     *  forward of the crown, at the hairline) back over the top to `back`
     *  (behind it, at the nape). */
    cornrows: { rows: [-0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075], front: 1.0, back: -1.95, radius: 0.0048, lift: 0.1232 },
    /** How much darker a hair tie is than the hair. */
    tie: 0.55
});

/**
 * The strands (see the header). `around` strands round the head (about
 * 5 mm apart on the 0.12 head, so they read as lines at the editor's zoom
 * and blend to a texture at a distance), `depth` how dark the gap between
 * two strands gets (of the hair's color), `mean` the map's shade where the
 * strands fade (at a whorl, along a part), `sheen` a soft shine along each
 * strand. A parted cut's strands bend forward `sweep` radians a meter out
 * from the part (growing as they go), starting `partFade` from it; every flow
 * fades within `whorl` radians of its pole, where all its strands meet.
 * `tube` strands round a tail. Maps are `size`d by the piece they cover
 * (texels across and down).
 */
export const STRANDS = Object.freeze({
    around: 150, depth: 0.42, mean: 0.84, sheen: 0.06, sweep: 8, partFade: 0.006, whorl: 0.3, tube: 7, roughness: 0.75,
    crown: [0, 1, -0.35], brow: [0, 0.3, 1],
    size: { scalp: [1024, 160], patch: [512, 128], curtain: [512, 64], tube: [64, 128] }
});

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A number in [0, 1) that jumps about with `n`, the same every time. */
function hash(n) {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
}

/**
 * The shade (0 to 1) of a strand map at across-coordinate `k` (in strands:
 * each whole number is a strand), `along` the strands (a unit is about
 * 2 cm), with the pattern `fade`d toward the map's mean (0 none of it, 1 all
 * of it), for a flow of `period` strands round. Each strand is a shade of
 * its own, with a darker gap along one side, wobbling a little as it goes
 * and shining along it.
 */
export function strandShade(k, along, fade, period) {
    const S = STRANDS;
    // The wobble repeats round the flow's period, so a wrapped map meets
    // itself at its seam.
    const w1 = (2 * Math.PI * Math.max(1, Math.round(period * 0.27))) / period;
    const w2 = (2 * Math.PI * Math.max(1, Math.round(period * 0.14))) / period;
    const kk = k + 0.22 * Math.sin(along * 1.45 + w1 * k) + 0.12 * Math.sin(along * 3.6 - w2 * k);
    const n = Math.floor(kk);
    const f = kk - n;
    const h = hash(n);
    const gap = 0.14 + 0.16 * hash(n + 0.37);
    const seam = Math.max(1 - smoothstep(f / gap), 1 - smoothstep((1 - f) / 0.08));
    const bright = 0.84 + 0.16 * h;
    const sheen = 1 - S.sheen * Math.sin(along * 2.05 + h * 6.28) ** 2;
    const value = bright * sheen * (1 - S.depth * seam);
    return clamp01(S.mean + (value - S.mean) * fade);
}

/**
 * A flow of strands falling away from `pole` (a direction from the head's
 * middle) all the way round: a strand is a line of constant angle round the
 * pole, so they meet at it (a whorl, a tie) and fade out within
 * STRANDS.whorl of it.
 */
export function fallFrom(pole) {
    const p = norm3(pole);
    const e1 = norm3(cross3(p, Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]));
    const e2 = cross3(p, e1);
    return (point) => {
        const d = norm3(point);
        const k = ((Math.atan2(dot3(d, e2), dot3(d, e1)) + Math.PI) / (2 * Math.PI)) * STRANDS.around;
        const from = Math.acos(Math.min(1, Math.max(-1, dot3(d, p))));
        return { k, along: from * 6, fade: smoothstep(from / STRANDS.whorl), period: STRANDS.around };
    };
}

/**
 * A parted cut's flow: the strands come straight up out of the part (the
 * plane `px` from the middle) either side, run over the head away from it,
 * and bend forward toward the brow more the farther they get
 * (STRANDS.sweep), as a side-swept cut does (Steve, 2026-10-24: "the
 * swoosh should come forward over the forehead too"). They are lines of
 * constant angle forward of the crown, round the ear-to-ear axis, so they
 * cross the part square on.
 */
export function awayFromPart(px) {
    return ([x, y, z]) => {
        const d = Math.abs(x - px);
        const psi = Math.atan2(z, y) - (STRANDS.sweep * d * d) / 0.06;
        const k = ((psi + Math.PI) / (2 * Math.PI)) * STRANDS.around;
        return { k, along: d * 50, fade: smoothstep(d / STRANDS.partFade), period: STRANDS.around };
    };
}

/** A flow straight down a piece's own uv: `n` strands across (u), running
 *  along v (a tail, a curtain, a spike). */
export function alongV(n) {
    return (point, u, v) => ({ k: u * n, along: v * 8, fade: 1, period: n });
}

const MAPS = new Map();

/**
 * The map of strands for a piece, `width` by `height` texels: each texel's
 * shade is the `flow` read at `at(u, v)` (the piece's own point for that
 * texel, or null for a flow that reads the uv itself). Built once per `key`
 * and kept: the maps are gray and the same for every color, and a visitor
 * rebuilds the figure at every click in the editor.
 */
export function strandMap(key, at, flow, [width, height], { repeat = true } = {}) {
    if (MAPS.has(key)) return MAPS.get(key);
    const data = new Uint8Array(width * height * 4);
    for (let j = 0; j < height; j++) {
        const v = (j + 0.5) / height;
        for (let i = 0; i < width; i++) {
            const u = (i + 0.5) / width;
            const { k, along, fade, period } = flow(at ? at(u, v) : null, u, v);
            const g = Math.round(255 * strandShade(k, along, fade, period));
            const o = (j * width + i) * 4;
            data[o] = g;
            data[o + 1] = g;
            data[o + 2] = g;
            data[o + 3] = 255;
        }
    }
    const texture = new THREE.DataTexture(data, width, height);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    MAPS.set(key, texture);
    return texture;
}

/** The point on the scalp a cap's texel (u, v) covers (see `scalp`). */
const onScalp = (edge) => (u, v) => {
    const a = -Math.PI + 2 * Math.PI * u;
    return onSphere(SCALP, a, along(edge, Math.abs(a)) * v);
};

/** A volume (HAIR_SIZE.volumes) as a thickness at `a` round and `s` of the
 *  way from the crown to the edge. */
function thickness(v) {
    return (a, s) => {
        const front = Math.max(0, Math.cos(a)) ** 2;
        const back = Math.max(0, -Math.cos(a)) ** 2;
        const side = Math.sin(a) ** 2;
        // At the crown every direction is the same direction: the volume
        // there is the average, so the cap's columns all meet at one point
        // (a direction's own volume at the crown left slivers up the middle,
        // found by the closed-solid test, 2026-10-24).
        const even = (v.front + v.back + 2 * v.side) / 4;
        const toward = even + (v.front * front + v.back * back + v.side * side - even) * smoothstep(s / 0.3);
        const fall = 1 - smoothstep((s - (1 - v.fade)) / v.fade);
        let texture = v.texture ? 1 + v.texture * Math.sin(9 * a) * Math.sin(11 * s * Math.PI) : 1;
        if (v.curl) {
            // Lumps about a curl across, two sizes, offset so they never
            // line up in rows; smooth at the crown, where the columns meet.
            const bump = 0.6 * Math.sin(16 * a + 1.3 + 2 * s) * Math.sin(9 * Math.PI * s + 0.4) + 0.4 * Math.sin(27 * a + 2.9 - 3 * s) * Math.cos(14 * Math.PI * s);
            // Nothing at the crown itself, where the cap's columns must
            // still meet at one point for the solid to close.
            texture *= 1 + v.curl * bump * smoothstep(s / 0.1);
        }
        return Math.max(v.min, (toward + v.crown * (1 - s) ** 2) * fall * texture);
    };
}

/**
 * A cap of hair on the scalp, all the way round: from the crown down to the
 * `edge` (HAIR_SIZE.edges), `thick(a, s)` thick, closed at its edge.
 */
export function scalp(edge, thick, { nu = 48, nv = 18, r = SCALP } = {}) {
    return solidGrid(nu, nv, (i, j, side) => {
        const a = -Math.PI + (2 * Math.PI * i) / nu;
        const s = j / nv;
        const t = along(edge, Math.abs(a)) * s;
        return onSphere(side ? r + thick(a, s) : r, a, t);
    }, { wrap: true, pole: true });
}

/** Where on the scalp a piece sits: `count` points spread evenly over the
 *  cap down to `reach` of the way to the edge, [a, t] each (a golden-angle
 *  spiral, so they never line up in rows). */
function spread(count, edge, reach) {
    const out = [];
    for (let k = 0; k < count; k++) {
        const s = reach * Math.sqrt((k + 0.5) / count);
        const a = ((k * 2.39996) % (Math.PI * 2)) - Math.PI;
        out.push([a, along(edge, Math.abs(a)) * s]);
    }
    return out;
}

/**
 * A short cut parted `px` to the wearer's left of the middle (HAIR_SIZE.part):
 * the cap's thickness at `a` round and `s` of the way down (the cut with
 * its groove), the wave's height there, and the groove's floor at a point
 * [x, y, z] on the scalp, for the line of scalp along it.
 */
function parted(px) {
    const H = HAIR_SIZE;
    const P = H.part;
    const base = thickness(H.volumes.short);
    const edge = H.edges.short;
    // Where (a, s) is: `d` across from the part, `phi` forward of the crown
    // (positive), and how far along the part is there: full near the
    // hairline, fading out over `fade` to nothing at `back` (preview,
    // 2026-10-24: run on past the crown, or ended short, the groove notched
    // the head's outline seen from behind and above, where the surface
    // just past the outline is nearly flat on).
    const where = (a, s) => {
        const t = along(edge, Math.abs(a)) * s;
        const [x, y, z] = onSphere(SCALP, a, t);
        const phi = Math.atan2(z, y);
        return { d: x - px, phi, run: smoothstep((phi - P.back) / P.fade) };
    };
    const thick = (a, s) => {
        const { d, run } = where(a, s);
        const groove = Math.exp(-((d / P.width) ** 2)) * run;
        return base(a, s) * (1 - P.depth * groove);
    };
    /** The swoosh's height at (a, s), and which way it leans (+1 toward
     *  +x, -1 toward -x: away from the part). */
    const wave = (a, s) => {
        const { d, phi } = where(a, s);
        const W = P.wave;
        const w = px === 0 ? W.center : Math.sign(d) === -Math.sign(px) ? W.heavy : W.light;
        const u = Math.abs(d) / P.width;
        // Steeply up out of the groove to the crest, then gently away.
        const roll = u < w.crest ? smoothstep((u - 0.5) / (w.crest - 0.5)) : Math.exp(-(((u - w.crest) / w.tail) ** 2));
        // Over the whole top (Steve, 2026-10-25, see HAIR_SIZE.part): from
        // behind the crown forward, fading at the temples, and nothing
        // right at the crown, where the patch's columns meet (a lift there
        // would step up off its padded first row).
        const run = smoothstep((phi - W.back) / W.fade) * (1 - smoothstep((Math.abs(a) - W.temple) / 0.4)) * smoothstep((s - 0.04) / 0.2);
        // Fullest toward the front, where a side part swoops.
        const swoop = W.swoop + (1 - W.swoop) * smoothstep((phi + 0.2) / 1.0);
        // Full to just inside the hairline, then gone at it (the patch's
        // border). Out from the head it would stand over the brow as a
        // shelf (preview, 2026-10-24); its lift turns forward instead
        // (`front`, 0 over the crown to 1 at the hairline), so it sweeps
        // up and over the forehead (Steve: "the swoosh should come forward
        // over the forehead too").
        const edgeFade = 1 - smoothstep((s - P.edge) / (1 - P.edge));
        return { height: w.lift * roll * run * swoop * edgeFade, away: Math.sign(d) || 1, front: smoothstep((s - P.turn) / (P.edge - P.turn)) };
    };
    const floorAt = (x, y, z) => {
        const r = Math.hypot(x, y, z);
        const a = Math.atan2(x, z);
        const t = Math.acos(y / r);
        return thick(a, t / along(edge, Math.abs(a)));
    };
    return { thick, wave, floorAt, edge };
}

/**
 * A solid lying ON a cap of hair (`edge`, `thick`), over columns `a0` to `a1`
 * round and rows `s0` to `s1` down: its inside on the cap's outer surface,
 * its outside `lift(a, s, dir)` further out (a vector, given the surface's
 * own direction `dir` there), at least `pad` so the two never fight for a
 * pixel, and half that round its border, so its walls are a hair high and
 * it is a proper closed solid. For a piece a hat would squash: a quiff's
 * crest, a part's waves.
 */
function onCap(edge, thick, lift, { a0, a1, s0, s1, nu = 40, nv = 20, pad = 0.0004 }) {
    return solidGrid(nu, nv, (i, j, side) => {
        const a = a0 + ((a1 - a0) * i) / nu;
        const s = s0 + ((s1 - s0) * j) / nv;
        const t = along(edge, Math.abs(a)) * s;
        const p = onSphere(SCALP + thick(a, s), a, t);
        if (!side) return p;
        const dir = onSphere(1, a, t);
        if (i === 0 || i === nu || j === 0 || j === nv) return [p[0] + dir[0] * pad * 0.5, p[1] + dir[1] * pad * 0.5, p[2] + dir[2] * pad * 0.5];
        const [lx, ly, lz] = lift(a, s, dir);
        const l = Math.hypot(lx, ly, lz);
        if (l < pad) return [p[0] + dir[0] * pad, p[1] + dir[1] * pad, p[2] + dir[2] * pad];
        return [p[0] + lx, p[1] + ly, p[2] + lz];
    });
}

/**
 * The hair for `style` in `color` (display hex), as a group named 'hair'
 * tagged `isHair`, in the head's coordinates; null for a style the rig
 * draws (none, buzzed, long). A part shows the `skin` (display hex) along
 * it.
 */
export function buildHair(style, color, { skin = DEFAULT_SKIN } = {}) {
    if (!HAIR_DRAWN.includes(style)) return null;
    const H = HAIR_SIZE;
    const group = new THREE.Group();
    group.name = 'hair';
    group.userData.isHair = true;
    group.userData.style = style;
    const S = STRANDS;
    // Every piece gets a material of its own, with its map of strands (or
    // none: the afro, the shaved sides, a mohawk's fin).
    const hairWith = (map) => new THREE.MeshStandardMaterial({ color, roughness: S.roughness, map: map || null });
    const tieMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(H.tie), roughness: 0.6 });
    const add = (geometry, name, { hides = false, material, map = null } = {}) => {
        const mesh = new THREE.Mesh(geometry, material || hairWith(map));
        mesh.name = name;
        mesh.castShadow = true;
        if (hides) mesh.userData.hatHides = true;
        group.add(mesh);
        return mesh;
    };
    /** The map for a cap over `edge`, its strands in `flow`. */
    const capMap = (key, edge, flow) => strandMap(`${key}:scalp`, onScalp(edge), flow, S.size.scalp);
    /** The map for a piece lying on a cap (`onCap`), over the same span. */
    const patchMap = (key, edge, flow, { a0, a1, s0, s1 }) => strandMap(`${key}:patch`, (u, v) => {
        const a = a0 + (a1 - a0) * u;
        return onSphere(SCALP, a, along(edge, Math.abs(a)) * (s0 + (s1 - s0) * v));
    }, flow, S.size.patch);
    /** The map down a piece's own uv (a tail, a spike, a plait). */
    const downMap = (n) => strandMap(`down:${n}`, null, alongV(n), S.size.tube);
    const crownFlow = fallFrom(S.crown);
    const cap = (edge, volume, flow = crownFlow, key = `${edge}:${volume}`) => add(scalp(H.edges[edge], thickness(H.volumes[volume])), 'scalp', { map: capMap(key, H.edges[edge], flow) });
    const sleekEdge = H.edges.sleek;
    /** A sleek cap, its strands drawn in to `pole` (where the hair is
     *  gathered), and the sleek cut's own thickness. */
    const sleek = (key, pole) => add(scalp(sleekEdge, thickness(H.volumes.sleek)), 'scalp', { map: capMap(key, sleekEdge, fallFrom(pole)) });
    const tie = (at, r = 0.014) => {
        const ring = add(new THREE.TorusGeometry(r, 0.0045, 6, 14), 'tie', { material: tieMaterial });
        ring.position.set(...at);
        ring.lookAt(at[0] * 2, at[1] * 2, at[2] * 2);
        return ring;
    };
    const tube = (points, radius, name, { material, ...options } = {}) => add(taperTube(points, radius, options), name, material ? { material } : { map: downMap(S.tube) });

    switch (style) {
        case 'short':
            cap('short', 'short');
            break;
        case 'leftPart':
        case 'rightPart':
        case 'centerPart': {
            const px = H.parts[style];
            const P = H.part;
            const part = parted(px);
            const flow = awayFromPart(px);
            // On a finer grid than the other cuts, so the groove is cut
            // (preview, 2026-10-24: on 48 columns the line of scalp sank in
            // and out of the hair in dashes).
            add(scalp(part.edge, part.thick, { nu: P.grid[0], nv: P.grid[1] }), 'scalp', { map: capMap(style, part.edge, flow) });
            // The swooshes either side, out from the head and leaning over
            // away from the part, turning up and forward over the brow
            // toward the hairline, over the front and the top (they fade
            // to nothing before this patch's border). On columns as fine
            // as the cut's (preview, 2026-10-24: on half as many, the
            // piece bridged the groove and buried the line of scalp).
            const forward = norm3(P.forward);
            const span = { a0: -1.7, a1: 1.7, s0: 0.02, s1: 0.99 };
            add(onCap(part.edge, part.thick, (a, s, dir) => {
                const { height, away, front } = part.wave(a, s);
                const out = [dir[0] + away * P.lean, dir[1], dir[2]];
                return out.map((o, k) => (o * (1 - front) + forward[k] * front) * height);
            }, { ...span, nu: Math.round((P.grid[0] * 3.4) / (2 * Math.PI)), nv: 28 }), 'wave', { hides: true, map: patchMap(style, part.edge, flow, span) });
            // The line of scalp along the groove's floor: in the plane `px`
            // from the middle, from just inside the hairline back to where
            // the groove has faded to about a third.
            const front = (() => {
                // The hairline where the plane meets it, settled in two
                // passes (the line's own angle round moves it a little).
                let a = 0;
                for (let k = 0; k < 2; k++) a = Math.asin(Math.min(1, px / (SCALP * Math.sin(along(part.edge, Math.abs(a))))));
                const t = along(part.edge, Math.abs(a));
                return Math.atan2(Math.sin(t) * Math.cos(a), Math.cos(t));
            })();
            const points = Array.from({ length: 9 }, (_, k) => {
                const phi = front - 0.06 + ((P.back + P.fade * 0.35 - front + 0.06) * k) / 8;
                const dir = [px, Math.cos(phi), Math.sin(phi)];
                const flat = Math.sqrt(SCALP * SCALP - px * px);
                // Out of the groove as the GRID draws it: a side part runs
                // between the grid's columns, whose triangles bridge the
                // groove higher than its floor (preview, 2026-10-24: set
                // on the floor, the line sank into that bridge and read as
                // dashes), so the floor is read half a column either side
                // and the line sits mostly out of the higher one. Never
                // under the scalp where the hair thins toward the hairline.
                const y = flat * dir[1];
                const z = flat * dir[2];
                const half = (SCALP * Math.sqrt(1 - (y / SCALP) ** 2) * Math.cos(Math.atan2(px, z)) * Math.PI) / P.grid[0];
                const floor = Math.max(part.floorAt(px, y, z), part.floorAt(px - half, y, z), part.floorAt(px + half, y, z));
                const r = SCALP + Math.max(P.line * 1.15, floor + P.line * 0.8);
                const rr = Math.sqrt(r * r - px * px);
                return [px, rr * dir[1], rr * dir[2]];
            });
            tube(points, () => P.line, 'part', { material: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.95 }), segments: 16, radial: 6 });
            break;
        }
        case 'quiff': {
            // Short, with the front swept up and back into a crest: its own
            // piece on the cut, lifted along `lean`.
            const base = thickness(H.volumes.short);
            const Q = H.quiff;
            const edge = H.edges.quiff;
            // Combed up and back from the brow: the strands fall away from
            // a pole low on the forehead.
            const flow = fallFrom(S.brow);
            add(scalp(edge, base), 'scalp', { map: capMap('quiff', edge, flow) });
            const lean = norm3(Q.lean);
            const span = { a0: -1.35, a1: 1.35, s0: 0.04, s1: 0.99 };
            add(onCap(edge, base, (a, s) => {
                const t = along(edge, Math.abs(a)) * s;
                const [, y, z] = onSphere(1, a, t);
                const phi = Math.atan2(z, y);
                const along_ = phi > Q.peak ? Math.exp(-(((phi - Q.peak) / Q.rise) ** 2)) : Math.exp(-(((Q.peak - phi) / Q.fall) ** 2));
                // Flat across the forehead, falling away steeply at the
                // temples (preview, 2026-10-24: a bell across peaked like
                // a fin from the front).
                const across = Math.exp(-((a / Q.spread) ** 4)) * (1 - smoothstep((Math.abs(a) - 1.0) / 0.3));
                // Full to within a hair of the hairline, so the crest's
                // front stands up right off the brow.
                const edgeFade = 1 - smoothstep((s - 0.93) / 0.06);
                const ripple = 1 + Q.ripple * Math.sin(a * 9);
                const h = Q.height * along_ * across * edgeFade * ripple;
                return [lean[0] * h, lean[1] * h, lean[2] * h];
            }, { ...span, nu: 48, nv: 24 }), 'crest', { hides: true, map: patchMap('quiff', edge, flow, span) });
            break;
        }
        case 'spiky': {
            cap('short', 'sleek');
            const K = H.spikes;
            for (const [a, t] of spread(K.count, H.edges.short, K.reach)) {
                const dir = new THREE.Vector3(...onSphere(1, a, t));
                // A cone's uv runs round (u) and up (v): strands up each spike.
                const cone = add(new THREE.ConeGeometry(K.radius, K.height, 7), 'spike', { hides: true, map: downMap(5) });
                cone.position.copy(dir.clone().multiplyScalar(SCALP + K.height / 2));
                cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            }
            break;
        }
        case 'curly':
            // One lumpy cap, on a grid fine enough for its curls.
            add(scalp(H.edges.short, thickness(H.volumes.curly), { nu: H.curls.grid[0], nv: H.curls.grid[1] }), 'scalp', { map: capMap('curly', H.edges.short, crownFlow) });
            break;
        case 'afro':
            // Its own texture of bumps; no strands.
            add(scalp(H.edges.afro, thickness(H.volumes.afro)), 'scalp');
            break;
        case 'mohawk': {
            // Shaved sides: too thin for strands. The fin's uv runs across
            // it, not up, so it goes without too.
            add(scalp(H.edges.short, thickness(H.volumes.shaved)), 'scalp');
            const M = H.mohawk;
            // A fin in the head's middle plane, from the hairline over the
            // crown to the nape (preview, 2026-10-24: measured down the
            // front it ran over the face): its foot on the scalp, its top
            // rising to `height`, narrowing toward the back.
            add(solidGrid(4, 32, (i, j, side) => {
                const u = -1 + (2 * i) / 4;
                const k = j / 32;
                const th = M.front + (M.back - M.front) * k;
                const r = SCALP + (side ? M.height * Math.sin(Math.PI * k) ** 0.5 : 0);
                return [u * M.width * (1 - 0.45 * k), r * Math.cos(th), r * Math.sin(th)];
            }), 'fin', { hides: true });
            break;
        }
        case 'mullet': {
            cap('short', 'short');
            const M = H.mullet;
            // Business in front: the short cap. Party in the back: a curtain
            // from the nape to the shoulders, flicking out at its foot, its
            // strands straight down it (about 5 mm apart round the nape).
            add(solidGrid(20, 8, (i, j, side) => {
                const a = Math.PI - M.half + (2 * M.half * i) / 20;
                const k = j / 8;
                const y = M.top + (M.bottom - M.top) * k;
                const edgeIn = Math.min(1, (M.half - Math.abs(a - Math.PI)) / 0.25);
                const r = M.inner + 0.01 * k + M.flip * k * k + (side ? M.thick * (0.35 + 0.65 * edgeIn) : 0);
                return [r * Math.sin(a), y, r * Math.cos(a)];
            }), 'curtain', { map: strandMap('mullet:curtain', null, alongV(42), S.size.curtain, { repeat: false }) });
            break;
        }
        case 'ponytail': {
            const P = H.ponytail;
            sleek('ponytail', P.tie);
            tie(P.tie);
            tube(P.tail, (s) => P.radius * (1 - s) ** 0.6 + 0.004, 'tail');
            break;
        }
        case 'pigtails': {
            const P = H.pigtails;
            // Gathered to both sides: the strands run back to between the ties.
            sleek('pigtails', [0, P.tie[1], P.tie[2]]);
            for (const side of [-1, 1]) {
                const flip = ([x, y, z]) => [x * side, y, z];
                tie(flip(P.tie), 0.012);
                tube(P.tail.map(flip), (s) => P.radius * (1 - s) ** 0.6 + 0.003, 'tail');
            }
            break;
        }
        case 'topKnot':
        case 'lowBun':
        case 'spaceBuns': {
            // Drawn in to the bun (or, for two, to the top of the head
            // between them); a bun's own strands wind round it.
            const buns = H.buns[style];
            sleek(style, buns.length === 1 ? onSphere(1, buns[0][0], buns[0][1]) : [0, 1, -0.2]);
            for (const [a, t, r] of buns) {
                const dir = new THREE.Vector3(...onSphere(1, a, t));
                const bun = add(new THREE.SphereGeometry(r, 14, 10), 'bun', { hides: true, map: downMap(12) });
                bun.position.copy(dir.clone().multiplyScalar(SCALP + r * 0.8));
                bun.scale.set(1, 0.88, 1);
                const ring = tie(dir.clone().multiplyScalar(SCALP + 0.004).toArray(), r * 0.55);
                ring.userData.hatHides = true;
            }
            break;
        }
        case 'bob': {
            cap('bob', 'bob');
            const B = H.bob;
            // Straight down the sides and the back to the jaw, open at the
            // face, a little fuller toward its ends, its strands straight
            // down it.
            add(solidGrid(30, 8, (i, j, side) => {
                const a = B.from + ((2 * Math.PI - 2 * B.from) * i) / 30;
                const k = j / 8;
                const y = B.top + (B.bottom - B.top) * k;
                const r = B.inner + B.flare * k * k + (side ? B.thick * (0.9 + 0.1 * k) : 0);
                return [r * Math.sin(a), y, r * Math.cos(a)];
            }), 'curtain', { map: strandMap('bob:curtain', null, alongV(115), S.size.curtain, { repeat: false }) });
            break;
        }
        case 'braids': {
            const B = H.braids;
            // Drawn back and down to the braids' roots behind the ears.
            sleek('braids', [0, B.start[1] - 0.1, B.start[2] - 0.08]);
            for (const side of [-1, 1]) {
                const curve = new THREE.CatmullRomCurve3(B.path.map(([x, y, z]) => new THREE.Vector3(x * side, y, z)));
                // The plaits: lobes along the curve, each leaning the other
                // way from the last, smaller toward the end.
                for (let k = 0; k < B.plaits; k++) {
                    const s = (k + 0.5) / B.plaits;
                    const p = curve.getPointAt(s);
                    const tangent = curve.getTangentAt(s);
                    // A ball's uv runs round (u) and pole to pole (v), and
                    // the lobe's poles lie along the braid: strands along it.
                    const lobe = add(new THREE.SphereGeometry(B.radius * (1 - 0.35 * s), 10, 8), 'plait', { map: downMap(5) });
                    lobe.position.copy(p).add(new THREE.Vector3(side * 0.004 * (k % 2 ? 1 : -1), 0, 0));
                    lobe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
                    lobe.scale.set(1, 1.45, 0.85);
                }
                const end = curve.getPointAt(1);
                const ring = tie(end.toArray(), 0.007);
                ring.name = 'tie';
            }
            break;
        }
        case 'locs': {
            add(scalp(sleekEdge, thickness(H.volumes.locs)), 'scalp', { map: capMap('locs', sleekEdge, crownFlow) });
            const L = H.locs;
            // Hanging from round the back and the sides of the hairline,
            // longer at the back than by the face.
            for (let k = 0; k < L.count; k++) {
                const a = L.from + ((2 * Math.PI - 2 * L.from) * (k + 0.5)) / L.count;
                const t = along(sleekEdge, Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))) - 0.08;
                const start = onSphere(0.122, a, t);
                const out = [Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6];
                const length = L.length * (0.6 + 0.4 * Math.abs(Math.cos(a / 2 + Math.PI / 2)));
                const points = [0, 0.33, 0.66, 1].map((f) => [
                    start[0] + out[0] * (0.006 + 0.01 * f), start[1] - length * f, start[2] + out[2] * (0.006 + 0.01 * f) + 0.003 * Math.sin(f * 5 + k)
                ]);
                tube(points, (s) => L.radius * (1 - 0.25 * s), 'loc', { segments: 10, radial: 6 });
            }
            break;
        }
        case 'cornrows': {
            // The cap between the rows is too thin for strands; each row
            // has its own, down its length.
            add(scalp(sleekEdge, thickness(H.volumes.cornrows)), 'scalp');
            const C = H.cornrows;
            // Each row in its own upright plane `x` to one side of the middle,
            // from the hairline over the crown to the nape, on the scalp.
            for (const x of C.rows) {
                const r = Math.sqrt(C.lift * C.lift - x * x);
                const from = C.front - 0.25 * Math.abs(x) / 0.1;
                const points = Array.from({ length: 13 }, (_, k) => {
                    const th = from + ((C.back - from) * k) / 12;
                    return [x, r * Math.cos(th), r * Math.sin(th)];
                });
                tube(points, (s) => C.radius * (0.75 + 0.25 * Math.sin(Math.PI * s)), 'row', { segments: 36, radial: 6 });
            }
            break;
        }
        default:
            break;
    }
    return group;
}
