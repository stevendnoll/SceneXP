// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's derived numbers: what is due, what has gone quiet, the
 * weekly goal, the funnel and the reply rate.
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, updateApplication, addEvent, addTask, setTaskDone, setStatus, deleteRecord, setSettings
} from '../www/office/js/store.js';
import {
    buildIndex, lastActivityOn, isGhosted, effectiveStatus, dueTasks, upcomingEvents, followUpFor,
    weekly, perWeek, stageReached, funnel, responseStats, stats, nextEvent, FUNNEL
} from '../www/office/js/derive.js';

// Thursday, September 24, 2026. The week began on Monday the 21st.
const NOW = new Date(2026, 8, 24, 10, 0);
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0);

function app(doc, fields, id, when = NOW) {
    return addApplication(doc, fields, CONFIG, when, { id }).doc;
}

describe('activity and ghosting', () => {
    test('the last activity is the latest of the date, a status change, an event, or a ticked follow-up', () => {
        const a = { appliedOn: '2026-09-01', statusAt: at(2026, 9, 3).toISOString(), updatedAt: at(2026, 9, 20).toISOString() };
        expect(lastActivityOn(a)).toEqual(at(2026, 9, 3));
        expect(lastActivityOn(a, [{ at: '2026-09-10T14:00' }])).toEqual(at(2026, 9, 10, 14));
        expect(lastActivityOn(a, [], [{ doneAt: at(2026, 9, 12).toISOString() }])).toEqual(at(2026, 9, 12));
        expect(lastActivityOn({ appliedOn: null, updatedAt: '' })).toBeNull();
    });

    test('an application goes quiet past the threshold, and anything on the calendar keeps it awake', () => {
        let doc = app(emptyDoc(CONFIG, NOW), { company: 'Quiet', appliedOn: '2026-08-20' }, 'q', at(2026, 8, 20));
        const index = () => buildIndex(doc);
        expect(effectiveStatus(doc.applications[0], index(), doc.settings, CONFIG, NOW)).toBe('ghosted');
        doc = addEvent(doc, { applicationId: 'q', type: 'call', at: '2026-10-01T10:00' }, CONFIG, at(2026, 8, 20)).doc;
        expect(effectiveStatus(doc.applications[0], index(), doc.settings, CONFIG, NOW)).toBe('applied');
    });

    test('a threshold the visitor raised is respected, and closed ones never go quiet', () => {
        let doc = app(emptyDoc(CONFIG, NOW), { company: 'Quiet', appliedOn: '2026-08-20' }, 'q', at(2026, 8, 20));
        const a = () => doc.applications[0];
        expect(isGhosted(a(), [], [], { ghostAfterDays: 60 }, CONFIG, NOW)).toBe(false);
        doc = setStatus(doc, 'q', 'rejected', CONFIG, at(2026, 8, 20)).doc;
        expect(isGhosted(a(), [], [], doc.settings, CONFIG, NOW)).toBe(false);
    });

    test('an application from August entered today has still been quiet since August', () => {
        const doc = app(emptyDoc(CONFIG, NOW), { company: 'Backfilled', appliedOn: '2026-08-20' }, 'b', NOW);
        expect(isGhosted(doc.applications[0], [], [], doc.settings, CONFIG, NOW)).toBe(true);
    });

    test('an edit does not wake it up, and a status change does', () => {
        let doc = app(emptyDoc(CONFIG, NOW), { company: 'Quiet', appliedOn: '2026-08-20' }, 'q', at(2026, 8, 20));
        doc = updateApplication(doc, 'q', { notes: 'Fixed a typo' }, CONFIG, at(2026, 9, 20)).doc;
        expect(isGhosted(doc.applications[0], [], [], doc.settings, CONFIG, NOW)).toBe(true);
        doc = setStatus(doc, 'q', 'screening', CONFIG, at(2026, 9, 20)).doc;
        expect(isGhosted(doc.applications[0], [], [], doc.settings, CONFIG, NOW)).toBe(false);
    });

    test('nextEvent picks the soonest one still ahead', () => {
        const events = [{ at: '2026-09-30T09:00' }, { at: '2026-09-20T09:00' }, { at: '2026-09-26T09:00' }, { at: null }];
        expect(nextEvent(events, NOW).at).toBe('2026-09-26T09:00');
        expect(nextEvent([], NOW)).toBeNull();
    });
});

describe('today', () => {
    function withTasks() {
        let doc = app(emptyDoc(CONFIG, NOW), { company: 'Acme' }, 'a');
        const add = (text, due, id, appId = 'a') => {
            doc = addTask(doc, { applicationId: appId, text, due }, CONFIG, NOW, { id }).doc;
        };
        add('Old', '2026-09-20', 'old');
        add('Older', '2026-09-18', 'older');
        add('Today', '2026-09-24', 'today');
        add('Later', '2026-09-30', 'later');
        add('Someday', null, 'someday');
        add('Standalone', '2026-09-24', 'solo', '');
        add('Done', '2026-09-22', 'done');
        doc = setTaskDone(doc, 'done', true, CONFIG, NOW).doc;
        return doc;
    }

    test('overdue and due today, oldest first, never undated or done ones', () => {
        const due = dueTasks(withTasks(), NOW);
        expect(due.overdue.map((t) => t.id)).toEqual(['older', 'old']);
        expect(due.today.map((t) => t.id).sort()).toEqual(['solo', 'today']);
    });

    test('follow-ups of an application in the wastebasket are not due', () => {
        const doc = deleteRecord(withTasks(), 'applications', 'a', CONFIG, NOW).doc;
        const due = dueTasks(doc, NOW);
        expect(due.overdue).toEqual([]);
        expect(due.today.map((t) => t.id)).toEqual(['solo']);
    });

    test('upcoming events run from now through the window, soonest first', () => {
        let doc = app(emptyDoc(CONFIG, NOW), { company: 'Acme' }, 'a');
        for (const [id, when] of [['past', '2026-09-24T09:00'], ['soon', '2026-09-24T15:00'], ['week', '2026-10-01T09:00'], ['far', '2026-10-02T09:00']]) {
            doc = addEvent(doc, { applicationId: 'a', type: 'call', at: when }, CONFIG, NOW, { id }).doc;
        }
        expect(upcomingEvents(doc, NOW, 7).map((e) => e.id)).toEqual(['soon', 'week']);
    });

    test('the follow-up offered after logging an application', () => {
        expect(followUpFor({ id: 'a', company: 'Acme', role: 'Designer' }, { followUpDays: 7 }, NOW)).toEqual({
            applicationId: 'a', text: 'Follow up with Acme', due: '2026-10-01', auto: true
        });
        expect(followUpFor({ id: 'a', company: '', role: 'Designer' }, { followUpDays: 3 }, NOW).text).toBe('Follow up with Designer');
    });
});

