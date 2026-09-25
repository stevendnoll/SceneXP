// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's DOM modules imported from SOURCE: cards, forms, grid,
 * panels, files and paint.
 *
 * main.js reaches these through their .min builds, which the coverage report
 * does not count against the source (see the ".min imports hide coverage"
 * note), so the flows in office-ui.test.mjs run them without crediting them.
 * These tests hold the rules that live inside each module: the arming guard,
 * the toast's hold, the stacking order, the safe link, the phone labels.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, addEvent, addTask, deleteRecord, setTaskDone, addContact, linkContact
} from '../www/office/js/store.js';
import { queryApplications, facetCounts } from '../www/office/js/query.js';
import { weekly } from '../www/office/js/derive.js';

const NOW = new Date(2026, 8, 24, 10, 0);

let dom;
let cards;
let forms;
let grid;
let panels;
let files;
let paint;

beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    cards = await import('../www/office/js/cards.js');
    forms = await import('../www/office/js/forms.js');
    grid = await import('../www/office/js/grid.js');
    panels = await import('../www/office/js/panels.js');
    files = await import('../www/office/js/files.js');
    paint = await import('../www/office/js/paint.js');
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

const el = (id) => dom.el(id);

// ---- cards.js -----------------------------------------------------------------

describe('cards', () => {
    beforeEach(() => cards.initCards({ signal: new AbortController().signal }));

    test('h builds text, never markup', () => {
        const node = cards.h('p', { className: 'x', dataset: { id: '7' }, attrs: { 'aria-label': 'L' }, text: '<b>hi</b>' });
        expect(node.textContent).toBe('<b>hi</b>');
        expect(node.dataset.id).toBe('7');
        expect(node.getAttribute('aria-label')).toBe('L');
        const withKids = cards.h('div', {}, ['a', 3, null, false, '', cards.h('span')]);
        expect(withKids.children).toHaveLength(3);
    });

    test('opening an earlier card closes the later ones, keeping the stack in page order', () => {
        cards.openCard('folder');
        cards.openCard('event-form');
        expect(cards.__test__.openIds()).toEqual(['folder', 'event-form']);
        // The computer comes before both in the markup, so opening it closes
        // them rather than stacking beneath.
        cards.openCard('computer');
        expect(cards.__test__.openIds()).toEqual(['computer']);
        expect(el('event-form').hidden).toBe(true);
        expect(el('folder').hidden).toBe(true);
        expect(cards.topCard()).toBe('computer');
    });

    test('focus goes back where it came from, and an onClose hook runs once', () => {
        const opener = cards.h('button');
        opener.focus();
        const hook = jest.fn();
        cards.openCard('wastebasket', { onClose: hook });
        expect(dom.documentStub.activeElement).toBe(el('wastebasket-panel'));
        cards.closeTop();
        expect(hook).toHaveBeenCalledTimes(1);
        expect(dom.documentStub.activeElement).toBe(opener);
        expect(cards.closeTop()).toBeNull();
    });

    test('reopening a card over itself runs its old hook', () => {
        const first = jest.fn();
        cards.openCard('folder', { onClose: first });
        cards.openCard('folder');
        expect(first).toHaveBeenCalledTimes(1);
        expect(cards.isOpen('folder')).toBe(true);
    });

    test('a tap-opened card swallows pointer clicks for a beat, but never a key press', () => {
        cards.openCard('outtray', { armed: true });
        const panel = el('outtray-panel');
        const tap = fire(panel, 'click', { detail: 1 });
        expect(tap.defaultPrevented).toBe(true);
        const keyPress = fire(panel, 'click', { detail: 0 });
        expect(keyPress.defaultPrevented).toBe(false);
        jest.advanceTimersByTime(cards.__test__.ARM_MS + 10);
        expect(fire(panel, 'click', { detail: 1 }).defaultPrevented).toBe(false);
    });

    test('a click on the backdrop closes the card, and closeAll empties the stack', () => {
        cards.openCard('settings');
        fire(el('settings'), 'click', { target: el('settings') });
        expect(cards.anyOpen()).toBe(false);
        cards.openCard('folder');
        cards.openCard('task-form');
        cards.closeAll();
        expect(cards.anyOpen()).toBe(false);
    });

    test('the toast stays while held, offers undo once, and goes', () => {
        const undo = jest.fn();
        cards.toast('Saved', { undo, seconds: 1 });
        expect(el('office-toast').hidden).toBe(false);
        expect(el('toast-undo').hidden).toBe(false);
        fire(el('office-toast'), 'focusin');
        jest.advanceTimersByTime(3000);
        expect(el('office-toast').hidden).toBe(false);
        fire(el('office-toast'), 'focusout');
        jest.advanceTimersByTime(1100);
        expect(el('office-toast').hidden).toBe(true);
        cards.toast('Again', { undo });
        el('toast-undo').click();
        el('toast-undo').click();
        expect(undo).toHaveBeenCalledTimes(1);
        cards.toast('No undo');
        expect(el('toast-undo').hidden).toBe(true);
    });

    test('the confirm card runs its action only on confirm', () => {
        const yes = jest.fn();
        cards.confirmCard({ title: 'Sure?', detail: 'Really', onConfirm: yes, danger: true });
        expect(el('confirm-title').textContent).toBe('Sure?');
        const [cancel, confirm] = el('confirm-actions').children;
        expect(confirm.className).toMatch(/danger/);
        cancel.click();
        expect(yes).not.toHaveBeenCalled();
        cards.confirmCard({ title: 'Sure?', onConfirm: yes });
        el('confirm-actions').children[1].click();
        expect(yes).toHaveBeenCalledTimes(1);
        expect(cards.isOpen('confirm')).toBe(false);
    });

    test('announce refills the live region a beat later, so a repeat is heard', () => {
        cards.announce('Hello');
        expect(el('office-live').textContent).toBe('');
        jest.advanceTimersByTime(40);
        expect(el('office-live').textContent).toBe('Hello');
        cards.resetCards();
        expect(cards.anyOpen()).toBe(false);
    });
});

// ---- forms.js -----------------------------------------------------------------

