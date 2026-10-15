// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The API and its stand-in (M3, option A): api.js reads every answer the
 * same way whoever sends it, and standin.js answers the server's routes
 * inside the browser by the server's rules (PLANNING 9.2, 9.3). Held here:
 * the shapes of ids, tokens and PINs, that only hashes are kept, owner and
 * visit access, the uniform `denied`, the lockout, a PIN reset, photos, the
 * calendar and bookings by schedule.js, expiry, unpublishing, and a sealed
 * checklist that goes in and comes out without the stand-in ever holding
 * its words. Then the fetch transport the server will use.
 *
 * Runs on Node's own WebCrypto, in memory, on a clock the test moves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import { createApi, createFetchTransport } from '../www/whitestone/js/api.js';
import { createStandin, lockoutMinutes } from '../www/whitestone/js/standin.js';
import { createMemoryBackend } from '../www/whitestone/js/photos.js';
import { createSealer, contextFor } from '../www/whitestone/js/seal.js';
import { ID, SECRET } from '../www/whitestone/js/links.js';

const SCHEDULE = JSON.parse(readFileSync(join(process.cwd(), 'www', 'whitestone', 'data', 'schedule.json'), 'utf8'));
const START = Date.parse('2026-10-14T16:00:00Z');   // a Wednesday, 9:00 am in Seattle
const MIN = 60000;
const A = CONFIG.api;
const bytes = (...n) => new Uint8Array(n);

/** A stand-in on a clock the test moves, and the API over it. */
function setup({ backend = createMemoryBackend() } = {}) {
    let t = START;
    const clock = { now: () => t, advance: (ms) => { t += ms; } };
    const standin = createStandin({ backend, config: CONFIG, schedule: SCHEDULE, now: clock.now });
    const api = createApi((req) => standin.handle(req));
    return { api, standin, backend, clock };
}

/** Everything the backend holds, as text, to search for secrets. */
async function everything(backend) {
    const out = [];
    for (const key of await backend.keys()) {
        const v = await backend.get(key);
        out.push(String(key), v instanceof Uint8Array ? new TextDecoder().decode(v) : JSON.stringify(v));
    }
    return out.join('\n');
}

describe('the lockout (pure)', () => {
    test('a lock with every fifth wrong PIN in a row, longer each time, the last repeated', () => {
        const at = (n) => lockoutMinutes(n, A);
        expect([1, 2, 3, 4].map(at)).toEqual([0, 0, 0, 0]);
        expect([5, 10, 15, 20, 25, 50].map(at)).toEqual([1, 5, 30, 1440, 1440, 1440]);
        expect([6, 11, 0, -5, 2.5].map(at)).toEqual([0, 0, 0, 0, 0]);
    });
});

describe('a reservation, and only hashes kept', () => {
    test('an id, an owner token, and a six-digit PIN, none of them stored as given', async () => {
        const { api, backend } = setup();
        const r = await api.reserve();
        expect(r).toMatchObject({ ok: true, status: 201, error: null });
        const { id, ownerToken, pin, expiresAt } = r.data;
        expect(id).toMatch(ID);
        expect(ownerToken).toMatch(SECRET);
        expect(pin).toMatch(/^\d{6}$/);
        expect(Date.parse(expiresAt) - START).toBe(A.reservationMinutes * MIN);
        const kept = await everything(backend);
        expect(kept).not.toContain(ownerToken);
        expect(kept).not.toContain(pin);
        // Two reservations never share an id.
        expect((await api.reserve()).data.id).not.toBe(id);
    });
});

