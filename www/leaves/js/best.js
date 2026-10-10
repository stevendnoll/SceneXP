// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * best.js - the visitor's fastest time to clear the lawn (Steve's QA,
 * 2026-10-08: "The goal is for the user to finish, not for it to be super
 * challenging. If they want to speed run they can always try to beat their
 * best score").
 *
 * WHAT IS KEPT: only the seconds a timed round took to clear the lawn, in
 * this browser's local storage, never sent anywhere. A round the clock ran
 * out on keeps nothing. "Forget my best time" on the welcome card clears it
 * (privacy.html says so).
 *
 * ONE BEST FOR EACH LEAF COUNT. A visitor only ever plays their device's
 * count, but the lab (?leaves=600 on a QA host) plays a much smaller yard,
 * and a test run must never set a record no real yard could beat.
 *
 * The copy lives here, so the house style is tested with it.
 */
import { clockText } from './score.min.js';

export const BEST_KEY = 'leaves-best';

/** Whatever was stored, as { [count]: seconds }, keeping only sensible
 *  entries (a whole count, a time over a second). */
export function normalizeBests(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
        if (/^\d+$/.test(k) && Number.isFinite(v) && v >= 1 && v < 100000) out[k] = Math.round(v);
    }
    return out;
}

function readAll() {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BEST_KEY) : null;
        return normalizeBests(raw ? JSON.parse(raw) : null);
    } catch (e) {
        return {};
    }
}

/** The best time in seconds for a yard of `count` leaves, or null. */
export function loadBest(count) {
    const all = readAll();
    return all[String(count)] ?? null;
}

/**
 * A timed round cleared the lawn of `count` leaves in `seconds`: kept if it
 * is the first or the fastest. Returns { best, previous, isNew }, `best`
 * the best now, `previous` the one before (null for a first clear).
 */
export function recordBest(count, seconds) {
    const all = readAll();
    const key = String(count);
    const previous = all[key] ?? null;
    const time = Math.max(1, Math.round(seconds));
    const isNew = previous === null || time < previous;
    if (isNew) {
        all[key] = time;
        try {
            localStorage.setItem(BEST_KEY, JSON.stringify(all));
        } catch (e) {
            // Storage refused: the time still counts for this visit's card.
        }
    }
    return { best: isNew ? time : previous, previous, isNew };
}

/** "Forget my best time": nothing kept, for any count. Returns whether it
 *  worked. */
export function forgetBest() {
    try {
        localStorage.removeItem(BEST_KEY);
        return true;
    } catch (e) {
        return false;
    }
}

/** The welcome card's line, or '' with no best yet. */
export function bestWelcomeLine(best) {
    return best ? `Your best time to clear the lawn is ${clockText(best)}. Can you beat it?` : '';
}

/**
 * The end card's line: after a clear, whether it was a first, a new best or
 * short of it, and after a round the clock ran out on, the best to aim for
 * (or nothing with none yet). `record` is recordBest's answer, or null.
 */
export function bestEndLine(record, best) {
    if (record) {
        if (record.previous === null) return `Your first clear, in ${clockText(record.best)}. Now you have a time to beat.`;
        if (record.isNew) return `A new best time, ${clockText(record.best)}, down from ${clockText(record.previous)}.`;
        return `Your best time is still ${clockText(record.best)}.`;
    }
    return best ? `Your best time to clear the lawn is ${clockText(best)}.` : '';
}

/** What the share sentence adds for a new best that beat an old one. */
export function bestShareNote(record) {
    return record && record.isNew && record.previous !== null ? 'a new personal best' : '';
}
