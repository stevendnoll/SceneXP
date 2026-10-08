// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * rooftops.js - leaves resting up where the blower never reaches (Steve's
 * QA, 2026-10-08: "Could we add a few more resting leaves to the houses'
 * roofs? I think that would look more realistic.").
 *
 * Leaves come down on everything in October, not only the lawn. So a few
 * hundred lie on the front slope of each roof (thickest along the gutter,
 * where they slide to and stop, and under any crown that hangs over it), on
 * the flat roof over our porch, and along the top of the hedge under the
 * maple beside it.
 *
 * DECORATION ONLY. They are not in the sim: never blown, never counted,
 * never in the score. One instanced mesh, drawn by the yard's own leaf
 * shader (leafmesh.js) with the yard's own colors and kinds, so they are the
 * same leaves, and costs one draw.
 *
 * PURE PARTS (restingSurfaces, scatterResting, slopeTurn) are plain numbers,
 * so where each leaf lies is measured under Node against the roofs and the
 * hedge that are drawn.
 */
import { makeRandom, pickWeighted, srgbToLinear } from './sim.min.js';
import { facadeZ } from './house.min.js';
import { hedgeFrame, hedgeTopAt, noise3 } from './hedge.min.js';
import { createLeafMesh } from './leafmesh.min.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;
// The eaves overhang the walls by this much (house.js gableRoof).
const OVER = 0.4;

/**
 * Where leaves can rest, from the config: each house's front slope (the one
 * the camera sees) as { kind: 'slope', name, minX, maxX, eaveZ, eaveY,
 * ridgeZ, ridgeY, avoid }, our porch's flat roof as { kind: 'flat', rect,
 * y }, and the hedge's top as { kind: 'hedge', minZ, maxZ }. `avoid` is a
 * list of rects in plan where something stands on the roof (a chimney).
 */
export function restingSurfaces(config) {
    const Y = config.yard;
    const out = [];
    const slope = (name, h, front, avoid = []) => {
        out.push({
            kind: 'slope', name,
            minX: h.minX - OVER + 0.1, maxX: h.maxX + OVER - 0.1,
            eaveZ: front + OVER, eaveY: h.wall - 0.05,
            ridgeZ: front - h.depth / 2, ridgeY: h.ridge,
            // The share of the slope the fascia's top (house.js, 13 cm over
            // the eave, 18 cm in) stands above.
            lip: 0.2 / (h.depth / 2 + OVER),
            avoid
        });
    };
    slope('ours', Y.house, facadeZ(Y.lawn.minZ, Y.house));
    const NH = Y.neighborHouse;
    const hisFront = facadeZ(Y.neighbor.minZ, NH);
    // His brick chimney (house.js): 0.8 square, 1.6 in from his far end.
    const cz = hisFront - NH.depth / 2;
    const chimney = { minX: NH.maxX - 2.1, maxX: NH.maxX - 1.1, minZ: cz + 0.1, maxZ: cz + 1.1 };
    slope('neighbor', NH, hisFront, [chimney]);
    for (const h of Y.street || []) slope(`street-${h.name}`, h, h.front);
    // Our porch's flat roof (house.js): on the posts, 14 cm thick, 15 cm
    // past the porch each side and 25 cm past its front.
    const porch = (Y.boxes || []).find((b) => b.name === 'porch');
    const post = (Y.boxes || []).find((b) => b.name === 'post');
    if (porch) {
        const top = (post ? post.height : 2.8) + 0.14;
        out.push({
            kind: 'flat', name: 'porch',
            rect: { minX: porch.minX - 0.08, maxX: porch.maxX + 0.08, minZ: facadeZ(Y.lawn.minZ, Y.house) + 0.05, maxZ: porch.maxZ + 0.2 },
            y: top
        });
    }
    const hedge = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    if (hedge && Y.hedgeShape) out.push({ kind: 'hedge', name: 'hedge', wall: hedge, minZ: Y.lawn.minZ, maxZ: Y.sidewalk.minZ - 0.4 });
    return out;
}

/** Row-major 3x3 products, for turning a leaf onto a slope. */
function mul(a, b) {
    const out = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
        }
    }
    return out;
}
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];

/**
 * A leaf lying on a surface tipped `tilt` radians toward +z (a roof's front
 * slope) and `side` radians about z, spun `spin` about its own normal, face
 * down if `flip`, as the leaf shader's (yaw, pitch, roll): the same turn as
 * yaw about y, then pitch about x, then roll about z (Euler YXZ).
 */
export function slopeTurn(tilt, spin, flip = false, side = 0) {
    let m = mul(rotX(tilt), mul(rotZ(side), rotY(spin)));
    if (flip) m = mul(m, rotZ(Math.PI));
    // Euler YXZ from m = Ry(yaw) Rx(pitch) Rz(roll), as three.js reads it.
    const m23 = m[5];
    const pitch = Math.asin(-clamp(m23, -1, 1));
    let yaw;
    let roll;
    if (Math.abs(m23) < 0.9999999) {
        yaw = Math.atan2(m[2], m[8]);
        roll = Math.atan2(m[3], m[4]);
    } else {
        yaw = Math.atan2(-m[6], m[0]);
        roll = 0;
    }
    return { yaw, pitch, roll };
}

/** The point on a slope `t` of the way from the eave (0) to the ridge (1). */
export function slopeAt(s, x, t) {
    return { x, y: s.eaveY + (s.ridgeY - s.eaveY) * t, z: s.eaveZ - (s.eaveZ - s.ridgeZ) * t };
}

