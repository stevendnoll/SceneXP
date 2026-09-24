// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * query.js - Search, filter and sort: the one answer every view asks for.
 *
 * THE GRID, THE CABINET AND THE CORKBOARD ALL SHOW THE SAME ANSWER. Each asks
 * `queryApplications` with the same query and draws the rows it gets back,
 * so a search typed at the computer lifts the same folders out of the drawer
 * and the row count always agrees with what the room shows.
 *
 * Pure: a document, a query, a config and a Date in, rows out. No DOM, no
 * clock, no THREE.
 *
 * SEARCH IS FORGIVING. Case and accents are folded ("cafe" finds "Café"),
 * every word typed must appear somewhere on the application (so "acme
 * designer" narrows rather than widens), and each row reports WHICH fields
 * matched, so the grid can say why a row is there when the match is buried in
 * a pasted posting.
 */

import { parseLocal } from './dates.min.js';
import { buildIndex, effectiveStatus, lastActivityOn, nextEvent, live } from './derive.min.js';

/** Where a match can be found on an application, in the order they are
 *  reported. */
export const SEARCH_FIELDS = ['company', 'role', 'location', 'source', 'notes', 'posting', 'contacts', 'events', 'tasks'];

/** The hours in a working year, for comparing an hourly rate with a salary. */
const HOURS_PER_YEAR = 2080;

/** Lowercase with accents removed, so comparisons ignore both. */
export function fold(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The words of a search, folded. At most twelve, which is more than anybody
 *  types into a search box and fewer than would slow one down. */
export function terms(textValue) {
    return fold(textValue).split(/\s+/).filter(Boolean).slice(0, 12);
}

// ---- The query --------------------------------------------------------------

/**
 * A query with every part checked, so a view can hand in whatever its
 * controls hold. The sort falls back to the document's settings.
 */
export function normalizeQuery(raw, config, settings = config.settings) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const statusWords = [...config.statuses, 'ghosted'];
    const list = (value, allowed) => (Array.isArray(value)
        ? [...new Set(value.filter((v) => allowed.includes(v)))] : []);
    const day = (value) => (parseLocal(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
    const sortKey = Object.keys(config.sortKeys).includes(src.sortKey) ? src.sortKey : settings.sortKey;
    let sortDir = ['asc', 'desc'].includes(src.sortDir) ? src.sortDir : null;
    if (!sortDir) sortDir = sortKey === settings.sortKey ? settings.sortDir : config.sortKeys[sortKey];
    return {
        text: String(src.text == null ? '' : src.text).slice(0, config.limits.short),
        statuses: list(src.statuses, statusWords),
        workModes: list(src.workModes, config.workModes),
        appliedFrom: day(src.appliedFrom),
        appliedTo: day(src.appliedTo),
        upcoming: src.upcoming === true,
        origin: ['all', 'sample', 'mine'].includes(src.origin) ? src.origin : 'all',
        sortKey,
        sortDir
    };
}

// ---- Matching ---------------------------------------------------------------

/** The folded text of each searchable field on one application. */
function haystacks(app, index) {
    const events = index.events(app.id);
    const contactIds = new Set(app.contactIds);
    for (const e of events) for (const id of e.withContactIds) contactIds.add(id);
    const people = [...contactIds].map((id) => index.contactsById.get(id)).filter(Boolean)
        .map((c) => `${c.name} ${c.title} ${c.company} ${c.email}`);
    return {
        company: fold(app.company),
        role: fold(app.role),
        location: fold(app.location),
        source: fold(app.source),
        notes: fold(app.notes),
        posting: fold(app.posting),
        contacts: fold(people.join(' ')),
        events: fold(events.map((e) => `${e.title} ${e.notes}`).join(' ')),
        tasks: fold(index.tasks(app.id).map((t) => t.text).join(' '))
    };
}

/**
 * The fields of an application that the search words were found in, or null
 * when any one word is found nowhere. An empty search matches everything and
 * reports no fields.
 */
export function matchFields(app, index, words) {
    if (!words.length) return [];
    const hay = haystacks(app, index);
    const found = new Set();
    for (const word of words) {
        const where = SEARCH_FIELDS.filter((f) => hay[f].includes(word));
        if (!where.length) return null;
        where.forEach((f) => found.add(f));
    }
    return SEARCH_FIELDS.filter((f) => found.has(f));
}

// ---- Sorting ----------------------------------------------------------------

/** A salary as a yearly figure, so an hourly rate sorts among salaries. */
export function yearlySalary(app) {
    const value = app.salaryMax ?? app.salaryMin;
    if (value == null) return null;
    return app.salaryPeriod === 'hour' ? value * HOURS_PER_YEAR : value;
}

function sortValue(row, key, config) {
    const { app } = row;
    switch (key) {
    case 'company': return fold(app.company || app.role);
    case 'applied': return app.appliedOn;
    case 'status': return config.statuses.indexOf(app.status);
    case 'salary': return yearlySalary(app);
    default: return row.lastActivity ? row.lastActivity.getTime() : null;
    }
}

/**
 * Compare two rows by a key. A missing value sorts LAST whichever way the
 * column points, because a row with no salary is not "the lowest salary".
 * Ties fall to the company name, then the id, so the order never shuffles
 * between two refreshes.
 */
function compareRows(a, b, key, dir, config) {
    const va = sortValue(a, key, config);
    const vb = sortValue(b, key, config);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) {
        const order = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        if (order) return dir === 'desc' ? -order : order;
    }
    return fold(a.app.company || a.app.role).localeCompare(fold(b.app.company || b.app.role))
        || a.app.id.localeCompare(b.app.id);
}

// ---- The answer -------------------------------------------------------------

/**
 * The live applications a query asks for, sorted, each as a row:
 *   app           the record
 *   status        the status to show, `ghosted` included
 *   lastActivity  a Date or null
 *   next          the next event on its calendar, or null
 *   matches       the fields the search words were found in
 * `total` is every live application and `shown` is how many rows came back,
 * which is what "Showing 4 of 31" is made from.
 */
export function queryApplications(doc, rawQuery, config, now, index = buildIndex(doc)) {
    const q = normalizeQuery(rawQuery, config, doc.settings);
    const words = terms(q.text);
    const rows = [];
    let total = 0;
    for (const app of doc.applications) {
        if (!live(app)) continue;
        total++;
        if (q.origin === 'sample' && !app.sample) continue;
        if (q.origin === 'mine' && app.sample) continue;
        if (q.workModes.length && !q.workModes.includes(app.workMode)) continue;
        if (q.appliedFrom && !(app.appliedOn && app.appliedOn >= q.appliedFrom)) continue;
        if (q.appliedTo && !(app.appliedOn && app.appliedOn <= q.appliedTo)) continue;
        const events = index.events(app.id);
        const next = nextEvent(events, now);
        if (q.upcoming && !next) continue;
        const status = effectiveStatus(app, index, doc.settings, config, now);
        if (q.statuses.length && !q.statuses.includes(status)) continue;
        const matches = matchFields(app, index, words);
        if (!matches) continue;
        rows.push({
            app,
            status,
            lastActivity: lastActivityOn(app, events, index.tasks(app.id)),
            next,
            matches
        });
    }
    rows.sort((a, b) => compareRows(a, b, q.sortKey, q.sortDir, config));
    return { rows, total, shown: rows.length, query: q };
}

/**
 * How many live applications each filter chip would find on its own, so a
 * chip can say "Interviewing 3" before it is pressed.
 */
export function facetCounts(doc, config, now, index = buildIndex(doc)) {
    const byStatus = Object.fromEntries([...config.statuses, 'ghosted'].map((s) => [s, 0]));
    const byWorkMode = Object.fromEntries(config.workModes.map((m) => [m, 0]));
    let sample = 0;
    let upcoming = 0;
    for (const app of doc.applications) {
        if (!live(app)) continue;
        byStatus[effectiveStatus(app, index, doc.settings, config, now)]++;
        byWorkMode[app.workMode]++;
        if (app.sample) sample++;
        if (nextEvent(index.events(app.id), now)) upcoming++;
    }
    return { byStatus, byWorkMode, sample, upcoming };
}

/** Live contacts whose name, title, company, email or notes hold every search
 *  word, by name. The Rolodex's search. */
export function searchContacts(doc, textValue) {
    const words = terms(textValue);
    return doc.contacts
        .filter((c) => live(c))
        .filter((c) => {
            const hay = fold(`${c.name} ${c.title} ${c.company} ${c.email} ${c.notes}`);
            return words.every((w) => hay.includes(w));
        })
        .sort((a, b) => fold(a.name).localeCompare(fold(b.name)) || a.id.localeCompare(b.id));
}
