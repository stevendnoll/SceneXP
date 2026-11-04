// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The props and staging of the four templates of 2026-11-03, on the real
 * three, through each cell's own camera at the real pictures' shapes:
 * Two Buttons' plates and buttons stay in frame at both sizes and short of the
 * side wall's shadow, its hand reaches up from below in the visitor's skin and
 * sleeve; The Medal hangs on the one being honored, on any build, its ribbon round
 * the neck, and stays there when that figure is built again; Not That Simple's
 * hand is on one side and the torch on the other, no taller than the head, its
 * cloak on any figure; and The Side Glance's panels differ by the eyes and nothing
 * else.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let P;
let T;
let C;
let CONFIG;
let DEFAULT_AVATAR;
let BUTTONS;
let MEDAL;
let HALL;
let chestFront;
let slotLabel;
let createAvatar;
let colorOf;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    jest.resetModules();
    P = await import('../www/meme/js/panels.js');
    T = await import('../www/meme/js/templates.js');
    C = await import('../www/meme/js/compose.js');
    ({ MEME_PAGE: CONFIG } = await import('../www/meme/js/config.js'));
    ({ DEFAULT_AVATAR, colorOf } = await import('../www/shared/js/avatar-1.0.0.js'));
    ({ BUTTONS } = await import('../www/meme/js/scenes/buttons.js'));
    ({ MEDAL } = await import('../www/meme/js/scenes/medal.js'));
    ({ HALL } = await import('../www/meme/js/scenes/hall.js'));
    ({ chestFront } = await import('../www/meme/js/scenes/wear.js'));
    ({ slotLabel } = await import('../www/meme/js/editor.js'));
    ({ createAvatar } = await import('../www/shared/js/avatar-figure-1.0.0.min.js'));
});
afterAll(() => {
    delete globalThis.THREE;
});

const avatarOf = (fields = {}) => () => ({ ...DEFAULT_AVATAR, ...fields });

/** The chest of a figure of this build with nothing added to it (once a medal
 *  or a cloak is on, its own pieces are what stands furthest forward). */
function bareChest(fields = {}) {
    const figure = createAvatar({ ...DEFAULT_AVATAR, ...fields });
    const front = chestFront(figure);
    figure.dispose();
    return front;
}

/** Cell `i` of a template built alone, with a camera for a panel `w` by `h`. */
function shot(id, i, w, h, fields) {
    const cell = T.templateOf(id).cells[i];
    const panel = P.buildPanel(cell, CONFIG, avatarOf(fields));
    panel.box.updateMatrixWorld(true);
    const pose = P.cellCamera(cell, panel.box);
    const camera = new THREE.PerspectiveCamera(pose.fov, w / h, 0.02, 40);
    camera.position.fromArray(pose.eye);
    camera.lookAt(...pose.aim);
    camera.updateMatrixWorld(true);
    return { cell, panel, camera };
}

/** Every panel of a template at each export size, `{ w, h }` of each cell. */
function panelSizes(template) {
    return CONFIG.export.pictures.flatMap(({ w, h }) => {
        const gutter = h * CONFIG.panel.gutter;
        return C.layoutGrid(template, w, h, { gutter, padding: gutter }).map((r, i) => ({ i, w: r.w, h: r.h }));
    });
}

