// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * files.js - Handing the visitor a file, and reading one they chose.
 *
 * Both stay inside the page. A download is a Blob made here and offered
 * through a temporary link, and a restore reads the chosen file's text in
 * the browser. Nothing is uploaded, and nothing is fetched.
 */

/** Offer `text` as a file called `filename`. Returns true when offered. */
export function download(filename, text, type = 'application/json') {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked a beat later: Safari starts the download after the click
    // returns, and a revoked URL gives it nothing to save.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}

/** The text of a file the visitor chose, or null if it cannot be read. */
export async function readText(file) {
    if (!file) return null;
    try {
        if (typeof file.text === 'function') return await file.text();
    } catch (e) {
        return null;
    }
    return null;
}
