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
 * rasterizer with a depth buffer (scripts/preview-raster.mjs) over the real three.js figure (people-1.0.0's
 * createPerson, jointed by dance-1.0.0), shaded as three would (vertex normals, culled back faces, the
 * sun's shadow), so what it shows is the rig's own geometry in the dance's own angles. Lighting is
 * rough; the shapes and the poses are exact.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealThree } from '../tests/helpers/real-three.mjs';
import { render, png } from './preview-raster.mjs';

const THREE = await loadRealThree();
globalThis.THREE = THREE;
const { DANCES, danceAt, loopOf, jointPerson, applyPose } = await import('../www/shared/js/dance-1.0.0.js');
const { createPerson } = await import('../www/shared/js/people-1.0.0.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'dance-previews');
const CELL = { w: 200, h: 260 };
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
