// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's saved document: normalizing untrusted input, every
 * mutation, the wastebasket, samples, backup, and the storage guards.
 *
 * Mutations are checked for what they return AND for what they leave alone,
 * because the whole office leans on the old document surviving untouched:
 * that is what undo puts back.
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, validate, normalizeApplication, normalizeEvent, normalizeContact, normalizeTask,
    normalizeSettings, safeUrl, addApplication, updateApplication, setStatus, addEvent, updateEvent,
    addContact, updateContact, linkContact, addTask, updateTask, setTaskDone, deleteRecord,
    restoreRecord, purgeRecord, wastebasket, emptyWastebasket, clearSamples, hasSamples, setSettings,
    touchVisit, storageUse, serialize, backupFilename, parseBackup, createStore, eventsFor, tasksFor,
    contactsFor, labelOf, findApplication, findEvent, findTask, findContact
} from '../www/office/js/store.js';

const NOW = new Date(2026, 8, 24, 10, 0);
const LATER = new Date(2026, 8, 25, 9, 30);

/** Deep-freeze a document so any write to it throws. */
function frozen(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(frozen);
    }
    return value;
}

function withApp(fields = { company: 'Acme', role: 'Designer' }, opts = { id: 'a1' }) {
    return addApplication(emptyDoc(CONFIG, NOW), fields, CONFIG, NOW, opts).doc;
}

function memoryStorage() {
    const map = new Map();
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k)
    };
}

// ---- Links ------------------------------------------------------------------

describe('safeUrl keeps only a link a visitor may follow', () => {
    test.each([
        ['https://acme.example/jobs/12', 'https://acme.example/jobs/12'],
        ['http://acme.example', 'http://acme.example/'],
        ['acme.example/jobs/12', 'https://acme.example/jobs/12'],
        ['  careers.acme.example  ', 'https://careers.acme.example/'],
        ['javascript:alert(1)', ''],
        ['JAVASCRIPT:alert(1)', ''],
        ['data:text/html,<b>x</b>', ''],
        ['ftp://acme.example/file', ''],
        ['a sentence about a job', ''],
        ['nodot', ''],
        ['', ''],
        [null, '']
    ])('%p becomes %p', (input, out) => {
        expect(safeUrl(input)).toBe(out);
    });

    test('caps its length', () => {
        expect(safeUrl(`https://acme.example/${'a'.repeat(3000)}`, 50)).toHaveLength(50);
    });
});

// ---- Normalizers --------------------------------------------------------------

