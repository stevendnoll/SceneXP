// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * store.js - The saved document: what it looks like, how it changes, and the
 * one place it touches localStorage (PRD 11, PLANNING 3.1).
 *
 * THE DOCUMENT IS THE SOURCE OF TRUTH AND THE STUDIO IS A PROJECTION OF IT,
 * as in Corner Office. Every mutation takes a document and returns a NEW one,
 * leaving its argument untouched, which is what makes undo free (history.js
 * keeps the old documents) and lets the scene compare references to see what
 * changed. Structural sharing keeps it cheap.
 *
 * EVERY MUTATION RETURNS `{ doc, record, error }`. On a refusal `doc` is the
 * document handed in, unchanged, and `error` is a sentence from copy.js fit to
 * show the visitor.
 *
 * ITEMS STORE CHOICES, NEVER PRICES. A task, its options, its size and its
 * quantity. Prices come from the price sheet (pricing.js), so there is one
 * source of truth. Whether a choice is one the sheet allows is asked through
 * `opts.check(choice, area, bath)`, which the page wires to sheet.js
 * `checkChoice`, so this file never needs a sheet.
 *
 * NOTHING IS DELETED OUTRIGHT. Removing sets `deletedAt`, and restoring
 * clears it. A room takes its tasks with it, stamped with the same moment,
 * and restoring the room brings back exactly those, not tasks removed on
 * their own earlier. Removed records are kept for undo and dropped on load
 * after `storage.keepDeletedDays`.
 *
 * THE ONLY FILE THAT WRITES localStorage. `createStore` takes the storage as
 * an argument, so the suite hands it a Map, and tests/privacy.test.mjs names
 * this file.
 *
 * THREE GUARDS ON EVERY SAVE, from the garden and Prospect City, where each
 * was a real bug first (and Corner Office, which this copies):
 *   - nothing is written after teardown, when a late save could only put
 *     nothing over something;
 *   - nothing is written once the browser has refused once, since private
 *     windows refuse forever and the visitor has already been told;
 *   - nothing is written if the key was seen and is now gone, because that is
 *     another tab clearing it on purpose and a save must not bring it back.
 *
 * UNTRUSTED INPUT. Whatever another tab or an older build wrote comes
 * through `validate`, which rebuilds every record field by field. Anything
 * unknown is dropped, every string is capped, and every key is checked
 * against the taxonomy.
 */

import { STORE, ITEM_ERRORS } from './copy.min.js';
import { serviceType, levelOf, bathOf, bathChoices, residenceOf, levelsAllowed, KEY_PATTERN } from './taxonomy.min.js';

export const ID_PATTERN = /^[A-Za-z0-9_-]{8,36}$/;
export const SIZES = Object.freeze(['small', 'medium', 'large']);
const DAY_MS = 86400000;

// ---- Ids --------------------------------------------------------------------

/** A fresh id: 16 random bytes as 22 base64url characters, the same shape
 *  the server's ids will have. */
