// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * whitestone-model-preview.mjs - The house model, drawn from its own parts,
 * for checking by eye without a browser (QA, 2026-10-13: "We really need to
 * nail the house").
 *
 *   npm run build && node --experimental-vm-modules scripts/whitestone-model-preview.mjs
 *
 * Writes specs/whitestone/previews/model.html (git-ignored): the house on
 * its turntable in the white studio, through the page's own camera
 * (turntable.js framePose, view offset and all) on a wide screen and a
 * phone, with a floor open, empty, and the widest home, as PNGs beside it.
 * A small software rasterizer with a depth buffer over model.js's
 * `instancesFor`: every box, gable and tree as flat-shaded triangles in
 * perspective, drawn at twice the size and shrunk for smooth edges, so what
 * it shows is the model's own numbers, not a drawing of them. The cove and
 * the contact shadow are traced per pixel. Lighting and materials are
 * rough; the shapes, colors, placement and framing are exact.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instancesFor, levelOffsets, fitScale, siteFor, bathsOf, assemblyPlan, focusOf, nearSide, EMPTY_HOME } from '../www/whitestone/js/model.js';
import { framePose, turnPoint, smoothstep } from '../www/whitestone/js/turntable.js';
import { contactAlpha } from '../www/whitestone/js/stage.js';
import { loadRealThree } from '../tests/helpers/real-three.mjs';

// Maya is built by cast.js with the real three.js, as the page builds her.
globalThis.THREE = await loadRealThree();
const { buildMaya, poseFor, GESTURES, portraitPose, PORTRAIT } = await import('../www/whitestone/js/cast.js');
import { layoutHome } from '../www/whitestone/js/layout.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { CONFIG } from '../www/whitestone/js/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'whitestone', 'previews', 'model.html');
const NOW = new Date('2026-10-12T16:00:00Z');
const PAL = CONFIG.model.palette;
const SUN = CONFIG.light.sun;
const LIGHT = norm(SUN.position.map((v, i) => v - SUN.target[i]));
const T = CONFIG.stage.turntable;
const COVE = CONFIG.stage.cove;

function norm(v) {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rotate([x, y, z], [rx, ry, rz] = [0, 0, 0]) {
    // XYZ Euler, as three applies it: z first, then y, then x.
    let p = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z];
    p = [p[0] * Math.cos(ry) + p[2] * Math.sin(ry), p[1], -p[0] * Math.sin(ry) + p[2] * Math.cos(ry)];
    return [p[0], p[1] * Math.cos(rx) - p[2] * Math.sin(rx), p[1] * Math.sin(rx) + p[2] * Math.cos(rx)];
}

/** A box record's corners and faces, in the model's frame. */
function boxFaces(b, baseOrigin = false) {
    const [w, h, d] = b.scale;
    const c = baseOrigin ? [b.position[0], b.position[1] + h / 2, b.position[2]] : b.position;
    const corner = (sx, sy, sz) => {
        const r = rotate([sx * w / 2, sy * h / 2, sz * d / 2], b.rotation);
        return [c[0] + r[0], c[1] + r[1], c[2] + r[2]];
    };
    const v = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) v.push(corner(sx, sy, sz));
    const i = (sx, sy, sz) => v[((sx + 1) / 2) * 4 + ((sy + 1) / 2) * 2 + (sz + 1) / 2];
    return [
        [i(1, -1, -1), i(1, 1, -1), i(1, 1, 1), i(1, -1, 1)],
        [i(-1, -1, 1), i(-1, 1, 1), i(-1, 1, -1), i(-1, -1, -1)],
        [i(-1, 1, -1), i(-1, 1, 1), i(1, 1, 1), i(1, 1, -1)],
        [i(-1, -1, -1), i(1, -1, -1), i(1, -1, 1), i(-1, -1, 1)],
        [i(-1, -1, 1), i(1, -1, 1), i(1, 1, 1), i(-1, 1, 1)],
        [i(1, -1, -1), i(-1, -1, -1), i(-1, 1, -1), i(1, 1, -1)]
    ];
}

/** A gable's prism: base at `position`, ridge along local x. */
function prismFaces(g) {
    const [w, h, d] = g.scale;
    const P = (x, y, z) => {
        const r = rotate([x * w, y * h, z * d], g.rotation);
        return [g.position[0] + r[0], g.position[1] + r[1], g.position[2] + r[2]];
    };
    const a0 = P(-0.5, 0, -0.5);
    const a1 = P(-0.5, 0, 0.5);
    const a2 = P(-0.5, 1, 0);
    const b0 = P(0.5, 0, -0.5);
    const b1 = P(0.5, 0, 0.5);
    const b2 = P(0.5, 1, 0);
    return [[a0, a2, a1], [b0, b1, b2], [a0, a1, b1, b0], [a1, a2, b2, b1], [a2, a0, b0, b2]];
}

