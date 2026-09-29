// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's Rolodex, pure: a person's links through applications and
 * events, and the grid's filter by person. (The wheel of lettered cards
 * that stood on the desk was taken away in QA on 2026-09-25.)
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, addContact, linkContact, addEvent, deleteRecord
} from '../www/office/js/store.js';
import { queryApplications } from '../www/office/js/query.js';
import { contactLine, peopleText, peopleOf, linksOf, involves } from '../www/office/js/rolodex.js';
import { buildIndex } from '../www/office/js/derive.js';

const NOW = new Date(2026, 8, 24, 10, 0);

function office() {
    let doc = emptyDoc(CONFIG, NOW);
    doc = addApplication(doc, { company: 'Acme', role: 'Designer' }, CONFIG, NOW, { id: 'a' }).doc;
    doc = addApplication(doc, { company: 'Birch', role: 'Lead' }, CONFIG, NOW, { id: 'b' }).doc;
    doc = addApplication(doc, { company: 'Cedar', role: 'Engineer' }, CONFIG, NOW, { id: 'c' }).doc;
    doc = addContact(doc, { name: 'Priya Anand', title: 'Recruiter', company: 'Acme' }, CONFIG, NOW, { id: 'p' }).doc;
    doc = addContact(doc, { name: 'Élodie Marsh' }, CONFIG, NOW, { id: 'e' }).doc;
    doc = linkContact(doc, 'a', 'p', true, CONFIG, NOW).doc;
    doc = addEvent(doc, { applicationId: 'b', type: 'interview', at: '2026-09-28T10:00', withContactIds: ['p'] }, CONFIG, NOW, { id: 'ev' }).doc;
    return doc;
}

describe('people', () => {
    test('a person’s line and the grid’s People cell', () => {
        expect(contactLine({ title: 'Recruiter', company: 'Acme' })).toBe('Recruiter at Acme');
        expect(contactLine({ title: 'Recruiter', company: '' })).toBe('Recruiter');
        expect(contactLine({ title: '', company: 'Acme' })).toBe('Acme');
        expect(contactLine(null)).toBe('');
        expect(peopleText([])).toBe('');
        expect(peopleText(['A'])).toBe('A');
        expect(peopleText(['A', 'B'])).toBe('A and B');
        expect(peopleText(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
    });

    test('a person is linked directly, or through an event they were at', () => {
        const doc = office();
        const links = linksOf(doc, 'p');
        expect(links.applications.map((a) => a.id).sort()).toEqual(['a', 'b']);
        expect(links.events.map((e) => e.id)).toEqual(['ev']);
        const index = buildIndex(doc);
        expect(involves(doc.applications[0], 'p', index)).toBe(true);
        expect(involves(doc.applications[1], 'p', index)).toBe(true);
        expect(involves(doc.applications[2], 'p', index)).toBe(false);
        expect(peopleOf(doc, doc.applications[0]).map((c) => c.name)).toEqual(['Priya Anand']);
        expect(linksOf(doc, 'e')).toEqual({ applications: [], events: [] });
    });

    test('what is in the wastebasket is nobody’s link', () => {
        let doc = office();
        doc = deleteRecord(doc, 'applications', 'b', CONFIG, NOW).doc;
        expect(linksOf(doc, 'p').applications.map((a) => a.id)).toEqual(['a']);
        doc = deleteRecord(doc, 'contacts', 'p', CONFIG, NOW).doc;
        expect(peopleOf(doc, doc.applications[0])).toEqual([]);
    });

    test('the grid can show only what a person is part of, and names who is linked', () => {
        const doc = office();
        const r = queryApplications(doc, { contactId: 'p', sortKey: 'company' }, CONFIG, NOW);
        expect(r.rows.map((row) => row.app.id)).toEqual(['a', 'b']);
        expect(r.rows[0].people).toEqual(['Priya Anand']);
        expect(r.rows[1].people).toEqual([]);
        expect(queryApplications(doc, { contactId: 'nobody' }, CONFIG, NOW).shown).toBe(0);
        expect(queryApplications(doc, { contactId: 42 }, CONFIG, NOW).shown).toBe(3);
    });
});