export function newId(cryptoLike = globalThis.crypto, random = Math.random) {
    const bytes = new Uint8Array(16);
    if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') cryptoLike.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(random() * 256);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- Small normalizers ------------------------------------------------------

function text(value, max) {
    if (value == null) return '';
    return String(value).trim().slice(0, max);
}

function stampOrNull(value) {
    if (typeof value !== 'string' || !value) return null;
    return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function stamp(now) {
    return now.toISOString();
}

function idOrNull(value) {
    return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

function keysFrom(value, allowed) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter((k) => typeof k === 'string' && allowed(k) && !seen.has(k) && seen.add(k));
}

/** Removed long enough ago to forget. */
function expired(record, config, now) {
    if (!record.deletedAt) return false;
    return now.getTime() - new Date(record.deletedAt).getTime() > config.storage.keepDeletedDays * DAY_MS;
}

// ---- The shapes -------------------------------------------------------------

export function emptyDoc(config, now) {
    return {
        schema: config.storage.schema,
        checklists: [],
        settings: { coached: 0, activeId: null },
        meta: { createdAt: stamp(now), lastVisitAt: null }
    };
}

/** A room rebuilt from untrusted input. Its `bath` is a bathroom's type
 *  (taxonomy.js `bathOf`: `tub` or `shower`) and null in any other room. A
 *  bathroom saved before bath types is a full bath. */
function normalizeRoom(raw, levels, type, typeKey, config) {
    if (!raw || typeof raw !== 'object') return null;
    const id = idOrNull(raw.id);
    if (!id || !levels.includes(raw.level) || !type.areas.some((a) => a.key === raw.area)) return null;
    return {
        id,
        level: raw.level,
        area: raw.area,
        bath: bathOf(typeKey, raw.area, raw.bath),
        label: text(raw.label, config.limits.label),
        sample: raw.sample === true,
        createdAt: stampOrNull(raw.createdAt),
        updatedAt: stampOrNull(raw.updatedAt),
        deletedAt: stampOrNull(raw.deletedAt)
    };
}

function normalizeItem(raw, roomIds, config) {
    if (!raw || typeof raw !== 'object') return null;
    const id = idOrNull(raw.id);
    if (!id || !roomIds.has(raw.roomId) || typeof raw.task !== 'string' || !KEY_PATTERN.test(raw.task)) return null;
    const quantity = Number.isInteger(raw.quantity) && raw.quantity >= 1 && raw.quantity <= config.limits.quantity
        ? raw.quantity : null;
    return {
        id,
        roomId: raw.roomId,
        task: raw.task,
        options: keysFrom(raw.options, (k) => KEY_PATTERN.test(k)),
        size: SIZES.includes(raw.size) ? raw.size : null,
        quantity,
        important: raw.important === true,
        notes: text(raw.notes, config.limits.notes),
        avoid: text(raw.avoid, config.limits.avoid),
        products: text(raw.products, config.limits.products),
        photos: keysFrom(raw.photos, (k) => ID_PATTERN.test(k)).slice(0, config.limits.photosPerItem),
        order: Number.isFinite(raw.order) ? raw.order : 0,
        sample: raw.sample === true,
        createdAt: stampOrNull(raw.createdAt),
        updatedAt: stampOrNull(raw.updatedAt),
        deletedAt: stampOrNull(raw.deletedAt)
    };
}

function normalizePreferences(raw, typeKey, config) {
    const type = serviceType(typeKey);
    const known = type ? type.preferences.flatMap((g) => g.items.map((i) => i.key)) : [];
    const keys = keysFrom(raw && raw.keys, (k) => known.includes(k));
    return {
        keys: known.filter((k) => keys.includes(k)),   // always in the taxonomy's order
        note: text(raw && raw.note, config.limits.preferenceNote)
    };
}

function normalizeQuote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const whole = (n) => Number.isInteger(n) && n >= 0;
    if (typeof raw.sheetVersion !== 'string' || !whole(raw.subtotalCents) || !whole(raw.topUpCents)
        || !whole(raw.totalCents) || !whole(raw.minutes) || raw.totalCents !== raw.subtotalCents + raw.topUpCents) return null;
    return {
        sheetVersion: raw.sheetVersion.slice(0, 64),
        subtotalCents: raw.subtotalCents,
        topUpCents: raw.topUpCents,
        totalCents: raw.totalCents,
        minutes: raw.minutes,
        lockedAt: stampOrNull(raw.lockedAt)
    };
}

/** Levels as known keys, without repeats, in the taxonomy's order (bottom to
 *  top, the way the house model stacks them). */
function normalizeLevels(raw, type) {
    const keys = keysFrom(raw, (k) => type.levels.some((l) => l.key === k));
    return type.levels.map((l) => l.key).filter((k) => keys.includes(k));
}

/** One checklist rebuilt from untrusted input: { record, dropped } or null. */
export function normalizeChecklist(raw, config, now) {
    if (!raw || typeof raw !== 'object') return null;
    const id = idOrNull(raw.id);
    const type = serviceType(raw.serviceType);
    if (!id || !type) return null;
    let dropped = 0;

    let levels = normalizeLevels(raw.levels, type);
    if (!levels.length) levels = [type.levels.find((l) => l.key === 'main') ? 'main' : type.levels[0].key];
    // The kind of residence (PRD 8.9): none is a house. One whose levels it
    // cannot have (written by hand, or by a build to come) is read as a
    // house, so nothing on those levels is lost.
    let residence = residenceOf(raw.serviceType, raw.residence);
    if (residence && levels.some((l) => !levelsAllowed(raw.serviceType, residence).includes(l))) residence = residenceOf(raw.serviceType, null);

    const rooms = [];
    const roomIds = new Set();
    for (const r of Array.isArray(raw.rooms) ? raw.rooms : []) {
        const room = normalizeRoom(r, levels, type, raw.serviceType, config);
        if (!room || roomIds.has(room.id) || expired(room, config, now)) { dropped++; continue; }
        rooms.push(room);
        roomIds.add(room.id);
    }
    const items = [];
    const itemIds = new Set();
    for (const i of Array.isArray(raw.items) ? raw.items : []) {
        const item = normalizeItem(i, roomIds, config);
        if (!item || itemIds.has(item.id) || expired(item, config, now)) { dropped++; continue; }
        items.push(item);
        itemIds.add(item.id);
    }

    return {
        record: {
            id,
            serviceType: raw.serviceType,
            title: text(raw.title, config.limits.title) || 'Our home',
            visitFrequency: config.frequencies.includes(raw.visitFrequency) ? raw.visitFrequency : null,
            residence,
            levels,
            rooms,
            items,
            household: text(raw.household, config.limits.household),
            preferences: normalizePreferences(raw.preferences, raw.serviceType, config),
            quote: normalizeQuote(raw.quote),
            // Publishing, booking and visit reports arrive with the server (M3).
            published: null,
            booking: null,
            visits: [],
            sample: raw.sample === true,
            createdAt: stampOrNull(raw.createdAt),
            updatedAt: stampOrNull(raw.updatedAt),
            deletedAt: stampOrNull(raw.deletedAt)
        },
        dropped
    };
}

/** Older documents into this build's shape. There is only schema 1 so far,
 *  so this is the hook a schema 2 will fill. A field added since (a room's
 *  `bath`) has its default filled in by `normalizeChecklist`, so needs no
 *  new schema. */
export function migrate(raw, config) {
    if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.schema)) return { ok: false, reason: 'invalid' };
    if (raw.schema > config.storage.schema) return { ok: false, reason: 'newer' };
    if (raw.schema < 1) return { ok: false, reason: 'invalid' };
    return { ok: true, raw };
}