describe('forms', () => {
    beforeEach(() => forms.initForms(CONFIG));

    test('the selects are filled from the labels', () => {
        expect(el('af-status').children.map((o) => o.textContent)).toContain('Not selected');
        expect(el('ef-type').children).toHaveLength(CONFIG.eventTypes.length);
    });

    test('a new application opens as quick add, an edit with its details showing', () => {
        forms.fillApplicationForm(null, { followUpDays: 1 });
        expect(el('af-more').open).toBe(false);
        expect(el('af-follow-row').hidden).toBe(false);
        expect(el('af-follow-text').textContent).toBe('Remind me to follow up in 1 day');
        expect(el('af-applied').value).toBe('');
        forms.fillApplicationForm({ company: 'Acme', role: 'Designer', status: 'offer', notes: 'N' }, { followUpDays: 7 });
        expect(el('application-form-title').textContent).toBe('Edit application');
        expect(el('af-more').open).toBe(true);
        expect(el('af-status-row').hidden).toBe(true);
        expect(el('af-follow-row').hidden).toBe(true);
        const read = forms.readApplicationForm();
        expect(read.fields).toMatchObject({ company: 'Acme', role: 'Designer', notes: 'N' });
    });

    test('validation says what to fix', () => {
        expect(forms.validateApplication({ company: '', role: '' })).toMatch(/company or a role/);
        expect(forms.validateApplication({ company: 'A', appliedOn: '2026-02-30', salaryMin: '', salaryMax: '' })).toMatch(/real date/);
        expect(forms.validateApplication({ company: 'A', appliedOn: '', salaryMin: '-5', salaryMax: '' })).toMatch(/number/);
        expect(forms.validateApplication({ company: 'A', appliedOn: '', salaryMin: '5', salaryMax: '6' })).toBe('');
        expect(forms.validateEvent({ at: '2026-09-24T10:00', round: '0', durationMinutes: '' })).toMatch(/round/);
        expect(forms.validateEvent({ at: '2026-09-24T10:00', round: '', durationMinutes: 'x' })).toMatch(/minutes/);
        expect(forms.validateEvent({ at: '2026-09-24T10:00', round: '2', durationMinutes: '45' })).toBe('');
        expect(forms.validateTask({ text: '', due: '' })).toMatch(/describe/);
        expect(forms.validateTask({ text: 'x', due: 'soon' })).toMatch(/real date/);
        expect(forms.validateTask({ text: 'x', due: '' })).toBe('');
    });

    test('the posting helper never overwrites what the visitor typed', () => {
        forms.fillApplicationForm(null, { followUpDays: 7 });
        el('af-url').value = 'https://mine.example';
        el('af-posting').value = '$90k-$100k https://theirs.example';
        const offer = forms.updateFound();
        expect(offer).toEqual({ salary: { min: 90000, max: 100000, period: 'year' } });
        expect(el('af-found-text').textContent).toBe('Found in the posting: a salary of $90,000 to $100,000 a year.');
        forms.useFound();
        expect(el('af-url').value).toBe('https://mine.example');
        expect(el('af-salary-max').value).toBe('100000');
    });

    test('event, follow-up and settings forms round-trip', () => {
        forms.fillEventForm(null, { defaultAt: '2026-09-24T10:30', applicationName: 'Acme' });
        expect(forms.readEventForm()).toMatchObject({ type: 'interview', at: '2026-09-24T10:30', outcome: 'pending', durationMinutes: '45' });
        forms.fillEventForm({ type: 'call', at: '2026-09-25T09:00', title: 'Hi', outcome: 'none' }, {});
        expect(el('event-form-title').textContent).toBe('Edit event');
        forms.fillTaskForm(null, { defaultDue: '2026-09-25', applicationName: '' });
        expect(forms.readTaskForm()).toEqual({ text: '', due: '2026-09-25' });
        forms.fillTaskForm({ text: 'Call', due: null }, {});
        expect(el('task-form-title').textContent).toBe('Edit follow-up');
        forms.fillSettingsForm(CONFIG.settings, CONFIG);
        expect(el('set-goal').max).toBe('100');
        el('set-ghost').value = '';
        expect(forms.readSettingsForm()).toEqual({ weeklyGoal: 5, followUpDays: 7 });
        forms.showError('af-error', 'Oops');
        expect(el('af-error').hidden).toBe(false);
    });
});

// ---- grid.js ------------------------------------------------------------------

describe('grid', () => {
    function office() {
        let doc = emptyDoc(CONFIG, NOW);
        doc = addApplication(doc, { company: 'Acme', role: 'Designer', salaryMin: 55, salaryMax: 70, salaryPeriod: 'hour', posting: 'kubernetes' }, CONFIG, NOW, { id: 'a' }).doc;
        doc = addApplication(doc, { company: 'Birch', role: 'Lead', workMode: 'remote', salaryMin: 120000, salaryMax: 140000 }, CONFIG, NOW, { id: 'b', sample: true }).doc;
        doc = addEvent(doc, { applicationId: 'b', type: 'interview', at: '2026-09-26T14:00' }, CONFIG, NOW).doc;
        return doc;
    }

    function draw(doc, query = {}, on = {}) {
        const handlers = {
            open: jest.fn(), sort: jest.fn(), toggleStatus: jest.fn(), toggleWorkMode: jest.fn(),
            toggleUpcoming: jest.fn(), origin: jest.fn(), clearFilters: jest.fn(), create: jest.fn(), stock: jest.fn(), ...on
        };
        const result = queryApplications(doc, query, CONFIG, NOW);
        grid.renderGrid({ result, facets: facetCounts(doc, CONFIG, NOW), week: weekly(doc, NOW), goal: 5, config: CONFIG, now: NOW, on: handlers });
        return handlers;
    }

    test('cell words', () => {
        expect(grid.activityText(null, NOW)).toBe('');
        expect(grid.activityText(new Date(2026, 8, 30), NOW)).toBe('Coming up');
        expect(grid.activityText(new Date(2026, 8, 24, 8), NOW)).toBe('Today');
        expect(grid.activityText(new Date(2026, 8, 23), NOW)).toBe('Yesterday');
        expect(grid.activityText(new Date(2026, 8, 20), NOW)).toBe('4 days ago');
        expect(grid.activityText(new Date(2026, 7, 2), NOW)).toBe('Aug 2');
        expect(grid.compactSalary({ salaryMin: 120000, salaryMax: 140000, salaryCurrency: 'USD' })).toBe('$120k to $140k');
        expect(grid.compactSalary({ salaryMin: 55, salaryMax: 70, salaryPeriod: 'hour', salaryCurrency: 'USD' })).toBe('$55 to $70 an hour');
        expect(grid.compactSalary({ salaryMin: null, salaryMax: 90000, salaryCurrency: 'EUR' })).toBe('EUR 90k');
        expect(grid.compactSalary({ salaryMin: null, salaryMax: null })).toBe('');
        expect(grid.nextText(null)).toBe('');
        expect(grid.nextText({ type: 'interview', at: '2026-09-26T14:00' })).toMatch(/^Interview, Sep 26, 2:00\sPM$/);
        expect(grid.countText(0, 0)).toBe('No applications yet.');
        expect(grid.countText(1, 1)).toBe('Showing all 1 application.');
    });

    test('rows carry their column names for the phone layout, and a sample says so', () => {
        draw(office(), { sortKey: 'company' });
        const [first, second] = el('grid-body').children;
        expect(first.children.map((td) => td.dataset.label)).toEqual(grid.COLUMNS.map((c) => c.label));
        expect(first.children[0].children[0].textContent).toBe('Acme');
        expect(second.children[0].children[1].textContent).toBe('Sample');
        expect(second.children[5].textContent).toMatch(/^Interview, Sep 26/);
        expect(el('grid-h-company').getAttribute('aria-sort')).toBe('ascending');
        expect(el('grid-h-salary').getAttribute('aria-sort')).toBe('none');
    });

    test('chips appear only for what is there, and each calls its handler', () => {
        const on = draw(office());
        const labels = el('grid-filters').children.map((c) => c.textContent);
        expect(labels).toEqual(['Applied1', 'Interviewing1', 'Remote1', 'Something coming up1', 'Samples1', 'Mine1']);
        el('grid-filters').children.forEach((c) => c.click());
        expect(on.toggleStatus).toHaveBeenCalledWith('applied');
        expect(on.toggleWorkMode).toHaveBeenCalledWith('remote');
        expect(on.toggleUpcoming).toHaveBeenCalled();
        expect(on.origin).toHaveBeenCalledWith('mine');
    });

    test('an empty office offers the first application and the samples', () => {
        const on = draw(emptyDoc(CONFIG, NOW));
        expect(el('grid-empty').hidden).toBe(false);
        const [add, stock] = el('grid-empty-actions').children;
        add.click();
        stock.click();
        expect(on.create).toHaveBeenCalled();
        expect(on.stock).toHaveBeenCalled();
        draw(emptyDoc(CONFIG, NOW), {}, { stock: null });
        expect(el('grid-empty-actions').children).toHaveLength(1);
    });

    test('the headers, the select, the arrow and the rows are wired once', () => {
        const onSortKey = jest.fn();
        const onReverse = jest.fn();
        grid.initGrid(CONFIG, { signal: new AbortController().signal, onSortKey, onReverse });
        expect(el('grid-sort').children).toHaveLength(Object.keys(CONFIG.sortKeys).length);
        el('grid-sort').value = 'salary';
        fire(el('grid-sort'), 'change');
        expect(onSortKey).toHaveBeenCalledWith('salary');
        el('grid-dir').click();
        expect(onReverse).toHaveBeenCalled();
        const on = draw(office());
        el('grid-sort-applied').click();
        expect(on.sort).toHaveBeenCalledWith('applied');
        const [a, b] = el('grid-body').children.map((tr) => tr.children[0].children[0]);
        a.focus();
        fire(el('grid-body'), 'keydown', { key: 'ArrowDown', target: a });
        expect(dom.documentStub.activeElement).toBe(b);
        fire(el('grid-body'), 'keydown', { key: 'ArrowDown', target: b });
        expect(dom.documentStub.activeElement).toBe(b);
        fire(el('grid-body'), 'keydown', { key: 'ArrowUp', target: b });
        expect(dom.documentStub.activeElement).toBe(a);
        fire(el('grid-body'), 'keydown', { key: 'x', target: a });
        fire(el('grid-body'), 'keydown', { key: 'ArrowUp', target: el('grid-body') });
    });

    test('a redraw keeps focus on the same row', () => {
        const doc = office();
        draw(doc, { sortKey: 'company' });
        el('grid-body').children[1].children[0].children[0].focus();
        draw(doc, { sortKey: 'company', sortDir: 'desc' });
        expect(dom.documentStub.activeElement.dataset.gridId).toBe('b');
    });
});

