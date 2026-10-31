// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Team colors on the DRAWN game: the kits, the rings under the players' feet and
 * the fans, measured on real three materials.
 *
 * THE STUB CANNOT ANSWER ANY OF THIS: it absorbs every color written to a
 * material. And the fault these guard against is one only real materials have.
 * The roster merges identical materials once when it is built, so two teams in
 * the same color would share a shirt, and recoloring one would recolor both.
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const js = (name) => join(root, 'www/xo/js', name);

let THREE;
let CFG;
let C;
let roster;
let markers;
let spectacle;
let field;
let preview;
let objects;
let scene;

/** Every distinct material on a figure, by the name the kit tagged it with. */
function kitOf(position) {
    const out = {};
    roster.figureFor(position).traverse((node) => {
        const m = node.isMesh && node.material;
        if (m && m.userData && m.userData.kit) out[m.userData.kit] = m;
    });
    return out;
}

const hexOf = (m) => `#${m.color.getHexString()}`;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }) };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

    CFG = (await import(js('config.min.js'))).XO_CONFIG;
    C = await import(js('colors.min.js'));
    const P = await import(js('play.min.js'));
    roster = await import(js('roster.min.js'));
    markers = await import(js('markers.min.js'));
    spectacle = await import(js('spectacle.min.js'));
    field = await import(js('field.min.js'));
    preview = await import(js('colors-preview.js'));

    scene = new THREE.Scene();
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    C.resetColors();
    field.initField(scene);
    roster.initRoster(scene, objects);
    markers.initMarkers(scene, objects);
    spectacle.initSpectacle(scene, {});
});

beforeEach(() => {
    C.resetColors();
    roster.applyTeamColors();
});

/** Every tagged role a dressed figure carries, the stripes included. */
const ROLES = ['helmet', 'helmetStripe', 'mark', 'pants', 'pantsStripe', 'shirt', 'shoes', 'sleeve'];

/** The stripe meshes on a figure, by name, with whether each is shown. */
function stripesOn(position) {
    const out = [];
    roster.figureFor(position).traverse((n) => {
        if (n.name === 'helmet-stripe' || n.name === 'pants-stripe') out.push([n.name, n.visible]);
    });
    return out;
}