describe('the checklist: owner, visitor, and everyone else', () => {
    test('the owner stores and reads it, sealed, and its version climbs; a visitor reads it with the PIN', async () => {
        const { api, clock } = setup();
        const { id, ownerToken, pin } = (await api.reserve()).data;
        const put = await api.putChecklist(id, ownerToken, bytes(1, 2, 3));
        expect(put).toMatchObject({ ok: true, data: { version: 1 } });
        expect(Date.parse(put.data.expiresAt) - START).toBe(A.publishedDays * 86400000);
        const got = await api.getChecklist(id, ownerToken);
        expect([...got.bytes]).toEqual([1, 2, 3]);
        expect(got.version).toBe('1');
        expect((await api.putChecklist(id, ownerToken, bytes(4))).data.version).toBe(2);
        const opened = await api.open(id, pin);
        expect(opened.ok).toBe(true);
        expect(opened.data.visitToken).toMatch(SECRET);
        expect(Date.parse(opened.data.expiresAt) - START).toBe(A.visitHours * 3600000);
        expect([...(await api.getChecklist(id, opened.data.visitToken)).bytes]).toEqual([4]);
        // A visitor reads, but never writes.
        expect((await api.putChecklist(id, opened.data.visitToken, bytes(9))).error).toBe('denied');
        expect((await api.deleteChecklist(id, opened.data.visitToken)).error).toBe('denied');
        // The visit token expires.
        clock.advance(A.visitHours * 3600000 + 1);
        expect((await api.getChecklist(id, opened.data.visitToken)).error).toBe('denied');
    });

    test('a wrong token, a wrong PIN, and an id that was never made are all the same denied', async () => {
        const { api } = setup();
        const { id, ownerToken } = (await api.reserve()).data;
        await api.putChecklist(id, ownerToken, bytes(1));
        const never = 'A'.repeat(22);
        for (const r of [
            await api.getChecklist(id, 'B'.repeat(43)),
            await api.getChecklist(id, null),
            await api.getChecklist(never, ownerToken),
            await api.open(id, '000000'),
            await api.open(never, '123456'),
            await api.open(id, 'not-a-pin'),
            await api.open('../../etc', '123456')
        ]) expect([r.status, r.error]).toEqual([403, 'denied']);
    });

    test('five wrong PINs lock it, even to the right one, and the lock lengthens; the right PIN resets the count', async () => {
        const { api, clock } = setup();
        const { id, ownerToken, pin } = (await api.reserve()).data;
        await api.putChecklist(id, ownerToken, bytes(1));
        const wrong = pin === '111111' ? '222222' : '111111';
        for (let i = 0; i < 4; i++) await api.open(id, wrong);
        expect((await api.open(id, pin)).ok).toBe(true);   // four, then right: the count resets
        for (let i = 0; i < 4; i++) await api.open(id, wrong);
        expect((await api.open(id, pin)).ok).toBe(true);   // four more are not the fifth
        expect((await api.open(id, pin)).ok).toBe(true);
        for (let i = 0; i < 5; i++) await api.open(id, wrong);
        expect((await api.open(id, pin)).error).toBe('denied');
        clock.advance(1 * MIN + 1);
        // Unlocked; five more wrong lock it for five minutes this time.
        for (let i = 0; i < 5; i++) await api.open(id, wrong);
        clock.advance(1 * MIN + 1);
        expect((await api.open(id, pin)).error).toBe('denied');
        clock.advance(4 * MIN);
        expect((await api.open(id, pin)).ok).toBe(true);
    });

    test('a new PIN: the old one no longer opens it, and every visit token is revoked', async () => {
        const { api } = setup();
        const { id, ownerToken, pin } = (await api.reserve()).data;
        await api.putChecklist(id, ownerToken, bytes(1));
        const visit = (await api.open(id, pin)).data.visitToken;
        const reset = await api.resetPin(id, ownerToken);
        expect(reset.data.pin).toMatch(/^\d{6}$/);
        expect((await api.getChecklist(id, visit)).error).toBe('denied');
        if (reset.data.pin !== pin) expect((await api.open(id, pin)).error).toBe('denied');
        expect((await api.open(id, reset.data.pin)).ok).toBe(true);
        expect((await api.resetPin(id, visit)).error).toBe('denied');
    });

    test('photos: the owner stores and removes them, a visitor only reads', async () => {
        const { api } = setup();
        const { id, ownerToken, pin } = (await api.reserve()).data;
        const photo = 'P'.repeat(22);
        expect((await api.putPhoto(id, ownerToken, photo, bytes(7, 7))).ok).toBe(true);
        const visit = (await api.open(id, pin)).data.visitToken;
        expect([...(await api.getPhoto(id, visit, photo)).bytes]).toEqual([7, 7]);
        expect((await api.putPhoto(id, visit, photo, bytes(1))).error).toBe('denied');
        expect((await api.deletePhoto(id, ownerToken, photo)).ok).toBe(true);
        expect((await api.getPhoto(id, ownerToken, photo)).status).toBe(404);
        expect((await api.putPhoto(id, ownerToken, photo, bytes())).error).toBe('bad-request');
        expect((await api.getPhoto(id, ownerToken, '../x')).status).toBe(404);
    });

    test('unpublishing forgets the checklist, its photos and its booking', async () => {
        const { api, backend } = setup();
        const { id, ownerToken } = (await api.reserve()).data;
        await api.putChecklist(id, ownerToken, bytes(1));
        await api.putPhoto(id, ownerToken, 'P'.repeat(22), bytes(2));
        await api.book(id, ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 });
        expect((await api.deleteChecklist(id, ownerToken)).ok).toBe(true);
        expect(await backend.keys()).toEqual(['bookings']);
        expect(await backend.get('bookings')).toEqual([]);
        expect((await api.getChecklist(id, ownerToken)).error).toBe('denied');
    });
});