/** A rough sphere, as an octahedron-ish ring of facets, for leaves. */
function blobFaces(b) {
    const [w, h, d] = b.scale;
    const c = b.position;
    const top = [c[0], c[1] + h / 2, c[2]];
    const bottom = [c[0], c[1] - h / 2, c[2]];
    const ring = Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return [c[0] + Math.cos(a) * w / 2, c[1], c[2] + Math.sin(a) * d / 2];
    });
    const faces = [];
    for (let k = 0; k < 8; k++) {
        faces.push([top, ring[(k + 1) % 8], ring[k]]);
        faces.push([bottom, ring[k], ring[(k + 1) % 8]]);
    }
    return faces;
}

function coneFaces(b) {
    const [w, h, d] = b.scale;
    const c = b.position;
    const apex = [c[0], c[1] + h / 2, c[2]];
    const ring = Array.from({ length: 9 }, (_, k) => {
        const a = (k / 9) * Math.PI * 2;
        return [c[0] + Math.cos(a) * w / 2, c[1] - h / 2, c[2] + Math.sin(a) * d / 2];
    });
    return ring.map((p, k) => [apex, ring[(k + 1) % 9], p]);
}

/** A cylinder record (a lawn): its top as a fan and its rim as quads. */
function discFaces(b, n = 64) {
    const [w, h, d] = b.scale;
    const c = b.position;
    const ring = (y) => Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2;
        return [c[0] + Math.cos(a) * w / 2, y, c[2] + Math.sin(a) * d / 2];
    });
    const top = ring(c[1] + h / 2);
    const bottom = ring(c[1] - h / 2);
    const faces = [];
    const mid = [c[0], c[1] + h / 2, c[2]];
    for (let k = 0; k < n; k++) {
        faces.push([mid, top[(k + 1) % n], top[k]]);
        faces.push([bottom[k], top[k], top[(k + 1) % n], bottom[(k + 1) % n]]);
    }
    return faces;
}

/** Every triangle of a built three.js object (Maya), in world meters,
 *  colored by its material. `pose` is a gesture and a time in it. */
function figureFaces(maya, pose = null) {
    if (pose) maya.gesture(pose.name);
    if (pose) maya.tick(pose.t);
    maya.group.updateMatrixWorld(true);
    const faces = [];
    maya.group.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const g = o.geometry;
        const pos = g.attributes.position;
        const idx = g.index ? g.index.array : null;
        const v = (k) => new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld).toArray();
        const hex = `#${o.material.color.getHexString()}`;
        const n = idx ? idx.length : pos.count;
        for (let i = 0; i < n; i += 3) {
            const tri = [0, 1, 2].map((j) => v(idx ? idx[i + j] : i + j));
            faces.push({ poly: tri, hex });
        }
    });
    return faces;
}

/** A round piece (a basin, a stool, a washer's door): a cylinder, turned
 *  as the page turns it. */
function roundFaces(b, n = 16) {
    const [w, h, d] = b.scale;
    const c = b.position;
    const P = (x, y, z) => {
        const r = rotate([x, y, z], b.rotation);
        return [c[0] + r[0], c[1] + r[1], c[2] + r[2]];
    };
    const ring = (y) => Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2;
        return P(Math.cos(a) * w / 2, y, Math.sin(a) * d / 2);
    });
    const top = ring(h / 2);
    const bottom = ring(-h / 2);
    const faces = [];
    const mid = P(0, h / 2, 0);
    for (let k = 0; k < n; k++) {
        faces.push([mid, top[(k + 1) % n], top[k]]);
        faces.push([bottom[k], top[k], top[(k + 1) % n], bottom[(k + 1) % n]]);
    }
    return faces;
}

/** The turntable in the world: a stone drum on its dark toe. */
function turntableFaces(n = 96) {
    const faces = [];
    const drum = (r, y0, y1, hex) => {
        const ring = (y) => Array.from({ length: n }, (_, k) => {
            const a = (k / n) * Math.PI * 2;
            return [Math.cos(a) * r, y, Math.sin(a) * r];
        });
        const lo = ring(y0);
        const hi = ring(y1);
        for (let k = 0; k < n; k++) {
            faces.push({ poly: [lo[k], hi[k], hi[(k + 1) % n], lo[(k + 1) % n]], hex });
            faces.push({ poly: [[0, y1, 0], hi[(k + 1) % n], hi[k]], hex });
        }
    };
    drum(T.radius - T.inset, 0, T.toe, T.toeColor);
    drum(T.radius, T.toe, T.height, T.stone);
    return faces;
}

function hexToRgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function shade(hex, f) {
    return `rgb(${hexToRgb(hex).map((v) => Math.round(Math.min(255, v * f))).join(',')})`;
}

