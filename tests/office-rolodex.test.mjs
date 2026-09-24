// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's Rolodex, pure: letters, the wheel's turn, the cards around
 * the axle, and a person's links through applications and events. Plus the
 * grid's filter by person.
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, addContact, linkContact, addEvent, deleteRecord
} from '../www/office/js/store.js';
import { queryApplications } from '../www/office/js/query.js';
import {
    LETTERS, LETTER_ATLAS, letterOf, letterIndex, cardAngle, spinTo, nearestTurn, ringQuad, ringUvs, contactLine,
    peopleText, peopleOf, linksOf, involves
} from '../www/office/js/rolodex.js';
import { buildIndex } from '../www/office/js/derive.js';

const NOW = new Date(2026, 8, 24, 10, 0);
const TAU = Math.PI * 2;

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

describe('letters and the wheel', () => {
    test('a name files under its first letter, accents folded, and anything else under #', () => {
        expect(LETTERS).toHaveLength(27);
        expect(letterOf('priya')).toBe('P');
        expect(letterOf('Élodie')).toBe('E');
        expect(letterOf('  42 Studio')).toBe('#');
        expect(letterOf('')).toBe('#');
        expect(letterIndex('A')).toBe(0);
        expect(letterIndex('#')).toBe(26);
        expect(letterIndex('?')).toBe(26);
    });

    test('the cards stand evenly round the axle, and the turn brings a card to face', () => {
        expect(cardAngle(0)).toBe(0);
        expect(cardAngle(27)).toBeCloseTo(TAU, 9);
        const facing = CONFIG.room.rolodex.facing;
        for (const i of [0, 5, 26]) expect(cardAngle(i) + spinTo(i, facing)).toBeCloseTo(facing, 9);
    });

    test('the wheel always takes the short way round', () => {
        expect(nearestTurn(0, 0.5)).toBeCloseTo(0.5, 9);
        expect(nearestTurn(0, TAU - 0.5)).toBeCloseTo(-0.5, 9);
        expect(nearestTurn(10 * TAU, 0.2)).toBeCloseTo(10 * TAU + 0.2, 9);
        for (const [from, to] of [[0, 3], [1, -2.5], [20, 0.1]]) {
            expect(Math.abs(nearestTurn(from, to) - from)).toBeLessThanOrEqual(Math.PI + 1e-9);
        }
    });

    test('a card stands radially, its lettered edge outward, as wide as it should be', () => {
        const dims = CONFIG.room.rolodex.card;
        for (const i of [0, 7, 20]) {
            const q = ringQuad(i, dims);
            const radius = (p) => Math.hypot(p[1], p[2]);
            expect(radius(q[0])).toBeCloseTo(dims.inner, 9);
            expect(radius(q[2])).toBeCloseTo(dims.outer, 9);
            expect(q[1][0] - q[0][0]).toBeCloseTo(dims.width, 9);
            // The outer edge points along the card's angle.
            expect(Math.atan2(q[3][2], q[3][1])).toBeCloseTo(Math.atan2(Math.sin(cardAngle(i)), Math.cos(cardAngle(i))), 9);
        }
    });

    test('each letter has its own cell, and the cells tile the atlas', () => {
        const cells = LETTERS.map((_, i) => ringUvs(i));
        expect(cells[0]).toEqual([[0, 1 - 1 / 3], [1 / 9, 1 - 1 / 3], [1 / 9, 1], [0, 1]]);
        expect(new Set(cells.map((c) => c[0].join())).size).toBe(LETTER_ATLAS.cols * LETTER_ATLAS.rows);
    });
});

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