describe('the calendar and bookings, by schedule.js', () => {
    test('a month: each day\'s status and its open start times', async () => {
        const { api } = setup();
        const r = await api.availability('2026-10', 120);
        expect(r.ok).toBe(true);
        const day = (date) => r.data.days.find((d) => d.date === date);
        expect(r.data.days).toHaveLength(31);
        expect(day('2026-10-18').status).toBe('closed');            // a Sunday
        expect(day('2026-10-16')).toMatchObject({ status: 'open' });  // a Friday
        expect(day('2026-10-16').times[0]).toBe('08:00');
        expect(day('2026-10-16').times).not.toContain('19:00');      // two hours would run past closing
        expect(day('2026-10-14').times).toEqual([]);                  // inside the day's notice
        for (const bad of [['2026-13', 120], ['nope', 120], ['2026-10', 0], ['2026-10', 99999]]) {
            expect((await api.availability(...bad)).error).toBe('bad-request');
        }
    });

    test('a time booked, the day then full for the next checklist, which is offered the next openings', async () => {
        const { api } = setup();
        const one = (await api.reserve()).data;
        const two = (await api.reserve()).data;
        const b = await api.book(one.id, one.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 });
        expect(b).toMatchObject({ ok: true, status: 201, data: { booking: { date: '2026-10-16', time: '09:00', minutes: 120 } } });
        expect(b.data.booking.start).toBe('2026-10-16T09:00:00-07:00');
        expect(b.data.booking).not.toHaveProperty('cleaner');
        expect((await api.availability('2026-10', 120)).data.days.find((d) => d.date === '2026-10-16')).toMatchObject({ status: 'full', times: [] });
        const taken = await api.book(two.id, two.ownerToken, { date: '2026-10-16', time: '11:00', minutes: 120 });
        expect([taken.status, taken.error]).toEqual([409, 'taken']);
        expect(taken.data.next).toEqual([
            { date: '2026-10-17', time: '08:00' }, { date: '2026-10-17', time: '08:30' }, { date: '2026-10-17', time: '09:00' }
        ]);
        expect((await api.book(one.id, one.ownerToken, { date: '2026-10-19', time: '09:00', minutes: 120 })).error).toBe('already-booked');
        for (const [req, error] of [
            [{ date: '2026-10-19', time: '09:10', minutes: 120 }, 'off-step'],
            [{ date: '2026-10-18', time: '09:00', minutes: 120 }, 'closed'],
            [{ date: 'soon', time: '09:00', minutes: 120 }, 'bad-request']
        ]) {
            const r = await api.book(two.id, two.ownerToken, req);
            expect([r.status, r.error]).toEqual([422, error]);
        }
        expect((await api.book(two.id, one.ownerToken, { date: '2026-10-19', time: '09:00', minutes: 60 })).error).toBe('denied');
    });

    test('a reschedule frees the old time; a change or a cancel is refused inside the cancel window', async () => {
        const { api, clock } = setup();
        const one = (await api.reserve()).data;
        // Published, so it outlasts the days the clock moves on.
        await api.putChecklist(one.id, one.ownerToken, bytes(1));
        await api.book(one.id, one.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 });
        const moved = await api.rebook(one.id, one.ownerToken, { date: '2026-10-19', time: '10:00', minutes: 150 });
        expect(moved).toMatchObject({ ok: true, status: 200, data: { booking: { date: '2026-10-19', minutes: 150 } } });
        const days = (await api.availability('2026-10', 120)).data.days;
        expect(days.find((d) => d.date === '2026-10-16').status).toBe('open');
        // The day before, inside the 24 hours: neither change nor cancel.
        clock.advance(Date.parse('2026-10-18T11:00:00-07:00') - START);
        expect((await api.rebook(one.id, one.ownerToken, { date: '2026-10-21', time: '10:00', minutes: 150 })).error).toBe('too-late');
        expect((await api.cancelBooking(one.id, one.ownerToken)).error).toBe('too-late');
        const two = (await api.reserve()).data;
        expect((await api.cancelBooking(two.id, two.ownerToken)).error).toBe('no-booking');
        expect((await api.rebook(two.id, two.ownerToken, { date: '2026-10-21', time: '10:00', minutes: 60 })).error).toBe('no-booking');
    });

    test('a cancel frees the time', async () => {
        const { api } = setup();
        const one = (await api.reserve()).data;
        await api.book(one.id, one.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 });
        expect((await api.cancelBooking(one.id, one.ownerToken)).data).toEqual({ cancelled: true });
        expect((await api.availability('2026-10', 120)).data.days.find((d) => d.date === '2026-10-16').status).toBe('open');
    });
});

