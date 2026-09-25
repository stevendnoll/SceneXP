// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's pure helpers: what a pasted posting offers, the CSV's
 * formula guard, the samples, the station camera, and the labels. Each is
 * imported from source.
 */
import { CONFIG } from '../www/office/js/config.js';
import { findUrl, findSalary, readPosting } from '../www/office/js/posting.js';
import { csvCell, toCsv, applicationsTable, applicationsCsv, CSV_COLUMNS } from '../www/office/js/csv.js';
import { sampleRecords, stockSamples } from '../www/office/js/samples.js';
import { fovFor, poseFor, smoothstep, blendPose, createGlide } from '../www/office/js/stations.js';
import {
    STATUS_LABELS, EVENT_LABELS, OUTCOME_LABELS, WORK_MODE_LABELS, SORT_LABELS, MATCH_LABELS,
    COLLECTION_LABELS, STATION_LABELS, applicationName, money, salaryText, matchNote, eventName
} from '../www/office/js/labels.js';
import { screenLines } from '../www/office/js/paint.js';
import {
    emptyDoc, addApplication, addContact, linkContact, addEvent, addTask, clearSamples, validate, deleteRecord
} from '../www/office/js/store.js';
import { stats, dueTasks, buildIndex, effectiveStatus } from '../www/office/js/derive.js';

const NOW = new Date(2026, 8, 24, 10, 0);

// ---- The posting ---------------------------------------------------------------

describe('what a pasted posting offers', () => {
    test.each([
        ['The pay range is $120,000 - $150,000 per year.', { min: 120000, max: 150000, period: 'year' }],
        ['Salary: $120k to $150k', { min: 120000, max: 150000, period: 'year' }],
        ['Base pay $120-150k plus equity', { min: 120000, max: 150000, period: 'year' }],
        ['USD 95,000 – 110,000 depending on experience', { min: 95000, max: 110000, period: 'year' }],
        ['$55 - $70 per hour, contract', { min: 55, max: 70, period: 'hour' }],
        ['$58.50-$64.25/hr', { min: 59, max: 64, period: 'hour' }],
        ['$40 to $30 an hour', { min: 30, max: 40, period: 'hour' }],
        ['We offer a $500 stipend and $2,000 - $3,000 bonuses', { min: 2000, max: 3000, period: 'year' }]
    ])('%p', (text, salary) => {
        expect(findSalary(text)).toEqual(salary);
    });

    test.each([
        'A $25 application fee is never charged.',
        'Competitive salary and great benefits.',
        'Team of 10 - 12 engineers',
        ''
    ])('offers no salary for %p', (text) => {
        expect(findSalary(text)).toBeNull();
    });

    test('finds the first safe link, trimming trailing punctuation', () => {
        expect(findUrl('Apply at https://jobs.example/acme/42. Thanks!')).toBe('https://jobs.example/acme/42');
        expect(findUrl('see (https://careers.example/role)')).toBe('https://careers.example/role');
        expect(findUrl('no links here, javascript:alert(1)')).toBe('');
        expect(findUrl(null)).toBe('');
    });

    test('readPosting gathers both, and never guesses a company or a role', () => {
        const found = readPosting('Acme is hiring a Designer! $100k-$120k. https://acme.example/jobs');
        expect(found).toEqual({ url: 'https://acme.example/jobs', salary: { min: 100000, max: 120000, period: 'year' } });
        expect(Object.keys(found)).toEqual(['url', 'salary']);
    });
});

// ---- The CSV ------------------------------------------------------------------

