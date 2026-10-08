// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hedge.js - the clipped hedge down our left side (Steve's QA, 2026-10-08:
 * "The row of hedges on the left could use more detail. They have very sharp
 * 90 degree corners and just look like a green rectangle.").
 *
 * A boxwood hedge as one mesh. Its cross-section has rounded shoulders and a
 * top a little narrower than its foot, the way a hedge is clipped so the sun
 * reaches the bottom, and it is swept along the property line with both ends
 * rounded off in plan. The surface is lumpy (value noise at two scales, the
 * clumps shears leave behind), and colored per vertex: darker low down and
 * in the hollows, sunlit and a little yellower on top, with a slow drift of
 * shade along its length. A canvas of small leaves gives the near view grain.
 *
 * THE LAWN SIDE STAYS BEHIND THE SIM'S WALL. Leaves drift against the wall
 * at x = wall.at, and a clump bulging past it would hide them (the houses
 * were set back for the same reason). So the mean face stands `inset` behind
 * the wall and no lump reaches it, and the back face stays where the side
 * yard's fence meets it (backyard.js).
 *
 * PURE PARTS (hedgeProfile, hedgeOffset, hedgeTopAt, hedgeSurface) are plain
 * numbers, so the shape is measured under Node, and roof.js lays its
 * fallen leaves on the same top.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => t * t * (3 - 2 * t);

/** A repeatable hash of three whole numbers and a seed, 0 to 1. */
function hash3(x, y, z, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683) + Math.imul(seed, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}

/** Smooth value noise in three dimensions, -1 to 1. */
export function noise3(x, y, z, seed = 0) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const w = smooth(z - zi);
    const at = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
    const lerp = (a, b, t) => a + (b - a) * t;
    const x00 = lerp(at(0, 0, 0), at(1, 0, 0), u);
    const x10 = lerp(at(0, 1, 0), at(1, 1, 0), u);
    const x01 = lerp(at(0, 0, 1), at(1, 0, 1), u);
    const x11 = lerp(at(0, 1, 1), at(1, 1, 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}

/**
 * The hedge's mean shape from a wall ({ at, height }) and its look (`H`,
 * config.yard.hedgeShape): its middle in x, half widths at the foot and the
 * top, the shoulders' radius and its height.
 */
export function hedgeFrame(wall, H) {
    const lawnFace = wall.at - H.inset;
    const half = H.width / 2;
    return { cx: lawnFace - half, foot: half, top: half - H.taper, shoulder: H.shoulder, height: wall.height };
}

/**
 * The cross-section, from the foot on the lawn side, up and over the top,
 * down to the foot on the back: points { u, y, nu, ny, s } with u across
 * (+ toward the lawn), the outward normal (nu, ny) and the distance along
 * the outline `s`.
 */
export function hedgeProfile(F, steps = 7) {
    const pts = [];
    const r = F.shoulder;
    const side = (sign, up) => {
        // A straight side from the foot to the shoulder, leaning in.
        const out = [];
        for (let k = 0; k <= steps; k++) {
            const t = up ? k / steps : 1 - k / steps;
            out.push({ u: sign * (F.foot + (F.top - F.foot) * t), y: (F.height - r) * t });
        }
        return out;
    };
    const arc = (cu, from, to) => {
        const out = [];
        for (let k = 1; k < steps; k++) {
            const a = from + (to - from) * (k / steps);
            out.push({ u: cu + Math.cos(a) * r, y: F.height - r + Math.sin(a) * r });
        }
        return out;
    };
    pts.push(...side(1, true));
    pts.push(...arc(F.top - r, 0, Math.PI / 2));
    for (let k = 0; k <= steps; k++) pts.push({ u: (F.top - r) * (1 - (2 * k) / steps), y: F.height });
    pts.push(...arc(-(F.top - r), Math.PI / 2, Math.PI));
    pts.push(...side(-1, false));
    // Normals from the neighbors either side, and the length along.
    let s = 0;
    pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const tu = b.u - a.u;
        const ty = b.y - a.y;
        const len = Math.hypot(tu, ty) || 1;
        p.nu = ty / len;
        p.ny = -tu / len;
        if (i > 0) s += Math.hypot(p.u - pts[i - 1].u, p.y - pts[i - 1].y);
        p.s = s;
    });
    return pts;
}

/** How far the surface stands out from the mean shape at (u, y, z): two
 *  scales of clumps, nothing at the very foot so it meets the ground. */
export function hedgeOffset(H, u, y, z) {
    const f = H.clump;
    const big = noise3(z * f, y * f, u * f, H.seed);
    const fine = noise3(z * f * 3.1, y * f * 3.1, u * f * 3.1, H.seed + 7);
    return (big * H.bump + fine * H.fine) * clamp(y / 0.25, 0, 1);
}

/** The ends rounded off in plan: how much of its width the hedge has at
 *  distance `d` from an end, 0 to 1 (a quarter circle over `round` meters). */