describe('normalizers rebuild a record field by field', () => {
    test('an application keeps known fields, drops unknown ones, and caps text', () => {
        const app = normalizeApplication({
            id: 'a1', company: `  ${'x'.repeat(300)}`, role: 'Designer', status: 'nonsense',
            workMode: 'moon', salaryMin: 150000, salaryMax: 120000, salaryCurrency: 'eur',
            url: 'javascript:alert(1)', contactIds: ['c1', 'c1', '', 7], hacked: true,
            posting: 'p'.repeat(30000), sample: 'yes'
        }, CONFIG);
        expect(app.company).toHaveLength(CONFIG.limits.short);
        expect(app.status).toBe('applied');
        expect(app.workMode).toBe('unknown');
        expect([app.salaryMin, app.salaryMax]).toEqual([120000, 150000]);
        expect(app.salaryCurrency).toBe('EUR');
        expect(app.url).toBe('');
        expect(app.contactIds).toEqual(['c1', '7']);
        expect(app.posting).toHaveLength(CONFIG.limits.long);
        expect(app.sample).toBe(false);
        expect(app).not.toHaveProperty('hacked');
    });

    test('an application needs an id and a company or a role', () => {
        expect(normalizeApplication({ company: 'Acme' }, CONFIG)).toBeNull();
        expect(normalizeApplication({ id: 'a1' }, CONFIG)).toBeNull();
        expect(normalizeApplication({ id: 'a1', role: 'Designer' }, CONFIG)).not.toBeNull();
        expect(normalizeApplication(null, CONFIG)).toBeNull();
    });

    test('closedOn survives only on a closed status', () => {
        expect(normalizeApplication({ id: 'a', company: 'A', status: 'applied', closedOn: '2026-09-01' }, CONFIG).closedOn).toBeNull();
        expect(normalizeApplication({ id: 'a', company: 'A', status: 'rejected', closedOn: '2026-09-01' }, CONFIG).closedOn).toBe('2026-09-01');
    });

    test('an event must belong to a known application', () => {
        const ids = new Set(['a1']);
        expect(normalizeEvent({ id: 'e1', applicationId: 'zz' }, CONFIG, ids)).toBeNull();
        const ev = normalizeEvent({
            id: 'e1', applicationId: 'a1', type: 'dance', at: '2026-09-30T14:00:59',
            round: 99, outcome: 'maybe', durationMinutes: 0
        }, CONFIG, ids);
        expect(ev.type).toBe('other');
        expect(ev.at).toBe('2026-09-30T14:00');
        expect(ev.round).toBe(CONFIG.limits.round);
        expect(ev.outcome).toBe('pending');
        expect(ev.durationMinutes).toBe(1);
    });

    test('a contact needs a name, and its LinkedIn link must be safe', () => {
        expect(normalizeContact({ id: 'c1', title: 'Recruiter' }, CONFIG)).toBeNull();
        const c = normalizeContact({ id: 'c1', name: 'Pat', linkedIn: 'javascript:x' }, CONFIG);
        expect(c.linkedIn).toBe('');
    });

    test('a task needs words, and an unknown application link is dropped, not the task', () => {
        expect(normalizeTask({ id: 't1' }, CONFIG, new Set())).toBeNull();
        const t = normalizeTask({ id: 't1', text: 'Call back', applicationId: 'gone' }, CONFIG, new Set());
        expect(t.applicationId).toBe('');
        expect(t.due).toBeNull();
    });

    test('settings are clamped to their bounds and unknown keys are dropped', () => {
        const s = normalizeSettings({ weeklyGoal: 1000, followUpDays: 0, ghostAfterDays: 'x', sortKey: 'mood', sortDir: 'up', extra: 1 }, CONFIG);
        expect(s).toEqual({
            weeklyGoal: 100, followUpDays: 1, ghostAfterDays: 21, coached: 0, sortKey: 'activity', sortDir: 'desc'
        });
        // What has been opened, for the markers: a whole number of bits, kept in bounds.
        expect(normalizeSettings({ coached: 5 }, CONFIG).coached).toBe(5);
        expect(normalizeSettings({ coached: -3 }, CONFIG).coached).toBe(0);
        expect(normalizeSettings({ coached: 1e9 }, CONFIG).coached).toBe(65535);
        expect(normalizeSettings(null, CONFIG)).toEqual(CONFIG.settings);
    });
});

// ---- validate -----------------------------------------------------------------