describe('Two Buttons', () => {
    test('both plates and both buttons are in frame at both picture sizes, side by side, each plate over its button', () => {
        const template = T.templateOf('twoButtons');
        for (const { i, w, h } of panelSizes(template).filter((s) => s.i === 0)) {
            const { panel, camera } = shot('twoButtons', 0, w, h);
            const { left, right } = P.propRects(panel, camera, w, h);
            for (const r of [left, right]) {
                expect(r.x).toBeGreaterThan(0);
                expect(r.y).toBeGreaterThan(0);
                expect(r.x + r.w).toBeLessThan(w);
                expect(r.y + r.h).toBeLessThan(h);
            }
            expect(left.x + left.w).toBeLessThan(right.x);
            expect(left.y).toBeCloseTo(right.y, 3);
            // Tall enough for words that read on a phone: a share of the panel.
            expect(left.h).toBeGreaterThan(h * 0.3);
            const domes = panel.box.getObjectByName('buttons').children.filter((o) => o.name === 'collar');
            expect(domes).toHaveLength(2);
            for (const collar of domes) {
                const middle = panel.box.localToWorld(collar.position.clone());
                const m = P.projectPoint(middle.toArray(), camera, w, h);
                const edge = P.projectPoint([middle.x, middle.y + BUTTONS.button.collar.r, middle.z], camera, w, h);
                expect(m.y + (m.y - edge.y)).toBeLessThan(h);
                expect(edge.y).toBeGreaterThanOrEqual(left.y + left.h - 1);
                expect(Math.min(Math.abs(m.x - (left.x + left.w / 2)), Math.abs(m.x - (right.x + right.w / 2)))).toBeLessThan(w * 0.03);
            }
            panel.dispose();
        }
    });

    test('the camera stops short of the side wall\'s shadow strip at the widest panel, and sees none of the side walls', () => {
        const { camera: _c, cell } = shot('twoButtons', 0, 2, 1);
        const widest = Math.max(...panelSizes(T.templateOf('twoButtons')).filter((s) => s.i === 0).map((s) => s.w / s.h));
        const B = CONFIG.box;
        const distance = cell.camera.eye[2] + B.depth / 2;
        const halfWide = distance * Math.tan((cell.camera.fov * Math.PI) / 360) * widest;
        const L = CONFIG.light.sun;
        const azimuth = Math.abs(L.position[0] - L.target[0]) / (L.position[2] - L.target[2]);
        expect(halfWide).toBeLessThan(B.width / 2 - B.depth * azimuth);
    });

    test('a finger reaches up from below between the buttons, in front of the wall, no wider than the gap, and the panel holds no figure', () => {
        const { panel, camera } = shot('twoButtons', 0, 2, 1);
        const hand = panel.box.getObjectByName('hand');
        const sleeve = panel.box.getObjectByName('sleeve');
        expect(hand.geometry.attributes.position.count).toBeGreaterThan(0);
        panel.box.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(hand, true);
        // The fingers point up and the wrist is under them (Steve's QA,
        // 2026-11-03: from below, not from above): a hand's fingers run along its
        // own -y.
        const fingers = new THREE.Vector3(0, -1, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
        expect(fingers.y).toBeGreaterThan(0.7);
        // The fingertip is the top of the hand, over the buttons' middles and
        // under the plates.
        expect(box.max.y).toBeGreaterThan(BUTTONS.button.y);
        expect(box.max.y).toBeLessThan(BUTTONS.plate.y - BUTTONS.plate.h / 2);
        const gap = BUTTONS.x - BUTTONS.button.collar.r;
        expect(box.min.x).toBeGreaterThan(-gap);
        expect(box.max.x).toBeLessThan(gap);
        // The tip in the picture is the index, near the panel's middle.
        const tip = P.projectPoint([(box.min.x + box.max.x) / 2, box.max.y, box.max.z], camera, 2000, 1000);
        expect(Math.abs(tip.x - 1000)).toBeLessThan(200);
        // The arm runs down from the wrist to the floor, coming toward the
        // camera as it goes, so its end is under the floor and not in the air.
        const length = sleeve.geometry.parameters.height;
        const end = sleeve.localToWorld(new THREE.Vector3(0, -length / 2, 0));
        expect(Math.abs(end.y)).toBeLessThan(0.15);
        expect(end.z).toBeGreaterThan(hand.getWorldPosition(new THREE.Vector3()).z + 0.2);
        // A panel with no figure offers no face and makes nobody's label.
        expect(panel.figures).toEqual([]);
        panel.dispose();
    });

    test('the hand wears the visitor\'s skin and sleeve, and follows when the visitor changes, and no other role\'s', () => {
        const dressed = { ...DEFAULT_AVATAR, skin: 'deep', shirt: 'teal' };
        const { panel } = shot('twoButtons', 0, 2, 1, dressed);
        const hand = panel.box.getObjectByName('hand');
        const sleeve = panel.box.getObjectByName('sleeve');
        expect(hand.material.color.getHex()).toBe(new THREE.Color(colorOf('skin', 'deep')).getHex());
        expect(sleeve.material.color.getHex()).toBe(new THREE.Color(colorOf('shirt', 'teal')).getHex());
        const then = hand.material.color.getHex();
        expect(panel.redress('friend', { ...dressed, skin: 'fair' })).toBe(true);
        expect(hand.material.color.getHex()).toBe(then);
        expect(panel.redress('you', { ...dressed, skin: 'fair', shirt: 'white' })).toBe(true);
        expect(hand.material.color.getHex()).toBe(new THREE.Color(colorOf('skin', 'fair')).getHex());
        expect(sleeve.material.color.getHex()).toBe(new THREE.Color(colorOf('shirt', 'white')).getHex());
        panel.dispose();
        // A panel whose props wear nobody says so.
        const plain = shot('plan', 0, 1, 1).panel;
        expect(plain.redress('you', dressed)).toBe(false);
        plain.dispose();
    });

    test('below it, the visitor bareheaded with clear lenses, and sweat flying that reads at thumbnail size, clear of the head', () => {
        const [w, h] = [1054, 521];
        const { panel, camera } = shot('twoButtons', 1, w, h, { hat: 'cap', glasses: 'sunglasses' });
        const figure = panel.figures[0];
        expect(figure.avatar.hat).toBe('none');
        expect(figure.person.getObjectByName('glasses').children.filter((o) => o.name === 'lens')).toHaveLength(0);
        const drops = panel.box.getObjectByName('flyingSweat').children;
        expect(drops.length).toBeGreaterThanOrEqual(6);
        const head = figure.head();
        for (const drop of drops) {
            const at = drop.getWorldPosition(new THREE.Vector3());
            const p = P.projectPoint(at.toArray(), camera, w, h);
            expect(p.x).toBeGreaterThan(0);
            expect(p.x).toBeLessThan(w);
            expect(p.y).toBeGreaterThan(0);
            expect(p.y).toBeLessThan(h);
            expect(at.distanceTo(head)).toBeGreaterThan(0.14);
            // At least 25 px on the 1080 picture: about 8 on a 360 px phone.
            const top = P.projectPoint([at.x, at.y + BUTTONS.drops.r * drop.scale.y, at.z], camera, w, h);
            expect(Math.abs(p.y - top.y) * 2).toBeGreaterThan(25);
        }
        panel.dispose();
    });

    test('a prop slot goes by its own name in the fields, "On the board" when it has none', () => {
        const slots = T.slotsOf(T.templateOf('twoButtons'));
        expect(slots.map((_, k) => slotLabel(slots, k))).toEqual(['Panel 1: Left button', 'Panel 1: Right button', 'Panel 2: Caption']);
        const plan = T.slotsOf(T.templateOf('plan'));
        expect(slotLabel(plan, 0)).toBe('Panel 1: On the board');
    });
});

describe('The Medal', () => {
    test('the medal hangs on the one being honored, and on nobody else, when built and when built again', () => {
        const { panel } = shot('medal', 0, 1, 1);
        const has = (i, name = 'medal') => Boolean(panel.figures[i].person.getObjectByName(name));
        expect([has(0), has(1)]).toEqual([true, false]);
        panel.replaceFigure(0, { expression: 'crying' });
        expect(has(0)).toBe(true);
        panel.replaceFigure(1, { expression: 'crying' });
        expect(has(1)).toBe(false);
        panel.dispose();
    });

    test('its disc stands clear of the chest on every build, on the chest and not out in the air before it', () => {
        const fronts = {};
        for (const build of ['straight', 'slim', 'curvy', 'pear', 'broad', 'round', 'full']) {
            const { panel } = shot('medal', 0, 1, 1, { build });
            const figure = panel.figures[0];
            const disc = figure.person.getObjectByName('medal').getObjectByName('disc');
            fronts[build] = bareChest({ build, ...T.templateOf('medal').cells[0].figures[0].overrides });
            expect(`${build} ${disc.position.z - fronts[build] > 0}`).toBe(`${build} true`);
            expect(`${build} ${disc.position.z - fronts[build] < 0.03}`).toBe(`${build} true`);
            expect(disc.position.y).toBe(MEDAL.disc.y);
            panel.dispose();
        }
        // Measured on the build: a round middle stands deeper than a slim one.
        expect(fronts.round).toBeGreaterThan(fronts.slim + 0.02);
    });

    test('the ribbon goes round the neck: a band behind it, open at the throat, and two straps from its ends down to the disc (Steve\'s QA, 2026-11-03)', () => {
        const { panel } = shot('medal', 0, 1, 1);
        const figure = panel.figures[0];
        const medal = figure.person.getObjectByName('medal');
        const band = medal.getObjectByName('band');
        const B = MEDAL.ribbon.band;
        const pos = band.geometry.attributes.position;
        let behind = 0;
        for (let i = 0; i < pos.count; i++) {
            const [x, z] = [pos.getX(i), pos.getZ(i)];
            // Nothing across the throat: every point well round from the front.
            expect(Math.abs(Math.atan2(x, z))).toBeGreaterThan(0.6);
            // Outside the neck, whose radius is 0.05.
            expect(Math.hypot(x, z)).toBeGreaterThan(0.05);
            if (z < -0.04) behind++;
        }
        expect(behind).toBeGreaterThan(0);
        // At the neck: above the shoulders' top, under the chin.
        const head = figure.head();
        expect(band.position.y).toBeGreaterThan(1.3);
        expect(band.position.y).toBeLessThan(head.y - 0.12);
        // Two straps a side, the first from the band's end and the last ending
        // at the disc, with no gap along the way.
        const straps = medal.children.filter((o) => o.name === 'strap');
        expect(straps).toHaveLength(4);
        const ends = (piece) => {
            const half = piece.geometry.parameters.height / 2;
            const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(piece.quaternion);
            return [piece.position.clone().addScaledVector(dir, half), piece.position.clone().addScaledVector(dir, -half)];
        };
        const disc = medal.getObjectByName('disc').position;
        for (const k of [0, 2]) {
            const [upperTop, upperBottom] = ends(straps[k]);
            const [lowerTop, lowerBottom] = ends(straps[k + 1]);
            expect(upperTop.y).toBeCloseTo(B.y, 1);
            expect(upperBottom.distanceTo(lowerTop)).toBeLessThan(0.03);
            expect(lowerBottom.distanceTo(disc)).toBeLessThan(MEDAL.disc.r + 0.02);
        }
        panel.dispose();
    });

    test('over any clothes: the shared suit, no hat, the disc in front of the tie', () => {
        const { panel } = shot('medal', 0, 1, 1, { sleeves: 'jersey', shirt: 'teal', hat: 'cap', bottom: 'shorts', tieColor: 'pink' });
        const [receiver, giver] = panel.figures;
        for (const f of [receiver, giver]) {
            expect(f.avatar.hat).toBe('none');
            expect(f.avatar.sleeves).toBe('suit');
            expect(f.avatar.bottom).toBe('pants');
            expect(f.avatar.tieColor).toBe('darkRed');
            expect(f.person.getObjectByName('shirtFront')).toBeTruthy();
        }
        const tie = receiver.person.getObjectByName('tie').position.z;
        expect(receiver.person.getObjectByName('disc').position.z).toBeGreaterThan(tie);
        panel.dispose();
    });

    test('the camera sees both faces apart, both looking to its left, the receiver in front, at both picture sizes', () => {
        for (const { w, h } of CONFIG.export.pictures) {
            const { panel, camera } = shot('medal', 0, w, h);
            const [receiver, giver] = panel.figures;
            const on = (v) => P.projectPoint(v.toArray(), camera, w, h);
            const heads = [receiver, giver].map((f) => on(f.head()));
            const radius = Math.abs(on(receiver.head().add(new THREE.Vector3(0, 0.12, 0))).y - heads[0].y);
            expect(heads[1].x - heads[0].x).toBeGreaterThan(radius * 2);
            for (const f of [receiver, giver]) {
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(f.group.getWorldQuaternion(new THREE.Quaternion()));
                expect(forward.x).toBeLessThan(-0.4);
                expect(forward.z).toBeGreaterThan(0.4);
                expect(on(f.head()).x).toBeGreaterThan(0);
                expect(on(f.head()).x).toBeLessThan(w);
            }
            panel.dispose();
        }
    });

    test('both of the giver\'s hands are open at the action size, for the ribbon, and the receiver\'s rest', () => {
        const { panel } = shot('medal', 0, 1, 1);
        const handOf = (figure, side) => {
            let hand = null;
            figure.arms[side].traverse((o) => { if (!hand && o.userData.isHand) hand = o; });
            return hand;
        };
        const [receiver, giver] = panel.figures;
        expect(['right', 'left'].map((s) => handOf(giver, s).userData.shape)).toEqual(['open', 'open']);
        expect(['right', 'left'].map((s) => handOf(receiver, s).userData.shape)).toEqual([undefined, undefined]);
        panel.dispose();
    });

    test('the chest\'s measure: the body within its heights, never a limb or the head, and the rig\'s depth with nothing to read', () => {
        const part = (y, z, tags = {}, name = '') => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
            mesh.position.set(0, y, z);
            mesh.name = name;
            Object.assign(mesh.userData, tags);
            return mesh;
        };
        const figure = (...children) => {
            const person = new THREE.Group();
            person.add(...children);
            return { person };
        };
        // A piece of the body at chest height counts, its own half depth too.
        expect(chestFront(figure(part(1.2, 0.2)))).toBeCloseTo(0.25, 6);
        // Nested pieces add their parents' positions.
        const nested = new THREE.Group();
        nested.position.z = 0.1;
        nested.add(part(1.2, 0.1));
        expect(chestFront(figure(nested))).toBeCloseTo(0.25, 6);
        // Outside the heights, it does not (a toe, a nose).
        expect(chestFront(figure(part(0.3, 0.5), part(1.6, 0.5)))).toBe(0.11);
        // Nor does a limb or the head, wherever they stand.
        for (const tags of [{ isArm: true }, { isLeg: true }, { isHead: true }]) expect(chestFront(figure(part(1.2, 0.5, tags)))).toBe(0.11);
        expect(chestFront(figure(part(1.2, 0.5, {}, 'head')))).toBe(0.11);
        // Never less than the rig's depth, and that with no person at all.
        expect(chestFront({})).toBe(0.11);
        // A real figure's arms held out in front leave it no deeper.
        const posed = createAvatar(DEFAULT_AVATAR);
        const before = chestFront(posed);
        posed.setPose({ right: { z: 0, x: -1.6, fore: 0, twist: 0 }, left: { z: 0, x: -1.6, fore: 0, twist: 0 } });
        expect(chestFront(posed)).toBeCloseTo(before, 6);
        posed.dispose();
    });
});