/** Every face of every part, as flat-colored polygons in the model's frame. */
function facesOf(inst) {
    const faces = [];
    const add = (polys, hex, alpha = 1) => {
        for (const poly of polys) {
            const n = norm(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
            // Lit from either side, so a face wound either way shades alike.
            const f = 0.62 + 0.45 * Math.abs(dot(n, LIGHT)) * (dot(n, LIGHT) >= 0 ? 1 : 0.35);
            faces.push({ poly, rgb: hexToRgb(hex).map((v) => Math.min(255, v * f)), alpha });
        }
    };
    // A part may carry its own `hex` and `alpha` (the context treatments
    // tried below, --context).
    const color = (p, fallback) => p.hex || PAL[p.color] || fallback;
    for (const b of inst.slabs) add(boxFaces(b), color(b, PAL.wall));
    for (const b of [...inst.walls, ...inst.siding, ...inst.windows, ...inst.trims, ...inst.fixtures, ...inst.site, ...inst.tiles]) add(boxFaces(b), color(b, '#FF00FF'));
    const fillAlpha = (b) => (b.alpha !== undefined ? b.alpha : CONFIG.model.context.opacity);
    for (const b of inst.massing || []) add(boxFaces(b), color(b, '#FF00FF'), fillAlpha(b));
    for (const g of inst.contextRoofs || []) add(prismFaces(g), color(g, '#FF00FF'), fillAlpha(g));
    for (const b of inst.roofs) add(boxFaces(b), PAL.roof);
    for (const g of inst.gables) add(prismFaces(g), color(g, PAL.wall), g.alpha);
    for (const b of [...inst.canopies, ...inst.blooms]) add(blobFaces(b), color(b, PAL.leaves));
    for (const b of inst.firs) add(coneFaces(b), color(b, PAL.fir1));
    for (const b of inst.lawn || []) add(discFaces(b), color(b, PAL.lawn));
    for (const b of inst.edges || []) add(boxFaces(b), color(b, '#FF00FF'));
    for (const b of inst.rounds || []) add(roundFaces(b), color(b, '#FF00FF'));
    for (const b of inst.outlines || []) add(boxFaces(b), b.color === 'outline' ? CONFIG.colors.accent : CONFIG.model.outlineHover);
    for (const m of inst.markers) add(boxFaces(m, true), m.selected ? CONFIG.colors.accent : CONFIG.model.marker);
    for (const b of inst.flags) add(boxFaces(b), CONFIG.model.marker);
    return faces;
}

/** Light a face by its normal (lit from either side, the back dimmer). */
function lit(poly, hex) {
    const n = norm(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
    const f = 0.62 + 0.45 * Math.abs(dot(n, LIGHT)) * (dot(n, LIGHT) >= 0 ? 1 : 0.35);
    return hexToRgb(hex).map((v) => Math.min(255, v * f));
}

/**
 * Draw the scene as the page's camera sees it on a `width` by `height`
 * screen: the cove and its shadow traced per pixel, then the turntable and
 * the house (turned by `yaw`, at scale `k`) rasterized with a depth buffer
 * at twice the size, then shrunk.
 */
function render(inst, { k, yaw, tilt, near = 0, focus = null, houseHeight, width, height, gesture = null, camera = null, withMaya = false }) {
    const aspect = width / height;
    const pose = camera ? { ...camera, offset: [0, 0] } : framePose(aspect, houseHeight, { tilt, focus, near }, CONFIG);
    const W2 = width * 2;
    const H2 = height * 2;
    const eye = pose.eye;
    const f = norm(sub(pose.aim, eye));
    const right = norm(cross(f, [0, 1, 0]));
    const up = cross(right, f);
    const tanV = Math.tan((pose.fov * Math.PI) / 360);
    const tanH = tanV * aspect;
    const [ox, oy] = pose.offset;
    const rgb = new Uint8Array(W2 * H2 * 3);
    const depth = new Float32Array(W2 * H2).fill(-Infinity);
    // The cove: the floor where a ray meets it, with the soft shadow under
    // the turntable, and the curve and wall beyond, all the cove's white.
    const white = hexToRgb(COVE.color);
    for (let y = 0; y < H2; y++) {
        for (let x = 0; x < W2; x++) {
            const nx = ((x + 0.5) / W2 + ox) * 2 - 1;
            const ny = 1 - ((y + 0.5) / H2 + oy) * 2;
            const dir = [0, 1, 2].map((i) => f[i] + right[i] * nx * tanH + up[i] * ny * tanV);
            let shade = 0.93;
            if (dir[1] < 0) {
                const t = -eye[1] / dir[1];
                const px = eye[0] + dir[0] * t;
                const pz = eye[2] + dir[2] * t;
                if (pz > -COVE.back + COVE.radius) shade = 0.95 * (1 - contactAlpha(Math.hypot(px, pz), T.radius, CONFIG.stage.contact));
            }
            rgb.set(white.map((v) => v * shade), (y * W2 + x) * 3);
        }
    }
    const toScreen = (p) => {
        const d = sub(p, eye);
        const zc = dot(d, f);
        const nx = dot(d, right) / (zc * tanH);
        const ny = dot(d, up) / (zc * tanV);
        return [((nx + 1) / 2 - ox) * W2, ((1 - ny) / 2 - oy) * H2, 1 / zc];
    };
    const world = (p) => turnPoint([k * p[0], T.height + k * p[1], k * p[2]], yaw);
    // Maya stands beside the turntable on a wide frame (turntable.js host).
    const maya = (aspect >= CONFIG.view.tallBelow && !camera) || withMaya ? buildMaya(CONFIG) : null;
    const faces = [
        ...turntableFaces().map(({ poly, hex }) => ({ poly, rgb: lit(poly, hex) })),
        ...(maya ? figureFaces(maya, gesture) : []).map(({ poly, hex }) => ({ poly, rgb: lit(poly, hex) })),
        ...facesOf(inst).map(({ poly, rgb: c, alpha }) => ({ poly: poly.map(world), rgb: c, alpha }))
    ];
    // The solid faces first, then any see-through ones, farthest first,
    // each blended over what is in front of nothing nearer.
    const solid = faces.filter((x) => !(x.alpha < 1));
    const clear = faces.filter((x) => x.alpha < 1)
        .map((x) => ({ ...x, d: Math.min(...x.poly.map((p) => toScreen(p)[2])) }))
        .sort((p, q) => p.d - q.d);
    for (const { poly, rgb: c, alpha } of [...solid, ...clear]) {
        const pts = poly.map(toScreen);
        // Behind the eye (or at it), as a camera's near plane would cut it:
        // projected, it would turn inside out across the picture (a close
        // camera, the portrait's, has the turntable behind it).
        if (pts.some((q) => !(q[2] > 0 && q[2] < 20))) continue;
        for (let i = 1; i + 1 < pts.length; i++) tri(pts[0], pts[i], pts[i + 1], c, alpha);
    }
    function tri(a, b, c, col, alpha = 1) {
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        const maxX = Math.min(W2 - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        const maxY = Math.min(H2 - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (Math.abs(area) < 1e-9) return;
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const px = x + 0.5;
                const py = y + 0.5;
                const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
                const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
                const w2 = 1 - w0 - w1;
                if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
                // 1 / depth runs straight across the screen, so it is what
                // is interpolated, and the nearer is the larger.
                const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
                const i = y * W2 + x;
                if (z <= depth[i] * (1 + 1e-6)) continue;
                if (alpha < 1) {
                    for (let ch = 0; ch < 3; ch++) rgb[i * 3 + ch] = rgb[i * 3 + ch] * (1 - alpha) + col[ch] * alpha;
                    continue;
                }
                depth[i] = z;
                rgb[i * 3] = col[0];
                rgb[i * 3 + 1] = col[1];
                rgb[i * 3 + 2] = col[2];
            }
        }
    }
    const out = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let ch = 0; ch < 3; ch++) {
                let sum = 0;
                for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) sum += rgb[((y * 2 + dy) * W2 + (x * 2 + dx)) * 3 + ch];
                out[(y * width + x) * 3 + ch] = sum / 4;
            }
        }
    }
    return { width, height, rgb: out };
}

