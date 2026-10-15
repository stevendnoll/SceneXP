// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * report.js - The visit report as both sides read it (PRD 11.7, 12.4 and
 * 9.6, PLANNING 10.3 and 10.4): what it holds, how it is made safe, what it
 * bills, and how it is sent.
 *
 * OUTCOMES, NEVER A TIMELINE. A report says what became of every task
 * (done, skipped with why, or not reached) and of every add-on (approved,
 * declined, or lapsed with no answer, and whether an approved one was
 * done). Nothing in it says when or in what order: time on site appears
 * only when the cleaner enters it.
 *
 * THE REPORT IS THE BILL, recomputed by every reader from the sheet the
 * quote was locked on (pricing.js `billVisit`): tasks done, approved
 * add-ons done, and the quote's agreed minimum top-up only when something
 * was done. Skipped and not-reached work is never charged.
 *
 * WRITTEN ONCE. The cleaner sends it sealed with the checklist's key under
 * its own context (seal.js `report`, named by the visit), and the API keeps
 * the first and refuses the rest. A correction is a new visit's report.
 *
 * Pure, apart from `sendReport`, which takes the API and the sealer as
 * arguments.
 */

import { billVisit } from './pricing.min.js';
import { contextFor } from './seal.min.js';
import { ID } from './links.min.js';
import { cleanProposal } from './addons.min.js';

export const REPORT_FORMAT = 1;

/** What became of a task, and of an add-on. */
export const RESULTS = Object.freeze(['done', 'skipped', 'not-reached']);
export const ADDON_RESULTS = Object.freeze(['approved', 'declined', 'lapsed']);

/** How much a report may say (PRD 11.7). */
export const REPORT_LIMITS = Object.freeze({ cleaner: 40, note: 500, words: 120, reason: 40, minMinutes: 15, maxMinutes: 960, results: 400, addOns: 20 });

const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const stamp = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null);

/** Time on site as entered, kept to whole minutes in the report's range, or
 *  null when none was given. */
export function cleanMinutes(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return Math.min(REPORT_LIMITS.maxMinutes, Math.max(REPORT_LIMITS.minMinutes, n));
}

/** One task's result made safe, or null. */
function cleanResult(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.itemId !== 'string' || !raw.itemId || !RESULTS.includes(raw.status)) return null;
    if (raw.status !== 'skipped') return { itemId: raw.itemId.slice(0, 64), status: raw.status };
    return { itemId: raw.itemId.slice(0, 64), status: 'skipped', reason: text(raw.reason, REPORT_LIMITS.reason) || null, words: text(raw.words, REPORT_LIMITS.words) };
}

/** One add-on's outcome made safe: its proposal's choices, what became of
 *  it, and whether it was done (only an approved one can be). */
function cleanAddOnResult(raw) {
    const proposal = cleanProposal(raw);
    if (!proposal || !ADDON_RESULTS.includes(raw.status)) return null;
    return { ...proposal, status: raw.status, done: raw.status === 'approved' && raw.done === true };
}

/**
 * A report as it is sealed and read back, made safe field by field:
 * `{ format, id, booking, cleaner, submittedAt, minutesOnSite, note,
 * results, addOns, bill }`, or null. `id` the published checklist's, which
 * must match. A task or add-on listed twice counts once.
 */
export function cleanReport(raw, id) {
    if (!raw || typeof raw !== 'object' || raw.format !== REPORT_FORMAT || raw.id !== id || !ID.test(String(id))) return null;
    const results = [];
    const seen = new Set();
    for (const r of (Array.isArray(raw.results) ? raw.results : []).slice(0, REPORT_LIMITS.results)) {
        const clean = cleanResult(r);
        if (!clean || seen.has(clean.itemId)) continue;
        seen.add(clean.itemId);
        results.push(clean);
    }
    const addOns = [];
    for (const a of (Array.isArray(raw.addOns) ? raw.addOns : []).slice(0, REPORT_LIMITS.addOns)) {
        const clean = cleanAddOnResult(a);
        if (!clean || seen.has(clean.id)) continue;
        seen.add(clean.id);
        addOns.push(clean);
    }
    const b = raw.booking;
    return {
        format: REPORT_FORMAT,
        id,
        booking: b && /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) && /^\d{2}:\d{2}$/.test(String(b.time)) ? { date: b.date, time: b.time } : null,
        cleaner: text(raw.cleaner, REPORT_LIMITS.cleaner),
        submittedAt: stamp(raw.submittedAt),
        minutesOnSite: cleanMinutes(raw.minutesOnSite),
        note: text(raw.note, REPORT_LIMITS.note),
        results,
        addOns
    };
}

/**
 * What a report bills (PRD 9.6), from the sheet the quote was locked on:
 * `{ doneCents, addOnCents, topUpCents, billedCents, quoteCents, errors }`,
 * or null without that sheet. `form` the published checklist the cleaner
 * worked from, `quote` its locked quote.
 */
export function reportBill(sheet, quote, form, report) {
    if (!sheet || !quote || !report || quote.sheetVersion !== sheet.version) return null;
    const bill = billVisit(sheet, quote, form, { results: report.results, addOns: report.addOns });
    return { ...bill, quoteCents: quote.totalCents };
}

/** Where the visit stands in a report: `{ done, skipped, notReached }`. */
export function reportCounts(report) {
    const out = { done: 0, skipped: 0, notReached: 0 };
    for (const r of (report && report.results) || []) {
        if (r.status === 'done') out.done++;
        else if (r.status === 'skipped') out.skipped++;
        else out.notReached++;
    }
    return out;
}

/**
 * Send a report, sealed (PLANNING 10.3): the visit started first if it has
 * not been (`visitId` null), then the report, once. Answered `exists`, the
 * report was already kept (a send whose answer was lost), which is as good
 * as sent. Resolves to `{ ok, visitId, error }`.
 */
export async function sendReport({ api, sealer, key, id, token, visitId = null, report }) {
    let visit = visitId;
    if (!visit) {
        const started = await api.startVisit(id, token);
        if (!started.ok) return { ok: false, visitId: null, error: started.error };
        visit = started.data.visitId;
    }
    const clean = cleanReport(report, id);
    if (!clean) return { ok: false, visitId: visit, error: 'bad-request' };
    const sealed = await sealer.sealJson(key, clean, contextFor(id, 'report', visit));
    const put = await api.putReport(id, token, visit, sealed);
    if (!put.ok && put.error !== 'exists') return { ok: false, visitId: visit, error: put.error };
    return { ok: true, visitId: visit, error: null };
}