describe('Not That Simple', () => {
    test('the raised hand on the camera\'s left and the torch on its right, both in frame, the head clear between them', () => {
        const { panel, camera } = shot('notThatSimple', 0, 1000, 1000);
        const figure = panel.figures[0];
        let hand = null;
        figure.arms.right.traverse((o) => { if (!hand && o.userData.isHand) hand = o; });
        expect(hand.userData.shape).toBe('ring');
        const onScreen = (world) => P.projectPoint(world.toArray(), camera, 1000, 1000);
        const h3 = () => hand.getWorldPosition(new THREE.Vector3());
        const h = onScreen(h3());
        const face = onScreen(figure.head());
        const torch = onScreen(panel.box.getObjectByName('cup').getWorldPosition(new THREE.Vector3()));
        expect(h.x).toBeGreaterThan(100);
        expect(h.x).toBeLessThan(face.x - 150);
        expect(torch.x).toBeGreaterThan(face.x + 150);
        expect(torch.x).toBeLessThan(1000);
        // Up in the frame with the face, and no taller than the head in the
        // picture, however close to the camera it stands (Steve's QA, 2026-11-03:
        // "way too big"), though still a good share of it.
        expect(Math.abs(h.y - face.y)).toBeLessThan(200);
        const bounds = new THREE.Box3().setFromObject(hand, true);
        const handPixels = Math.abs(onScreen(new THREE.Vector3(h3().x, bounds.max.y, h3().z)).y - onScreen(new THREE.Vector3(h3().x, bounds.min.y, h3().z)).y);
        const headPixels = Math.abs(onScreen(figure.head().add(new THREE.Vector3(0, 0.12, 0))).y - onScreen(figure.head().add(new THREE.Vector3(0, -0.12, 0))).y);
        expect(handPixels).toBeLessThan(headPixels * 0.95);
        expect(handPixels).toBeGreaterThan(headPixels * 0.5);
        panel.dispose();
    });

    test('a cloak on any build, a cape behind and edges before, and on the figure built again', () => {
        for (const build of ['slim', 'round']) {
            const { panel } = shot('notThatSimple', 0, 1, 1, { build });
            const figure = panel.figures[0];
            const cloak = figure.person.getObjectByName('cloak');
            const front = bareChest({ build, ...T.templateOf('notThatSimple').cells[0].figures[0].overrides });
            expect(cloak.getObjectByName('cape').position.z).toBeLessThan(-front);
            // The mantle is open down the front, over the shoulders.
            const mantle = cloak.getObjectByName('mantle');
            expect(mantle.position.y + HALL.cloak.mantle.h / 2).toBe(HALL.cloak.mantle.y);
            expect(HALL.cloak.mantle.gap).toBeGreaterThan(0);
            const lumps = HALL.cloak.collar.rings.reduce((n, ring) => n + ring[3], 0);
            expect(cloak.children.filter((o) => o.name === 'fur')).toHaveLength(lumps);
            const again = panel.replaceFigure(0, { expression: 'deadpan' });
            expect(again.person.getObjectByName('cloak')).toBeTruthy();
            panel.dispose();
        }
    });

    test('the flame and its light move when ticked, and the costume is the meme\'s', () => {
        const { panel } = shot('notThatSimple', 0, 1, 1, { shirt: 'teal', hat: 'cap' });
        const flame = panel.box.getObjectByName('flame');
        const light = panel.box.getObjectByName('torchLight');
        const before = [flame.scale.x, light.intensity];
        expect(panel.tick(0.13)).toBe(true);
        expect([flame.scale.x, light.intensity]).not.toEqual(before);
        expect(panel.figures[0].avatar.hat).toBe('none');
        expect(panel.figures[0].avatar.shirt).not.toBe('teal');
        panel.dispose();
    });
});