/**
 * A whole saved document rebuilt from untrusted input:
 *   { ok: true, doc, dropped }  or  { ok: false, reason: 'newer' | 'invalid' }
 */
export function validate(input, config, now) {
    const m = migrate(input, config);
    if (!m.ok) return m;
    const raw = m.raw;
    let dropped = 0;
    const checklists = [];
    const ids = new Set();
    for (const c of Array.isArray(raw.checklists) ? raw.checklists : []) {
        const n = normalizeChecklist(c, config, now);
        if (!n || ids.has(n.record.id) || expired(n.record, config, now)) { dropped++; continue; }
        dropped += n.dropped;
        checklists.push(n.record);
        ids.add(n.record.id);
    }
    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const coached = Number.isInteger(settings.coached) && settings.coached >= 0 && settings.coached <= 65535 ? settings.coached : 0;
    const guide = guideSetting(settings.guide);
    const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    return {
        ok: true,
        dropped,
        doc: {
            schema: config.storage.schema,
            checklists,
            settings: { coached, activeId: ids.has(settings.activeId) ? settings.activeId : null, ...(guide ? { guide } : {}) },
            meta: { createdAt: stampOrNull(meta.createdAt) || stamp(now), lastVisitAt: stampOrNull(meta.lastVisitAt) }
        }
    };
}

// ---- Reading ----------------------------------------------------------------

export const isLive = (record) => Boolean(record) && !record.deletedAt;

export function findChecklist(doc, id) {
    return doc.checklists.find((c) => c.id === id) || null;
}

export const liveRooms = (checklist) => checklist.rooms.filter(isLive);

/** The live items, and only those in live rooms. */
export function liveItems(checklist) {
    const rooms = new Set(liveRooms(checklist).map((r) => r.id));
    return checklist.items.filter((i) => isLive(i) && rooms.has(i.roomId));
}

/** A room's live items in the customer's order. */
export function itemsIn(checklist, roomId) {
    return liveItems(checklist).filter((i) => i.roomId === roomId).sort((a, b) => a.order - b.order);
}

export function photoCount(checklist) {
    return liveItems(checklist).reduce((n, i) => n + i.photos.length, 0);
}

// ---- Changing it ------------------------------------------------------------

const refusal = (doc, error) => ({ doc, record: null, error });

function replaceChecklist(doc, checklist) {
    return { ...doc, checklists: doc.checklists.map((c) => (c.id === checklist.id ? checklist : c)) };
}

/** The live checklist, or the refusal that explains why there is not one. */
function liveChecklist(doc, id) {
    const c = findChecklist(doc, id);
    if (!c) return { error: STORE.noChecklist };
    if (c.deletedAt) return { error: STORE.checklistRemoved };
    return { checklist: c };
}

function touched(checklist, now) {
    return { ...checklist, updatedAt: stamp(now) };
}