describe('weeks', () => {
    function sent() {
        let doc = emptyDoc(CONFIG, NOW);
        const add = (id, appliedOn, status) => { doc = app(doc, { company: id, appliedOn, status }, id); };
        add('mon', '2026-09-21');
        add('thu', '2026-09-24');
        add('sun-before', '2026-09-20');
        add('saved', null, 'saved');
        add('three-weeks', '2026-09-03');
        add('binned', '2026-09-22');
        doc = deleteRecord(doc, 'applications', 'binned', CONFIG, NOW).doc;
        return doc;
    }

    test('this week counts applications sent since Monday against the goal', () => {
        expect(weekly(sent(), NOW)).toEqual({ key: '2026-09-21', count: 2, goal: 5, met: false, remaining: 3 });
        const easy = setSettings(sent(), { weeklyGoal: 2 }, CONFIG).doc;
        expect(weekly(easy, NOW)).toMatchObject({ met: true, remaining: 0 });
    });

    test('per week, oldest first, the current week last', () => {
        expect(perWeek(sent(), NOW, 4)).toEqual([
            { key: '2026-08-31', count: 1 },
            { key: '2026-09-07', count: 0 },
            { key: '2026-09-14', count: 1 },
            { key: '2026-09-21', count: 2 }
        ]);
    });
});

describe('the funnel and replies', () => {
    test('a rejection after an interview still reached interviewing', () => {
        const events = [{ type: 'screen' }, { type: 'interview' }];
        expect(stageReached({ status: 'rejected' }, events, CONFIG)).toBe(FUNNEL.indexOf('interviewing'));
        expect(stageReached({ status: 'saved' }, [], CONFIG)).toBe(-1);
        expect(stageReached({ status: 'accepted' }, [], CONFIG)).toBe(FUNNEL.indexOf('accepted'));
        expect(stageReached({ status: 'applied' }, [{ type: 'email' }], CONFIG)).toBe(0);
    });

    function pipeline() {
        let doc = emptyDoc(CONFIG, NOW);
        doc = app(doc, { company: 'Silent', appliedOn: '2026-09-01' }, 'silent');
        doc = app(doc, { company: 'Screened', appliedOn: '2026-09-01' }, 'screened');
        doc = addEvent(doc, { applicationId: 'screened', type: 'screen', at: '2026-09-05T10:00' }, CONFIG, NOW).doc;
        doc = app(doc, { company: 'Offer', appliedOn: '2026-09-02' }, 'offer');
        doc = addEvent(doc, { applicationId: 'offer', type: 'interview', at: '2026-09-11T10:00' }, CONFIG, NOW).doc;
        doc = setStatus(doc, 'offer', 'offer', CONFIG, NOW).doc;
        doc = app(doc, { company: 'No', appliedOn: '2026-09-03' }, 'no');
        doc = setStatus(doc, 'no', 'rejected', CONFIG, at(2026, 9, 10)).doc;
        doc = app(doc, { company: 'Changed my mind', appliedOn: '2026-09-03' }, 'withdrew');
        doc = setStatus(doc, 'withdrew', 'withdrawn', CONFIG, NOW).doc;
        doc = app(doc, { company: 'Saved', status: 'saved' }, 'saved');
        return doc;
    }

    test('funnel counts each stage reached', () => {
        expect(funnel(pipeline(), CONFIG)).toEqual([
            { stage: 'applied', count: 5 },
            { stage: 'screening', count: 2 },
            { stage: 'interviewing', count: 1 },
            { stage: 'offer', count: 1 },
            { stage: 'accepted', count: 0 }
        ]);
    });

    test('replies leave out withdrawn ones and time the first answer', () => {
        // Sent: silent, screened, offer, no. Replied: screened (4 days), offer (9 days), no (7 days).
        expect(responseStats(pipeline(), CONFIG)).toEqual({ sent: 4, replied: 3, rate: 0.75, medianDays: 7 });
        expect(responseStats(emptyDoc(CONFIG, NOW), CONFIG)).toEqual({ sent: 0, replied: 0, rate: null, medianDays: null });
    });

    test('stats gathers it all', () => {
        const s = stats(pipeline(), CONFIG, NOW);
        expect(s).toMatchObject({ applications: 6, open: 4, ghosted: 1, contacts: 0, dueToday: 0, overdue: 0, upcoming: 0 });
        expect(s.weekly.count).toBe(0);
        expect(s.funnel).toHaveLength(FUNNEL.length);
    });
});
