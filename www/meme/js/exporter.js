// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exporter.js - the picture and the clip (specs/meme PLANNING 6.2 and 6.3),
 * made on the device and handed to the visitor's own share sheet or
 * downloads folder, and the preview of the picture on the sheet.
 *
 * A RENDERER OF ITS OWN ON A CANVAS NOBODY SEES draws each panel through
 * its cell's camera at the panel's pixel size, straight from the live
 * stage's scene (the same boxes and figures, nothing rebuilt), and the
 * composite (compose.js) lays the panels, the captions and the wordmark on
 * a 2D canvas. The preview is the same composite, smaller.
 *
 * THE CLIP IS DERBY DAY'S TECHNIQUE (shared/js/recorder-1.0.0): a 9:16
 * canvas drawn frame by frame and recorded by the browser's own recorder,
 * MP4 where it makes one and WebM where it does not. The camera holds on
 * each panel in reading order while its captions fade in, glides to the
 * next (a cut under reduced motion), and ends on the whole grid with every
 * caption and the wordmark (`clipPlan`, `clipFrame`). It takes as long to
 * make as it lasts, and the sheet says so. Under reduced motion the clip
 * is recorded unseen: its canvas stays laid out (a recording wants that)
 * at opacity 0, and the status line is the progress.
 *
 * WHILE A CLIP IS MADE, Make the video is marked busy (aria-disabled) and
 * ignores a press, never `disabled`, so the keyboard focus that pressed it
 * is not dropped on the floor.
 *
 * NOTHING IS UPLOADED. A file goes to the share sheet (sharefile-1.0.0) or
 * the downloads folder and nowhere else.
 *
 * Every browser API is handed in (`doc`, `win`, `nav`, `makeRenderer`,
 * `now`), so tests run the whole path with fakes; the plan and the frame
 * are pure and exported.
 */