// ---- panels.js ----------------------------------------------------------------

describe('panels', () => {
    function folderDoc(url) {
        let doc = emptyDoc(CONFIG, NOW);
        doc = addApplication(doc, { company: 'Acme', role: 'Designer', url, notes: 'Notes', posting: 'Posting', appliedOn: '2026-08-01' }, CONFIG, new Date(2026, 7, 1), { id: 'a' }).doc;
        doc = addContact(doc, { name: 'Pat', title: 'Recruiter' }, CONFIG, NOW, { id: 'p' }).doc;
        doc = linkContact(doc, 'a', 'p', true, CONFIG, new Date(2026, 7, 1)).doc;
        doc = addEvent(doc, { applicationId: 'a', type: 'interview', at: '2026-08-05T10:00', outcome: 'passed', notes: 'Good' }, CONFIG, new Date(2026, 7, 1), { id: 'e' }).doc;
        doc = addTask(doc, { applicationId: 'a', text: 'Thank them', due: '2026-08-06' }, CONFIG, NOW, { id: 't' }).doc;
        doc = setTaskDone(doc, 't', true, CONFIG, new Date(2026, 7, 6)).doc;
        return doc;
    }

    function drawFolder(doc, status = 'applied') {
        const on = Object.fromEntries(['setStatus', 'edit', 'remove', 'logEvent', 'editEvent', 'removeEvent', 'addTask', 'editTask', 'toggleTask', 'removeTask'].map((k) => [k, jest.fn()]));
        panels.renderFolder({ doc, app: doc.applications[0], status, config: CONFIG, now: NOW, on });
        return on;
    }

    const texts = (node) => (node.textContent !== undefined && !node.children?.length
        ? [node.textContent] : (node.children || []).flatMap(texts));

    test('a folder shows the record, its people, events and follow-ups, and a link only when safe', () => {
        drawFolder(folderDoc('https://acme.example/job'));
        const words = texts(el('folder-body')).join(' | ');
        expect(el('folder-title').textContent).toBe('Acme, Designer');
        expect(words).toContain('People | Add a person | Pat | Recruiter | Open | Unlink');
        expect(words).toContain('Interview, round 1');
        expect(words).toContain('Moved forward');
        expect(words).toContain('Thank them');
        expect(words).toContain('Done');
        expect(words).toContain('Open the posting');
        drawFolder(folderDoc('javascript:alert(1)'));
        expect(texts(el('folder-body')).join(' ')).not.toContain('Open the posting');
    });

    test('a quiet application gets a kind nudge with the days counted', () => {
        drawFolder(folderDoc(''), 'ghosted');
        expect(texts(el('folder-body')).join(' ')).toMatch(/no word in \d+ days\. A friendly follow-up might help\./);
    });

    test('an empty folder says what goes where, and every button calls back', () => {
        const doc = addApplication(emptyDoc(CONFIG, NOW), { company: 'Solo' }, CONFIG, NOW, { id: 'solo' }).doc;
        const on = drawFolder(doc);
        const words = texts(el('folder-body')).join(' ');
        expect(words).toContain('Nothing logged yet');
        expect(words).toContain('No follow-ups');
        el('folder-actions').children.forEach((b) => b.click());
        expect(on.edit).toHaveBeenCalled();
        expect(on.remove).toHaveBeenCalled();
        expect(panels.eventName({ type: 'screen', round: 2 })).toBe('Phone screen');
    });

    test('the wastebasket lists what went in, with the day it went', () => {
        let doc = folderDoc('');
        doc = deleteRecord(doc, 'applications', 'a', CONFIG, NOW).doc;
        const restore = jest.fn();
        const items = panels.renderWastebasket({ doc, on: { restore } });
        expect(items).toHaveLength(1);
        const row = el('wastebasket-list').children[0];
        expect(texts(row).join(' ')).toContain('Application, thrown away Sep 24, 2026');
        row.children[1].children[0].click();
        expect(restore).toHaveBeenCalledWith('applications', 'a');
        expect(el('wastebasket-empty').disabled).toBe(false);
    });

    test('the samples buttons', () => {
        expect(panels.renderSamplesButtons(emptyDoc(CONFIG, NOW))).toBe(false);
        expect(el('settings-stock').hidden).toBe(false);
        const stocked = addApplication(emptyDoc(CONFIG, NOW), { company: 'S' }, CONFIG, NOW, { sample: true }).doc;
        expect(panels.renderSamplesButtons(stocked)).toBe(true);
        expect(el('settings-clear-samples').hidden).toBe(false);
    });
});

