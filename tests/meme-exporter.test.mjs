// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The picture (www/meme/js/exporter.js, specs/meme PLANNING 6.2), with the
 * stage on the REAL three and every browser API faked.
 *
 * What is held here, and why:
 * - THE SURPRISED CAMERA FRAMES THE HEAD LOW, measured: the whole head
 *   inside the square with room above it for the caption. A stub would
 *   pass with the head anywhere.
 * - EACH PANEL IS DRAWN THROUGH ITS OWN CAMERA at the panel's pixel size,
 *   once per composite, into the preview and into the picture.
 * - A PICTURE IS HANDED ON the right way: shared where the sheet takes a
 *   PNG, a dismissed sheet left alone, saved through a download link
 *   otherwise, and a canvas that gives no file said politely.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let X;
let S;
let T;
let CONFIG;
let DEFAULT_AVATAR;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    jest.resetModules();
    X = await import('../www/meme/js/exporter.js');
    S = await import('../www/meme/js/stage.js');
    T = await import('../www/meme/js/templates.js');
    ({ MEME_PAGE: CONFIG } = await import('../www/meme/js/config.js'));
    ({ DEFAULT_AVATAR } = await import('../www/shared/js/avatar-1.0.0.js'));
});
afterAll(() => {
    delete globalThis.THREE;
});

/** A renderer that draws nothing and records its sizes. */
function fakeRenderer() {
    const r = {
        sizes: [],
        renders: 0,
        shadowMap: {},
        setPixelRatio() {},
        setSize(w, h) { r.sizes.push([w, h]); },
        getPixelRatio: () => 1,
        render() { r.renders++; },
        setAnimationLoop() {},
        dispose() { r.disposed = true; }
    };
    return r;
}

/** A 2D context that records what is drawn. */
function recordingContext() {
    const calls = [];
    const ctx = { calls, measureText: (s) => ({ width: s.length * 10 }) };
    for (const m of ['fillRect', 'drawImage', 'strokeText', 'fillText']) ctx[m] = (...args) => calls.push([m, ...args]);
    return ctx;
}

/** A canvas that can give a Blob, or not. */
function fakeCanvas({ blob = true } = {}) {
    const c = { width: 0, height: 0, ctx: recordingContext() };
    c.getContext = () => c.ctx;
    c.toBlob = (cb, type) => cb(blob ? new Blob(['picture'], { type: type || 'image/png' }) : null);
    return c;
}

function fakeDoc(options) {
    const made = [];
    const body = { children: [], appendChild(el) { body.children.push(el); } };
    return {
        made,
        body,
        createElement(tag) {
            if (tag === 'canvas') {
                const c = fakeCanvas(options);
                made.push(c);
                return c;
            }
            const el = { tag, clicked: 0, click() { el.clicked++; }, remove() { el.removed = true; } };
            made.push(el);
            return el;
        }
    };
}

/** A canvas that records its listeners, for taps and drags. */
function stageCanvas(w = 800, h = 600) {
    const listeners = {};
    return {
        clientWidth: w,
        clientHeight: h,
        listeners,
        addEventListener: (t, fn) => { listeners[t] = fn; },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
        setPointerCapture() {}
    };
}

function stageWithSurprised(options = {}) {
    const stage = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer, ...options });
    stage.setTemplate(T.templateOf('surprised'), () => DEFAULT_AVATAR);
    return stage;
}

/** The corners of an arrangement, projected through a pose: the most any
 *  corner reaches from the frame's middle (under 1 is inside). */
function reach(pose, aspect, size, depth) {
    const cam = new THREE.PerspectiveCamera(pose.fov, aspect, 0.05, 80);
    cam.position.fromArray(pose.eye);
    cam.lookAt(...pose.aim);
    cam.updateMatrixWorld(true);
    let most = 0;
    for (const x of [-size.width / 2, size.width / 2]) for (const y of [0, size.height]) for (const z of [-depth / 2, depth / 2]) {
        const p = new THREE.Vector3(x, y, z).project(cam);
        most = Math.max(most, Math.abs(p.x), Math.abs(p.y));
    }
    return most;
}

