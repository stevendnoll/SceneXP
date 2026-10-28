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

function stageWithSurprised() {
    const stage = S.createStage(CONFIG, { canvas: { clientWidth: 800, clientHeight: 600 }, makeRenderer: fakeRenderer });
    stage.setTemplate(T.templateOf('surprised'), () => DEFAULT_AVATAR);
    return stage;
}

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
