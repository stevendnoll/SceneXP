// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * addons.js - Add-ons the cleaner proposes on site (PRD 9.5 and 12.3,
 * PLANNING 10.3).
 *
 * APPROVAL, NEVER SURPRISE BILLS. When a home needs more than the list
 * says, the cleaner proposes an add-on from the room it is in: a task the
 * room does not have yet (Oven interior), or an upgrade of one it does
 * (Deep clean on the stovetop), priced by the sheet the quote was locked
 * on. The customer approves or declines it (M5's decide card), and until
 * approved it is neither done nor charged.
 *
 * A PROPOSAL CARRIES CHOICES, NEVER PRICES, as checklist items do: the
 * customer's browser prices it again from the same sheet (pricing.js
 * `priceAddOn`), so a figure changed on the way is caught. A cleaner may add
 * a few words for the customer ("Baked-on grease from a spill").
 *
 * SEALED BOTH WAYS. A proposal and its decision are sealed with the
 * checklist's key under their own contexts (seal.js `addon`, `decision`),
 * so the server holds neither the words nor the choice.
 *
 * Pure, apart from `proposeAddOn` and `fetchAddOns`, which take the API and
 * the sealer as arguments.
 */

import { taskOf, optionOf, tasksFor } from '../../js/sheet.min.js';
import { priceAddOn, isLive } from '../../js/pricing.min.js';
import { contextFor, toBase64url, fromBase64url } from '../../js/seal.min.js';
import { ID } from '../../js/links.min.js';
import { WORDS_MAX } from './visit.min.js';

export const ADDON_FORMAT = 1;

/** What a customer can say of an add-on. */
export const DECISIONS = Object.freeze(['approved', 'declined']);

const clip = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, WORDS_MAX);

/** The key a choice is known by in the picker: `task:<task>`, or
 *  `up:<itemId>:<option>` for an upgrade. */
export function choiceKey(addOn) {
    if (addOn.itemId) return `up:${addOn.itemId}:${(addOn.options || [])[0]}`;
    return `task:${addOn.task}`;
}

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
 * What can be proposed in one room, in the sheet's order: first the tasks
 * offered in a room of its kind that it does not have, then the options its
 * own tasks do not have yet. `taken` holds the choice keys of add-ons
 * already waiting or approved, which are not offered twice. Each is
 * `{ key, kind: 'task' | 'upgrade', name, addOn }`, priced or left out.
 *
 * A new task priced by room size takes the size of the room's other tasks
 * (the customer chose it once already), and a task priced per unit starts
 * at one.
 */
export function choicesFor(sheet, form, roomId, taken = new Set()) {
    const room = sheet && form ? (form.rooms || []).find((r) => r.id === roomId) : null;
    if (!room) return [];
    const items = (form.items || []).filter((i) => isLive(i) && i.roomId === roomId);
    const have = new Set(items.map((i) => i.task));
    const sized = items.find((i) => i.size);
    const out = [];
    const offer = (kind, addOn) => {
        const key = choiceKey(addOn);
        if (taken.has(key) || priceOf(sheet, form, addOn).error) return;
        out.push({ key, kind, name: addOnName(sheet, form, addOn), addOn });
    };
    for (const task of tasksFor(sheet, room.area, room.bath || undefined)) {
        if (have.has(task.key)) continue;
        const addOn = { roomId, task: task.key, options: [] };
        if (task.unit === 'room') addOn.size = sized ? sized.size : 'medium';
        if (task.unit === 'count') addOn.quantity = 1;
        offer('task', addOn);
    }
    for (const item of [...items].sort((a, b) => (a.order || 0) - (b.order || 0))) {
        const task = taskOf(sheet, item.task);
        for (const o of (task ? task.options : [])) {
            if (!(item.options || []).includes(o.key)) offer('upgrade', { itemId: item.id, options: [o.key] });
        }
    }
    return out;
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

/** A fresh add-on id, the API's 22 characters. */
export function newAddOnId(getRandomValues = (a) => globalThis.crypto.getRandomValues(a)) {
    return toBase64url(getRandomValues(new Uint8Array(16)));
}

/**
 * Propose an add-on: the visit started if it has not been, then the
 * proposal sealed and sent. `{ ok, visitId, addOn, error }`, the add-on as
 * the page keeps it (`status: 'waiting'`).
 */
export async function proposeAddOn({ api, sealer, key, id, token, visitId = null, addOn, words = '', newId = newAddOnId }) {
    let visit = visitId;
    if (!visit) {
        const started = await api.startVisit(id, token);
        if (!started.ok) return { ok: false, visitId: null, error: started.error };
        visit = started.data.visitId;
    }
    const proposal = cleanProposal({ ...addOn, words, format: ADDON_FORMAT, id: newId() });
    if (!proposal) return { ok: false, visitId: visit, error: 'bad-request' };
    const sealed = await sealer.sealJson(key, proposal, contextFor(id, 'addon', proposal.id));
    const put = await api.putAddOn(id, token, visit, proposal.id, sealed);
    if (!put.ok) return { ok: false, visitId: visit, error: put.error };
    return { ok: true, visitId: visit, addOn: { ...proposal, status: 'waiting', decidedAt: null } };
}

/**
 * A visit's add-ons as they stand: each proposal unsealed, with its status
 * (`waiting`, `approved` or `declined`). `{ ok, addOns, error }`; one that
 * will not open is left out.
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

/** The add-ons kept on the device, made safe (piece 4 reopens offline). */
export function cleanKept(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((a) => {
        const p = cleanProposal(a);
        if (!p) return null;
        const status = a.status === 'approved' || a.status === 'declined' ? a.status : 'waiting';
        return { ...p, status, decidedAt: typeof a.decidedAt === 'string' ? a.decidedAt : null };
    }).filter(Boolean);
}

/** The room an add-on belongs to: its own, or its task's. */
export function roomOf(form, addOn) {
    if (addOn.roomId) return addOn.roomId;
    const item = ((form && form.items) || []).find((i) => i.id === addOn.itemId);
    return item ? item.roomId : null;
}

/** The choice keys of add-ons waiting or approved, not offered again. */
export function takenKeys(addOns) {
    return new Set((addOns || []).filter((a) => a.status !== 'declined').map(choiceKey));
}

/** How many add-ons are still waiting for the customer. */
export function waitingCount(addOns) {
    return (addOns || []).filter((a) => a.status === 'waiting').length;
}