describe('The Side Glance', () => {
    /** Each eye part's place in the head, by name, with the rest of the head's
     *  children in order. */
    const eyeParts = (figure) => figure.person.getObjectByName('head').children
        .filter((o) => o.userData.isIris || o.userData.isPupil)
        .map((o) => o.position.toArray());
    const whites = (figure) => figure.person.getObjectByName('head').children.filter((o) => o.userData.isEye).map((o) => [o.scale.x, o.scale.y, o.scale.z]);

    test('the first panel\'s irises are rolled toward the camera, the second\'s straight ahead, the whites alike', () => {
        const [first, second] = [0, 1].map((i) => shot('sideGlance', i, 1, 2).panel);
        const [a, b] = [first.figures[0], second.figures[0]];
        // The figure faces the camera's right, so the camera is on its right,
        // the head's -x.
        eyeParts(a).forEach((p, i) => {
            expect(p[0]).toBeLessThan(eyeParts(b)[i][0] - 0.01);
            expect(p[2]).toBeLessThan(eyeParts(b)[i][2]);
        });
        expect(whites(a)).toEqual(whites(b));
        expect(a.group.rotation.y).toBe(b.group.rotation.y);
        const head = (f) => f.person.getObjectByName('head').rotation.y;
        expect(head(a)).toBe(head(b));
        expect(head(a)).toBe(0);
        first.dispose();
        second.dispose();
    });

    test('the first panel\'s pupils look toward the camera, the second\'s away from it, each stopping inside its white', () => {
        /** How squarely each pupil faces the camera from its eye's middle. */
        const facing = (i) => {
            const { panel, camera } = shot('sideGlance', i, 1000, 2000);
            const head = panel.figures[0].person.getObjectByName('head');
            const pupils = head.children.filter((o) => o.userData.isPupil);
            expect(pupils).toHaveLength(2);
            const eyes = head.children.filter((o) => o.userData.isEye);
            const out = pupils.map((pupil) => {
                const eye = eyes.reduce((best, e) => (Math.abs(e.position.x - pupil.position.x) < Math.abs(best.position.x - pupil.position.x) ? e : best), eyes[0]);
                const middle = eye.getWorldPosition(new THREE.Vector3());
                const toCamera = camera.position.clone().sub(middle).normalize();
                expect(Math.abs(pupil.position.x - eye.position.x)).toBeLessThan(eye.geometry.parameters.radius * eye.scale.x);
                return pupil.getWorldPosition(new THREE.Vector3()).sub(middle).normalize().dot(toCamera);
            });
            panel.dispose();
            return out;
        };
        const [look, away] = [facing(0), facing(1)];
        // Within about 30 degrees of the camera, against 40 or more when
        // looking straight ahead: the whole of the joke is in that change.
        for (const dot of look) expect(dot).toBeGreaterThan(0.86);
        for (const dot of away) expect(dot).toBeLessThan(0.8);
    });

    test('a new expression keeps the look, and dark lenses clear so the eyes are seen', () => {
        const { panel } = shot('sideGlance', 0, 1, 2, { glasses: 'sunglasses' });
        const before = eyeParts(panel.figures[0]);
        const glasses = panel.figures[0].person.getObjectByName('glasses');
        expect(glasses).toBeTruthy();
        expect(glasses.children.filter((o) => o.name === 'lens')).toHaveLength(0);
        const again = panel.replaceFigure(0, { expression: 'smug' });
        expect(eyeParts(again)).toEqual(before);
        panel.dispose();
    });
});