/** A new checklist, prefilled "Our home" on the main floor. */
export function createChecklist(doc, fields, config, now, opts = {}) {
    if (doc.checklists.filter(isLive).length >= config.limits.checklists) {
        return refusal(doc, STORE.tooManyChecklists(config.limits.checklists));
    }
    const src = fields || {};
    const n = normalizeChecklist({
        ...src,
        id: opts.id || newId(),
        serviceType: src.serviceType || 'cleaning',
        levels: src.levels || ['main'],
        rooms: [],
        items: [],
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, config, now);
    if (!n) return refusal(doc, STORE.noChecklist);
    return { doc: { ...doc, checklists: [...doc.checklists, n.record] }, record: n.record, error: null };
}

/**
 * A copy of a checklist as a new draft: fresh ids for it, its rooms and its
 * tasks (tasks follow their rooms), its removed records left behind, and
 * nothing published, booked or reported. Photos are shared, not copied on
 * disk: both checklists refer to the same photo ids, and a photo is pruned
 * only once neither does (photoIdsInUse).
 */
export function duplicateChecklist(doc, id, config, now, opts = {}) {
    const found = liveChecklist(doc, id);
    if (found.error) return refusal(doc, found.error);
    if (doc.checklists.filter(isLive).length >= config.limits.checklists) {
        return refusal(doc, STORE.tooManyChecklists(config.limits.checklists));
    }
    const c = found.checklist;
    const make = opts.newId || newId;
    const roomIds = new Map(liveRooms(c).map((r) => [r.id, make()]));
    const at = stamp(now);
    const fresh = (r) => ({ ...r, sample: false, createdAt: at, updatedAt: at, deletedAt: null });
    const record = {
        ...c,
        id: make(),
        title: STORE.copyOf(c.title).slice(0, config.limits.title),
        rooms: liveRooms(c).map((r) => fresh({ ...r, id: roomIds.get(r.id) })),
        items: liveItems(c).map((i) => fresh({ ...i, id: make(), roomId: roomIds.get(i.roomId), photos: [...i.photos] })),
        quote: null,
        published: null,
        booking: null,
        visits: [],
        sample: false,
        createdAt: at,
        updatedAt: at,
        deletedAt: null
    };
    return { doc: { ...doc, checklists: [...doc.checklists, record] }, record, error: null };
}

/** Title, visit frequency and the household note. */
export function updateChecklist(doc, id, fields, config, now) {
    const found = liveChecklist(doc, id);
    if (found.error) return refusal(doc, found.error);
    const src = fields || {};
    const c = { ...found.checklist };
    if ('title' in src) c.title = text(src.title, config.limits.title) || 'Our home';
    if ('visitFrequency' in src) c.visitFrequency = config.frequencies.includes(src.visitFrequency) ? src.visitFrequency : null;
    if ('household' in src) c.household = text(src.household, config.limits.household);
    const record = touched(c, now);
    return { doc: replaceChecklist(doc, record), record, error: null };
}

/** The levels a home has, of those its kind of residence can have. A level
 *  that still has rooms cannot go. */
export function setLevels(doc, id, levels, config, now) {
    const found = liveChecklist(doc, id);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const allowed = levelsAllowed(c.serviceType, c.residence);
    const next = normalizeLevels(levels, serviceType(c.serviceType)).filter((l) => allowed.includes(l));
    if (!next.length) return refusal(doc, STORE.noLevels);
    if (liveRooms(c).some((r) => !next.includes(r.level))) return refusal(doc, STORE.levelInUse);
    // A removed room on a level that goes is kept, on the first level, so its
    // undo still has somewhere to land.
    const rooms = c.rooms.map((r) => (next.includes(r.level) ? r : { ...r, level: next[0] }));
    const record = touched({ ...c, levels: next, rooms }, now);
    return { doc: replaceChecklist(doc, record), record, error: null };
}

/**
 * The kind of residence (PRD 8.9): `{ kind, attached }`, rebuilt by
 * taxonomy.js `residenceOf`. The levels the new kind cannot have go with
 * it, unless one still has rooms, which refuses the change and says which.
 */
export function setResidence(doc, id, residence, config, now) {
    const found = liveChecklist(doc, id);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const next = residenceOf(c.serviceType, residence);
    if (!next) return { doc, record: c, error: null };
    const allowed = levelsAllowed(c.serviceType, next);
    const busy = c.levels.find((l) => !allowed.includes(l) && liveRooms(c).some((r) => r.level === l));
    if (busy) return refusal(doc, STORE.residenceLevelInUse((levelOf(c.serviceType, busy) || { name: busy }).name));
    let levels = c.levels.filter((l) => allowed.includes(l));
    if (!levels.length) levels = [allowed.includes('main') ? 'main' : allowed[0]];
    // A removed room on a level that goes is kept, on the first level, so its
    // undo still has somewhere to land (as in setLevels).
    const rooms = c.rooms.map((r) => (levels.includes(r.level) ? r : { ...r, level: levels[0] }));
    const record = touched({ ...c, residence: next, levels, rooms }, now);
    return { doc: replaceChecklist(doc, record), record, error: null };
}

/** Care preferences for the whole visit (PRD 11.8). */
export function setPreferences(doc, id, preferences, config, now) {
    const found = liveChecklist(doc, id);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const record = touched({ ...c, preferences: normalizePreferences(preferences, c.serviceType, config) }, now);
    return { doc: replaceChecklist(doc, record), record, error: null };
}

export function deleteChecklist(doc, id, config, now) {
    const found = liveChecklist(doc, id);
    if (found.error) return refusal(doc, found.error);
    const record = { ...found.checklist, deletedAt: stamp(now) };
    const settings = doc.settings.activeId === id ? { ...doc.settings, activeId: null } : doc.settings;
    return { doc: { ...replaceChecklist(doc, record), settings }, record, error: null };
}

export function restoreChecklist(doc, id, config, now) {
    const c = findChecklist(doc, id);
    if (!c) return refusal(doc, STORE.noChecklist);
    if (!c.deletedAt) return { doc, record: c, error: null };
    if (doc.checklists.filter(isLive).length >= config.limits.checklists) {
        return refusal(doc, STORE.tooManyChecklists(config.limits.checklists));
    }
    const record = touched({ ...c, deletedAt: null }, now);
    return { doc: replaceChecklist(doc, record), record, error: null };
}

/** Whether a choice is one the sheet allows in an area (and a bathroom's
 *  type), through the page's `check`, as a sentence, or null. */
function choiceError(opts, choice, area, bath) {
    const code = opts && typeof opts.check === 'function' ? opts.check(choice, area, bath) : null;
    return code ? (ITEM_ERRORS[code] || ITEM_ERRORS['unknown-task']) : null;
}

/** An item built from a form or a preset, before it has a room's order. */
function freshItem(fields, roomId, config, now, opts) {
    const src = fields || {};
    return normalizeItem({
        ...src,
        id: opts.id || newId(),
        roomId,
        photos: [],
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, new Set([roomId]), config);
}

/**
 * Add a room, and (opts.presetItems) its standard preset in the same step,
 * so "a whole room in 15 seconds" is one undo. A level the home did not
 * have yet is added to it.
 */
export function addRoom(doc, checklistId, fields, config, now, opts = {}) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const type = serviceType(c.serviceType);
    const src = fields || {};
    if (!levelsAllowed(c.serviceType, c.residence).includes(src.level)) return refusal(doc, STORE.badLevel);
    if (!type.areas.some((a) => a.key === src.area)) return refusal(doc, STORE.badArea);
    if (liveRooms(c).length >= config.limits.rooms) return refusal(doc, STORE.tooManyRooms(config.limits.rooms));

    const preset = Array.isArray(opts.presetItems) ? opts.presetItems : [];
    if (liveItems(c).length + preset.length > config.limits.items) return refusal(doc, STORE.tooManyItems(config.limits.items));
    const bath = bathOf(c.serviceType, src.area, src.bath);
    for (const p of preset) {
        const why = choiceError(opts, p, src.area, bath);
        if (why) return refusal(doc, why);
    }

    const levels = normalizeLevels([...c.levels, src.level], type);
    const room = normalizeRoom({
        ...src,
        id: opts.id || newId(),
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, levels, type, c.serviceType, config);
    const items = preset.map((p, i) => ({
        ...freshItem(p, room.id, config, now, { sample: opts.sample, id: opts.itemIds && opts.itemIds[i] }),
        order: i + 1
    }));
    const record = touched({ ...c, levels, rooms: [...c.rooms, room], items: [...c.items, ...items] }, now);
    return { doc: replaceChecklist(doc, record), record: room, error: null };
}

/** A room's label, or the level it is on. Its kind of room is fixed, since
 *  every task in it was chosen for that kind, apart from a bathroom's type
 *  of bath (`setBath`). */
export function updateRoom(doc, checklistId, roomId, fields, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const room = c.rooms.find((r) => r.id === roomId);
    if (!room) return refusal(doc, STORE.noRoom);
    if (room.deletedAt) return refusal(doc, STORE.roomRemoved);
    const src = fields || {};
    const type = serviceType(c.serviceType);
    const next = { ...room, updatedAt: stamp(now) };
    let levels = c.levels;
    if ('label' in src) next.label = text(src.label, config.limits.label);
    if ('level' in src) {
        if (!levelsAllowed(c.serviceType, c.residence).includes(src.level)) return refusal(doc, STORE.badLevel);
        next.level = src.level;
        levels = normalizeLevels([...c.levels, src.level], type);
    }
    const record = touched({ ...c, levels, rooms: c.rooms.map((r) => (r.id === roomId ? next : r)) }, now);
    return { doc: replaceChecklist(doc, record), record: next, error: null };
}

/** Remove a room, taking its live tasks with it under the same stamp. */
export function deleteRoom(doc, checklistId, roomId, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const room = c.rooms.find((r) => r.id === roomId);
    if (!room) return refusal(doc, STORE.noRoom);
    if (room.deletedAt) return refusal(doc, STORE.roomRemoved);
    const when = stamp(now);
    const gone = { ...room, deletedAt: when };
    const items = c.items.map((i) => (i.roomId === roomId && !i.deletedAt ? { ...i, deletedAt: when } : i));
    const record = touched({ ...c, rooms: c.rooms.map((r) => (r.id === roomId ? gone : r)), items }, now);
    return { doc: replaceChecklist(doc, record), record: gone, error: null };
}

/** Bring a room back, with exactly the tasks that went with it. */
export function restoreRoom(doc, checklistId, roomId, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const room = c.rooms.find((r) => r.id === roomId);
    if (!room) return refusal(doc, STORE.noRoom);
    if (!room.deletedAt) return { doc, record: room, error: null };
    if (liveRooms(c).length >= config.limits.rooms) return refusal(doc, STORE.tooManyRooms(config.limits.rooms));
    const coming = c.items.filter((i) => i.roomId === roomId && i.deletedAt === room.deletedAt);
    if (liveItems(c).length + coming.length > config.limits.items) return refusal(doc, STORE.tooManyItems(config.limits.items));
    const back = { ...room, deletedAt: null, updatedAt: stamp(now) };
    const items = c.items.map((i) => (coming.includes(i) ? { ...i, deletedAt: null } : i));
    const record = touched({ ...c, rooms: c.rooms.map((r) => (r.id === roomId ? back : r)), items }, now);
    return { doc: replaceChecklist(doc, record), record: back, error: null };
}

/**
 * A bathroom's type of bath (PRD 8.10): one of its `bathChoices` by key
 * (`tub`, `shower`, or `half`, which makes it the half bath area), in one
 * step. The tasks the new type cannot have go, under one stamp, and
 * `opts.presetItems` (the standard tasks the new type brings, sheet.js
 * `presetGains`) come in after the rest. The record carries `removed` and
 * `added`, the items that went and came, for the line that says so.
 */
export function setBath(doc, checklistId, roomId, key, config, now, opts = {}) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const where = liveRoomOf(c, roomId);
    if (where.error) return refusal(doc, where.error);
    const room = where.room;
    const to = bathChoices(c.serviceType, room.area).find((x) => x.key === key);
    if (!to) return refusal(doc, STORE.notABath);
    if (to.area === room.area && to.bath === room.bath) return { doc, record: { room, removed: [], added: [] }, error: null };

    const preset = Array.isArray(opts.presetItems) ? opts.presetItems : [];
    for (const p of preset) {
        const why = choiceError(opts, p, to.area, to.bath);
        if (why) return refusal(doc, why);
    }
    const mine = itemsIn(c, roomId);
    const going = mine.filter((i) => choiceError(opts, i, to.area, to.bath));
    if (liveItems(c).length - going.length + preset.length > config.limits.items) {
        return refusal(doc, STORE.tooManyItems(config.limits.items));
    }
    const when = stamp(now);
    const next = { ...room, area: to.area, bath: to.bath, updatedAt: when };
    let order = mine.reduce((m, i) => Math.max(m, i.order), 0);
    const added = preset.map((p, k) => ({ ...freshItem(p, roomId, config, now, { id: opts.itemIds && opts.itemIds[k] }), order: ++order }));
    const gone = new Set(going.map((i) => i.id));
    const items = [...c.items.map((i) => (gone.has(i.id) ? { ...i, deletedAt: when } : i)), ...added];
    const record = touched({ ...c, rooms: c.rooms.map((r) => (r.id === roomId ? next : r)), items }, now);
    return { doc: replaceChecklist(doc, record), record: { room: next, removed: going, added }, error: null };
}

function liveRoomOf(c, roomId) {
    const room = c.rooms.find((r) => r.id === roomId);
    if (!room) return { error: STORE.noRoom };
    if (room.deletedAt) return { error: STORE.roomRemoved };
    return { room };
}

/** Add one task to a room, last in the room's order. */
export function addItem(doc, checklistId, fields, config, now, opts = {}) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const src = fields || {};
    const where = liveRoomOf(c, src.roomId);
    if (where.error) return refusal(doc, where.error);
    if (liveItems(c).length >= config.limits.items) return refusal(doc, STORE.tooManyItems(config.limits.items));
    const why = choiceError(opts, src, where.room.area, where.room.bath);
    if (why) return refusal(doc, why);
    const item = freshItem(src, src.roomId, config, now, opts);
    if (!item) return refusal(doc, ITEM_ERRORS['unknown-task']);
    const last = itemsIn(c, src.roomId).reduce((m, i) => Math.max(m, i.order), 0);
    item.order = last + 1;
    const record = touched({ ...c, items: [...c.items, item] }, now);
    return { doc: replaceChecklist(doc, record), record: item, error: null };
}

