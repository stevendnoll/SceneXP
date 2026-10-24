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
 */

import { solidGrid, taperTube, onSphere } from './avatar-shapes-1.0.0.min.js';

/** The styles drawn here. The rest (none, buzzed, long) are the rig's. */
export const HAIR_DRAWN = Object.freeze([
    'short', 'quiff', 'spiky', 'curly', 'afro', 'mohawk', 'mullet', 'ponytail', 'pigtails',
    'topKnot', 'lowBun', 'spaceBuns', 'bob', 'braids', 'locs', 'cornrows'
]);

/** Where the hair's inner surface lies: just outside the 0.12 m head. */
export const SCALP = 0.1204;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
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
        // Full at the sides, so the curtain grows out of it with no step
        // (preview, 2026-10-24: a thin cap over a thick curtain read as
        // headphones).
        bob: { front: 0.012, side: 0.011, back: 0.012, crown: 0.004, fade: 0.06, min: 0.009 },
        locs: { front: 0.006, side: 0.006, back: 0.007, crown: 0.003, fade: 0.25, min: 0.0008 },
        cornrows: { front: 0.0018, side: 0.0018, back: 0.0018, crown: 0, fade: 0.2, min: 0.0006 }
    },
    quiff: { lift: 0.022, at: 0.32, spread: 0.22 },
    spikes: { count: 26, height: 0.028, radius: 0.0095, reach: 0.78 },
    curls: { count: 46, radius: 0.0125, reach: 0.86 },
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
        const texture = v.texture ? 1 + v.texture * Math.sin(9 * a) * Math.sin(11 * s * Math.PI) : 1;
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
 * The hair for `style` in `color` (display hex), as a group named 'hair'
 * tagged `isHair`, in the head's coordinates; null for a style the rig
 * draws (none, buzzed, long).
 */
export function buildHair(style, color) {
    if (!HAIR_DRAWN.includes(style)) return null;
    const H = HAIR_SIZE;
    const group = new THREE.Group();
    group.name = 'hair';
    group.userData.isHair = true;
    group.userData.style = style;
    const hair = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const tieMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(H.tie), roughness: 0.6 });
    const add = (geometry, name, { hides = false, material = hair } = {}) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.castShadow = true;
        if (hides) mesh.userData.hatHides = true;
        group.add(mesh);
        return mesh;
    };
    const cap = (edge, volume) => add(scalp(H.edges[edge], thickness(H.volumes[volume])), 'scalp');
    const sleekEdge = H.edges.sleek;
    const tie = (at, r = 0.014) => {
        const ring = add(new THREE.TorusGeometry(r, 0.0045, 6, 14), 'tie', { material: tieMaterial });
        ring.position.set(...at);
        ring.lookAt(at[0] * 2, at[1] * 2, at[2] * 2);
        return ring;
    };
    const tube = (points, radius, name, options = {}) => add(taperTube(points, radius, options), name);

    switch (style) {
        case 'short':
            cap('short', 'short');
            break;
        case 'quiff': {
            // Short, with the front swept up into a crest.
            const base = thickness(H.volumes.short);
            const q = H.quiff;
            add(scalp(H.edges.quiff, (a, s) => base(a, s) + q.lift * Math.max(0, Math.cos(a)) ** 3 * Math.exp(-(((s - q.at) / q.spread) ** 2))), 'scalp');
            break;
        }
        case 'spiky': {
            cap('short', 'sleek');
            const S = H.spikes;
            for (const [a, t] of spread(S.count, H.edges.short, S.reach)) {
                const dir = new THREE.Vector3(...onSphere(1, a, t));
                const cone = add(new THREE.ConeGeometry(S.radius, S.height, 7), 'spike', { hides: true });
                cone.position.copy(dir.clone().multiplyScalar(SCALP + S.height / 2));
                cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            }
            break;
        }
        case 'curly': {
            cap('short', 'short');
            const C = H.curls;
            for (const [a, t] of spread(C.count, H.edges.short, C.reach)) {
                const curl = add(new THREE.SphereGeometry(C.radius, 8, 6), 'curl', { hides: true });
                curl.position.set(...onSphere(SCALP + 0.006, a, t));
            }
            break;
        }
        case 'afro':
            cap('afro', 'afro');
            break;
        case 'mohawk': {
            cap('short', 'shaved');
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
            // from the nape to the shoulders, flicking out at its foot.
            add(solidGrid(20, 8, (i, j, side) => {
                const a = Math.PI - M.half + (2 * M.half * i) / 20;
                const k = j / 8;
                const y = M.top + (M.bottom - M.top) * k;
                const edgeIn = Math.min(1, (M.half - Math.abs(a - Math.PI)) / 0.25);
                const r = M.inner + 0.01 * k + M.flip * k * k + (side ? M.thick * (0.35 + 0.65 * edgeIn) : 0);
                return [r * Math.sin(a), y, r * Math.cos(a)];
            }), 'curtain');
            break;
        }
        case 'ponytail': {
            add(scalp(sleekEdge, thickness(H.volumes.sleek)), 'scalp');
            const P = H.ponytail;
            tie(P.tie);
            tube(P.tail, (s) => P.radius * (1 - s) ** 0.6 + 0.004, 'tail');
            break;
        }
        case 'pigtails': {
            add(scalp(sleekEdge, thickness(H.volumes.sleek)), 'scalp');
            const P = H.pigtails;
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
            add(scalp(sleekEdge, thickness(H.volumes.sleek)), 'scalp');
            for (const [a, t, r] of H.buns[style]) {
                const dir = new THREE.Vector3(...onSphere(1, a, t));
                const bun = add(new THREE.SphereGeometry(r, 14, 10), 'bun', { hides: true });
                bun.position.copy(dir.clone().multiplyScalar(SCALP + r * 0.8));
                bun.scale.set(1, 0.88, 1);
                const ring = tie(dir.clone().multiplyScalar(SCALP + 0.004).toArray(), r * 0.55);
                ring.userData.hatHides = true;
            }
            break;
        }
        case 'bob': {
            add(scalp(H.edges.bob, thickness(H.volumes.bob)), 'scalp');
            const B = H.bob;
            // Straight down the sides and the back to the jaw, open at the
            // face, a little fuller toward its ends.
            add(solidGrid(30, 8, (i, j, side) => {
                const a = B.from + ((2 * Math.PI - 2 * B.from) * i) / 30;
                const k = j / 8;
                const y = B.top + (B.bottom - B.top) * k;
                const r = B.inner + B.flare * k * k + (side ? B.thick * (0.9 + 0.1 * k) : 0);
                return [r * Math.sin(a), y, r * Math.cos(a)];
            }), 'curtain');
            break;
        }
        case 'braids': {
            add(scalp(sleekEdge, thickness(H.volumes.sleek)), 'scalp');
            const B = H.braids;
            for (const side of [-1, 1]) {
                const curve = new THREE.CatmullRomCurve3(B.path.map(([x, y, z]) => new THREE.Vector3(x * side, y, z)));
                // The plaits: lobes along the curve, each leaning the other
                // way from the last, smaller toward the end.
                for (let k = 0; k < B.plaits; k++) {
                    const s = (k + 0.5) / B.plaits;
                    const p = curve.getPointAt(s);
                    const tangent = curve.getTangentAt(s);
                    const lobe = add(new THREE.SphereGeometry(B.radius * (1 - 0.35 * s), 10, 8), 'plait');
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
            add(scalp(sleekEdge, thickness(H.volumes.locs)), 'scalp');
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
