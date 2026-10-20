// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dance-preview.mjs - the shared dances (shared/js/dance-1.0.0.js), drawn
 * pose by pose for checking by eye without a browser (the "a preview
 * renderer beats guessing" lesson). Run it after writing or changing a
 * dance, before anyone sees it in a browser.
 *
 *   npm run build && node --experimental-vm-modules scripts/dance-preview.mjs [--motion] [dance ...]
 *
 * With --motion, dance-<id>-motion.png instead: a frame every tenth of a
 * second through one loop, front view only, rows of ten, so the moves
 * BETWEEN the poses can be checked too (Steve's QA, 2026-10-20: the poses
 * were right and the arms between them were not).
 *
 * Writes specs/dance-previews/dance-<id>.png (git-ignored): one column a
 * pose of the dance (in the middle of its hold), drawn from the front, as
 * the crowd shot sees it, and from the dancer's left side. A small software
 * rasterizer with a depth buffer over the real three.js figure (people-1.0.0's
 * createPerson, jointed by dance-1.0.0), flat-shaded, so what it shows is the rig's own geometry in the
 * dance's own angles. Lighting is rough; the shapes and the poses are exact.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealThree } from '../tests/helpers/real-three.mjs';

const THREE = await loadRealThree();
globalThis.THREE = THREE;
const { DANCES, danceAt, loopOf, jointPerson, applyPose } = await import('../www/shared/js/dance-1.0.0.js');
const { createPerson } = await import('../www/shared/js/people-1.0.0.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'dance-previews');
const CELL = { w: 200, h: 260 };
const SS = 2;
const LIGHT = norm([0.4, 0.8, 0.6]);
const BG = [236, 230, 220];

function norm(v) {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
}

/** Draw `object` into a `w` by `h` RGB buffer through `camera`. */
function render(object, camera, w, h) {
    const W = w * SS;
    const H = h * SS;
    const rgb = new Float32Array(W * H * 3);
    for (let i = 0; i < W * H; i++) rgb.set(BG, i * 3);
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
    object.traverse((mesh) => {
        if (!mesh.isMesh || !shown(mesh)) return;
        const pos = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        const col = mesh.material.color ? mesh.material.color.getHex() : 0x888888;
        const base = [(col >> 16) & 255, (col >> 8) & 255, col & 255];
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
            const lit = 0.45 + 0.55 * Math.abs(dot(n, LIGHT));
            const shade = base.map((x) => x * lit);
            tri(ids.map((i) => screen[i]), shade, rgb, depth, W, H);
        }
    });
    // Down to size, four samples a pixel.
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

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function tri([p0, p1, p2], color, rgb, depth, W, H) {
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
            depth[i] = z;
            rgb.set(color, i * 3);
        }
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
function png(width, height, rgb) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// A grown-up in a red shirt and long sleeves, as Derby Day's crowd dresses.
const LOOK = { shirt: 0xc8322b, pants: 0x3b4f7a, skin: 0xc68642, hair: 0x2b1d14, style: 'short', scale: 1 };

function camera(from) {
    const cam = new THREE.PerspectiveCamera(32, CELL.w / CELL.h, 0.1, 50);
    cam.position.set(...from);
    cam.lookAt(0, 1.05, 0);
    return cam;
}
// From the front a little to the dancer's right, as the crowd shot is, and
// from the dancer's left.
const VIEWS = [camera([-0.9, 1.35, 3.9]), camera([3.9, 1.3, 0.3])];

await mkdir(OUT, { recursive: true });
const motion = process.argv.includes('--motion');
const only = process.argv.slice(2).filter((a) => a !== '--motion');
const rig = jointPerson(createPerson({ shirtColor: LOOK.shirt, sleeveColor: LOOK.shirt, pantsColor: LOOK.pants, skinTone: LOOK.skin, hairColor: LOOK.hair, hairStyle: LOOK.style, shoulderRound: 0.35, handScale: 1.3 }));
for (const dance of DANCES) {
    if (only.length && !only.includes(dance.id)) continue;
    if (motion) {
        const STEP = 0.1;
        const PER = 10;
        const n = Math.ceil(loopOf(dance) / STEP);
        const rows = Math.ceil(n / PER);
        const W = CELL.w * PER;
        const H = CELL.h * rows;
        const sheet = new Uint8Array(W * H * 3).fill(255);
        for (let i = 0; i < n; i++) {
            applyPose(rig, danceAt(dance, i * STEP));
            const cell = render(rig.root, VIEWS[0], CELL.w, CELL.h);
            const r = Math.floor(i / PER);
            const c = i % PER;
            for (let y = 0; y < CELL.h; y++) {
                const from = y * CELL.w * 3;
                sheet.set(cell.subarray(from, from + CELL.w * 3), ((r * CELL.h + y) * W + c * CELL.w) * 3);
            }
        }
        const file = path.join(OUT, `dance-${dance.id}-motion.png`);
        await writeFile(file, png(W, H, sheet));
        console.log(`${dance.name}: ${n} frames, ${file}`);
        continue;
    }
    const n = dance.keys.length;
    const W = CELL.w * n;
    const H = CELL.h * VIEWS.length;
    const sheet = new Uint8Array(W * H * 3);
    for (let i = 0; i < n; i++) {
        // In the middle of the pose's hold (a via key's moment of passing).
        applyPose(rig, danceAt(dance, (dance.starts[i] + (dance.vias[i] ? 0 : dance.hold * 0.5)) * dance.beat));
        VIEWS.forEach((cam, row) => {
            const cell = render(rig.root, cam, CELL.w, CELL.h);
            for (let y = 0; y < CELL.h; y++) {
                const from = y * CELL.w * 3;
                sheet.set(cell.subarray(from, from + CELL.w * 3), ((row * CELL.h + y) * W + i * CELL.w) * 3);
            }
        });
    }
    const file = path.join(OUT, `dance-${dance.id}.png`);
    await writeFile(file, png(W, H, sheet));
    console.log(`${dance.name}: ${n} poses, ${file}`);
}