const ITEM_FIELDS = ['options', 'size', 'quantity', 'important', 'notes', 'avoid', 'products', 'order'];

/** Change a task's choices or notes. The task itself is fixed: a different
 *  task is a different item, so a report always lines up. */
export function updateItem(doc, checklistId, itemId, fields, config, now, opts = {}) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const item = c.items.find((i) => i.id === itemId);
    if (!item) return refusal(doc, STORE.noItem);
    if (item.deletedAt) return refusal(doc, STORE.itemRemoved);
    const src = fields || {};
    const merged = { ...item };
    for (const k of ITEM_FIELDS) if (k in src) merged[k] = src[k];
    const next = normalizeItem({ ...merged, updatedAt: stamp(now) }, new Set([item.roomId]), config);
    const room = c.rooms.find((r) => r.id === item.roomId);
    const why = choiceError(opts, next, room.area, room.bath);
    if (why) return refusal(doc, why);
    const record = touched({ ...c, items: c.items.map((i) => (i.id === itemId ? next : i)) }, now);
    return { doc: replaceChecklist(doc, record), record: next, error: null };
}

export function deleteItem(doc, checklistId, itemId, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const item = c.items.find((i) => i.id === itemId);
    if (!item) return refusal(doc, STORE.noItem);
    if (item.deletedAt) return refusal(doc, STORE.itemRemoved);
    const gone = { ...item, deletedAt: stamp(now) };
    const record = touched({ ...c, items: c.items.map((i) => (i.id === itemId ? gone : i)) }, now);
    return { doc: replaceChecklist(doc, record), record: gone, error: null };
}

