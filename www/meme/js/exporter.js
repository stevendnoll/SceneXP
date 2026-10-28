// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exporter.js - the picture (specs/meme PLANNING 6.2), made on the device
 * and handed to the visitor's own share sheet or downloads folder, and the
 * preview of it on the sheet.
 *
 * A RENDERER OF ITS OWN ON A CANVAS NOBODY SEES draws each panel through
 * its cell's camera at the panel's pixel size, straight from the live
 * stage's scene (the same boxes and figures, nothing rebuilt), and the
 * composite (compose.js) lays the panels, the captions and the wordmark on
 * a 2D canvas. The preview is the same composite, smaller.
 *
 * NOTHING IS UPLOADED. A file goes to the share sheet (sharefile-1.0.0) or
 * the downloads folder and nowhere else. M6 adds the clip.
 *
 * Every browser API is handed in (`doc`, `win`, `nav`, `makeRenderer`), so
 * tests run the whole path with fakes.
 */

import { composeMeme } from './compose.min.js';
import { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';

/** Everything the exporter says (house style: polite, no semicolons or
 *  em-dashes). */
export const WORDS = Object.freeze({
    pictureSaved: 'Your meme is in your downloads.',
    pictureShared: 'Shared.',
    pictureFailed: "This browser couldn't make the picture. Please try again.",
    shareTitle: 'Made at SceneXP.com',
    shareButton: 'Share picture',
    saveButton: 'Save picture'
});

/** File names: "scenexp-meme-surprised-1080x1080.png". */
export function pictureName(templateId, size, ext = 'png') {
    return `scenexp-meme-${templateId}-${size.w}x${size.h}.${ext}`;
}

/** A Blob of a canvas: its own `toBlob` where there is one, else decoded
 *  from a data URL (older browsers, and tests). Resolves null on failure. */
export function canvasBlob(canvas, type, win) {
    return new Promise((resolve) => {
        try {
            if (typeof canvas.toBlob === 'function') {
                canvas.toBlob((b) => resolve(b || null), type);
                return;
            }
            const m = /^data:([^;,]+);base64,(.*)$/.exec(canvas.toDataURL(type) || '');
            if (!m || !win || typeof win.atob !== 'function') {
                resolve(null);
                return;
            }
            const bin = win.atob(m[2]);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            resolve(new win.Blob([bytes], { type: m[1] }));
        } catch (e) {
            resolve(null);
        }
    });
}

/**
 * The exporter for `stage` (stage.js's controller: its `scene` and
 * `cameraFor(cellIndex)`). Returns `{ drawPreview, makePicture, savePicture,
 * buttonLabel, dispose, rendered, renderer }`.
 */
export function createExporter(config, {
    stage,
    doc = typeof document === 'undefined' ? null : document,
    win = typeof window === 'undefined' ? null : window,
    nav = typeof navigator === 'undefined' ? null : navigator,
    /** Hears each picture handed on: `onExport('picture', 'shared' |
     *  'saved' | 'cancelled' | 'failed')`. */
    onExport = () => {},
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
} = {}) {
    const E = config.export;
    let own = null;          // { canvas, renderer, camera }
    let rendered = 0;

    function ensure() {
        if (own) return own;
        const canvas = doc.createElement('canvas');
        const renderer = makeRenderer(canvas);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = config.light.exposure;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
        own = { canvas, renderer, camera };
        return own;
    }

    /** Draw cell `index` `w` by `h` through its camera and return the
     *  renderer's canvas. */
    function renderPanel(index, w, h) {
        const o = ensure();
        const pose = stage.cameraFor(index);
        if (o.renderer.setPixelRatio) o.renderer.setPixelRatio(1);
        o.renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false);
        o.camera.fov = pose.fov;
        o.camera.aspect = w / h;
        o.camera.updateProjectionMatrix();
        o.camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        o.camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
        o.renderer.render(stage.scene, o.camera);
        rendered++;
        return o.canvas;
    }

    /** The composite of `template` with `captions`, `w` by `h`, on `out`. */
    function compose(out, template, captions, w, h) {
        if (out.width !== w) out.width = w;
        if (out.height !== h) out.height = h;
        const ctx = out.getContext('2d');
        if (!ctx) return false;
        composeMeme(ctx, { template, captions, w, h, config, imageFor: (i, r) => renderPanel(i, r.w, r.h) });
        return true;
    }

    const sizeOf = (id) => E.pictures.find((p) => p.id === id) || E.pictures[0];

    /** The preview on `canvas`: the chosen size's shape, `E.preview` across. */
    function drawPreview(canvas, template, captions, sizeId) {
        if (!canvas) return false;
        const size = sizeOf(sizeId);
        const w = E.preview;
        const h = Math.round((E.preview * size.h) / size.w);
        return compose(canvas, template, captions, w, h);
    }

    /** The picture at the chosen size: `{ blob, name }`, or null. */
    async function makePicture(template, captions, sizeId) {
        const size = sizeOf(sizeId);
        const out = doc.createElement('canvas');
        if (!compose(out, template, captions, size.w, size.h)) return null;
        const blob = await canvasBlob(out, 'image/png', win);
        return blob ? { blob, name: pictureName(template.id, size) } : null;
    }

    /** Hand a made file on: the share sheet where it takes the type, a
     *  download otherwise. Returns 'shared', 'saved', 'cancelled' or 'failed'. */
    async function handOn(made) {
        if (!made) return 'failed';
        if (canShareFiles(made.blob.type, { nav, win })) {
            const result = await shareFile(made.blob, made.name, { title: WORDS.shareTitle, nav, win });
            if (result === 'shared' || result === 'cancelled') return result;
        }
        const url = win.URL.createObjectURL(made.blob);
        const offered = saveFile(url, made.name, { doc });
        win.setTimeout(() => win.URL.revokeObjectURL(url), 10000);
        return offered ? 'saved' : 'failed';
    }

    /** Make and hand on the picture. Resolves to what happened. */
    async function savePicture(template, captions, sizeId) {
        const result = await handOn(await makePicture(template, captions, sizeId));
        onExport('picture', result);
        return result;
    }

    return {
        drawPreview,
        makePicture,
        savePicture,
        /** What the button says before it is pressed: Share where the sheet
         *  takes a PNG, Save otherwise. */
        buttonLabel() {
            return canShareFiles('image/png', { nav, win }) ? WORDS.shareButton : WORDS.saveButton;
        },
        get rendered() { return rendered; },
        get renderer() { return own ? own.renderer : null; },
        dispose() {
            if (!own) return;
            if (own.renderer.dispose) own.renderer.dispose();
            own = null;
        }
    };
}
