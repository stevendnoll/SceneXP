// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * recorder.js - the browser's side of the share clip (M2): which video
 * format, recording a canvas (and the sound's recording output) to a file,
 * and handing the file on through the share sheet, or saving it (those last
 * two are shared/js/sharefile-1.0.0's, re-exported below).
 *
 * NOTHING IS UPLOADED (PRD, The share). The clip is made on the device, and
 * the visitor's own share sheet or downloads folder is the only place it
 * goes.
 *
 * MP4 FIRST. Instagram does not take WebM well (PRD, Risks), so the first
 * format MediaRecorder will make is taken from a list that starts with
 * H.264 in MP4 and ends with WebM. Safari makes MP4, recent Chrome makes
 * MP4 too, and an older Chrome or Firefox makes WebM.
 *
 * A DISMISSED SHARE SHEET IS NOT A FAILURE (as shared/js/share-1.0.0 has
 * it): `navigator.share` rejects with an AbortError when the visitor backs
 * out, and that is their decision, not a cue to save the file instead.
 *
 * Every browser API is handed in (`win`, `nav`, `doc`), so tests run the
 * whole path with fakes.
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

/** A file name from the car's name: "derby-day-blue-comet.mp4". */
export function fileName(carName, ext) {
    const slug = String(carName || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return `derby-day${slug ? `-${slug}` : ''}.${ext}`;
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

// Handing the file on, shared since 2026-10-21 (Corner Office's week card is
// the second scene to share a file it made), and re-exported so main.js
// imports them from here as before.
export { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';