describe('the arrangement', () => {
    test('every template\'s boxes fit the frame at every shape of canvas, with room to spare', async () => {
        const { arrangementSize } = await import('../www/meme/js/panels.js');
        for (const t of T.TEMPLATES) {
            const size = arrangementSize(t, CONFIG.box);
            for (const aspect of [0.5, 1, 2.2]) {
                const pose = S.framingFor(size, aspect, CONFIG.camera.fov, CONFIG.view, CONFIG.box.depth);
                const most = reach(pose, aspect, size, CONFIG.box.depth);
                expect(`${t.id} @${aspect}: ${most < 0.97 && most > 0.6}`).toBe(`${t.id} @${aspect}: true`);
            }
        }
    });

    test('the live stage frames the arrangement, refits when the canvas changes shape, and says where each panel is', () => {
        const canvas = stageCanvas(800, 600);
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: fakeRenderer });
        stage.setTemplate(T.templateOf('nopeYep'), () => DEFAULT_AVATAR);
        expect(stage.viewing).toBeNull();
        expect(stage.panels).toHaveLength(4);
        stage.fit();
        const rects = stage.screenRects();
        expect(rects).toHaveLength(4);
        for (const r of rects) {
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.y).toBeGreaterThanOrEqual(0);
            expect(r.x + r.w).toBeLessThanOrEqual(800);
            expect(r.y + r.h).toBeLessThanOrEqual(600);
            expect(r.w).toBeGreaterThan(50);
        }
        // Reading order: the first row above the second, left before right.
        expect(rects[0].y).toBeLessThan(rects[2].y);
        expect(rects[0].x).toBeLessThan(rects[1].x);
        expect(rects[0].x + rects[0].w).toBeLessThanOrEqual(rects[1].x + 1);
        // A taller canvas: the arrangement framed again, narrower.
        const wide = stage.pose.eye[2];
        canvas.clientWidth = 300;
        stage.fit();
        expect(stage.pose.eye[2]).toBeGreaterThan(wide);
        stage.dispose();
    });

    test('a tap glides into the panel under it and a tap glides out, a cut under reduced motion, Escape left to the page', () => {
        let t = 0;
        const canvas = stageCanvas(800, 600);
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: fakeRenderer, now: () => t });
        stage.setTemplate(T.templateOf('panic'), () => DEFAULT_AVATAR);
        stage.start();
        stage.fit();
        const rects = stage.screenRects();
        const tap = (x, y) => {
            canvas.listeners.pointerdown({ clientX: x, clientY: y, button: 0, pointerId: 1 });
            canvas.listeners.pointerup({ clientX: x, clientY: y });
        };
        const middle = (r) => [r.x + r.w / 2, r.y + r.h / 2];
        tap(...middle(rects[3]));
        expect(stage.viewing).toBe(3);
        expect(stage.gliding).toBe(true);
        // Mid-glide the camera is between, and at the end it is the cell's.
        t = CONFIG.view.glide / 2;
        stage.frame();
        const target = stage.cameraFor(3);
        expect(stage.pose.eye[2]).toBeGreaterThan(target.eye[2]);
        expect(stage.gliding).toBe(true);
        t = CONFIG.view.glide + 0.01;
        stage.frame();
        expect(stage.gliding).toBe(false);
        expect(stage.pose).toEqual(target);
        // Looking into one, that panel is the whole canvas and the others nowhere.
        expect(stage.screenRects()).toEqual([null, null, null, { x: 0, y: 0, w: 800, h: 600 }, null, null]);
        // A tap anywhere glides back out.
        tap(5, 5);
        expect(stage.viewing).toBeNull();
        t += CONFIG.view.glide + 0.01;
        stage.frame();
        expect(stage.gliding).toBe(false);
        // A tap on the ground between panels is nothing.
        tap(1, 1);
        expect(stage.viewing).toBeNull();
        stage.dispose();
        // Under reduced motion the move is a cut.
        const still = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer, reducedMotion: () => true });
        still.setTemplate(T.templateOf('panic'), () => DEFAULT_AVATAR);
        still.start();
        still.view(1);
        expect(still.gliding).toBe(false);
        expect(still.pose).toEqual(still.cameraFor(1));
        still.view(99);
        expect(still.viewing).toBeNull();
        still.dispose();
    });

    test('a drag tilts the view within its limits and is not a tap, and reduced motion never tilts', () => {
        const canvas = stageCanvas(800, 600);
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: fakeRenderer });
        stage.setTemplate(T.templateOf('surprised'), () => DEFAULT_AVATAR);
        stage.fit();
        const before = stage.camera.position.clone();
        canvas.listeners.pointerdown({ clientX: 400, clientY: 300, button: 0 });
        canvas.listeners.pointermove({ clientX: 440, clientY: 300 });
        expect(stage.tilt.yaw).toBeCloseTo(-40 * CONFIG.view.tilt.perPixel, 9);
        expect(stage.camera.position.distanceTo(before)).toBeGreaterThan(0.01);
        canvas.listeners.pointermove({ clientX: 2000, clientY: -2000 });
        expect(stage.tilt.yaw).toBe(-CONFIG.view.tilt.yaw);
        expect(stage.tilt.pitch).toBe(-CONFIG.view.tilt.pitch);
        canvas.listeners.pointerup({ clientX: 2000, clientY: -2000 });
        expect(stage.viewing).toBeNull();
        // A right button press is nothing, and a cancelled pointer drops the drag.
        canvas.listeners.pointerdown({ clientX: 1, clientY: 1, button: 2 });
        canvas.listeners.pointermove({ clientX: 50, clientY: 50 });
        expect(stage.tilt.yaw).toBe(-CONFIG.view.tilt.yaw);
        canvas.listeners.pointerdown({ clientX: 1, clientY: 1, button: 0 });
        canvas.listeners.pointercancel({});
        canvas.listeners.pointermove({ clientX: 50, clientY: 50 });
        canvas.listeners.pointerup({ clientX: 50, clientY: 50 });
        stage.dispose();
        const still = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer, reducedMotion: () => true });
        still.setTemplate(T.templateOf('surprised'), () => DEFAULT_AVATAR);
        still.canvasListeners = null;
        stage.dispose();
        still.dispose();
    });

    test('a figure wears its pose, its turned head and its glow, and a text cell holds no figure', () => {
        const stage = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer });
        stage.setTemplate(T.templateOf('galaxyBrain'), () => DEFAULT_AVATAR);
        const faces = stage.panels.filter((p) => p.figures.length);
        expect(faces).toHaveLength(4);
        expect(stage.panels.filter((p) => !p.figures.length)).toHaveLength(4);
        expect(faces[0].figures[0].glowLight).toBeNull();
        expect(faces[3].figures[0].glowLight.intensity).toBeCloseTo(2.4, 9);
        expect(faces[1].figures[0].glowLight.intensity).toBeCloseTo(2.4 * 0.35, 9);
        const skull = faces[3].figures[0].person.getObjectByName('head').children.find((o) => o.userData.isHead);
        expect(skull.material.emissiveIntensity).toBeGreaterThan(0.5);
        // The glowing head's skin is its own: the arms keep the shared one.
        const arm = faces[3].figures[0].arms.right;
        let armSkin = null;
        arm.traverse((o) => { if (o.isMesh && !armSkin && o.material.color.getHex() === skull.material.color.getHex()) armSkin = o.material; });
        expect(armSkin).not.toBe(skull.material);
        stage.setTemplate(T.templateOf('plan'), () => DEFAULT_AVATAR);
        for (const p of stage.panels) {
            expect(p.props.name).toBe('plan');
            expect(p.box.getObjectByName('board')).toBeTruthy();
            const head = p.figures[0].person.getObjectByName('head');
            expect(head.rotation.y).toBeCloseTo(-0.25, 9);
            expect(p.figures[0].group.rotation.y).toBe(0.3);
        }
        stage.dispose();
    });
});

