// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * api.js - One function per route of the Whitestone API (PLANNING 9.2), over
 * an injected transport.
 *
 * THE PAGES NEVER KNOW WHO ANSWERS. A transport takes a request
 *   { method, path, query, token, json, bytes }
 * and resolves to a response
 *   { status, json, bytes, version }
 * The fetch transport sends it to the server; standin.js answers it inside
 * this browser until the server runs (M3, option A). The functions below
 * read the response the same way for both, so the studio and the tasks page
 * are written once.
 *
 * EVERY CALL RESOLVES, NEVER THROWS: `{ ok, status, error, data, bytes,
 * version }`, `error` a stable code (the server's, or `offline` when the
 * request never arrived), so a caller can say something useful and queue a
 * retry.
 *
 * Pure, given its transport.
 */

/** A response read the same way whoever sent it. */
function read(res) {
    const status = res && Number.isInteger(res.status) ? res.status : 0;
    const ok = status >= 200 && status < 300;
    const json = res && res.json !== undefined ? res.json : null;
    const error = ok ? null : (json && typeof json.error === 'string' ? json.error : status ? `http-${status}` : 'offline');
    return { ok, status, error, data: json, bytes: (res && res.bytes) || null, version: (res && res.version) || null };
}

/**
 * The API over a transport. `token` arguments are the owner token or a visit
 * token, whichever the route takes. Sealed bodies are bytes (Uint8Array).
 */
export function createApi(transport) {
    const call = async (method, path, opts = {}) => {
        try {
            return read(await transport({ method, path, ...opts }));
        } catch (e) {
            return read(null);
        }
    };
    const enc = encodeURIComponent;
    return {
        health: () => call('GET', 'health'),
        /** Reserve a checklist: `{ id, ownerToken, pin, expiresAt }`. */
        reserve: () => call('POST', 'checklists'),
        putChecklist: (id, owner, bytes) => call('PUT', `checklists/${enc(id)}`, { token: owner, bytes }),
        getChecklist: (id, token) => call('GET', `checklists/${enc(id)}`, { token }),
        deleteChecklist: (id, owner) => call('DELETE', `checklists/${enc(id)}`, { token: owner }),
        /** A new PIN, every visit token revoked: `{ pin }`. */
        resetPin: (id, owner) => call('POST', `checklists/${enc(id)}/pin`, { token: owner }),
        /** The PIN for a visit token: `{ visitToken, expiresAt }`, or `denied`. */
        open: (id, pin) => call('POST', `checklists/${enc(id)}/open`, { json: { pin } }),
        putPhoto: (id, owner, photoId, bytes) => call('PUT', `checklists/${enc(id)}/photos/${enc(photoId)}`, { token: owner, bytes }),
        getPhoto: (id, token, photoId) => call('GET', `checklists/${enc(id)}/photos/${enc(photoId)}`, { token }),
        deletePhoto: (id, owner, photoId) => call('DELETE', `checklists/${enc(id)}/photos/${enc(photoId)}`, { token: owner }),
        /** A photo's thumbnail, beside it (deleted with it). */
        putThumb: (id, owner, photoId, bytes) => call('PUT', `checklists/${enc(id)}/photos/${enc(photoId)}/thumb`, { token: owner, bytes }),
        getThumb: (id, token, photoId) => call('GET', `checklists/${enc(id)}/photos/${enc(photoId)}/thumb`, { token }),
        /** A month's days, each with its status and open start times. */
        availability: (month, minutes) => call('GET', 'availability', { query: { month, minutes: String(minutes) } }),
        /** Book `{ date, time, minutes }`: `{ booking }`, or `taken` with
         *  `next` openings. */
        book: (id, owner, request) => call('POST', `checklists/${enc(id)}/booking`, { token: owner, json: request }),
        rebook: (id, owner, request) => call('PUT', `checklists/${enc(id)}/booking`, { token: owner, json: request }),
        cancelBooking: (id, owner) => call('DELETE', `checklists/${enc(id)}/booking`, { token: owner }),
        /** Start a visit (the first add-on or the report): `{ visitId }`. */
        startVisit: (id, token) => call('POST', `checklists/${enc(id)}/visits`, { token }),
        /** The visits: `{ visits: [{ visitId, createdAt, reportAt }] }`. */
        listVisits: (id, owner) => call('GET', `checklists/${enc(id)}/visits`, { token: owner }),
        /** The cleaner's sealed proposal, once. */
        putAddOn: (id, token, visitId, addonId, bytes) => call('PUT', `checklists/${enc(id)}/visits/${enc(visitId)}/addons/${enc(addonId)}`, { token, bytes }),
        /** The customer's sealed decision, once. */
        decideAddOn: (id, owner, visitId, addonId, bytes) => call('PUT', `checklists/${enc(id)}/visits/${enc(visitId)}/addons/${enc(addonId)}/decision`, { token: owner, bytes }),
        /** A visit's add-ons: `{ addons: [{ addonId, proposal, decision }] }`,
         *  each sealed and in base64url, the decision null until made. */
        listAddOns: (id, token, visitId) => call('GET', `checklists/${enc(id)}/visits/${enc(visitId)}/addons`, { token }),
        /** The cleaner's sealed report, once (`exists` after). */
        putReport: (id, token, visitId, bytes) => call('PUT', `checklists/${enc(id)}/visits/${enc(visitId)}/report`, { token, bytes }),
        /** A visit's sealed report, for the customer. */
        getReport: (id, owner, visitId) => call('GET', `checklists/${enc(id)}/visits/${enc(visitId)}/report`, { token: owner })
    };
}

/**
 * The transport to the server: `fetch` (injected), the API's base address,
 * the owner or visit token as a bearer token, sealed bodies as raw bytes and
 * the rest as small JSON. A request that never arrives is status 0.
 */
export function createFetchTransport(fetchFn, base) {
    return async ({ method, path, query = null, token = null, json = undefined, bytes = null }) => {
        const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        let body;
        if (bytes) {
            headers['Content-Type'] = 'application/octet-stream';
            body = bytes;
        } else if (json !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(json);
        }
        let res;
        try {
            res = await fetchFn(`${base}${path}${qs}`, { method, headers, body, credentials: 'omit', cache: 'no-store' });
        } catch (e) {
            return { status: 0 };
        }
        const type = (res.headers && typeof res.headers.get === 'function' && res.headers.get('Content-Type')) || '';
        const version = res.headers && typeof res.headers.get === 'function' ? res.headers.get('X-Whitestone-Version') : null;
        if (type.startsWith('application/octet-stream')) {
            return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), version };
        }
        let parsed = null;
        try {
            parsed = await res.json();
        } catch (e) {
            parsed = null;
        }
        return { status: res.status, json: parsed, version };
    };
}
