// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * preview-raster.mjs - a small software rasterizer with a depth buffer, and a
 * PNG writer, for checking a real three.js model by eye without a browser
 * (the "a preview renderer beats guessing" lesson). Moved here from
 * scripts/dance-preview.mjs on 2026-10-24 so scripts/avatar-preview.mjs can
 * draw the same way.
 *
 * It draws the model's own triangles through a real three.js camera,
 * flat-shaded, four samples a pixel. Lighting is rough; the shapes are exact.
 * A transparent material is blended over what is behind it at its opacity,
 * after everything opaque, and writes no depth (as three draws it).
 *
 * Uses the global THREE (tests/helpers/real-three.mjs's loadRealThree).
 */

import { deflateSync } from 'node:zlib';

const SS = 2;

export function norm(v) {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
}

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function tri([p0, p1, p2], color, alpha, rgb, depth, W, H) {
    if (p0[2] <= 0 || p1[2] <= 0 || p2[2] <= 0) return;
    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
            const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2];
            const i = y * W + x;
            if (z >= depth[i]) continue;
            if (alpha >= 1) {
                depth[i] = z;
                rgb.set(color, i * 3);
            } else {
                for (let ch = 0; ch < 3; ch++) rgb[i * 3 + ch] = rgb[i * 3 + ch] * (1 - alpha) + color[ch] * alpha;
            }
        }
    }
}

/** Draw `object` into a `w` by `h` RGB buffer (Uint8Array) through
 *  `camera`, on `bg`, lit from `light` (a direction). */
export function render(object, camera, w, h, { bg = [236, 230, 220], light = norm([0.4, 0.8, 0.6]) } = {}) {
    const THREE = globalThis.THREE;
    const W = w * SS;
    const H = h * SS;
    const rgb = new Float32Array(W * H * 3);
    for (let i = 0; i < W * H; i++) rgb.set(bg, i * 3);
    const depth = new Float32Array(W * H).fill(Infinity);
    object.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const view = camera.matrixWorldInverse;
    const proj = camera.projectionMatrix;
    const v = new THREE.Vector3();
    const shown = (o) => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false;
        return true;
    };
    const meshes = [];
    object.traverse((mesh) => {
        if (mesh.isMesh && shown(mesh)) meshes.push(mesh);
    });
    // Opaque first, then the see-through, as three draws them. A mesh with
    // several materials (a brim's top and underside) colors each triangle
    // by its geometry group.
    const first = (m) => (Array.isArray(m.material) ? m.material[0] : m.material);
    const alphaOf = (m) => (first(m).transparent ? first(m).opacity : 1);
    meshes.sort((a, b) => (alphaOf(a) < 1) - (alphaOf(b) < 1));
    for (const mesh of meshes) {
        const pos = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        const rgbOf = (mat) => {
            const col = mat && mat.color ? mat.color.getHex() : 0x888888;
            return [(col >> 16) & 255, (col >> 8) & 255, col & 255];
        };
        const groups = Array.isArray(mesh.material) ? mesh.geometry.groups : null;
        const baseAt = (t) => {
            if (!groups) return rgbOf(mesh.material);
            const g = groups.find((x) => t >= x.start && t < x.start + x.count);
            return rgbOf(mesh.material[g ? g.materialIndex : 0]);
        };
        const alpha = alphaOf(mesh);
        const world = [];
        const screen = [];
        for (let k = 0; k < pos.count; k++) {
            v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
            world.push([v.x, v.y, v.z]);
            const c = v.clone().applyMatrix4(view);
            const z = -c.z;
            c.applyMatrix4(proj);
            screen.push([(c.x * 0.5 + 0.5) * W, (1 - (c.y * 0.5 + 0.5)) * H, z]);
        }
        const count = index ? index.count : pos.count;
        for (let t = 0; t < count; t += 3) {
            const ids = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
            const [a, b, c] = ids.map((i) => world[i]);
            const n = norm(cross(sub(b, a), sub(c, a)));
            const lit = 0.45 + 0.55 * Math.abs(dot(n, light));
            tri(ids.map((i) => screen[i]), baseAt(t).map((x) => x * lit), alpha, rgb, depth, W, H);
        }
    }
    const out = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            for (let ch = 0; ch < 3; ch++) {
                let s = 0;
                for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) s += rgb[((y * SS + dy) * W + x * SS + dx) * 3 + ch];
                out[(y * w + x) * 3 + ch] = Math.min(255, s / (SS * SS));
            }
        }
    }
    return out;
}

/** Copy a `w` by `h` cell into a sheet `sheetW` wide, at column `col`, row
 *  `row` (in cells). */
export function place(sheet, sheetW, cell, w, h, col, row) {
    for (let y = 0; y < h; y++) {
        const from = y * w * 3;
        sheet.set(cell.subarray(from, from + w * 3), ((row * h + y) * sheetW + col * w) * 3);
    }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
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

/** An RGB buffer as PNG bytes. */
export function png(width, height, rgb) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
