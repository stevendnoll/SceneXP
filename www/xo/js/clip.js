// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * clip.js - THE CLIP OF A PLAY (specs/xo-photos-plan, Part three): the
 * replay the visitor just watched, as a video they can post.
 *
 * THE CLIP IS THE REPLAY, RECORDED. The replay does not re-simulate (replay.js
 * is a flight recorder), so the take re-runs the recording the way the replay
 * phase does, draws each frame through the replay's own director camera at
 * the clip's size and shape, and copies it into a canvas the browser is
 * recording (recorder-1.0.0). Nothing new is invented about what happened or
 * how it is shot.
 *
 * NOT THE WHOLE PLAY (D15). The front of a pass play is the quarterback
 * reading the field while the visitor decides, up to ten seconds of nothing
 * happening on camera, and the end is where the catch, the run and the hit
 * are. So the take starts `clip.seconds` before the whistle, or at the snap
 * when the play was shorter, and the ending the replay plays at the whistle
 * (the tackle or the party) rides on top, then a hold.
 *
 * THE CAMERA IS THE DIRECTOR'S, turned to the quarter the visitor chose (D14,
 * D16). It opens on where the ball was on the take's first frame rather than
 * on the line of scrimmage (D22), and keeps a shoulder memory of its own, so a
 * take never moves the replay on screen.
 *
 * PURE where it can be: the start frame, the plan, the progress, the shot, the
 * words and the names take numbers and return numbers. `takeFrame` and
 * `holdSize` are the only parts that touch THREE, and `recordTake` is the only
 * part that touches MediaRecorder, with every browser API handed in.
 *
 * NOTHING IS UPLOADED. The clip is made on the device, and the share sheet or
 * the downloads folder is the only place it goes.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { replayDriver, applyView, viewOffset, shoulderFor, newShoulder } from './camera.min.js';
import { drawWordmark, wordmarkFont, WORDMARK } from '../../shared/js/wordmark-1.0.0.min.js';
import { startRecording } from '../../shared/js/recorder-1.0.0.min.js';

const K = () => CFG.clip;

/** The clip's size in pixels, a phone's or a computer's (D17). */
export function clipSize(mobile = false) {
    const C = K();
    return mobile ? { w: C.mobileWidth, h: C.mobileHeight } : { w: C.width, h: C.height };
}

/**
 * THE FIRST RECORDED FRAME OF THE CLIP: `seconds` of clip before the whistle,
 * at the replay's speed (the playhead moves `simHz * speed` frames a second
 * of clip), or frame zero when the recording is shorter than that.
 */
export function clipStart(ticks, { seconds = K().seconds, speed = CFG.camera.replay.speed, simHz = CFG.simHz } = {}) {
    const n = Math.max(0, Math.floor(Number(ticks) || 0));
    const span = Math.max(0, Math.round((Number(seconds) || 0) * (Number(speed) || 1) * (Number(simHz) || 1)));
    return Math.max(0, n - span);
}

/**
 * THE TIMELINE OF A TAKE, in clip seconds: `play` from `start` to the whistle
 * (frame `ticks`), then `ending` (the tackle or the party the replay plays at
 * the whistle, handed in because main.js decided it once at the live
 * whistle), then `hold`. `total` is the whole clip.
 */
export function clipPlan({ ticks, ending = 0, seconds = K().seconds, hold = K().hold, speed = CFG.camera.replay.speed, simHz = CFG.simHz } = {}) {
    const n = Math.max(0, Math.floor(Number(ticks) || 0));
    const start = clipStart(n, { seconds, speed, simHz });
    const perSecond = Math.max(1e-6, (Number(simHz) || 1) * (Number(speed) || 1));
    const play = (n - start) / perSecond;
    const end = Math.max(0, Number(ending) || 0);
    const rest = Math.max(0, Number(hold) || 0);
    return { start, ticks: n, play, ending: end, hold: rest, total: play + end + rest };
}

/** How far through the play part of the take frame `frame` is, 0 to 1. The
 *  director's shot establishes, tracks and settles over this, as it does over
 *  a whole replay. Past the whistle it is 1. */