describe('expiry', () => {
    test('a reservation never published expires in an hour, and its booking with it', async () => {
        const { api, clock } = setup();
        const one = (await api.reserve()).data;
        await api.book(one.id, one.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 });
        clock.advance(A.reservationMinutes * MIN);
        expect((await api.availability('2026-10', 120)).data.days.find((d) => d.date === '2026-10-16').status).toBe('open');
        expect((await api.putChecklist(one.id, one.ownerToken, bytes(1))).error).toBe('denied');
    });

    test('a lapsed reservation\'s time is free to book at once, without a calendar asked first', async () => {
        const { api, clock } = setup();
        const one = (await api.reserve()).data;
        await api.book(one.id, one.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 });
        clock.advance(A.reservationMinutes * MIN);
        const two = (await api.reserve()).data;
        expect((await api.book(two.id, two.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 120 })).ok).toBe(true);
    });

    test('a published checklist lasts ninety days from its last change', async () => {
        const { api, clock } = setup();
        const one = (await api.reserve()).data;
        await api.putChecklist(one.id, one.ownerToken, bytes(1));
        clock.advance(60 * 86400000);
        await api.putChecklist(one.id, one.ownerToken, bytes(2));
        clock.advance(89 * 86400000);
        expect((await api.getChecklist(one.id, one.ownerToken)).ok).toBe(true);
        clock.advance(86400000);
        expect((await api.getChecklist(one.id, one.ownerToken)).error).toBe('denied');
    });
});

describe('sealed in, sealed out', () => {
    test('a checklist sealed with its key goes through, and the stand-in never holds its words or its key', async () => {
        const { api, backend } = setup();
        const sealer = createSealer();
        const { id, ownerToken, pin } = (await api.reserve()).data;
        const key = await sealer.generateKey();
        const words = { title: 'Maple Street', note: 'Juniper the dog is friendly' };
        await api.putChecklist(id, ownerToken, await sealer.sealJson(key, words, contextFor(id, 'checklist')));
        const visit = (await api.open(id, pin)).data.visitToken;
        const back = await api.getChecklist(id, visit);
        expect(await sealer.openJson(key, back.bytes, contextFor(id, 'checklist'))).toEqual(words);
        const kept = await everything(backend);
        expect(kept).not.toContain('Maple Street');
        expect(kept).not.toContain('Juniper');
        expect(kept).not.toContain(await sealer.exportKey(key));
    });
});

