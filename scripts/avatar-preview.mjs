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
 * Named sheets after the script draw those alone (`... avatar-preview.mjs
 * eye-colors hands`), since the whole set takes a few minutes.
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
    /** The head at about the editor's zoom (1.6 px a millimeter), for the
     *  strands. */
    close: { cell: [320, 300], aim: [0, 1.57, 0], distance: 0.45, fov: 24, lift: 0.08 },
    body: { cell: [180, 300], aim: [0, 0.9, 0], distance: 4.2, fov: 28, lift: 0.1 },
    /** The torso, for the shirts. */
    torso: { cell: [240, 300], aim: [0, 1.1, 0], distance: 1.7, fov: 28, lift: 0.1 },
    /** The figure's left hand and wrist, close (the fingers and the thumb,
     *  2026-10-26). */
    hand: { cell: [240, 260], aim: [0.3, 0.72, 0], distance: 0.6, fov: 24, lift: 0.04 }
};
const TURNS = [0, 0.75];
const ONLY = process.argv.slice(2);

/** One sheet: a column a look, a row a turn (`turns`, from the front and
 *  three quarters by default; the hair also from behind). */
async function sheet(name, looks, shot, turns = TURNS) {
    if (ONLY.length && !ONLY.includes(name)) return;
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
// More sunglasses, and the frames' and lenses' colors (Steve's QA,
// 2026-10-25), close.
await sheet('sunglasses', [
    { ...fair, glasses: 'aviators' }, { ...fair, glasses: 'catEye' }, { ...fair, glasses: 'sport' }, { ...fair, glasses: 'oversized' },
    { ...deep, glasses: 'aviators', length: 'buzz' }, { skin: 'light', hair: 'blond', glasses: 'catEye', length: 'bob' }, { ...deep, glasses: 'sport', length: 'locs' }
], 'close', [0, 0.75]);
await sheet('glasses-colors', [
    { ...fair, glasses: 'round', frameColor: 'gold', lensColor: 'amber' }, { ...fair, glasses: 'aviators', frameColor: 'silver', lensColor: 'blue' },
    { ...fair, glasses: 'sunglasses', frameColor: 'red', lensColor: 'rose' }, { ...fair, glasses: 'catEye', frameColor: 'white', lensColor: 'green' },
    { ...fair, glasses: 'oversized', frameColor: 'tortoise', lensColor: 'brown' }, { ...fair, glasses: 'sunglasses', lensColor: 'clear' }, { ...deep, glasses: 'sport', frameColor: 'blue', lensColor: 'x80d0ff' }
], 'close', [0]);
await sheet('facial', [
    { ...fair, facial: 'stubble' }, { ...fair, facial: 'mustache' }, { ...fair, facial: 'goatee' }, { ...fair, facial: 'beard' },
    { ...deep, facial: 'stubble' }, { ...deep, facial: 'beard', glasses: 'round' }, { skin: 'light', hair: 'blond', facial: 'beard', length: 'long' }
], 'face');
// Every hair style, from the front, three quarters and behind, in two
// sheets; then every hat on short hair, and over the two biggest styles.
const STYLES = ['short', 'leftPart', 'rightPart', 'centerPart', 'quiff', 'spiky', 'curly', 'afro', 'mohawk', 'mullet', 'bob',
    'ponytail', 'pigtails', 'topKnot', 'lowBun', 'spaceBuns', 'braids', 'locs', 'cornrows', 'buzz', 'long', 'bald', 'longCenter', 'longSide', 'longBack'];
const HATS = ['beanie', 'cap', 'trucker', 'ivyCap', 'beret', 'fedora', 'cowboy', 'topHat', 'fez', 'chef', 'hardHat', 'sunHat', 'birthday'];
const BEHIND = [0, 0.75, Math.PI];
await sheet('hair-1', STYLES.slice(0, 11).map((length, k) => ({ ...(k % 2 ? deep : fair), length })), 'face', BEHIND);
await sheet('hair-2', STYLES.slice(11).map((length, k) => ({ ...(k % 2 ? fair : deep), length })), 'face', BEHIND);
await sheet('parts', [
    { ...fair, length: 'short' }, { ...fair, length: 'leftPart' }, { ...fair, length: 'rightPart' }, { ...fair, length: 'centerPart' },
    { ...deep, length: 'leftPart' }, { skin: 'light', hair: 'blond', length: 'centerPart' }
], 'crown', BEHIND);
// The strands, at the editor's zoom: the cuts combed from the crown, the
// parts, the quiff, hair worn back, and a curtain.
await sheet('strands', [
    { ...fair, length: 'short' }, { ...fair, length: 'leftPart' }, { ...fair, length: 'centerPart' }, { ...fair, length: 'quiff' },
    { ...deep, length: 'ponytail' }, { skin: 'light', hair: 'blond', length: 'bob' }, { ...fair, hair: 'auburn', length: 'rightPart' }
], 'close', [0, 0.75]);
// The long styles without bangs, beside the rig's long with bangs
// (Steve's QA, 2026-10-25), and the mohawk's spikes.
await sheet('long', [
    { ...fair, length: 'long' }, { ...fair, length: 'longCenter' }, { ...fair, length: 'longSide' }, { ...fair, length: 'longBack' },
    { ...deep, length: 'longCenter' }, { skin: 'light', hair: 'blond', length: 'longBack', hat: 'beanie', hatColor: 'rust' }, { ...fair, length: 'mohawk' }
], 'face', BEHIND);
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
// The irises in every color with a dark pupil on each (Steve's QA,
// 2026-10-26), at the editor's zoom, on every eye shape.
await sheet('eye-colors', [
    { ...fair }, { ...fair, eyes: 'blue' }, { ...fair, eyes: 'green', eyeShape: 'almond' }, { ...fair, eyes: 'hazel', eyeShape: 'wide' },
    { ...fair, eyes: 'gray', eyeShape: 'sleepy' }, { ...deep, eyes: 'brown', eyeShape: 'lashes' }, { skin: 'light', hair: 'blond', eyes: 'x9ad0ff', glasses: 'round' }
], 'close', [0, 0.75]);
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
const SHOES = ['classic', 'sneakers', 'maryJane', 'ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots', 'sandals', 'flats', 'heels', 'platforms', 'slippers'];
await sheet('shoes', SHOES.map((shoes) => ({ shoes, shoeColor: shoes === 'sneakers' ? 'navy' : 'brown' })), 'feet');
// The wardrobe (Steve, 2026-10-25): more shoes, shirts and bottoms.
await sheet('wardrobe-shoes', [
    { shoes: 'crocs', shoeColor: 'red' }, { shoes: 'highTops', shoeColor: 'navy' }, { shoes: 'hikingBoots', shoeColor: 'brown' }, { shoes: 'cleats', shoeColor: 'black' },
    { shoes: 'crocs', shoeColor: 'white', bottom: 'shorts' }, { shoes: 'highTops', shoeColor: 'white', bottom: 'basketballShorts' }
], 'feet', [0.75, Math.PI / 2]);
await sheet('shirts', [
    { sleeves: 'sweater', shirt: 'rust' }, { sleeves: 'turtleneck', shirt: 'charcoal' }, { sleeves: 'jersey', shirt: 'navy' }, { sleeves: 'jersey', shirt: 'white' },
    { sleeves: 'buttonDown', shirt: 'white' }, { sleeves: 'hoodie', shirt: 'teal' }, { sleeves: 'hoodie', shirt: 'white', build: 'curvy' },
    { sleeves: 'vneck', shirt: 'navy' }, { sleeves: 'vneck', shirt: 'white', skin: 'deep' }
], 'torso', [0, 0.75, Math.PI]);
// The hood from every side (Steve's QA, 2026-10-25: the old half ball
// "looks like half of an oval, missing the other half").
await sheet('hood', [
    { sleeves: 'hoodie', shirt: 'teal' }, { sleeves: 'hoodie', shirt: 'rust', length: 'buzz' }, { sleeves: 'hoodie', shirt: 'white', build: 'curvy', length: 'ponytail' }
], 'torso', [0, 0.75, Math.PI / 2, 2.4, Math.PI]);
// Hand and foot sizes (Steve's QA, 2026-10-25), beside the standard.
await sheet('hands', [
    { handSize: 'small' }, { handSize: 'standard' }, { handSize: 'large' }, { handSize: 'xl' },
    { handSize: 'xl', muscles: 'buff', sleeves: 'short' }, { handSize: 'small', build: 'slim', sleeves: 'short' }
], 'torso', [0, 0.75]);
// Hats over glasses (Steve's QA, 2026-10-26: the sunglasses went through
// the cap's bill): every billed or brimmed hat over the biggest frames.
await sheet('hats-glasses', [
    { ...fair, hat: 'cap', hatColor: 'navy', glasses: 'sunglasses' }, { ...fair, hat: 'trucker', hatColor: 'rust', glasses: 'oversized' },
    { ...fair, hat: 'ivyCap', hatColor: 'charcoal', glasses: 'aviators' }, { ...fair, hat: 'fedora', hatColor: 'charcoal', glasses: 'oversized' },
    { ...fair, hat: 'cowboy', hatColor: 'mustard', glasses: 'sport' }, { ...fair, hat: 'sunHat', hatColor: 'white', glasses: 'catEye', length: 'long' },
    { ...deep, hat: 'cap', hatColor: 'black', glasses: 'sport', length: 'buzz' }, { ...fair, hat: 'hardHat', hatColor: 'mustard', glasses: 'square' }
], 'face', [0, 0.75, Math.PI / 2]);
// The hand itself (Steve's QA, 2026-10-26: fingers and a thumb) and the
// forearm narrowing to the wrist, close, from the front, the outside, the
// side and behind (the palm).
await sheet('hands-close', [
    { sleeves: 'short' }, { sleeves: 'short', handSize: 'large' }, { sleeves: 'short', handSize: 'small', build: 'slim' },
    { sleeves: 'short', muscles: 'buff' }, { sleeves: 'short', muscles: 'athletic', skin: 'deep' }, { sleeves: 'sweater', shirt: 'rust' }
], 'hand', [0, 0.75, Math.PI / 2, Math.PI]);
// The forearms at the body's scale, every strength, bare and sleeved.
await sheet('forearms', [
    { sleeves: 'short' }, { sleeves: 'short', muscles: 'athletic' }, { sleeves: 'short', muscles: 'buff' }, { sleeves: 'tank', muscles: 'buff', handSize: 'large' },
    { sleeves: 'long', muscles: 'buff' }, { sleeves: 'short', build: 'slim' }, { sleeves: 'short', build: 'curvy', handSize: 'small' }
], 'torso', [0, 0.75]);
// Jersey numbers (Steve's QA, 2026-10-26), front and back.
await sheet('jersey-numbers', [
    { sleeves: 'jersey', shirt: 'x241773', jerseyNumber: 'n8' }, { sleeves: 'jersey', shirt: 'white', jerseyNumber: 'n00' },
    { sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n12', numberColor: 'gold' }, { sleeves: 'jersey', shirt: 'rust', jerseyNumber: 'n7' },
    { sleeves: 'jersey', shirt: 'teal', jerseyNumber: 'n45', build: 'curvy' }, { sleeves: 'jersey', shirt: 'x241773', jerseyNumber: 'n52', muscles: 'buff', numberColor: 'black' },
    { sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n3', numberColor: 'x00ff88' }
], 'torso', [0, Math.PI]);
await sheet('feet-sizes', [
    { footSize: 'small' }, { footSize: 'standard' }, { footSize: 'large' }, { footSize: 'large', muscles: 'buff' }, { footSize: 'small', shoes: 'heels', build: 'curvy' }, { footSize: 'large', shoes: 'highTops' }
], 'feet', [0, 0.75]);
await sheet('bottoms', [
    { bottom: 'cargoPants', bottomColor: 'khaki' }, { bottom: 'cargoShorts', bottomColor: 'khaki' }, { bottom: 'sweatpants', bottomColor: 'charcoal' },
    { bottom: 'leggings', bottomColor: 'black', build: 'curvy' }, { bottom: 'basketballShorts', bottomColor: 'navy', shoes: 'highTops' }, { bottom: 'longSkirt', bottomColor: 'denim', build: 'curvy' }
], 'legs', [0, 0.75]);
// More bottoms (Steve's QA, 2026-10-26): short shorts, the mini and pleated
// skirts, the tutu and capris, on a few builds.
await sheet('bottoms-2', [
    { bottom: 'shortShorts', bottomColor: 'navy' }, { bottom: 'shortShorts', bottomColor: 'khaki', build: 'curvy', sleeves: 'tank' }, { bottom: 'miniSkirt', bottomColor: 'black', build: 'curvy' },
    { bottom: 'pleatedSkirt', bottomColor: 'white', build: 'pear' }, { bottom: 'tutu', bottomColor: 'xf0a0c8', build: 'slim' }, { bottom: 'capris', bottomColor: 'denim' },
    { bottom: 'capris', bottomColor: 'khaki', build: 'full', legwear: 'crewSocks', legwearColor: 'white' }
], 'legs', [0, 0.75]);
// The one-pieces: a leotard with bare legs, a ballerina (leotard, tutu,
// tights), a wrestler (bodysuit, short shorts, buff), a leotard under a
// mini skirt, and the fallback (bare legs with a tee are shorts).
await sheet('onepiece', [
    { sleeves: 'leotard', shirt: 'navy', bottom: 'bare' }, { sleeves: 'leotard', shirt: 'xf0a0c8', bottom: 'tutu', bottomColor: 'xf0a0c8', legwear: 'tights', legwearColor: 'pink', build: 'slim', length: 'lowBun' },
    { sleeves: 'bodysuit', shirt: 'x241773', bottom: 'shortShorts', bottomColor: 'black', muscles: 'buff', build: 'broad' }, { sleeves: 'leotard', shirt: 'black', bottom: 'miniSkirt', bottomColor: 'black', legwear: 'fishnets', build: 'curvy' },
    { sleeves: 'short', shirt: 'teal', bottom: 'bare' }, { sleeves: 'bodysuit', shirt: 'white', bottom: 'bare', skin: 'deep' }
], 'body', [0, 0.75]);
// The underlayer, legs: every legwear in shorts and under a skirt.
const LEGWEAR = ['crewSocks', 'kneeSocks', 'thighHighs', 'sheerTights', 'tights', 'fishnets', 'longJohns', 'legWarmers'];
await sheet('layers-legs', LEGWEAR.map((legwear, k) => ({ legwear, legwearColor: k % 2 ? 'black' : 'white', bottom: k % 3 === 2 ? 'skirt' : 'shorts', bottomColor: 'navy' })), 'legs', [0, 0.75]);
// The underlayer, arms: every armwear with short sleeves and a tank top.
const ARMWEAR = ['fishnetSleeves', 'longGloves', 'armWarmers', 'thermalSleeves'];
await sheet('layers-arms', [
    ...ARMWEAR.map((armwear) => ({ armwear, armwearColor: 'black', sleeves: 'short', shirt: 'white' })),
    ...ARMWEAR.map((armwear) => ({ armwear, armwearColor: 'red', sleeves: 'tank', shirt: 'charcoal' }))
], 'torso', [0, 0.75]);
// The heels, close, from the side and three quarters (Steve, 2026-10-25:
// pointed toes, a round heel).
await sheet('heels', [{ shoes: 'heels', shoeColor: 'red' }, { shoes: 'heels', shoeColor: 'black', build: 'curvy', bottom: 'skirt' }], 'feet', [Math.PI / 2, 0.75, 0]);
await sheet('shoes-white-black', [{ shoes: 'sneakers', shoeColor: 'white' }, { shoes: 'sneakers', shoeColor: 'black' }, { shoes: 'classic', shoeColor: 'black' },
    { shoes: 'workBoots', shoeColor: 'black' }, { shoes: 'cowboyBoots', shoeColor: 'red', build: 'curvy' }], 'feet');
await sheet('boots-legs', [
    { shoes: 'ankleBoots' }, { shoes: 'workBoots' }, { shoes: 'cowboyBoots', shoeColor: 'brown' }, { shoes: 'tallBoots', shoeColor: 'black' },
    { shoes: 'tallBoots', shoeColor: 'brown', bottom: 'skirt', build: 'curvy' }, { shoes: 'cowboyBoots', bottom: 'shorts', muscles: 'buff' },
    { shoes: 'heels', shoeColor: 'red', bottom: 'skirt', build: 'curvy' }, { shoes: 'platforms', bottom: 'shorts' }, { shoes: 'sandals', shoeColor: 'brown', bottom: 'shorts' }
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
// Every build (seven since 2026-10-26), in pants with short sleeves so the
// torso's shape shows, then in a skirt, then dressed in the pieces that
// follow the torso's sides.
const BUILDS = ['straight', 'slim', 'curvy', 'pear', 'broad', 'round', 'full'];
await sheet('builds', BUILDS.map((build) => ({ build, sleeves: 'short' })), 'body');
await sheet('builds-skirt', BUILDS.map((build) => ({ build, bottom: 'skirt', shoes: 'maryJane', length: 'long' })), 'body');
await sheet('builds-dressed', [
    { build: 'pear', sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n88' }, { build: 'broad', sleeves: 'jersey', shirt: 'x241773', jerseyNumber: 'n8' },
    { build: 'round', sleeves: 'sweater', shirt: 'rust' }, { build: 'full', sleeves: 'hoodie', shirt: 'teal', bottom: 'sweatpants', bottomColor: 'charcoal' },
    { build: 'pear', sleeves: 'sweater', shirt: 'teal', bottom: 'leggings', bottomColor: 'black' }, { build: 'full', sleeves: 'jersey', shirt: 'white', jerseyNumber: 'n45', muscles: 'buff' },
    { build: 'round', sleeves: 'buttonDown', shirt: 'white' }
], 'torso', [0, 0.75]);
