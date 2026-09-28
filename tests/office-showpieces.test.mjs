// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's M6 pure modules: the whiteboard's numbers and layout, and
 * the printed prep sheet. (The split-flap departures board was removed,
 * QA 2026-09-29.)
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, addEvent, addTask, addContact, linkContact, setStatus, setTaskDone, deleteRecord, setSettings
} from '../www/office/js/store.js';
import {
    boardModel, funnelBars, weekChart, onGoalLine, bigNumbers, summaryLines, LAYOUT
} from '../www/office/js/whiteboard.js';
import { prepSheet, printChoices, QUESTION_LINES } from '../www/office/js/prep.js';

// Thursday, September 24, 2026, 10 AM.
const NOW = new Date(2026, 8, 24, 10, 0);

// ---- The whiteboard --------------------------------------------------------------

function pipeline() {
    let doc = emptyDoc(CONFIG, NOW);
    const add = (id, company, appliedOn) => { doc = addApplication(doc, { company, appliedOn }, CONFIG, NOW, { id }).doc; };
    add('a', 'Acme', '2026-09-21');
    add('b', 'Birch', '2026-09-22');
    add('c', 'Cedar', '2026-09-08');
    doc = addEvent(doc, { applicationId: 'b', type: 'interview', at: '2026-09-23T10:00' }, CONFIG, NOW).doc;
    doc = setStatus(doc, 'c', 'rejected', CONFIG, new Date(2026, 8, 15)).doc;
    return doc;
}

describe('the whiteboard', () => {
    test('the model: the funnel, eight weeks, the goal, and the replies', () => {
        const m = boardModel(pipeline(), CONFIG, NOW);
        expect(m.funnel.map((f) => f.label)).toEqual(['Applied', 'Screening', 'Interviewing', 'Offer', 'Accepted']);
        expect(m.funnel.map((f) => f.count)).toEqual([3, 1, 1, 0, 0]);
        expect(m.weeks).toHaveLength(8);
        expect(m.weeks.at(-1)).toEqual({ label: 'Sep 21', count: 2, current: true });
        expect(m.goal).toBe(5);
        expect(m.response.replied).toBe(2);
    });

    test('funnel bars grow with their counts, and a zero is still a sliver', () => {
        const bars = funnelBars(boardModel(pipeline(), CONFIG, NOW));
        expect(bars[0].w).toBeGreaterThan(bars[1].w);
        expect(bars[1].w).toBeCloseTo(bars[0].w / 3, 9);
        expect(bars[3].w).toBeGreaterThan(0);
        for (const b of bars) {
            expect(b.x + b.w).toBeLessThanOrEqual(LAYOUT.funnel.x1);
            expect(b.y + b.h).toBeLessThanOrEqual(LAYOUT.funnel.y1);
        }
    });

    test('the goal line is always on the board, above a quiet week, and the bars never pass the top', () => {
        const quiet = weekChart(boardModel(pipeline(), CONFIG, NOW));
        expect(quiet.goalY).toBeGreaterThan(LAYOUT.weeks.y0);
        expect(quiet.goalY).toBeLessThan(quiet.bars.at(-1).y);
        let doc = pipeline();
        for (let i = 0; i < 12; i++) doc = addApplication(doc, { company: `X${i}`, appliedOn: '2026-09-23' }, CONFIG, NOW).doc;
        const busy = weekChart(boardModel(doc, CONFIG, NOW));
        expect(busy.bars.at(-1).y).toBeCloseTo(LAYOUT.weeks.y0, 9);
        expect(busy.goalY).toBeGreaterThan(busy.bars.at(-1).y);
    });

    test('a tap on the goal line is recognized from its uv, give or take a fingertip, and nowhere else', () => {
        const m = boardModel(pipeline(), CONFIG, NOW);
        const chart = weekChart(m);
        const mid = (chart.x0 + chart.x1) / 2;
        // uv runs up, the layout runs down.
        expect(onGoalLine({ x: mid, y: 1 - chart.goalY }, m)).toBe(true);
        expect(onGoalLine({ x: mid, y: 1 - chart.goalY + 0.04 }, m)).toBe(true);
        expect(onGoalLine({ x: mid, y: 1 - chart.goalY + 0.2 }, m)).toBe(false);
        expect(onGoalLine({ x: 0.2, y: 1 - chart.goalY }, m)).toBe(false);
        expect(onGoalLine(null, m)).toBe(false);
    });

    test('the big numbers and the sentences, with nothing yet and with something', () => {
        const empty = boardModel(emptyDoc(CONFIG, NOW), CONFIG, NOW);
        expect(bigNumbers(empty)).toEqual([{ value: 'None yet', label: 'replies so far' }, { value: 'None yet', label: 'to a first reply' }]);
        expect(summaryLines(empty)).toEqual(['This week: 0 applications sent, against a goal of 5.', 'Nothing has been sent yet.']);
        const m = boardModel(setSettings(pipeline(), { weeklyGoal: 1 }, CONFIG).doc, CONFIG, NOW);
        expect(bigNumbers(m)[0]).toEqual({ value: '67%', label: 'heard back' });
        expect(summaryLines(m)).toEqual([
            'This week: 2 applications sent, against a goal of 1.',
            'How far they got: Applied 3, Screening 1, Interviewing 1.',
            'Companies replied to 2 of 3 (67%), usually within 4 days.'
        ]);
    });

    test('every sentence keeps house style', () => {
        const lines = [...summaryLines(boardModel(pipeline(), CONFIG, NOW)), ...summaryLines(boardModel(emptyDoc(CONFIG, NOW), CONFIG, NOW))];
        for (const line of lines) expect(line).not.toMatch(/[—;]/);
    });
});