describe('a visit and its add-ons (M4 piece 3)', () => {
    /** A published checklist, opened by a cleaner. */
    async function visited() {
        const w = setup();
        const { id, ownerToken, pin } = (await w.api.reserve()).data;
        await w.api.putChecklist(id, ownerToken, bytes(1));
        const visit = (await w.api.open(id, pin)).data.visitToken;
        return { ...w, id, owner: ownerToken, visit };
    }
    const addonId = (n) => `addon${String(n).padStart(17, '0')}`;

    test('a cleaner starts a visit; the customer lists it but never starts one', async () => {
        const { api, id, owner, visit } = await visited();
        expect((await api.startVisit(id, owner)).error).toBe('denied');
        expect((await api.startVisit(id, null)).error).toBe('denied');
        const started = await api.startVisit(id, visit);
        expect(started).toMatchObject({ ok: true, status: 201 });
        expect(started.data.visitId).toMatch(ID);
        const listed = await api.listVisits(id, owner);
        expect(listed.data.visits).toEqual([{ visitId: started.data.visitId, createdAt: new Date(START).toISOString(), reportAt: null }]);
        expect((await api.listVisits(id, visit)).error).toBe('denied');
    });

    test('the cleaner proposes once, the customer decides once, and both read where it stands', async () => {
        const { api, id, owner, visit, backend } = await visited();
        const v = (await api.startVisit(id, visit)).data.visitId;
        const a = addonId(1);
        // Only the cleaner proposes, and only a small sealed body.
        expect((await api.putAddOn(id, owner, v, a, bytes(1))).error).toBe('denied');
        expect((await api.putAddOn(id, visit, v, a, null)).error).toBe('bad-request');
        expect((await api.putAddOn(id, visit, v, a, new Uint8Array(A.maxSmallBytes + 1))).error).toBe('bad-request');
        expect((await api.putAddOn(id, visit, v, 'short', bytes(1))).status).toBe(404);
        expect((await api.putAddOn(id, visit, 'B'.repeat(22), a, bytes(1))).status).toBe(404);
        expect(await api.putAddOn(id, visit, v, a, bytes(7, 7))).toMatchObject({ ok: true, status: 201 });
        // Never rewritten: what the customer decides is what was proposed.
        expect((await api.putAddOn(id, visit, v, a, bytes(8))).error).toBe('exists');
        const waiting = await api.listAddOns(id, visit, v);
        expect(waiting.data.addons).toEqual([{ addonId: a, proposal: 'Bwc', decision: null }]);
        // Only the customer decides, once, and only what was proposed.
        expect((await api.decideAddOn(id, visit, v, a, bytes(1))).error).toBe('denied');
        expect((await api.decideAddOn(id, owner, v, addonId(2), bytes(1))).status).toBe(404);
        expect((await api.decideAddOn(id, owner, v, a, null)).error).toBe('bad-request');
        expect(await api.decideAddOn(id, owner, v, a, bytes(9))).toMatchObject({ ok: true, status: 201 });
        expect((await api.decideAddOn(id, owner, v, a, bytes(10))).error).toBe('decided');
        expect((await api.listAddOns(id, owner, v)).data.addons[0].decision).toBe('CQ');
        expect((await api.listAddOns(id, 'C'.repeat(43), v)).error).toBe('denied');
        // Unpublishing takes the visit with it.
        await api.deleteChecklist(id, owner);
        expect((await backend.keys()).filter((k) => String(k).includes('/visit/'))).toEqual([]);
    });

    test('a visit takes up to its add-ons, and the oldest visit goes past the most kept', async () => {
        const { api, id, owner, visit, backend } = await visited();
        const first = (await api.startVisit(id, visit)).data.visitId;
        for (let n = 0; n < A.maxAddOns; n++) expect((await api.putAddOn(id, visit, first, addonId(n), bytes(1))).ok).toBe(true);
        expect((await api.putAddOn(id, visit, first, addonId(99), bytes(1))).error).toBe('too-many');
        for (let n = 1; n < A.maxVisits; n++) await api.startVisit(id, visit);
        expect((await api.listVisits(id, owner)).data.visits).toHaveLength(A.maxVisits);
        await api.startVisit(id, visit);
        const left = (await api.listVisits(id, owner)).data.visits;
        expect(left).toHaveLength(A.maxVisits);
        expect(left.map((x) => x.visitId)).not.toContain(first);
        expect((await backend.keys()).filter((k) => String(k).includes(first))).toEqual([]);
        expect((await api.listAddOns(id, visit, first)).status).toBe(404);
    });

    test('wrong methods and shapes under visits answer plainly', async () => {
        const { standin, api, id, visit } = await visited();
        const v = (await api.startVisit(id, visit)).data.visitId;
        const ask = (method, path) => standin.handle({ method, path, token: visit });
        expect((await ask('PUT', `checklists/${id}/visits`)).status).toBe(405);
        expect((await ask('POST', `checklists/${id}/visits/${v}/addons`)).status).toBe(405);
        expect((await ask('GET', `checklists/${id}/visits/${v}/addons/${addonId(1)}`)).status).toBe(405);
        expect((await ask('GET', `checklists/${id}/visits/${v}/addons/${addonId(1)}/decision`)).status).toBe(405);
        expect((await ask('GET', `checklists/${id}/visits/${v}/report`)).status).toBe(404);
        expect((await ask('GET', `checklists/${'A'.repeat(22)}/visits/${v}/addons`)).json.error).toBe('denied');
    });
});

