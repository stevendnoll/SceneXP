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
 * AFTERWARD (PLANNING 10.2, PRD 10.4): `republish` sends the changes made
 * since (re-quoted, the booking's minutes kept in step, new photos sent and
 * removed ones deleted) and moves the visit to a new time when given one;
 * `cancelVisit` gives the time back and keeps the checklist published;
 * `unpublish` deletes the server's copy. The link and the PIN never change.
 *
 * Every function takes everything it touches as arguments (the API, the
 * sealer, the photo store, the sheet), so the suite runs it against the
 * stand-in in memory.
 */

import { quoteChecklist, lockQuote } from './pricing.min.js';
import { contextFor } from './seal.min.js';
import { liveItems, publishedContent, contentPrint, hasUnsent } from './store.min.js';
import { visitMinutes } from './booking.min.js';

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
        ...publishedContent(checklist),
        quote,
        booking: checklist.booking || null
    };
}

/** The API's answers that say nothing about the time itself: the request
 *  never arrived, or was refused for who sent it. */
const NOT_ABOUT_TIME = new Set(['offline', 'denied', 'server', 'too-late', 'started', 'no-booking']);
const notAboutTime = (error) => NOT_ABOUT_TIME.has(error) || /^http-/.test(String(error));

/**
 * Send every photo the checklist shows that the server does not have (with
 * its thumbnail), then delete those it no longer shows, recording each, so
 * a send that stops part way resumes. Resolves to `{ ok, error, checklist }`.
 */
async function sendPhotos({ checklist, api, sealer, photos, key, record }) {
    let c = checklist;
    const pub = () => c.published;
    const wanted = photoIdsOf(c);
    for (const photoId of wanted) {
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
            if (!put.ok) return { ok: false, error: put.error, checklist: c };
        }
        c = await record({ published: { ...pub(), photos: [...pub().photos, photoId] } });
    }
    for (const photoId of pub().photos.filter((p) => !wanted.includes(p))) {
        const gone = await api.deletePhoto(pub().id, pub().ownerToken, photoId);
        // Already gone is as good as deleted.
        if (!gone.ok && gone.status !== 404) return { ok: false, error: gone.error, checklist: c };
        c = await record({ published: { ...pub(), photos: pub().photos.filter((p) => p !== photoId) } });
    }
    return { ok: true, error: null, checklist: c };
}

/** Seal and send the checklist as it stands with `quote`, recording the
 *  version, the expiry, the quote and the fingerprint of what was sent. */
async function sendChecklist({ checklist, api, sealer, key, quote, at, record }) {
    const pub = checklist.published;
    const body = await sealer.sealJson(key, publishedForm(checklist, quote), contextFor(pub.id, 'checklist'));
    const put = await api.putChecklist(pub.id, pub.ownerToken, body);
    if (!put.ok) return { ok: false, error: put.error, checklist };
    const c = await record({
        published: { ...pub, at: pub.at || at, version: put.data.version, expiresAt: put.data.expiresAt, sent: contentPrint(checklist) },
        quote
    });
    return { ok: true, error: null, checklist: c };
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
    const sentPhotos = await sendPhotos({ checklist: c, api, sealer, photos, key, record });
    c = sentPhotos.checklist;
    if (!sentPhotos.ok) return lapsed(sentPhotos.error);

    const sent = await sendChecklist({ checklist: c, api, sealer, key, quote: lockQuote(quote, at), at, record });
    c = sent.checklist;
    if (!sent.ok) return lapsed(sent.error);
    return { ok: true, error: null, next: [], checklist: c };
}

/**
 * The quote a published checklist goes out with: the one locked at publish
 * while nothing has changed since (a quote is honored as given, PRD 9.2),
 * else a fresh one from the current sheet. `{ quote, fresh, changed }`,
 * `quote` null when the checklist cannot be priced.
 */
export function quoteToSend(checklist, sheet, at) {
    const changed = hasUnsent(checklist) || !checklist.quote;
    const fresh = quoteChecklist(sheet, checklist);
    if (!changed) return { quote: checklist.quote, fresh, changed };
    if (!fresh.lines.length || fresh.errors.length) return { quote: null, fresh, changed };
    return { quote: lockQuote(fresh, at), fresh, changed };
}

/**
 * Send a published checklist again (PLANNING 10.2), and move its visit to
 * `slot` ({ date, time }, optional). In order:
 *   1. the booking: to `slot` when one is given (or booked anew there, after
 *      a cancel); else, when the visit's length changed, the same start for
 *      the new length. A length that no longer fits there stops with
 *      `no-longer-fits` (and the next openings), so a new time is chosen
 *      before anything is sent. Inside the change window a shorter visit
 *      keeps its booking as it is, and a longer one stops with `too-late`;
 *   2. the photos added since, and those removed deleted;
 *   3. the checklist, with its quote (kept as locked, or fresh if it
 *      changed).
 * Resolves to `{ ok, error, next, checklist }`.
 */