describe('the kits', () => {
    test('are built in the game\'s own colors, every part of every figure tagged', () => {
        for (const [position, team] of [['qb', 0], ['wr1', 0], ['x1', 0], ['db1', 1], ['s1', 1]]) {
            const kit = kitOf(position);
            expect(Object.keys(kit).sort()).toEqual(ROLES);
            expect(hexOf(kit.shirt)).toBe(C.jerseyOf(team));
            expect(hexOf(kit.mark)).toBe('#ffffff');
            expect(hexOf(kit.pants)).toBe(C.OWN.pants[team]);
            expect(hexOf(kit.shoes)).toBe(C.OWN.shoes);
        }
    });

    test('two teams dressed alike still do not share a material', () => {
        const alike = { jersey: '#123456', pants: '#654321', shoes: '#abcdef', helmetStripe: '#ffffff', pantsStripe: '#ffffff' };
        C.setColors({ teams: { 0: alike, 1: alike } });
        roster.applyTeamColors();
        C.setColors({ teams: { 0: { jersey: '#aa0000', pants: '#00aa00', shoes: '#0000aa', helmetStripe: '#111111', pantsStripe: '#222222' } } });
        roster.applyTeamColors();
        const want = { shirt: '#aa0000', sleeve: '#aa0000', helmet: '#aa0000', pants: '#00aa00', shoes: '#0000aa', helmetStripe: '#111111', pantsStripe: '#222222' };
        const kept = { shirt: '#123456', sleeve: '#123456', helmet: '#123456', pants: '#654321', shoes: '#abcdef', helmetStripe: '#ffffff', pantsStripe: '#ffffff' };
        for (const part of Object.keys(want)) {
            expect([part, hexOf(kitOf('qb')[part])]).toEqual([part, want[part]]);
            expect([part, hexOf(kitOf('db1')[part])]).toEqual([part, kept[part]]);
            expect(kitOf('qb')[part]).not.toBe(kitOf('db1')[part]);
        }
        expect(kitOf('qb').mark).not.toBe(kitOf('db1').mark);
    });

    test('a helmet of its own, a dark letter on a light jersey, new pants, and the skin left alone', () => {
        const skin = () => {
            const out = [];
            roster.figureFor('wr1').traverse((n) => {
                if (n.isMesh && n.material && !n.material.userData.kit && n.material.roughness === 0.8) {
                    out.push(`${n.material.uuid}:${n.material.color.getHexString()}`);
                }
            });
            return out;
        };
        const skinBefore = skin();
        expect(skinBefore.length).toBeGreaterThan(0);
        C.setColors({ teams: { 0: { jersey: '#ffff00', helmet: '#000000', pants: '#ffffff', shoes: '#ff0000' } } });
        roster.applyTeamColors();
        const kit = kitOf('wr1');
        expect(hexOf(kit.shirt)).toBe('#ffff00');
        expect(hexOf(kit.helmet)).toBe('#000000');
        expect(hexOf(kit.mark)).toBe(C.markInk('#ffff00'));
        expect(`#${kit.mark.emissive.getHexString()}`).toBe(C.markInk('#ffff00'));
        expect(hexOf(kit.pants)).toBe('#ffffff');
        expect(hexOf(kit.shoes)).toBe('#ff0000');
        // The pants share the skin's roughness and nothing else: the skin is
        // the untagged material at that roughness, and it has not moved.
        expect(skin()).toEqual(skinBefore);
        // A letter of its own, on top of the rule.
        C.setColors({ teams: { 0: { mark: '#00ff00' } } });
        roster.applyTeamColors();
        expect(hexOf(kitOf('wr1').mark)).toBe('#00ff00');
    });

    /**
     * THE STRIPES ARE THERE ON EVERY PLAYER AND HIDDEN UNTIL ASKED FOR: one over
     * the helmet, one down the outside of each thigh and each shin. Showing
     * them is a flag on each mesh, so it is asserted on the meshes, per team.
     */
    test('the stripes are hidden until a team turns them on, and shown in their color', () => {
        const hidden = [['helmet-stripe', false], ...Array(4).fill(['pants-stripe', false])];
        for (const position of ['qb', 'wr1', 'x1', 'db1', 's1']) {
            expect([...stripesOn(position)].sort()).toEqual([...hidden].sort());
        }
        C.setColors({ teams: { 0: { helmetStripe: null, pantsStripe: '#123456' } } });
        roster.applyTeamColors();
        for (const position of ['qb', 'wr1', 'x1']) {
            expect(stripesOn(position).every(([, shown]) => shown)).toBe(true);
        }
        expect(stripesOn('db1').some(([, shown]) => shown)).toBe(false);
        expect(hexOf(kitOf('qb').helmetStripe)).toBe(C.helmetStripeOf(0));
        expect(hexOf(kitOf('qb').pantsStripe)).toBe('#123456');
        // Just the helmet's, then none.
        C.setColors({ teams: { 0: { pantsStripe: false } } });
        roster.applyTeamColors();
        expect(stripesOn('qb').filter(([, shown]) => shown).map(([name]) => name)).toEqual(['helmet-stripe']);
        C.resetColors();
        roster.applyTeamColors();
        expect(stripesOn('qb').some(([, shown]) => shown)).toBe(false);
    });
});

describe('the rings under their feet', () => {
    test('a team ring is repainted and a receiver\'s lettered marker is not', () => {
        const group = scene.children.find((c) => c.name === 'markers');
        const ring = group.children.find((m) => m.name === 'marker-db1');
        const named = group.children.find((m) => m.name === 'marker-wr1');
        const ringBefore = ring.material.map;
        const namedBefore = named.material.map;
        C.setColors({ teams: { 1: { jersey: '#ffb612' } } });
        markers.applyMarkerColors();
        expect(ring.material.map).not.toBe(ringBefore);
        expect(named.material.map).toBe(namedBefore);
    });
});

describe('the fans', () => {
    test('each team\'s fans are re-dressed in shades of its jersey', () => {
        const shirts = scene.children.find((c) => c.name === 'crowd-shirt');
        const colorsIn = () => {
            const seen = new Set();
            const color = new THREE.Color();
            for (let i = 0; i < shirts.count; i += 1) {
                shirts.getColorAt(i, color);
                seen.add(`#${color.getHexString()}`);
            }
            return seen;
        };
        expect(colorsIn().has('#ff992c')).toBe(true);
        C.setColors({ teams: { 0: { jersey: '#4b2e83' } } });
        expect(spectacle.applyCrowdColors()).toBeGreaterThan(0);
        const after = colorsIn();
        expect(after.has('#ff992c')).toBe(false);
        for (const shade of C.shadesOf('#4b2e83')) expect(after.has(shade)).toBe(true);
        // The away fans are untouched.
        for (const shade of C.shadesOf('#9bcfff')) expect(after.has(shade)).toBe(true);
    });
});

