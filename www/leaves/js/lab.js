// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * lab.js - which leaf count and options a QA host runs with, from the
 * address. The lab's panel and readout were removed at Steve's QA of
 * 2026-10-08 ("I think we're set on the current settings"), and the address
 * options kept, with no visible panel: they are how Steve tries the finish
 * in a short round, and how the page tests do.
 *
 * A PHONE IS NOT LOCALHOST. Steve's phone reaches the Mac over the house
 * network at an address like 192.168.1.20, so the private ranges (and a
 * .local name) count as a QA host too, the rule Tornado Alley's performance
 * pass settled on (www/tornado/js/perf.js). The address options only work
 * on a QA host.
 *
 * THE ADDRESS CARRIES THE SETTINGS, so a reload keeps them and a screenshot
 * of the address bar says what was measured:
 *   ?leaves=24000    how many leaves (clamped to the config's range)
 *   ?shadows=0       the sun's shadows off
 *   ?ratio=1         a pixel ratio cap below the device's own
 *   ?finds=1         every find out on the lawn from the start (M6), to
 *                    look at them without hunting for them
 *   ?halloween=1     Halloween week whatever the date (or 0 for none),
 *                    read by halloween.js
 *   ?clock=30        a round this many seconds long (5 to 600), to try the
 *                    finish without the whole five minutes (2026-10-08)
 *   ?clean=1         no buttons, HUD, toasts or aim ring over the yard, for
 *                    capturing the social card (2026-10-09). The welcome
 *                    and end cards still show
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
 *  { count, shadows, ratio, finds, clock, clean }. `ratio` is null unless one is
 *  asked for, and `clock` is the round's length in seconds. */
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
    let clock = config.round.seconds;
    const c = params.get('clock');
    if (c !== null && /^\d+$/.test(c)) clock = Math.min(600, Math.max(5, Number(c)));
    return { count, shadows, ratio, finds: params.get('finds') === '1', clock, clean: params.get('clean') === '1' };
}

/** 24000 as "24k", 1500 as "1.5k", 800 as "800". */
export function shortCount(n) {
    if (n < 1000) return String(Math.round(n));
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

