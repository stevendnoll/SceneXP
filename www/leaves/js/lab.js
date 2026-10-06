// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * lab.js - what the leaf lab needs to measure a phone: which leaf count and
 * which options to run with, and a readout to photograph.
 *
 * A PHONE IS NOT LOCALHOST. Steve's phone reaches the Mac over the house
 * network at an address like 192.168.1.20, so the private ranges (and a
 * .local name) count as a QA host too, the rule Tornado Alley's performance
 * pass settled on (www/tornado/js/perf.js). The lab panel only ever appears
 * on a QA host.
 *
 * THE ADDRESS CARRIES THE SETTINGS, so a reload keeps them and a screenshot
 * of the address bar says what was measured:
 *   ?leaves=24000    how many leaves (clamped to the config's range)
 *   ?shadows=0       the sun's shadows off
 *   ?ratio=1         a pixel ratio cap below the device's own
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

/** What the address asks for, with the device's defaults for the rest:
 *  { count, shadows, ratio }. `ratio` is null unless one is asked for. */
export function labOptions(search, config, mobile) {
    const L = config.leaves;
    const params = new URLSearchParams(search || '');
    let count = mobile ? L.mobile : L.desktop;
    const raw = params.get('leaves');
    // Digits only: Number('') is 0, and an empty ?leaves= is not a request
    // for an empty yard.
    if (raw !== null && /^\d+$/.test(raw)) {
        count = Math.min(L.maxCount, Math.max(L.minCount, Number(raw)));
    }
    let shadows = config.shadows.enabled;
    if (params.get('shadows') === '0') shadows = false;
    if (params.get('shadows') === '1') shadows = true;
    let ratio = null;
    const r = params.get('ratio');
    if (r !== null && /^\d+(\.\d+)?$/.test(r) && Number(r) >= 0.5 && Number(r) <= 3) ratio = Number(r);
    return { count, shadows, ratio };
}

/** The address for the same page with some settings changed. */
export function labSearch(search, changes) {
    const params = new URLSearchParams(search || '');
    Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === undefined) params.delete(key);
        else params.set(key, String(value));
    });
    const out = params.toString();
    return out ? `?${out}` : '';
}

/** 24000 as "24k", 1500 as "1.5k", 800 as "800". */
export function shortCount(n) {
    if (n < 1000) return String(Math.round(n));
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

/** The readout's lines, from what main.js measured over the last half second. */
export function statsLines(m) {
    const ms = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');
    return [
        `${m.fps.toFixed(1)} fps · frame ${ms(m.frameMs)} ms · sim ${ms(m.simMs)} ms`,
        `${shortCount(m.count)} leaves · ${m.active} moving · ${m.uploaded} sent`,
        `${m.calls} draws · ${Math.round(m.triangles / 1000)}k tris · ratio ${m.ratio.toFixed(2)} · shadows ${m.shadows ? 'on' : 'off'}`,
        `lawn ${Math.round(m.cleared * 100)}% clear · ${m.tarp} on the tarp`
    ];
}

/** Frames per second over a window of `frames` frames taking `seconds`. */
export function fpsOf(frames, seconds) {
    return seconds > 0 ? frames / seconds : 0;
}