// ---- files.js and paint.js ----------------------------------------------------

describe('files and paint', () => {
    test('a download is a temporary link to a blob, revoked after', async () => {
        const blobs = [];
        jest.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blobs.push(b); return 'blob:x'; });
        const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        expect(files.download('a.json', '{"a":1}')).toBe(true);
        expect(await blobs[0].text()).toBe('{"a":1}');
        expect(blobs[0].type).toBe('application/json');
        jest.advanceTimersByTime(1100);
        expect(revoke).toHaveBeenCalledWith('blob:x');
    });

    test('reading a chosen file', async () => {
        expect(await files.readText(null)).toBeNull();
        expect(await files.readText({ text: async () => 'hi' })).toBe('hi');
        expect(await files.readText({ text: async () => { throw new Error('no'); } })).toBeNull();
        expect(await files.readText({})).toBeNull();
    });

    test('the painters draw on any size of canvas', () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        expect(() => paint.drawScreen(ctx, 512, 320, ['3 applications', 'Nothing due today'])).not.toThrow();
    });
});

// ---- M2: the calendar and today's list, from source ------------------------------

describe('calendar and today panels', () => {
    let calendar;
    beforeEach(async () => {
        calendar = await import('../www/office/js/calendar.js');
    });

    function office() {
        let doc = emptyDoc(CONFIG, NOW);
        doc = addApplication(doc, { company: 'Acme', role: 'Designer' }, CONFIG, NOW, { id: 'a' }).doc;
        doc = addEvent(doc, { applicationId: 'a', type: 'interview', at: '2026-09-26T14:00', title: 'Panel' }, CONFIG, NOW, { id: 'soon' }).doc;
        doc = addEvent(doc, { applicationId: 'a', type: 'call', at: '2026-09-22T09:00' }, CONFIG, NOW, { id: 'past' }).doc;
        doc = addTask(doc, { applicationId: 'a', text: 'Thank them', due: '2026-09-26' }, CONFIG, NOW, { id: 't' }).doc;
        doc = addTask(doc, { text: 'Update portfolio', due: '2026-09-20' }, CONFIG, NOW, { id: 'solo' }).doc;
        return doc;
    }

    const on = () => ({ selectDay: jest.fn(), openFolder: jest.fn(), toggleTask: jest.fn(), exportEvent: jest.fn() });
    const words = (node) => (node.children && node.children.length
        ? node.children.flatMap(words) : [node.textContent || '']);

    test('the month is day buttons, one tab stop, marked and labeled', () => {
        const doc = office();
        const grid = calendar.monthGrid(2026, 8);
        const handlers = on();
        panels.renderCalendar({ doc, grid, marks: calendar.monthAgenda(doc, grid), selectedKey: '2026-09-26', todayKey: '2026-09-24', now: NOW, on: handlers });
        const buttons = el('cal-body').children.flatMap((tr) => tr.children.map((td) => td.children[0]));
        expect(buttons).toHaveLength(35);
        expect(buttons.filter((b) => b.tabIndex === 0).map((b) => b.dataset.day)).toEqual(['2026-09-26']);
        const chosen = buttons.find((b) => b.dataset.day === '2026-09-26');
        expect(chosen.className).toContain('is-selected');
        expect(chosen.getAttribute('aria-label')).toBe('Saturday, September 26, 1 event and 1 follow-up');
        expect(chosen.children.map((c) => c.className)).toEqual(['cal-num', 'cal-dot', 'cal-ring']);
        expect(buttons.find((b) => b.dataset.day === '2026-09-24').className).toContain('is-today');
        expect(buttons[0].className).toContain('is-out');
        buttons[3].click();
        expect(handlers.selectDay).toHaveBeenCalledWith(buttons[3].dataset.day);

        // The chosen day's list: the event with its buttons, then the follow-up.
        const rows = el('cal-day-list').children;
        expect(el('cal-day-title').textContent).toBe('Saturday, September 26');
        expect(words(rows[0])).toEqual(expect.arrayContaining(['Interview, round 1: Acme, Designer', 'Panel', 'Add to my calendar', 'Open the folder']));
        rows[0].children[1].children[0].click();
        expect(handlers.exportEvent).toHaveBeenCalledWith('soon');
        rows[0].children[1].children[1].click();
        expect(handlers.openFolder).toHaveBeenCalledWith('a');
        const box = rows[1].children[0].children[0];
        box.checked = true;
        fire(box, 'change');
        expect(handlers.toggleTask).toHaveBeenCalledWith('t', true);
    });

    test('a past event offers no calendar file, and a redraw keeps focus on the chosen day', () => {
        const doc = office();
        const grid = calendar.monthGrid(2026, 8);
        const marks = calendar.monthAgenda(doc, grid);
        const draw = (key) => panels.renderCalendar({ doc, grid, marks, selectedKey: key, todayKey: '2026-09-24', now: NOW, on: on() });
        draw('2026-09-22');
        expect(words(el('cal-day-list').children[0])).not.toContain('Add to my calendar');
        const first = el('cal-body').children[3].children[1].children[0];
        first.focus();
        draw('2026-09-23');
        expect(dom.documentStub.activeElement.dataset.day).toBe('2026-09-23');
    });

    test('today’s list groups overdue, today and the week, and says when the desk is clear', () => {
        const doc = office();
        const handlers = on();
        const n = panels.renderToday({
            doc,
            due: { overdue: [doc.tasks[1]], today: [doc.tasks[0]] },
            coming: [doc.events[0]],
            now: NOW,
            on: handlers
        });
        expect(n).toBe(3);
        const heads = el('today-list').children.filter((li) => li.className === 'today-heading').map((li) => li.children[0].textContent);
        expect(heads).toEqual(['Overdue', 'Today', 'Coming up this week']);
        // A follow-up with no application offers no folder.
        expect(el('today-list').children[1].children).toHaveLength(1);
        expect(words(el('today-list').children[1])).toEqual(expect.arrayContaining(['Update portfolio', 'Due Sep 20, 2026']));
        expect(panels.renderToday({ doc, due: { overdue: [], today: [] }, coming: [], now: NOW, on: handlers })).toBe(0);
        expect(el('today-note').textContent).toBe('Nothing is due today. Enjoy the clear desk.');
    });

    test('the folder offers the calendar only for what is still ahead', () => {
        const doc = office();
        const handlers = Object.fromEntries(['setStatus', 'edit', 'remove', 'logEvent', 'editEvent', 'removeEvent', 'exportEvent', 'addTask', 'editTask', 'toggleTask', 'removeTask'].map((k) => [k, jest.fn()]));
        panels.renderFolder({ doc, app: doc.applications[0], status: 'interviewing', config: CONFIG, now: NOW, on: handlers });
        const all = words(el('folder-body'));
        expect(all.filter((w) => w === 'Add to my calendar')).toHaveLength(1);
    });
});