describe('the three-person templates', () => {
    test('The Head Turn pins every label inside the panel, in the picture and on the stage', () => {
        const canvas = stageCanvas(800, 600);
        const stage = S.createStage(CONFIG, { canvas, makeRenderer: fakeRenderer });
        stage.setTemplate(T.templateOf('headTurn'), () => DEFAULT_AVATAR);
        expect(stage.panels[0].figures).toHaveLength(3);
        const exporter = X.createExporter(CONFIG, { stage, doc: fakeDoc(), win: {}, nav: {}, makeRenderer: fakeRenderer });
        const anchors = exporter.anchorsFor(0, 1080, 1080);
        expect(anchors).toHaveLength(3);
        for (const p of anchors) {
            expect(p.x).toBeGreaterThan(80);
            expect(p.x).toBeLessThan(1000);
            expect(p.y).toBeGreaterThan(200);
            expect(p.y).toBeLessThan(900);
        }
        // Left to right: the friend, the visitor, the other.
        expect(anchors[1].x).toBeLessThan(anchors[0].x);
        expect(anchors[0].x).toBeLessThan(anchors[2].x);
        expect(exporter.anchorsFor(9, 100, 100)).toBeNull();
        stage.fit();
        const live = stage.screenAnchors();
        expect(live).toHaveLength(1);
        expect(live[0]).toHaveLength(3);
        for (const p of live[0]) {
            expect(p.x).toBeGreaterThan(0);
            expect(p.x).toBeLessThan(800);
        }
        // Looking into another panel, a panel's anchors are nothing.
        stage.setTemplate(T.templateOf('panic'), () => DEFAULT_AVATAR);
        stage.view(1);
        expect(stage.screenAnchors().map((a) => (a ? a.length : null))).toEqual([null, 1, null, null, null, null]);
        stage.dispose();
    });

    test('Always Has Been has stars, an Earth and a helmet on each head; Everything Is Fine has its flames, fewer on a phone, moving when ticked', () => {
        const stage = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer });
        stage.setTemplate(T.templateOf('alwaysHasBeen'), () => DEFAULT_AVATAR);
        const box = stage.panels[0].box;
        expect(box.getObjectByName('stars').geometry.attributes.position.count).toBe(220);
        expect(box.getObjectByName('earth')).toBeTruthy();
        for (const f of stage.panels[0].figures) expect(f.person.getObjectByName('head').getObjectByName('helmet')).toBeTruthy();
        expect(stage.panels[0].figures[0].avatar.shirt).toBe('white');
        // A figure built again keeps a helmet.
        stage.recast('friend');
        expect(stage.panels[0].figures[1].person.getObjectByName('head').getObjectByName('helmet')).toBeTruthy();
        expect(stage.panels[0].tick(0.1)).toBe(false);
        stage.setTemplate(T.templateOf('everythingIsFine'), () => DEFAULT_AVATAR);
        const flames = () => stage.panels[0].box.getObjectByName('fine').children.filter((o) => o.name === 'flame');
        expect(flames()).toHaveLength(CONFIG.fire.count);
        expect(stage.panels[0].box.getObjectByName('mug')).toBeTruthy();
        const before = flames().map((f) => f.position.y);
        expect(stage.panels[0].tick(0.2)).toBe(true);
        expect(flames().map((f) => f.position.y)).not.toEqual(before);
        stage.dispose();
        const phone = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer, mobile: true });
        phone.setTemplate(T.templateOf('everythingIsFine'), () => DEFAULT_AVATAR);
        expect(phone.panels[0].box.getObjectByName('fine').children.filter((o) => o.name === 'flame')).toHaveLength(CONFIG.fire.countMobile);
        phone.dispose();
    });

    test('recast builds every figure of a role again with the role\'s avatar, and nothing for a role not there', () => {
        const avatars = { you: DEFAULT_AVATAR, friend: { ...DEFAULT_AVATAR, skin: 'deep' } };
        const stage = S.createStage(CONFIG, { canvas: stageCanvas(), makeRenderer: fakeRenderer });
        stage.setTemplate(T.templateOf('handshake'), (role) => avatars[role]);
        const was = stage.panels[0].figures[1];
        avatars.friend = { ...DEFAULT_AVATAR, skin: 'light' };
        expect(stage.recast('friend')).toBe(1);
        expect(stage.panels[0].figures[1]).not.toBe(was);
        expect(stage.panels[0].figures[1].avatar.skin).toBe('light');
        expect(stage.panels[0].figures[0].avatar.skin).toBe(DEFAULT_AVATAR.skin);
        expect(stage.recast('other')).toBe(0);
        stage.dispose();
    });
});

