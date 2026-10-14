// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * sync.js - Publishing a checklist (PLANNING 10.1): choose a time, then
 * reserve, book, seal and send, ending on the receipt.
 *
 * THE ORDER IS THE PLAN'S. Reserve (an id, the owner token, the PIN) and make
 * the key; book next, because it is quick and fails quickly, so a time taken
 * a moment ago is found before a single photo is sent; then every photo and
 * its thumbnail, sealed; then the checklist itself, sealed, with its quote
 * locked. Each step is recorded as it is done (`record`, which main.js
 * writes to the store), so a publish that stopped part way (a closed tab, a
 * lost connection) picks up where it was. A reservation that expired before
 * the checklist was sent is cleared, and Confirm starts again.
 *
 * WHAT IS SENT IS THE PUBLISHED FORM (`publishedForm`): the home, its rooms
 * and tasks, the preferences, the locked quote and the booking. Never the
 * key, the owner token, the PIN, removed records or the example's tags. All
 * of it sealed with the key (seal.js), which stays on this device and in the
 * share link's fragment.
 *
 * `publish` takes everything it touches as arguments (the API, the sealer,
 * the photo store, the sheet), so the suite runs it against the stand-in in
 * memory.
 */

import { quoteChecklist, lockQuote } from './pricing.min.js';
import { contextFor } from './seal.min.js';
import { liveRooms, liveItems } from './store.min.js';

export const PUBLISHED_FORMAT = 1;

/** Every photo the checklist's live tasks show, each once, in order. */
export function photoIdsOf(checklist) {
    const seen = new Set();
    for (const item of liveItems(checklist)) for (const p of item.photos || []) seen.add(p);
    return [...seen];
}

/** The checklist as the cleaner's page reads it: what the visit needs, and
 *  nothing that opens or changes it. */
export function publishedForm(checklist, quote) {
    return {
        format: PUBLISHED_FORMAT,
        id: checklist.published ? checklist.published.id : null,
        serviceType: checklist.serviceType,
        title: checklist.title,
        residence: checklist.residence || null,
        levels: checklist.levels,
        visitFrequency: checklist.visitFrequency,
        household: checklist.household,
        preferences: checklist.preferences,
        rooms: liveRooms(checklist).map((r) => ({ id: r.id, level: r.level, area: r.area, bath: r.bath || null, label: r.label })),
        items: liveItems(checklist).map((i) => ({
            id: i.id, roomId: i.roomId, task: i.task, options: i.options, size: i.size, quantity: i.quantity,
            important: i.important, notes: i.notes, avoid: i.avoid, products: i.products, photos: i.photos, order: i.order
        })),
        quote,
        booking: checklist.booking || null
    };
}

/**
 * Publish a checklist, booked for `slot` ({ date, time, minutes }). `record`
 * saves a patch for store.js setPublication and resolves to the checklist
 * as it now stands. Resolves to `{ ok, error, next, checklist }`: `next`
 * the openings offered when the time was just taken.
 */
export async function publish({ checklist, api, sealer, photos, sheet, slot, at, record }) {
    let c = checklist;
    const stop = (error, extra = {}) => ({ ok: false, error, next: [], checklist: c, ...extra });
    if (c.sample) return stop('sample');
    const quote = quoteChecklist(sheet, c);
    if (!quote.lines.length || quote.errors.length) return stop('unpriced');

    if (!c.published) {
        const r = await api.reserve();
        if (!r.ok) return stop(r.error);
        const key = await sealer.exportKey(await sealer.generateKey());
        c = await record({ published: { id: r.data.id, ownerToken: r.data.ownerToken, pin: r.data.pin, key, at: null, version: 0, expiresAt: r.data.expiresAt, photos: [] } });
    }
    const pub = () => c.published;
    // A reservation that lapsed before anything was published: clear it, so
    // Confirm starts over with a fresh one.
    const lapsed = async (error) => {
        if (error === 'denied' && !pub().at) {
            c = await record({ published: null, booking: null });
            return stop('expired');
        }
        return stop(error);
    };

    if (!c.booking) {
        const b = await api.book(pub().id, pub().ownerToken, slot);
        if (!b.ok) {
            if (b.error === 'taken') return stop('taken', { next: (b.data && b.data.next) || [] });
            return lapsed(b.error);
        }
        c = await record({ booking: b.data.booking });
    }

    const key = await sealer.importKey(pub().key);
    for (const photoId of photoIdsOf(c)) {
        if (pub().photos.includes(photoId)) continue;
        for (const [kind, size] of [['photo', 'full'], ['thumb', 'thumb']]) {
            const blob = await photos.get(photoId, size);
            // A photo gone from this device cannot be sent; the task keeps
            // its words.
            if (!blob) continue;
            const sealed = await sealer.seal(key, new Uint8Array(await blob.arrayBuffer()), contextFor(pub().id, kind, photoId));
            const put = kind === 'photo'
                ? await api.putPhoto(pub().id, pub().ownerToken, photoId, sealed)
                : await api.putThumb(pub().id, pub().ownerToken, photoId, sealed);
            if (!put.ok) return lapsed(put.error);
        }
        c = await record({ published: { ...pub(), photos: [...pub().photos, photoId] } });
    }

    const locked = lockQuote(quote, at);
    const body = await sealer.sealJson(key, publishedForm(c, locked), contextFor(pub().id, 'checklist'));
    const put = await api.putChecklist(pub().id, pub().ownerToken, body);
    if (!put.ok) return lapsed(put.error);
    c = await record({
        published: { ...pub(), at: pub().at || at, version: put.data.version, expiresAt: put.data.expiresAt },
        quote: locked
    });
    return { ok: true, error: null, next: [], checklist: c };
}

/**
 * A published checklist opened by its edit link (PLANNING 7.3): fetched with
 * the owner token, opened with the key, held to the published form, its
 * photos and thumbnails brought into this device's photo store (any that
 * will not open are left out). Resolves to `{ ok, form, version, error }`.
 */
export async function openPublished({ api, sealer, photos, link }) {
    const got = await api.getChecklist(link.id, link.ownerToken);
    if (!got.ok) return { ok: false, error: got.error };
    let key;
    let form;
    try {
        key = await sealer.importKey(link.key);
        form = await sealer.openJson(key, got.bytes, contextFor(link.id, 'checklist'));
    } catch (e) {
        return { ok: false, error: 'denied' };
    }
    if (!form || form.format !== PUBLISHED_FORMAT || form.id !== link.id) return { ok: false, error: 'denied' };
    const ids = [...new Set((form.items || []).flatMap((i) => (Array.isArray(i.photos) ? i.photos : [])))];
    for (const photoId of ids) {
        try {
            const full = await api.getPhoto(link.id, link.ownerToken, photoId);
            const thumb = await api.getThumb(link.id, link.ownerToken, photoId);
            if (!full.ok || !thumb.ok) continue;
            const open = async (bytes, kind) => new Blob([await sealer.open(key, bytes, contextFor(link.id, kind, photoId))], { type: 'image/jpeg' });
            await photos.put(photoId, { full: await open(full.bytes, 'photo'), thumb: await open(thumb.bytes, 'thumb') });
        } catch (e) {
            // A photo that will not open is left out; the task keeps its words.
        }
    }
    return { ok: true, form, version: Number(got.version) || 0, error: null };
}
