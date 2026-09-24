// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's search, filters and sort: the one answer the grid, the
 * cabinet and the corkboard all draw.
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, addEvent, addContact, linkContact, addTask, deleteRecord, setStatus
} from '../www/office/js/store.js';
import {
    fold, terms, normalizeQuery, matchFields, queryApplications, facetCounts, searchContacts, yearlySalary
} from '../www/office/js/query.js';
import { buildIndex } from '../www/office/js/derive.js';

const NOW = new Date(2026, 8, 24, 10, 0);

/** A small office: four applications with enough variety to sort and filter. */
function office() {
    let doc = emptyDoc(CONFIG, NOW);
    const add = (fields, id, opts = {}) => { doc = addApplication(doc, fields, CONFIG, NOW, { id, ...opts }).doc; };
    add({ company: 'Café Lumen', role: 'Product Designer', workMode: 'remote', appliedOn: '2026-09-22',
        salaryMin: 120000, salaryMax: 150000, notes: 'Loved the portfolio review' }, 'cafe');
    add({ company: 'acme', role: 'Staff Engineer', workMode: 'hybrid', appliedOn: '2026-09-10',
        salaryMin: 90, salaryPeriod: 'hour', posting: 'Kubernetes and TypeScript' }, 'acme');
    add({ company: 'Birch & Pine', role: 'Design Lead', workMode: 'onsite', appliedOn: '2026-08-01' }, 'birch');
    add({ company: 'Sample Labs', role: 'Designer', workMode: 'remote', appliedOn: '2026-09-23' }, 'sample', { sample: true });
    doc = addContact(doc, { name: 'Renée Park', title: 'Recruiter' }, CONFIG, NOW, { id: 'renee' }).doc;
    doc = linkContact(doc, 'acme', 'renee', true, CONFIG, NOW).doc;
    doc = addEvent(doc, { applicationId: 'cafe', type: 'interview', at: '2026-09-29T14:00', notes: 'Panel with the design team' }, CONFIG, NOW, { id: 'e1' }).doc;
    doc = addTask(doc, { applicationId: 'birch', text: 'Ask about relocation' }, CONFIG, NOW, { id: 't1' }).doc;
    return doc;
}

const ids = (result) => result.rows.map((r) => r.app.id);

describe('folding and words', () => {
    test('case and accents are ignored', () => {
        expect(fold('Café RENÉE')).toBe('cafe renee');
        expect(fold(null)).toBe('');
    });

    test('a search is split into at most twelve words', () => {
        expect(terms('  Product   Designer ')).toEqual(['product', 'designer']);
        expect(terms(Array(20).fill('a').join(' '))).toHaveLength(12);
    });
});

describe('normalizeQuery', () => {
    test('keeps only what the config allows', () => {
        const q = normalizeQuery({
            text: 'x', statuses: ['applied', 'ghosted', 'lost', 'applied'], workModes: ['remote', 'space'],
            appliedFrom: '2026-02-30', appliedTo: '2026-09-30', upcoming: 'yes', origin: 'theirs', sortKey: 'mood'
        }, CONFIG);
        expect(q).toEqual({
            text: 'x', statuses: ['applied', 'ghosted'], workModes: ['remote'], appliedFrom: null,
            appliedTo: '2026-09-30', upcoming: false, origin: 'all', sortKey: 'activity', sortDir: 'desc'
        });
    });

    test('a newly chosen sort key starts in its own direction', () => {
        expect(normalizeQuery({ sortKey: 'company' }, CONFIG).sortDir).toBe('asc');
        expect(normalizeQuery({ sortKey: 'company', sortDir: 'desc' }, CONFIG).sortDir).toBe('desc');
        expect(normalizeQuery(null, CONFIG, { ...CONFIG.settings, sortKey: 'salary', sortDir: 'asc' }))
            .toMatchObject({ sortKey: 'salary', sortDir: 'asc' });
    });
});

describe('search', () => {
    test('every word must be found somewhere, and the matching fields are reported', () => {
        const doc = office();
        const r = queryApplications(doc, { text: 'cafe designer' }, CONFIG, NOW);
        expect(ids(r)).toEqual(['cafe']);
        expect(r.rows[0].matches).toEqual(['company', 'role']);
        expect(ids(queryApplications(doc, { text: 'cafe engineer' }, CONFIG, NOW))).toEqual([]);
    });

    test('finds words buried in a posting, a contact, an event or a follow-up', () => {
        const doc = office();
        const where = (text) => queryApplications(doc, { text }, CONFIG, NOW).rows.map((r) => [r.app.id, r.matches]);
        expect(where('kubernetes')).toEqual([['acme', ['posting']]]);
        expect(where('renee')).toEqual([['acme', ['contacts']]]);
        expect(where('panel')).toEqual([['cafe', ['events']]]);
        expect(where('relocation')).toEqual([['birch', ['tasks']]]);
        expect(where('portfolio')).toEqual([['cafe', ['notes']]]);
    });

    test('an empty search matches everything live and reports no fields', () => {
        const doc = deleteRecord(office(), 'applications', 'birch', CONFIG, NOW).doc;
        const r = queryApplications(doc, {}, CONFIG, NOW);
        expect(r.total).toBe(3);
        expect(r.shown).toBe(3);
        expect(r.rows.every((row) => row.matches.length === 0)).toBe(true);
        expect(matchFields(doc.applications[0], buildIndex(doc), [])).toEqual([]);
    });
});