describe('the camera', () => {
    test('Surprised frames the whole head in the square, low enough for the caption above it', () => {
        const stage = stageWithSurprised();
        const pose = stage.cameraFor(0);
        const cam = new THREE.PerspectiveCamera(pose.fov, 1, 0.05, 60);
        cam.position.fromArray(pose.eye);
        cam.lookAt(...pose.aim);
        cam.updateMatrixWorld(true);
        const head = stage.panels[0].figures[0].person.getObjectByName('head');
        stage.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(head);
        let top = -Infinity;
        let widest = 0;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(cam);
            expect(Math.abs(p.x)).toBeLessThan(0.95);
            expect(Math.abs(p.y)).toBeLessThan(0.95);
            top = Math.max(top, p.y);
            widest = Math.max(widest, Math.abs(p.x));
        }
        // The caption takes the top fifth of the panel (its face is 11% of
        // the height plus the inset), so the head's top stays under it, and
        // the head is big enough to read at a thumbnail's size.
        expect(top).toBeLessThan(0.6);
        expect(widest).toBeGreaterThan(0.3);
        // Without a panel, the studio's own camera.
        const empty = S.createStage(CONFIG, { canvas: { clientWidth: 1, clientHeight: 1 }, makeRenderer: fakeRenderer });
        expect(empty.cameraFor(0)).toEqual({ eye: CONFIG.camera.eye, aim: CONFIG.camera.aim, fov: CONFIG.camera.fov });
        stage.dispose();
    });

    test('the live view looks through the panel\'s camera, and the panel stands in a box of the cell\'s color', () => {
        const stage = stageWithSurprised();
        // The arrangement first (one box, framed), then into the panel.
        expect(stage.pose.fov).toBe(CONFIG.camera.fov);
        stage.view(0);
        expect(stage.viewing).toBe(0);
        expect(stage.pose).toEqual(stage.cameraFor(0));
        expect(stage.camera.fov).toBe(28);
        const back = stage.panels[0].box.getObjectByName('back');
        expect(back.material.color.getHexString()).toBe('f3d98a');
        expect(stage.panels[0].figures[0].group.parent).toBe(stage.panels[0].box);
        expect(stage.scene.children).toContain(stage.panels[0].box);
        // Another template disposes the first panel.
        const dispose = jest.spyOn(stage.panels[0], 'dispose');
        stage.setTemplate(T.templateOf('surprised'), () => DEFAULT_AVATAR);
        expect(dispose).toHaveBeenCalled();
        expect(stage.panels).toHaveLength(1);
        stage.dispose();
    });
});