describe('routes and failures', () => {
    test('unknown paths, wrong methods, and a backend that breaks all answer, never throw', async () => {
        const { standin } = setup();
        const ask = (method, path) => standin.handle({ method, path });
        expect((await ask('GET', 'health')).json).toEqual({ ok: true, standin: true });
        expect((await ask('POST', 'health')).status).toBe(405);
        expect((await ask('GET', 'nope')).status).toBe(404);
        expect((await ask('GET', 'checklists//x')).status).toBe(404);
        expect((await ask('GET', 'checklists')).status).toBe(405);
        expect((await ask('POST', 'availability')).status).toBe(405);
        expect((await ask('GET', `checklists/${'A'.repeat(22)}/pin`)).status).toBe(405);
        expect((await ask('GET', `checklists/${'A'.repeat(22)}/open`)).status).toBe(405);
        expect((await ask('GET', `checklists/${'A'.repeat(22)}/booking`)).status).toBe(405);
        expect((await ask('PATCH', `checklists/${'A'.repeat(22)}`)).status).toBe(405);
        expect((await ask('GET', `checklists/${'A'.repeat(22)}/elsewhere/x`)).status).toBe(404);
        expect((await standin.handle(null)).status).toBe(404);
        const broken = { get: () => Promise.reject(new Error('disk')), put: () => Promise.reject(new Error('disk')), delete: async () => {}, keys: async () => [] };
        const bad = createApi((req) => setup({ backend: broken }).standin.handle(req));
        expect((await bad.reserve())).toMatchObject({ ok: false, status: 500, error: 'server' });
    });
});

