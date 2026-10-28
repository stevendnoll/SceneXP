// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The painted backdrops (www/meme/js/backdrops.js, specs/meme TASKS M8):
 * each painter's picture measured where it should differ (the sky over the
 * low rooftops, the light pool behind the handshake, the soot at the top),
 * the textures shared and drawn in the wall's own color, and the two
 * scenes that came with them, on the real three: The Handshake's glow
 * behind the clasp and Everything Is Fine's smoke under the ceiling, its
 * table on the camera's right.
 *
 * The pictures are measured small where a test can choose (`size`), since
 * hot loops run far slower under the test sandbox than in a browser.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let D;
let P;
let T;
let CONFIG;
let DEFAULT_AVATAR;
let FINE;
let CLASP_GLOW;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    jest.resetModules();
    D = await import('../www/meme/js/backdrops.js');
    P = await import('../www/meme/js/panels.js');
    T = await import('../www/meme/js/templates.js');
    ({ MEME_PAGE: CONFIG } = await import('../www/meme/js/config.js'));
    ({ DEFAULT_AVATAR } = await import('../www/shared/js/avatar-1.0.0.js'));
    ({ FINE } = await import('../www/meme/js/scenes/fine.js'));
    ({ CLASP_GLOW } = await import('../www/meme/js/scenes/handshake.js'));
});
afterAll(() => {
    delete globalThis.THREE;
});

const WALL = () => ({ width: CONFIG.box.width, height: CONFIG.box.height });

/** The pixel at shares (u, v) of a picture, as [r, g, b]. */
function at(pic, u, v) {
    const x = Math.min(pic.width - 1, Math.floor(u * pic.width));
    const y = Math.min(pic.height - 1, Math.floor(v * pic.height));
    const o = (y * pic.width + x) * 4;
    return [pic.data[o], pic.data[o + 1], pic.data[o + 2]];
}

/** The mean brightness of a patch `r` (a share) round (u, v). */
function patch(pic, u, v, r = 0.06) {
    let sum = 0;
    let n = 0;
    for (let du = -r; du <= r; du += r / 4) {
        for (let dv = -r; dv <= r; dv += r / 4) {
            const c = at(pic, Math.min(0.999, Math.max(0, u + du)), Math.min(0.999, Math.max(0, v + dv)));
            sum += (c[0] + c[1] + c[2]) / 3;
            n++;
        }
    }
    return sum / n;
}