describe('the exporter', () => {
    let stage;
    beforeAll(() => { stage = stageWithSurprised(); });
    afterAll(() => stage.dispose());

    const win = () => ({
        URL: { createObjectURL: () => 'blob:meme', revokeObjectURL: () => {} },
        setTimeout: () => 0,
        File: class { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } }
    });

    test('the preview is the composite at the sheet\'s width, each panel drawn once through its camera', () => {
        const doc = fakeDoc();
        const renderer = fakeRenderer();
        const exporter = X.createExporter(CONFIG, { stage, doc, win: win(), nav: {}, makeRenderer: () => renderer });
        const preview = fakeCanvas();
        expect(exporter.drawPreview(preview, stage.template, ['hello'], 'square')).toBe(true);
        expect([preview.width, preview.height]).toEqual([540, 540]);
        expect(exporter.rendered).toBe(1);
        expect(renderer.renders).toBe(1);
        // The panel is drawn at its rect's size, and the composite draws
        // the renderer's canvas there.
        const drawn = preview.ctx.calls.filter((c) => c[0] === 'drawImage');
        expect(drawn).toHaveLength(1);
        expect(drawn[0][1]).toBe(doc.made[0]);
        expect(renderer.sizes[0]).toEqual([Math.round(drawn[0][4]), Math.round(drawn[0][5])]);
        expect(preview.ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['HELLO', 'SceneXP.com']);
        // The portrait shape.
        expect(exporter.drawPreview(preview, stage.template, [], 'portrait')).toBe(true);
        expect([preview.width, preview.height]).toEqual([540, 675]);
        expect(exporter.drawPreview(null, stage.template, [], 'square')).toBe(false);
        expect(exporter.renderer).toBe(renderer);
        exporter.dispose();
        expect(renderer.disposed).toBe(true);
        expect(exporter.renderer).toBeNull();
        exporter.dispose();
    });

    test('a picture is made at the chosen size, named for the template and the size', async () => {
        const doc = fakeDoc();
        const exporter = X.createExporter(CONFIG, { stage, doc, win: win(), nav: {}, makeRenderer: fakeRenderer });
        const made = await exporter.makePicture(stage.template, ['hi'], 'portrait');
        expect(made.name).toBe('scenexp-meme-surprised-1080x1350.png');
        expect(made.blob.type).toBe('image/png');
        const out = doc.made.find((c) => c.width === 1080);
        expect([out.width, out.height]).toEqual([1080, 1350]);
        expect(await exporter.makePicture(stage.template, [], 'nope')).toMatchObject({ name: 'scenexp-meme-surprised-1080x1080.png' });
        // A canvas without a context makes nothing.
        const blind = fakeDoc();
        blind.createElement = () => ({ getContext: () => null });
        const none = X.createExporter(CONFIG, { stage, doc: blind, win: win(), nav: {}, makeRenderer: fakeRenderer });
        expect(await none.makePicture(stage.template, [], 'square')).toBeNull();
    });

    test('a picture is shared where the sheet takes it, left alone when dismissed, saved otherwise, and a failure said', async () => {
        const outcomes = [];
        const onExport = (kind, outcome) => outcomes.push([kind, outcome]);
        // Shared.
        let shared = 0;
        const nav = { canShare: () => true, share: async () => { shared++; } };
        let exporter = X.createExporter(CONFIG, { stage, doc: fakeDoc(), win: win(), nav, makeRenderer: fakeRenderer, onExport });
        expect(exporter.buttonLabel()).toBe('Share picture');
        expect(await exporter.savePicture(stage.template, ['x'], 'square')).toBe('shared');
        expect(shared).toBe(1);
        // Dismissed: the visitor's decision, nothing saved behind their back.
        const doc = fakeDoc();
        nav.share = async () => { const e = new Error('no'); e.name = 'AbortError'; throw e; };
        exporter = X.createExporter(CONFIG, { stage, doc, win: win(), nav, makeRenderer: fakeRenderer, onExport });
        expect(await exporter.savePicture(stage.template, [], 'square')).toBe('cancelled');
        expect(doc.body.children).toEqual([]);
        // The sheet fails for another reason: saved instead.
        nav.share = async () => { throw new Error('boom'); };
        exporter = X.createExporter(CONFIG, { stage, doc, win: win(), nav, makeRenderer: fakeRenderer, onExport });
        expect(await exporter.savePicture(stage.template, [], 'square')).toBe('saved');
        expect(doc.body.children).toHaveLength(1);
        expect(doc.body.children[0]).toMatchObject({ download: 'scenexp-meme-surprised-1080x1080.png', href: 'blob:meme', clicked: 1 });
        // No sheet at all: saved, and the button says so beforehand.
        const plain = fakeDoc();
        exporter = X.createExporter(CONFIG, { stage, doc: plain, win: win(), nav: {}, makeRenderer: fakeRenderer, onExport });
        expect(exporter.buttonLabel()).toBe('Save picture');
        expect(await exporter.savePicture(stage.template, [], 'square')).toBe('saved');
        // No file from the canvas: failed.
        exporter = X.createExporter(CONFIG, { stage, doc: fakeDoc({ blob: false }), win: win(), nav: {}, makeRenderer: fakeRenderer, onExport });
        expect(await exporter.savePicture(stage.template, [], 'square')).toBe('failed');
        expect(outcomes).toEqual([['picture', 'shared'], ['picture', 'cancelled'], ['picture', 'saved'], ['picture', 'saved'], ['picture', 'failed']]);
    });

    test('a canvas becomes a Blob through toBlob, or from its data URL, or not at all', async () => {
        const blob = new Blob(['png'], { type: 'image/png' });
        expect(await X.canvasBlob({ toBlob: (cb) => cb(blob) }, 'image/png', null)).toBe(blob);
        expect(await X.canvasBlob({ toBlob: (cb) => cb(null) }, 'image/png', null)).toBeNull();
        const w = { atob: (s) => Buffer.from(s, 'base64').toString('binary'), Blob };
        const made = await X.canvasBlob({ toDataURL: () => `data:image/png;base64,${Buffer.from('hello').toString('base64')}` }, 'image/png', w);
        expect(made.type).toBe('image/png');
        expect(made.size).toBe(5);
        expect(await X.canvasBlob({ toDataURL: () => 'data:,' }, 'image/png', w)).toBeNull();
        expect(await X.canvasBlob({ toDataURL: () => 'data:image/png;base64,AA==' }, 'image/png', null)).toBeNull();
        expect(await X.canvasBlob({ toDataURL: () => { throw new Error('no'); } }, 'image/png', w)).toBeNull();
    });

    test('every word keeps the house style', () => {
        for (const w of Object.values(X.WORDS)) {
            expect(w).not.toMatch(/[;—]/);
            expect(w).not.toMatch(/\b(colour|grey|centre|favourite)/i);
        }
        expect(X.pictureName('headTurn', { w: 1080, h: 1920 }, 'mp4')).toBe('scenexp-meme-headTurn-1080x1920.mp4');
    });
});