describe('the field', () => {
    const turfOf = () => scene.getObjectByName('turf');
    const apronOf = () => scene.getObjectByName('apron');

    test('is built in today\'s colors when nothing is chosen', () => {
        expect(`#${apronOf().material.color.getHexString()}`).toBe('#113a1b');
    });

    test('is repainted and its ground recolored when the field color changes', () => {
        const map = turfOf().material.map;
        const before = map.image;
        const version = map.version;
        C.setColors({ field: '#0033a0' });
        expect(field.applyFieldColors()).toBe(true);
        expect(turfOf().material.map).toBe(map);
        expect(map.image).not.toBe(before);
        expect(map.version).toBeGreaterThan(version);
        expect(`#${apronOf().material.color.getHexString()}`).toBe(C.turfFrom('#0033a0').apron);
        C.resetColors();
        field.applyFieldColors();
        expect(`#${apronOf().material.color.getHexString()}`).toBe('#113a1b');
    });

    /**
     * A TEAM RING THE COLOR OF THE FIELD GETS A DARK EDGE, and only then. The
     * drawing is caught on a canvas that records what it was asked to do,
     * because the stroke itself is all there is to check.
     */
    test('a team ring gets a dark edge only on a field close to its jersey', () => {
        const strokes = [];
        const recorder = () => {
            const ctx = {
                set strokeStyle(v) { this._s = v; }, get strokeStyle() { return this._s; },
                set lineWidth(v) { this._w = v; }, get lineWidth() { return this._w; },
                stroke() { strokes.push({ style: this._s, width: this._w }); },
            };
            return new Proxy(ctx, { get: (t, p) => (p in t ? t[p] : () => {}) });
        };
        const plain = globalThis.document;
        globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => recorder() }) };
        try {
            const edged = () => strokes.some((s) => s.width === 26);
            C.setColors({ teams: { 1: { jersey: '#1f5c2e' } } });
            markers.applyMarkerColors();
            expect(edged()).toBe(true);
            strokes.length = 0;
            C.resetColors();
            markers.applyMarkerColors();
            expect(edged()).toBe(false);
            expect(strokes.length).toBeGreaterThan(0);
        } finally {
            globalThis.document = plain;
        }
    });
});