const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
/** An RGB image as PNG bytes. */
function png({ width, height, rgb }) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 3 + 1)] = 0;
        Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A home's parts on the turntable, its scale, and its closed height. Each
 *  bathroom drawn by its own type of bath, as the page draws it. With
 *  `assembleAt` (seconds), the home part way through building itself, as
 *  model.js assemble and tick have it then. `cut` the side an open floor
 *  leaves out (model.js nearSide, the one nearest the camera). */
function build(home, lifted = null, selection = null, assembleAt = null, cut = 'front') {
    const baths = bathsOf(home);
    const layout = layoutHome(home);
    const k = fitScale(layout, T, CONFIG.model.scale);
    const site = siteFor(layout, T, k);
    const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
    let offsets = levelOffsets(layout.slabs, lifted, CONFIG.model.lift);
    if (assembleAt !== null) {
        const A = CONFIG.model.assemble;
        offsets = new Map(assemblyPlan(layout.slabs, A).map((q) => [q.key, q.from * (1 - smoothstep(Math.min(1, Math.max(0, (assembleAt - q.delay) / A.seconds))))]));
    }
    const inst = instancesFor(layout, offsets, { lifted, cut, areas, site, selection, baths });
    const closed = instancesFor(layout, new Map(), { areas, site });
    // The frame holds the floors lifted above an open one too (main.js
    // frameHeight).
    const houseHeight = k * Math.max(...Object.values(closed).flat().map((p) => p.top)) + (lifted ? CONFIG.model.lift.open * k : 0);
    // An open floor's closer view (main.js fitFrame, model.js focus).
    const focus = lifted ? focusOf(instancesFor(layout, levelOffsets(layout.slabs, lifted, CONFIG.model.lift), { lifted, cut, areas, site, baths }), lifted, k) : null;
    return { inst, k, houseHeight, home, focus };
}