describe('the spreadsheet export', () => {
    test.each([
        ['=HYPERLINK("http://evil.example","Click")', `"'=HYPERLINK(""http://evil.example"",""Click"")"`],
        ['+1 555 0100', "'+1 555 0100"],
        ['-2+3', "'-2+3"],
        ['@SUM(A1)', "'@SUM(A1)"],
        ['\tTabbed', "'\tTabbed"],
        ['Acme, Inc.', '"Acme, Inc."'],
        ['Line one\nline two', '"Line one\nline two"'],
        ['Plain', 'Plain'],
        [42, '42'],
        [null, '']
    ])('cell %p is written as %p', (value, written) => {
        expect(csvCell(value)).toBe(written);
    });

    test('rows join with CRLF behind a byte order mark', () => {
        expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('﻿a,b\r\nc,d\r\n');
    });

    test('the table lists live applications in the order handed in, with their people and next event', () => {
        let doc = emptyDoc(CONFIG, NOW);
        doc = addApplication(doc, { company: '=Evil', role: 'Designer', salaryMin: 100000, salaryMax: 120000 }, CONFIG, NOW, { id: 'a' }).doc;
        doc = addApplication(doc, { company: 'Café Lumen', role: 'Engineer' }, CONFIG, NOW, { id: 'b' }).doc;
        doc = addApplication(doc, { company: 'Binned' }, CONFIG, NOW, { id: 'c' }).doc;
        doc = deleteRecord(doc, 'applications', 'c', CONFIG, NOW).doc;
        doc = addContact(doc, { name: 'Pat Lee' }, CONFIG, NOW, { id: 'p' }).doc;
        doc = linkContact(doc, 'b', 'p', true, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'b', type: 'interview', at: '2026-09-30T14:00' }, CONFIG, NOW).doc;
        doc = addTask(doc, { applicationId: 'b', text: 'Thanks' }, CONFIG, NOW).doc;
        const rows = applicationsTable(doc, [doc.applications[1], doc.applications[0], doc.applications[2]], CONFIG, NOW);
        expect(rows[0]).toEqual(CSV_COLUMNS);
        expect(rows).toHaveLength(3);
        expect(rows[1].slice(0, 3)).toEqual(['Café Lumen', 'Engineer', 'Interviewing']);
        expect(rows[1][CSV_COLUMNS.indexOf('Contacts')]).toBe('Pat Lee');
        expect(rows[1][CSV_COLUMNS.indexOf('Next event')]).toBe('Interview');
        expect(rows[1][CSV_COLUMNS.indexOf('Next event at')]).toBe('2026-09-30 14:00');
        expect(rows[1][CSV_COLUMNS.indexOf('Open follow-ups')]).toBe(1);
        expect(rows[2][CSV_COLUMNS.indexOf('Per')]).toBe('year');
        const { text, filename } = applicationsCsv(doc, doc.applications, CONFIG, NOW);
        expect(filename).toBe('corner-office-2026-09-24.csv');
        expect(text).toContain("'=Evil");
        expect(text).not.toContain(',=Evil');
    });
});

// ---- Samples ------------------------------------------------------------------