describe('the painters', () => {
    test('each paints an opaque square of the size asked for, the same every time, and an unknown id paints nothing', () => {
        for (const id of D.PAINT_IDS) {
            const pic = D.paintPixels(id, '#808080', WALL(), 32);
            expect(pic.width).toBe(32);
            expect(pic.height).toBe(32);
            expect(pic.data).toHaveLength(32 * 32 * 4);
            for (let i = 3; i < pic.data.length; i += 4) expect(pic.data[i]).toBe(255);
            expect(D.paintPixels(id, '#808080', WALL(), 32).data).toEqual(pic.data);
        }
        for (const id of ['mural', 'toString', '__proto__', undefined]) expect(D.paintPixels(id, '#808080', WALL(), 8)).toBeNull();
        expect(D.rgb('#C98B6B')).toEqual([0xc9, 0x8b, 0x6b]);
    });

    test('the city: sky over the low rooftops, none over the tall one, and windows in every facade', () => {
        const sky = '#B9D3E6';
        const pic = D.paintPixels('city', sky, WALL(), 256);
        const W = WALL().width;
        const total = D.PAINTS.city.buildings.reduce((n, b) => n + b.w, 0);
        let left = 0;
        for (const b of D.PAINTS.city.buildings) {
            const w = (b.w / total) * W;
            const u = (left + w / 2) / W;
            const top = at(pic, u, 0.99);
            if (b.h < WALL().height) expect(top[2]).toBeGreaterThan(top[0]);   // blue sky
            else expect(top[0]).toBeGreaterThan(top[2]);                        // the facade runs off the top
            // Somewhere up the facade's middle, a window darker than the
            // facade itself (as painted, between the awning and the first
            // row of windows), by enough to read at thumbnail size.
            const c = at(pic, u, (D.PAINTS.city.shop.awning[1] + D.PAINTS.city.floors.from - 0.02) / 2 / WALL().height);
            const wall = (c[0] + c[1] + c[2]) / 3;
            let darkest = Infinity;
            for (let x = left + 0.06; x < left + w - 0.06; x += 0.01) {
                for (let y = D.PAINTS.city.floors.from; y < Math.min(b.h, WALL().height) - 0.2; y += 0.01) {
                    const p = at(pic, x / W, y / WALL().height);
                    darkest = Math.min(darkest, (p[0] + p[1] + p[2]) / 3);
                }
            }
            expect(wall - darkest).toBeGreaterThan(30);
            left += w;
        }
        // The awnings are striped: two colors along the band.
        const band = (D.PAINTS.city.shop.awning[0] + D.PAINTS.city.shop.awning[1]) / 2 / WALL().height;
        const along = new Set();
        for (let u = 0.02; u < 0.18; u += 0.005) along.add(at(pic, u, band).join(','));
        expect(along.size).toBeGreaterThan(2);
    });

    test('the storm is dark but for the pool of light behind the handshake', () => {
        const pic = D.paintPixels('storm', '#3E4146', WALL(), 64);
        const [u, v] = D.PAINTS.storm.light.at;
        const pool = patch(pic, u, v);
        for (const [cu, cv] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) expect(pool).toBeGreaterThan(patch(pic, cu, cv) + 50);
        expect(patch(pic, 0.1, 0.1)).toBeLessThan(80);
    });

    test('the wash is lighter in the middle than at the edges; the soot darkens the top and leaves the bottom the wall\'s', () => {
        const wash = D.paintPixels('wash', '#D9BF93', WALL(), 64);
        const [u, v] = D.PAINTS.wash.at;
        for (const [eu, ev] of [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]]) expect(patch(wash, u, v)).toBeGreaterThan(patch(wash, eu, ev, 0.02) + 20);
        const soot = D.paintPixels('soot', '#F0A070', WALL(), 64);
        expect(patch(soot, 0.5, 0.95, 0.04)).toBeLessThan(patch(soot, 0.5, 0.2) - 80);
        const base = D.rgb('#F0A070');
        const low = at(soot, 0.5, 0.2);
        low.forEach((c, i) => expect(Math.abs(c - base[i])).toBeLessThan(3));
    });

    test('the sidewalk has dark joints between its slabs', () => {
        const floor = { width: CONFIG.box.width, height: CONFIG.box.depth };
        const pic = D.paintPixels('sidewalk', '#CBC7C0', floor, 256);
        const S = D.PAINTS.sidewalk;
        // Across one row, the joint (at a slab's edge) is darker than the
        // slab beside it.
        const v = 0.3;
        const joint = at(pic, (S.slab + S.joint / 2) / floor.width, v);
        const slab = at(pic, (S.slab * 1.5) / floor.width, v);
        expect(slab[0] - joint[0]).toBeGreaterThan(30);
    });
});