const example = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];
const withGarage = { ...example, levels: [...example.levels, 'garage'], rooms: [...example.rooms, { id: 'g1', level: 'garage', area: 'garage', label: '', deletedAt: null }] };
// The kinds of residence (PRD 8.9), from the example's rooms.
const notBasement = example.rooms.filter((r) => r.level !== 'basement');
const asKind = (residence, levels, rooms) => ({ ...example, id: `kind-${residence.kind}-${levels.join('-')}`, residence, levels, rooms });
const garageRoom = { id: 'tg1', level: 'garage', area: 'garage', label: '', deletedAt: null };
const townEnd = asKind({ kind: 'townhome', attached: 'end' }, ['main', 'second', 'garage'], [...notBasement, garageRoom]);
const townMiddle = asKind({ kind: 'townhome', attached: 'middle' }, ['main', 'second', 'garage'], [...notBasement, garageRoom]);
const townNoGarage = asKind({ kind: 'townhome', attached: 'middle' }, ['main', 'second'], notBasement);
const townBasement = asKind({ kind: 'townhome', attached: 'end' }, ['basement', 'main', 'second', 'garage'], [...example.rooms, garageRoom]);
const condoOne = asKind({ kind: 'condo', attached: null }, ['main'], example.rooms.filter((r) => r.level === 'main'));
const condoTwo = asKind({ kind: 'condo', attached: null }, ['main', 'second'], notBasement);
// One floor and a kitchen, no basement or garage (QA, 2026-10-16: its door
// far left, the maple stood across the walk).
const kitchenOnly = {
    id: 'kitchen-only', serviceType: 'cleaning', levels: ['main'], residence: { kind: 'house' },
    rooms: [{ id: 'k1', level: 'main', area: 'kitchen', label: '', deletedAt: null }],
    items: [0, 1, 2].map((n) => ({ id: `k1-${n}`, roomId: 'k1', task: 'stovetop', order: n + 1, important: false, deletedAt: null }))
};
const widest = { serviceType: 'cleaning', levels: ['basement', 'main', 'second', 'third', 'attic', 'garage', 'detached-garage'], rooms: [], items: [] };
const V = CONFIG.view;
const start = { yaw: V.yaw.start, tilt: V.tilt.start };
const front = { yaw: 0, tilt: V.tilt.open, near: 1 };
/** A floor open but the view not yet closer: where the ease starts. */
const frontWhole = { yaw: 0, tilt: V.tilt.open, near: 0 };
const shot = (built, look, width, height) => ({ ...built, ...look, width, height });

const close = front;

/** Every kind of room, and both kinds of bath, for the close-ups. */
const showcase = {
    id: 'showcase', serviceType: 'cleaning', title: 'Showcase', levels: ['basement', 'main', 'second', 'garage'], items: [],
    rooms: [
        ['kitchen', 'main'], ['living', 'main'], ['dining', 'main'], ['office', 'main'], ['laundry', 'main'], ['powder-room', 'main'],
        ['primary-bedroom', 'second'], ['primary-bathroom', 'second'], ['bathroom', 'second'], ['bedroom', 'second'], ['nursery', 'second'], ['bathroom', 'second'],
        ['family', 'basement'], ['gym', 'basement'], ['playroom', 'basement'], ['bonus', 'basement'], ['mudroom', 'basement'], ['closet', 'basement'],
        ['garage', 'garage'], ['stairs', 'main']
    ].map(([area, level], i) => ({ id: `s${i}`, area, level, label: '', deletedAt: null }))
};
// The second floor's baths: a full primary bath, a shower bath, and a full bath.
for (const [id, bath] of [['s7', 'tub'], ['s8', 'shower'], ['s11', 'tub']]) showcase.rooms.find((r) => r.id === id).bath = bath;

/** A camera close on one room of a built home, its floor open: from in
 *  front and above, looking at the room's middle. */