describe('the M2 painters', () => {
    test('the calendar and the notes paint without a hitch', async () => {
        const calendar = await import('../www/office/js/calendar.js');
        const notes = await import('../www/office/js/notes.js');
        const ctx = document.createElement('canvas').getContext('2d');
        const grid = calendar.monthGrid(2026, 8);
        const marks = new Map([['2026-09-24', { events: [1], tasks: [1] }]]);
        expect(() => paint.drawCalendar(ctx, 512, 700, { grid, marks, todayKey: '2026-09-24' })).not.toThrow();
        const list = notes.stickyNotes({ overdue: [{ id: 'a', text: 'Call Priya about the panel and the portfolio review next week' }], today: [] });
        expect(() => paint.drawNoteAtlas(ctx, 768, 512, list, notes.ATLAS, notes.noteWords, notes.noteColor)).not.toThrow();
    });

    test('the board header and a card face paint, shrinking a long column name to fit', () => {
        const fonts = [];
        const ctx = new Proxy({
            measureText: (text) => ({ width: text.length * Number(/(\d+)px/.exec(ctx.font)[1]) * 0.6 }),
            fillText() {}, fillRect() {}, arc() {}, beginPath() {}, fill() {}
        }, {
            set(target, prop, value) {
                if (prop === 'font') fonts.push(value);
                target[prop] = value;
                return true;
            }
        });
        paint.drawBoardHeader(ctx, 1024, 52, ['Saved for later', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Accepted', 'Not selected', 'Withdrawn']);
        const first = Number(/(\d+)px/.exec(fonts[0])[1]);
        expect(fonts.some((f) => Number(/(\d+)px/.exec(f)[1]) < first)).toBe(true);
        fonts.length = 0;
        paint.drawCardFace(ctx, 0, 0, 256, 160, { title: 'Quillfeather Labs', subtitle: 'Staff Engineer', note: 'Gone quiet', band: '#7b6fd6' });
        paint.drawCardFace(ctx, 256, 0, 256, 160, { title: 'Solo' });
        expect(fonts.length).toBeGreaterThanOrEqual(5);
    });

    test('a drawer label shrinks its type until it fits', () => {
        const sizes = [];
        const ctx = new Proxy({
            measureText: (text) => ({ width: text.length * Number(/(\d+)px/.exec(ctx.font)[1]) * 0.6 }),
            fillText() {}, strokeRect() {}, fillRect() {}
        }, {
            set(target, prop, value) {
                if (prop === 'font') sizes.push(Number(/(\d+)px/.exec(value)[1]));
                target[prop] = value;
                return true;
            }
        });
        paint.drawLabelCard(ctx, 256, 64, 'Saved and applied');
        expect(sizes[0]).toBe(32);
        expect(sizes.at(-1)).toBeLessThan(32);
        expect('Saved and applied'.length * sizes.at(-1) * 0.6).toBeLessThanOrEqual(256 * 0.9);
        sizes.length = 0;
        paint.drawLabelCard(ctx, 256, 64, 'A to F');
        expect(sizes).toEqual([32]);
    });

    test('wrapping keeps whole words and ends a long text with an ellipsis', () => {
        // A measure where every character is 10 wide.
        const ctx = { measureText: (s) => ({ width: s.length * 10 }) };
        expect(paint.wrap(ctx, 'Call Priya back', 100, 3)).toEqual(['Call Priya', 'back']);
        const long = paint.wrap(ctx, 'one two three four five six seven eight nine ten', 100, 2);
        expect(long).toHaveLength(2);
        expect(long[1].endsWith('…')).toBe(true);
        expect(paint.wrap(ctx, 'Supercalifragilistic', 50, 2)).toEqual(['Supercalifragilistic']);
        expect(paint.wrap({}, 'no measure here', 1000, 2)).toEqual(['no measure here']);
    });
});

// ---- M5: people, from source ------------------------------------------------------

describe('people panels and forms', () => {
    function office() {
        let doc = emptyDoc(CONFIG, NOW);
        doc = addApplication(doc, { company: 'Acme', role: 'Designer' }, CONFIG, NOW, { id: 'a' }).doc;
        doc = addApplication(doc, { company: 'Birch', role: 'Lead' }, CONFIG, NOW, { id: 'b' }).doc;
        doc = addContact(doc, { name: 'Pat Lee', title: 'Recruiter', company: 'Acme', email: 'pat@acme.example', phone: '(555) 010-0199', linkedIn: 'https://linkedin.example/in/pat', notes: 'Met at a meetup' }, CONFIG, NOW, { id: 'p' }).doc;
        doc = addContact(doc, { name: 'Sam', email: 'not an email', phone: '12' }, CONFIG, NOW, { id: 's' }).doc;
        doc = linkContact(doc, 'a', 'p', true, CONFIG, NOW).doc;
        doc = addEvent(doc, { applicationId: 'b', type: 'screen', at: '2026-09-28T10:00', withContactIds: ['p'] }, CONFIG, NOW, { id: 'ev' }).doc;
        return doc;
    }
    const find = (node, pred) => (pred(node) ? [node] : (node.children || []).flatMap((c) => find(c, pred)));
    const words = (node) => (node.children && node.children.length ? node.children.flatMap(words) : [node.textContent || '']);

    test('a contact card links a real email, a dialable phone and a safe profile, and nothing else', () => {
        const on = Object.fromEntries(['openFolder', 'unlink', 'link', 'showApplications', 'edit', 'remove'].map((k) => [k, jest.fn()]));
        const doc = office();
        panels.renderContact({ doc, contact: doc.contacts[0], on });
        const links = find(el('contact-body'), (n) => n.tagName === 'A').map((a) => a.href);
        expect(links).toEqual(['mailto:pat@acme.example', 'tel:5550100199', 'https://linkedin.example/in/pat']);
        const all = words(el('contact-body'));
        expect(all).toEqual(expect.arrayContaining(['Recruiter at Acme', 'Acme, Designer', 'Birch, Lead', 'Interviewing. Met at an event'.replace('Interviewing', 'Screening'), 'Met at', 'Met at a meetup']));
        // Direct links can be undone here, links through an event cannot.
        const unlinks = find(el('contact-body'), (n) => n.tagName === 'BUTTON' && n.textContent === 'Unlink');
        expect(unlinks).toHaveLength(1);
        unlinks[0].click();
        expect(on.unlink).toHaveBeenCalledWith('a');
        // Birch is his only through an event, so it can still be linked directly.
        const offered = find(el('contact-body'), (n) => n.id === 'contact-link-app')[0];
        expect(offered.children.map((o) => o.textContent)).toEqual(['Birch, Lead']);
        el('contact-actions').children.forEach((b) => b.click());
        expect(on.showApplications).toHaveBeenCalled();
        expect(on.edit).toHaveBeenCalled();
        expect(on.remove).toHaveBeenCalled();

        panels.renderContact({ doc, contact: doc.contacts[1], on });
        expect(find(el('contact-body'), (n) => n.tagName === 'A')).toHaveLength(0);
        expect(words(el('contact-body'))).toContain('Not linked to any application yet.');
        const pick = find(el('contact-body'), (n) => n.id === 'contact-link-app')[0];
        expect(pick.children.map((o) => o.textContent)).toEqual(['Acme, Designer', 'Birch, Lead']);
        pick.value = 'b';
        find(el('contact-body'), (n) => n.tagName === 'BUTTON' && n.textContent === 'Link')[0].click();
        expect(on.link).toHaveBeenCalledWith('b');
        // With no applications at all, "show their applications" is not offered.
        expect(el('contact-actions').children.map((b) => b.textContent)).toEqual(['Edit', 'Throw away']);
    });

    test('the Rolodex list says how many match, and each person is a button', () => {
        const open = jest.fn();
        const doc = office();
        expect(panels.renderRolodexList({ people: doc.contacts, total: 2, text: '', on: { open } })).toBe(2);
        expect(el('rolodex-count').textContent).toBe('2 people in the Rolodex.');
        const first = el('rolodex-list').children[0].children[0];
        expect(words(first)).toEqual(['Pat Lee', 'Recruiter at Acme']);
        first.click();
        expect(open).toHaveBeenCalledWith('p');
        panels.renderRolodexList({ people: [doc.contacts[0]], total: 1, text: 'pat', on: { open } });
        expect(el('rolodex-count').textContent).toBe('1 of 1 person match.');
        panels.renderRolodexList({ people: [], total: 0, text: '', on: { open } });
        expect(el('rolodex-count').textContent).toBe('The Rolodex is empty. New contact adds the first card.');
    });

    test('the folder’s People: open, unlink, add, and link someone already there', () => {
        const doc = office();
        const on = Object.fromEntries(['setStatus', 'edit', 'remove', 'logEvent', 'editEvent', 'removeEvent', 'exportEvent', 'addTask', 'editTask', 'toggleTask', 'removeTask', 'openContact', 'unlinkContact', 'linkContact', 'addPerson'].map((k) => [k, jest.fn()]));
        panels.renderFolder({ doc, app: doc.applications[0], status: 'applied', config: CONFIG, now: NOW, on });
        const buttons = find(el('folder-body'), (n) => n.tagName === 'BUTTON');
        const press = (label) => buttons.find((b) => b.textContent === label).click();
        press('Open');
        press('Unlink');
        press('Add a person');
        press('Link');
        expect(on.openContact).toHaveBeenCalledWith('p');
        expect(on.unlinkContact).toHaveBeenCalledWith('p');
        expect(on.addPerson).toHaveBeenCalled();
        expect(on.linkContact).toHaveBeenCalledWith('s');
        panels.renderFolder({ doc, app: doc.applications[1], status: 'applied', config: CONFIG, now: NOW, on });
        expect(words(el('folder-body'))).toContain('Nobody linked yet. Recruiters, interviewers and referrals go here.');
    });

    test('the event form asks who was there, and the contact form round-trips', () => {
        forms.initForms(CONFIG);
        forms.fillEventWith([{ id: 'p', name: 'Pat Lee' }, { id: 's', name: 'Sam' }], ['s']);
        expect(el('ef-with-row').hidden).toBe(false);
        expect(forms.readEventForm().withContactIds).toEqual(['s']);
        forms.fillEventWith([]);
        expect(el('ef-with-row').hidden).toBe(true);
        expect(forms.readEventForm().withContactIds).toEqual([]);

        forms.fillContactForm(null, { about: 'Linked to Acme', company: 'Acme' });
        expect(el('contact-form-title').textContent).toBe('New contact');
        expect(el('cf-company').value).toBe('Acme');
        forms.fillContactForm({ name: 'Pat', title: 'Recruiter', company: 'Acme', email: '', phone: '', linkedIn: '', notes: '' });
        expect(el('contact-form-title').textContent).toBe('Edit contact');
        expect(forms.readContactForm()).toMatchObject({ name: 'Pat', title: 'Recruiter' });
        expect(forms.validateContact({ name: 'Pat', email: 'pat@acme.example', linkedIn: 'linkedin.example/in/pat' })).toBe('');
    });

    test('the lettered cards paint', async () => {
        const rolodex = await import('../www/office/js/rolodex.js');
        const ctx = document.createElement('canvas').getContext('2d');
        expect(() => paint.drawLetterAtlas(ctx, 1152, 288, rolodex.LETTERS, rolodex.LETTER_ATLAS)).not.toThrow();
    });
});

// ---- M6: the whiteboard, the departures and the prep sheet, from source ------------

describe('M6 panels and painters', () => {
    test('the whiteboard sheet: sentences, the goal, and both tables', () => {
        const model = {
            goal: 5,
            funnel: [{ label: 'Applied', count: 3 }, { label: 'Screening', count: 1 }],
            weeks: [{ label: 'Sep 14', count: 1, current: false }, { label: 'Sep 21', count: 2, current: true }]
        };
        panels.renderWhiteboardSheet(model, ['Line one.', 'Line two.']);
        expect(el('wb-summary').children.map((li) => li.textContent)).toEqual(['Line one.', 'Line two.']);
        expect(el('wb-goal').value).toBe('5');
        expect(el('wb-funnel').children[0].children.map((c) => c.textContent)).toEqual(['Applied', '3']);
        expect(el('wb-weeks').children[1].children[0].textContent).toBe('Sep 21 (this week)');
        // While the visitor is typing a goal, a redraw leaves it alone.
        el('wb-goal').focus();
        el('wb-goal').value = '9';
        panels.renderWhiteboardSheet(model, []);
        expect(el('wb-goal').value).toBe('9');
    });

    test('the departures sheet, full and empty', () => {
        expect(panels.renderDepartures([{ when: 'Today, 2:00 PM', what: 'Interview', with: 'Acme' }])).toBe(1);
        expect(el('dep-table').hidden).toBe(false);
        expect(el('dep-body').children[0].children.map((td) => td.textContent)).toEqual(['Today, 2:00 PM', 'Interview', 'Acme']);
        expect(panels.renderDepartures([])).toBe(0);
        expect(el('dep-empty').hidden).toBe(false);
        expect(el('dep-table').hidden).toBe(true);
    });

    test('the prep sheet is laid out as text, sections only where there is something to say', () => {
        const words = (node) => (node.children && node.children.length ? node.children.flatMap(words) : [node.textContent || '']);
        panels.renderPrintSheet({
            company: 'Acme', role: 'Designer', facts: [['Status', 'Interviewing']],
            upcoming: [{ what: 'Interview, round 2', when: 'Sep 29', title: 'Panel', with: ['Pat Lee'], outcome: '' }],
            people: [{ name: 'Pat Lee', line: 'Recruiter', email: 'pat@acme.example', phone: '' }],
            past: [{ what: 'Phone screen', when: 'Sep 15', title: '', with: [], outcome: 'Moved forward' }],
            tasks: [{ text: 'Case study', due: 'Sep 28, 2026' }, { text: 'Undated', due: '' }],
            notes: 'Ask about the team', posting: 'We build things', printed: 'Printed today.'
        }, 3);
        const sheet = el('print-sheet');
        const sections = sheet.children.filter((c) => c.className === 'print-section');
        expect(sections.map((s) => s.children[0].textContent)).toEqual(
            ['Coming up', 'People', 'So far', 'Still to do', 'Your notes', 'Questions to ask', 'The posting']);
        expect(sections[5].children).toHaveLength(1 + 3);
        const all = words(sheet).join(' ');
        expect(all).toContain('Case study (due Sep 28, 2026)');
        expect(all).toContain('. pat@acme.example');
        panels.renderPrintSheet({ company: '', role: 'Solo', facts: [], upcoming: [], people: [], past: [], tasks: [], notes: '', posting: '', printed: 'x' });
        expect(sheet.children.filter((c) => c.className === 'print-section').map((s) => s.children[0].textContent)).toEqual(['Questions to ask']);
    });

    test('the flap board and the whiteboard paint', async () => {
        const wb = await import('../www/office/js/whiteboard.js');
        const ctx = document.createElement('canvas').getContext('2d');
        expect(() => paint.drawFlapBoard(ctx, 1024, 280, ['TODAY 2:00P INTERVIEW  ACME        '], { clock: 'THU 10:00 AM', columns: [11, 10, 12] })).not.toThrow();
        expect(() => paint.drawFlapBoard(ctx, 1024, 280, [])).not.toThrow();
        const model = wb.boardModel(emptyDoc(CONFIG, NOW), CONFIG, NOW);
        expect(() => paint.drawWhiteboard(ctx, 1024, 568, {
            title: 'The search so far', funnel: wb.funnelBars(model), chart: wb.weekChart(model),
            numbers: wb.bigNumbers(model), goal: model.goal, layout: wb.LAYOUT
        })).not.toThrow();
    });
});

// ---- M6.5 stage 2: the facade and street painters ----------------------------------

describe('the city painters', () => {
    /** A canvas context that remembers every rectangle it was asked to fill. */
    function recorder() {
        const fills = [];
        const ctx = {
            fillStyle: '',
            fillRect(x, y, w, h) { fills.push({ style: ctx.fillStyle, x, y, w, h }); },
            strokeRect() {}, beginPath() {}, arc() {}, fill() {}
        };
        return { ctx, fills };
    }

    test('the three maps of a facade share one layout, so they line up exactly', () => {
        for (const style of paint.FACADE_STYLES) {
            const rects = ['color', 'rm', 'lit'].map((map) => {
                const r = recorder();
                paint.drawFacade(r.ctx, 512, 512, style, map, 3);
                return r.fills.map(({ x, y, w, h }) => [x, y, w, h].join());
            });
            expect(rects[1]).toEqual(rects[0]);
            expect(rects[2]).toEqual(rects[0]);
            expect(rects[0].length).toBe(paint.FACADE.cols * paint.FACADE.rows * 3);
        }
    });

    test('a smaller share of offices lit is always some of the same offices, in lamps that glow rather than glare', () => {
        const litAt = (share) => {
            const r = recorder();
            paint.drawFacade(r.ctx, 512, 512, 'grid', 'lit', 5, share);
            return r.fills.map((f, i) => (i % 3 === 0 && f.style !== 'rgb(0, 0, 0)' ? i : -1)).filter((i) => i >= 0);
        };
        const panels = paint.FACADE.cols * paint.FACADE.rows;
        const late = litAt(0.08);
        const evening = litAt(0.35);
        expect(late.length / panels).toBeGreaterThan(0.03);
        expect(late.length / panels).toBeLessThan(0.15);
        expect(evening.length / panels).toBeGreaterThan(0.25);
        expect(evening.length / panels).toBeLessThan(0.45);
        for (const i of late) expect(evening).toContain(i);
        expect(litAt(0)).toHaveLength(0);
        // No lamp is full white: the brightest channel is well under 255.
        for (const warm of [true, false]) {
            for (const tint of [0, 1]) {
                expect(Math.max(...paint.officeLamp(warm, tint).match(/\d+/g).map(Number))).toBeLessThan(230);
            }
        }
    });

    test('the glass is polished: its roughness in the rm map is low', () => {
        const r = recorder();
        paint.drawFacade(r.ctx, 512, 512, 'grid', 'rm', 3);
        expect(r.fills[0].style).toBe(`rgb(0, ${paint.GLASS_ROUGHNESS}, 245)`);
        expect(paint.GLASS_ROUGHNESS / 255).toBeLessThan(0.05);
    });

    test('some offices are lit at night and most are not, the same ones every visit', () => {
        const litPanels = (seed) => {
            const r = recorder();
            paint.drawFacade(r.ctx, 512, 512, 'grid', 'lit', seed);
            return r.fills.filter((f, i) => i % 3 === 0 && f.style !== 'rgb(0, 0, 0)').length;
        };
        const n = litPanels(5);
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(paint.FACADE.cols * paint.FACADE.rows);
        expect(litPanels(5)).toBe(n);
    });

    test('the glass is light and even: panes a few percent apart, so reflections read whole', () => {
        const r = recorder();
        paint.drawFacade(r.ctx, 512, 512, 'grid', 'color', 3);
        const greens = r.fills.filter((f, i) => i % 3 === 0).map((f) => Number(f.style.match(/\d+/g)[1]));
        expect(Math.min(...greens)).toBeGreaterThanOrEqual(225);
        expect(Math.max(...greens)).toBeLessThanOrEqual(255);
        expect((Math.max(...greens) - Math.min(...greens)) / Math.min(...greens)).toBeLessThan(0.08);
    });

    test('the cloud tile: a soft white disc per puff, then gray bases only where there is cloud', async () => {
        const sky = await import('../www/office/js/sky.js');
        const discs = [];
        let cleared = false;
        const ctx = {
            fillStyle: '',
            globalCompositeOperation: 'source-over',
            clearRect() { cleared = true; },
            createRadialGradient(x, y, r0, x1, y1, r) { return { x, y, r, stops: [], addColorStop(at, c) { this.stops.push(c); } }; },
            beginPath() {}, arc() {},
            fill() { discs.push({ mode: ctx.globalCompositeOperation, g: ctx.fillStyle }); }
        };
        const puffs = [[0.5, 0.5, 0.1, 0.8], [0.02, 0.5, 0.05, 0.6]];
        paint.drawClouds(ctx, 100, 100, puffs);
        const all = sky.wrappedPuffs(puffs);
        expect(cleared).toBe(true);
        expect(discs).toHaveLength(all.length * 2);
        const body = discs.slice(0, all.length);
        const shade = discs.slice(all.length);
        expect(body.every((d) => d.mode === 'source-over' && d.g.stops[0].startsWith('rgba(255, 255, 255'))).toBe(true);
        // The shade lands only on cloud already painted, and is smaller than the puff.
        expect(shade.every((d) => d.mode === 'source-atop')).toBe(true);
        expect(shade[0].g.r).toBeLessThan(body[0].g.r);
        expect(ctx.globalCompositeOperation).toBe('source-over');
        // The puff over the left edge is painted over the right as well.
        expect(body.some((d) => d.g.x > 100)).toBe(true);
    });

    /** A context that writes down every call, in order. */
    function calls() {
        const log = [];
        const ctx = new Proxy({ fillStyle: '', globalCompositeOperation: 'source-over' }, {
            get(target, prop) {
                if (prop in target) return target[prop];
                return (...args) => {
                    log.push([prop, args, target.fillStyle]);
                    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
                        return { stops: [], addColorStop(at, c) { this.stops.push([at, c]); } };
                    }
                    return undefined;
                };
            },
            set(target, prop, value) { target[prop] = value; return true; }
        });
        return { ctx, log };
    }

    test('the moon: a new moon is only its faint dark disc, and every other phase lit toward the right', () => {
        const lit = (log) => log.filter(([name, , style]) => name === 'fill' && style === 'rgb(236, 234, 222)');
        const fresh = calls();
        paint.drawMoon(fresh.ctx, 256, 256, 0);
        expect(lit(fresh.log)).toHaveLength(0);
        expect(fresh.log.filter(([name]) => name === 'fill')).toHaveLength(1);
        for (const [elongation, bulgesRight] of [[Math.PI / 3, true], [Math.PI * 0.75, false], [Math.PI, false]]) {
            const { ctx, log } = calls();
            paint.drawMoon(ctx, 256, 256, elongation);
            expect(lit(log)).toHaveLength(1);
            // The right limb, top to bottom, then the terminator back up.
            const limb = log.find(([name, args]) => name === 'arc' && args[3] === -Math.PI / 2);
            expect(limb[1][4]).toBe(Math.PI / 2);
            const terminator = log.find(([name]) => name === 'ellipse')[1];
            expect(terminator[2]).toBeCloseTo(256 * 0.46 * Math.abs(Math.cos(elongation)), 6);
            expect(terminator[7]).toBe(bulgesRight);
            // The seas land only on the lit part.
            const clip = log.findIndex(([name]) => name === 'clip');
            expect(clip).toBeGreaterThan(log.indexOf(lit(log)[0]));
            expect(log.findIndex(([name]) => name === 'restore')).toBeGreaterThan(clip);
        }
    });

    test('rain on the glass: beads with a bright point and a dark rim, and a few runs down the pane', () => {
        const { ctx, log } = calls();
        paint.drawRainOnGlass(ctx, 512, 512, 7);
        expect(log[0][0]).toBe('clearRect');
        const fills = log.filter(([name]) => name === 'fill');
        // Each bead is three fills: the drop, its rim, its highlight.
        expect(fills.length % 3).toBe(0);
        expect(fills.length / 3).toBeGreaterThan(400);
        expect(fills.some(([, , style]) => style === 'rgba(255, 255, 255, 0.75)')).toBe(true);
        expect(log.filter(([name]) => name === 'stroke')).toHaveLength(9);
        // The same pane every visit.
        const again = calls();
        paint.drawRainOnGlass(again.ctx, 512, 512, 7);
        expect(again.log.map(([name, args]) => [name, args.map((v) => (typeof v === 'number' ? v.toFixed(3) : v))]))
            .toEqual(log.map(([name, args]) => [name, args.map((v) => (typeof v === 'number' ? v.toFixed(3) : v))]));
    });

    test('the glow about the sun fades from a bright core to nothing at its edge', () => {
        const { ctx, log } = calls();
        paint.drawGlow(ctx, 256, 256);
        const gradient = log.find(([name]) => name === 'createRadialGradient');
        expect(gradient[1]).toEqual([128, 128, 0, 128, 128, 128]);
        expect(log.some(([name, args]) => name === 'fillRect' && args[2] === 256)).toBe(true);
        expect(ctx.fillStyle.stops[0][1]).toBe('rgba(255, 255, 255, 1)');
        expect(ctx.fillStyle.stops.at(-1)).toEqual([1, 'rgba(255, 255, 255, 0)']);
    });

    test('the street tile has its streets at the edges, and a glow for night', () => {
        const day = recorder();
        paint.drawStreets(day.ctx, 256, 256, { block: 90, street: 22 });
        expect(day.fills[0]).toMatchObject({ x: 0, y: 0, w: 256, h: 256 });
        const edge = day.fills[1];
        expect(edge.h).toBeCloseTo((11 / 112) * 256, 9);
        // By night: soft pools of lamplight, not hard rectangles (QA,
        // 2026-09-24: the rectangles read as a checkerboard). A faint band
        // down each street, a pool under each lamp and a brighter, wider
        // one where the streets cross.
        const { ctx, log } = calls();
        paint.drawStreets(ctx, 256, 256, { block: 90, street: 22 }, true);
        expect(log.filter(([name]) => name === 'createLinearGradient')).toHaveLength(4);
        const pools = log.filter(([name]) => name === 'createRadialGradient').map(([, args]) => args);
        expect(pools).toHaveLength((paint.STREET_LAMPS - 1) * 4 + 4);
        // Every pool on an edge of the tile (a street's middle), so the tiles meet.
        for (const [x, y] of pools) expect(x === 0 || x === 256 || y === 0 || y === 256).toBe(true);
        const corner = pools.filter(([x, y]) => (x === 0 || x === 256) && (y === 0 || y === 256));
        const between = pools.filter((p) => !corner.includes(p));
        expect(corner).toHaveLength(4);
        expect(corner[0][5]).toBeGreaterThan(between[0][5]);
        // Warm, but nearer white than orange.
        const [r, g, b] = paint.STREET_LAMP.match(/\d+/g).map(Number);
        expect(g / r).toBeGreaterThan(0.8);
        expect(b / r).toBeGreaterThan(0.6);
    });
});
