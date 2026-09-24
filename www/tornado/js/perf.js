// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * perf.js - what Tornado Alley's performance pass (M7, 2026-09-24) needs from
 * a phone: a way to reach the QA hooks from one, and a readout to photograph.
 *
 * A PHONE IS NOT LOCALHOST. The QA hooks install only on a local server, and
 * a phone opening Steve's Mac over the house network sees an address like
 * 192.168.1.20, so it got none of them. The private network ranges (and a
 * .local name) are reachable only from inside that network, never from the
 * public site, so they count as local here. The shared player's own rule is
 * left as it is.
 *
 * THE READOUT IS OPT-IN TWICE: a QA host AND `?stats` on the address, so a
 * screenshot pass on the Mac never catches it by accident. `?shells=n` on a
 * QA host sets how many funnel layers draw, for comparing a phone at 3 and 4.
 *
 * PURE, so all of it is tested without a browser; main.js does the wiring.
 */

/** Whether the page is served from this machine or the house network. */
export function isQaHost(location = (typeof window !== 'undefined' ? window.location : null)) {
    if (!location) return false;
    const host = String(location.hostname || '');
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '') return true;
    if (/\.local$/i.test(host)) return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/** What the address asks for: { stats, shells }. `shells` is null unless it
 *  names a whole number of layers from 0 to `maxShells`. */
export function qaOptions(search, maxShells) {
    const params = new URLSearchParams(search || '');
    let shells = null;
    // Digits only: Number('') is 0, and an empty ?shells= is not a request
    // for no funnel.
    const raw = params.get('shells');
    if (raw !== null && /^\d+$/.test(raw)) {
        const n = Number(raw);
        if (n <= maxShells) shells = n;
    }
    return { stats: params.has('stats'), shells };
}

/** Frames per second over a window of `frames` frames taking `seconds`. */
export function fpsOf(frames, seconds) {
    return seconds > 0 ? frames / seconds : 0;
}

/** The readout's lines, from what main.js measured. */
export function statsLines({ fps, arc, readout, calls, triangles, shells, width, height }) {
    const px = `${Math.round(width * readout.ratio)} x ${Math.round(height * readout.ratio)}`;
    return [
        `${fps.toFixed(1)} fps · ${readout.frameMs.toFixed(1)} ms (best ${Number.isFinite(readout.bestMs) ? readout.bestMs.toFixed(1) : '-'})`,
        `ratio ${readout.ratio.toFixed(2)} of ${readout.ceiling.toFixed(2)} · ${px} px`,
        `${calls} draws · ${Math.round(triangles / 1000)}k tris · ${shells} shells · t ${arc.toFixed(1)}`
    ];
}