export function endScale(d, round) {
    const t = clamp(d / round, 0, 1);
    return Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Where along the hedge the mesh's rings are: close together at the ends,
 *  where they round off, and `spacing` apart between. */
export function ringZs(z0, z1, round, spacing) {
    const zs = [];
    const ends = 9;
    for (let k = 0; k < ends; k++) zs.push(z0 + round * (1 - Math.cos((k / ends) * Math.PI / 2)));
    const n = Math.max(1, Math.ceil((z1 - z0 - 2 * round) / spacing));
    for (let k = 0; k <= n; k++) zs.push(z0 + round + ((z1 - z0 - 2 * round) * k) / n);
    for (let k = ends - 1; k >= 0; k--) zs.push(z1 - round * (1 - Math.cos((k / ends) * Math.PI / 2)));
    return zs;
}

/**
 * The hedge as plain arrays: positions, uvs, an index, and per vertex
 * `light` (0 shaded to 1 sunlit) and `tint` (0 the hedge's green to 1 its
 * yellower top), for buildHedge to color. From z0 (the back) to z1 (the
 * sidewalk). The rounded end's width scale applies across, not up, so each
 * end is a clipped face rounded in plan, its top edge softened a little.
 */
export function hedgeSurface(wall, H, z0, z1) {
    const F = hedgeFrame(wall, H);
    const profile = hedgeProfile(F);
    const zs = ringZs(z0, z1, H.round, H.spacing);
    const n = profile.length;
    const position = new Float32Array(zs.length * n * 3);
    const uv = new Float32Array(zs.length * n * 2);
    const light = new Float32Array(zs.length * n);
    const tint = new Float32Array(zs.length * n);
    zs.forEach((z, j) => {
        const sc = endScale(Math.min(z - z0, z1 - z), H.round);
        profile.forEach((p, i) => {
            const k = j * n + i;
            const off = hedgeOffset(H, p.u, p.y, z) * sc;
            const y = (p.y + p.ny * off) * (1 - 0.06 * (1 - sc));
            const u = (p.u + p.nu * off) * sc;
            position[k * 3] = F.cx + u;
            position[k * 3 + 1] = Math.max(0, y);
            position[k * 3 + 2] = z;
            uv[k * 2] = z / H.texture;
            uv[k * 2 + 1] = p.s / H.texture;
            // Dark at the foot and in a hollow, sunlit on top, drifting
            // slowly along the length.
            const up = clamp(p.y / F.height, 0, 1);
            const drift = noise3(z * 0.35, 0.5, 0.5, H.seed + 3) * 0.08;
            light[k] = clamp(0.42 + 0.48 * smooth(up) + off * 3 + drift + Math.max(0, p.ny) * 0.12, 0, 1);
            tint[k] = clamp(Math.max(0, p.ny) * 0.8 + drift * 2, 0, 1);
        });
    });
    const quads = (zs.length - 1) * (n - 1);
    const index = new Uint32Array(quads * 6);
    let q = 0;
    for (let j = 0; j < zs.length - 1; j++) {
        for (let i = 0; i < n - 1; i++) {
            const a = j * n + i;
            const b = a + n;
            // Wound so the outside faces out (the profile runs from the lawn
            // over the top to the back, and the rings toward +z).
            index.set([a, a + 1, b, a + 1, b + 1, b], q);
            q += 6;
        }
    }
    return { position, uv, index, light, tint, frame: F };
}

/** The height of the hedge's top at (x, z), for anything resting on it. */
export function hedgeTopAt(wall, H, x, z) {
    const F = hedgeFrame(wall, H);
    const u = x - F.cx;
    return F.height + hedgeOffset(H, u, F.height, z);
}

/** A canvas of small overlapping leaves, pale on white, for the grain. */
function leafGrain(seed = 5) {
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    let s = seed;
    const random = () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
    };
    // Bright, so the vertex colors keep the hedge's own green: the leaves
    // only shade it a little.
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 700; i++) {
        const v = Math.floor(165 + random() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        const x = random() * size;
        const y = random() * size;
        const a = random() * Math.PI;
        // Drawn at each wrap too, so the picture tiles without a seam.
        for (const dx of [-size, 0, size]) {
            for (const dy of [-size, 0, size]) {
                if (ctx.ellipse) {
                    ctx.beginPath();
                    ctx.ellipse(x + dx, y + dy, 2.6, 1.3, a, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(x + dx - 1.5, y + dy - 1, 3, 2);
                }
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

/**
 * The hedge's mesh along `wall` (config.yard.walls' tall one) from z0 to
 * z1, `H` its look (config.yard.hedgeShape) and `look` config.look. Named
 * 'hedge'.
 */
export function buildHedge(wall, H, z0, z1, look) {
    const s = hedgeSurface(wall, H, z0, z1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(s.position, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(s.uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(s.index, 1));
    geometry.computeVertexNormals();
    const shade = new THREE.Color(look.hedgeShade);
    const green = new THREE.Color(look.hedge);
    const sun = new THREE.Color(look.hedgeSun);
    const colors = new Float32Array(s.light.length * 3);
    const c = new THREE.Color();
    for (let k = 0; k < s.light.length; k++) {
        c.copy(shade).lerp(green, Math.min(1, s.light[k] * 1.6));
        if (s.light[k] > 0.62) c.lerp(sun, (s.light[k] - 0.62) * s.tint[k] * 1.4);
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const map = leafGrain();
    if (map) map.repeat.set(1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map }));
    mesh.name = 'hedge';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}
