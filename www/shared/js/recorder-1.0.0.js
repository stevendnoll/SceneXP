// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * recorder.js - Recording a canvas to a video file (shared engine part): which
 * format the browser will make, and the recording itself. Handing the file
 * on is sharefile-1.0.0's.
 *
 * Promoted from www/derby/js/recorder.js on 2026-10-26 for the avatar's clip
 * (the second scene to record a canvas). Derby Day's recorder.js re-exports
 * these, so its clip is untouched.
 *
 * NOTHING IS UPLOADED. The clip is made on the device with the browser's own
 * MediaRecorder, and the visitor's share sheet or downloads folder is the
 * only place it goes.
 *
 * MP4 FIRST. Instagram does not take WebM well (Derby Day's PRD, Risks), so
 * the first format MediaRecorder will make is taken from a list that starts
 * with H.264 in MP4 and ends with WebM. Safari makes MP4, recent Chrome makes
 * MP4 too, and an older Chrome or Firefox makes WebM: the caller names the
 * file by what was made (`extensionOf`).
 *
 * Every browser API is handed in (`win`), so tests run the whole path with
 * fakes.
 */

export const MIME_PREFERENCE = Object.freeze([
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
]);

/** Whether this browser can record a canvas at all. */
export function canRecord(win = typeof window === 'undefined' ? null : window) {
    if (!win || typeof win.MediaRecorder !== 'function') return false;
    const proto = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype;
    return Boolean(proto && typeof proto.captureStream === 'function');
}

/** The first format MediaRecorder will make, or '' for none of them. */
export function pickMime(isTypeSupported) {
    if (typeof isTypeSupported !== 'function') return '';
    for (const mime of MIME_PREFERENCE) {
        try {
            if (isTypeSupported(mime)) return mime;
        } catch (e) { /* a browser that throws on a type it does not know */ }
    }
    return '';
}

/** The file extension a format is saved with. */
export function extensionOf(mime) {
    return /mp4/.test(mime) ? 'mp4' : 'webm';
}

/**
 * Start recording `stream` as `mime`. Returns { recorder, done } where
 * `done` resolves with the Blob once `recorder.stop()` has been called and
 * the last data is in, or rejects if the recorder fails.
 */
export function startRecording(stream, mime, { bitrate, win = typeof window === 'undefined' ? null : window } = {}) {
    const options = mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : { videoBitsPerSecond: bitrate };
    const recorder = new win.MediaRecorder(stream, options);
    const chunks = [];
    const done = new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => resolve(new win.Blob(chunks, { type: (recorder.mimeType || mime || 'video/webm').split(';')[0] }));
        recorder.onerror = (e) => reject(e && e.error ? e.error : new Error('recording failed'));
    });
    // A slice a second, so a long clip is not one buffer held to the end.
    recorder.start(1000);
    return { recorder, done };
}
