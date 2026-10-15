// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * visit.js - The visit as the cleaner marks it (PRD 12.3 and 12.4, PLANNING
 * 8.1): every task Done, or Skipped with a reason, saved on the device as
 * they go.
 *
 * OUTCOMES, NEVER A TIMELINE. Cleaners mark tasks as they go, or all at the
 * end, in any order, so a mark is what happened and nothing else: no time,
 * no order, nothing a report could read as how long a room took (PRD 12.4).
 *
 * A SKIP SAYS WHY: one of a few quick reasons (`SKIP_REASONS`), or a few
 * words of the cleaner's own. Skipped work is never charged (PRD 9.3), so
 * the customer is owed the reason.
 *
 * Progress is a plain object, `{ marks: { [itemId]: mark } }`, each mark
 * `{ status: 'done' }` or `{ status: 'skipped', reason, words }`. Pure:
 * every function returns a new object.
 *
 * THE REPORT (M5 piece 2, `buildReport`): every task as it was marked, an
 * unmarked one "not reached"; every add-on as the customer answered it, one
 * still waiting lapsed, and an approved one done only when marked done.
 */

import { REPORT_FORMAT, cleanReport, cleanMinutes } from '../../js/report.min.js';

/** The quick reasons a task was skipped, in the order offered. */
export const SKIP_REASONS = Object.freeze(['no-time', 'no-access', 'already-clean', 'customer-asked']);

/** The most a cleaner's own words for a skip may run to. */
export const WORDS_MAX = 120;

/** No marks yet. */
export function emptyProgress() {
    return { marks: {} };
}

/** A mark as given, made safe, or null when it says nothing usable. */
export function cleanMark(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.status === 'done') return { status: 'done' };
    if (raw.status !== 'skipped') return null;
    const reason = SKIP_REASONS.includes(raw.reason) ? raw.reason : null;
    const words = String(raw.words || '').replace(/\s+/g, ' ').trim().slice(0, WORDS_MAX);
    // A skip with neither a reason nor words is not yet a skip.
    if (!reason && !words) return null;
    return { status: 'skipped', reason, words };
}

/** Progress read back from the device, made safe: unknown shapes dropped. */
export function cleanProgress(raw) {
    const out = emptyProgress();
    const marks = raw && typeof raw === 'object' && raw.marks && typeof raw.marks === 'object' ? raw.marks : {};
    for (const [id, mark] of Object.entries(marks)) {
        const clean = cleanMark(mark);
        if (clean) out.marks[id] = clean;
    }
    return out;
}

/**
 * Mark a task: `mark` as cleanMark takes it, or null to clear it. Returns
 * new progress; the same progress when the mark says nothing usable.
 */
export function applyMark(progress, itemId, mark) {
    const marks = { ...((progress && progress.marks) || {}) };
    if (mark === null) {
        delete marks[itemId];
        return { marks };
    }
    const clean = cleanMark(mark);
    if (!clean) return progress || emptyProgress();
    marks[itemId] = clean;
    return { marks };
}

/**
 * Where the visit stands, over the checklist's own tasks only (a mark for a
 * task since taken off the checklist does not count): `{ total, done,
 * skipped, toGo, starred, starredDone, starredSkipped, starredToGo }`.
 */
export function summarize(form, progress) {
    const marks = (progress && progress.marks) || {};
    const items = (form && form.items) || [];
    const out = { total: items.length, done: 0, skipped: 0, toGo: 0, starred: 0, starredDone: 0, starredSkipped: 0, starredToGo: 0 };
    for (const item of items) {
        const mark = marks[item.id];
        if (mark && mark.status === 'done') out.done++;
        else if (mark && mark.status === 'skipped') out.skipped++;
        else out.toGo++;
        if (item.important) {
            out.starred++;
            if (!mark) out.starredToGo++;
            else if (mark.status === 'done') out.starredDone++;
            else out.starredSkipped++;
        }
    }
    return out;
}

/**
 * The visit report (PRD 11.7) from the published checklist (`form`), the
 * marks, the add-ons as last known here, and what the cleaner added
 * (`{ cleaner, minutesOnSite, note }`), sent at `at` (an ISO string). Made
 * safe (report.js `cleanReport`), or null for a form with no id.
 */
export function buildReport(form, progress, addOns, { cleaner = '', minutesOnSite = null, note = '' } = {}, at = null) {
    const marks = (progress && progress.marks) || {};
    const results = ((form && form.items) || []).map((item) => {
        const mark = marks[item.id];
        if (mark && mark.status === 'done') return { itemId: item.id, status: 'done' };
        if (mark && mark.status === 'skipped') return { itemId: item.id, status: 'skipped', reason: mark.reason, words: mark.words };
        return { itemId: item.id, status: 'not-reached' };
    });
    const outcomes = (addOns || []).map((a) => ({
        ...a,
        status: a.status === 'approved' || a.status === 'declined' ? a.status : 'lapsed',
        done: a.status === 'approved' && Boolean(marks[a.id] && marks[a.id].status === 'done')
    }));
    const b = form && form.booking;
    return cleanReport({
        format: REPORT_FORMAT,
        id: form && form.id,
        booking: b ? { date: b.date, time: b.time } : null,
        cleaner,
        submittedAt: at,
        minutesOnSite: cleanMinutes(minutesOnSite),
        note,
        results,
        addOns: outcomes
    }, form && form.id);
}

/** Which booked visit a report or a pass belongs to, as a key: the date and
 *  time, or '' with none. A new booking is a new visit (main.js). */
export function visitKeyOf(form) {
    const b = form && form.booking;
    return b && b.date && b.time ? `${b.date} ${b.time}` : '';
}
