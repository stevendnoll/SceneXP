// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * recorder.js - the browser's side of the share clip (M2): which video
 * format, recording a canvas (and the sound's recording output) to a file,
 * and handing the file on through the share sheet, or saving it.
 *
 * THE RECORDING IS A SHARED PART since 2026-10-26 (shared/js/recorder-1.0.0,
 * promoted for the avatar's clip, the second scene to record a canvas), as
 * the sharing has been since 2026-10-21 (sharefile-1.0.0). Both are
 * re-exported here, so main.js imports them from here as before and the clip
 * is untouched. What stays Derby's is the car's file name.
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
 */

export { MIME_PREFERENCE, canRecord, pickMime, extensionOf, startRecording } from '../../shared/js/recorder-1.0.0.min.js';
export { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';

/** A file name from the car's name: "derby-day-blue-comet.mp4". */
export function fileName(carName, ext) {
    const slug = String(carName || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return `derby-day${slug ? `-${slug}` : ''}.${ext}`;
}