describe('the players in the card', () => {
    test('are built with the roster\'s own kit, in materials of their own, and dressed as chosen', () => {
        const figure = roster.buildKitFigure(1);
        const kit = {};
        const stripes = [];
        figure.traverse((n) => {
            if (n.isMesh && n.material.userData.kit) kit[n.material.userData.kit] = n.material;
            if (n.name === 'helmet-stripe' || n.name === 'pants-stripe') stripes.push(n);
        });
        expect(Object.keys(kit).sort()).toEqual(ROLES);
        expect(stripes.map((s) => s.visible)).toEqual([false, false, false, false, false]);
        expect(kit.shirt).not.toBe(kitOf('db1').shirt);
        C.setColors({ teams: { 1: { jersey: '#ffff00', helmet: '#000000', pants: '#ffffff', pantsStripe: null } } });
        roster.dressKitFigure(figure, 1);
        expect(hexOf(kit.shirt)).toBe('#ffff00');
        expect(hexOf(kit.helmet)).toBe('#000000');
        expect(hexOf(kit.mark)).toBe(C.markInk('#ffff00'));
        expect(hexOf(kit.pants)).toBe('#ffffff');
        expect(hexOf(kit.pantsStripe)).toBe(C.pantsStripeOf(1));
        expect(stripes.filter((s) => s.visible).map((s) => s.name)).toEqual(Array(4).fill('pants-stripe'));
        // ...and the field's own player is not touched by dressing this one.
        expect(hexOf(kitOf('db1').shirt)).toBe('#9bcfff');
        expect(stripesOn('db1').some(([, shown]) => shown)).toBe(false);
    });

    /**
     * THE FRACTAL GARDEN'S BUG, NOT REPEATED. three's viewport and scissor take
     * CSS pixels and multiply by the ratio themselves, so a rectangle in buffer
     * pixels lands off the buffer at a phone's 1.5 and leaves the main view
     * zoomed afterwards. The rectangle three will hand GL must start exactly
     * `device` rows from the top.
     */
    test('the corner rectangle is in CSS pixels for three and buffer pixels for the copy', () => {
        for (const [w, h, pr] of [[1920, 1200, 1.5], [1280, 800, 1], [750, 1334, 1.5], [200, 150, 2]]) {
            const r = preview.previewRect(w, h, pr);
            expect(r.device).toBe(Math.floor(r.css * pr));
            expect(r.device).toBeLessThanOrEqual(Math.min(256, w, h));
            expect(Math.floor(r.cssTop * pr)).toBe(h - r.device);
        }
    });

    test('draws each player alone, turned, on the chosen field, restores the renderer and copies the corner', () => {
        const calls = [];
        const vp = new THREE.Vector4(0, 0, 1280, 800);
        const renderer = {
            domElement: { width: 1920, height: 1200 },
            getPixelRatio: () => 1.5,
            getClearColor: (c) => c.set('#010203'),
            getClearAlpha: () => 1,
            getViewport: (v) => v.copy(vp),
            getScissor: (v) => v.copy(vp),
            getScissorTest: () => false,
            setScissorTest: (on) => calls.push(['scissorTest', on]),
            setViewport: (...a) => calls.push(['viewport', a.length === 1 ? a[0].toArray() : a]),
            setScissor: (...a) => calls.push(['scissor', a.length === 1 ? a[0].toArray() : a]),
            setClearColor: (c) => calls.push(['clear', new THREE.Color(c).getHexString()]),
            clear: () => calls.push(['wipe']),
            render: (s) => {
                const shown = s.children.filter((c) => c.name && c.name.startsWith('kit-') && c.visible);
                calls.push(['render', shown.map((f) => [f.name, f.rotation.y]),
                    `#${s.children.find((c) => c.isMesh).material.color.getHexString()}`]);
            },
        };
        const copies = [];
        const canvas = (id) => ({
            id, width: 256, height: 256,
            getContext: () => ({ drawImage: (...a) => copies.push([id, a.slice(1)]) }),
        });
        const targets = { 'colors-x-preview': canvas('x'), 'colors-o-preview': canvas('o') };
        const plain = globalThis.document;
        globalThis.document = { ...plain, getElementById: (id) => targets[id] || null };
        try {
            C.setColors({ field: '#0033a0' });
            expect(preview.drawColorsPreviews(renderer, 2, {})).toBe(2);
            const renders = calls.filter((c) => c[0] === 'render');
            expect(renders.map((r) => r[1].map((f) => f[0]))).toEqual([['kit-0'], ['kit-1']]);
            expect(renders[0][1][0][1]).toBeCloseTo(preview.previewYaw(2), 9);
            expect(renders[0][2]).toBe(C.turfFrom('#0033a0').grass);
            // Into the corner, in CSS pixels, then put back exactly as found.
            const rect = preview.previewRect(1920, 1200, 1.5);
            expect(calls).toContainEqual(['viewport', [0, rect.cssTop, rect.css, rect.css]]);
            const last = calls.filter((c) => c[0] === 'viewport').at(-1);
            expect(last[1]).toEqual(vp.toArray());
            expect(calls.filter((c) => c[0] === 'scissorTest').at(-1)).toEqual(['scissorTest', false]);
            expect(calls.filter((c) => c[0] === 'clear').at(-1)).toEqual(['clear', '010203']);
            expect(copies.map((c) => c[0])).toEqual(['x', 'o']);
            expect(copies[0][1]).toEqual([0, 0, rect.device, rect.device, 0, 0, rect.device, rect.device]);
            expect(targets['colors-x-preview'].width).toBe(rect.device);
        } finally {
            globalThis.document = plain;
            C.resetColors();
        }
    });

    /** THE WHOLE PLAYER IN THE FRAME AT EVERY TURN, shoes and disc included:
     *  the first framing cut both off at the bottom. Every vertex is checked. */
    test('frames the whole player and the disc under him at every turn', () => {
        const figure = roster.buildKitFigure(0);
        const box = new THREE.Box3().setFromObject(figure);
        const camera = preview.previewCamera(box.max.y);
        const v = new THREE.Vector3();
        let top = -Infinity;
        let bottom = Infinity;
        for (let a = 0; a < Math.PI * 2; a += 0.25) {
            figure.rotation.y = a;
            figure.updateMatrixWorld(true);
            figure.traverse((n) => {
                if (!n.isMesh) return;
                const pos = n.geometry.attributes.position;
                for (let i = 0; i < pos.count; i += 3) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld).project(camera);
                    top = Math.max(top, v.y);
                    bottom = Math.min(bottom, v.y);
                    expect(Math.abs(v.x)).toBeLessThan(0.95);
                }
            });
        }
        expect(top).toBeLessThan(0.95);
        expect(bottom).toBeGreaterThan(-0.95);
        const R = CFG.colors.preview.disc;
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
            v.set(Math.cos(a) * R, 0, Math.sin(a) * R).project(camera);
            expect(v.y).toBeGreaterThan(-0.98);
        }
    });

    test('turns with time, and holds still for anybody who asked not to be moved about', () => {
        expect(preview.previewYaw(1)).not.toBeCloseTo(preview.previewYaw(0), 3);
        expect(preview.previewYaw(1, { calm: true })).toBe(preview.previewYaw(7, { calm: true }));
    });

    /**
     * AND BEFORE THE GAME'S OWN FRAME, which is the Fractal Garden's second
     * lesson: the preview borrows a corner of this frame's buffer, and drawn
     * after the main render the frame is shown with a player in its corner.
     */
    test('is drawn before the game\'s own render in the frame loop', () => {
        const main = readFileSync(js('main.js'), 'utf8');
        const loop = main.slice(main.indexOf('function animate('));
        const drawn = loop.indexOf('drawColorsPreviews(');
        expect(drawn).toBeGreaterThan(0);
        expect(drawn).toBeLessThan(loop.indexOf('renderer.render(scene, camera)'));
    });
});
