// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - The saved document: what it looks like, how it changes, and the
 * one place it touches localStorage.
 *
 * THE DOCUMENT IS THE SOURCE OF TRUTH AND THE OFFICE IS A PROJECTION OF IT.
 * Every mutation below takes a document and returns a NEW one, leaving the
 * argument untouched. That is what makes undo free (log.js keeps the old
 * documents), lets the scene compare references to see what changed, and lets
 * a test assert its input was not written to. Structural sharing keeps it
 * cheap: an edit to one application copies the applications array and that
 * one record, and nothing else.
 *
 * EVERY MUTATION RETURNS `{ doc, record, error }`. On a refusal `doc` is the
 * document handed in, unchanged, and `error` is a sentence fit to show the
 * visitor. Every successful mutation also appends to the activity log.
 *
 * NOTHING IS DELETED OUTRIGHT. Deleting sets `deletedAt`, which puts the
 * record in the wastebasket, and restoring clears it. An application takes
 * its events and follow-ups into the wastebasket with it, stamped with the
 * same moment, and restoring it brings back exactly those, not ones that were
 * thrown away separately before. Only emptying the wastebasket (`purge`)
 * removes anything for good. A contact in the wastebasket keeps its links, so
 * restoring it puts it back everywhere it was.
 *
 * THE ONLY FILE THAT WRITES localStorage. `createStore` takes the storage
 * object as an argument rather than reaching for the global, so the suite
 * hands it a Map, and tests/privacy.test.mjs names this file and no other.
 *
 * THREE GUARDS ON EVERY SAVE, from the garden and Prospect City, where each
 * one was a real bug first:
 *   - nothing is written after teardown, because teardown is when the scene
 *     empties itself and a late save could only put nothing over something;
 *   - nothing is written once the browser has refused once, because private
 *     windows refuse forever and the visitor has already been told;
 *   - nothing is written if the key was seen and is now gone, because that is
 *     another tab clearing it on purpose and a save must not resurrect it.
 *
 * UNTRUSTED INPUT. A restored backup file and whatever another tab wrote both
 * come through `validate`, which rebuilds every record field by field from
 * the tables below. Anything unknown is dropped, every string is capped, and
 * a link is kept only if it is http or https, so a `javascript:` address can
 * never reach an href.
 *
 * DATES ARE LOCAL STRINGS. See dates.js. This file validates their shape and
 * never converts them.
 */

import { isDateString, isDateTimeString, today, formatDateTime } from './dates.min.js';
import { newId } from './ids.min.js';
import { appendLog, normalizeLog } from './log.min.js';

export const COLLECTIONS = ['applications', 'events', 'contacts', 'tasks'];

// ---- Field tables -----------------------------------------------------------

const APPLICATION_SHORT = ['company', 'role', 'location', 'source'];
const APPLICATION_LONG = ['posting', 'notes'];
const EVENT_SHORT = ['title'];
const EVENT_LONG = ['notes'];
const CONTACT_SHORT = ['name', 'title', 'company', 'email', 'phone'];
const CONTACT_LONG = ['notes'];

// ---- Small normalizers ------------------------------------------------------

function text(value, max) {
    if (value == null) return '';
    return String(value).trim().slice(0, max);
}

function intOrNull(value, min, max) {
    if (value === '' || value == null) return null;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
}

function oneOf(value, list, fallback) {
    return list.includes(value) ? value : fallback;
}

function dateOrNull(value) {
    return isDateString(value) ? value : null;
}

function dateTimeOrNull(value) {
    if (isDateTimeString(value)) return value.slice(0, 16);
    return null;
}

/** An ISO timestamp string, or null. Kept as written if it parses. */
function stampOrNull(value) {
    if (typeof value !== 'string' || !value) return null;
    return Number.isNaN(new Date(value).getTime()) ? null : value;
}

/** An ISO timestamp for createdAt and friends: the one place a real instant
 *  is kept, because "when was this edited" is not a wall-clock question. */
function stamp(now) {
    return now.toISOString();
}

/**
 * A link a visitor may follow, or ''. Only http and https survive. A bare
 * "acme.com/jobs/12" is given https:// in front, because that is what anybody
 * pasting it meant, and anything else (javascript:, data:, a sentence) is
 * dropped rather than stored.
 */
export function safeUrl(value, max = 2000) {
    let raw = text(value, max);
    if (!raw) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        if (/\s/.test(raw) || !/^[^/]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(raw)) return '';
        raw = `https://${raw}`;
    }
    let url;
    try {
        url = new URL(raw);
    } catch (e) {
        return '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href.slice(0, max);
}

