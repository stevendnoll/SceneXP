// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * telemetry.js - What X's and O's tells the site's usage log.
 *
 * THE SHARED PART SENDS THE PING, THIS FILE DECIDES WHAT IS IN IT. Every other
 * scene calls `track` from www/shared/js/telemetry-1.0.0.js directly, and this
 * one does too in the end. What it adds is the shape of the detail.
 *
 * ---- WHY THE DETAIL RIDES IN `outcome` ----
 *
 * The production log (specs/nginx-config.txt, `log_format scenexp_api`) writes
 * exactly twelve fields: time, method, scene, action, mobile, lang, hash, kind,
 * outcome, seconds, saved and destroyed. ANY OTHER PARAMETER IS DROPPED ON THE
 * FLOOR without a word, which is already true of several scenes' extras. So a
 * play's detail is written as ONE query string, in the 2D game's own shape,
 *
 *     defense=cover3&offense=pass2&orientation=landscape&points=15&result=catch&...
 *
 * and sent as the value of `outcome`. The 2D game at exesnohs.com logged these
 * same fields to its own /api/index.html, so the two games' records line up.
 * nginx does not decode `$arg_outcome`, so the log holds it percent-encoded:
 * decode it once and it parses as an ordinary query string.
 *
 * `kind` carries the one short word worth counting without parsing anything
 * (the result of a play, the level of a show), and `seconds` a duration.
 *
 * ---- WHAT IS DELIBERATELY NOT CARRIED OVER ----
 *
 * The 2D game also sent the window's exact `width` and `height`, a timestamp,
 * and a `Site-Client-Id` header built from twenty browser properties. The first
 * and last are fingerprinting, which www/privacy.html promises this site does
 * not do: `orientation` is the useful part of the size, and the shared part's
 * proof-of-work `hash` already ties one visit's hits together for a day. The
 * timestamp is nginx's own `time`.
 *
 * ---- AND IT MUST NEVER COST THE GAME ANYTHING ----
 *
 * The shared part is already fire-and-forget and swallows its own errors. The
 * one thing it cannot do is know that nginx drops a visitor past two requests a
 * second (burst 20), so the two controls somebody can press as fast as they
 * like are throttled here: a view switch or a sound toggle is reported at most
 * once a second, rather than trimmed away by the rate limit.
 */
import { track, trackFinal } from '../../shared/js/telemetry-1.0.0.min.js';
import { XO_CONFIG as CFG } from './config.min.js';

/**
 * A set of fields as one query string, in the order given, skipping anything
 * with nothing to say. `false` and `0` are kept: "muted=false" and "points=0"
 * are answers, not blanks.
 */
export function outcomeString(fields = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null || value === '') continue;
        query.append(key, String(value));
    }
    return query.toString();
}

/** Which way the screen is held, which is all the size a play needs to say. */
export function orientationOf(width, height) {
    return width >= height ? 'landscape' : 'portrait';
}

const lastSent = new Map();

/**
 * Whether `action` may be sent at `now` (milliseconds). Pure apart from the map
 * it is handed, which is the module's own unless a test brings one.
 */
export function mayReport(action, now, sent = lastSent, throttle = CFG.telemetry.throttleMs) {
    const gap = throttle[action];
    if (!gap) return true;
    const last = sent.get(action);
    if (last !== undefined && now - last < gap) return false;
    sent.set(action, now);
    return true;
}

/**
 * The query parameters for one hit: `kind`, `outcome` and `seconds`, each only
 * when there is something in it. Seconds keep one decimal, because how long
 * somebody held the ball before throwing it is a question about tenths.
 */
export function beaconParams({ kind, outcome, seconds } = {}) {
    const params = {};
    if (kind !== undefined && kind !== null && kind !== '') params.kind = String(kind);
    const detail = outcome && typeof outcome === 'object' ? outcomeString(outcome) : '';
    if (detail) params.outcome = detail;
    if (Number.isFinite(seconds)) params.seconds = String(Math.round(seconds * 10) / 10);
    return params;
}

/** Report one thing the visitor did. Returns whether it was sent. */
export function report(action, detail = {}, now = Date.now()) {
    if (!mayReport(action, now)) return false;
    track(action, beaconParams(detail));
    return true;
}

/** The same, for a page on its way out, where an image ping gets cancelled. */
export function reportFinal(action, detail = {}) {
    trackFinal(action, beaconParams(detail));
}

/**
 * THE 2D GAME'S PLAY RECORD, field for field and in its order: the play called,
 * how it ended, what it was worth, and the state of the game after it.
 *
 * `result` is `classifyPlay`'s slug, which is the 2D game's vocabulary with its
 * `-result` suffix dropped (catch, incomplete, interception, run, run-50) plus
 * `sack`, which the 2D game did not have. `expired` appears only when a sack
 * was the play clock rather than a defender.
 */
export function playRecord({
    defense, offense, orientation, points, result, throwTo,
    currentScore, playCount, muted, games, expired = false,
}) {
    return {
        defense, offense, orientation, points, result, throwTo,
        currentScore, playCount, muted, games,
        ...(expired ? { expired: true } : {}),
    };
}