export function restoreItem(doc, checklistId, itemId, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const item = c.items.find((i) => i.id === itemId);
    if (!item) return refusal(doc, STORE.noItem);
    if (!item.deletedAt) return { doc, record: item, error: null };
    const room = c.rooms.find((r) => r.id === item.roomId);
    if (!room || room.deletedAt) return refusal(doc, STORE.roomOfRemovedRoom);
    if (liveItems(c).length >= config.limits.items) return refusal(doc, STORE.tooManyItems(config.limits.items));
    const back = { ...item, deletedAt: null, updatedAt: stamp(now) };
    const record = touched({ ...c, items: c.items.map((i) => (i.id === itemId ? back : i)) }, now);
    return { doc: replaceChecklist(doc, record), record: back, error: null };
}

/** Attach a photo (already saved by photos.js) to a task. */
export function addPhoto(doc, checklistId, itemId, photoId, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const item = c.items.find((i) => i.id === itemId);
    if (!item) return refusal(doc, STORE.noItem);
    if (item.deletedAt) return refusal(doc, STORE.itemRemoved);
    if (!ID_PATTERN.test(String(photoId))) return refusal(doc, STORE.noItem);
    if (item.photos.includes(photoId)) return { doc, record: item, error: null };
    if (item.photos.length >= config.limits.photosPerItem) return refusal(doc, STORE.tooManyPhotos(config.limits.photosPerItem));
    if (photoCount(c) >= config.limits.photosPerChecklist) {
        return refusal(doc, STORE.tooManyChecklistPhotos(config.limits.photosPerChecklist));
    }
    const next = { ...item, photos: [...item.photos, photoId], updatedAt: stamp(now) };
    const record = touched({ ...c, items: c.items.map((i) => (i.id === itemId ? next : i)) }, now);
    return { doc: replaceChecklist(doc, record), record: next, error: null };
}

