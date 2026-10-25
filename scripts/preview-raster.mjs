// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * preview-raster.mjs - a small software rasterizer with a depth buffer, and a
 * PNG writer, for checking a real three.js model by eye without a browser
 * (the "a preview renderer beats guessing" lesson). Moved here from
 * scripts/dance-preview.mjs on 2026-10-24 so scripts/avatar-preview.mjs can
 * draw the same way.
 *
 * It draws the model's own triangles through a real three.js camera, four
 * samples a pixel, AS THREE WOULD: shaded by the vertex normals blended
 * across each triangle, a single-sided material's back faces culled (and a
 * double-sided one's lit from their own side), and a sun's shadow cast from
 * its own depth map (2026-10-24: flat-shaded by each triangle's own face
 * normal, drawing every side, it could not show a solid built inside out,
 * which in the browser drew only its inner surface and shaded itself: the
 * hair's scalp showing through, and the hair dark on top). Lighting is still
 * rough: one sun, flat ambient, no tone mapping. The shapes are exact.
 *
 * A transparent material is blended over what is behind it at its opacity,
 * after everything opaque, writes no depth and casts no shadow (as three
 * draws it).
 *
 * A material's `map`, when it is a DataTexture (the hair's strands,
 * 2026-10-25), is read at each pixel's uv (nearest texel, wrapping as the
 * texture says) and multiplied into the color, as three does; any other
 * kind of texture is ignored.
 *
 * Uses the global THREE (tests/helpers/real-three.mjs's loadRealThree).
 */

import { deflateSync } from 'node:zlib';

const SS = 2;
/** The shadow map's side, in texels, and how far a point is moved toward
 *  the light (plus a texel) before it is compared, so a surface does not
 *  shade itself (three's shadow bias and normalBias). */
const SHADOW = { size: 2048, bias: 0.0008, normalBias: 0.0015, dark: 0.0 };

export function norm(v) {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
}

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Walk every pixel center of a `W` by `H` grid inside the triangle
 *  `p0 p1 p2` ([x, y, ...] each), calling `at(i, w0, w1, w2)` with the pixel's
 *  index and its barycentric weights. Returns the triangle's signed area
 *  (0 when it covers nothing). */
function walk([p0, p1, p2], W, H, at) {
    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area) < 1e-9) return 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
            const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            at(y * W + x, w0, w1, w2);
        }
    }
    return area;
}

/** Draw `object` into a `w` by `h` RGB buffer (Uint8Array) through
 *  `camera`, on `bg`, lit from `light` (a direction toward the sun), with
 *  the sun's shadows unless `shadows` is false. */