/** A list of record ids: strings, unique, in order, at most `max` of them. */
function idList(value, max) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        const id = text(item, 64);
        if (id && !out.includes(id)) out.push(id);
        if (out.length >= max) break;
    }
    return out;
}

function currency(value) {
    const code = text(value, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'USD';
}

function stamps(raw, record) {
    record.sample = raw.sample === true;
    record.createdAt = stampOrNull(raw.createdAt) || '';
    record.updatedAt = stampOrNull(raw.updatedAt) || record.createdAt;
    record.deletedAt = stampOrNull(raw.deletedAt);
    return record;
}

// ---- The empty document -----------------------------------------------------

export function defaultSettings(config) {
    return { ...config.settings };
}

export function emptyDoc(config, now) {
    return {
        schema: config.storage.schema,
        meta: { createdAt: stamp(now), lastVisitAt: null },
        settings: defaultSettings(config),
        applications: [],
        events: [],
        contacts: [],
        tasks: [],
        log: []
    };
}

// ---- Normalization ----------------------------------------------------------

/**
 * A settings object clamped to the config's bounds. Unknown keys are dropped
 * and missing ones take the default, so a document from an older build gains
 * a new setting without anyone migrating it.
 */
export function normalizeSettings(raw, config) {
    const base = defaultSettings(config);
    const src = raw && typeof raw === 'object' ? raw : {};
    const b = config.settingsBounds;
    const bounded = (key) => intOrNull(src[key], b[key].min, b[key].max) ?? base[key];
    return {
        weeklyGoal: bounded('weeklyGoal'),
        followUpDays: bounded('followUpDays'),
        ghostAfterDays: bounded('ghostAfterDays'),
        coached: bounded('coached'),
        sortKey: oneOf(src.sortKey, Object.keys(config.sortKeys), base.sortKey),
        sortDir: oneOf(src.sortDir, ['asc', 'desc'], base.sortDir)
    };
}

/**
 * One application from whatever was handed in. Rejected (null) only when it
 * has no id, or no company and no role at all, which is the one shape nothing
 * downstream can show.
 */
export function normalizeApplication(raw, config) {
    if (!raw || typeof raw !== 'object') return null;
    const L = config.limits;
    const app = { id: text(raw.id, 64) };
    if (!app.id) return null;
    for (const key of APPLICATION_SHORT) app[key] = text(raw[key], L.short);
    for (const key of APPLICATION_LONG) app[key] = text(raw[key], L.long);
    if (!app.company && !app.role) return null;
    app.url = safeUrl(raw.url, L.url);
    app.status = oneOf(raw.status, config.statuses, 'applied');
    app.appliedOn = dateOrNull(raw.appliedOn);
    app.closedOn = config.closedStatuses.includes(app.status) ? dateOrNull(raw.closedOn) : null;
    app.workMode = oneOf(raw.workMode, config.workModes, 'unknown');
    let min = intOrNull(raw.salaryMin, 0, L.salary);
    let max = intOrNull(raw.salaryMax, 0, L.salary);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    app.salaryMin = min;
    app.salaryMax = max;
    app.salaryPeriod = oneOf(raw.salaryPeriod, config.salaryPeriods, 'year');
    app.salaryCurrency = currency(raw.salaryCurrency);
    app.contactIds = idList(raw.contactIds, L.links);
    // When the status last CHANGED, which counts as activity (derive.js). Not
    // set when an application is first entered, because a search backfilled
    // today has not moved today.
    app.statusAt = stampOrNull(raw.statusAt);
    return stamps(raw, app);
}

/** One event. It must belong to an application in `applicationIds`. */
export function normalizeEvent(raw, config, applicationIds) {
    if (!raw || typeof raw !== 'object') return null;
    const L = config.limits;
    const ev = { id: text(raw.id, 64), applicationId: text(raw.applicationId, 64) };
    if (!ev.id || !applicationIds.has(ev.applicationId)) return null;
    ev.type = oneOf(raw.type, config.eventTypes, 'other');
    for (const key of EVENT_SHORT) ev[key] = text(raw[key], L.short);
    for (const key of EVENT_LONG) ev[key] = text(raw[key], L.long);
    ev.at = dateTimeOrNull(raw.at);
    ev.durationMinutes = intOrNull(raw.durationMinutes, 1, L.durationMinutes);
    ev.round = intOrNull(raw.round, 1, L.round);
    ev.withContactIds = idList(raw.withContactIds, L.links);
    ev.outcome = oneOf(raw.outcome, config.outcomes, 'pending');
    return stamps(raw, ev);
}

/** One contact. A contact needs a name. */
export function normalizeContact(raw, config) {
    if (!raw || typeof raw !== 'object') return null;
    const L = config.limits;
    const c = { id: text(raw.id, 64) };
    if (!c.id) return null;
    for (const key of CONTACT_SHORT) c[key] = text(raw[key], L.short);
    for (const key of CONTACT_LONG) c[key] = text(raw[key], L.long);
    if (!c.name) return null;
    c.linkedIn = safeUrl(raw.linkedIn, L.url);
    return stamps(raw, c);
}

/**
 * One follow-up. It needs words. A follow-up may stand alone, so a link to an
 * application that is not in `applicationIds` is dropped rather than the
 * whole task.
 */
export function normalizeTask(raw, config, applicationIds) {
    if (!raw || typeof raw !== 'object') return null;
    const t = { id: text(raw.id, 64), text: text(raw.text, config.limits.short) };
    if (!t.id || !t.text) return null;
    const appId = text(raw.applicationId, 64);
    t.applicationId = appId && applicationIds.has(appId) ? appId : '';
    t.due = dateOrNull(raw.due);
    t.doneAt = stampOrNull(raw.doneAt);
    t.auto = raw.auto === true;
    return stamps(raw, t);
}

/**
 * Validate and normalize a raw document.
 *
 * Returns `{ ok: true, doc, dropped }` for anything this build can hold,
 * `{ ok: false, reason: 'newer' }` for a document written by a later schema
 * (which is left exactly as it is on disk), and `{ ok: false, reason: 'shape' }`
 * for something that is not a document at all. `dropped` counts the records
 * that did not survive, so the caller can say so.
 */
export function validate(raw, config, now) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'shape' };
    const schema = Number(raw.schema);
    if (!Number.isInteger(schema) || schema < 1) return { ok: false, reason: 'shape' };
    if (schema > config.storage.schema) return { ok: false, reason: 'newer' };
    if (!Array.isArray(raw.applications)) return { ok: false, reason: 'shape' };

    let dropped = 0;
    const collect = (list, normalize) => {
        const out = [];
        const seen = new Set();
        for (const entry of Array.isArray(list) ? list : []) {
            const record = normalize(entry);
            if (!record || seen.has(record.id)) { dropped++; continue; }
            seen.add(record.id);
            out.push(record);
        }
        return { out, seen };
    };

    const apps = collect(raw.applications, (r) => normalizeApplication(r, config));
    const contacts = collect(raw.contacts, (r) => normalizeContact(r, config));
    const events = collect(raw.events, (r) => normalizeEvent(r, config, apps.seen));
    const tasks = collect(raw.tasks, (r) => normalizeTask(r, config, apps.seen));

    // A link to a contact that is not in the document goes, quietly: the
    // application is still worth keeping.
    const known = (ids) => ids.filter((id) => contacts.seen.has(id));
    const applications = apps.out.map((a) => (a.contactIds.every((id) => contacts.seen.has(id))
        ? a : { ...a, contactIds: known(a.contactIds) }));
    const eventList = events.out.map((e) => (e.withContactIds.every((id) => contacts.seen.has(id))
        ? e : { ...e, withContactIds: known(e.withContactIds) }));

    const base = emptyDoc(config, now);
    const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    const doc = {
        schema: config.storage.schema,
        meta: {
            createdAt: stampOrNull(meta.createdAt) || base.meta.createdAt,
            lastVisitAt: stampOrNull(meta.lastVisitAt)
        },
        settings: normalizeSettings(raw.settings, config),
        applications,
        events: eventList,
        contacts: contacts.out,
        tasks: tasks.out,
        log: normalizeLog(raw.log, config)
    };
    return { ok: true, doc, dropped };
}