export function clipProgress(frame, plan) {
    const span = plan.ticks - plan.start;
    if (!(span > 0)) return 1;
    const t = (Number(frame) - plan.start) / span;
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * THE DIRECTOR'S SHOT OF THIS FRAME, FOR THE CLIP: the replay camera
 * (camera.js `replayDriver`) opened on `anchor` (where the ball was on the
 * take's first frame, world metres), rounding the shoulder its own `shoulder`
 * memory says (`newShoulder()`, one a take), turned to vantage point
 * `quarter` (0 is the director's own). `focus` is where the ball or its
 * carrier is on this frame, in world metres.
 */
export function clipShot(progress, focus, { anchor = null, shoulder = null, quarter = 0, delta = 0 } = {}) {
    const f = focus || { x: 0, y: 0, z: 0 };
    const side = shoulderFor(f.z, delta, shoulder || newShoulder());
    return applyView(replayDriver(progress, f, side, anchor), viewOffset(quarter));
}

/** "Caught +15", "Intercepted -10", "Incomplete": the result line stamped
 *  over the final hold (D19). Nothing for no outcome. */
export function stampText(outcome) {
    if (!outcome || !outcome.headline) return '';
    const points = Number(outcome.points) || 0;
    if (points === 0) return String(outcome.headline);
    return `${outcome.headline} ${points > 0 ? '+' : ''}${points}`;
}

/** "scenexp-xo-catch-720x1280.mp4". `result` is the outcome's own slug. */
export function clipName(result, w, h, ext = 'mp4') {
    const slug = String(result || 'play').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'play';
    return `scenexp-xo-${slug}-${w}x${h}.${ext}`;
}

/**
 * The stamp: the result line in the wordmark's face, white with a dark
 * outline, centered, its baseline `stampAt` of the way down the frame and its
 * letters `stampHeight` of the frame tall. Drawn after the picture, so it is
 * on top of it.
 */
export function drawStamp(g, w, h, text, { height = K().stampHeight, at = K().stampAt } = {}) {
    if (!g || !text) return null;
    const px = Math.max(1, Math.round(h * height));
    g.font = wordmarkFont(px);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.lineWidth = px * WORDMARK.stroke;
    g.strokeStyle = WORDMARK.outline;
    g.fillStyle = WORDMARK.fill;
    const x = w / 2;
    const y = Math.round(h * at);
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
    return { x, y, px };
}

let clipCamera = null;

/**
 * ONE FRAME OF THE TAKE: the clip camera posed by `shot`, the scene rendered
 * through it into the renderer's buffer (held at `w` by `h` by `holdSize`),
 * the buffer copied onto the stage canvas's context `g`, the wordmark in the
 * corner, and the stamp when there is one. From inside the frame loop, in the
 * same task as the render, which is what makes the WebGL canvas readable
 * without preserveDrawingBuffer. Returns whether a frame was drawn.
 */
export function takeFrame({ renderer, scene, canvas, shot, g, w, h, wordmark = K().wordmark, stamp = '' }) {
    if (!renderer || !scene || !canvas || !shot || !g || !(w > 0) || !(h > 0)) return false;
    const C = K();
    if (!clipCamera) clipCamera = new THREE.PerspectiveCamera(shot.fov || 50, w / h, C.near, C.far);
    clipCamera.aspect = w / h;
    clipCamera.near = C.near;
    clipCamera.far = C.far;
    if (typeof shot.fov === 'number') clipCamera.fov = shot.fov;
    clipCamera.updateProjectionMatrix();
    clipCamera.position.set(shot.position.x, shot.position.y, shot.position.z);
    clipCamera.lookAt(shot.target.x, shot.target.y, shot.target.z);
    clipCamera.updateMatrixWorld();
    renderer.render(scene, clipCamera);
    g.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
    if (wordmark) drawWordmark(g, w, h, { text: wordmark });
    if (stamp) drawStamp(g, w, h, stamp);
    return true;
}

/**
 * HOLD THE RENDERER'S BUFFER AT `w` BY `h` PIXELS for a take, at a pixel ratio
 * of 1, and give back a function that restores the size and the ratio it had
 * (once; a second call does nothing). The CSS size is never touched, so the
 * page's layout does not move. One resize at the start of a take and one at
 * its end, rather than two a frame, because resizing a drawing buffer is not
 * free on a phone.
 */
export function holdSize(renderer, w, h) {
    const ratio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    const back = { x: size.x, y: size.y };
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    let released = false;
    return () => {
        if (released) return false;
        released = true;
        renderer.setPixelRatio(ratio);
        renderer.setSize(back.x, back.y, false);
        return true;
    };
}

/**
 * RECORD A TAKE: the stage canvas sized to `w` by `h` and captured at `fps`,
 * the recorder started BEFORE the first frame is drawn and stopped AFTER the
 * last, which is when `take()` resolves (main.js draws the frames). Resolves
 * `{ blob, mime, seconds, frames }`, or null when the take was refused or
 * cancelled, or when the stage cannot be captured. A recorder that fails
 * rejects the way recorder-1.0.0 does.
 *
 * The stage is sized before it is captured, never during: an encoder handed
 * frames of a new size part way through a recording may give up on it.
 */
export async function recordTake(stage, take, { w, h, mime, fps = K().fps, bitrate = K().bitrate, win = typeof window === 'undefined' ? null : window } = {}) {
    if (!stage || typeof stage.captureStream !== 'function' || typeof take !== 'function') return null;
    if (w > 0 && h > 0) {
        if (stage.width !== w) stage.width = w;
        if (stage.height !== h) stage.height = h;
    }
    const stream = stage.captureStream(fps);
    const rec = startRecording(stream, mime, { bitrate, win });
    let outcome = null;
    try {
        outcome = await take();
    } finally {
        try { rec.recorder.stop(); } catch (e) { /* already stopped */ }
    }
    if (!outcome || outcome.cancelled) {
        // Let the recorder finish on its own so nothing is left half open,
        // but nothing it made is wanted.
        try { await rec.done; } catch (e) { /* a failed recorder is no loss */ }
        return null;
    }
    const blob = await rec.done;
    return {
        blob,
        mime: (blob && blob.type) || (mime || '').split(';')[0],
        seconds: outcome.seconds,
        frames: outcome.frames,
    };
}