export function render(object, camera, w, h, { bg = [236, 230, 220], light = norm([0.4, 0.8, 0.6]), shadows = true } = {}) {
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
    const n3 = new THREE.Matrix3();
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
    const rgbOf = (mat) => {
        const col = mat && mat.color ? mat.color.getHex() : 0x888888;
        return [(col >> 16) & 255, (col >> 8) & 255, col & 255];
    };
    /** A sampler of the material's map at (u, v), as [r, g, b] factors, or
     *  null when it has none to read. */
    const samplerOf = (mat) => {
        const map = mat && mat.map;
        if (!map || !map.isDataTexture || !map.image || !map.image.data) return null;
        const { data, width, height } = map.image;
        const wrap = (x, mode) => (mode === THREE.RepeatWrapping ? x - Math.floor(x) : Math.min(1, Math.max(0, x)));
        return (u, v) => {
            const i = Math.min(width - 1, Math.floor(wrap(u, map.wrapS) * width));
            const j = Math.min(height - 1, Math.floor(wrap(v, map.wrapT) * height));
            const o = (j * width + i) * 4;
            return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
        };
    };
    // Every triangle, with its corners in the world, on the screen, and
    // their normals.
    const tris = [];
    const worldAll = [];
    for (const mesh of meshes) {
        const pos = mesh.geometry.attributes.position;
        const nrm = mesh.geometry.attributes.normal;
        const uv = mesh.geometry.attributes.uv;
        const index = mesh.geometry.index;
        const groups = Array.isArray(mesh.material) ? mesh.geometry.groups : null;
        const materialAt = (t) => {
            if (!groups) return mesh.material;
            const g = groups.find((x) => t >= x.start && t < x.start + x.count);
            return mesh.material[g ? g.materialIndex : 0];
        };
        const alpha = alphaOf(mesh);
        n3.getNormalMatrix(mesh.matrixWorld);
        const world = [];
        const screen = [];
        const normals = [];
        for (let k = 0; k < pos.count; k++) {
            v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
            world.push([v.x, v.y, v.z]);
            worldAll.push(world[k]);
            const c = v.clone().applyMatrix4(view);
            const z = -c.z;
            c.applyMatrix4(proj);
            screen.push([(c.x * 0.5 + 0.5) * W, (1 - (c.y * 0.5 + 0.5)) * H, z]);
            normals.push(nrm ? norm(v.fromBufferAttribute(nrm, k).applyMatrix3(n3).toArray()) : null);
        }
        const count = index ? index.count : pos.count;
        for (let t = 0; t < count; t += 3) {
            const ids = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
            const mat = materialAt(t);
            const p = ids.map((i) => world[i]);
            const face = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
            const sample = uv ? samplerOf(mat) : null;
            tris.push({
                world: p, screen: ids.map((i) => screen[i]), normals: ids.map((i) => normals[i] || face),
                color: rgbOf(mat), alpha, side: mat ? mat.side : THREE.FrontSide,
                sample, uvs: sample ? ids.map((i) => [uv.getX(i), uv.getY(i)]) : null
            });
        }
    }

    // The sun's shadow map: the depth toward the sun of the nearest opaque
    // surface, over the model's extent, square on to the light.
    let inShadow = () => false;
    if (shadows && tris.length) {
        const up = Math.abs(light[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const u = norm(cross(light, up));
        const vv = cross(u, light);
        const lx = (p) => dot(p, u);
        const ly = (p) => dot(p, vv);
        const ld = (p) => dot(p, light);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of worldAll) {
            x0 = Math.min(x0, lx(p)); x1 = Math.max(x1, lx(p));
            y0 = Math.min(y0, ly(p)); y1 = Math.max(y1, ly(p));
        }
        const N = SHADOW.size;
        const span = Math.max(x1 - x0, y1 - y0) * 1.02 + 1e-6;
        const texel = span / N;
        const toMap = (p) => [((lx(p) - x0) / span) * N + 1, ((ly(p) - y0) / span) * N + 1];
        const map = new Float32Array(N * N).fill(-Infinity);
        for (const tri of tris) {
            if (tri.alpha < 1) continue;
            const d = tri.world.map(ld);
            walk(tri.world.map(toMap), N, N, (i, w0, w1, w2) => {
                const z = w0 * d[0] + w1 * d[1] + w2 * d[2];
                if (z > map[i]) map[i] = z;
            });
        }
        inShadow = (p, n) => {
            const q = [p[0] + n[0] * SHADOW.normalBias, p[1] + n[1] * SHADOW.normalBias, p[2] + n[2] * SHADOW.normalBias];
            const [mx, my] = toMap(q);
            const i = Math.min(N - 1, Math.max(0, Math.floor(my))) * N + Math.min(N - 1, Math.max(0, Math.floor(mx)));
            return ld(q) + SHADOW.bias + texel < map[i];
        };
    }

    // Draw. A triangle's facing on the screen: three draws a front face
    // counter-clockwise with y up, which is clockwise here with y down, so a
    // negative area faces the camera.
    for (const tri of tris) {
        const [s0, s1, s2] = tri.screen;
        if (s0[2] <= 0 || s1[2] <= 0 || s2[2] <= 0) continue;
        const area = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
        const front = area < 0;
        if (tri.side === THREE.FrontSide && !front) continue;
        if (tri.side === THREE.BackSide && front) continue;
        const flip = front ? 1 : -1;
        const [n0, n1, n2] = tri.normals;
        const [p0, p1, p2] = tri.world;
        walk(tri.screen, W, H, (i, w0, w1, w2) => {
            const z = w0 * s0[2] + w1 * s1[2] + w2 * s2[2];
            if (z >= depth[i]) return;
            const n = norm([
                flip * (w0 * n0[0] + w1 * n1[0] + w2 * n2[0]),
                flip * (w0 * n0[1] + w1 * n1[1] + w2 * n2[1]),
                flip * (w0 * n0[2] + w1 * n1[2] + w2 * n2[2])
            ]);
            const p = [w0 * p0[0] + w1 * p1[0] + w2 * p2[0], w0 * p0[1] + w1 * p1[1] + w2 * p2[1], w0 * p0[2] + w1 * p1[2] + w2 * p2[2]];
            const sun = Math.max(0, dot(n, light)) * (inShadow(p, n) ? SHADOW.dark : 1);
            const lit = 0.45 + 0.55 * sun;
            let color = tri.color;
            if (tri.sample) {
                const [t0, t1, t2] = tri.uvs;
                const f = tri.sample(w0 * t0[0] + w1 * t1[0] + w2 * t2[0], w0 * t0[1] + w1 * t1[1] + w2 * t2[1]);
                color = [tri.color[0] * f[0], tri.color[1] * f[1], tri.color[2] * f[2]];
            }
            if (tri.alpha >= 1) {
                depth[i] = z;
                for (let ch = 0; ch < 3; ch++) rgb[i * 3 + ch] = color[ch] * lit;
            } else {
                for (let ch = 0; ch < 3; ch++) rgb[i * 3 + ch] = rgb[i * 3 + ch] * (1 - tri.alpha) + color[ch] * lit * tri.alpha;
            }
        });
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
