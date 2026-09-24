// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's activity log and undo history, and the sentences the
 * office builds from its numbers (copy.js), held to house style.
 */
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication } from '../www/office/js/store.js';
import { appendLog, normalizeLog, normalizeLogEntry, lastLoggedAt, createHistory } from '../www/office/js/log.js';
import { count, welcomeLine, pageTitle, storageNote } from '../www/office/js/copy.js';

const NOW = new Date(2026, 8, 24, 10, 0);
const entry = (i, extra = {}) => ({ at: new Date(2026, 8, 24, 10, i).toISOString(), kind: 'update', collection: 'applications', id: `a${i}`, label: `A${i}`, ...extra });

describe('the activity log', () => {
    test('an entry keeps only what a log line needs', () => {
        expect(normalizeLogEntry({ ...entry(1), notes: 'secret' }, CONFIG)).toEqual(entry(1));
        expect(normalizeLogEntry({ ...entry(1), kind: 'status', from: 'applied', to: 'offer' }, CONFIG))
            .toMatchObject({ from: 'applied', to: 'offer' });
    });

    test('a malformed entry is dropped', () => {
        expect(normalizeLogEntry(null, CONFIG)).toBeNull();
        expect(normalizeLogEntry({ ...entry(1), at: 'soon' }, CONFIG)).toBeNull();
        expect(normalizeLogEntry({ ...entry(1), kind: 'explode' }, CONFIG)).toBeNull();
        expect(normalizeLogEntry({ ...entry(1), collection: 'secrets' }, CONFIG)).toBeNull();
        expect(normalizeLogEntry({ ...entry(1), kind: 'status', from: 'applied', to: 'ghosted' }, CONFIG)).toBeNull();
        expect(normalizeLog('nope', CONFIG)).toEqual([]);
        expect(normalizeLog([entry(1), { bad: true }], CONFIG)).toEqual([entry(1)]);
    });

    test('the log is capped, oldest dropped first, and a bad append changes nothing', () => {
        const small = { ...CONFIG, limits: { ...CONFIG.limits, log: 3 } };
        let doc = emptyDoc(CONFIG, NOW);
        for (let i = 0; i < 5; i++) doc = appendLog(doc, entry(i), small);
        expect(doc.log.map((e) => e.id)).toEqual(['a2', 'a3', 'a4']);
        expect(appendLog(doc, { kind: 'nope' }, small)).toBe(doc);
        expect(normalizeLog(Array.from({ length: 5 }, (_, i) => entry(i)), small)).toHaveLength(3);
    });

    test('the last time a record was touched', () => {
        const doc = addApplication(emptyDoc(CONFIG, NOW), { company: 'Acme' }, CONFIG, NOW, { id: 'a1' }).doc;
        expect(lastLoggedAt(doc, 'a1')).toBe(NOW.toISOString());
        expect(lastLoggedAt(doc, 'nope')).toBeNull();
    });
});

describe('the undo history', () => {
    test('hands back the document from before each change, newest first', () => {
        const h = createHistory(2);
        expect(h.canUndo).toBe(false);
        expect(h.label).toBe('');
        expect(h.undo()).toBeNull();
        const d1 = { n: 1 };
        const d2 = { n: 2 };
        const d3 = { n: 3 };
        h.push(d1, 'first');
        h.push(d2, 'second');
        h.push(d3);
        expect(h.size).toBe(2);
        expect(h.label).toBe('');
        expect(h.undo().doc).toBe(d3);
        expect(h.undo()).toEqual({ doc: d2, label: 'second' });
        expect(h.canUndo).toBe(false);
        h.push(d1, 'again');
        h.clear();
        expect(h.size).toBe(0);
    });
});

describe('copy', () => {
    const s = (fields) => ({ dueToday: 0, overdue: 0, upcoming: 0, applications: 0, ...fields });

    test('counts read naturally', () => {
        expect(count(1, 'follow-up')).toBe('1 follow-up');
        expect(count(2, 'follow-up')).toBe('2 follow-ups');
        expect(count(2, 'company', 'companies')).toBe('2 companies');
    });

    test('the welcome line leads with what is waiting', () => {
        expect(welcomeLine(s({ dueToday: 1 }))).toBe('Welcome back. 1 follow-up is waiting for you today.');
        expect(welcomeLine(s({ dueToday: 1, overdue: 2 }))).toBe('Welcome back. 3 follow-ups are waiting for you today.');
        expect(welcomeLine(s({ upcoming: 1 }))).toBe('Welcome back. The desk is clear today, and 1 event is on the calendar this week.');
        expect(welcomeLine(s({ upcoming: 2 }))).toMatch(/2 events are on the calendar/);
        expect(welcomeLine(s({ applications: 4 }))).toBe('Welcome back. The desk is clear today.');
        expect(welcomeLine(s())).toBe('Welcome back. The office is ready whenever you are.');
    });

    test('the title carries what is waiting', () => {
        expect(pageTitle('Corner Office', s({ dueToday: 2 }))).toBe('(2) Corner Office');
        expect(pageTitle('Corner Office', s())).toBe('Corner Office');
    });

    test('a storage note for each thing that can go wrong, and none when nothing has', () => {
        expect(storageNote('unavailable')).toMatch(/private window/);
        expect(storageNote('newer')).toMatch(/newer version/);
        expect(storageNote('unreadable')).toMatch(/could not be read/);
        expect(storageNote('restored', { warn: true })).toMatch(/backup/);
        expect(storageNote('restored', { warn: false })).toBe('');
        expect(storageNote('fresh')).toBe('');
    });

    test('every sentence keeps house style', () => {
        const all = [
            welcomeLine(s({ dueToday: 1 })), welcomeLine(s({ dueToday: 3 })), welcomeLine(s({ upcoming: 1 })),
            welcomeLine(s({ upcoming: 3 })), welcomeLine(s({ applications: 1 })), welcomeLine(s()),
            storageNote('unavailable'), storageNote('newer'), storageNote('unreadable'), storageNote('x', { warn: true })
        ];
        for (const line of all) {
            expect(line).not.toMatch(/[—;]/);
            expect(line).not.toMatch(/\b(colour|centre|organis|favourite|grey|cancelled|travelled)/i);
        }
    });
});