describe('filters', () => {
    test('by status, including the derived ghosted', () => {
        const doc = setStatus(office(), 'acme', 'rejected', CONFIG, NOW).doc;
        // birch was applied on August 1 with nothing since, so it has gone quiet.
        expect(ids(queryApplications(doc, { statuses: ['ghosted'] }, CONFIG, NOW))).toEqual(['birch']);
        expect(ids(queryApplications(doc, { statuses: ['rejected'] }, CONFIG, NOW))).toEqual(['acme']);
        expect(queryApplications(doc, {}, CONFIG, NOW).rows.find((r) => r.app.id === 'birch').status).toBe('ghosted');
    });

    test('by work mode, date range, upcoming, and sample or mine', () => {
        const doc = office();
        const q = (query) => ids(queryApplications(doc, { sortKey: 'company', ...query }, CONFIG, NOW));
        expect(q({ workModes: ['remote'] })).toEqual(['cafe', 'sample']);
        expect(q({ appliedFrom: '2026-09-01', appliedTo: '2026-09-22' })).toEqual(['acme', 'cafe']);
        expect(q({ upcoming: true })).toEqual(['cafe']);
        expect(q({ origin: 'sample' })).toEqual(['sample']);
        expect(q({ origin: 'mine' })).toEqual(['acme', 'birch', 'cafe']);
    });

    test('the next event rides along on its row', () => {
        const row = queryApplications(office(), { text: 'cafe' }, CONFIG, NOW).rows[0];
        expect(row.next.id).toBe('e1');
        expect(row.lastActivity).toBeInstanceOf(Date);
    });
});

describe('sorting', () => {
    const order = (query) => ids(queryApplications(office(), query, CONFIG, NOW));

    test('by company, folded, either way', () => {
        expect(order({ sortKey: 'company' })).toEqual(['acme', 'birch', 'cafe', 'sample']);
        expect(order({ sortKey: 'company', sortDir: 'desc' })).toEqual(['sample', 'cafe', 'birch', 'acme']);
    });

    test('by applied date, newest first by default', () => {
        expect(order({ sortKey: 'applied' })).toEqual(['sample', 'cafe', 'acme', 'birch']);
    });

    test('by salary, with an hourly rate compared as a year, and no salary last either way', () => {
        expect(yearlySalary({ salaryMin: 90, salaryMax: null, salaryPeriod: 'hour' })).toBe(187200);
        expect(yearlySalary({ salaryMin: null, salaryMax: null })).toBeNull();
        expect(order({ sortKey: 'salary' })).toEqual(['acme', 'cafe', 'birch', 'sample']);
        expect(order({ sortKey: 'salary', sortDir: 'asc' })).toEqual(['cafe', 'acme', 'birch', 'sample']);
    });

    test('by status in pipeline order, ties by company', () => {
        const doc = setStatus(office(), 'birch', 'offer', CONFIG, NOW).doc;
        expect(ids(queryApplications(doc, { sortKey: 'status' }, CONFIG, NOW))).toEqual(['acme', 'sample', 'cafe', 'birch']);
    });

    test('by last activity, most recent first', () => {
        // cafe has an interview on the calendar, which is the latest activity of all.
        expect(order({ sortKey: 'activity' })[0]).toBe('cafe');
    });
});

describe('facet counts and contact search', () => {
    test('each chip knows its count before it is pressed', () => {
        const f = facetCounts(office(), CONFIG, NOW);
        expect(f.byStatus).toMatchObject({ applied: 2, interviewing: 1, ghosted: 1 });
        expect(f.byWorkMode).toEqual({ onsite: 1, hybrid: 1, remote: 2, unknown: 0 });
        expect(f.sample).toBe(1);
        expect(f.upcoming).toBe(1);
    });

    test('contacts are found by any part of them, accents folded', () => {
        let doc = office();
        doc = addContact(doc, { name: 'Alex Kim', company: 'Birch & Pine' }, CONFIG, NOW, { id: 'alex' }).doc;
        doc = addContact(doc, { name: 'Gone' }, CONFIG, NOW, { id: 'gone' }).doc;
        doc = deleteRecord(doc, 'contacts', 'gone', CONFIG, NOW).doc;
        expect(searchContacts(doc, 'renee').map((c) => c.id)).toEqual(['renee']);
        expect(searchContacts(doc, 'birch').map((c) => c.id)).toEqual(['alex']);
        expect(searchContacts(doc, '').map((c) => c.id)).toEqual(['alex', 'renee']);
    });
});
