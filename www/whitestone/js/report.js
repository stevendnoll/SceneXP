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
 * THE CUSTOMER'S ANSWERS WIN (M5 piece 3, `settleReport`). The report says
 * what the cleaner knew of each add-on; the customer's page goes by the
 * answers it gave itself (sealed by its own key, read back from the API),
 * so an add-on the customer never approved is never billed, whatever a
 * report says.
 *
 * Pure, apart from `sendReport` and `readVisits`, which take the API and
 * the sealer as arguments.
 */

import { billVisit, priceItem, formatMoney } from './pricing.min.js';
import { contextFor } from './seal.min.js';
import { ID } from './links.min.js';
import { visitKey } from './schedule.min.js';
import { cleanProposal, fetchAddOns, addOnName, priceOf } from './addons.min.js';
import { taskOf } from './sheet.min.js';
import { roomName } from './taxonomy.min.js';
import { REPORT as WORDS } from './copy.min.js';

export const REPORT_FORMAT = 1;

/** What became of a task, and of an add-on. */
export const RESULTS = Object.freeze(['done', 'skipped', 'not-reached']);
export const ADDON_RESULTS = Object.freeze(['approved', 'declined', 'lapsed']);

/** How much a report may say (PRD 11.7). */
export const REPORT_LIMITS = Object.freeze({ cleaner: 40, note: 500, words: 120, reason: 40, minMinutes: 15, maxMinutes: 960, results: 400, addOns: 20, photos: 2 });

const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const stamp = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null);

/** Time on site as entered, kept to whole minutes in the report's range, or
 *  null when none was given. */
export function cleanMinutes(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return Math.min(REPORT_LIMITS.maxMinutes, Math.max(REPORT_LIMITS.minMinutes, n));
}

/** A result's proof photos (PRD 11.7, "after" shots): ids of the API's
 *  shape, each once, at most two. */
function cleanPhotos(raw) {
    return [...new Set((Array.isArray(raw) ? raw : []).filter((p) => ID.test(String(p))))].slice(0, REPORT_LIMITS.photos);
}

/** One task's result made safe, or null; its photos only when it has any. */
function cleanResult(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.itemId !== 'string' || !raw.itemId || !RESULTS.includes(raw.status)) return null;
    const out = raw.status !== 'skipped'
        ? { itemId: raw.itemId.slice(0, 64), status: raw.status }
        : { itemId: raw.itemId.slice(0, 64), status: 'skipped', reason: text(raw.reason, REPORT_LIMITS.reason) || null, words: text(raw.words, REPORT_LIMITS.words) };
    const photos = cleanPhotos(raw.photos);
    return photos.length ? { ...out, photos } : out;
}

/** Every proof photo a report names, each once. */
export function proofIdsOf(report) {
    return [...new Set(((report && report.results) || []).flatMap((r) => r.photos || []))];
}

/** The seal context's name for a proof's thumbnail. */
const thumbName = (photoId) => `${photoId}-thumb`;

/**
 * One proof photo sent, sealed, before the report that names it (PLANNING
 * 9.2 `proof`): the full size, then its thumbnail. `full` and `thumb` as
 * bytes. `{ ok, error }`; `exists` counts as sent.
 */
export async function sendProof({ api, sealer, key, id, token, visitId, photoId, full, thumb }) {
    const one = async (bytes, name, put) => {
        const r = await put(id, token, visitId, photoId, await sealer.seal(key, bytes, contextFor(id, 'proof', name)));
        return r.ok || r.error === 'exists' ? null : r.error;
    };
    const error = (await one(full, photoId, api.putProof)) || (await one(thumb, thumbName(photoId), api.putProofThumb));
    return { ok: !error, error: error || null };
}

/**
 * A report's proof photos for the customer, opened with the key: `[{
 * photoId, full, thumb }]`, bytes, leaving out any that will not come or
 * will not open.
 */
