// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-preview.mjs - the avatar's pieces (shared/js/avatar-figure-1.0.0.js),
 * drawn for checking by eye without a browser (the "a preview renderer beats
 * guessing" lesson): every pair of glasses and every kind of facial hair on
 * two skin tones, every hat over every hair style, the shoes, and the builds
 * in a skirt. Run it after changing a piece, before anyone sees it in a
 * browser.
 *
 *   npm run build && node --experimental-vm-modules scripts/avatar-preview.mjs
 *
 * Writes specs/avatar/previews/*.png (git-ignored), each column one look and
 * each row a view (from the front, and from three quarters to the figure's
 * left). Flat-shaded through scripts/preview-raster.mjs, so the shapes and
 * the fit are exact and the light is rough.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealThree } from '../tests/helpers/real-three.mjs';
import { render, png, place } from './preview-raster.mjs';

const THREE = await loadRealThree();
globalThis.THREE = THREE;
const { createAvatar, portraitPose, PORTRAIT } = await import('../www/shared/js/avatar-figure-1.0.0.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'avatar', 'previews');

/** A camera `distance` from `aim`, turned `turn` radians round to the
 *  figure's left, raised `lift`. */
function camera(aim, distance, turn, lift, fov, aspect) {
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.02, 20);
    cam.position.set(aim[0] + Math.sin(turn) * distance, aim[1] + lift, aim[2] + Math.cos(turn) * distance);
    cam.lookAt(...aim);
    return cam;
}

const SHOTS = {
    face: { cell: [220, 220], aim: [0, 1.56, 0], distance: 0.95, fov: 26, lift: 0.03 },
    feet: { cell: [220, 160], aim: [0, 0.08, 0.04], distance: 0.9, fov: 26, lift: 0.35 },
    body: { cell: [180, 300], aim: [0, 0.9, 0], distance: 4.2, fov: 28, lift: 0.1 }
};
const TURNS = [0, 0.75];

async function sheet(name, looks, shot) {
    const S = SHOTS[shot];
    const [w, h] = S.cell;
    const W = w * looks.length;
    const H = h * TURNS.length;
    const out = new Uint8Array(W * H * 3);
    looks.forEach((look, col) => {
        const avatar = createAvatar(look);
        TURNS.forEach((turn, row) => {
            const cam = camera(S.aim, S.distance, turn, S.lift, S.fov, w / h);
            place(out, W, render(avatar.group, cam, w, h), w, h, col, row);
        });
        avatar.dispose();
    });
    const file = path.join(OUT, `${name}.png`);
    await writeFile(file, png(W, H, out));
    console.log(`${name}: ${looks.length} looks, ${file}`);
}

await mkdir(OUT, { recursive: true });
const fair = { skin: 'fair', hair: 'darkBrown' };
const deep = { skin: 'deep', hair: 'black' };
await sheet('glasses', [
    { ...fair }, { ...fair, glasses: 'round' }, { ...fair, glasses: 'square' }, { ...fair, glasses: 'sunglasses' },
    { ...deep, glasses: 'round', length: 'long' }, { ...deep, glasses: 'sunglasses', length: 'buzz' }
], 'face');
await sheet('facial', [
    { ...fair, facial: 'stubble' }, { ...fair, facial: 'mustache' }, { ...fair, facial: 'goatee' }, { ...fair, facial: 'beard' },
    { ...deep, facial: 'stubble' }, { ...deep, facial: 'beard', glasses: 'round' }, { skin: 'light', hair: 'blond', facial: 'beard', length: 'long' }
], 'face');
for (const hat of ['beanie', 'cap', 'sunHat']) {
    await sheet(`hat-${hat}`, ['bald', 'buzz', 'short', 'long'].map((length) => ({ ...fair, length, hat, hatColor: 'navy' }))
        .concat([{ ...deep, length: 'long', hat, hatColor: 'mustard', glasses: 'sunglasses' }]), 'face');
}
await sheet('shoes', [
    { shoes: 'classic' }, { shoes: 'sneakers' }, { shoes: 'sneakers', shoeColor: 'white' }, { shoes: 'sneakers', shoeColor: 'red', build: 'slim' },
    { shoes: 'maryJane', shoeColor: 'brown', bottom: 'skirt' }
], 'feet');
// The round portrait, through the portrait's own camera (the chip crops it
// to a circle), one look a cell.
{
    const looks = [{}, { glasses: 'round', facial: 'beard', hat: 'beanie', hair: 'black' }, { length: 'long', hat: 'sunHat', hatColor: 'mustard', skin: 'deep' },
        { length: 'buzz', hat: 'cap', hatColor: 'teal', glasses: 'sunglasses', skin: 'tan' }, { length: 'long', hair: 'auburn', skin: 'light', eyes: 'green' }];
    const n = 160;
    const out = new Uint8Array(n * looks.length * n * 3);
    const pose = portraitPose();
    looks.forEach((look, col) => {
        const avatar = createAvatar(look);
        const cam = new THREE.PerspectiveCamera(pose.fov, 1, 0.05, 10);
        cam.position.fromArray(pose.eye);
        cam.lookAt(...pose.aim);
        const bg = [(PORTRAIT.background >> 16) & 255, (PORTRAIT.background >> 8) & 255, PORTRAIT.background & 255];
        place(out, n * looks.length, render(avatar.group, cam, n, n, { bg }), n, n, col, 0);
        avatar.dispose();
    });
    const file = path.join(OUT, 'portraits.png');
    await writeFile(file, png(n * looks.length, n, out));
    console.log(`portraits: ${looks.length} looks, ${file}`);
}
await sheet('builds', [
    { build: 'straight' }, { build: 'slim' }, { build: 'curvy' },
    { build: 'straight', bottom: 'skirt' }, { build: 'slim', bottom: 'skirt' }, { build: 'curvy', bottom: 'skirt', shoes: 'maryJane' }
], 'body');