function closeOn(built, roomId, dist = 0.62, fov = 38) {
    const t = built.inst.tiles.find((x) => x.roomId === roomId);
    const T0 = CONFIG.stage.turntable;
    const c = [built.k * t.position[0], T0.height + built.k * t.position[1], built.k * t.position[2]];
    // Under the floors lifted above, in front of and above the room.
    return { eye: [c[0], c[1] + dist * 0.55, c[2] + dist], aim: [c[0], c[1], c[2] - 0.03], fov };
}
/** A camera close on the front door, from in front and a little above. */
function closeOnDoor(built, dist = 0.5, fov = 38) {
    const d = built.inst.windows.find((p) => p.color === 'door');
    const T0 = CONFIG.stage.turntable;
    const c = [built.k * d.position[0], T0.height + built.k * d.position[1], built.k * d.position[2]];
    return { eye: [c[0] + dist * 0.25, c[1] + dist * 0.2, c[2] + dist], aim: c, fov };
}
/** A camera on Maya's face, `turn` radians round from straight on, `dist`
 *  meters off: her smile checked by eye (QA, 2026-10-15). */
function faceCamera(turn = 0, dist = 0.42, fov = 30) {
    const maya = buildMaya(CONFIG);
    maya.group.updateMatrixWorld(true);
    let smile = null;
    maya.group.traverse((o) => { if (o.name === 'smile') smile = o; });
    const at = [0, 0, 0];
    if (smile) {
        const e = smile.matrixWorld.elements;
        at[0] = e[12]; at[1] = e[13]; at[2] = e[14];
    }
    const a = CONFIG.cast.maya.facing + turn;
    const mid = [at[0], at[1] + 0.045, at[2]];
    return { eye: [mid[0] + Math.sin(a) * dist, mid[1] + 0.02, mid[2] + Math.cos(a) * dist], aim: mid, fov };
}
const faceShot = (title, turn, dist) => [title, { ...shot(build(EMPTY_HOME), start, 800, 800), camera: faceCamera(turn, dist), withMaya: true }];
/** A camera on all of Maya, `turn` radians round from straight on: her
 *  figure judged from the front, three-quarters and the side (QA,
 *  2026-10-16: her waist). */
function bodyCamera(turn = 0, dist = 3.6, fov = 30) {
    const maya = buildMaya(CONFIG);
    maya.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(maya.group);
    const mid = [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2];
    const a = CONFIG.cast.maya.facing + turn;
    return { eye: [mid[0] + Math.sin(a) * dist, mid[1] + 0.05, mid[2] + Math.cos(a) * dist], aim: mid, fov };
}
/** A camera on Maya's feet, `turn` radians round from straight on, a
 *  little above them: her shoes judged by eye (QA, 2026-10-16). */
function feetCamera(turn = 0, dist = 0.9, fov = 30) {
    const maya = buildMaya(CONFIG);
    maya.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(maya.group);
    const k = (box.max.y - box.min.y) / 1.75;
    const mid = [(box.min.x + box.max.x) / 2, box.min.y + 0.06 * k, (box.min.z + box.max.z) / 2];
    const a = CONFIG.cast.maya.facing + turn;
    return { eye: [mid[0] + Math.sin(a) * dist, mid[1] + 0.35, mid[2] + Math.cos(a) * dist], aim: mid, fov };
}
const bodyShot = (title, turn) => [title, { ...shot(build(EMPTY_HOME), start, 700, 900), camera: bodyCamera(turn), withMaya: true }];
/** The bubble's round portrait, framed as cast.js frames it
 *  (portraitPose), at five times its canvas. */
const portraitShot = (title) => {
    const pose = portraitPose(buildMaya(CONFIG).head(), CONFIG.cast.maya.facing);
    return [title, { ...shot(build(EMPTY_HOME), start, PORTRAIT.width * 5, PORTRAIT.height * 5), camera: { eye: pose.eye, aim: pose.aim, fov: pose.fov }, withMaya: true }];
};

const doorShot = (home, title) => {
    const built = build(home);
    return [title, { ...shot(built, { yaw: 0, tilt: 0.4 }, 1000, 640), camera: closeOnDoor(built) }];
};
const roomShot = (lifted, roomId, title, dist) => {
    const built = build(showcase, lifted, null);
    return [title, { ...shot(built, { yaw: 0, tilt: 0.4 }, 1000, 640), camera: closeOn(built, roomId, dist) }];
};
/** The roof from the side, the back and the back corner (QA, 2026-10-15:
 *  the cross gable showed through the back slope, and its eave along the
 *  side wall). */
