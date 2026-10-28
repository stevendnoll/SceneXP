// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * meme-preview.mjs - a meme's panels drawn for checking by eye without a
 * browser (the "a preview renderer beats guessing" lesson), each through its
 * cell's own camera, as the composite will draw them. The thumbnail test
 * (specs/meme TASKS M1): does the panel read as a meme at 200 px?
 *
 *   npm run build && node --experimental-vm-modules scripts/meme-preview.mjs [templateId ...]
 *
 * Writes specs/meme/previews/<template>.png (git-ignored): a row a cell, the
 * panel at 200 px and at 600 px. Through scripts/preview-raster.mjs, so the
 * shapes and the framing are exact and the light is rough. Captions are not
 * drawn (the rasterizer has no text): the room left for them is what is
 * judged here.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealThree } from '../tests/helpers/real-three.mjs';
import { render, png, norm } from './preview-raster.mjs';

const THREE = await loadRealThree();
globalThis.THREE = THREE;
const { MEME_PAGE: CONFIG } = await import('../www/meme/js/config.js');
const { TEMPLATES } = await import('../www/meme/js/templates.js');
const { buildPanel, layoutPanels, cellCamera } = await import('../www/meme/js/panels.js');
const { sunDirection } = await import('../www/meme/js/stage.js');
const { randomAvatar, DEFAULT_AVATAR } = await import('../www/shared/js/avatar-1.0.0.js');

// The page's own sun, so the shadows fall where the browser's do (every
// opaque surface casts here, as the box's planes do there, 2026-10-28).
const SUN = sunDirection(CONFIG.light).toArray();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'meme', 'previews');
const ONLY = process.argv.slice(2);
const SIZES = [200, 600];

let seed = 7;
const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const avatarFor = (roleId, template) => {
    const role = template.roles.find((r) => r.id === roleId);
    return role && role.cast === 'avatar' ? DEFAULT_AVATAR : randomAvatar(rand);
};

await mkdir(OUT, { recursive: true });
for (const template of TEMPLATES) {
    if (ONLY.length && !ONLY.includes(template.id)) continue;
    const W = SIZES.reduce((n, s) => n + s, 0);
    const H = Math.max(...SIZES) * template.cells.length;
    const out = new Uint8Array(W * H * 3);
    const spots = layoutPanels(template, CONFIG.box);
    const root = new THREE.Group();
    const panels = template.cells.map((cell, i) => {
        const panel = buildPanel(cell, CONFIG, (roleId) => avatarFor(roleId, template));
        panel.group.position.set(spots[i].x, spots[i].y, spots[i].z);
        root.add(panel.group);
        return panel;
    });
    root.updateMatrixWorld(true);
    template.cells.forEach((cell, row) => {
        const pose = cellCamera(cell, panels[row].box);
        let x = 0;
        for (const size of SIZES) {
            const cam = new THREE.PerspectiveCamera(pose.fov, 1, 0.02, 40);
            cam.position.fromArray(pose.eye);
            cam.lookAt(...pose.aim);
            const pixels = render(root, cam, size, size, { light: norm(SUN) });
            // Placed by hand: the sheet's cells are not one size.
            for (let y = 0; y < size; y++) {
                out.set(pixels.subarray(y * size * 3, (y + 1) * size * 3), ((row * Math.max(...SIZES) + y) * W + x) * 3);
            }
            x += size;
        }
    });
    const file = path.join(OUT, `${template.id}.png`);
    await writeFile(file, png(W, H, out));
    console.log(`${template.id}: ${template.cells.length} panel(s), ${file}`);
    for (const p of panels) p.dispose();
}