// ---- Lookups ----------------------------------------------------------------

const live = (record) => !record.deletedAt;

export function findRecord(doc, collection, id) {
    return (doc[collection] || []).find((r) => r.id === id) || null;
}

export const findApplication = (doc, id) => findRecord(doc, 'applications', id);
export const findEvent = (doc, id) => findRecord(doc, 'events', id);
export const findContact = (doc, id) => findRecord(doc, 'contacts', id);
export const findTask = (doc, id) => findRecord(doc, 'tasks', id);

/** An application's events that are not in the wastebasket, oldest first,
 *  undated ones last. */
export function eventsFor(doc, applicationId) {
    return doc.events
        .filter((e) => e.applicationId === applicationId && live(e))
        .sort((a, b) => (a.at || '￿').localeCompare(b.at || '￿')
            || a.createdAt.localeCompare(b.createdAt));
}

/** An application's follow-ups that are not in the wastebasket, by due date,
 *  undated ones last. */
export function tasksFor(doc, applicationId) {
    return doc.tasks
        .filter((t) => t.applicationId === applicationId && live(t))
        .sort((a, b) => (a.due || '￿').localeCompare(b.due || '￿')
            || a.createdAt.localeCompare(b.createdAt));
}

/** The contacts linked to an application, in link order, skipping any in the
 *  wastebasket. */