const roofViews = [
    ['Roof check: the plain house from its left side', shot(build(EMPTY_HOME), { yaw: Math.PI / 2, tilt: V.tilt.start }, 1000, 640)],
    ['Roof check: the plain house from the back', shot(build(EMPTY_HOME), { yaw: Math.PI, tilt: V.tilt.start }, 1000, 640)],
    ['Roof check: the plain house from its back left corner', shot(build(EMPTY_HOME), { yaw: Math.PI * 0.75, tilt: V.tilt.start }, 1000, 640)],
    ['Roof check: the example from its back right corner', shot(build(example), { yaw: -Math.PI * 0.75, tilt: V.tilt.start }, 1000, 640)],
    ['Roof check: the widest home from its left side', shot(build(withGarage), { yaw: Math.PI / 2, tilt: V.tilt.start }, 1000, 640)],
    ['Path check: the plain house from above its front', shot(build(EMPTY_HOME), { yaw: 0, tilt: 1.2 }, 1000, 640)],
    ['Path check: the example from above its front', shot(build(example), { yaw: 0, tilt: 1.2 }, 1000, 640)],
    ['Path check: one floor and a kitchen from above its front', shot(build(kitchenOnly), { yaw: 0, tilt: 1.2 }, 1000, 640)],
    ['Path check: one floor and a kitchen on arrival', shot(build(kitchenOnly), start, 1280, 800)]
];
const assembleViews = [0, 0.6, 1.2, 1.8].map((t) => [`The example building itself, ${t} seconds in`, shot(build(example, null, null, t), start, 1280, 800)]);
const kindViews = [
    ['A townhome, an end unit, its garage tucked under', shot(build(townEnd), start, 1280, 800)],
    ['A townhome between two neighbors', shot(build(townMiddle), start, 1280, 800)],
    ['A townhome between two, no garage', shot(build(townNoGarage), start, 1280, 800)],
    ['A townhome over a basement, its garage a story up', shot(build(townBasement), start, 1280, 800)],
    ['A townhome, its main floor open', shot(build(townMiddle, 'main'), front, 1280, 800)],
    ['A condo on one level', shot(build(condoOne), start, 1280, 800)],
    ['A condo on two levels', shot(build(condoTwo), start, 1280, 800)],
    ['A condo, its main floor open', shot(build(condoTwo, 'main'), front, 1280, 800)],
    ['A townhome on a phone upright', shot(build(townMiddle), start, 390, 844)],
    ['A condo on a phone upright', shot(build(condoTwo), start, 390, 844)],
    doorShot(townEnd, "A townhome's stoop and its tucked garage")
];
const views = [
    ['The example home on arrival, a laptop (1280 by 800)', shot(build(example), start, 1280, 800)],
    ['On arrival, a phone upright (390 by 844), the bottom 45% kept for the sheet', shot(build(example), start, 390, 844)],
    ['Its main floor open, the whole house still framed (the closer view eases in from here)', shot(build(example, 'main'), frontWhole, 1280, 800)],
    ['Its main floor open, the closer view', shot(build(example, 'main'), front, 1280, 800)],
    ['Its second floor open, the closer view', shot(build(example, 'second'), front, 1280, 800)],
    ['Its basement open, the closer view', shot(build(example, 'basement'), front, 1280, 800)],
    ['Its main floor open, the closer view, a narrower laptop (1024 by 768)', shot(build(example, 'main'), front, 1024, 768)],
    ['Its main floor open, the closer view, a phone upright', shot(build(example, 'main'), front, 390, 844)],
    ['Every level, the attic open, the closer view', shot(build(widest, 'attic'), front, 1280, 800)],
    // The open side follows the turn (QA, 2026-10-16): the wall nearest the
    // camera steps aside, whichever it is. The first is how it was.
    ['Cutaway BEFORE: main floor open, turned half round, only the front ever left out', shot(build(example, 'main', null, null, 'front'), { ...front, yaw: Math.PI }, 1280, 800)],
    ...[['half round, the back left out', Math.PI], ['a quarter clockwise, the right left out', -Math.PI / 2],
        ['a quarter the other way, the left left out', Math.PI / 2], ['three-quarters from behind', Math.PI - 0.6],
        ['second floor, from behind', Math.PI, 'second']]
        .map(([words, yaw, level = 'main']) => [`Cutaway: ${words}`, shot(build(example, level, null, null, nearSide(yaw, null, V.cut.margin)), { ...front, yaw }, 1280, 800)]),
    ['An empty house, as a first visit will meet it', shot(build(EMPTY_HOME), start, 1280, 800)],
    ['The widest home there can be, with a garage', shot(build(withGarage), start, 1280, 800)],
    ['Every level, the tallest', shot(build(widest), start, 1280, 800)],
    ['Maya waving hello', { ...shot(build(EMPTY_HOME), start, 1280, 800), gesture: { name: 'wave', t: 1.0 } }],
    ['Maya pointing to the house', { ...shot(build(example), start, 1280, 800), gesture: { name: 'point', t: 1.0 } }],
    faceShot("Maya's face, straight on", 0, 0.42),
    bodyShot("Maya's figure, straight on", 0),
    bodyShot("Maya's figure, three-quarters to her left", 0.7),
    bodyShot("Maya's figure, from her side", Math.PI / 2),
    ...[["Maya's feet, straight on", 0], ["Maya's feet, three-quarters", 0.7], ["Maya's feet, from her side", Math.PI / 2]]
        .map(([title, turn]) => [title, { ...shot(build(EMPTY_HOME), start, 800, 600), camera: feetCamera(turn), withMaya: true }]),
    faceShot("Maya's face, three-quarters to her left", 0.6, 0.42),
    faceShot("Maya's face, three-quarters to her right", -0.6, 0.42),
    portraitShot("Maya's bubble portrait (crop to a circle)"),
    ['A narrower laptop (1024 by 768)', shot(build(example), start, 1024, 768)],
    ['Close: the main floor (kitchen, living, dining, office, entry, half bath)', shot(build(example, 'main'), close, 1400, 900)],
    ['Close: the second floor (bedrooms, a shower primary bath, a full hall bath)', shot(build(example, 'second'), close, 1400, 900)],
    ['Close: the basement', shot(build(example, 'basement'), close, 1400, 900)],
    doorShot(EMPTY_HOME, 'The front door of a house with no basement: the stone stops at the door and the windows'),
    doorShot(example, "The example's front door, up its steps"),
    roomShot('main', 's0', 'Kitchen'),
    roomShot('main', 's5', 'Half bath'),
    roomShot('main', 's4', 'Laundry'),
    roomShot('main', 's3', 'Office'),
    roomShot('second', 's7', 'Primary bath, full'),
    roomShot('second', 's8', 'Bathroom, shower bath'),
    roomShot('second', 's11', 'Bathroom, full bath'),
    roomShot('second', 's6', 'Primary bedroom'),
    roomShot('second', 's10', 'Nursery'),
    roomShot('basement', 's13', 'Gym'),
    roomShot('basement', 's14', 'Playroom'),
    roomShot('garage', 's18', 'Garage', 1.1),
    roomShot('main', 's19', 'Stairs'),
    ['Stairs, its floor open in the closer view, turned three-quarters', shot(build(showcase, 'main'), { ...front, yaw: -0.6 }, 1280, 800)],
    ['Stairs, its floor open in the closer view, turned the other way', shot(build(showcase, 'main'), { ...front, yaw: 0.6 }, 1280, 800)],
    ['The main floor open, the kitchen selected and a task in it, the living room hovered', shot(build(example, 'main', {
        roomId: example.rooms.find((r) => r.area === 'kitchen').id,
        itemId: example.items.find((i) => i.roomId === example.rooms.find((r) => r.area === 'kitchen').id).id,
        hoverRoomId: (example.rooms.find((r) => r.area === 'living' && r.level === 'main') || {}).id
    }), front, 1280, 800)]
];

