// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * whitestone-model-preview.mjs - The house model, drawn from its own parts,
 * for checking by eye without a browser (QA, 2026-10-13: "We really need to
 * nail the house").
 *
 *   npm run build && node scripts/whitestone-model-preview.mjs
 *
 * Writes specs/whitestone/previews/model.html (git-ignored): the example
 * home on its site from the front, from three quarters, and with its main
 * floor lifted, and the empty house, as PNGs beside it. A small software
 * rasterizer with a depth buffer over model.js's `instancesFor`: every box,
 * gable and tree as flat-shaded triangles in an orthographic view, drawn at
 * twice the size and shrunk for smooth edges, so what it shows is the
 * model's own numbers, not a drawing of them. Lighting and materials are
 * rough; the shapes, colors and placement are exact.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instancesFor, levelOffsets, fitScale, HOUSE } from '../www/whitestone/js/model.js';
import { layoutHome } from '../www/whitestone/js/layout.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { CONFIG } from '../www/whitestone/js/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'whitestone', 'previews', 'model.html');
const NOW = new Date('2026-10-12T16:00:00Z');
const PAL = CONFIG.model.palette;
const LIGHT = norm([-0.45, 0.8, 0.55]);

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

function hexToRgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function shade(hex, f) {
    return `rgb(${hexToRgb(hex).map((v) => Math.round(Math.min(255, v * f))).join(',')})`;
}

/** Every face of every part, as flat-colored polygons in the model's frame. */
function facesOf(inst) {
    const faces = [];
    const add = (polys, hex) => {
        for (const poly of polys) {
            const n = norm(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
            // Lit from either side, so a face wound either way shades alike.
            const f = 0.62 + 0.45 * Math.abs(dot(n, LIGHT)) * (dot(n, LIGHT) >= 0 ? 1 : 0.35);
            faces.push({ poly, rgb: hexToRgb(hex).map((v) => Math.min(255, v * f)) });
        }
    };
    const color = (p, fallback) => PAL[p.color] || fallback;
    for (const b of inst.slabs) add(boxFaces(b), color(b, PAL.wall));
    for (const b of [...inst.walls, ...inst.siding, ...inst.windows, ...inst.trims, ...inst.fixtures, ...inst.site, ...inst.tiles]) add(boxFaces(b), color(b, '#FF00FF'));
    for (const b of inst.roofs) add(boxFaces(b), PAL.roof);
    for (const g of inst.gables) add(prismFaces(g), color(g, PAL.wall));
    for (const b of [...inst.canopies, ...inst.blooms]) add(blobFaces(b), color(b, PAL.leaves));
    for (const b of inst.firs) add(coneFaces(b), color(b, PAL.fir1));
    for (const m of inst.markers) add(boxFaces(m, true), CONFIG.model.marker);
    for (const b of inst.flags) add(boxFaces(b), CONFIG.model.marker);
    return faces;
}

/** Rasterize with a depth buffer at twice the size, then shrink by four
 *  samples a pixel. Returns RGB bytes. */
function render(inst, { yaw, pitch, scale, width, height, cx = 0, cy = 0.2 }) {
    const W2 = width * 2;
    const H2 = height * 2;
    const rgb = new Uint8Array(W2 * H2 * 3).fill(0);
    for (let i = 0; i < W2 * H2; i++) rgb.set([244, 242, 238], i * 3);
    const depth = new Float32Array(W2 * H2).fill(-Infinity);
    const view = (p) => rotate(rotate(p, [0, yaw, 0]), [pitch, 0, 0]);
    const toScreen = (p) => {
        const v = view(p);
        return [W2 / 2 + (v[0] - cx) * scale * 2, H2 / 2 - (v[1] - cy) * scale * 2, v[2]];
    };
    for (const { poly, rgb: c } of facesOf(inst)) {
        const pts = poly.map(toScreen);
        for (let k = 1; k + 1 < pts.length; k++) tri(pts[0], pts[k], pts[k + 1], c);
    }
    function tri(a, b, c, col) {
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
                const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
                const i = y * W2 + x;
                // A nudge toward the viewer for what lies on a face (the
                // siding's courses, the windows), drawn after the wall.
                if (z <= depth[i] + 1e-7) continue;
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

function build(home, lifted = null) {
    const layout = layoutHome(home);
    const p = CONFIG.studio.plinth;
    const k = fitScale(layout, p, CONFIG.model.scale);
    const site = { halfWidth: (p.width / 2 - HOUSE.site.rim) / k, halfDepth: (p.depth / 2 - HOUSE.site.rim) / k };
    const areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
    return instancesFor(layout, levelOffsets(layout.slabs, lifted, CONFIG.model.lift), { lifted, areas, site });
}

const example = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];
const withGarage = { ...example, levels: [...example.levels, 'garage'], rooms: [...example.rooms, { id: 'g1', level: 'garage', area: 'garage', label: '', deletedAt: null }] };
const empty = { serviceType: 'cleaning', levels: ['main'], rooms: [], items: [] };

const views = [
    ['The example home with a garage, from the front', build(withGarage), { yaw: 0, pitch: 0.12, scale: 380, width: 900, height: 560, cy: 0.35 }],
    ['From three quarters, as the studio sees it', build(withGarage), { yaw: -0.5, pitch: 0.38, scale: 380, width: 900, height: 600, cy: 0.3 }],
    ['The main floor lifted', build(withGarage, 'main'), { yaw: -0.25, pitch: 0.55, scale: 380, width: 900, height: 700, cy: 0.42 }],
    ['An empty plinth', build(empty), { yaw: -0.5, pitch: 0.38, scale: 380, width: 900, height: 520, cy: 0.2 }]
];

await mkdir(path.dirname(OUT), { recursive: true });
const shots = [];
for (const [i, [title, inst, opts]] of views.entries()) {
    const file = `model-${i + 1}.png`;
    await writeFile(path.join(path.dirname(OUT), file), png(render(inst, opts)));
    shots.push([title, file]);
}
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Whitestone house model</title>
<style>body { margin: 24px; font-family: -apple-system, sans-serif; background: #E9E6E0; color: #22252A; } section { margin-bottom: 28px; } h2 { font-size: 18px; margin: 0 0 8px; } img { border-radius: 10px; max-width: 100%; }</style></head><body>
<h1>The house model, drawn from its own parts</h1>
${shots.map(([title, file]) => `<section><h2>${title}</h2><img src="${file}" alt="${title}"></section>`).join('\n')}
</body></html>`;
await writeFile(OUT, page);
console.log(`Wrote ${path.relative(ROOT, OUT)} and ${shots.length} pictures.`);
