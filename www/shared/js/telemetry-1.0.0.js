// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * telemetry.js - Lightweight, fire-and-forget usage telemetry.
 *
 * As the visitor interacts with the 3D environment (entering/leaving the
 * gallery, clicking pieces, greeting people, finding easter eggs, …) we ping a
 * static `api.html` with the details encoded as URL query parameters, e.g.
 *
 *     api.html?action=leave-store&timestamp=1718995200000&scene=interstate&lang=en-US&hash=11a3f…
 *
 * There is no backend: the request only needs to land in the web server's
 * access log. A separate log parser can later reconstruct a timeline of a
 * visitor's session by grouping these hits by `hash` (the proof-of-work digest,
 * which persists across reloads for up to 24h) and ordering by `timestamp`.
 *
 * The ping is sent with an Image beacon: it is fire-and-forget, needs no CORS
 * or fetch handling, never blocks the render loop, and fails silently when the
 * visitor is offline. Telemetry must never affect the experience, so every call
 * is wrapped so a failure here can't throw into the caller.
 */

const ENDPOINT = '../api.html';

// The browser's preferred UI language (e.g. 'en-US'), captured once. Sent on
// every ping so the log can show the rough language mix of visitors. Falls back
// to an empty string on the rare browser that doesn't expose navigator.language.
const LANG = (typeof navigator !== 'undefined' && navigator.language) || '';

// The experience folder this page is served from (e.g. 'interstate' for a
// page at /interstate/ or /interstate/index.html), captured once. Sent on
// every ping as `scene=` so the access log can split traffic by experience
// without any per-experience configuration. Empty (and omitted) when the
// page has no folder or location is unavailable.
const SCENE = (() => {
    try {
        const parts = window.location.pathname.split('/').filter(Boolean);
        // Drop a trailing document name (index.html, …); keep the folder.
        if (parts.length && parts[parts.length - 1].includes('.')) parts.pop();
        return parts[parts.length - 1] || '';
    } catch (e) {
        return '';
    }
})();

// The solved proof-of-work hash, set once at startup (see setProofHash). It
// rides along on every ping so the access log can stitch a visitor's hits into
// one ordered timeline: the hash persists across reloads for up to 24h
// (sessionStorage), making it a durable-enough session identifier on its own.
let _proofHash = null;

/**
 * Record the solved proof-of-work hash so it's appended to every subsequent
 * ping as `&hash=…`. Call once during startup; pings before this simply omit
 * the param.
 */
export function setProofHash(hash) {
    _proofHash = hash || null;
}

// Whether the visitor is on a touch/mobile device, set once at startup. Sent on
// every ping so the log can split mobile vs non-mobile usage.
let _isMobile = false;

/** Record whether this is a touch/mobile device; appended to every ping as
 *  `&mobile=true|false`. Call once during startup. */
export function setMobile(isMobile) {
    _isMobile = !!isMobile;
}

/**
 * Fire a fire-and-forget GET to api.html describing one interaction.
 *
 * @param {string} action  short kebab-case verb, e.g. 'open-piece', 'leave-store'
 * @param {object} [params] extra string/number params to append (id, kind, …)
 */
function buildUrl(action, params) {
    const query = new URLSearchParams({
        action,
        timestamp: Date.now(),
        mobile: _isMobile,
        ...(SCENE ? { scene: SCENE } : {}),
        ...(LANG ? { lang: LANG } : {}),
        ...(_proofHash ? { hash: _proofHash } : {}),
        ...params
    });
    return `${ENDPOINT}?${query.toString()}`;
}

export function track(action, params = {}) {
    try {
        // Assigning .src issues the GET immediately; we keep no reference, so the
        // Image is collected once the (ignored) response settles.
        new Image().src = buildUrl(action, params);
    } catch (e) {
        // Telemetry is best-effort: never let a logging hiccup reach the caller.
    }
}

/**
 * Like track, but for page-teardown events (e.g. session-end). Uses
 * navigator.sendBeacon, which reliably delivers while the page is unloading —
 * where an Image beacon usually gets cancelled. sendBeacon issues a POST, so
 * this single hit appears in the access log as `POST /api.html?...`; the query
 * parameters are identical and parse the same way. Falls back to the image
 * beacon when sendBeacon is unavailable.
 */
export function trackFinal(action, params = {}) {
    try {
        const url = buildUrl(action, params);
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
            && navigator.sendBeacon(url)) {
            return;
        }
        new Image().src = url;
    } catch (e) {
        // best-effort
    }
}