describe('validate', () => {
    test('refuses what is not a document, and a newer schema', () => {
        expect(validate(null, CONFIG, NOW)).toEqual({ ok: false, reason: 'shape' });
        expect(validate([], CONFIG, NOW)).toEqual({ ok: false, reason: 'shape' });
        expect(validate({ schema: 1 }, CONFIG, NOW)).toEqual({ ok: false, reason: 'shape' });
        expect(validate({ schema: 0, applications: [] }, CONFIG, NOW)).toEqual({ ok: false, reason: 'shape' });
        expect(validate({ schema: 2, applications: [] }, CONFIG, NOW)).toEqual({ ok: false, reason: 'newer' });
    });

    test('drops duplicates, orphans and links to contacts that are not there, and counts them', () => {
        const result = validate({
            schema: 1,
            applications: [
                { id: 'a1', company: 'Acme', contactIds: ['c1', 'ghost'] },
                { id: 'a1', company: 'Dup' },
                { id: 'a2' }
            ],
            events: [
                { id: 'e1', applicationId: 'a1', withContactIds: ['ghost'] },
                { id: 'e2', applicationId: 'nope' }
            ],
            contacts: [{ id: 'c1', name: 'Pat' }],
            tasks: [{ id: 't1', text: 'Write', applicationId: 'nope' }],
            log: [{ at: 'nope' }]
        }, CONFIG, NOW);
        expect(result.ok).toBe(true);
        expect(result.dropped).toBe(3);
        expect(result.doc.applications.map((a) => a.id)).toEqual(['a1']);
        expect(result.doc.applications[0].contactIds).toEqual(['c1']);
        expect(result.doc.events[0].withContactIds).toEqual([]);
        expect(result.doc.tasks[0].applicationId).toBe('');
        expect(result.doc.log).toEqual([]);
        expect(result.doc.settings).toEqual(CONFIG.settings);
    });

    test('a saved document round-trips unchanged', () => {
        let doc = withApp();
        doc = addContact(doc, { name: 'Pat' }, CONFIG, NOW, { id: 'c1' }).doc;
        doc = linkContact(doc, 'a1', 'c1', true, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a1', type: 'interview', withContactIds: ['c1'] }, CONFIG, NOW, { id: 'e1' }).doc;
        doc = addTask(doc, { applicationId: 'a1', text: 'Thank-you note', due: '2026-09-26' }, CONFIG, NOW, { id: 't1' }).doc;
        doc = touchVisit(doc, NOW).doc;
        const back = validate(JSON.parse(JSON.stringify(doc)), CONFIG, NOW);
        expect(back.dropped).toBe(0);
        expect(back.doc).toEqual(doc);
    });
});

// ---- Applications ---------------------------------------------------------------

describe('applications', () => {
    test('adding one dates it today, logs it, and leaves the old document alone', () => {
        const before = frozen(emptyDoc(CONFIG, NOW));
        const { doc, record, error } = addApplication(before, { company: 'Acme', role: 'Designer' }, CONFIG, NOW, { id: 'a1' });
        expect(error).toBeUndefined();
        expect(record.appliedOn).toBe('2026-09-24');
        expect(record.status).toBe('applied');
        // Entering an application is not the search moving (derive.js).
        expect(record.statusAt).toBeNull();
        expect(doc.applications).toHaveLength(1);
        expect(before.applications).toHaveLength(0);
        expect(doc.log).toEqual([expect.objectContaining({ kind: 'create', collection: 'applications', id: 'a1', label: 'Acme, Designer' })]);
    });

    test('a saved-for-later application has no date until it is sent', () => {
        let doc = addApplication(emptyDoc(CONFIG, NOW), { company: 'Acme', status: 'saved' }, CONFIG, NOW, { id: 'a1' }).doc;
        expect(findApplication(doc, 'a1').appliedOn).toBeNull();
        doc = setStatus(doc, 'a1', 'applied', CONFIG, LATER).doc;
        expect(findApplication(doc, 'a1').appliedOn).toBe('2026-09-25');
    });

    test('adding one with nothing to call it is refused politely', () => {
        const before = emptyDoc(CONFIG, NOW);
        const result = addApplication(before, { company: '  ' }, CONFIG, NOW);
        expect(result.doc).toBe(before);
        expect(result.error).toBe('Please enter a company or a role.');
    });

    test('adding one drops links to contacts that do not exist', () => {
        const { record } = addApplication(emptyDoc(CONFIG, NOW), { company: 'A', contactIds: ['nobody'] }, CONFIG, NOW);
        expect(record.contactIds).toEqual([]);
    });

    test('an update cannot change the status, the id or the sample flag', () => {
        const before = frozen(addApplication(emptyDoc(CONFIG, NOW), { company: 'Acme' }, CONFIG, NOW, { id: 'a1', sample: true }).doc);
        const { doc, record } = updateApplication(before, 'a1', { company: 'Acme Co', status: 'offer', id: 'x', sample: false }, CONFIG, LATER);
        expect(record).toMatchObject({ id: 'a1', company: 'Acme Co', status: 'applied', sample: true });
        expect(record.updatedAt).toBe(LATER.toISOString());
        expect(findApplication(before, 'a1').company).toBe('Acme');
        expect(doc.log.at(-1).kind).toBe('update');
    });

    test('an update refuses a missing application and one in the wastebasket', () => {
        const doc = withApp();
        expect(updateApplication(doc, 'nope', {}, CONFIG, NOW).error).toBe('That application is no longer here.');
        const binned = deleteRecord(doc, 'applications', 'a1', CONFIG, NOW).doc;
        expect(updateApplication(binned, 'a1', {}, CONFIG, NOW).error).toMatch(/wastebasket/);
        expect(updateApplication(doc, 'a1', { company: '', role: '' }, CONFIG, NOW).error).toBe('Please enter a company or a role.');
    });

    test('a status change records the closing day, and reopening clears it', () => {
        let doc = withApp();
        doc = setStatus(doc, 'a1', 'rejected', CONFIG, LATER).doc;
        expect(findApplication(doc, 'a1').closedOn).toBe('2026-09-25');
        expect(findApplication(doc, 'a1').statusAt).toBe(LATER.toISOString());
        expect(doc.log.at(-1)).toMatchObject({ kind: 'status', from: 'applied', to: 'rejected' });
        doc = setStatus(doc, 'a1', 'interviewing', CONFIG, LATER).doc;
        expect(findApplication(doc, 'a1').closedOn).toBeNull();
    });

    test('an unknown status is refused, and the same status changes nothing', () => {
        const doc = withApp();
        expect(setStatus(doc, 'a1', 'ghosted', CONFIG, NOW).error).toBe('That is not a status the office knows.');
        expect(setStatus(doc, 'a1', 'applied', CONFIG, NOW).doc).toBe(doc);
    });
});

// ---- Events -------------------------------------------------------------------

describe('events', () => {
    test('an interview is numbered one past the last, and moves the application forward', () => {
        let doc = withApp();
        let r = addEvent(doc, { applicationId: 'a1', type: 'screen', at: '2026-09-25T10:00' }, CONFIG, NOW, { id: 'e0' });
        doc = r.doc;
        expect(r.record.round).toBeNull();
        expect(findApplication(doc, 'a1').status).toBe('screening');
        r = addEvent(doc, { applicationId: 'a1', type: 'interview' }, CONFIG, NOW, { id: 'e1' });
        doc = r.doc;
        expect(r.record.round).toBe(1);
        expect(r.record.at).toBe('2026-09-24T10:00');
        expect(findApplication(doc, 'a1').status).toBe('interviewing');
        r = addEvent(doc, { applicationId: 'a1', type: 'interview', round: '' }, CONFIG, NOW, { id: 'e2' });
        expect(r.record.round).toBe(2);
    });

    test('an event never moves an application backward or out of a closed status', () => {
        let doc = setStatus(withApp(), 'a1', 'offer', CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a1', type: 'screen' }, CONFIG, NOW).doc;
        expect(findApplication(doc, 'a1').status).toBe('offer');
        doc = setStatus(doc, 'a1', 'rejected', CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a1', type: 'offer' }, CONFIG, NOW).doc;
        expect(findApplication(doc, 'a1').status).toBe('rejected');
    });

    test('an email is logged without moving anything', () => {
        const doc = addEvent(withApp(), { applicationId: 'a1', type: 'email' }, CONFIG, NOW).doc;
        expect(findApplication(doc, 'a1').status).toBe('applied');
    });

    test('an event needs a live application', () => {
        const doc = withApp();
        expect(addEvent(doc, { applicationId: 'x' }, CONFIG, NOW).error).toBe('That application is no longer here.');
        expect(addEvent(doc, null, CONFIG, NOW).error).toBe('That application is no longer here.');
    });

    test('an update keeps the application and the time, and can move it forward', () => {
        let doc = addEvent(withApp(), { applicationId: 'a1', type: 'call', at: '2026-09-26T09:00' }, CONFIG, NOW, { id: 'e1' }).doc;
        const r = updateEvent(doc, 'e1', { applicationId: 'other', at: 'not a time', type: 'offer', notes: 'Good news' }, CONFIG, LATER);
        expect(r.record).toMatchObject({ applicationId: 'a1', at: '2026-09-26T09:00', type: 'offer', notes: 'Good news' });
        expect(findApplication(r.doc, 'a1').status).toBe('offer');
        expect(updateEvent(doc, 'nope', {}, CONFIG, NOW).error).toBe('That event is no longer here.');
    });

    test('eventsFor lists live events oldest first, undated last', () => {
        let doc = withApp();
        doc = addEvent(doc, { applicationId: 'a1', at: '2026-10-02T09:00' }, CONFIG, NOW, { id: 'late' }).doc;
        doc = addEvent(doc, { applicationId: 'a1', at: '2026-09-28T09:00' }, CONFIG, NOW, { id: 'early' }).doc;
        doc = addEvent(doc, { applicationId: 'a1', at: '2026-09-29T09:00' }, CONFIG, NOW, { id: 'binned' }).doc;
        doc = deleteRecord(doc, 'events', 'binned', CONFIG, NOW).doc;
        expect(eventsFor(doc, 'a1').map((e) => e.id)).toEqual(['early', 'late']);
    });
});

// ---- Contacts and follow-ups ------------------------------------------------------

describe('contacts', () => {
    test('add, edit, link and unlink', () => {
        let doc = withApp();
        doc = addContact(doc, { name: 'Pat Lee', title: 'Recruiter' }, CONFIG, NOW, { id: 'c1' }).doc;
        doc = updateContact(doc, 'c1', { title: 'Lead recruiter', id: 'x' }, CONFIG, NOW).doc;
        expect(findContact(doc, 'c1').title).toBe('Lead recruiter');
        doc = linkContact(doc, 'a1', 'c1', true, CONFIG, NOW).doc;
        expect(contactsFor(doc, findApplication(doc, 'a1')).map((c) => c.name)).toEqual(['Pat Lee']);
        expect(linkContact(doc, 'a1', 'c1', true, CONFIG, NOW).doc).toBe(doc);
        doc = linkContact(doc, 'a1', 'c1', false, CONFIG, NOW).doc;
        expect(findApplication(doc, 'a1').contactIds).toEqual([]);
    });

    test('a contact needs a name, and a link needs both sides live', () => {
        const doc = withApp();
        expect(addContact(doc, { title: 'x' }, CONFIG, NOW).error).toBe('Please enter a name.');
        expect(linkContact(doc, 'a1', 'nobody', true, CONFIG, NOW).error).toBe('That contact is no longer here.');
        expect(linkContact(doc, 'nope', 'c', true, CONFIG, NOW).error).toBe('That application is no longer here.');
        const withC = addContact(doc, { name: 'Pat' }, CONFIG, NOW, { id: 'c1' }).doc;
        expect(updateContact(withC, 'c1', { name: '' }, CONFIG, NOW).error).toBe('Please enter a name.');
    });

    test('an application holds at most the link limit', () => {
        let doc = withApp();
        for (let i = 0; i < CONFIG.limits.links; i++) {
            doc = addContact(doc, { name: `P${i}` }, CONFIG, NOW, { id: `c${i}` }).doc;
            doc = linkContact(doc, 'a1', `c${i}`, true, CONFIG, NOW).doc;
        }
        doc = addContact(doc, { name: 'One more' }, CONFIG, NOW, { id: 'extra' }).doc;
        expect(linkContact(doc, 'a1', 'extra', true, CONFIG, NOW).error).toMatch(/as many contacts/);
    });
});

describe('follow-ups', () => {
    test('add, edit, tick off and reopen', () => {
        let doc = withApp();
        doc = addTask(doc, { applicationId: 'a1', text: 'Send thanks', due: '2026-09-26', auto: true }, CONFIG, NOW, { id: 't1' }).doc;
        expect(findTask(doc, 't1')).toMatchObject({ auto: true, doneAt: null });
        doc = updateTask(doc, 't1', { text: 'Send a thank-you note', doneAt: 'x', applicationId: '' }, CONFIG, NOW).doc;
        expect(findTask(doc, 't1')).toMatchObject({ text: 'Send a thank-you note', applicationId: 'a1', doneAt: null });
        doc = setTaskDone(doc, 't1', true, CONFIG, LATER).doc;
        expect(findTask(doc, 't1').doneAt).toBe(LATER.toISOString());
        expect(doc.log.at(-1).kind).toBe('done');
        expect(setTaskDone(doc, 't1', true, CONFIG, LATER).doc).toBe(doc);
        doc = setTaskDone(doc, 't1', false, CONFIG, LATER).doc;
        expect(doc.log.at(-1).kind).toBe('reopen');
        expect(tasksFor(doc, 'a1')).toHaveLength(1);
    });

    test('a follow-up may stand alone, but not on a missing application', () => {
        const doc = emptyDoc(CONFIG, NOW);
        const r = addTask(doc, { text: 'Update my portfolio' }, CONFIG, NOW, { id: 't1' });
        expect(r.record.applicationId).toBe('');
        expect(labelOf(r.doc, 'tasks', r.record)).toBe('Update my portfolio');
        expect(addTask(doc, { text: 'x', applicationId: 'nope' }, CONFIG, NOW).error).toBe('That application is no longer here.');
        expect(addTask(doc, { text: ' ' }, CONFIG, NOW).error).toBe('Please describe the follow-up.');
        expect(updateTask(r.doc, 't1', { text: '' }, CONFIG, NOW).error).toBe('Please describe the follow-up.');
    });
});

// ---- The wastebasket --------------------------------------------------------------

describe('the wastebasket', () => {
    function busyDoc() {
        let doc = withApp();
        doc = addEvent(doc, { applicationId: 'a1', type: 'email' }, CONFIG, NOW, { id: 'early-bin' }).doc;
        doc = deleteRecord(doc, 'events', 'early-bin', CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a1', type: 'interview' }, CONFIG, NOW, { id: 'e1' }).doc;
        doc = addTask(doc, { applicationId: 'a1', text: 'Thanks' }, CONFIG, NOW, { id: 't1' }).doc;
        return doc;
    }

    test('an application takes its events and follow-ups with it, and brings back only those', () => {
        let doc = deleteRecord(busyDoc(), 'applications', 'a1', CONFIG, LATER).doc;
        expect(findEvent(doc, 'e1').deletedAt).toBe(LATER.toISOString());
        expect(findTask(doc, 't1').deletedAt).toBe(LATER.toISOString());
        // Listed once, under the application, plus the email thrown away before.
        expect(wastebasket(doc).map((i) => i.record.id)).toEqual(['a1', 'early-bin']);

        doc = restoreRecord(doc, 'applications', 'a1', CONFIG, LATER).doc;
        expect(findApplication(doc, 'a1').deletedAt).toBeNull();
        expect(findEvent(doc, 'e1').deletedAt).toBeNull();
        expect(findTask(doc, 't1').deletedAt).toBeNull();
        expect(findEvent(doc, 'early-bin').deletedAt).not.toBeNull();
        expect(doc.log.at(-1).kind).toBe('restore');
    });

    test('an event cannot come back to an application that is still in the wastebasket', () => {
        const doc = deleteRecord(busyDoc(), 'applications', 'a1', CONFIG, LATER).doc;
        const r = restoreRecord(doc, 'events', 'early-bin', CONFIG, LATER);
        expect(r.doc).toBe(doc);
        expect(r.error).toMatch(/restore the application first/);
    });

    test('restoring something not in the wastebasket changes nothing', () => {
        const doc = busyDoc();
        expect(restoreRecord(doc, 'events', 'e1', CONFIG, NOW).doc).toBe(doc);
        expect(restoreRecord(doc, 'events', 'nope', CONFIG, NOW).error).toBe('That event is no longer here.');
        expect(restoreRecord(doc, 'files', 'e1', CONFIG, NOW).error).toMatch(/not something/);
        expect(deleteRecord(doc, 'files', 'e1', CONFIG, NOW).error).toMatch(/not something/);
        expect(purgeRecord(doc, 'files', 'e1', CONFIG, NOW).error).toMatch(/not something/);
    });

    test('a contact keeps its links while binned, and purging it removes them', () => {
        let doc = addContact(withApp(), { name: 'Pat' }, CONFIG, NOW, { id: 'c1' }).doc;
        doc = linkContact(doc, 'a1', 'c1', true, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a1', withContactIds: ['c1'] }, CONFIG, NOW, { id: 'e1' }).doc;
        doc = deleteRecord(doc, 'contacts', 'c1', CONFIG, NOW).doc;
        expect(findApplication(doc, 'a1').contactIds).toEqual(['c1']);
        expect(contactsFor(doc, findApplication(doc, 'a1'))).toEqual([]);
        expect(purgeRecord(withApp(), 'applications', 'a1', CONFIG, NOW).error).toMatch(/Only something in the wastebasket/);
        doc = purgeRecord(doc, 'contacts', 'c1', CONFIG, NOW).doc;
        expect(findContact(doc, 'c1')).toBeNull();
        expect(findApplication(doc, 'a1').contactIds).toEqual([]);
        expect(findEvent(doc, 'e1').withContactIds).toEqual([]);
        expect(doc.log.at(-1)).toMatchObject({ kind: 'purge', label: 'Pat' });
    });

    test('emptying it removes everything binned and everything that depended on it', () => {
        let doc = deleteRecord(busyDoc(), 'applications', 'a1', CONFIG, LATER).doc;
        doc = addApplication(doc, { company: 'Keep' }, CONFIG, NOW, { id: 'a2' }).doc;
        const r = emptyWastebasket(doc, CONFIG, LATER);
        expect(r.doc.applications.map((a) => a.id)).toEqual(['a2']);
        expect(r.doc.events).toEqual([]);
        expect(r.doc.tasks).toEqual([]);
        expect(r.doc.log.filter((e) => e.kind === 'purge').map((e) => e.label)).toEqual(['Acme, Designer', 'Acme, Designer']);
        expect(emptyWastebasket(r.doc, CONFIG, LATER).doc).toBe(r.doc);
    });
});

// ---- Samples --------------------------------------------------------------------

describe('samples', () => {
    test('clearing them removes every sample record and log line, and keeps the visitor’s own', () => {
        let doc = withApp({ company: 'Mine' }, { id: 'mine' });
        doc = addContact(doc, { name: 'Sample Pat' }, CONFIG, NOW, { id: 'sc', sample: true }).doc;
        doc = linkContact(doc, 'mine', 'sc', true, CONFIG, NOW).doc;
        doc = addApplication(doc, { company: 'Sample Co' }, CONFIG, NOW, { id: 'sa', sample: true }).doc;
        doc = addEvent(doc, { applicationId: 'sa' }, CONFIG, NOW, { id: 'se' }).doc;
        doc = addTask(doc, { applicationId: 'sa', text: 'Sample task' }, CONFIG, NOW, { id: 'st' }).doc;
        expect(hasSamples(doc)).toBe(true);

        const cleared = clearSamples(doc).doc;
        expect(cleared.applications.map((a) => a.id)).toEqual(['mine']);
        expect(cleared.applications[0].contactIds).toEqual([]);
        expect(cleared.contacts).toEqual([]);
        expect(cleared.events).toEqual([]);
        expect(cleared.tasks).toEqual([]);
        expect(cleared.log.every((e) => ['mine'].includes(e.id))).toBe(true);
        expect(hasSamples(cleared)).toBe(false);
        expect(clearSamples(cleared).doc).toBe(cleared);
    });
});

// ---- Settings, size, backup -------------------------------------------------------

describe('settings, size and backup', () => {
    test('settings merge and clamp', () => {
        const doc = setSettings(emptyDoc(CONFIG, NOW), { weeklyGoal: 8 }, CONFIG).doc;
        expect(doc.settings.weeklyGoal).toBe(8);
        expect(setSettings(doc, { weeklyGoal: 0 }, CONFIG).doc.settings.weeklyGoal).toBe(1);
    });

    test('storage use is counted in characters and warns near the budget', () => {
        const small = storageUse(emptyDoc(CONFIG, NOW), CONFIG);
        expect(small.warn).toBe(false);
        expect(small.chars).toBe(JSON.stringify(emptyDoc(CONFIG, NOW)).length);
        const tight = { ...CONFIG, storage: { ...CONFIG.storage, budgetChars: 100 } };
        expect(storageUse(emptyDoc(CONFIG, NOW), tight).warn).toBe(true);
    });

    test('a backup round-trips, and a bad one says why', () => {
        const doc = withApp();
        expect(backupFilename(NOW)).toBe('corner-office-2026-09-24.json');
        const back = parseBackup(serialize(doc), CONFIG, NOW);
        expect(back.ok).toBe(true);
        expect(back.doc).toEqual(doc);
        expect(parseBackup('not json', CONFIG, NOW)).toEqual({ ok: false, reason: 'parse' });
        expect(parseBackup('{"schema":9,"applications":[]}', CONFIG, NOW)).toEqual({ ok: false, reason: 'newer' });
    });
});

// ---- The storage edge --------------------------------------------------------------

describe('createStore', () => {
    test('fresh, then saved, then restored', () => {
        const storage = memoryStorage();
        const store = createStore(storage, CONFIG);
        expect(store.load(NOW).status).toBe('fresh');
        expect(store.save(withApp())).toBe(true);
        const again = createStore(storage, CONFIG).load(NOW);
        expect(again.status).toBe('restored');
        expect(again.doc.applications).toHaveLength(1);
    });

    test('a browser that refuses to read is never asked again', () => {
        const storage = { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} };
        const store = createStore(storage, CONFIG);
        expect(store.load(NOW).status).toBe('unavailable');
        expect(store.save(withApp())).toBe(false);
        expect(store.load(NOW).status).toBe('unavailable');
        expect(store.writable).toBe(false);
    });

    test('a browser that refuses to write stops being asked', () => {
        const storage = memoryStorage();
        storage.setItem = () => { throw new Error('quota'); };
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        expect(store.save(withApp())).toBe(false);
        expect(store.available).toBe(false);
    });

    test('an unreadable or newer office is left alone, until a restore replaces it', () => {
        for (const [text, status] of [['{nope', 'unreadable'], ['{"schema":9,"applications":[]}', 'newer'], ['[]', 'unreadable']]) {
            const storage = memoryStorage();
            storage.setItem(CONFIG.storage.key, text);
            const store = createStore(storage, CONFIG);
            expect(store.load(NOW).status).toBe(status);
            expect(store.save(withApp())).toBe(false);
            expect(storage.getItem(CONFIG.storage.key)).toBe(text);
            expect(store.replace(withApp())).toBe(true);
            expect(store.status).toBe('restored');
        }
    });

    test('another tab clearing the office is not undone by a late save', () => {
        const storage = memoryStorage();
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        store.save(withApp());
        storage.removeItem(CONFIG.storage.key);
        expect(store.save(withApp())).toBe(false);
        // Reading again (what the page does on a storage event) starts fresh.
        expect(store.load(NOW).status).toBe('fresh');
        expect(store.save(withApp())).toBe(true);
    });

    test('clear removes the office and saving works again; teardown stops saving', () => {
        const storage = memoryStorage();
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        store.save(withApp());
        store.clear();
        expect(storage.getItem(CONFIG.storage.key)).toBeNull();
        expect(store.save(withApp())).toBe(true);
        store.tearDown();
        expect(store.save(withApp())).toBe(false);
        expect(store.writable).toBe(false);
    });

    test('clear survives a browser that refuses', () => {
        const store = createStore({ getItem: () => null, setItem() {}, removeItem() { throw new Error('no'); } }, CONFIG);
        store.clear();
        expect(store.available).toBe(false);
    });
});
