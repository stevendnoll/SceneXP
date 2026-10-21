// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sharefile.js - Handing a FILE to somebody (shared engine part): a picture
 * or a clip a scene made on the device, through the device's own share
 * sheet, or saved through a download link where there is no sheet.
 *
 * share-1.0.0 hands over a LINK. This hands over a file, which is a
 * different ladder with two rungs, not three: a file cannot be copied to the
 * clipboard the way a link can, so where the share sheet cannot take it the
 * file is saved, and the caller says so.
 *
 * Promoted from www/derby/js/recorder.js on 2026-10-21 for Corner Office's
 * week card (the second scene to share a file it made). Derby Day's
 * recorder.js re-exports these, so its clip and its still are untouched.
 *
 * A DISMISSED SHARE SHEET IS NOT A FAILURE (as share-1.0.0 has it):
 * `navigator.share` rejects with an AbortError when the visitor backs out,
 * and that is their decision, not a cue to save the file instead.
 *
 * NOTHING IS UPLOADED. The file goes to the visitor's own share sheet or
 * downloads folder and nowhere else.
 *
 * Every browser API is handed in (`nav`, `win`, `doc`), so tests run the
 * whole path with fakes.
 */

/** The extension a file of this media type is probed with: "mp4" for
 *  "video/mp4;codecs=avc1", "jpeg" for "image/jpeg". */
function extensionFor(type) {
    return String(type || '').split(';')[0].split('/')[1] || 'bin';
}

/**
 * Hand a file to the share sheet. Returns 'shared', 'cancelled' (the
 * visitor backed out), or 'unavailable' (this browser cannot share a file,
 * or the share failed): the caller saves the file for the last.
 */
export async function shareFile(blob, name, { title = '', text = '', nav = typeof navigator === 'undefined' ? null : navigator, win = typeof window === 'undefined' ? null : window } = {}) {
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !win || typeof win.File !== 'function') return 'unavailable';
    let file;
    try {
        file = new win.File([blob], name, { type: blob.type });
    } catch (e) {
        return 'unavailable';
    }
    const data = { files: [file], title, text };
    let ok = false;
    try {
        ok = nav.canShare(data);
    } catch (e) {
        ok = false;
    }
    if (!ok) return 'unavailable';
    try {
        await nav.share(data);
        return 'shared';
    } catch (e) {
        return e && e.name === 'AbortError' ? 'cancelled' : 'unavailable';
    }
}

/** Whether this browser could hand a file of `type` to the share sheet,
 *  to name the button Share or Save before it is pressed. */
export function canShareFiles(type, { nav = typeof navigator === 'undefined' ? null : navigator, win = typeof window === 'undefined' ? null : window } = {}) {
    if (!nav || typeof nav.canShare !== 'function' || !win || typeof win.File !== 'function') return false;
    try {
        return Boolean(nav.canShare({ files: [new win.File([''], `probe.${extensionFor(type)}`, { type })] }));
    } catch (e) {
        return false;
    }
}

/** Save a file through a download link. Returns true when it was offered. */
export function saveFile(url, name, { doc = typeof document === 'undefined' ? null : document } = {}) {
    if (!doc || !url) return false;
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    return true;
}
