// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * addons.js - Add-ons as both sides read them (PRD 9.5, PLANNING 10.3 and
 * 10.4): what one is, what it is called, what it costs, and where it stands.
 *
 * APPROVAL, NEVER SURPRISE BILLS. The cleaner proposes an add-on on site
 * (tasks/js/addons.js): a task the room does not have yet (Oven interior),
 * or an upgrade of one it does (Deep clean on the stovetop). The customer
 * approves or declines it, once, from the studio (M5). Until approved it is
 * neither done nor charged.
 *
 * A PROPOSAL CARRIES CHOICES, NEVER PRICES, as checklist items do: each
 * side prices it from the sheet the quote was locked on (pricing.js
 * `priceAddOn`), so a figure changed on the way is caught.
 *
 * SEALED BOTH WAYS. A proposal and its decision are sealed with the
 * checklist's key under their own contexts (seal.js `addon`, `decision`),
 * so the server holds neither the words nor the choice.
 *
 * Pure, apart from `fetchAddOns`, `openAddOns` and `decideAddOn`, which
 * take the API and the sealer as arguments.
 */

import { taskOf, optionOf } from './sheet.min.js';
import { priceAddOn, isLive } from './pricing.min.js';
import { contextFor, fromBase64url } from './seal.min.js';
import { ID } from './links.min.js';

export const ADDON_FORMAT = 1;

/** What a customer can say of an add-on. */
export const DECISIONS = Object.freeze(['approved', 'declined']);

/** The most a cleaner's few words to the customer may run to (the same as
 *  a skip's, tasks/js/visit.js). */
export const WORDS_MAX = 120;

const clip = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, WORDS_MAX);

/** An add-on in words: "Oven interior", or "Stovetop: Deep clean". */
export function addOnName(sheet, form, addOn) {
    if (addOn.itemId) {
        const item = ((form && form.items) || []).find((i) => i.id === addOn.itemId);
        const task = sheet && item ? taskOf(sheet, item.task) : null;
        const option = sheet ? optionOf(sheet, (addOn.options || [])[0]) : null;
        return `${task ? task.name : (item ? item.task : '')}: ${option ? option.name : (addOn.options || [])[0]}`;
    }
    const task = sheet ? taskOf(sheet, addOn.task) : null;
    return task ? task.name : addOn.task;
}

/** What one add-on adds, `{ cents, minutes }`, or `{ error }`: by the sheet,
 *  in the home as published. */
export function priceOf(sheet, form, addOn) {
    if (!sheet) return { error: 'no-sheet' };
    const items = new Map(((form && form.items) || []).filter(isLive).map((i) => [i.id, i]));
    return priceAddOn(sheet, addOn, (form && form.rooms) || [], items);
}

/**
 * A proposal as it is sealed and read back, made safe: a new task in a room
 * (`{ id, roomId, task, options, size, quantity, words }`) or an upgrade
 * (`{ id, itemId, options: [one], words }`), or null.
 */
export function cleanProposal(raw) {
    if (!raw || typeof raw !== 'object' || raw.format !== ADDON_FORMAT || !ID.test(String(raw.id))) return null;
    const words = clip(raw.words);
    const options = Array.isArray(raw.options) ? raw.options.filter((o) => typeof o === 'string') : [];
    if (typeof raw.itemId === 'string' && raw.itemId) {
        if (options.length !== 1) return null;
        return { format: ADDON_FORMAT, id: raw.id, itemId: raw.itemId, options, words };
    }
    if (typeof raw.roomId !== 'string' || !raw.roomId || typeof raw.task !== 'string' || !raw.task) return null;
    const out = { format: ADDON_FORMAT, id: raw.id, roomId: raw.roomId, task: raw.task, options, words };
    if (typeof raw.size === 'string') out.size = raw.size;
    if (Number.isInteger(raw.quantity)) out.quantity = raw.quantity;
    return out;
}