export function contactsFor(doc, app) {
    return app.contactIds.map((id) => findContact(doc, id)).filter((c) => c && live(c));
}

/**
 * The words that name a record in the activity log and the undo toast: the
 * company and role for an application, the application's name for its events
 * and follow-ups, and the person's name for a contact. Never notes.
 */
export function labelOf(doc, collection, record) {
    if (!record) return '';
    if (collection === 'applications') {
        return record.company && record.role ? `${record.company}, ${record.role}` : record.company || record.role;
    }
    if (collection === 'contacts') return record.name;
    const app = record.applicationId ? findApplication(doc, record.applicationId) : null;
    if (collection === 'tasks' && !app) return record.text;
    return labelOf(doc, 'applications', app);
}

// ---- Mutation helpers -------------------------------------------------------

function replaceIn(doc, collection, record) {
    return { ...doc, [collection]: doc[collection].map((r) => (r.id === record.id ? record : r)) };
}

function logged(doc, kind, collection, record, now, config, extra = {}) {
    return appendLog(doc, {
        at: stamp(now),
        kind,
        collection,
        id: record.id,
        label: labelOf(doc, collection, record),
        ...extra
    }, config);
}

const refusal = (doc, error) => ({ doc, record: null, error });
const GONE = {
    applications: 'That application is no longer here.',
    events: 'That event is no longer here.',
    contacts: 'That contact is no longer here.',
    tasks: 'That follow-up is no longer here.'
};
const BINNED = {
    applications: 'That application is in the wastebasket. Please restore it first.',
    events: 'That event is in the wastebasket. Please restore it first.',
    contacts: 'That contact is in the wastebasket. Please restore it first.',
    tasks: 'That follow-up is in the wastebasket. Please restore it first.'
};

/** The live record, or the refusal that explains why there is not one. */
function liveRecord(doc, collection, id) {
    const record = findRecord(doc, collection, id);
    if (!record) return { error: GONE[collection] };
    if (record.deletedAt) return { error: BINNED[collection] };
    return { record };
}

function rank(config, status) {
    return config.statuses.indexOf(status);
}

// ---- Applications -----------------------------------------------------------

/**
 * Add an application. `fields` is whatever the form read. The status is
 * `applied` unless the form says otherwise, and an application that has been
 * sent is dated today unless a date was given. `opts.id` lets a test choose
 * the id.
 */