describe('the background color (M8)', () => {
    const T8 = () => CONFIG.tint;
    const lightness = (hex) => {
        const c = D.rgb(hex).map((v) => v / 255);
        return (Math.max(...c) + Math.min(...c)) / 2;
    };

    test('the deepest row wears a dark pick as it is, and the paper is the paper', () => {
        expect(D.tintOf('#1B2A55', 1, T8())).toBe('#1b2a55');
        expect(D.tintOf('#1B2A55', 0, T8())).toBe(T8().paper.toLowerCase());
        // Outside 0 to 1 is held to it.
        expect(D.tintOf('#1B2A55', 2, T8())).toBe('#1b2a55');
        expect(D.tintOf('#1B2A55', -1, T8())).toBe(T8().paper.toLowerCase());
    });

    test('a light pick is darkened to the cap, keeping its hue, so the glow still blooms on the last row', () => {
        for (const pick of ['#F3D98A', '#FFFFFF', '#88CCFF', '#FF0000']) {
            const deep = D.tintOf(pick, 1, T8());
            expect(lightness(deep)).toBeLessThanOrEqual(T8().cap + 0.01);
        }
        const yellow = D.rgb(D.tintOf('#F3D98A', 1, T8()));
        expect(yellow[0]).toBeGreaterThan(yellow[2] + 60);       // still yellow, not gray
        expect(D.tintOf('#FFFFFF', 1, T8())).toBe('#6b6b6b');    // white is a gray
    });

    test('every swatch steps darker down the rows, as the meme\'s own does', () => {
        const shares = T.templateOf('galaxyBrain').cells.filter((c) => c.tint !== undefined).map((c) => c.tint);
        const own = T.templateOf('galaxyBrain').cells.filter((c) => c.tint !== undefined).map((c) => lightness(c.backdrop));
        for (let i = 1; i < own.length; i++) expect(own[i]).toBeLessThan(own[i - 1]);
        for (const { color } of T8().swatches) {
            const rows = shares.map((t) => lightness(D.tintOf(color, t, T8())));
            for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeLessThan(rows[i - 1]);
            expect(rows[rows.length - 1]).toBeLessThanOrEqual(T8().cap + 0.01);
        }
    });

    test('a panel wears the pick on a wall that follows it, its own color on null, and leaves every other wall alone', () => {
        const cells = T.templateOf('galaxyBrain').cells;
        const hex = (panel) => `#${panel.box.getObjectByName('back').material.color.getHexString()}`;
        const own = (cell) => `#${new THREE.Color(cell.backdrop).getHexString()}`;
        const face = P.buildPanel(cells[7], CONFIG, () => DEFAULT_AVATAR, { tint: '#1b2a55' });
        expect(hex(face)).toBe('#1b2a55');
        expect(face.setTint(null)).toBe(true);
        expect(hex(face)).toBe(own(cells[7]));
        expect(face.setTint('#ffffff')).toBe(true);
        expect(hex(face)).toBe('#6b6b6b');
        const words = P.buildPanel(cells[0], CONFIG, () => DEFAULT_AVATAR, { tint: '#1b2a55' });
        expect(hex(words)).toBe(own(cells[0]));
        expect(words.setTint('#1b2a55')).toBe(false);
        expect(hex(words)).toBe(own(cells[0]));
        for (const p of [face, words]) p.dispose();
    });

    test('the stage recolors only the walls that follow, built with the pick or changed after', async () => {
        const S = await import('../www/meme/js/stage.js');
        const renderer = { shadowMap: {}, setPixelRatio() {}, setSize() {}, render() {}, setAnimationLoop() {}, dispose() {} };
        const canvas = { clientWidth: 800, clientHeight: 600 };
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: () => renderer });
        const walls = () => stage.panels.map((p) => `#${p.box.getObjectByName('back').material.color.getHexString()}`);
        stage.setTemplate(T.templateOf('galaxyBrain'), () => DEFAULT_AVATAR, { tint: '#121214' });
        expect(walls()[7]).toBe('#121214');
        expect(walls()[0]).toBe(`#${new THREE.Color(T.templateOf('galaxyBrain').cells[0].backdrop).getHexString()}`);
        expect(stage.setTint('#1b2a55')).toBe(4);
        expect(walls()[7]).toBe('#1b2a55');
        expect(stage.setTint(null)).toBe(4);
        expect(walls()[7]).toBe(`#${new THREE.Color('#4B2E99').getHexString()}`);
        stage.setTemplate(T.templateOf('panic'), () => DEFAULT_AVATAR, { tint: '#121214' });
        expect(stage.setTint('#1b2a55')).toBe(0);
        stage.dispose();
    });
});

describe('on a box', () => {
    test('a painted wall is its picture on a white material, shared between panels, in the wall\'s own color', () => {
        const paint = { wall: 'wash' };
        const a = P.buildBox(CONFIG.box, '#D9BF93', { paint });
        const b = P.buildBox(CONFIG.box, '#D9BF93', { paint });
        const backOf = (box) => box.getObjectByName('back').material;
        expect(backOf(a).map).toBeTruthy();
        expect(backOf(a).map).toBe(backOf(b).map);
        expect(backOf(a).color.getHex()).toBe(0xffffff);
        expect(backOf(a).map.colorSpace).toBe(THREE.SRGBColorSpace);
        // Another color is another picture.
        expect(backOf(P.buildBox(CONFIG.box, '#AA8866', { paint })).map).not.toBe(backOf(a).map);
        // An unpainted box is its plain colors, the floor its own when given.
        const plain = P.buildBox(CONFIG.box, '#FF0000', { floor: '#2C2E32' });
        expect(backOf(plain).map).toBeNull();
        expect(backOf(plain).color.getHexString()).toBe(new THREE.Color('#FF0000').getHexString());
        expect(plain.getObjectByName('floor').material.color.getHexString()).toBe(new THREE.Color('#2C2E32').getHexString());
        expect(P.buildBox(CONFIG.box).getObjectByName('floor').material.color.getHexString()).toBe(new THREE.Color(CONFIG.box.floor).getHexString());
    });

    test('a painter that does not exist leaves the plain color', () => {
        const box = P.buildBox(CONFIG.box, '#FF0000', { paint: { wall: 'mural' } });
        expect(box.getObjectByName('back').material.map).toBeNull();
    });
});