// `--kinds` renders the kinds of residence alone, to kind-*.png and
// kinds.html, which is quicker while their models are being made.
// `--assemble` the example building itself, to assemble-*.png and
// assemble.html.
const onlyKinds = process.argv.includes('--kinds');
const onlyAssemble = process.argv.includes('--assemble');
// `--match <words>` renders only the views whose titles hold those words.
const matchAt = process.argv.indexOf('--match');
const match = matchAt > 0 ? String(process.argv[matchAt + 1] || '').toLowerCase() : '';
const all = onlyAssemble ? assembleViews : onlyKinds ? kindViews : [...views, ...roofViews, ...kindViews, ...assembleViews];
const list = match ? all.filter(([title]) => title.toLowerCase().includes(match)) : all;
// A matched few go to match-*.png and match.html, leaving the full set be.
const prefix = match ? 'match' : onlyAssemble ? 'assemble' : onlyKinds ? 'kind' : 'model';
await mkdir(path.dirname(OUT), { recursive: true });
const shots = [];
for (const [i, [title, opts]] of list.entries()) {
    const file = `${prefix}-${i + 1}.png`;
    await writeFile(path.join(path.dirname(OUT), file), png(render(opts.inst, opts)));
    shots.push([title, file]);
}
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Whitestone house model</title>
<style>body { margin: 24px; font-family: -apple-system, sans-serif; background: #E9E6E0; color: #22252A; } section { margin-bottom: 28px; } h2 { font-size: 18px; margin: 0 0 8px; } img { border-radius: 10px; max-width: 100%; }</style></head><body>
<h1>The house on its turntable, through the page's camera</h1>
${shots.map(([title, file]) => `<section><h2>${title}</h2><img src="${file}" alt="${title}"></section>`).join('\n')}
</body></html>`;
const pageName = match ? 'match.html' : onlyAssemble ? 'assemble.html' : onlyKinds ? 'kinds.html' : path.basename(OUT);
await writeFile(path.join(path.dirname(OUT), pageName), page);
console.log(`Wrote specs/whitestone/previews/${pageName} and ${shots.length} pictures.`);
