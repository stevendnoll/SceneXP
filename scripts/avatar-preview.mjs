// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-preview.mjs - the avatar's pieces (shared/js/avatar-figure-1.0.0.js),
 * drawn for checking by eye without a browser (the "a preview renderer beats
 * guessing" lesson): every pair of glasses and every kind of facial hair on
 * two skin tones, every hair style, every hat (on short hair, over the
 * biggest styles, and over the styles worn up), the shoes, and the builds
 * in a skirt. Run it after changing a piece, before anyone sees it in a
 * browser.
 *
 *   npm run build && node --experimental-vm-modules scripts/avatar-preview.mjs
 *
 * Writes specs/avatar/previews/*.png (git-ignored), each column one look and
 * each row a view (from the front, and from three quarters to the figure's
 * left, and for the hair and the hats from behind). Drawn through
 * scripts/preview-raster.mjs as three would draw it (vertex normals, culled
 * back faces, the sun's shadow), so the shapes and the fit are exact and the
 * light is rough.
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
    legs: { cell: [180, 300], aim: [0, 0.4, 0], distance: 2.2, fov: 26, lift: 0.1 },
    mouth: { cell: [200, 160], aim: [0, 1.5, 0], distance: 0.55, fov: 22, lift: 0.0 },
    /** The top of the head, close, from a little above (the parts). */
    crown: { cell: [220, 200], aim: [0, 1.6, 0], distance: 0.55, fov: 24, lift: 0.22 },
    body: { cell: [180, 300], aim: [0, 0.9, 0], distance: 4.2, fov: 28, lift: 0.1 }
};
const TURNS = [0, 0.75];

/** One sheet: a column a look, a row a turn (`turns`, from the front and
 *  three quarters by default; the hair also from behind). */