describe('the scenes that came with them', () => {
    test('The Handshake: the glow stands behind the clasp, behind both figures, and the warm light in front of it', () => {
        const panel = P.buildPanel(T.templateOf('handshake').cells[0], CONFIG, () => DEFAULT_AVATAR);
        const glow = panel.box.getObjectByName('claspGlow');
        const light = panel.box.getObjectByName('claspLight');
        expect(glow).toBeTruthy();
        expect(light).toBeTruthy();
        // The clasp measured from the hands themselves.
        const hands = panel.figures.map((f) => {
            let hand = null;
            f.arms.right.traverse((o) => { if (!hand && o.userData && o.userData.isHand) hand = o; });
            return panel.box.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
        });
        const clasp = hands[0].clone().add(hands[1]).multiplyScalar(0.5);
        expect(hands[0].distanceTo(hands[1])).toBeLessThan(0.12);     // they do meet
        // On the camera's line through the clasp, so the picture has it
        // centered on the hands.
        const eye = new THREE.Vector3(...T.templateOf('handshake').cells[0].camera.eye);
        const toClasp = clasp.clone().sub(eye).normalize();
        const toGlow = glow.position.clone().sub(eye).normalize();
        expect(toClasp.angleTo(toGlow)).toBeLessThan(0.005);
        // Behind every part of both figures, measured on the drawn meshes,
        // so their bodies cover it where they stand and it cuts through
        // none (a resting hand reaches nearly to the wall).
        for (const f of panel.figures) expect(glow.position.z).toBeLessThan(new THREE.Box3().setFromObject(f.group, true).min.z);
        // And on the painted wall's own pool of light.
        const B = CONFIG.box;
        const [u, v] = D.PAINTS.storm.light.at;
        expect(Math.hypot((glow.position.x + B.width / 2) / B.width - u, glow.position.y / B.height - v)).toBeLessThan(D.PAINTS.storm.light.radius * 0.15);
        expect(glow.material.blending).toBe(THREE.AdditiveBlending);
        expect(glow.geometry.parameters.width).toBeCloseTo(CLASP_GLOW.radius * 2, 9);
        expect(light.position.z).toBeGreaterThan(clasp.z + 0.3);
        // Inside the box, just off its back wall.
        expect(glow.position.z).toBeGreaterThan(-CONFIG.box.depth / 2);
        expect(glow.position.z).toBeLessThan(-CONFIG.box.depth / 2 + 0.05);
        panel.dispose();
    });

    test('The Handshake with one hand to shake has no glow to place', () => {
        const cell = JSON.parse(JSON.stringify(T.templateOf('handshake').cells[0]));
        cell.figures = cell.figures.slice(0, 1);
        const panel = P.buildPanel(cell, CONFIG, () => DEFAULT_AVATAR);
        expect(panel.box.getObjectByName('claspGlow')).toBeUndefined();
        expect(panel.box.getObjectByName('handshake')).toBeTruthy();
        panel.dispose();
    });

    test('Everything Is Fine: the table on the camera\'s right of the figure, the smoke pooled under the ceiling, drifting when ticked and coming round again', () => {
        const panel = P.buildPanel(T.templateOf('everythingIsFine').cells[0], CONFIG, () => DEFAULT_AVATAR);
        const table = panel.box.getObjectByName('table');
        const figure = panel.figures[0];
        expect(table.position.x).toBeGreaterThan(figure.group.position.x + 0.4);
        // The mug at the table's end nearest the figure.
        expect(panel.box.getObjectByName('mug').position.x).toBeLessThan(table.position.x);
        const smoke = () => panel.box.getObjectByName('fine').children.filter((o) => o.name === 'smoke');
        expect(smoke()).toHaveLength(CONFIG.smoke.count);
        const head = figure.head();
        for (const s of smoke()) {
            expect(s.position.y).toBeGreaterThanOrEqual(FINE.smoke.from - 0.05);
            expect(s.position.y).toBeLessThanOrEqual(FINE.smoke.to + 0.05);
            expect(s.position.y - s.scale.y / 2).toBeGreaterThan(head.y - 0.2);   // over the head
            expect(s.material.blending).toBe(THREE.NormalBlending);
            expect(Math.abs(s.position.z)).toBeLessThan(CONFIG.box.depth / 2);
        }
        const before = smoke().map((s) => s.position.x);
        panel.tick(0.5);
        expect(smoke().map((s) => s.position.x)).not.toEqual(before);
        // A long while later every puff is still inside the box.
        for (let i = 0; i < 200; i++) panel.tick(0.1);
        for (const s of smoke()) expect(Math.abs(s.position.x)).toBeLessThanOrEqual((CONFIG.box.width * FINE.smoke.spread) / 2 + 1e-9);
        panel.dispose();
        const phone = P.buildPanel(T.templateOf('everythingIsFine').cells[0], CONFIG, () => DEFAULT_AVATAR, { mobile: true });
        expect(phone.box.getObjectByName('fine').children.filter((o) => o.name === 'smoke')).toHaveLength(CONFIG.smoke.countMobile);
        phone.dispose();
    });
});