export function addApplication(doc, fields, config, now, opts = {}) {
    const src = fields || {};
    const status = oneOf(src.status, config.statuses, 'applied');
    const app = normalizeApplication({
        ...src,
        id: opts.id || newId(),
        status,
        closedOn: config.closedStatuses.includes(status) ? today(now) : null,
        statusAt: null,
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, config);
    if (!app) return refusal(doc, 'Please enter a company or a role.');
    if (!app.appliedOn && status !== 'saved') app.appliedOn = today(now);
    app.contactIds = app.contactIds.filter((id) => findContact(doc, id));
    const next = { ...doc, applications: [...doc.applications, app] };
    return { doc: logged(next, 'create', 'applications', app, now, config), record: app };
}

/**
 * Edit an application's fields. Status is deliberately NOT editable here (see
 * setStatus), so a form carrying a stale status cannot quietly close a search.
 */
export function updateApplication(doc, id, fields, config, now) {
    const found = liveRecord(doc, 'applications', id);
    if (found.error) return refusal(doc, found.error);
    const current = found.record;
    const merged = normalizeApplication({
        ...current,
        ...(fields || {}),
        id: current.id,
        status: current.status,
        closedOn: current.closedOn,
        statusAt: current.statusAt,
        sample: current.sample,
        createdAt: current.createdAt,
        updatedAt: stamp(now),
        deletedAt: null
    }, config);
    if (!merged) return refusal(doc, 'Please enter a company or a role.');
    if (!merged.appliedOn && merged.status !== 'saved') merged.appliedOn = current.appliedOn || today(now);
    merged.contactIds = merged.contactIds.filter((cid) => findContact(doc, cid));
    const next = replaceIn(doc, 'applications', merged);
    return { doc: logged(next, 'update', 'applications', merged, now, config), record: merged };
}

/**
 * Move an application to a status. A closing status records the day and
 * reopening clears it, and leaving `saved` dates the application today if it
 * had no date. An unknown word is refused rather than stored.
 */
export function setStatus(doc, id, status, config, now) {
    const found = liveRecord(doc, 'applications', id);
    if (found.error) return refusal(doc, found.error);
    const current = found.record;
    if (!config.statuses.includes(status)) return refusal(doc, 'That is not a status the office knows.');
    if (current.status === status) return { doc, record: current, error: null };
    const app = {
        ...current,
        status,
        closedOn: config.closedStatuses.includes(status) ? today(now) : null,
        appliedOn: current.appliedOn || (status !== 'saved' ? today(now) : null),
        statusAt: stamp(now),
        updatedAt: stamp(now)
    };
    const next = replaceIn(doc, 'applications', app);
    return {
        doc: logged(next, 'status', 'applications', app, now, config, { from: current.status, to: status }),
        record: app
    };
}

// ---- Events -----------------------------------------------------------------

/**
 * Move an application forward because of an event: a screen means screening,
 * an interview means interviewing, an offer means an offer. Never backward,
 * and never out of a closed status, so logging a thank-you email after a
 * rejection does not reopen anything.
 */
function advanceFor(doc, app, type, config, now) {
    const target = config.eventAdvances[type];
    if (!target || config.closedStatuses.includes(app.status)) return doc;
    if (rank(config, target) <= rank(config, app.status)) return doc;
    return setStatus(doc, app.id, target, config, now).doc;
}

/**
 * Add an event to an application. The time defaults to now, and an interview
 * with no round is numbered one past the application's last. Logging it may
 * move the application forward (advanceFor).
 */
export function addEvent(doc, fields, config, now, opts = {}) {
    const src = fields || {};
    const found = liveRecord(doc, 'applications', src.applicationId);
    if (found.error) return refusal(doc, found.error);
    const app = found.record;
    const type = oneOf(src.type, config.eventTypes, 'other');
    let round = src.round;
    if ((round === '' || round == null) && type === 'interview') {
        const rounds = eventsFor(doc, app.id).map((e) => e.round || 0);
        round = Math.max(0, ...rounds) + 1;
    }
    const ev = normalizeEvent({
        ...src,
        id: opts.id || newId(),
        type,
        round,
        at: src.at || formatDateTime(now),
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, config, new Set([app.id]));
    if (!ev) return refusal(doc, 'The event could not be saved.');
    ev.withContactIds = ev.withContactIds.filter((id) => findContact(doc, id));
    let next = { ...doc, events: [...doc.events, ev] };
    next = logged(next, 'create', 'events', ev, now, config);
    next = advanceFor(next, app, type, config, now);
    return { doc: next, record: ev };
}

export function updateEvent(doc, id, fields, config, now) {
    const found = liveRecord(doc, 'events', id);
    if (found.error) return refusal(doc, found.error);
    const current = found.record;
    const merged = normalizeEvent({
        ...current,
        ...(fields || {}),
        id: current.id,
        applicationId: current.applicationId,
        sample: current.sample,
        createdAt: current.createdAt,
        updatedAt: stamp(now),
        deletedAt: null
    }, config, new Set([current.applicationId]));
    if (!merged) return refusal(doc, 'The event could not be saved.');
    if (!merged.at) merged.at = current.at;
    merged.withContactIds = merged.withContactIds.filter((cid) => findContact(doc, cid));
    let next = replaceIn(doc, 'events', merged);
    next = logged(next, 'update', 'events', merged, now, config);
    const app = findApplication(next, merged.applicationId);
    if (app && !app.deletedAt) next = advanceFor(next, app, merged.type, config, now);
    return { doc: next, record: merged };
}

// ---- Contacts ---------------------------------------------------------------

export function addContact(doc, fields, config, now, opts = {}) {
    const c = normalizeContact({
        ...(fields || {}),
        id: opts.id || newId(),
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, config);
    if (!c) return refusal(doc, 'Please enter a name.');
    const next = { ...doc, contacts: [...doc.contacts, c] };
    return { doc: logged(next, 'create', 'contacts', c, now, config), record: c };
}

export function updateContact(doc, id, fields, config, now) {
    const found = liveRecord(doc, 'contacts', id);
    if (found.error) return refusal(doc, found.error);
    const current = found.record;
    const merged = normalizeContact({
        ...current,
        ...(fields || {}),
        id: current.id,
        sample: current.sample,
        createdAt: current.createdAt,
        updatedAt: stamp(now),
        deletedAt: null
    }, config);
    if (!merged) return refusal(doc, 'Please enter a name.');
    const next = replaceIn(doc, 'contacts', merged);
    return { doc: logged(next, 'update', 'contacts', merged, now, config), record: merged };
}

/** Link a contact to an application, or unlink it. Idempotent both ways. */
export function linkContact(doc, applicationId, contactId, linked, config, now) {
    const foundApp = liveRecord(doc, 'applications', applicationId);
    if (foundApp.error) return refusal(doc, foundApp.error);
    const foundContact = liveRecord(doc, 'contacts', contactId);
    if (foundContact.error) return refusal(doc, foundContact.error);
    const app = foundApp.record;
    const has = app.contactIds.includes(contactId);
    if (has === Boolean(linked)) return { doc, record: app, error: null };
    if (linked && app.contactIds.length >= config.limits.links) {
        return refusal(doc, 'That application already has as many contacts as it can hold.');
    }
    const updated = {
        ...app,
        contactIds: linked ? [...app.contactIds, contactId] : app.contactIds.filter((id) => id !== contactId),
        updatedAt: stamp(now)
    };
    const next = replaceIn(doc, 'applications', updated);
    return { doc: logged(next, 'update', 'applications', updated, now, config), record: updated };
}

// ---- Follow-ups -------------------------------------------------------------

export function addTask(doc, fields, config, now, opts = {}) {
    const src = fields || {};
    if (src.applicationId) {
        const found = liveRecord(doc, 'applications', src.applicationId);
        if (found.error) return refusal(doc, found.error);
    }
    const ids = new Set(src.applicationId ? [src.applicationId] : []);
    const t = normalizeTask({
        ...src,
        id: opts.id || newId(),
        doneAt: null,
        auto: src.auto === true,
        sample: opts.sample === true,
        createdAt: stamp(now),
        updatedAt: stamp(now),
        deletedAt: null
    }, config, ids);
    if (!t) return refusal(doc, 'Please describe the follow-up.');
    const next = { ...doc, tasks: [...doc.tasks, t] };
    return { doc: logged(next, 'create', 'tasks', t, now, config), record: t };
}

/** Edit a follow-up's words or due date. Its application and its done state
 *  are pinned (see setTaskDone). */
export function updateTask(doc, id, fields, config, now) {
    const found = liveRecord(doc, 'tasks', id);
    if (found.error) return refusal(doc, found.error);
    const current = found.record;
    const merged = normalizeTask({
        ...current,
        ...(fields || {}),
        id: current.id,
        applicationId: current.applicationId,
        doneAt: current.doneAt,
        auto: current.auto,
        sample: current.sample,
        createdAt: current.createdAt,
        updatedAt: stamp(now),
        deletedAt: null
    }, config, new Set(current.applicationId ? [current.applicationId] : []));
    if (!merged) return refusal(doc, 'Please describe the follow-up.');
    const next = replaceIn(doc, 'tasks', merged);
    return { doc: logged(next, 'update', 'tasks', merged, now, config), record: merged };
}

/** Tick a follow-up off, or put it back on the list. */
export function setTaskDone(doc, id, done, config, now) {
    const found = liveRecord(doc, 'tasks', id);
    if (found.error) return refusal(doc, found.error);
    const current = found.record;
    if (Boolean(current.doneAt) === Boolean(done)) return { doc, record: current, error: null };
    const t = { ...current, doneAt: done ? stamp(now) : null, updatedAt: stamp(now) };
    const next = replaceIn(doc, 'tasks', t);
    return { doc: logged(next, done ? 'done' : 'reopen', 'tasks', t, now, config), record: t };
}

// ---- The wastebasket --------------------------------------------------------

/**
 * Put a record in the wastebasket. An application takes its live events and
 * follow-ups with it, all stamped with the same moment, so a restore can tell
 * them apart from ones thrown away earlier.
 */
export function deleteRecord(doc, collection, id, config, now) {
    if (!COLLECTIONS.includes(collection)) return refusal(doc, 'That is not something the office keeps.');
    const found = liveRecord(doc, collection, id);
    if (found.error) return refusal(doc, found.error);
    const when = stamp(now);
    const record = { ...found.record, deletedAt: when };
    let next = replaceIn(doc, collection, record);
    if (collection === 'applications') {
        const bin = (r) => (r.applicationId === id && !r.deletedAt ? { ...r, deletedAt: when } : r);
        next = { ...next, events: next.events.map(bin), tasks: next.tasks.map(bin) };
    }
    return { doc: logged(next, 'delete', collection, record, now, config), record };
}

/**
 * Take a record back out of the wastebasket. An application brings back the
 * events and follow-ups that went in with it. An event or follow-up whose
 * application is still in the wastebasket is refused, politely, because it
 * would come back to a folder that is not there.
 */
export function restoreRecord(doc, collection, id, config, now) {
    if (!COLLECTIONS.includes(collection)) return refusal(doc, 'That is not something the office keeps.');
    const current = findRecord(doc, collection, id);
    if (!current) return refusal(doc, GONE[collection]);
    if (!current.deletedAt) return { doc, record: current, error: null };
    if (collection === 'events' || (collection === 'tasks' && current.applicationId)) {
        const app = findApplication(doc, current.applicationId);
        if (app && app.deletedAt) {
            return refusal(doc, 'Its application is in the wastebasket too. Please restore the application first.');
        }
    }
    const when = current.deletedAt;
    const record = { ...current, deletedAt: null, updatedAt: stamp(now) };
    let next = replaceIn(doc, collection, record);
    if (collection === 'applications') {
        const unbin = (r) => (r.applicationId === id && r.deletedAt === when ? { ...r, deletedAt: null } : r);
        next = { ...next, events: next.events.map(unbin), tasks: next.tasks.map(unbin) };
    }
    return { doc: logged(next, 'restore', collection, record, now, config), record };
}

/** Remove records for good, with everything that depended on them: an
 *  application's events and follow-ups, and a contact's links. */
function without(doc, ids) {
    const gone = (r) => ids.has(r.id);
    const appsGone = new Set(doc.applications.filter(gone).map((a) => a.id));
    const contactsGone = new Set(doc.contacts.filter(gone).map((c) => c.id));
    const unlink = (list) => list.filter((cid) => !contactsGone.has(cid));
    return {
        ...doc,
        applications: doc.applications.filter((a) => !gone(a)).map((a) => (
            a.contactIds.some((cid) => contactsGone.has(cid)) ? { ...a, contactIds: unlink(a.contactIds) } : a)),
        events: doc.events.filter((e) => !gone(e) && !appsGone.has(e.applicationId)).map((e) => (
            e.withContactIds.some((cid) => contactsGone.has(cid)) ? { ...e, withContactIds: unlink(e.withContactIds) } : e)),
        contacts: doc.contacts.filter((c) => !gone(c)),
        tasks: doc.tasks.filter((t) => !gone(t) && !appsGone.has(t.applicationId))
    };
}

/** Empty one record out of the wastebasket for good. Only a record already
 *  in the wastebasket can be purged. */
export function purgeRecord(doc, collection, id, config, now) {
    if (!COLLECTIONS.includes(collection)) return refusal(doc, 'That is not something the office keeps.');
    const current = findRecord(doc, collection, id);
    if (!current) return refusal(doc, GONE[collection]);
    if (!current.deletedAt) return refusal(doc, 'Only something in the wastebasket can be emptied.');
    const label = labelOf(doc, collection, current);
    const next = without(doc, new Set([id]));
    return { doc: logged(next, 'purge', collection, current, now, config, { label }), record: current };
}

/** Everything in the wastebasket, newest first. Events and follow-ups that
 *  went in with their application are listed under it, not on their own. */
export function wastebasket(doc) {
    const binnedApps = new Map(doc.applications.filter((a) => a.deletedAt).map((a) => [a.id, a]));
    const rideAlong = (r) => {
        const app = binnedApps.get(r.applicationId);
        return Boolean(app) && app.deletedAt === r.deletedAt;
    };
    const items = [];
    for (const collection of COLLECTIONS) {
        for (const r of doc[collection]) {
            if (!r.deletedAt) continue;
            if ((collection === 'events' || collection === 'tasks') && rideAlong(r)) continue;
            items.push({ collection, record: r, label: labelOf(doc, collection, r) });
        }
    }
    return items.sort((a, b) => b.record.deletedAt.localeCompare(a.record.deletedAt));
}

/** Empty the whole wastebasket for good. */
export function emptyWastebasket(doc, config, now) {
    const ids = new Set();
    for (const collection of COLLECTIONS) {
        for (const r of doc[collection]) if (r.deletedAt) ids.add(r.id);
    }
    if (!ids.size) return { doc, record: null, error: null };
    let next = without(doc, ids);
    for (const item of wastebasket(doc)) {
        next = logged(next, 'purge', item.collection, item.record, now, config, { label: item.label });
    }
    return { doc: next, record: null, error: null };
}

// ---- Samples ----------------------------------------------------------------

/**
 * Remove every sample record, wherever it is, and every log line about one,
 * so clearing the samples leaves no trace of them. The visitor's own records
 * are untouched, apart from losing links to sample contacts.
 */
export function clearSamples(doc) {
    const ids = new Set();
    for (const collection of COLLECTIONS) {
        for (const r of doc[collection]) if (r.sample) ids.add(r.id);
    }
    if (!ids.size) return { doc, record: null, error: null };
    // Records that only existed under a sample application go with it.
    for (const collection of ['events', 'tasks']) {
        for (const r of doc[collection]) if (ids.has(r.applicationId)) ids.add(r.id);
    }
    const next = without(doc, ids);
    return { doc: { ...next, log: next.log.filter((e) => !ids.has(e.id)) }, record: null, error: null };
}

/** Whether the document holds any sample records. */
export function hasSamples(doc) {
    return COLLECTIONS.some((c) => doc[c].some((r) => r.sample));
}

// ---- Settings and visits ----------------------------------------------------

/** Change settings. Anything out of bounds is clamped and anything unknown is
 *  dropped, so the document's settings are always ones the config allows. */
export function setSettings(doc, patch, config) {
    return { doc: { ...doc, settings: normalizeSettings({ ...doc.settings, ...(patch || {}) }, config) }, record: null, error: null };
}

/** Note a visit, for the welcome-back line next time. */
export function touchVisit(doc, now) {
    return { doc: { ...doc, meta: { ...doc.meta, lastVisitAt: stamp(now) } }, record: null, error: null };
}

// ---- Size -------------------------------------------------------------------

/**
 * How much of the storage budget the document uses. localStorage quotas are
 * counted in characters of the saved string, so that is what this counts.
 */
export function storageUse(doc, config) {
    const chars = JSON.stringify(doc).length;
    const ratio = chars / config.storage.budgetChars;
    return { chars, budget: config.storage.budgetChars, ratio, warn: ratio >= config.storage.warnAt };
}

// ---- Backup and restore -----------------------------------------------------

/** The document as the text a backup file holds. Indented, because a visitor
 *  may open it in an editor, and a job search is theirs to read. */
export function serialize(doc) {
    return JSON.stringify(doc, null, 2);
}

/** The name a backup file is offered under. */
export function backupFilename(now) {
    return `corner-office-${today(now)}.json`;
}

/**
 * Read a backup file's text. Returns the same shape as `validate`, plus
 * `reason: 'parse'` for text that is not JSON at all.
 */
export function parseBackup(textContent, config, now) {
    let raw;
    try {
        raw = JSON.parse(textContent);
    } catch (e) {
        return { ok: false, reason: 'parse' };
    }
    return validate(raw, config, now);
}

// ---- The storage edge -------------------------------------------------------

/**
 * THE ONLY LINES ON THE SITE'S PRIVACY ALLOWLIST FOR THIS SCENE. The store
 * takes its storage as an argument so the suite can hand it a Map, and this
 * adapter is what it gets when nobody does. It names `localStorage` by its
 * global name on purpose: tests/privacy.test.mjs finds writers by reading the
 * source for exactly that, and a store that reached the browser through an
 * alias would be a store the policy could not see.
 */
export const browserStorage = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key)
};

/**
 * The one object that reads and writes localStorage.
 *
 * `storage` is anything with getItem, setItem and removeItem. `load` returns
 * the document to use and a status word the welcome card turns into a line:
 *   fresh        nothing saved yet, an empty office
 *   restored     a saved office came back
 *   unavailable  the browser refused to read or write, nothing will be saved
 *   newer        a later build wrote this, it is left alone and never overwritten
 *   unreadable   the saved text is not a document, it is left alone too
 *
 * `load` may be called again at any time, which is how the page follows a
 * change made in another tab: it re-reads from scratch and resets the guards
 * to match what it found, except that a browser which refused once is never
 * asked again.
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

    /** A restore replaces whatever was there, readable or not. */
    function replace(doc) {
        writable = true;
        seen = false;
        const ok = save(doc);
        if (ok) status = 'restored';
        return ok;
    }

    function tearDown() {
        tornDown = true;
    }

    return {
        load,
        save,
        clear,
        replace,
        tearDown,
        key,
        get status() { return status; },
        get available() { return available; },
        get writable() { return available && writable && !tornDown; }
    };
}
