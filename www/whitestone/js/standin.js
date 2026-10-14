// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * standin.js - The Whitestone API answered inside this browser, until the
 * server runs (M3, option A: Steve, 2026-10-14).
 *
 * THE SAME ROUTES, THE SAME RULES. It takes exactly the requests api.js
 * sends the server (PLANNING 9.2) and answers as the server will: ids,
 * tokens and the PIN from the browser's random numbers; tokens kept only as
 * hashes, the PIN salted and stretched; five wrong PINs in a row lock a
 * checklist for longer each time, and every refusal to open is the same
 * `denied`, so an id that does not exist looks like a wrong PIN; a
 * reservation expires in an hour without a checklist, a published one 90
 * days after its last change; bookings are checked by the very schedule.js
 * the server will run, so a time the calendar offers is a time it books.
 *
 * WHAT IT CANNOT STAND IN FOR. It lives in this browser's own IndexedDB
 * database, so a share link opens only in this browser on this device (the
 * studio and the tasks page share it, which is what the demo needs), and two
 * tabs booking at the same instant are not held to one lock as the server's
 * are. The receipt says so (copy.js).
 *
 * SEALED BLOBS STAY SEALED. Checklists and photos arrive sealed with the
 * checklist's key (seal.js), which never reaches here, exactly as it never
 * reaches the server.
 *
 * Everything outside is injected (`backend`, the four-method store of
 * photos.js; `now`; `getRandomValues`; `subtle`), so the suite runs it in
 * memory.
 */

import { checkBooking, openStarts, monthView, canChange } from './schedule.min.js';
import { addDays, isDate } from './zoned.min.js';
import { toBase64url } from './seal.min.js';
import { ID } from './links.min.js';

const MINUTE_MS = 60000;
const DAY_MS = 86400000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PIN = /^\d{6}$/;

/** How long a checklist stays locked after `fails` wrong PINs in a row:
 *  minutes, or 0. A lock comes with every `every`th, each longer than the
 *  last, the last step repeated. Pure. */
export function lockoutMinutes(fails, { lockoutEvery: every, lockoutMinutes: steps }) {
    if (!Number.isInteger(fails) || fails < every || fails % every !== 0) return 0;
    return steps[Math.min(fails / every - 1, steps.length - 1)];
}

/**
 * The stand-in: `{ handle(request) }`, `request` and its answer as api.js's
 * transport has them. `schedule` is the built data/schedule.json.
 */