/** A decision made safe: `{ id, status, decidedAt }`, or null. */
export function cleanDecision(raw, id) {
    if (!raw || typeof raw !== 'object' || raw.format !== ADDON_FORMAT || raw.id !== id || !DECISIONS.includes(raw.status)) return null;
    return { format: ADDON_FORMAT, id, status: raw.status, decidedAt: typeof raw.decidedAt === 'string' ? raw.decidedAt : null };
}

/**
 * A visit's add-ons as they stand: each proposal unsealed, with its status
 * (`waiting`, `approved` or `declined`). `{ ok, addOns, error }`; one that
 * will not open is left out. `key` the checklist's key, imported.
 */
export async function fetchAddOns({ api, sealer, key, id, token, visitId }) {
    const got = await api.listAddOns(id, token, visitId);
    if (!got.ok) return { ok: false, addOns: [], error: got.error };
    const out = [];
    for (const row of (got.data && Array.isArray(got.data.addons) ? got.data.addons : [])) {
        if (!row || !ID.test(String(row.addonId))) continue;
        let proposal = null;
        let decision = null;
        try {
            proposal = cleanProposal(await sealer.openJson(key, fromBase64url(row.proposal), contextFor(id, 'addon', row.addonId)));
            if (row.decision) decision = cleanDecision(await sealer.openJson(key, fromBase64url(row.decision), contextFor(id, 'decision', row.addonId)), row.addonId);
        } catch (e) {
            proposal = null;
        }
        if (!proposal || proposal.id !== row.addonId) continue;
        out.push({ ...proposal, status: decision ? decision.status : 'waiting', decidedAt: decision ? decision.decidedAt : null });
    }
    return { ok: true, addOns: out, error: null };
}

/**
 * The customer's side (PLANNING 10.4): every add-on of every visit still
 * open (no report yet), each with its `visitId`, oldest visit first. `token`
 * the owner token. `{ ok, addOns, error }`.
 */
export async function openAddOns({ api, sealer, key, id, token }) {
    const got = await api.listVisits(id, token);
    if (!got.ok) return { ok: false, addOns: [], error: got.error };
    const visits = (got.data && Array.isArray(got.data.visits) ? got.data.visits : [])
        .filter((v) => v && ID.test(String(v.visitId)) && !v.reportAt);
    const out = [];
    for (const v of visits) {
        const r = await fetchAddOns({ api, sealer, key, id, token, visitId: v.visitId });
        if (!r.ok) return { ok: false, addOns: [], error: r.error };
        out.push(...r.addOns.map((a) => ({ ...a, visitId: v.visitId })));
    }
    return { ok: true, addOns: out, error: null };
}

/**
 * The customer's answer to one add-on, sealed and sent, once. `status`
 * approved or declined, `at` when (an ISO string). `{ ok, error, decision }`;
 * `decided` when it was answered already (from another device).
 */
export async function decideAddOn({ api, sealer, key, id, token, visitId, addonId, status, at }) {
    const decision = cleanDecision({ format: ADDON_FORMAT, id: addonId, status, decidedAt: at }, addonId);
    if (!decision || !ID.test(String(addonId)) || !ID.test(String(visitId))) return { ok: false, error: 'bad-request', decision: null };
    const sealed = await sealer.sealJson(key, decision, contextFor(id, 'decision', addonId));
    const put = await api.decideAddOn(id, token, visitId, addonId, sealed);
    if (!put.ok) return { ok: false, error: put.error, decision: null };
    return { ok: true, error: null, decision };
}

/** The room an add-on belongs to: its own, or its task's. */
export function roomOf(form, addOn) {
    if (addOn.roomId) return addOn.roomId;
    const item = ((form && form.items) || []).find((i) => i.id === addOn.itemId);
    return item ? item.roomId : null;
}

/** How many add-ons are still waiting for the customer. */
export function waitingCount(addOns) {
    return (addOns || []).filter((a) => a.status === 'waiting').length;
}