export function removePhoto(doc, checklistId, itemId, photoId, config, now) {
    const found = liveChecklist(doc, checklistId);
    if (found.error) return refusal(doc, found.error);
    const c = found.checklist;
    const item = c.items.find((i) => i.id === itemId);
    if (!item) return refusal(doc, STORE.noItem);
    if (!item.photos.includes(photoId)) return { doc, record: item, error: null };
    const next = { ...item, photos: item.photos.filter((p) => p !== photoId), updatedAt: stamp(now) };
    const record = touched({ ...c, items: c.items.map((i) => (i.id === itemId ? next : i)) }, now);
    return { doc: replaceChecklist(doc, record), record: next, error: null };
}

/** Every photo id a document still refers to, removed records included (so
 *  undo can bring a photo back). photos.js deletes the rest. */
export function photoIdsInUse(doc) {
    const ids = new Set();
    for (const c of doc.checklists) for (const i of c.items) i.photos.forEach((p) => ids.add(p));
    return ids;
}

/** Take out the example home, and only the example (the office's clearSamples). */
export function clearSamples(doc) {
    const checklists = doc.checklists.filter((c) => !c.sample);
    const settings = checklists.some((c) => c.id === doc.settings.activeId) ? doc.settings : { ...doc.settings, activeId: null };
    return { doc: { ...doc, checklists, settings }, record: null, error: null };
}