/** How steep a slope is, in radians. */
export function slopeTilt(s) {
    return Math.atan2(s.ridgeY - s.eaveY, s.eaveZ - s.ridgeZ);
}

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** How likely a leaf is to have come to rest at (x, z) on a surface, 0 to
 *  about 1.5: patchy everywhere, more under the crowns of the trees. */
function shelter(trees, x, z, seed) {
    let w = 0.55 + 0.45 * noise3(x * 0.7, z * 0.7, 0.5, seed);
    for (const t of trees) {
        const d = Math.hypot(x - t.x, z - t.z) / (t.crown.radius * 1.25);
        w += 1.1 * Math.exp(-d * d);
    }
    return w;
}

/**
 * Lay the resting leaves: `R` is config.yard.resting ({ counts by surface
 * kind or name, seed, lift }), `base` the yard's leaf size (scatterLeaves).
 * Returns { pose, look, count, at }: the leaf shader's six floats a leaf
 * each (x, y, z, yaw, pitch, roll and r, g, b, kind, size, cup), and `at`,
 * which surface each leaf lies on (its index in restingSurfaces).
 */
export function scatterResting(config, base) {
    const R = config.yard.resting;
    const look = config.look;
    const L = config.leaves;
    const random = makeRandom(R.seed);
    const surfaces = restingSurfaces(config);
    const trees = config.yard.trees || [];
    const kinds = Object.keys(look.palettes);
    const leaves = [];
    surfaces.forEach((s, si) => {
        const n = R.counts[s.name] ?? R.counts[s.kind] ?? 0;
        let placed = 0;
        for (let tries = 0; placed < n && tries < n * 40; tries++) {
            let p;
            let turn;
            if (s.kind === 'slope') {
                // Thickest at the gutter, where leaves slide to and stop.
                const t = random();
                const x = s.minX + random() * (s.maxX - s.minX);
                const keep = (0.25 + 0.75 * (1 - t) ** 3) * shelter(trees, x, slopeAt(s, x, t).z, R.seed) / 1.6;
                if (random() > keep) continue;
                // Up from the fascia's lip (house.js), which would hide a
                // leaf right at the eave, to just short of the ridge.
                p = slopeAt(s, x, s.lip + t * (0.97 - s.lip));
                if (s.avoid.some((r) => inRect(r, p.x, p.z))) continue;
                const tilt = slopeTilt(s);
                turn = slopeTurn(tilt + (random() - 0.5) * 0.3, random() * TAU, random() < 0.3, (random() - 0.5) * 0.3);
                // Up off the slope along its normal.
                p.y += R.lift * Math.cos(tilt);
                p.z += R.lift * Math.sin(tilt);
            } else if (s.kind === 'flat') {
                const x = s.rect.minX + random() * (s.rect.maxX - s.rect.minX);
                const z = s.rect.minZ + random() * (s.rect.maxZ - s.rect.minZ);
                if (random() > shelter(trees, x, z, R.seed) / 1.6) continue;
                p = { x, y: s.y + R.lift, z };
                turn = slopeTurn((random() - 0.5) * 0.2, random() * TAU, random() < 0.3);
            } else {
                // Along the hedge's flat top, under the maple beside it.
                const F = hedgeFrame(s.wall, config.yard.hedgeShape);
                const flat = F.top - F.shoulder;
                const x = F.cx + (random() * 2 - 1) * flat * 0.9;
                const z = s.minZ + random() * (s.maxZ - s.minZ);
                if (random() > (shelter(trees, x, z, R.seed) - 0.4) / 1.4) continue;
                p = { x, y: hedgeTopAt(s.wall, config.yard.hedgeShape, x, z) + R.lift, z };
                turn = slopeTurn((random() - 0.5) * 0.5, random() * TAU, random() < 0.3, (random() - 0.5) * 0.5);
            }
            const kind = pickWeighted(look.kinds, random());
            const palette = look.palettes[kind];
            const hex = palette[Math.floor(random() * palette.length) % palette.length];
            // A little browner and duller than the lawn's: they have been up
            // there a while.
            const j = (1 + (random() * 2 - 1) * look.colorJitter) * R.weathered;
            const rgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgbToLinear(clamp((v / 255) * j, 0, 1)));
            leaves.push({
                p, turn, rgb, si,
                kind: kinds.indexOf(kind),
                size: base * (1 + (random() * 2 - 1) * L.sizeJitter),
                cup: look.curl.min + random() * (look.curl.max - look.curl.min)
            });
            placed++;
        }
    });
    const count = leaves.length;
    const pose = new Float32Array(count * 6);
    const traits = new Float32Array(count * 6);
    const at = new Uint8Array(count);
    leaves.forEach((leaf, i) => {
        const o = i * 6;
        pose.set([leaf.p.x, leaf.p.y, leaf.p.z, leaf.turn.yaw, leaf.turn.pitch, leaf.turn.roll], o);
        traits.set([leaf.rgb[0], leaf.rgb[1], leaf.rgb[2], leaf.kind, leaf.size, leaf.cup], o);
        at[i] = leaf.si;
    });
    return { pose, look: traits, count, at };
}

/** The resting leaves' mesh, drawn by the yard's leaf shader. `options` as
 *  createLeafMesh's (shadows, underside, anisotropy). Named 'resting-leaves'. */
export function buildResting(config, base, options = {}) {
    const r = scatterResting(config, base);
    const leaves = createLeafMesh({ pose: r.pose, count: r.count }, r.look, options);
    leaves.mesh.name = 'resting-leaves';
    return { mesh: leaves.mesh, count: r.count, dispose: leaves.dispose };
}