export async function republish({ checklist, api, sealer, photos, sheet, slot = null, at, record }) {
    let c = checklist;
    const stop = (error, extra = {}) => ({ ok: false, error, next: [], checklist: c, ...extra });
    if (!c.published || !c.published.at) return stop('not-published');
    const { quote } = quoteToSend(c, sheet, at);
    if (!quote) return stop('unpriced');
    const pub = c.published;
    const minutes = visitMinutes(quote.minutes);

    if (slot) {
        const request = { date: slot.date, time: slot.time, minutes };
        const b = c.booking ? await api.rebook(pub.id, pub.ownerToken, request) : await api.book(pub.id, pub.ownerToken, request);
        if (!b.ok) return stop(b.error, { next: (b.data && b.data.next) || [] });
        c = await record({ booking: b.data.booking });
    } else if (c.booking && c.booking.minutes !== minutes) {
        const b = await api.rebook(pub.id, pub.ownerToken, { date: c.booking.date, time: c.booking.time, minutes });
        if (b.ok) c = await record({ booking: b.data.booking });
        else if (b.error === 'too-late' || b.error === 'started') {
            if (minutes > c.booking.minutes) return stop(b.error);
            // Shorter, and too close to change (or begun): the longer
            // booking stands.
        } else if (!notAboutTime(b.error)) return stop('no-longer-fits', { next: (b.data && b.data.next) || [], minutes });
        else return stop(b.error);
    }

    const key = await sealer.importKey(pub.key);
    const sentPhotos = await sendPhotos({ checklist: c, api, sealer, photos, key, record });
    c = sentPhotos.checklist;
    if (!sentPhotos.ok) return stop(sentPhotos.error);
    const sent = await sendChecklist({ checklist: c, api, sealer, key, quote, at, record });
    c = sent.checklist;
    if (!sent.ok) return stop(sent.error);
    return { ok: true, error: null, next: [], checklist: c };
}

/**
 * Cancel the visit (PRD 10.4), refused inside the change window. The
 * checklist stays published, its link and PIN working, ready for a new
 * time. The cleaner's copy is sent again without the booking, unless there
 * are changes not yet sent (the next send carries both, with its quote).
 * Resolves to `{ ok, error, checklist }`.
 */
export async function cancelVisit({ checklist, api, sealer, at, record }) {
    let c = checklist;
    const pub = c.published;
    if (!pub || !pub.at || !c.booking) return { ok: false, error: 'no-booking', checklist: c };
    const r = await api.cancelBooking(pub.id, pub.ownerToken);
    // Already gone on the server (a sweep, another device) is cancelled too.
    if (!r.ok && r.error !== 'no-booking') return { ok: false, error: r.error, checklist: c };
    c = await record({ booking: null });
    if (!hasUnsent(c) && c.quote) {
        const sent = await sendChecklist({ checklist: c, api, sealer, key: await sealer.importKey(pub.key), quote: c.quote, at, record });
        c = sent.checklist;
        // The visit is cancelled either way; a copy left showing the old time
        // is put right by the next send.
    }
    return { ok: true, error: null, checklist: c };
}

/**
 * Unpublish (PRD 13.2): the server's copy deleted now, its booking with it,
 * and this device's checklist a draft again. Refused while a booked visit is
 * inside the change window. A copy the server no longer has (expired) is
 * unpublished here too. Resolves to `{ ok, error, checklist }`.
 */
export async function unpublish({ checklist, api, record }) {
    const pub = checklist.published;
    if (!pub) return { ok: true, error: null, checklist };
    const r = await api.deleteChecklist(pub.id, pub.ownerToken);
    if (!r.ok && r.error !== 'denied') return { ok: false, error: r.error, checklist };
    const c = await record({ published: null, booking: null, quote: null });
    return { ok: true, error: null, checklist: c };
}

/**
 * The published checklist as the server has it now, as the cleaner reads
 * it: fetched with the owner token (`link`: `{ id, key, ownerToken }`),
 * opened with the key, held to the published form. Resolves to `{ ok, form,
 * version, key, error }`, `key` imported; `denied` for one that will not
 * open.
 */
export async function readPublished({ api, sealer, link }) {
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
    return { ok: true, form, version: Number(got.version) || 0, key, error: null };
}

/**
 * A published checklist opened by its edit link (PLANNING 7.3): read as
 * above, its photos and thumbnails brought into this device's photo store
 * (any that will not open are left out). Resolves to `{ ok, form, version,
 * error }`.
 */
export async function openPublished({ api, sealer, photos, link }) {
    const read = await readPublished({ api, sealer, link });
    if (!read.ok) return { ok: false, error: read.error };
    const { form, key } = read;
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
    return { ok: true, form, version: read.version, error: null };
}