// ---- The prep sheet --------------------------------------------------------------

describe('the prep sheet', () => {
    function office() {
        let doc = emptyDoc(CONFIG, NOW);
        doc = addApplication(doc, {
            company: 'Acme', role: 'Designer', appliedOn: '2026-09-10', location: 'Remote', workMode: 'remote',
            salaryMin: 100000, salaryMax: 120000, url: 'https://acme.example/job', notes: 'Ask about the team', posting: 'We build things'
        }, CONFIG, NOW, { id: 'a' }).doc;
        doc = addApplication(doc, { company: 'Birch' }, CONFIG, NOW, { id: 'b' }).doc;
        doc = addApplication(doc, { company: 'Cedar' }, CONFIG, NOW, { id: 'c' }).doc;
        doc = addContact(doc, { name: 'Pat Lee', title: 'Recruiter', email: 'pat@acme.example' }, CONFIG, NOW, { id: 'p' }).doc;
        doc = linkContact(doc, 'a', 'p', true, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a', type: 'screen', at: '2026-09-15T10:00', outcome: 'passed', withContactIds: ['p'] }, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'a', type: 'interview', at: '2026-09-29T14:00', title: 'Panel' }, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'c', type: 'call', at: '2026-09-26T09:00' }, CONFIG, NOW).doc;
        doc = addTask(doc, { applicationId: 'a', text: 'Prepare the case study', due: '2026-09-28' }, CONFIG, NOW).doc;
        doc = addTask(doc, { applicationId: 'a', text: 'Done already', due: '2026-09-20' }, CONFIG, NOW, { id: 'done' }).doc;
        doc = setTaskDone(doc, 'done', true, CONFIG, NOW).doc;
        return doc;
    }

    test('holds everything the visitor wants on the way to the interview', () => {
        const sheet = prepSheet(office(), 'a', CONFIG, NOW);
        expect(sheet.title).toBe('Acme, Designer');
        expect(sheet.facts.map(([k]) => k)).toEqual(['Status', 'Applied', 'Work', 'Location', 'Salary', 'Posting']);
        expect(sheet.facts[0][1]).toBe('Interviewing');
        expect(sheet.people).toEqual([{ name: 'Pat Lee', line: 'Recruiter', email: 'pat@acme.example', phone: '' }]);
        expect(sheet.upcoming).toEqual([expect.objectContaining({ what: 'Interview, round 1', title: 'Panel', with: [] })]);
        expect(sheet.past).toEqual([expect.objectContaining({ what: 'Phone screen', with: ['Pat Lee'], outcome: 'Moved forward' })]);
        expect(sheet.tasks).toEqual([{ text: 'Prepare the case study', due: 'Sep 28, 2026' }]);
        expect(sheet.notes).toBe('Ask about the team');
        expect(sheet.posting).toBe('We build things');
        expect(sheet.printed).toBe('Printed from Corner Office on Sep 24, 2026.');
        expect(QUESTION_LINES).toBeGreaterThan(3);
    });

    test('nothing for an application that is gone', () => {
        const doc = deleteRecord(office(), 'applications', 'a', CONFIG, NOW).doc;
        expect(prepSheet(doc, 'a', CONFIG, NOW)).toBeNull();
        expect(prepSheet(doc, 'nope', CONFIG, NOW)).toBeNull();
    });

    test('the printer offers the soonest interview first, then the rest by name', () => {
        const doc = office();
        expect(printChoices(doc, NOW).map((c) => [c.app.id, c.next])).toEqual([
            ['c', '2026-09-26T09:00'], ['a', '2026-09-29T14:00'], ['b', null]
        ]);
    });
});