export async function fetchProofs({ api, sealer, key, id, token, visitId, report }) {
    const out = [];
    for (const photoId of proofIdsOf(report)) {
        try {
            const full = await api.getProof(id, token, visitId, photoId);
            const thumb = await api.getProofThumb(id, token, visitId, photoId);
            if (!full.ok || !thumb.ok) continue;
            out.push({
                photoId,
                full: await sealer.open(key, full.bytes, contextFor(id, 'proof', photoId)),
                thumb: await sealer.open(key, thumb.bytes, contextFor(id, 'proof', thumbName(photoId)))
            });
        } catch (e) {
            // One that will not open is left out.
        }
    }
    return out;
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

/**
 * A report as the customer's page reads it (M5 piece 3): each add-on by the
 * customer's own answer (`addOns`, as addons.js fetchAddOns reads them,
 * proposals and decisions), approved or declined, else lapsed, and done
 * only when approved and the cleaner marked it done. An add-on the report
 * names that the API does not have is left out; one the API has that the
 * report leaves out lapsed. Pure.
 */
export function settleReport(report, addOns) {
    if (!report) return null;
    const said = new Map((report.addOns || []).map((a) => [a.id, a]));
    const settled = (addOns || []).map((a) => {
        const status = a.status === 'approved' || a.status === 'declined' ? a.status : 'lapsed';
        const r = said.get(a.id);
        const proposal = cleanProposal(a);
        return proposal ? { ...proposal, status, done: status === 'approved' && Boolean(r && r.done) } : null;
    }).filter(Boolean);
    return { ...report, addOns: settled };
}

/**
 * Everything the customer's page asks after on a published checklist's
 * visits, in one look (PLANNING 10.4): the visit under way for `booking`
 * (the checklist's own, else none) as `started` `{ visitId, at }` (begun,
 * no report yet), with its add-ons in `open` (each with its `visitId`),
 * and every report not yet `known` here (visit ids), each opened with the
 * key, made safe and settled by the customer's own answers: `{ visitId,
 * reportAt, report }`. A visit begun under another booking (one since
 * cancelled or moved) shows nothing (QA, 2026-10-15: its add-ons stayed
 * "waiting"). `token` the owner token. `{ ok, started, open, reports,
 * error }`; a report that will not open is left out, to be tried again.
 */
export async function readVisits({ api, sealer, key, id, token, known = [], booking = null }) {
    const got = await api.listVisits(id, token);
    const none = { started: null, open: [], reports: [] };
    if (!got.ok) return { ok: false, ...none, error: got.error };
    const visits = (got.data && Array.isArray(got.data.visits) ? got.data.visits : []).filter((v) => v && ID.test(String(v.visitId)));
    const current = visitKey(booking);
    let started = null;
    const open = [];
    const reports = [];
    for (const v of visits) {
        const isNew = v.reportAt && !known.includes(v.visitId);
        if (v.reportAt && !isNew) continue;
        const under = !v.reportAt && Boolean(current) && v.booking === current;
        if (!v.reportAt && !under) continue;
        const a = await fetchAddOns({ api, sealer, key, id, token, visitId: v.visitId });
        if (!a.ok) return { ok: false, ...none, error: a.error };
        if (under) {
            if (!started) started = { visitId: v.visitId, at: typeof v.createdAt === 'string' ? v.createdAt : null };
            open.push(...a.addOns.map((x) => ({ ...x, visitId: v.visitId })));
            continue;
        }
        const r = await api.getReport(id, token, v.visitId);
        if (!r.ok) continue;
        let report = null;
        try {
            report = cleanReport(await sealer.openJson(key, r.bytes, contextFor(id, 'report', v.visitId)), id);
        } catch (e) {
            report = null;
        }
        if (report) reports.push({ visitId: v.visitId, reportAt: v.reportAt, report: settleReport(report, a.addOns) });
    }
    return { ok: true, started, open, reports, error: null };
}

// ---- In words ----------------------------------------------------------------

/** Why a task was skipped: its quick reason, its own words, or both. */
export function skipWhy(mark) {
    if (!mark || mark.status !== 'skipped') return '';
    const reason = mark.reason ? WORDS.reasons[mark.reason] : '';
    return [reason, mark.words].filter(Boolean).join('. ');
}

/**
 * A report in lines to read, on either side: `{ skipped, notReached,
 * addOns }`. A task is `{ id, label, why, off }` (its name and room, why it
 * was skipped, and what it takes off the quote); one removed from the
 * checklist since is named as such. An add-on is `{ id, label, outcome,
 * money }`, `money` only for one done. Amounts are '' without the sheet.
 * `form` the published checklist.
 */
export function reportLines(sheet, form, report) {
    const items = new Map(((form && form.items) || []).map((i) => [i.id, i]));
    const rooms = new Map(((form && form.rooms) || []).map((r) => [r.id, roomName(form.serviceType, r)]));
    const task = (r) => {
        const item = items.get(r.itemId);
        if (!item) return { id: r.itemId, label: WORDS.removedSince, why: skipWhy(r), off: '' };
        const p = sheet ? priceItem(sheet, item, form.rooms) : { error: 'no-sheet' };
        const t = sheet ? taskOf(sheet, item.task) : null;
        const name = t ? t.name : item.task;
        return {
            id: r.itemId,
            label: rooms.has(item.roomId) ? WORDS.inTheRoom(name, rooms.get(item.roomId)) : name,
            why: skipWhy(r),
            off: p.error ? '' : WORDS.lineOff(formatMoney(p.cents))
        };
    };
    const results = (report && report.results) || [];
    return {
        skipped: results.filter((r) => r.status === 'skipped').map(task),
        notReached: results.filter((r) => r.status === 'not-reached').map(task),
        addOns: ((report && report.addOns) || []).map((a) => {
            const p = priceOf(sheet, form, a);
            const outcome = a.done ? 'done' : a.status;
            return { id: a.id, label: addOnName(sheet, form, a), outcome: WORDS.addOnOutcome[outcome], money: a.done && !p.error ? formatMoney(p.cents) : '' };
        })
    };
}

/** The bill in words: its line, then its parts, or that nothing is owed.
 *  `noSheet` the line when there is no bill to show. */
export function billLines(bill, noSheet = WORDS.billNoSheet) {
    if (!bill) return { line: noSheet, parts: [] };
    if (!bill.billedCents) return { line: WORDS.billNothing, parts: [] };
    const parts = [WORDS.billDone(formatMoney(bill.doneCents))];
    if (bill.addOnCents) parts.push(WORDS.billAddOns(formatMoney(bill.addOnCents)));
    if (bill.topUpCents) parts.push(WORDS.billMinimum(formatMoney(bill.topUpCents)));
    return { line: WORDS.billLine(formatMoney(bill.billedCents), formatMoney(bill.quoteCents)), parts };
}
