// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * export.js - Export my avatar (Steve, 2026-10-26): a picture or a short clip
 * of the figure on screen, made on the device, for a profile anywhere else.
 *
 * THE PICTURE IS THE PAGE'S OWN STAGE (studio.js's `buildStage`), drawn by a
 * renderer of its own on a canvas nobody sees, at the size chosen, square:
 * framed on the head and shoulders (the home chip's portrait) or the whole
 * figure, on the studio's white or on nothing (a transparent PNG, for a
 * profile picture or a sticker), and then a border, or none, drawn over it
 * on a 2D canvas (`composePicture`: every border is drawn in code, so no
 * picture file ships and the page's same-origin policy holds). The dialog
 * shows a live preview drawn the same way, smaller.
 *
 * THE CLIP IS DERBY DAY'S TECHNIQUE (shared/js/recorder-1.0.0): the stage
 * drawn frame by frame into a 2D canvas whose stream the browser's own
 * recorder turns into a file, MP4 where the browser makes one and WebM where
 * it does not, named by what was made. The figure waves and turns once
 * round, ending as it began, so the clip loops. No sound. It takes as long
 * to make as it lasts, and the dialog says so.
 *
 * NOTHING IS UPLOADED AND NOTHING NEW IS KEPT. A file goes to the visitor's
 * own share sheet (sharefile-1.0.0) or downloads folder and nowhere else, and
 * exporting changes nothing about the avatar, saved or not.
 *
 * Every browser API is handed in (`doc`, `win`, `nav`, `makeRenderer`,
 * `now`), so tests run the whole path with fakes; the arithmetic and the
 * drawing are pure and exported.
 */

import { createAvatar, portraitPose, PORTRAIT, smoothstep } from '../../shared/js/avatar-figure-1.0.0.min.js';
import { colorOf, normalizeAvatar, CUSTOM_COLOR } from '../../shared/js/avatar-1.0.0.min.js';
import { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';
import { canRecord, pickMime, extensionOf, startRecording } from '../../shared/js/recorder-1.0.0.min.js';
import { buildStage, frameFor } from './studio.min.js';
import { tabKey } from './editor.min.js';

/** Everything the dialog says (house style: polite, no semicolons or
 *  em-dashes). */
export const WORDS = Object.freeze({
    pictureSaved: 'Your picture is in your downloads.',
    pictureShared: 'Shared.',
    pictureFailed: "This browser couldn't make the picture. Please try a smaller size.",
    clipMaking: 'Making your clip. It takes about five seconds.',
    clipReady: 'Your clip is ready.',
    clipSaved: 'Your clip is in your downloads.',
    clipShared: 'Shared.',
    clipFailed: 'Something went wrong making the clip. Please try again.',
    noClip: "This browser can't make a video, but it can save a picture.",
    shareTitle: 'My SceneXP avatar'
});

// ---- The choices ---------------------------------------------------------------

export const FRAMINGS = Object.freeze([
    { id: 'portrait', label: 'Head and shoulders' },
    { id: 'figure', label: 'Whole figure' }
]);

export const BACKGROUNDS = Object.freeze([
    { id: 'studio', label: 'The studio' },
    { id: 'clear', label: 'Transparent' }
]);

/**
 * The borders, each drawn in code (`composePicture`): `shape` is what the
 * picture is cut to (a `circle` is transparent outside the ring, for a round
 * profile picture), `width` the border's share of the picture's size.
 */
export const BORDERS = Object.freeze([
    { id: 'none', label: 'None', shape: 'square', width: 0 },
    { id: 'ring', label: 'Ring', shape: 'circle', width: 0.04 },
    { id: 'bold', label: 'Bold ring', shape: 'circle', width: 0.08 },
    { id: 'double', label: 'Double ring', shape: 'circle', width: 0.025, gap: 0.02 },
    { id: 'gradient', label: 'Gradient ring', shape: 'circle', width: 0.06, gradient: true },
    { id: 'dotted', label: 'Dotted ring', shape: 'circle', width: 0.035, dotted: true },
    { id: 'square', label: 'Rounded square', shape: 'square', width: 0.045, radius: 0.12 },
    { id: 'badge', label: 'Badge', shape: 'circle', width: 0.07, scallops: 20 }
]);

/** The border's colors: the shirt's by default, so a border always suits,
 *  then a few plain ones, and any color through the custom swatch. */
export const BORDER_COLORS = Object.freeze([
    { id: 'match', label: 'Match my shirt', color: null },
    { id: 'white', label: 'White', color: 0xffffff },
    { id: 'ink', label: 'Ink', color: 0x1d1d1f },
    { id: 'navy', label: 'Navy', color: 0x2a3a56 },
    { id: 'red', label: 'Red', color: 0x9c2b25 },
    { id: 'gold', label: 'Gold', color: 0xc9a24a },
    { id: 'teal', label: 'Teal', color: 0x2a7f8a },
    { id: 'pink', label: 'Pink', color: 0xe48fb8 }
]);

/** The border's color as a hex number: a custom color (`x` and six hex
 *  digits) as it is, a listed one's, or the avatar's shirt for `match`. */
export function borderColor(avatar, id) {
    if (CUSTOM_COLOR.test(id)) return parseInt(id.slice(1), 16);
    const option = BORDER_COLORS.find((c) => c.id === id);
    if (option && option.color !== null) return option.color;
    return colorOf('shirt', normalizeAvatar(avatar).shirt);
}

export function hexCss(n) {
    return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

/** A color `k` of the way from `a` to `b`, each a hex number. */
export function mixHex(a, b, k) {
    const ch = (c, s) => (c >> s) & 255;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** File names: "scenexp-avatar-1024.png", "scenexp-avatar-1080x1080.mp4". */
export function pictureName(px, ext = 'png') {
    return `scenexp-avatar-${px}.${ext}`;
}

export function clipName(size, ext) {
    return `scenexp-avatar-${size.w}x${size.h}.${ext}`;
}

// ---- The camera -----------------------------------------------------------------

/** How much of the frame, from its middle, the head and whatever is on it
 *  may fill in the head-and-shoulders picture: the chip is round and crops
 *  its corners, a picture is square and shows them, so a wide brim or a
 *  tall hat moves the camera back until it fits (measured: a sun hat's
 *  brim stood 1.38 of the way across at the chip's distance, a chef's hat
 *  1.48 of the way up). A bare head keeps the chip's close framing. */
export const PORTRAIT_FILL = 0.86;

/**
 * The camera for a framing on a picture of `aspect`, the figure standing
 * `standY` up: the chip's portrait (avatar-figure's PORTRAIT, lifted onto
 * the plinth, and backed off until `head`, the head's box in the stage's
 * coordinates with its hat and hair, fits within `PORTRAIT_FILL`) or the
 * studio's whole-figure framing. `{ eye, aim, fov }`.
 */
export function pictureCamera(framing, aspect, C, standY, head = null) {
    if (framing === 'portrait') {
        const p = portraitPose(PORTRAIT);
        const aimY = p.aim[1] + standY;
        let distance = p.eye[2];
        if (head && head.min && head.max) {
            const tan = Math.tan((p.fov * Math.PI) / 360);
            for (const x of [head.min.x, head.max.x]) for (const y of [head.min.y, head.max.y]) for (const z of [head.min.z, head.max.z]) {
                const reach = Math.max(Math.abs(Number(x) || 0), Math.abs((Number(y) || 0) - aimY));
                distance = Math.max(distance, (Number(z) || 0) + reach / (PORTRAIT_FILL * tan));
            }
        }
        return { eye: [0, aimY + (p.eye[1] - p.aim[1]), distance], aim: [0, aimY, 0], fov: p.fov };
    }
    const f = frameFor(C.frames.body, aspect, C.fov, standY);
    return { eye: f.eye, aim: f.aim, fov: C.fov };
}

// ---- The clip's choreography --------------------------------------------------

/** The plinth's angle `t` seconds into the clip: still, then once round
 *  over `turnSeconds` from `turnFrom`, eased, so it ends facing the front. */
export function clipAngle(t, clip) {
    return Math.PI * 2 * smoothstep((t - clip.turnFrom) / clip.turnSeconds);
}

/** What the clip is doing at `t`: the angle, whether the wave has begun,
 *  and whether the clip is over. */
export function clipMoment(t, clip) {
    return { angle: clipAngle(t, clip), waving: t >= clip.waveAt, done: t >= clip.seconds };
}

// ---- Drawing the picture ---------------------------------------------------------

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function scallops(ctx, c, r, count, depth) {
    ctx.beginPath();
    const steps = count * 12;
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rr = r - depth * (0.5 - 0.5 * Math.cos(a * count));
        const x = c + Math.cos(a) * rr;
        const y = c + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

/**
 * Draw the rendered `image` (a canvas `size` square) onto `ctx` (a canvas
 * the same size), cut to the border's shape, with the border over it in
 * `color` (a hex number). Pure drawing: nothing is read back.
 */
export function composePicture(ctx, image, size, { border = BORDERS[0], color = 0x1d1d1f } = {}) {
    const B = BORDERS.find((b) => b.id === (border && border.id)) || BORDERS[0];
    const css = hexCss(color);
    const w = B.width * size;
    ctx.clearRect(0, 0, size, size);
    if (B.shape === 'circle') {
        const c = size / 2;
        // The picture's radius: under the ring's inner half (so no hairline
        // of background shows inside it), inside the inner ring of a double,
        // and inside a badge's scallops.
        let r = c - w / 2;
        if (B.gap) r = c - 2 * w - B.gap * size + w / 2;
        if (B.scallops) r = c - w;
        if (B.scallops) {
            ctx.fillStyle = css;
            scallops(ctx, c, c, B.scallops, w * 0.55);
            ctx.fill();
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(c, c, Math.max(1, r), 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(image, 0, 0, size, size);
        ctx.restore();
        if (!B.scallops && w > 0) {
            ctx.lineWidth = w;
            ctx.strokeStyle = css;
            if (B.gradient) {
                const g = ctx.createLinearGradient(0, 0, size, size);
                g.addColorStop(0, css);
                g.addColorStop(1, hexCss(mixHex(color, 0xffffff, 0.55)));
                ctx.strokeStyle = g;
            }
            if (B.dotted) {
                ctx.lineCap = 'round';
                ctx.setLineDash([w * 0.01, w * 1.9]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.arc(c, c, c - w / 2, 0, Math.PI * 2);
            ctx.stroke();
            if (B.gap) {
                ctx.beginPath();
                ctx.arc(c, c, c - w - B.gap * size - w / 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.lineCap = 'butt';
        }
        return;
    }
    if (w > 0) {
        const rad = (B.radius || 0) * size;
        ctx.save();
        roundedRect(ctx, 0, 0, size, size, rad);
        ctx.clip();
        ctx.drawImage(image, 0, 0, size, size);
        ctx.restore();
        ctx.lineWidth = w * 2;
        ctx.strokeStyle = css;
        ctx.setLineDash([]);
        roundedRect(ctx, 0, 0, size, size, rad);
        ctx.stroke();
        return;
    }
    ctx.drawImage(image, 0, 0, size, size);
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

// ---- The ids the dialog is built on ---------------------------------------------

/** Every element id the dialog uses, so the markup and the tests agree. */
export function dialogIds(config) {
    const E = config.export;
    const radios = (prefix, list) => list.map((o) => `${prefix}-${o.id}`);
    return {
        dialog: 'av-export',
        open: 'av-export-open',
        close: 'av-export-close',
        tabs: 'av-export-tabs',
        tabPicture: 'av-export-tab-picture',
        tabClip: 'av-export-tab-clip',
        picture: 'av-export-picture',
        clip: 'av-export-clip',
        preview: 'av-export-preview',
        stage: 'av-export-stage',
        status: 'av-export-status',
        colorGroup: 'av-export-color-group',
        custom: 'av-export-color-custom',
        savePicture: 'av-export-picture-save',
        makeClip: 'av-export-clip-make',
        saveClip: 'av-export-clip-save',
        framing: radios('av-export-framing', FRAMINGS),
        background: radios('av-export-background', BACKGROUNDS),
        border: radios('av-export-border', BORDERS),
        color: radios('av-export-color', BORDER_COLORS),
        size: radios('av-export-size', E.pictures),
        clipSize: radios('av-export-clip-size', E.clip.sizes)
    };
}

// ---- The exporter --------------------------------------------------------------

/**
 * The dialog and the making. `open(avatar)` shows it for the figure on
 * screen; the rest is driven by its own buttons. Returns
 * `{ open, close, select, state, drawPreview, makePicture, savePicture,
 * makeClip, saveClip, ids }`.
 */
export function createExporter(config, {
    doc = typeof document === 'undefined' ? null : document,
    win = typeof window === 'undefined' ? null : window,
    nav = typeof navigator === 'undefined' ? null : navigator,
    mobile = false,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
} = {}) {
    const E = config.export;
    const C = config.camera;
    const ids = dialogIds(config);
    const $ = (id) => doc.getElementById(id);
    const state = {
        avatar: null,
        framing: FRAMINGS[0].id,
        background: BACKGROUNDS[0].id,
        border: BORDERS[0].id,
        color: BORDER_COLORS[0].id,
        size: E.pictures[Math.min(1, E.pictures.length - 1)].id,
        clipSize: E.clip.sizes[Math.min(1, E.clip.sizes.length - 1)].id,
        tab: 'picture',
        open: false,
        recording: null,       // while a clip is made
        clip: null             // { blob, name } once made
    };
    let stage = null;          // { scene, turntable, standY, set, figure, renderer, canvas, camera }
    let rendered = 0;

    const say = (text) => {
        const el = $(ids.status);
        if (el) el.textContent = text;
    };

    /** The option a radio list holds, by the checked input's id. */
    const checked = (list, prefix, fallback) => {
        for (const id of list) {
            const input = $(id);
            if (input && input.checked) return id.slice(prefix.length + 1);
        }
        return fallback;
    };

    function readChoices() {
        state.framing = checked(ids.framing, 'av-export-framing', state.framing);
        state.background = checked(ids.background, 'av-export-background', state.background);
        state.border = checked(ids.border, 'av-export-border', state.border);
        state.size = checked(ids.size, 'av-export-size', state.size);
        state.clipSize = checked(ids.clipSize, 'av-export-clip-size', state.clipSize);
        const custom = $(ids.custom);
        const chosen = checked(ids.color, 'av-export-color', null);
        if (chosen) state.color = chosen;
        else if (custom && custom.value) state.color = `x${custom.value.slice(1)}`;
        const group = $(ids.colorGroup);
        if (group) group.hidden = state.border === 'none';
    }

    // ---- The stage, made when the dialog opens and let go when it closes ----

    function ensureStage() {
        if (stage) return stage;
        const canvas = doc.createElement('canvas');
        const renderer = makeRenderer(canvas);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = config.light.exposure;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        const built = buildStage(config, { mobile });
        const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.05, 60);
        stage = { ...built, renderer, canvas, camera, figure: null, studioBackground: built.scene.background };
        return stage;
    }

    function setFigure(avatar) {
        const s = ensureStage();
        if (s.figure) s.figure.dispose();
        s.figure = createAvatar(avatar);
        s.figure.group.position.y = s.standY;
        s.turntable.add(s.figure.group);
        // The head with its hat and hair, measured facing the front, so the
        // portrait can back off for a wide brim.
        s.turntable.rotation.y = 0;
        s.scene.updateMatrixWorld(true);
        const head = s.figure.person.getObjectByName('head');
        const box = head ? new THREE.Box3().setFromObject(head) : null;
        s.head = box ? { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } } : null;
    }

    function releaseStage() {
        if (!stage) return;
        if (stage.figure) stage.figure.dispose();
        if (stage.renderer.dispose) stage.renderer.dispose();
        if (stage.renderer.forceContextLoss) {
            try { stage.renderer.forceContextLoss(); } catch (e) { /* already lost */ }
        }
        stage = null;
    }

    /** Show the stage's backdrop or hide it for a clear picture. */
    function setBackdrop(clear) {
        const s = ensureStage();
        for (const part of Object.values(s.set)) part.visible = !clear;
        s.scene.background = clear ? null : s.studioBackground;
        if (s.renderer.setClearColor) s.renderer.setClearColor(0x000000, clear ? 0 : 1);
    }

    /** Draw the figure `w` by `h` with `framing`, the plinth turned `angle`,
     *  and return the renderer's canvas. */
    function render(w, h, framing, angle = 0) {
        const s = ensureStage();
        if (s.renderer.setPixelRatio) s.renderer.setPixelRatio(1);
        s.renderer.setSize(w, h, false);
        const pose = pictureCamera(framing, w / h, C, s.standY, s.head);
        s.camera.fov = pose.fov;
        s.camera.aspect = w / h;
        s.camera.updateProjectionMatrix();
        s.camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        s.camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
        s.turntable.rotation.y = angle;
        s.renderer.render(s.scene, s.camera);
        rendered++;
        return s.canvas;
    }

    // ---- The picture ---------------------------------------------------------------

    function composeInto(out, px) {
        setBackdrop(state.background === 'clear');
        const image = render(px, px, state.framing, 0);
        const ctx = out.getContext('2d');
        if (!ctx) return false;
        composePicture(ctx, image, px, { border: BORDERS.find((b) => b.id === state.border), color: borderColor(state.avatar, state.color) });
        return true;
    }

    function drawPreview() {
        if (!state.open || !state.avatar) return false;
        readChoices();
        const preview = $(ids.preview);
        if (!preview) return false;
        const px = E.preview;
        if (preview.width !== px) preview.width = px;
        if (preview.height !== px) preview.height = px;
        return composeInto(preview, px);
    }

    /** The picture at the chosen size: `{ blob, name }`, or null. */
    async function makePicture() {
        readChoices();
        const size = E.pictures.find((p) => p.id === state.size) || E.pictures[0];
        const out = doc.createElement('canvas');
        out.width = size.px;
        out.height = size.px;
        if (!composeInto(out, size.px)) return null;
        const blob = await canvasBlob(out, 'image/png', win);
        return blob ? { blob, name: pictureName(size.px) } : null;
    }

    /** Hand a made file on: the share sheet where it takes the type, a
     *  download otherwise. Returns 'shared', 'saved', 'cancelled' or 'failed'. */
    async function handOn(made, { shared, saved }) {
        if (!made) return 'failed';
        if (canShareFiles(made.blob.type, { nav, win })) {
            const result = await shareFile(made.blob, made.name, { title: WORDS.shareTitle, nav, win });
            if (result === 'shared') {
                say(shared);
                return 'shared';
            }
            if (result === 'cancelled') return 'cancelled';
        }
        const url = win.URL.createObjectURL(made.blob);
        const offered = saveFile(url, made.name, { doc });
        win.setTimeout(() => win.URL.revokeObjectURL(url), 10000);
        if (offered) say(saved);
        return offered ? 'saved' : 'failed';
    }

    async function savePicture() {
        const result = await handOn(await makePicture(), { shared: WORDS.pictureShared, saved: WORDS.pictureSaved });
        if (result === 'failed') say(WORDS.pictureFailed);
        return result;
    }

    // ---- The clip ------------------------------------------------------------------

    /** Whether this browser can make a clip, and in what format. */
    function clipMime() {
        if (!canRecord(win)) return '';
        return pickMime((t) => win.MediaRecorder.isTypeSupported(t));
    }

    function stopClip() {
        const r = state.recording;
        if (!r) return;
        r.cancelled = true;
        try { r.rec.recorder.stop(); } catch (e) { /* already stopped */ }
        state.recording = null;
    }

    function clearStage() {
        const el = $(ids.stage);
        if (!el) return;
        for (const child of [...(el.children || [])]) el.removeChild(child);
    }

    /** Make the clip: the stage drawn into a canvas in the dialog, recorded
     *  as it plays. Resolves with `{ blob, name }` or null. */
    function makeClip() {
        readChoices();
        stopClip();
        state.clip = null;
        const saveBtn = $(ids.saveClip);
        if (saveBtn) saveBtn.hidden = true;
        const mime = clipMime();
        if (!mime) {
            say(WORDS.noClip);
            return Promise.resolve(null);
        }
        const size = E.clip.sizes.find((c) => c.id === state.clipSize) || E.clip.sizes[0];
        clearStage();
        const out = doc.createElement('canvas');
        out.width = size.w;
        out.height = size.h;
        out.setAttribute('aria-hidden', 'true');
        const holder = $(ids.stage);
        if (holder) holder.appendChild(out);
        const g = out.getContext('2d');
        if (!g || typeof out.captureStream !== 'function') {
            say(WORDS.noClip);
            return Promise.resolve(null);
        }
        let rec;
        try {
            rec = startRecording(out.captureStream(E.clip.fps), mime, { bitrate: mobile ? E.clip.mobileBitrate : E.clip.bitrate, win });
        } catch (e) {
            say(WORDS.noClip);
            return Promise.resolve(null);
        }
        setBackdrop(false);
        setFigure(state.avatar);
        const makeBtn = $(ids.makeClip);
        if (makeBtn) makeBtn.disabled = true;
        say(WORDS.clipMaking);
        const recording = { rec, out, g, size, mime, t0: now(), last: 0, waved: false, cancelled: false };
        state.recording = recording;
        const s = ensureStage();
        const step = () => {
            if (recording.cancelled || state.recording !== recording) return;
            const t = now() - recording.t0;
            const dt = Math.min(0.1, Math.max(0, t - recording.last));
            recording.last = t;
            const m = clipMoment(t, E.clip);
            recording.t = t;
            recording.angle = m.angle;
            if (m.waving && !recording.waved) {
                recording.waved = true;
                s.figure.gesture('wave');
            }
            s.figure.tick(dt, { reducedMotion: false });
            const image = render(size.w, size.h, 'figure', m.angle);
            g.drawImage(image, 0, 0, size.w, size.h);
            if (m.done) {
                try { rec.recorder.stop(); } catch (e) { /* already stopped */ }
                return;
            }
            win.requestAnimationFrame(step);
        };
        win.requestAnimationFrame(step);
        return rec.done.then((blob) => {
            if (makeBtn) makeBtn.disabled = false;
            if (recording.cancelled) return null;
            state.recording = null;
            state.clip = { blob, name: clipName(size, extensionOf(mime)) };
            if (saveBtn) {
                saveBtn.hidden = false;
                saveBtn.textContent = canShareFiles(blob.type, { nav, win }) ? 'Share video' : 'Save video';
            }
            say(WORDS.clipReady);
            return state.clip;
        }).catch(() => {
            if (makeBtn) makeBtn.disabled = false;
            state.recording = null;
            say(WORDS.clipFailed);
            return null;
        });
    }

    async function saveClip() {
        return handOn(state.clip, { shared: WORDS.clipShared, saved: WORDS.clipSaved });
    }

    // ---- The dialog ----------------------------------------------------------------

    function select(tab) {
        state.tab = tab;
        const picture = tab === 'picture';
        const tabs = [[ids.tabPicture, picture], [ids.tabClip, !picture]];
        for (const [id, on] of tabs) {
            const b = $(id);
            if (!b) continue;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        }
        const p = $(ids.picture);
        const c = $(ids.clip);
        if (p) p.hidden = !picture;
        if (c) c.hidden = picture;
        if (picture) drawPreview();
    }

    function open(avatar) {
        state.avatar = normalizeAvatar(avatar);
        state.clip = null;
        const saveBtn = $(ids.saveClip);
        if (saveBtn) saveBtn.hidden = true;
        clearStage();
        say('');
        setFigure(state.avatar);
        // The shirt's swatch shows the shirt's color.
        const match = $(ids.color[0]);
        const swatch = match && match.parentNode && match.parentNode.children ? match.parentNode.children[1] : null;
        if (swatch && swatch.style && swatch.style.setProperty) swatch.style.setProperty('--swatch', hexCss(borderColor(state.avatar, 'match')));
        const pictureBtn = $(ids.savePicture);
        if (pictureBtn) pictureBtn.textContent = canShareFiles('image/png', { nav, win }) ? 'Share picture' : 'Save picture';
        const dialog = $(ids.dialog);
        state.open = true;
        if (dialog) {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        }
        select('picture');
        return true;
    }

    function close() {
        if (!state.open) return false;
        stopClip();
        state.open = false;
        clearStage();
        releaseStage();
        const dialog = $(ids.dialog);
        if (dialog) {
            if (typeof dialog.close === 'function' && dialog.open !== false) {
                try { dialog.close(); } catch (e) { /* not open */ }
            }
            dialog.removeAttribute('open');
        }
        return true;
    }

    // ---- Wiring --------------------------------------------------------------------

    const on = (id, type, fn) => {
        const el = $(id);
        if (el) el.addEventListener(type, fn);
    };
    on(ids.close, 'click', close);
    on(ids.dialog, 'close', () => {
        // Escape, or the browser closing it: let the stage go.
        if (state.open) {
            state.open = false;
            stopClip();
            clearStage();
            releaseStage();
        }
    });
    on(ids.tabPicture, 'click', () => select('picture'));
    on(ids.tabClip, 'click', () => select('clip'));
    on(ids.tabs, 'keydown', (e) => {
        const order = ['picture', 'clip'];
        const next = tabKey(e.key, order.indexOf(state.tab), order.length);
        if (next === null) return;
        if (e.preventDefault) e.preventDefault();
        select(order[next]);
        const b = $(next === 0 ? ids.tabPicture : ids.tabClip);
        if (b && b.focus) b.focus();
    });
    for (const list of [ids.framing, ids.background, ids.border, ids.color, ids.size]) {
        for (const id of list) on(id, 'change', drawPreview);
    }
    for (const id of ids.clipSize) on(id, 'change', readChoices);
    // The custom color: the radios let go of their choice, and the preview
    // follows the picker once a frame while it is dragged.
    const custom = $(ids.custom);
    if (custom) {
        let pending = false;
        const apply = () => {
            pending = false;
            for (const id of ids.color) {
                const input = $(id);
                if (input) input.checked = false;
            }
            custom.classList.add('is-chosen');
            drawPreview();
        };
        custom.addEventListener('input', () => {
            if (pending) return;
            pending = true;
            if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(apply);
            else apply();
        });
        custom.addEventListener('change', apply);
        for (const id of ids.color) on(id, 'change', () => custom.classList.remove('is-chosen'));
    }
    // The swatches' colors, set through the CSSOM (the policy allows no
    // style attribute).
    for (const option of BORDER_COLORS) {
        if (option.color === null) continue;
        const input = $(`av-export-color-${option.id}`);
        const swatch = input && input.parentNode && input.parentNode.children ? input.parentNode.children[1] : null;
        if (swatch && swatch.style && swatch.style.setProperty) swatch.style.setProperty('--swatch', hexCss(option.color));
    }
    on(ids.savePicture, 'click', savePicture);
    on(ids.makeClip, 'click', makeClip);
    on(ids.saveClip, 'click', saveClip);

    return {
        ids,
        state,
        open,
        close,
        select,
        drawPreview,
        makePicture,
        savePicture,
        makeClip,
        saveClip,
        clipMime,
        get rendered() {
            return rendered;
        },
        get stage() {
            return stage;
        }
    };
}