export function createStandin({
    backend, config, schedule, now = () => Date.now(),
    getRandomValues = (a) => globalThis.crypto.getRandomValues(a),
    subtle = globalThis.crypto && globalThis.crypto.subtle
}) {
    const A = config.api;
    const encoder = new TextEncoder();
    const answer = (status, json) => ({ status, json });
    const fail = (status, error, extra = {}) => answer(status, { error, ...extra });
    const denied = () => fail(403, 'denied');

    const random = (n) => toBase64url(getRandomValues(new Uint8Array(n)));
    const newPin = () => {
        // Six digits, every one as likely: draws past the last whole
        // million are thrown back.
        const words = new Uint32Array(1);
        for (;;) {
            getRandomValues(words);
            if (words[0] < 4294000000) return String(words[0] % 1000000).padStart(6, '0');
        }
    };
    const digest = async (text) => toBase64url(new Uint8Array(await subtle.digest('SHA-256', encoder.encode(text))));
    const stretch = async (pin, salt) => {
        const base = await subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
        const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: A.pinIterations }, base, 256);
        return toBase64url(new Uint8Array(bits));
    };

    // ---- What it keeps -------------------------------------------------------

    const metaKey = (id) => `meta/${id}`;
    const blobKey = (id, name) => `blob/${id}/${name}`;

    async function forget(id) {
        for (const key of await backend.keys()) {
            if (key === metaKey(id) || String(key).startsWith(`blob/${id}/`)) await backend.delete(key);
        }
        await saveBookings((await bookings()).filter((b) => b.id !== id));
    }

    /** A checklist's bookkeeping, or null; one past its expiry is
     *  forgotten on the spot, as the server's sweep would. */
    async function meta(id) {
        const m = await backend.get(metaKey(id));
        if (!m) return null;
        if (m.expiresAt <= now()) {
            await forget(id);
            return null;
        }
        return m;
    }
    const saveMeta = (m) => backend.put(metaKey(m.id), m);

    /** Every checklist past its expiry forgotten, and its booking with it,
     *  before a question about times: an abandoned reservation releases
     *  its slot (PLANNING 10.1). */
    async function sweep() {
        for (const key of await backend.keys()) {
            if (String(key).startsWith('meta/')) await meta(String(key).slice(5));
        }
    }
    const bookings = async () => (await backend.get('bookings')) || [];
    const saveBookings = (list) => backend.put('bookings', list);

    async function isOwner(m, token) {
        return Boolean(m && typeof token === 'string' && token && (await digest(token)) === m.ownerHash);
    }
    async function isVisitor(m, token) {
        if (!m || typeof token !== 'string' || !token) return false;
        const h = await digest(token);
        return m.visits.some((v) => v.hash === h && v.expiresAt > now());
    }

    // ---- The routes -----------------------------------------------------------

    async function reserve() {
        const id = random(16);
        const ownerToken = random(32);
        const pin = newPin();
        const salt = random(16);
        const at = now();
        const m = {
            id, ownerHash: await digest(ownerToken), pinSalt: salt, pinHash: await stretch(pin, salt),
            fails: 0, lockedUntil: 0, visits: [], version: 0, createdAt: at, publishedAt: null,
            expiresAt: at + A.reservationMinutes * MINUTE_MS
        };
        await saveMeta(m);
        return answer(201, { id, ownerToken, pin, expiresAt: new Date(m.expiresAt).toISOString() });
    }

    async function putChecklist(m, bytes) {
        if (!(bytes instanceof Uint8Array) || !bytes.length) return fail(400, 'bad-request');
        const at = now();
        await backend.put(blobKey(m.id, 'checklist'), bytes);
        const next = { ...m, version: m.version + 1, publishedAt: m.publishedAt || at, expiresAt: at + A.publishedDays * DAY_MS };
        await saveMeta(next);
        return answer(200, { version: next.version, expiresAt: new Date(next.expiresAt).toISOString() });
    }

    async function open(id, body) {
        const m = ID.test(id) ? await meta(id) : null;
        const pin = body && typeof body.pin === 'string' ? body.pin : '';
        if (!m || !PIN.test(pin) || m.lockedUntil > now()) return denied();
        if ((await stretch(pin, m.pinSalt)) !== m.pinHash) {
            const fails = m.fails + 1;
            const lock = lockoutMinutes(fails, A);
            await saveMeta({ ...m, fails, lockedUntil: lock ? now() + lock * MINUTE_MS : m.lockedUntil });
            return denied();
        }
        const visitToken = random(32);
        const expiresAt = now() + A.visitHours * 3600000;
        const visits = [...m.visits.filter((v) => v.expiresAt > now()), { hash: await digest(visitToken), expiresAt }];
        await saveMeta({ ...m, fails: 0, lockedUntil: 0, visits });
        return answer(200, { visitToken, expiresAt: new Date(expiresAt).toISOString() });
    }

    /** The first openings from `date` on, for a time refused as taken. */
    function nextOpenings(list, date, minutes) {
        const out = [];
        for (let d = date, n = 0; n < 31 && out.length < A.nextOpenings; d = addDays(d, 1), n++) {
            for (const time of openStarts(schedule, list, d, minutes, now())) {
                out.push({ date: d, time });
                if (out.length >= A.nextOpenings) break;
            }
        }
        return out;
    }

    async function book(m, body, method) {
        await sweep();
        const all = await bookings();
        const mine = all.find((b) => b.id === m.id) || null;
        if (method === 'DELETE') {
            if (!mine) return fail(404, 'no-booking');
            if (!canChange(schedule, mine, now())) return fail(409, 'too-late');
            await saveBookings(all.filter((b) => b !== mine));
            return answer(200, { cancelled: true });
        }
        if (method === 'POST' && mine) return fail(409, 'already-booked');
        if (method === 'PUT') {
            if (!mine) return fail(404, 'no-booking');
            if (!canChange(schedule, mine, now())) return fail(409, 'too-late');
        }
        const { date, time, minutes } = body || {};
        const others = all.filter((b) => b !== mine);
        const check = checkBooking(schedule, others, date, time, minutes, now());
        if (!check.ok) {
            return check.error === 'taken'
                ? fail(409, 'taken', { next: nextOpenings(others, date, minutes) })
                : fail(422, check.error);
        }
        const booking = { id: m.id, date, time, minutes, start: check.start, end: check.end, cleaner: check.cleaner };
        await saveBookings([...others, booking]);
        return answer(method === 'POST' ? 201 : 200, { booking: { date, time, minutes, start: check.start, end: check.end } });
    }

    function availability(query) {
        const month = query && query.month;
        const minutes = Number(query && query.minutes);
        if (!MONTH.test(String(month)) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null;
        return sweep().then(() => bookings()).then((list) => answer(200, {
            month,
            days: monthView(schedule, list, month, minutes, now()).map((d) => ({
                date: d.date, status: d.status, holiday: d.holiday,
                times: d.status === 'open' && isDate(d.date) ? openStarts(schedule, list, d.date, minutes, now()) : []
            }))
        }));
    }

    async function route({ method, path, query = null, token = null, json = undefined, bytes = null }) {
        const parts = String(path || '').split('/');
        if (parts.some((p) => !p)) return fail(404, 'not-found');
        if (parts.length === 1 && parts[0] === 'health') return method === 'GET' ? answer(200, { ok: true, standin: true }) : fail(405, 'method');
        if (parts.length === 1 && parts[0] === 'availability') {
            if (method !== 'GET') return fail(405, 'method');
            return (await availability(query)) || fail(400, 'bad-request');
        }
        if (parts[0] !== 'checklists') return fail(404, 'not-found');
        if (parts.length === 1) return method === 'POST' ? reserve() : fail(405, 'method');
        const id = parts[1];
        // Opening with the PIN takes no token, and answers every refusal alike.
        if (parts.length === 3 && parts[2] === 'open') return method === 'POST' ? open(id, json) : fail(405, 'method');
        const m = ID.test(id) ? await meta(id) : null;
        const owner = await isOwner(m, token);
        const reader = owner || (await isVisitor(m, token));
        if (parts.length === 2) {
            if (method === 'PUT') return owner ? putChecklist(m, bytes) : denied();
            if (method === 'DELETE') {
                if (!owner) return denied();
                // Unpublishing cancels the visit, so it keeps the
                // cancel window's rule (PRD 10.4).
                const mine = (await bookings()).find((b) => b.id === id);
                if (mine && !canChange(schedule, mine, now())) return fail(409, 'too-late');
                await forget(id);
                return answer(200, { deleted: true });
            }
            if (method !== 'GET') return fail(405, 'method');
            if (!reader) return denied();
            const blob = await backend.get(blobKey(id, 'checklist'));
            return blob ? { status: 200, bytes: blob, version: String(m.version) } : fail(404, 'not-found');
        }
        if (parts.length === 3 && parts[2] === 'pin') {
            if (method !== 'POST') return fail(405, 'method');
            if (!owner) return denied();
            const pin = newPin();
            const salt = random(16);
            await saveMeta({ ...m, pinSalt: salt, pinHash: await stretch(pin, salt), fails: 0, lockedUntil: 0, visits: [] });
            return answer(200, { pin });
        }
        if (parts.length === 3 && parts[2] === 'booking') {
            if (!['POST', 'PUT', 'DELETE'].includes(method)) return fail(405, 'method');
            return owner ? book(m, json, method) : denied();
        }
        const thumb = parts.length === 5 && parts[4] === 'thumb';
        if ((parts.length === 4 || thumb) && parts[2] === 'photos' && ID.test(parts[3])) {
            const key = blobKey(id, `photo/${parts[3]}${thumb ? '/thumb' : ''}`);
            if (method === 'GET') {
                if (!reader) return denied();
                const blob = await backend.get(key);
                return blob ? { status: 200, bytes: blob } : fail(404, 'not-found');
            }
            if (!owner) return denied();
            if (method === 'PUT') {
                if (!(bytes instanceof Uint8Array) || !bytes.length) return fail(400, 'bad-request');
                await backend.put(key, bytes);
                return answer(200, { stored: true });
            }
            if (method === 'DELETE') {
                // A photo goes with its thumbnail.
                await backend.delete(key);
                if (!thumb) await backend.delete(`${key}/thumb`);
                return answer(200, { deleted: true });
            }
            return fail(405, 'method');
        }
        return fail(404, 'not-found');
    }

    return {
        /** One request, answered as the server would. Never throws. */
        async handle(request) {
            try {
                return await route(request || {});
            } catch (e) {
                return fail(500, 'server');
            }
        }
    };
}