export function hasSamples(doc) {
    return doc.checklists.some((c) => c.sample && !c.deletedAt);
}

/**
 * Where Maya's guide is (guide.js savedForm): a scene name and whether the
 * first build reached its review. Anything else is dropped, so a hand-edited
 * or future value never breaks the page. Null when there is none.
 */
export function guideSetting(value) {
    if (!value || typeof value !== 'object' || typeof value.scene !== 'string' || !/^[a-z][A-Za-z0-9]{0,23}$/.test(value.scene)) return null;
    return { scene: value.scene, reviewed: value.reviewed === true };
}

/** `coached` bits (which halos had retired; nothing reads them since the
 *  guide), the open checklist, and where the guide is. */
export function setSettings(doc, patch) {
    const src = patch || {};
    const settings = { ...doc.settings };
    if ('guide' in src) {
        const guide = guideSetting(src.guide);
        if (guide) settings.guide = guide;
        else delete settings.guide;
    }
    if ('coached' in src && Number.isInteger(src.coached) && src.coached >= 0 && src.coached <= 65535) settings.coached = src.coached;
    if ('activeId' in src) {
        const target = src.activeId === null ? null : findChecklist(doc, src.activeId);
        settings.activeId = target && !target.deletedAt ? target.id : null;
    }
    return { doc: { ...doc, settings }, record: settings, error: null };
}

export function touchVisit(doc, now) {
    return { doc: { ...doc, meta: { ...doc.meta, lastVisitAt: stamp(now) } }, record: null, error: null };
}

/** How much of the storage budget the document uses. */
export function storageUse(doc, config) {
    const chars = JSON.stringify(doc).length;
    const share = chars / config.storage.budgetChars;
    return { chars, share, nearlyFull: share >= config.storage.warnAt };
}

// ---- Storage ----------------------------------------------------------------

/**
 * What `createStore` uses when nobody hands it a storage. It names
 * `localStorage` by its global name on purpose: tests/privacy.test.mjs finds
 * writers by reading the source for exactly that.
 */
export const browserStorage = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key)
};

/**
 * The one object that reads and writes localStorage, with the three guards.
 * `load` returns the document and a status word:
 *   fresh        nothing saved yet
 *   restored     a saved document came back
 *   unavailable  the browser refused, nothing will be saved
 *   newer        a later build wrote this: left alone, never overwritten
 *   unreadable   the saved text is not a document: left alone too
 * Calling `load` again follows a change made in another tab.
 */
export function createStore(storage = browserStorage, config) {
    let seen = false;
    let available = true;
    let writable = true;
    let tornDown = false;
    let status = 'fresh';
    const key = config.storage.key;

    function load(now) {
        let textValue = null;
        if (!available) return { doc: emptyDoc(config, now), status, dropped: 0 };
        try {
            textValue = storage.getItem(key);
        } catch (e) {
            available = false;
            writable = false;
            status = 'unavailable';
            return { doc: emptyDoc(config, now), status, dropped: 0 };
        }
        writable = true;
        if (textValue == null) {
            seen = false;
            status = 'fresh';
            return { doc: emptyDoc(config, now), status, dropped: 0 };
        }
        seen = true;
        let raw;
        try {
            raw = JSON.parse(textValue);
        } catch (e) {
            writable = false;
            status = 'unreadable';
            return { doc: emptyDoc(config, now), status, dropped: 0 };
        }
        const result = validate(raw, config, now);
        if (!result.ok) {
            writable = false;
            status = result.reason === 'newer' ? 'newer' : 'unreadable';
            return { doc: emptyDoc(config, now), status, dropped: 0 };
        }
        status = 'restored';
        return { doc: result.doc, status, dropped: result.dropped };
    }

    /** Returns true when the document reached storage. */
    function save(doc) {
        if (tornDown || !available || !writable) return false;
        try {
            if (seen && storage.getItem(key) === null) return false;
            storage.setItem(key, JSON.stringify(doc));
            seen = true;
            return true;
        } catch (e) {
            available = false;
            return false;
        }
    }

    /** Clear everything, and from here on a save writes normally again. */
    function clear() {
        try {
            storage.removeItem(key);
        } catch (e) {
            available = false;
        }
        seen = false;
        writable = true;
        status = 'fresh';
    }

    function tearDown() {
        tornDown = true;
    }

    return {
        load,
        save,
        clear,
        tearDown,
        key,
        get status() { return status; },
        get available() { return available; },
        get writable() { return available && writable && !tornDown; }
    };
}