import { composeMeme, drawCaptions, drawWordmark } from './compose.min.js';
import { labelAnchor, projectPoint, propRects } from './panels.min.js';
import { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';
import { canRecord, pickMime, extensionOf, startRecording } from '../../shared/js/recorder-1.0.0.min.js';

/** Everything the exporter says (house style: polite, no semicolons or
 *  em-dashes). */
export const WORDS = Object.freeze({
    pictureSaved: 'Your meme is in your downloads.',
    pictureShared: 'Shared.',
    pictureFailed: "This browser couldn't make the picture. Please try again.",
    shareTitle: 'Made at SceneXP.com',
    shareButton: 'Share picture',
    saveButton: 'Save picture',
    clipMaking: (seconds) => `Making your video. It takes about ${Math.max(1, Math.round(seconds))} seconds.`,
    clipReady: 'Your video is ready.',
    clipSaved: 'Your video is in your downloads.',
    clipShared: 'Shared.',
    clipFailed: 'Something went wrong making the video. Please try again.',
    noClip: "This browser can't make a video, but it can save a picture.",
    clipShareButton: 'Share video',
    clipSaveButton: 'Save video'
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

// ---- The clip's choreography --------------------------------------------------

const smoothstep = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * The clip's plan for a template: a hold on each panel in reading order,
 * a glide between (none under reduced motion), a glide out to the whole
 * grid and a hold on it with every caption and the wordmark. The hold
 * shrinks so the whole clip stays under `clip.longest`. Returns
 * `{ segments: [{ kind, index, start, seconds }], seconds, hold }`, the
 * kinds being 'panel', 'glide' (index: the panel it goes to, or null for
 * the grid) and 'grid'.
 */
export function clipPlan(template, clip, { reducedMotion = false } = {}) {
    const n = template.cells.length;
    const glide = reducedMotion ? 0 : clip.glide;
    const hold = Math.max(0.4, Math.min(clip.hold, (clip.longest - clip.ending - n * glide) / n));
    const segments = [];
    let t = 0;
    const add = (kind, index, seconds) => {
        if (seconds <= 0) return;
        segments.push({ kind, index, start: t, seconds });
        t += seconds;
    };
    for (let i = 0; i < n; i++) {
        add('panel', i, hold);
        add('glide', i + 1 < n ? i + 1 : null, glide);
    }
    add('grid', null, clip.ending);
    return { segments, seconds: t, hold };
}

/**
 * What the clip shows at `t`: `{ pose, mode, index, alpha, done }`. `poses`
 * are the panels' cameras (`panels[i]`) and the grid's (`grid`). On a panel
 * its captions fade in over `fade`; through a glide the last panel's fade
 * out; on the grid everything fades in together.
 */
export function clipFrame(t, plan, poses, fade) {
    const lerp = (a, b, k) => ({
        eye: a.eye.map((v, i) => v + (b.eye[i] - v) * k),
        aim: a.aim.map((v, i) => v + (b.aim[i] - v) * k),
        fov: a.fov + (b.fov - a.fov) * k
    });
    const done = t >= plan.seconds;
    const seg = plan.segments.find((s) => t < s.start + s.seconds) || plan.segments[plan.segments.length - 1];
    const into = Math.max(0, t - seg.start);
    const rise = fade > 0 ? Math.min(1, into / fade) : 1;
    if (seg.kind === 'panel') return { pose: poses.panels[seg.index], mode: 'panel', index: seg.index, alpha: rise, done };
    if (seg.kind === 'grid') return { pose: poses.grid, mode: 'grid', index: null, alpha: rise, done };
    const at = plan.segments.indexOf(seg);
    const from = plan.segments[at - 1];
    const k = smoothstep(into / seg.seconds);
    const a = poses.panels[from.index];
    const b = seg.index === null ? poses.grid : poses.panels[seg.index];
    return { pose: lerp(a, b, k), mode: 'glide', index: from.index, alpha: 1 - k, done };
}

/**
 * The exporter for `stage` (stage.js's controller). Returns
 * `{ drawPreview, makePicture, savePicture, anchorsFor, clipMime, makeClip,
 * saveClip, stopClip, buttonLabel, clipButtonLabel, state, dispose,
 * rendered, renderer }`. `ids` name the clip's elements on the sheet.
 */
export function createExporter(config, {
    stage,
    doc = typeof document === 'undefined' ? null : document,
    win = typeof window === 'undefined' ? null : window,
    nav = typeof navigator === 'undefined' ? null : navigator,
    mobile = false,
    reducedMotion = () => false,
    /** Hears each picture or clip handed on: `onExport('picture' | 'clip',
     *  'shared' | 'saved' | 'cancelled' | 'failed')`. */
    onExport = () => {},
    /** Says what is happening with the clip (the sheet's status line). */
    say = () => {},
    ids = { clipStage: 'mm-clip-stage', clipMake: 'mm-clip-make', clipSave: 'mm-clip-save' },
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
} = {}) {
    const E = config.export;
    const $ = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    let own = null;          // { canvas, renderer, camera }
    let rendered = 0;
    const state = {
        recording: null,     // while a clip is made
        clip: null           // { blob, name } once made
    };

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

    /** The own camera set to `pose` on a `w` by `h` picture. */
    function aim(pose, w, h) {
        const o = ensure();
        o.camera.fov = pose.fov;
        o.camera.aspect = w / h;
        o.camera.updateProjectionMatrix();
        o.camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        o.camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
        o.camera.updateMatrixWorld(true);
        return o.camera;
    }

    /** Draw the scene `w` by `h` through `pose` and return the renderer's
     *  canvas. */
    function renderPose(pose, w, h) {
        const o = ensure();
        if (o.renderer.setPixelRatio) o.renderer.setPixelRatio(1);
        o.renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false);
        aim(pose, w, h);
        o.renderer.render(stage.scene, o.camera);
        rendered++;
        return o.canvas;
    }

    /** Draw cell `index` `w` by `h` through its camera. */
    function renderPanel(index, w, h) {
        return renderPose(stage.cameraFor(index), w, h);
    }

    /** Where cell `index`'s figures' labels pin on a `w` by `h` panel drawn
     *  through its camera, in the panel's own pixels. */
    function anchorsFor(index, w, h) {
        const panel = stage.panels[index];
        if (!panel) return null;
        const camera = aim(stage.cameraFor(index), w, h);
        return panel.figures.map((f) => projectPoint(labelAnchor(f, config.label.below), camera, w, h));
    }

    /** Where cell `index`'s prop surfaces (the chart's sheet) land on a `w`
     *  by `h` panel drawn through its camera, in the panel's own pixels. */
    function propsFor(index, w, h) {
        const panel = stage.panels[index];
        if (!panel) return null;
        return propRects(panel, aim(stage.cameraFor(index), w, h), w, h);
    }

    /** The composite of `template` with `captions`, `w` by `h`, on `out`. */
    function compose(out, template, captions, w, h) {
        if (out.width !== w) out.width = w;
        if (out.height !== h) out.height = h;
        const ctx = out.getContext('2d');
        if (!ctx) return false;
        composeMeme(ctx, {
            template, captions, w, h, config,
            imageFor: (i, r) => renderPanel(i, r.w, r.h),
            anchorsFor: (i, r) => anchorsFor(i, r.w, r.h),
            propsFor: (i, r) => propsFor(i, r.w, r.h)
        });
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

    // ---- The clip ------------------------------------------------------------------

    /** Whether this browser can make a clip, and in what format. */
    function clipMime() {
        if (!canRecord(win)) return '';
        return pickMime((t) => win.MediaRecorder.isTypeSupported(t));
    }

    /** Make the video reads busy while one is made, and takes no press:
     *  a flag, not `disabled`, so the focus on it stays put. */
    function setBusy(busy) {
        const btn = $(ids.clipMake);
        if (!btn) return;
        if (busy) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
    }

    function clearStage() {
        const el = $(ids.clipStage);
        if (!el) return;
        for (const child of [...(el.children || [])]) el.removeChild(child);
    }

    function stopClip() {
        const r = state.recording;
        if (!r) return false;
        r.cancelled = true;
        try { r.rec.recorder.stop(); } catch (e) { /* already stopped */ }
        state.recording = null;
        setBusy(false);
        return true;
    }

    /**
     * Make the clip of `template` with `captions`: the stage drawn into a
     * canvas on the sheet, recorded as it plays. Resolves with
     * `{ blob, name }` or null.
     */
    function makeClip(template, captions) {
        stopClip();
        state.clip = null;
        const saveBtn = $(ids.clipSave);
        if (saveBtn) saveBtn.hidden = true;
        const mime = clipMime();
        if (!mime) {
            say(WORDS.noClip);
            return Promise.resolve(null);
        }
        const C = E.clip;
        clearStage();
        const out = doc.createElement('canvas');
        out.width = C.w;
        out.height = C.h;
        out.setAttribute('aria-hidden', 'true');
        // Reduced motion: recorded, not watched (the canvas stays laid out).
        const still = reducedMotion();
        if (out.classList && still) out.classList.add('is-unseen');
        const holder = $(ids.clipStage);
        if (holder) holder.appendChild(out);
        const g = out.getContext('2d');
        if (!g || typeof out.captureStream !== 'function') {
            say(WORDS.noClip);
            return Promise.resolve(null);
        }
        let rec;
        try {
            rec = startRecording(out.captureStream(C.fps), mime, { bitrate: mobile ? C.mobileBitrate : C.bitrate, win });
        } catch (e) {
            say(WORDS.noClip);
            return Promise.resolve(null);
        }
        const plan = clipPlan(template, C, { reducedMotion: still });
        const poses = { panels: template.cells.map((_, i) => stage.cameraFor(i)), grid: stage.gridPose(C.w / C.h) };
        setBusy(true);
        say(WORDS.clipMaking(plan.seconds));
        const recording = { rec, out, g, plan, poses, t0: now(), t: 0, frames: 0, cancelled: false };
        state.recording = recording;
        const step = () => {
            if (recording.cancelled || state.recording !== recording) return;
            const t = now() - recording.t0;
            recording.t = t;
            const f = clipFrame(t, plan, poses, C.fade);
            const image = renderPose(f.pose, C.w, C.h);
            g.globalAlpha = 1;
            g.drawImage(image, 0, 0, C.w, C.h);
            if (f.alpha > 0) {
                g.globalAlpha = f.alpha;
                if (f.mode === 'grid') {
                    const { rects, anchors, props } = stage.projectAll(aim(f.pose, C.w, C.h), C.w, C.h);
                    drawCaptions(g, template, captions, rects, config.caption, { anchors, label: config.label, props });
                    drawWordmark(g, C.w, C.h, config.wordmark, config.caption);
                } else {
                    const rects = template.cells.map((_, i) => (i === f.index ? { x: 0, y: 0, w: C.w, h: C.h } : null));
                    const anchors = template.cells.map((_, i) => (i === f.index ? anchorsFor(i, C.w, C.h) : null));
                    const props = template.cells.map((_, i) => (i === f.index ? propsFor(i, C.w, C.h) : null));
                    drawCaptions(g, template, captions, rects, config.caption, { anchors, label: config.label, props });
                }
                g.globalAlpha = 1;
            }
            recording.frames++;
            if (f.done) {
                try { rec.recorder.stop(); } catch (e) { /* already stopped */ }
                return;
            }
            win.requestAnimationFrame(step);
        };
        win.requestAnimationFrame(step);
        return rec.done.then((blob) => {
            if (recording.cancelled) return null;
            state.recording = null;
            setBusy(false);
            state.clip = { blob, name: pictureName(template.id, { w: C.w, h: C.h }, extensionOf(mime)) };
            if (saveBtn) {
                saveBtn.hidden = false;
                saveBtn.textContent = canShareFiles(blob.type, { nav, win }) ? WORDS.clipShareButton : WORDS.clipSaveButton;
            }
            say(WORDS.clipReady);
            return state.clip;
        }).catch(() => {
            state.recording = null;
            setBusy(false);
            say(WORDS.clipFailed);
            return null;
        });
    }

    /** Hand the made clip on. Resolves to what happened. */
    async function saveClip() {
        const result = await handOn(state.clip);
        if (result === 'shared') say(WORDS.clipShared);
        else if (result === 'saved') say(WORDS.clipSaved);
        else if (result === 'failed') say(WORDS.clipFailed);
        onExport('clip', result);
        return result;
    }

    return {
        state,
        drawPreview,
        makePicture,
        savePicture,
        anchorsFor,
        propsFor,
        clipMime,
        makeClip,
        saveClip,
        stopClip,
        /** What the button says before it is pressed: Share where the sheet
         *  takes a PNG, Save otherwise. */
        buttonLabel() {
            return canShareFiles('image/png', { nav, win }) ? WORDS.shareButton : WORDS.saveButton;
        },
        get rendered() { return rendered; },
        get renderer() { return own ? own.renderer : null; },
        dispose() {
            stopClip();
            if (!own) return;
            if (own.renderer.dispose) own.renderer.dispose();
            own = null;
        }
    };
}