describe('stocking the office', () => {
    let n = 0;
    const ids = () => `s${++n}`;

    test('every sample is marked, valid, and survives a round trip untouched', () => {
        const r = sampleRecords(CONFIG, NOW, ids);
        const all = [...r.applications, ...r.events, ...r.contacts, ...r.tasks];
        expect(all.every((x) => x && x.sample === true)).toBe(true);
        const doc = { ...emptyDoc(CONFIG, NOW), ...r };
        const back = validate(JSON.parse(JSON.stringify(doc)), CONFIG, NOW);
        expect(back.dropped).toBe(0);
        expect(back.doc.applications).toEqual(r.applications);
    });

    test('the samples show every part of the office working', () => {
        const doc = stockSamples(emptyDoc(CONFIG, NOW), CONFIG, NOW, ids).doc;
        const s = stats(doc, CONFIG, NOW);
        const due = dueTasks(doc, NOW);
        expect(s.applications).toBe(16);
        expect(due.today.length).toBeGreaterThan(0);
        expect(due.overdue.length).toBeGreaterThan(0);
        expect(s.upcoming).toBeGreaterThanOrEqual(2);
        expect(s.ghosted).toBe(2);
        const index = buildIndex(doc);
        const statuses = new Set(doc.applications.map((a) => effectiveStatus(a, index, doc.settings, CONFIG, NOW)));
        for (const st of ['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn', 'ghosted']) {
            expect(statuses).toContain(st);
        }
        // Hourly work reads as hourly.
        expect(doc.applications.find((a) => a.company === 'Brambleway Coffee').salaryPeriod).toBe('hour');
        // A rejection closed on its own day, not today.
        expect(doc.applications.find((a) => a.company === 'Pebblewick Bank').closedOn).toBe('2026-09-02');
    });

    test('they sit beside the visitor’s own records, refuse a second stocking, and clear without a trace', () => {
        let doc = addApplication(emptyDoc(CONFIG, NOW), { company: 'Mine' }, CONFIG, NOW, { id: 'mine' }).doc;
        const stocked = stockSamples(doc, CONFIG, NOW, ids);
        expect(stocked.count).toBe(16);
        doc = stocked.doc;
        expect(stockSamples(doc, CONFIG, NOW, ids)).toMatchObject({ doc, error: 'The office is already stocked with samples.' });
        const cleared = clearSamples(doc).doc;
        expect(cleared.applications.map((a) => a.id)).toEqual(['mine']);
        expect(cleared.events).toEqual([]);
        expect(cleared.contacts).toEqual([]);
    });

    test('no sample company or person is a name that might belong to somebody real', () => {
        // A tripwire, not proof: the obvious household names, so a hurried
        // edit that reaches for a real employer fails here.
        const words = JSON.stringify(sampleRecords(CONFIG, NOW, ids));
        for (const brand of ['Google', 'Apple', 'Amazon', 'Microsoft', 'Meta', 'Netflix', 'Tesla', 'Stripe', 'Airbnb', 'Uber', 'Northwind', 'Contoso', 'Acme']) {
            expect(words).not.toContain(brand);
        }
        expect(words).toMatch(/\.example\//);
    });
});

// ---- Stations -----------------------------------------------------------------

describe('the station camera', () => {
    test('a narrower screen widens the fov to keep the width, up to the cap', () => {
        expect(fovFor(48, 16 / 10, 16 / 10, 84)).toBe(48);
        expect(fovFor(48, 21 / 9, 16 / 10, 84)).toBe(48);
        const phone = fovFor(48, 390 / 844, 16 / 10, 84);
        expect(phone).toBeGreaterThan(48);
        expect(phone).toBeLessThanOrEqual(84);
        expect(fovFor(48, 0.1, 16 / 10, 84)).toBe(84);
        expect(fovFor(48, 0, 16 / 10, 84)).toBe(48);
        // The horizontal field is kept: tan(h/2) = tan(v/2) * aspect.
        const h = (v, a) => Math.atan(Math.tan((v * Math.PI) / 360) * a);
        const wider = fovFor(40, 1, 16 / 10, 120);
        expect(h(wider, 1)).toBeCloseTo(h(40, 16 / 10), 6);
    });

    test('poses copy the config, and an unknown station is the desk', () => {
        const pose = poseFor('computer', 16 / 10, CONFIG);
        expect(pose.eye).toEqual(CONFIG.stations.computer.eye);
        pose.eye[0] = 99;
        expect(CONFIG.stations.computer.eye[0]).not.toBe(99);
        expect(poseFor('nowhere', 16 / 10, CONFIG).aim).toEqual(CONFIG.stations.desk.aim);
    });

    test('the window keeps its top edge on a wide screen, tilting up by what its narrowed fov gave up (QA, 2026-09-25)', () => {
        const topOf = (pose) => {
            const d = pose.aim.map((v, i) => v - pose.eye[i]);
            return (Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180) / Math.PI + pose.fov / 2;
        };
        const ref = poseFor('window', 16 / 10, CONFIG);
        const wide = poseFor('window', 21 / 9, CONFIG);
        expect(wide.fov).toBeLessThan(ref.fov);
        expect(topOf(wide)).toBeCloseTo(topOf(ref), 6);
        // The same bearing and the same distance to its aim.
        const bearing = (p) => Math.atan2(p.aim[0] - p.eye[0], p.aim[2] - p.eye[2]);
        expect(bearing(wide)).toBeCloseTo(bearing(ref), 9);
        const reach = (p) => Math.hypot(...p.aim.map((v, i) => v - p.eye[i]));
        expect(reach(wide)).toBeCloseTo(reach(ref), 9);
        // At the reference and narrower, the aim is the config's own.
        expect(ref.aim).toEqual(CONFIG.stations.window.aim);
        expect(poseFor('window', 390 / 844, CONFIG).aim).toEqual(CONFIG.stations.window.aim);
        // A station without holdTop keeps its aim on a wide screen.
        expect(poseFor('desk', 21 / 9, CONFIG).aim).toEqual(CONFIG.stations.desk.aim);
    });

    test('a wide station backs its eye away on a phone, along its line of sight', () => {
        const wide = poseFor('cabinet', 16 / 10, CONFIG);
        const phone = poseFor('cabinet', CONFIG.view.narrowAspect, CONFIG);
        const tablet = poseFor('cabinet', 1, CONFIG);
        const dist = (p) => Math.hypot(...p.eye.map((v, i) => v - p.aim[i]));
        expect(dist(phone) - dist(wide)).toBeCloseTo(CONFIG.stations.cabinet.retreat, 6);
        expect(dist(tablet)).toBeGreaterThan(dist(wide));
        expect(dist(tablet)).toBeLessThan(dist(phone));
        expect(poseFor('cabinet', 0.2, CONFIG).eye).toEqual(phone.eye);
        // A station without a retreat stays put.
        expect(poseFor('desk', 0.45, CONFIG).eye).toEqual(CONFIG.stations.desk.eye);
    });

    test('a station may cap its own widening on a phone', () => {
        const phone = 390 / 844;
        expect(poseFor('window', phone, CONFIG).fov).toBe(CONFIG.stations.window.maxFov);
        expect(poseFor('desk', phone, CONFIG).fov).toBeGreaterThan(CONFIG.stations.window.maxFov);
        expect(poseFor('window', 16 / 10, CONFIG).fov).toBe(CONFIG.stations.window.fov);
    });

    test('a station that holds its width narrows on a wide screen, where the others keep theirs', () => {
        expect(poseFor('window', 21 / 9, CONFIG).fov).toBeLessThan(CONFIG.stations.window.fov);
        expect(poseFor('desk', 21 / 9, CONFIG).fov).toBe(CONFIG.stations.desk.fov);
        const half = (fov, aspect) => Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
        expect(half(poseFor('window', 21 / 9, CONFIG).fov, 21 / 9)).toBeCloseTo(half(CONFIG.stations.window.fov, CONFIG.view.refAspect), 9);
        expect(fovFor(50, 21 / 9, 16 / 10, 80, true)).toBeLessThan(50);
        expect(fovFor(50, 16 / 10, 16 / 10, 80, true)).toBe(50);
    });

    test('a retreat without a narrow aspect configured, or with the eye on its aim, still lands', () => {
        const view = { ...CONFIG.view, narrowAspect: undefined };
        const stations = { ...CONFIG.stations, odd: { eye: [1, 1, 1], aim: [1, 1, 1], fov: 50, retreat: 0.5 } };
        const config = { ...CONFIG, view, stations };
        const phone = poseFor('cabinet', 0.45, config);
        expect(phone.eye).toEqual(poseFor('cabinet', 0.45, CONFIG).eye);
        expect(poseFor('odd', 0.45, config).eye).toEqual([1, 1, 1]);
    });

    test('a glide eases from one pose to the next and lands exactly', () => {
        expect(smoothstep(-1)).toBe(0);
        expect(smoothstep(0.5)).toBe(0.5);
        expect(smoothstep(2)).toBe(1);
        const a = { eye: [0, 0, 0], aim: [0, 0, -1], fov: 40 };
        const b = { eye: [2, 2, 2], aim: [1, 1, -1], fov: 60 };
        expect(blendPose(a, b, 0.5)).toEqual({ eye: [1, 1, 1], aim: [0.5, 0.5, -1], fov: 50 });
        const g = createGlide(a, b, 1);
        expect(g.done).toBe(false);
        const early = g.step(0.1);
        expect(early.fov).toBeGreaterThan(40);
        expect(early.fov).toBeLessThan(42);
        g.step(-5);
        expect(g.step(2)).toEqual(b);
        expect(g.done).toBe(true);
    });

    test('with less motion, a glide cuts on its first step', () => {
        const a = { eye: [0, 0, 0], aim: [0, 0, -1], fov: 40 };
        const b = { eye: [2, 2, 2], aim: [1, 1, -1], fov: 60 };
        const g = createGlide(a, b, 0);
        expect(g.step(0)).toEqual(b);
        expect(g.done).toBe(true);
    });
});

// ---- Labels -------------------------------------------------------------------

describe('labels', () => {
    test('every stored word has a label', () => {
        for (const s of [...CONFIG.statuses, 'ghosted']) expect(STATUS_LABELS[s]).toBeTruthy();
        for (const t of CONFIG.eventTypes) expect(EVENT_LABELS[t]).toBeTruthy();
        for (const o of CONFIG.outcomes) expect(OUTCOME_LABELS[o]).toBeTruthy();
        for (const m of CONFIG.workModes) expect(WORK_MODE_LABELS[m]).toBeTruthy();
        for (const k of Object.keys(CONFIG.sortKeys)) expect(SORT_LABELS[k]).toBeTruthy();
        for (const s of Object.keys(CONFIG.stations)) expect(STATION_LABELS[s]).toBeTruthy();
    });

    test('the gentle words', () => {
        expect(STATUS_LABELS.rejected).toBe('Not selected');
        expect(STATUS_LABELS.ghosted).toBe('Gone quiet');
    });

    test('events are named by kind, and an interview by its round', () => {
        expect(eventName({ type: 'interview', round: 2 })).toBe('Interview, round 2');
        expect(eventName({ type: 'interview', round: null })).toBe('Interview');
        expect(eventName({ type: 'screen', round: 3 })).toBe('Phone screen');
    });

    test('names, money and salary ranges', () => {
        expect(applicationName({ company: 'Acme', role: 'Designer' })).toBe('Acme, Designer');
        expect(applicationName({ company: '', role: 'Designer' })).toBe('Designer');
        expect(applicationName(null)).toBe('');
        expect(money(120000)).toBe('$120,000');
        expect(money(95000, 'EUR')).toBe('€95,000');
        expect(money(5, 'ZZZ')).toMatch(/5/);
        const app = (min, max, period = 'year') => ({ salaryMin: min, salaryMax: max, salaryPeriod: period, salaryCurrency: 'USD' });
        expect(salaryText(app(120000, 150000))).toBe('$120,000 to $150,000 a year');
        expect(salaryText(app(55, 70, 'hour'))).toBe('$55 to $70 an hour');
        expect(salaryText(app(null, 90000))).toBe('Up to $90,000 a year');
        expect(salaryText(app(90000, null))).toBe('$90,000 a year');
        expect(salaryText(app(90000, 90000))).toBe('$90,000 a year');
        expect(salaryText(app(null, null))).toBe('');
    });

    test('a match note only when the match is out of sight', () => {
        expect(matchNote([])).toBe('');
        expect(matchNote(['company', 'posting'])).toBe('');
        expect(matchNote(['posting'])).toBe('Found in the posting');
        expect(matchNote(['notes', 'posting', 'contacts'])).toBe('Found in your notes, the posting and a contact');
    });

    test('the monitor says the same numbers', () => {
        expect(screenLines({ applications: 0 })).toEqual(['An empty office.', 'Open the computer to begin.']);
        expect(screenLines({ applications: 3, dueToday: 1, overdue: 1, upcoming: 2, weekly: { count: 1, goal: 5 } }))
            .toEqual(['3 applications', '2 follow-ups waiting today', '1 of 5 sent this week', '2 events this week']);
        expect(screenLines({ applications: 1, dueToday: 0, overdue: 0, upcoming: 0, weekly: { count: 0, goal: 5 } }))
            .toEqual(['1 application', 'Nothing due today', '0 of 5 sent this week']);
    });

    test('every label keeps house style', () => {
        const all = [STATUS_LABELS, EVENT_LABELS, OUTCOME_LABELS, WORK_MODE_LABELS, SORT_LABELS, MATCH_LABELS, COLLECTION_LABELS, STATION_LABELS]
            .flatMap((t) => Object.values(t));
        for (const word of all) {
            expect(word).not.toMatch(/[—;]/);
            expect(word).not.toMatch(/\b(colour|centre|organis|favourite|grey)/i);
        }
    });
});