describe('api.js reads every answer alike', () => {
    test('ok, a server\'s error code, a bare status, and a request that never arrived', async () => {
        const answers = [{ status: 200, json: { a: 1 } }, { status: 409, json: { error: 'taken', next: [] } }, { status: 502 }, null];
        const api = createApi(async () => answers.shift());
        expect(await api.health()).toEqual({ ok: true, status: 200, error: null, data: { a: 1 }, bytes: null, version: null });
        expect(await api.health()).toMatchObject({ ok: false, status: 409, error: 'taken', data: { next: [] } });
        expect(await api.health()).toMatchObject({ ok: false, status: 502, error: 'http-502' });
        expect(await api.health()).toMatchObject({ ok: false, status: 0, error: 'offline' });
        const throws = createApi(async () => { throw new Error('gone'); });
        expect(await throws.reserve()).toMatchObject({ ok: false, error: 'offline' });
    });

    test('every route goes where PLANNING 9.2 puts it, with its token and its body', async () => {
        const seen = [];
        const api = createApi(async (req) => { seen.push(req); return { status: 200, json: {} }; });
        const id = 'A'.repeat(22);
        await api.reserve();
        await api.putChecklist(id, 'o', bytes(1));
        await api.getChecklist(id, 'v');
        await api.deleteChecklist(id, 'o');
        await api.resetPin(id, 'o');
        await api.open(id, '123456');
        await api.putPhoto(id, 'o', 'p', bytes(2));
        await api.getPhoto(id, 'v', 'p');
        await api.deletePhoto(id, 'o', 'p');
        await api.availability('2026-10', 90);
        await api.book(id, 'o', { date: 'd' });
        await api.rebook(id, 'o', { date: 'd' });
        await api.cancelBooking(id, 'o');
        expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual([
            'POST checklists', `PUT checklists/${id}`, `GET checklists/${id}`, `DELETE checklists/${id}`, `POST checklists/${id}/pin`,
            `POST checklists/${id}/open`, `PUT checklists/${id}/photos/p`, `GET checklists/${id}/photos/p`, `DELETE checklists/${id}/photos/p`,
            'GET availability', `POST checklists/${id}/booking`, `PUT checklists/${id}/booking`, `DELETE checklists/${id}/booking`
        ]);
        expect(seen[1]).toMatchObject({ token: 'o', bytes: bytes(1) });
        expect(seen[5]).toMatchObject({ json: { pin: '123456' } });
        expect(seen[9]).toMatchObject({ query: { month: '2026-10', minutes: '90' } });
        // Untrusted parts of a path are escaped.
        await api.getPhoto('a/b', 'v', '../c');
        expect(seen[seen.length - 1].path).toBe('checklists/a%2Fb/photos/..%2Fc');
    });
});

describe('the fetch transport (the server, later)', () => {
    const headers = (map) => ({ get: (k) => map[k] || null });

    test('a bearer token, raw bytes or small JSON, no cookies, and the answer read by its type', async () => {
        const calls = [];
        const fetchFn = async (url, init) => {
            calls.push([url, init]);
            if (init.method === 'GET') return { status: 200, headers: headers({ 'Content-Type': 'application/octet-stream', 'X-Whitestone-Version': '3' }), arrayBuffer: async () => bytes(5, 6).buffer };
            return { status: 201, headers: headers({ 'Content-Type': 'application/json' }), json: async () => ({ id: 'x' }) };
        };
        const api = createApi(createFetchTransport(fetchFn, '/api/whitestone/'));
        const got = await api.getChecklist('A'.repeat(22), 'tok');
        expect([...got.bytes]).toEqual([5, 6]);
        expect(got.version).toBe('3');
        expect(calls[0][0]).toBe(`/api/whitestone/checklists/${'A'.repeat(22)}`);
        expect(calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer tok' } });
        await api.putChecklist('A'.repeat(22), 'tok', bytes(1));
        expect(calls[1][1].headers['Content-Type']).toBe('application/octet-stream');
        expect(calls[1][1].body).toEqual(bytes(1));
        const opened = await api.open('A'.repeat(22), '123456');
        expect(opened.data).toEqual({ id: 'x' });
        expect(calls[2][1]).toMatchObject({ body: '{"pin":"123456"}', headers: { 'Content-Type': 'application/json' } });
        expect(calls[2][1].headers.Authorization).toBeUndefined();
        await api.availability('2026-10', 60);
        expect(calls[3][0]).toBe('/api/whitestone/availability?month=2026-10&minutes=60');
    });

    test('a network failure is offline, and a body that is not JSON is no data', async () => {
        const down = createApi(createFetchTransport(async () => { throw new Error('net'); }, '/x/'));
        expect(await down.health()).toMatchObject({ ok: false, status: 0, error: 'offline' });
        const odd = createApi(createFetchTransport(async () => ({ status: 500, headers: headers({}), json: async () => { throw new Error('html'); } }), '/x/'));
        expect(await odd.health()).toMatchObject({ ok: false, status: 500, error: 'http-500', data: null });
    });
});