async function sheet(name, looks, shot, turns = TURNS) {
    const S = SHOTS[shot];
    const [w, h] = S.cell;
    const W = w * looks.length;
    const H = h * turns.length;
    const out = new Uint8Array(W * H * 3);
    looks.forEach((look, col) => {
        const avatar = createAvatar(look);
        turns.forEach((turn, row) => {
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
    { ...fair }, { ...fair, glasses: 'round' }, { ...fair, glasses: 'square' }, { ...fair, glasses: 'sunglasses' }, { ...fair, glasses: 'roundSun' },
    { ...deep, glasses: 'round', length: 'long' }, { ...deep, glasses: 'sunglasses', length: 'buzz' }
], 'face');
await sheet('facial', [
    { ...fair, facial: 'stubble' }, { ...fair, facial: 'mustache' }, { ...fair, facial: 'goatee' }, { ...fair, facial: 'beard' },
    { ...deep, facial: 'stubble' }, { ...deep, facial: 'beard', glasses: 'round' }, { skin: 'light', hair: 'blond', facial: 'beard', length: 'long' }
], 'face');
// Every hair style, from the front, three quarters and behind, in two
// sheets; then every hat on short hair, and over the two biggest styles.
const STYLES = ['short', 'leftPart', 'rightPart', 'centerPart', 'quiff', 'spiky', 'curly', 'afro', 'mohawk', 'mullet', 'bob',
    'ponytail', 'pigtails', 'topKnot', 'lowBun', 'spaceBuns', 'braids', 'locs', 'cornrows', 'buzz', 'long', 'bald'];
const HATS = ['beanie', 'cap', 'trucker', 'ivyCap', 'beret', 'fedora', 'cowboy', 'topHat', 'fez', 'chef', 'hardHat', 'sunHat', 'birthday'];
const BEHIND = [0, 0.75, Math.PI];
await sheet('hair-1', STYLES.slice(0, 11).map((length, k) => ({ ...(k % 2 ? deep : fair), length })), 'face', BEHIND);
await sheet('hair-2', STYLES.slice(11).map((length, k) => ({ ...(k % 2 ? fair : deep), length })), 'face', BEHIND);
await sheet('parts', [
    { ...fair, length: 'short' }, { ...fair, length: 'leftPart' }, { ...fair, length: 'rightPart' }, { ...fair, length: 'centerPart' },
    { ...deep, length: 'leftPart' }, { skin: 'light', hair: 'blond', length: 'centerPart' }
], 'crown', BEHIND);
await sheet('hats', HATS.map((hat) => ({ ...fair, length: 'short', hat, hatColor: 'navy' })), 'face', BEHIND);
await sheet('hats-afro', HATS.map((hat) => ({ ...deep, length: 'afro', hat, hatColor: 'mustard' })), 'face');
await sheet('hats-long', HATS.map((hat) => ({ skin: 'light', hair: 'blond', length: 'long', hat, hatColor: 'teal' })), 'face');
await sheet('hats-up', [['ponytail', 'cap'], ['ponytail', 'beanie'], ['pigtails', 'beanie'], ['topKnot', 'cap'], ['mohawk', 'beanie'], ['spaceBuns', 'fedora'], ['braids', 'cowboy'], ['bob', 'beret']]
    .map(([length, hat]) => ({ ...fair, length, hat, hatColor: 'rust' })), 'face', BEHIND);
await sheet('faces', [
    { ...fair }, { ...fair, faceShape: 'oval' }, { ...deep, faceShape: 'oval', length: 'long', hat: 'beanie', hatColor: 'mustard' },
    { ...fair, nose: 'button' }, { ...fair, nose: 'round' }, { ...fair, nose: 'wide' }, { ...fair, cheeks: 'blush' }, { skin: 'light', hair: 'copper', cheeks: 'freckles' }
], 'face');
await sheet('eyes', [
    { ...fair }, { ...fair, eyeShape: 'almond' }, { ...fair, eyeShape: 'wide' }, { ...fair, eyeShape: 'sleepy' }, { ...fair, eyeShape: 'lashes' },
    { ...deep, eyeShape: 'almond', glasses: 'round' }, { ...fair, eyeShape: 'sleepy', glasses: 'square' }
], 'face');
await sheet('brows', [
    { ...fair, brows: 'natural' }, { ...fair, brows: 'straight' }, { ...fair, brows: 'arched' }, { ...fair, brows: 'bold' }, { ...fair, brows: 'thin' },
    { ...fair, brows: 'bold', mouth: 'surprised' }, { skin: 'light', hair: 'blond', brows: 'arched', eyeShape: 'lashes' }, { ...deep, hair: 'gray', brows: 'bold', hat: 'cap' }
], 'face');
await sheet('mouths', [
    { ...fair }, { ...fair, mouth: 'bigSmile' }, { ...fair, mouth: 'grin' }, { ...fair, mouth: 'smirk' }, { ...fair, mouth: 'surprised' },
    { ...deep, mouth: 'bigSmile', lips: 'berry' }, { skin: 'light', mouth: 'grin', lips: 'red' }, { ...fair, mouth: 'smile', lips: 'rose' }, { ...fair, mouth: 'smile', lips: 'softPink' }
], 'mouth');
await sheet('mouths-facial', [
    { ...fair, mouth: 'bigSmile', facial: 'mustache' }, { ...fair, mouth: 'grin', facial: 'beard' }, { ...fair, mouth: 'surprised', facial: 'goatee' },
    { ...deep, mouth: 'grin', facial: 'stubble' }, { ...fair, mouth: 'smirk', facial: 'beard' }
], 'mouth');
const SHOES = ['classic', 'sneakers', 'maryJane', 'ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots'];
await sheet('shoes', SHOES.map((shoes) => ({ shoes, shoeColor: shoes === 'sneakers' ? 'navy' : 'brown' })), 'feet');
await sheet('shoes-white-black', [{ shoes: 'sneakers', shoeColor: 'white' }, { shoes: 'sneakers', shoeColor: 'black' }, { shoes: 'classic', shoeColor: 'black' },
    { shoes: 'workBoots', shoeColor: 'black' }, { shoes: 'cowboyBoots', shoeColor: 'red', build: 'curvy' }], 'feet');
await sheet('boots-legs', [
    { shoes: 'ankleBoots' }, { shoes: 'workBoots' }, { shoes: 'cowboyBoots', shoeColor: 'brown' }, { shoes: 'tallBoots', shoeColor: 'black' },
    { shoes: 'tallBoots', shoeColor: 'brown', bottom: 'skirt', build: 'curvy' }, { shoes: 'cowboyBoots', bottom: 'shorts', muscles: 'buff' }
], 'legs');
await sheet('clothes', [
    { sleeves: 'tank' }, { sleeves: 'tank', muscles: 'athletic' }, { sleeves: 'tank', muscles: 'buff', bottom: 'shorts' },
    { bottom: 'shorts', sleeves: 'short' }, { bottom: 'skirt', build: 'curvy', sleeves: 'tank' }, { muscles: 'buff', bottom: 'skirt', build: 'curvy' },
    { muscles: 'athletic', build: 'slim', bottom: 'shorts', shoes: 'sneakers' }
], 'body');
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
