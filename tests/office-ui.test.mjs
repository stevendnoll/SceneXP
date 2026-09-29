// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's M1 flows, driven through the booted page the way a visitor
 * drives them: quick add, undo, the computer's grid, the folder, events and
 * follow-ups, the wastebasket, the out-tray, settings, samples, the keyboard,
 * and the room's taps.
 *
 * A HEADLESS BOOT IS NOT A WORKING PAGE, and the DOM stub makes up any id it
 * is asked for. So the last block reads index.html and holds every id the
 * scripts ask for to one the page really has, and the cards' stacking list to
 * the markup's order. Pixels are Steve's screenshot round.
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/office/js/config.js';

// Every test boots the whole page (the room and the world outside), about
// two seconds alone, and past Jest's five under the full parallel run once
// the real-three suites share the machine (2026-09-29: a different boot
// timed out each run). As www/mandelbrot and www/xo do, more room.
jest.setTimeout(30000);
import { emptyDoc, addApplication, serialize } from '../www/office/js/store.js';
import { formatDate, addDays } from '../www/office/js/dates.js';

let dom;
let main;
let t;
let downloads;

beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    downloads = [];
    jest.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        downloads.push(blob);
        return `blob:office/${downloads.length}`;
    });
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    main = await import('../www/office/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + 100);
    t = main.__test__;
    // Out of the welcome, into the office.
    fire(dom.documentStub, 'keydown', { key: 'Escape' });
});

afterEach(() => {
    jest.restoreAllMocks();
    dom.uninstall();
    jest.useRealTimers();
});

const el = (id) => dom.el(id);
const doc = () => main.getDoc();
const live = () => doc().applications.filter((a) => !a.deletedAt);

function said() {
    jest.advanceTimersByTime(50);
    return el('office-live').textContent;
}

function key(k, extra = {}) {
    return fire(dom.documentStub, 'keydown', { key: k, target: dom.documentStub.body, ...extra });
}

function submit(formId) {
    return fire(el(formId), 'submit');
}

function quickAdd(company, role, { follow = true } = {}) {
    key('n');
    el('af-company').value = company;
    el('af-role').value = role;
    el('af-follow').checked = follow;
    submit('af-form');
}

const rowNames = () => el('grid-body').children.map((tr) => tr.children[0].children[0].textContent);

/** Choose a place from the toolbar's Places list, the way a visitor does. */
function place(name) {
    el('bar-places').click();
    const item = el('places-menu').children.find((b) => b.dataset.place === name);
    item.click();
}

// ---- Quick add and undo -----------------------------------------------------

describe('quick add', () => {
    test('N, two boxes and Enter add an application with a follow-up, in one undo step', () => {
        key('n');
        expect(el('application-form').hidden).toBe(false);
        expect(el('af-more').open).toBe(false);
        expect(el('af-follow-text').textContent).toBe('Remind me to follow up in 7 days');
        el('af-company').value = 'Acme';
        el('af-role').value = 'Designer';
        submit('af-form');

        expect(el('application-form').hidden).toBe(true);
        expect(live().map((a) => a.company)).toEqual(['Acme']);
        expect(doc().tasks).toEqual([expect.objectContaining({
            text: 'Follow up with Acme', auto: true, due: formatDate(addDays(new Date(), 7))
        })]);
        expect(said()).toBe('Added Acme, Designer, with a follow-up reminder in 7 days.');
        expect(el('office-toast').hidden).toBe(false);
        expect(el('toast-undo').hidden).toBe(false);
        expect(t.history.size).toBe(1);
        expect(el('bar-undo').disabled).toBe(false);

        el('toast-undo').click();
        expect(live()).toEqual([]);
        expect(doc().tasks).toEqual([]);
        expect(el('office-toast').hidden).toBe(true);
        expect(el('bar-undo').disabled).toBe(true);
        expect(said()).toBe('Undone. Added Acme, Designer');
    });

    test('the follow-up can be declined, and saved-for-later never gets one', () => {
        quickAdd('Acme', 'Designer', { follow: false });
        expect(doc().tasks).toEqual([]);
        key('n');
        el('af-company').value = 'Later Co';
        el('af-status').value = 'saved';
        submit('af-form');
        expect(doc().tasks).toEqual([]);
        expect(live().find((a) => a.company === 'Later Co').appliedOn).toBeNull();
    });

    test('an empty form says what is missing and saves nothing', () => {
        key('n');
        submit('af-form');
        expect(el('af-error').textContent).toBe('Please enter a company or a role.');
        expect(el('af-error').hidden).toBe(false);
        expect(el('application-form').hidden).toBe(false);
        expect(live()).toEqual([]);
        el('af-company').value = 'Acme';
        el('af-salary-min').value = 'lots';
        submit('af-form');
        expect(el('af-error').textContent).toMatch(/salary as a number/);
    });

    test('a pasted posting offers its link and salary, and fills only empty boxes', () => {
        key('n');
        el('af-posting').value = 'Great team. $120k to $140k. Apply: https://jobs.example/42';
        fire(el('af-posting'), 'input');
        expect(el('af-found').hidden).toBe(false);
        expect(el('af-found-text').textContent)
            .toBe('Found in the posting: a link and a salary of $120,000 to $140,000 a year.');
        el('af-use-found').click();
        expect(el('af-url').value).toBe('https://jobs.example/42');
        expect(el('af-salary-min').value).toBe('120000');
        expect(el('af-found').hidden).toBe(true);
    });

    test('Ctrl or Command and Z undoes, but not inside a text box', () => {
        quickAdd('Acme', 'Designer');
        key('z', { ctrlKey: true, target: { tagName: 'INPUT' } });
        expect(live()).toHaveLength(1);
        key('z', { metaKey: true });
        expect(live()).toHaveLength(0);
        key('z', { ctrlKey: true });
        expect(said()).toBe('There is nothing to undo.');
    });

    test('the toolbar opens the form (the in-tray is gone from the desk, QA 2026-09-29)', () => {
        expect(t.actOn('intray')).toBe(false);
        el('bar-new').click();
        expect(el('application-form').hidden).toBe(false);
    });
});

// ---- The computer -------------------------------------------------------------

describe('the computer', () => {
    beforeEach(() => {
        t.stockOffice();
        t.openComputer();
    });

    test('shows every sample, and says how many', () => {
        expect(el('computer').hidden).toBe(false);
        expect(rowNames()).toHaveLength(16);
        expect(el('grid-count').textContent).toBe('Showing all 16 applications.');
        expect(said()).toMatch(/^Stocked the office with 16 sample applications/);
    });

    test('search narrows as the visitor types, and says where a buried match was found', () => {
        el('grid-search').value = 'warehouse robots';
        fire(el('grid-search'), 'input');
        expect(rowNames()).toEqual(['Tidewater Robotics']);
        el('grid-search').value = 'learning budget';
        fire(el('grid-search'), 'input');
        expect(rowNames()).toEqual(['Quillfeather Labs']);
        const roleCell = el('grid-body').children[0].children[1];
        expect(roleCell.children.at(-1).textContent).toBe('Found in your notes');
        expect(el('grid-count').textContent).toBe('Showing 1 of 16 applications.');
        expect(el('grid-clear').hidden).toBe(false);
    });

    test('nothing matching offers a way back', () => {
        el('grid-search').value = 'zeppelin';
        fire(el('grid-search'), 'input');
        expect(el('grid-empty').hidden).toBe(false);
        expect(el('grid-table').hidden).toBe(true);
        expect(el('grid-empty-text').textContent).toBe('Nothing matches that search.');
        el('grid-empty-actions').children[0].click();
        expect(rowNames()).toHaveLength(16);
        expect(el('grid-search').value).toBe('');
    });

    test('a status chip filters, shows its count, and toggles off again', () => {
        const chips = () => el('grid-filters').children;
        const quiet = chips().find((c) => c.textContent.startsWith('Gone quiet'));
        expect(quiet.textContent).toBe('Gone quiet2');
        quiet.click();
        expect(rowNames().sort()).toEqual(['Glasswing Energy', 'Mossgate Studio']);
        const pressed = chips().find((c) => c.textContent.startsWith('Gone quiet'));
        expect(pressed.getAttribute('aria-pressed')).toBe('true');
        pressed.click();
        expect(rowNames()).toHaveLength(16);
    });

    test('a header sorts, a second press reverses, and the choice is kept without an undo step', () => {
        const steps = t.history.size;
        el('grid-sort-company').click();
        expect(rowNames()[0]).toBe('Brambleway Coffee');
        expect(el('grid-h-company').getAttribute('aria-sort')).toBe('ascending');
        el('grid-sort-company').click();
        expect(rowNames()[0]).toBe('Tinderbox Studio');
        expect(el('grid-h-company').getAttribute('aria-sort')).toBe('descending');
        expect(doc().settings).toMatchObject({ sortKey: 'company', sortDir: 'desc' });
        expect(t.history.size).toBe(steps);
    });

    test('the weekly goal is changed right in the summary', () => {
        el('grid-goal').value = '8';
        fire(el('grid-goal'), 'change');
        expect(doc().settings.weeklyGoal).toBe(8);
        expect(el('hud-week').textContent).toMatch(/of 8 this week$/);
        expect(said()).toBe('Set the weekly goal to 8');
        el('grid-goal').value = '0';
        fire(el('grid-goal'), 'change');
        expect(doc().settings.weeklyGoal).toBe(8);
    });

    test('closing the computer glides back to the desk', () => {
        expect(t.ui.station).toBe('computer');
        el('computer-close').click();
        expect(t.ui.station).toBe('desk');
        expect(t.glide()).not.toBeNull();
        for (let i = 0; i < 20; i++) { jest.advanceTimersByTime(100); dom.loops.at(-1)(); }
        expect(t.glide()).toBeNull();
    });
});

// ---- The folder -----------------------------------------------------------------

describe('the folder', () => {
    let id;
    beforeEach(() => {
        quickAdd('Acme', 'Designer');
        id = live()[0].id;
        t.openComputer();
        el('grid-body').children[0].children[0].children[0].click();
    });

    test('opens from its row, and lies open on the desk', () => {
        expect(el('folder').hidden).toBe(false);
        expect(el('folder-title').textContent).toBe('Acme, Designer');
        expect(t.ui.folderOnDesk).toBe(true);
        el('folder-close').click();
        expect(t.ui.folderOnDesk).toBe(false);
    });

    test('the status changes right there', () => {
        const select = el('folder-body').children[0].children[1];
        select.value = 'screening';
        fire(select, 'change');
        expect(live()[0].status).toBe('screening');
        expect(said()).toBe('Moved Acme, Designer to Screening');
    });

    test('logging an interview moves the application along, and says so', () => {
        t.openEventForm(id, null);
        expect(el('ef-type').value).toBe('interview');
        expect(el('ef-at').value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/);
        el('ef-title').value = 'Portfolio review';
        submit('ef-form');
        expect(doc().events).toEqual([expect.objectContaining({ type: 'interview', round: 1, title: 'Portfolio review' })]);
        expect(live()[0].status).toBe('interviewing');
        expect(said()).toBe('Logged the interview for Acme, Designer. Moved to Interviewing.');
    });

    test('an event needs a time', () => {
        t.openEventForm(id, null);
        el('ef-at').value = '';
        submit('ef-form');
        expect(el('ef-error').textContent).toBe('Please choose a date and time.');
        expect(doc().events).toEqual([]);
    });

    test('a follow-up is added, ticked off, and thrown away', () => {
        t.openTaskForm(id, null);
        el('tf-text').value = 'Send the case study';
        submit('tf-form');
        const task = doc().tasks.find((x) => x.text === 'Send the case study');
        expect(task.due).toBe(formatDate(addDays(new Date(), 1)));
        t.openFolder(id);
        t.throwAway('tasks', task.id);
        expect(doc().tasks.find((x) => x.id === task.id).deletedAt).toBeTruthy();
        expect(said()).toBe('Threw away the follow-up. It is in the wastebasket.');
    });

    test('throwing the application away closes the folder, and the wastebasket gives it back', () => {
        el('folder-actions').children.find((b) => b.textContent === 'Throw away').click();
        expect(live()).toEqual([]);
        expect(el('folder').hidden).toBe(true);
        t.openWastebasket();
        const items = el('wastebasket-list').children;
        expect(items).toHaveLength(1);
        expect(items[0].children[0].children[0].textContent).toBe('Acme, Designer');
        items[0].children[1].children[0].click();
        expect(live()).toHaveLength(1);
        // Its follow-up came back with it.
        expect(doc().tasks[0].deletedAt).toBeNull();
        expect(el('wastebasket-note').textContent).toBe('The wastebasket is empty.');
        expect(el('wastebasket-empty').disabled).toBe(true);
    });

    test('emptying the wastebasket asks first, and can still be undone', () => {
        // An empty basket shows no crumpled page (QA, 2026-09-28).
        expect(t.ui.wastePages).toBe(0);
        t.throwAway('applications', id);
        expect(t.ui.wastePages).toBe(1);
        t.openWastebasket();
        el('wastebasket-empty').click();
        expect(el('confirm').hidden).toBe(false);
        expect(el('confirm-detail').textContent).toMatch(/^1 item will be removed for good/);
        el('confirm-actions').children[1].click();
        expect(doc().applications).toEqual([]);
        expect(t.ui.wastePages).toBe(0);
        t.undo();
        expect(doc().applications).toHaveLength(1);
        expect(t.ui.wastePages).toBe(1);
    });
});

// ---- The out-tray and settings ----------------------------------------------------

describe('the out-tray', () => {
    test('a backup is the whole document, as a file', async () => {
        quickAdd('Acme', 'Designer');
        el('bar-outtray').click();
        el('outtray-backup').click();
        expect(downloads).toHaveLength(1);
        const text = await downloads[0].text();
        expect(JSON.parse(text)).toEqual(doc());
        expect(el('outtray-note').textContent).toBe('Your backup is on its way to your downloads.');
    });

    test('the spreadsheet follows what the grid shows, guarded against formulas', async () => {
        quickAdd('=cmd', 'Hacker');
        quickAdd('Acme', 'Designer');
        t.openComputer();
        el('grid-search').value = 'acme';
        fire(el('grid-search'), 'input');
        t.exportCsv();
        const text = await downloads[0].text();
        expect(text).toContain('Acme,Designer');
        expect(text).not.toContain('cmd');
    });

    test('a restore asks first, replaces the office, and can be undone', () => {
        quickAdd('Mine', 'Engineer');
        const backup = addApplication(emptyDoc(CONFIG, new Date()), { company: 'From backup' }, CONFIG, new Date()).doc;
        t.restoreFromText(serialize(backup));
        expect(el('confirm-detail').textContent).toMatch(/^It holds 1 application\./);
        el('confirm-actions').children[1].click();
        expect(live().map((a) => a.company)).toEqual(['From backup']);
        expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).applications[0].company).toBe('From backup');
        t.undo();
        expect(live().map((a) => a.company)).toEqual(['Mine']);
    });

    test('a file that is not a backup is refused politely', () => {
        t.openOuttray();
        t.restoreFromText('hello');
        expect(el('outtray-note').textContent).toBe('That file is not a backup the office can read.');
        t.restoreFromText('{"schema":99,"applications":[]}');
        expect(el('outtray-note').textContent).toMatch(/newer version/);
        t.restoreFromText(null);
        expect(el('confirm').hidden).toBe(true);
    });
});

describe('settings', () => {
    test('saves within bounds', () => {
        el('bar-settings').click();
        expect(el('set-goal').value).toBe('5');
        el('set-goal').value = '12';
        el('set-followup').value = '500';
        submit('settings-form');
        expect(doc().settings).toMatchObject({ weeklyGoal: 12, followUpDays: 60 });
        expect(el('settings').hidden).toBe(true);
    });

    test('offers the right samples button, and clearing samples keeps the visitor’s own', () => {
        quickAdd('Mine', 'Engineer');
        el('bar-settings').click();
        expect(el('settings-stock').hidden).toBe(false);
        expect(el('settings-clear-samples').hidden).toBe(true);
        el('settings-stock').click();
        expect(live()).toHaveLength(17);
        el('bar-settings').click();
        expect(el('settings-clear-samples').hidden).toBe(false);
        el('settings-clear-samples').click();
        expect(live().map((a) => a.company)).toEqual(['Mine']);
    });

    test('clearing the whole office asks first, keeps the settings, and can be undone', () => {
        quickAdd('Mine', 'Engineer');
        t.clearEverything();
        el('confirm-actions').children[1].click();
        expect(doc().applications).toEqual([]);
        expect(doc().settings.weeklyGoal).toBe(5);
        t.undo();
        expect(live()).toHaveLength(1);
    });
});

// ---- The room and the keyboard ---------------------------------------------------

describe('the room and the keyboard', () => {
    test('each tappable thing opens its card, armed against the tap', () => {
        for (const [pick, card] of [['computer', 'computer'], ['wastebasket', 'wastebasket']]) {
            expect(t.actOn(pick)).toBe(true);
            expect(el(card).hidden).toBe(false);
            fire(dom.documentStub, 'keydown', { key: 'Escape' });
        }
        expect(t.actOn('nothing')).toBe(false);
    });

    test('the lamp switches and says so', () => {
        t.actOn('lamp');
        expect(t.ui.lampOn).toBe(false);
        expect(said()).toBe('The lamp is off.');
    });

    test('a tap reaches nothing while a card is open', () => {
        t.openComputer();
        expect(t.handleSceneTap(10, 10)).toBeNull();
    });

    test('slash opens the computer on its search box, and 1 goes back to the desk', () => {
        key('/');
        expect(el('computer').hidden).toBe(false);
        expect(dom.documentStub.activeElement).toBe(el('grid-search'));
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('2');
        expect(t.ui.station).toBe('computer');
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('1');
        expect(t.ui.station).toBe('desk');
    });

    test('a shortcut typed into a box is just a letter', () => {
        key('n', { target: { tagName: 'INPUT' } });
        expect(el('application-form').hidden).toBe(true);
    });

    test('over the computer, N adds and slash searches, and nothing else is a shortcut', () => {
        t.openComputer();
        key('c');
        key('1');
        expect(t.ui.station).toBe('computer');
        key('/');
        expect(dom.documentStub.activeElement).toBe(el('grid-search'));
        key('n');
        expect(el('application-form').hidden).toBe(false);
    });

    test('over any other card, N is not a shortcut', () => {
        t.openWastebasket();
        key('n');
        expect(el('application-form').hidden).toBe(true);
    });

    test('a folder that is gone does not open empty', () => {
        expect(t.openFolder('nope')).toBe(false);
        expect(el('folder').hidden).toBe(true);
        expect(said()).toBe('That application is no longer here.');
    });

    test('Escape closes only the top card', () => {
        t.openComputer();
        key('n');
        expect(el('application-form').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(el('application-form').hidden).toBe(true);
        expect(el('computer').hidden).toBe(false);
    });

    test('the week and what is due show at the top left', () => {
        quickAdd('Acme', 'Designer');
        expect(el('hud-week').textContent).toBe('1 of 5 this week');
        expect(el('hud-due').hidden).toBe(true);
        t.stockOffice();
        expect(el('hud-due').hidden).toBe(false);
        expect(el('hud-due').textContent).toMatch(/^\d+ follow-ups? today$/);
    });
});

// ---- The page and the scripts agree -----------------------------------------------

describe('the look (QA, 2026-09-29)', () => {
    test('the room is exposed brighter by day, so its whites read white, and as dark as ever by night', async () => {
        const { lighting, lightAt } = await import('../www/office/js/daylight.js');
        const noon = t.roomExposure(lighting(lightAt(new Date(2026, 8, 24), 12)));
        const midnight = t.roomExposure(lighting(lightAt(new Date(2026, 8, 24), 0)));
        expect(noon).toBeCloseTo(CONFIG.view.roomExposure.day, 2);
        expect(midnight).toBeCloseTo(CONFIG.view.roomExposure.night, 2);
        expect(CONFIG.view.roomExposure.night).toBe(1);
        expect(noon).toBeGreaterThan(1.1);
        // Set with the light, and handed to the room's pass.
        window.cornerOffice.hour(12);
        expect(t.ui.roomExposure).toBeCloseTo(noon, 2);
        window.cornerOffice.hour(null);
    });

    const css = readFileSync(join(process.cwd(), 'www/office/css/experience.css'), 'utf8');
    const html = readFileSync(join(process.cwd(), 'www/office/index.html'), 'utf8');

    test('no orange and brown: the site’s neutral theme, and the office’s own cards in graphite', () => {
        // The shared default (a neutral silver), no amber theme named.
        expect(html).not.toMatch(/data-ui-theme=/);
        expect(html).toMatch(/<meta name="theme-color" content="#141517">/);
        // No brown left in the office's own colors: every color whose red
        // leads its blue by much is one of the few that mean something
        // (danger, an error, the event dot, the accepted badge, the outcome
        // notes).
        const meaning = new Set(['#d9826a', '#ffd9cc', '#f0a58f', '#ffb4a0', '#e0736b', '#e4c07a', '#2a1c0a', '#f2b8a8', '#f2d9d9', '#4a3b3b']);
        const warm = [];
        for (const m of css.matchAll(/#([0-9a-f]{6})\b/gi)) {
            const hex = `#${m[1].toLowerCase()}`;
            const [r, , b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
            if (r - b > 24 && !meaning.has(hex)) warm.push(hex);
        }
        for (const m of css.matchAll(/rgba\((\d+), (\d+), (\d+),/g)) {
            const [r, , b] = [m[1], m[2], m[3]].map(Number);
            if (r - b > 24 && !(r === 120 && b === 28)) warm.push(m[0]);
        }
        expect(warm).toEqual([]);
    });

    test('the calendar wears the office’s own card, not a cream one of its own', () => {
        const block = css.slice(css.indexOf('.calendar-panel {'), css.indexOf('.cal-nav {'));
        expect(block).not.toMatch(/background/);
        expect(block).not.toMatch(/#f3eee4|#fffaf1|#2f5d73/);
        expect(css).not.toMatch(/#fffaf1|#2f5d73|#f3eee4/);
    });
});

describe('the markup and the scripts agree', () => {
    const html = readFileSync(join(process.cwd(), 'www/office/index.html'), 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const dir = join(process.cwd(), 'www/office/js');
    const sources = readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))
        .map((f) => [f, readFileSync(join(dir, f), 'utf8')]);

    test('every id a script looks up is on the page', () => {
        // The DOM stub invents any element it is asked for, so a typo in an id
        // passes every other test in the suite. The page cannot invent one.
        const made = new Set(['folder-status', 'folder-events-title', 'folder-tasks-title']);
        const missing = [];
        for (const [file, src] of sources) {
            for (const m of src.matchAll(/(?:\bel|byId|wire|getElementById)\(\s*'([a-z0-9-]+)'/g)) {
                if (!ids.has(m[1]) && !made.has(m[1])) missing.push(`${file}: ${m[1]}`);
            }
            for (const m of src.matchAll(/^\s+\w+: '((?:af|ef|set)-[a-z-]+)'/gm)) {
                if (!ids.has(m[1])) missing.push(`${file}: ${m[1]}`);
            }
        }
        expect(missing).toEqual([]);
    });

    test('the cards stack in the order they appear on the page', async () => {
        const { CARD_ORDER } = await import('../www/office/js/cards.js');
        const onPage = [...html.matchAll(/<div id="([a-z-]+)" class="card-overlay/g)].map((m) => m[1]);
        expect(onPage).toEqual(CARD_ORDER);
    });

    test('the toolbar wraps, at every width, rather than hiding buttons past the edge', () => {
        // Found by Steve, 2026-09-24: a one-row toolbar that scrolled sideways
        // cut the last buttons off a phone's screen with nothing to say so.
        const css = readFileSync(join(process.cwd(), 'www/office/css/experience.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const bar = [...css.matchAll(/\.office-bar\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
        expect(bar).toMatch(/flex-wrap:\s*wrap/);
        expect(bar).not.toMatch(/flex-wrap:\s*nowrap/);
        expect(bar).not.toMatch(/overflow-x:\s*(auto|scroll)/);
        expect(bar).toMatch(/max-width:\s*calc\(100vw - 32px\)/);
    });

    test('every card panel is a modal dialog the shared focus trap will hold', () => {
        const panels = [...html.matchAll(/<div id="([a-z-]+)-panel"[^>]*>/g)];
        expect(panels.length).toBeGreaterThan(8);
        for (const [tag] of panels) {
            expect(tag).toMatch(/role="dialog"/);
            expect(tag).toMatch(/aria-modal="true"/);
            expect(tag).toMatch(/tabindex="-1"/);
        }
    });
});

// ---- M2: today, the calendar, calendar files, the light ---------------------------

describe('today', () => {
    beforeEach(() => t.stockOffice());

    test('the due chip opens today’s list, overdue first, and ticking one off takes its note down', () => {
        expect(el('hud-due').hidden).toBe(false);
        const notesBefore = t.ui.notesShown;
        expect(notesBefore).toBeGreaterThanOrEqual(2);
        el('hud-due').click();
        expect(el('today').hidden).toBe(false);
        const rows = el('today-list').children;
        expect(rows[0].children[0].textContent).toBe('Overdue');
        expect(el('today-note').textContent).toMatch(/takes its note off the monitor/);
        const box = rows[1].children[0].children[0];
        box.checked = true;
        fire(box, 'change');
        expect(t.ui.notesShown).toBe(notesBefore - 1);
        expect(said()).toMatch(/^Ticked off /);
    });

    test('the notes on the monitor and the T key open the same list', () => {
        t.actOn('notes');
        expect(el('today').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('t');
        expect(el('today').hidden).toBe(false);
    });

    test('everything coming up goes into one calendar file, with a reminder on each', async () => {
        el('bar-outtray').click();
        el('outtray-ics').click();
        expect(downloads).toHaveLength(1);
        expect(downloads[0].type).toBe('text/calendar');
        const text = await downloads[0].text();
        const n = text.split('BEGIN:VEVENT').length - 1;
        expect(n).toBeGreaterThanOrEqual(5);
        expect(text.split('BEGIN:VALARM').length - 1).toBe(n);
        expect(el('outtray-note').textContent).toMatch(new RegExp(`holds ${n} items, each with a reminder`));
    });
});

describe('the calendar', () => {
    test('opens on today where the visitor stands, from Places and the 3 key', () => {
        t.goTo('window');
        const standing = t.ui.station;
        place('calendar');
        expect(el('calendar').hidden).toBe(false);
        // The wall calendar gave its wall to the window (QA, 2026-09-25):
        // nowhere to go.
        expect(t.ui.station).toBe(standing);
        const now = new Date();
        expect(t.ui.calDay).toBe(formatDate(now));
        expect(el('calendar-title').textContent).toBe(new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now));
        el('calendar-close').click();
        expect(el('calendar').hidden).toBe(true);
        expect(t.ui.station).toBe(standing);
        // Nothing in the room answers to it any more.
        expect(t.actOn('calendar')).toBe(false);
        expect(el('calendar').hidden).toBe(true);
        key('3');
        expect(el('calendar').hidden).toBe(false);
    });

    test('a card that opens where the visitor stands says Close, not Back to the desk', () => {
        const html = readFileSync(join(process.cwd(), 'www/office/index.html'), 'utf8');
        const closers = [...html.matchAll(/<button id="([a-z-]+)-close"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[1], m[2].trim()]);
        const said = Object.fromEntries(closers);
        expect(said.calendar).toBe('Close');
        expect(said.rolodex).toBe('Close');
        // Only a card that took the visitor to a station of its own offers
        // to take them back to the desk.
        for (const [card, words] of closers) {
            if (words === 'Back to the desk') expect(Object.keys(CONFIG.stations)).toContain(card);
        }
        expect(Object.keys(CONFIG.stations)).not.toContain('calendar');
        expect(t.lights.bounce).toBeTruthy();
    });

    test('a day shows what falls on it, and the arrows move the chosen day, turning the page', () => {
        t.stockOffice();
        t.openCalendar();
        const soon = formatDate(addDays(new Date(), 2));
        t.selectDay(soon);
        const list = el('cal-day-list').children;
        expect(list[0].children[0].children[0].textContent).toBe('Interview, round 2: Brightkettle, Senior Product Designer');
        // The chosen day is the month's one tab stop, and pressed.
        const chosen = el('cal-body').children.flatMap((tr) => tr.children.map((td) => td.children[0]))
            .find((b) => b.dataset.day === soon);
        expect(chosen.tabIndex).toBe(0);
        expect(chosen.getAttribute('aria-pressed')).toBe('true');
        expect(chosen.getAttribute('aria-label')).toMatch(/1 event/);

        const start = new Date(2026, 8, 28);
        t.selectDay('2026-09-28');
        const press = (k) => fire(el('cal-body'), 'keydown', { key: k, target: { dataset: { day: t.ui.calDay } } });
        press('ArrowRight');
        expect(t.ui.calDay).toBe('2026-09-29');
        press('ArrowDown');
        expect(t.ui.calDay).toBe('2026-10-06');
        expect(el('calendar-title').textContent).toBe('October 2026');
        press('Home');
        expect(t.ui.calDay).toBe('2026-10-05');
        press('End');
        expect(t.ui.calDay).toBe('2026-10-11');
        press('ArrowUp');
        press('ArrowLeft');
        expect(t.ui.calDay).toBe('2026-10-03');
        press('Enter');
        expect(t.ui.calDay).toBe('2026-10-03');
        expect(start).toBeInstanceOf(Date);
    });

    test('the month buttons turn the page and say so, keeping the day where they can', () => {
        t.openCalendar();
        t.selectDay('2026-01-31');
        el('cal-next').click();
        expect(t.ui.calDay).toBe('2026-02-28');
        expect(said()).toBe('February 2026');
        el('cal-prev').click();
        expect(el('calendar-title').textContent).toBe('January 2026');
        el('cal-this').click();
        expect(t.ui.calDay).toBe(formatDate(new Date()));
    });

    test('an empty day says so', () => {
        t.openCalendar();
        t.selectDay('2031-03-03');
        expect(el('cal-day-list').children[0].textContent).toBe('Nothing on this day.');
    });

    test('with nothing coming up, the calendar file is not made, and the visitor is told why', () => {
        t.openCalendar();
        el('cal-export').click();
        expect(downloads).toHaveLength(0);
        expect(said()).toBe('Nothing is coming up yet, so there is nothing to add to your calendar.');
    });

    test('a single upcoming event goes to the calendar from its folder', async () => {
        quickAdd('Acme', 'Designer');
        const id = live()[0].id;
        t.openEventForm(id, null);
        el('ef-at').value = `${formatDate(addDays(new Date(), 3))}T15:00`;
        submit('ef-form');
        t.openFolder(id);
        expect(t.exportEvent(doc().events[0].id)).toBe(true);
        const text = await downloads[0].text();
        expect(text.split('BEGIN:VEVENT')).toHaveLength(2);
        expect(said()).toMatch(/^Your calendar file for the interview on \w{3} \d+, \d{4}, \d+:00\sPM is on its way to your downloads\. Opening it adds it to your calendar, with a reminder half an hour before\.$/);
        expect(t.exportEvent('nope')).toBe(false);
    });
});

describe('the light', () => {
    test('follows a pinned hour for screenshots, and goes back to the clock', () => {
        expect(window.cornerOffice.hour(22)).toBe('night');
        expect(t.ui.phase).toBe('night');
        expect(window.cornerOffice.hour(12)).toBe('day');
        expect(window.cornerOffice.hour(-5)).toBe('night');
        expect(typeof window.cornerOffice.hour(null)).toBe('string');
        expect(t.ui.hourPin).toBeNull();
    });

    test('the scenery’s frames come evenly, and every frame while a jet is in view', () => {
        // Which display frames the scenery draws on, given a steady rate.
        const drawnOn = (hz, fps, frames) => {
            let due = 0;
            const drawn = [];
            for (let f = 0; f < frames; f++) {
                const paced = main.paceScenery(due, 1 / hz, fps);
                due = paced.due;
                if (paced.draw) drawn.push(f);
            }
            // Once under way: the very first draw starts a frame overdue.
            return drawn.slice(1).map((f, i) => f - drawn[i]).slice(2);
        };
        // 15 a second on a 60 Hz screen is every 4th frame, never 4 then 5
        // (the stutter QA saw on the jet, 2026-09-25).
        expect(new Set(drawnOn(60, 15, 240))).toEqual(new Set([4]));
        // 60 a second is every frame at 60 Hz, every other at 120 Hz.
        expect(new Set(drawnOn(60, 60, 240))).toEqual(new Set([1]));
        expect(new Set(drawnOn(120, 60, 240))).toEqual(new Set([2]));
        expect(new Set(drawnOn(144, 15, 288)).size).toBeLessThanOrEqual(2);
        // Far behind (a hidden tab), the count starts again, one draw owed.
        expect(main.paceScenery(0.01, 5, 15)).toEqual({ due: 1 / 15, draw: true });
        expect(main.paceScenery(0.05, -1, 15)).toEqual({ due: 0.05, draw: false });
    });

    test('by night the glass mirrors the room, drawn again only when the room or the camera moves', () => {
        window.cornerOffice.hour(12);
        expect(t.ui.mirror).toBe(0);
        expect(t.drawMirrors()).toBe(false);
        window.cornerOffice.hour(23);
        expect(t.ui.mirror).toBeGreaterThan(0.2);
        t.markRoom();
        expect(t.ui.mirrorDue).toBe(true);
        expect(t.drawMirrors()).toBe(true);
        expect(t.ui.mirrorDue).toBe(false);
        // Nothing has moved: nothing to draw.
        expect(t.drawMirrors()).toBe(false);
        // The lamp switched is a change in the room.
        t.actOn('lamp');
        expect(t.ui.mirrorDue).toBe(true);
        t.actOn('lamp');
        // The shiny things are given the room for the hour; with no light
        // yet there is nothing to capture.
        expect(t.captureInterior(t.ui.look)).toBeTruthy();
        expect(t.captureInterior(null)).toBeNull();
        window.cornerOffice.hour(null);
    });

    test('a jet can be sent in to land for a screenshot', () => {
        t.ui.lifeDue = false;
        expect(window.cornerOffice.jet()).toBe('A jet is on its way in to land.');
        // The scenery is placed again on the next frame, jet and all.
        expect(t.ui.lifeDue).toBe(true);
    });

    test('a pinned hour is that hour today, for the sky as well as the light', () => {
        window.cornerOffice.hour(6.5);
        const at = t.skyTime(new Date(2026, 8, 24, 15, 20));
        expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([24, 6, 30]);
        window.cornerOffice.hour(null);
        expect(t.skyTime(new Date(2026, 8, 24, 15, 20)).getHours()).toBe(15);
    });

    test('the city’s windows are repainted as offices go dark through the night and light before dawn', () => {
        const at = (h) => {
            window.cornerOffice.hour(h);
            return t.ui.officesKey;
        };
        const evening = at(20);
        const late = at(2.5);
        const quiet = at(3.5);
        const early = at(6);
        expect(late).toBeLessThan(evening);
        expect(quiet).toBeLessThanOrEqual(late);
        expect(early).toBeGreaterThan(quiet);
        expect(evening * CONFIG.view.officeStep).toBeCloseTo(0.33, 1);
        // A step at a time: a whole night is a few dozen repaints at most.
        expect(Math.round(0.42 / CONFIG.view.officeStep)).toBeLessThan(20);
        window.cornerOffice.hour(null);
    });

    test('the glass and water finish can be tried from the console for a screenshot', () => {
        // The Three stub swallows the values; world.tune is held in office-view.
        expect(Object.keys(window.cornerOffice.tune({ glass: 2 }))).toEqual(['glass', 'metal', 'water']);
        expect(Object.keys(window.cornerOffice.tune())).toEqual(['glass', 'metal', 'water']);
    });
});

describe('a day going by at the window', () => {
    test('the button is in the toolbar wherever the visitor is (Steve, 2026-09-24)', () => {
        for (const station of ['desk', 'window', 'computer', 'cabinet']) {
            t.goTo(station);
            expect(el('bar-day').hidden).toBe(false);
            expect(el('bar-day').textContent).toBe('Watch a day go by');
        }
    });

    test('a whole day goes by in CONFIG.view.daySeconds, with a clock, said at the start and the end', () => {
        window.cornerOffice.hour(15);
        key('9');
        fire(el('bar-day'), 'click');
        expect(t.ui.lapse).not.toBeNull();
        expect(el('bar-day').textContent).toBe('Stop the day');
        expect(el('hud-clock').hidden).toBe(false);
        expect(el('hud-clock').textContent).toBe('3:00 PM');
        expect(said()).toBe('A day is going by at the window, starting from 3:00 PM. Stop the day ends it whenever you like.');
        // It stays while the visitor looks elsewhere.
        t.goTo('desk');
        expect(el('bar-day').hidden).toBe(false);
        // A quarter of the way: six hours on, and night by then.
        t.stepDay(CONFIG.view.daySeconds / 4);
        expect(el('hud-clock').textContent).toBe('9:00 PM');
        expect(t.ui.phase).toBe('night');
        t.stepDay(CONFIG.view.daySeconds);
        expect(t.ui.lapse).toBeNull();
        expect(el('hud-clock').hidden).toBe(true);
        expect(el('bar-day').textContent).toBe('Watch a day go by');
        expect(said()).toBe('A whole day has gone by. It is 3:00 PM again.');
        expect(t.ui.hourPin).toBe(15);
        window.cornerOffice.hour(null);
    });

    test('the traffic and the jets race with the clock, 30 times over, and the rain keeps real time (QA, 2026-09-29)', () => {
        const rate = CONFIG.view.lapseScenery;
        expect(rate).toBe(30);
        // Real time outside a day going by, faster inside, never backward.
        expect(t.sceneryClock(10, 0.5, false)).toBe(10.5);
        expect(t.sceneryClock(10, 0.5, true)).toBe(10 + 0.5 * rate);
        expect(t.sceneryClock(10, -1, true)).toBe(10);
        // A frame of a day going by moves the scenery's clock 30 frames on.
        window.cornerOffice.hour(12);
        t.watchDay();
        const before = t.state.scenerySeconds;
        t.state.lastTime = performance.now() - 50;
        t.animate();
        const moved = t.state.scenerySeconds - before;
        expect(moved).toBeGreaterThan(0.04 * rate);
        expect(moved).toBeLessThan(0.06 * rate);
        t.stopDay(false);
        const after = t.state.scenerySeconds;
        t.state.lastTime = performance.now() - 50;
        t.animate();
        expect(t.state.scenerySeconds - after).toBeLessThan(0.06);
        // The world is placed on the scenery's clock, with real time beside
        // it for the rain and the flashing lights.
        const place = jest.spyOn(t.world(), 'setLife');
        t.state.scenerySeconds = 1234;
        t.placeLife();
        const [, seconds, still, real] = place.mock.calls[place.mock.calls.length - 1];
        expect(seconds).toBe(1234);
        expect(still).toBe(false);
        expect(real).toBeCloseTo(performance.now() / 1000, 1);
        window.cornerOffice.hour(null);
    });

    test('Stop the day, or Escape, ends it early and gives the sky back', () => {
        window.cornerOffice.hour(10);
        key('9');
        expect(t.watchDay()).toBe(true);
        t.stepDay(1);
        fire(el('bar-day'), 'click');
        expect(t.ui.lapse).toBeNull();
        expect(said()).toBe('Back to the present. It is 10:00 AM.');
        t.watchDay();
        key('Escape');
        expect(t.ui.lapse).toBeNull();
        expect(t.stopDay(false)).toBe(false);
        window.cornerOffice.hour(null);
    });

    test('a change of light inside the wait between captures is owed, and taken when the wait is over', () => {
        const capture = jest.spyOn(t.world(), 'updateEnvironment');
        window.cornerOffice.hour(6);
        t.watchDay();
        capture.mockClear();
        // Just captured: a change now has to wait...
        t.ui.capturedAt = performance.now();
        t.ui.lightKey = 'something else';
        t.applyDaylight(new Date());
        expect(capture).not.toHaveBeenCalled();
        expect(t.ui.captureOwed).toBe(true);
        // ...and nothing changes after it, but once the wait is over it is taken.
        t.ui.capturedAt = performance.now() - CONFIG.view.captureSeconds * 1000 - 1;
        t.applyDaylight(new Date());
        expect(capture).toHaveBeenCalledTimes(1);
        expect(t.ui.captureOwed).toBe(false);
        t.stopDay(false);
        window.cornerOffice.hour(null);
    });

    test('for a visitor who asked for less motion, it goes an hour at a time', () => {
        t.state.reducedMotion = true;
        window.cornerOffice.hour(8);
        t.watchDay();
        t.stepDay(CONFIG.view.daySeconds / 24 * 2.6);
        expect(el('hud-clock').textContent).toBe('10:00 AM');
        t.stopDay(false);
        window.cornerOffice.hour(null);
    });

    test('the frame loop moves it on', () => {
        window.cornerOffice.hour(12);
        t.watchDay();
        t.state.running = true;
        t.state.lastTime = 0;
        t.animate();
        t.animate();
        expect(t.ui.lapse).not.toBeNull();
        t.stopDay(false);
        window.cornerOffice.hour(null);
    });
});

describe('the scenery moves', () => {
    const run = () => {
        t.state.running = true;
        t.state.lastTime = 0;
    };

    test('a few frames a second when nothing else is drawing, placing the fleet each time', () => {
        expect(t.lifeMoves()).toBe(true);
        run();
        t.animate();
        t.state.dirty = false;
        const frames = t.state.frames;
        t.state.ambientDue = 0;
        t.ui.lifeDue = false;
        t.animate();
        expect(t.state.frames).toBe(frames + 1);
        expect(t.state.ambientDue).toBeCloseTo(1 / CONFIG.view.ambientFps, 9);
        // Not again until the next one is due.
        t.state.lastTime = performance.now();
        t.animate();
        expect(t.state.frames).toBe(frames + 1);
    });

    test('still behind a card that covers the room, moving behind the docked sheets', () => {
        key('c');
        expect(t.lifeMoves()).toBe(false);
        key('Escape');
        key('4');
        expect(t.lifeMoves()).toBe(true);
    });

    test('held still for a visitor who asked for less motion, but placed when the clock jumps', () => {
        t.state.reducedMotion = true;
        expect(t.lifeMoves()).toBe(false);
        run();
        t.animate();
        t.state.dirty = false;
        const frames = t.state.frames;
        t.state.ambientDue = 0;
        t.animate();
        expect(t.state.frames).toBe(frames);
        // A pinned hour is a jump: the fleet is placed once, on the next frame.
        window.cornerOffice.hour(9);
        expect(t.ui.lifeDue).toBe(true);
        t.animate();
        expect(t.ui.lifeDue).toBe(false);
        expect(t.state.frames).toBe(frames + 1);
        window.cornerOffice.hour(null);
        t.placeLife();
        expect(t.ui.lifeDue).toBe(false);
    });
});

describe('rain and the phone budget', () => {
    test('the weather can be held for a screenshot, and given back to the day', () => {
        expect(window.cornerOffice.weather('rain')).toEqual({ overcast: 1, rain: 1 });
        expect(t.ui.weatherPin).toBe('rain');
        expect(window.cornerOffice.weather('clear')).toEqual({ overcast: 0, rain: 0 });
        const own = window.cornerOffice.weather(null);
        expect(t.ui.weatherPin).toBeNull();
        expect(Object.keys(own)).toEqual(['overcast', 'rain']);
        expect(window.cornerOffice.weather('snow')).toEqual(own);
    });

    test('the adaptive resolution hears only the frames that follow a drawn one', () => {
        const res = t.resolution();
        const sample = jest.spyOn(res, 'sample');
        t.state.running = true;
        t.state.lastTime = 0;
        t.state.drewLast = false;
        t.state.dirty = false;
        t.state.ambientDue = 10;
        t.animate();
        expect(sample).not.toHaveBeenCalled();
        t.requestRender();
        t.animate();
        expect(t.state.drewLast).toBe(true);
        t.animate();
        expect(sample).toHaveBeenCalledTimes(1);
        expect(t.state.drewLast).toBe(false);
    });

    test('a quality readout for a phone, and full resolution held for a capture', () => {
        const q = window.cornerOffice.quality();
        for (const key of ['ratio', 'scale', 'drawCalls', 'triangles', 'ambientFps']) expect(q).toHaveProperty(key);
        expect(window.cornerOffice.capture(true)).toMatchObject({ pinned: true });
        expect(window.cornerOffice.capture(false)).toMatchObject({ pinned: false });
    });
});

// ---- M3: the filing cabinet -------------------------------------------------------

describe('the filing cabinet', () => {
    beforeEach(() => t.stockOffice());

    const drawerLabels = () => t.fileCabinet().plan.map((d) => d.label);

    test('opens at its station with the drawers sliding out, from the toolbar, the room and the 4 key', () => {
        place('cabinet');
        expect(el('cabinet').hidden).toBe(false);
        expect(t.ui.station).toBe('cabinet');
        for (let i = 0; i < 20; i++) { jest.advanceTimersByTime(100); dom.loops.at(-1)(); }
        expect(t.filing().open).toBe(1);
        expect(el('cabinet-lifted').textContent).toMatch(/^Filed by last activity\. Search or choose a filter/);
        el('cabinet-close').click();
        expect(t.ui.station).toBe('desk');
        for (let i = 0; i < 20; i++) { jest.advanceTimersByTime(100); dom.loops.at(-1)(); }
        expect(t.filing().open).toBe(0);
        t.actOn('cabinet');
        expect(el('cabinet').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('4');
        expect(el('cabinet').hidden).toBe(false);
    });

    test('holds every folder, filed in the grid’s order', () => {
        const filed = t.fileCabinet();
        expect(t.filing().count).toBe(16);
        expect(filed.plan.flatMap((d) => d.ids)).toEqual(t.currentRows().rows.map((r) => r.app.id));
    });

    test('a search lifts the folders it finds, says which, and the computer agrees', () => {
        t.openCabinet();
        el('cabinet-search').value = 'quill';
        fire(el('cabinet-search'), 'input');
        expect(el('cabinet-lifted').textContent).toBe('1 folder lifted: Quillfeather Labs, Staff Engineer.');
        const quill = live().find((a) => a.company === 'Quillfeather Labs');
        expect(t.filing().folder(quill.id).liftTo).toBe(1);
        const other = live().find((a) => a.company === 'Brightkettle');
        expect(t.filing().folder(other.id).dim).toBe(true);
        // The lifted folder is a button too.
        el('cabinet-list').children[0].children[0].click();
        expect(el('folder').hidden).toBe(false);
        expect(el('folder-title').textContent).toBe('Quillfeather Labs, Staff Engineer');
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        t.openComputer();
        expect(rowNames()).toEqual(['Quillfeather Labs']);
        expect(el('grid-search').value).toBe('quill');
    });

    test('a filter chip in the cabinet lifts its folders too', () => {
        t.openCabinet();
        const quiet = el('cabinet-filters').children.find((c) => c.textContent.startsWith('Gone quiet'));
        quiet.click();
        expect(el('cabinet-lifted').textContent).toMatch(/^2 folders lifted: /);
        expect(el('cabinet-list').children).toHaveLength(2);
    });

    test('more than eight found sends the rest to the computer', () => {
        t.openCabinet();
        el('cabinet-search').value = 'e';
        fire(el('cabinet-search'), 'input');
        const items = el('cabinet-list').children;
        expect(items).toHaveLength(9);
        items[8].children[0].click();
        expect(el('cabinet').hidden).toBe(true);
        expect(el('computer').hidden).toBe(false);
    });

    test('changing the filing order relabels the drawers and refiles the folders, without an undo step', () => {
        t.openCabinet();
        const steps = t.history.size;
        el('cabinet-sort').value = 'company';
        fire(el('cabinet-sort'), 'change');
        expect(said()).toBe('Refiled by company.');
        expect(drawerLabels()[0]).toMatch(/^B to /);
        expect(t.ui.cabinetMoving).toBe(true);
        expect(doc().settings.sortKey).toBe('company');
        expect(t.history.size).toBe(steps);
        for (let i = 0; i < 30; i++) { jest.advanceTimersByTime(100); dom.loops.at(-1)(); }
        expect(t.ui.cabinetMoving).toBe(false);
        el('cabinet-sort').value = 'status';
        fire(el('cabinet-sort'), 'change');
        expect(drawerLabels()).toEqual(['Saved and applied', 'In progress', 'Offers', 'Closed']);
    });

    test('tapping a folder in the cabinet opens it on the desk, and a tap on nothing does nothing', () => {
        t.openCabinet();
        const id = t.filing().idAt(0);
        expect(t.actOn('cabinet-folder', { instanceId: 0 })).toBe(true);
        expect(el('folder').hidden).toBe(false);
        expect(t.ui.folderId).toBe(id);
        expect(t.actOn('cabinet-folder', { instanceId: 999 })).toBe(false);
    });

    test('a new application gets a folder, and throwing one away takes it out', () => {
        quickAdd('Zephyr Works', 'Engineer');
        expect(t.filing().count).toBe(17);
        t.throwAway('applications', live().find((a) => a.company === 'Zephyr Works').id);
        expect(t.filing().count).toBe(16);
    });
});

// ---- M4: the corkboard -----------------------------------------------------------

describe('the corkboard', () => {
    let boardMod;
    beforeEach(async () => {
        boardMod = await import('../www/office/js/board.js');
        t.stockOffice();
    });

    const B = CONFIG.room.board;
    const zOf = (status) => boardMod.columnZ(CONFIG.statuses.indexOf(status), B, CONFIG.statuses.length);
    const byName = (name) => live().find((a) => a.company === name);
    const frames = (n = 20) => { for (let i = 0; i < n; i++) { jest.advanceTimersByTime(100); dom.loops.at(-1)(); } };

    test('opens at its station from the toolbar, the room and the 5 key, and says what it holds', () => {
        place('board');
        expect(el('board').hidden).toBe(false);
        expect(t.ui.station).toBe('board');
        expect(el('board-summary').textContent).toMatch(/^On the board: Saved for later 1, Applied \d+, Screening 2, Interviewing 2, Offer 1, Not selected 2, Withdrawn 1\.$/);
        expect(t.pinboard().count).toBe(16);
        el('board-close').click();
        expect(t.ui.station).toBe('desk');
        t.actOn('board');
        expect(el('board').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('5');
        expect(el('board').hidden).toBe(false);
    });

    test('the keyboard move: choose a card, choose a column, Move', () => {
        t.openBoard();
        const app = byName('Harborlight Analytics');
        el('board-card').value = app.id;
        fire(el('board-card'), 'change');
        expect(el('board-to').value).toBe('applied');
        el('board-to').value = 'screening';
        submit('board-form');
        expect(byName('Harborlight Analytics').status).toBe('screening');
        expect(said()).toBe('Moved Harborlight Analytics, Data Visualization Engineer to Screening');
        expect(t.ui.boardMoving).toBe(true);
        frames();
        expect(t.pinboard().card(app.id).at.z).toBeCloseTo(zOf('screening'), 9);
        // The same column again is not a move.
        submit('board-form');
        expect(said()).toBe('Harborlight Analytics, Data Visualization Engineer is already in Screening.');
    });

    test('a card dragged to another column changes status, and can be undone', () => {
        t.openBoard();
        const app = byName('Saltmarsh Transit');
        t.beginPointerDrag(app.id, { pointerId: 1, clientX: 100, clientY: 100 });
        // A wobble under six pixels is still a tap in waiting.
        t.boardPointerMove({ pointerId: 1, clientX: 103, clientY: 101 });
        expect(t.pinboard().dragging).toBeNull();
        t.pinboard().beginDrag(app.id);
        t.pinboard().dragTo(B.y, zOf('interviewing'));
        expect(t.dropCard(app.id, zOf('interviewing'))).toBe('interviewing');
        expect(byName('Saltmarsh Transit').status).toBe('interviewing');
        t.undo();
        expect(byName('Saltmarsh Transit').status).toBe('applied');
    });

    test('a card dropped back on its own column stays, and says so', () => {
        t.openBoard();
        const app = byName('Saltmarsh Transit');
        t.pinboard().beginDrag(app.id);
        expect(t.dropCard(app.id, zOf('applied'))).toBeNull();
        expect(said()).toBe('Saltmarsh Transit, Web Developer stays in Applied.');
        expect(t.history.size).toBe(1);
    });

    test('a tap on a card, without moving, opens its folder', () => {
        t.openBoard();
        const app = byName('Kestrel Freight');
        t.beginPointerDrag(app.id, { pointerId: 7, clientX: 50, clientY: 50 });
        t.boardPointerUp({ pointerId: 7, clientX: 51, clientY: 50 });
        expect(el('folder').hidden).toBe(false);
        expect(el('folder-title').textContent).toBe('Kestrel Freight, Senior UI Engineer');
    });

    test('a drag that moves goes through the pointer, and another finger is ignored', () => {
        t.openBoard();
        const app = byName('Orchard Street Media');
        t.beginPointerDrag(app.id, { pointerId: 3, clientX: 10, clientY: 10 });
        t.boardPointerMove({ pointerId: 9, clientX: 300, clientY: 10 });
        expect(t.pinboard().dragging).toBeNull();
        t.boardPointerMove({ pointerId: 3, clientX: 300, clientY: 10 });
        expect(t.pinboard().dragging).toBe(app.id);
        t.boardPointerUp({ pointerId: 9 });
        expect(t.pinboard().dragging).toBe(app.id);
        // Wherever it was let go, the drop decides by that point's column.
        t.boardPointerUp({ pointerId: 3 });
        expect(t.pinboard().dragging).toBeNull();
    });

    test('a cancelled drag settles the card back', () => {
        t.openBoard();
        const app = byName('Orchard Street Media');
        t.beginPointerDrag(app.id, { pointerId: 4, clientX: 10, clientY: 10 });
        t.boardPointerMove({ pointerId: 4, clientX: 200, clientY: 10 });
        t.boardPointerCancel({ pointerId: 4 });
        expect(t.pinboard().dragging).toBeNull();
        expect(byName('Orchard Street Media').status).toBe('applied');
        t.boardPointerCancel({ pointerId: 4 });
    });

    test('a status changed anywhere else carries the card across the board too', () => {
        const app = byName('Copperleaf Health');
        t.openFolder(app.id);
        const select = el('folder-body').children[0].children[1];
        select.value = 'offer';
        fire(select, 'change');
        expect(t.ui.boardMoving).toBe(true);
        frames();
        expect(t.pinboard().card(app.id).at.z).toBeCloseTo(zOf('offer'), 9);
    });

    test('taps on the room are the board’s own while its sheet is up', () => {
        t.openBoard();
        expect(t.handleSceneTap(10, 10)).toBeNull();
        t.boardPointerDown({ pointerId: 1, clientX: 10, clientY: 10 });
        expect(t.pinboard().dragging).toBeNull();
    });
});

// ---- M5: the Rolodex ---------------------------------------------------------------

describe('the Rolodex', () => {
    beforeEach(() => t.stockOffice());

    const person = (name) => doc().contacts.find((c) => c.name === name);
    const byName = (name) => live().find((a) => a.company === name);
    const listNames = () => el('rolodex-list').children.map((li) => li.children[0].children[0].textContent);
    const texts = (node) => (node.children && node.children.length ? node.children.flatMap(texts) : [node.textContent || '']);

    test('opens where the visitor stands from Places and the 6 key, and lists everyone', () => {
        t.goTo('window');
        const standing = t.ui.station;
        place('rolodex');
        expect(el('rolodex').hidden).toBe(false);
        // The wheel is gone from the desk (QA, 2026-09-25): nowhere to go.
        expect(t.ui.station).toBe(standing);
        expect(el('rolodex-count').textContent).toBe('5 people in the Rolodex.');
        expect(listNames()).toEqual(['Dana Whitcombe', 'Jordan Reyes', 'Lena Fischer', 'Marcus Oyelaran', 'Priya Anand']);
        el('rolodex-close').click();
        expect(el('rolodex').hidden).toBe(true);
        expect(t.ui.station).toBe(standing);
        // Nothing in the room answers to it any more.
        expect(t.actOn('rolodex')).toBe(false);
        expect(el('rolodex').hidden).toBe(true);
        key('6');
        expect(el('rolodex').hidden).toBe(false);
    });

    test('typing narrows the list', () => {
        t.openRolodex();
        el('rolodex-search').value = 'fisch';
        fire(el('rolodex-search'), 'input');
        expect(listNames()).toEqual(['Lena Fischer']);
        expect(el('rolodex-count').textContent).toBe('1 of 5 people match.');
        // Searching by company finds the people there too.
        el('rolodex-search').value = 'tidewater';
        fire(el('rolodex-search'), 'input');
        expect(listNames()).toEqual(['Marcus Oyelaran']);
    });

    test('a person’s card: how to reach them, safely linked, and everything they are part of', () => {
        t.openRolodex();
        t.openContact(person('Priya Anand').id);
        expect(el('contact').hidden).toBe(false);
        expect(el('contact-title').textContent).toBe('Priya Anand');
        const words = texts(el('contact-body'));
        expect(words).toEqual(expect.arrayContaining(['Senior Recruiter at Brightkettle', 'priya@brightkettle.example', 'Brightkettle, Senior Product Designer', 'Met at']));
        const find = (node, tag) => (node.tagName === tag ? [node] : (node.children || []).flatMap((c) => find(c, tag)));
        const mail = find(el('contact-body'), 'A')[0];
        expect(mail.href).toBe('mailto:priya@brightkettle.example');
        expect(t.openContact('nobody')).toBe(false);
    });

    test('show their applications: the computer, filtered to the person, with a chip to let them go', () => {
        t.openContact(person('Lena Fischer').id);
        el('contact-actions').children[0].click();
        expect(el('computer').hidden).toBe(false);
        expect(rowNames()).toEqual(['Quillfeather Labs']);
        const chip = el('grid-filters').children[0];
        expect(chip.textContent).toBe('With Lena Fischer1');
        expect(said()).toBe('Showing the applications Lena Fischer is part of.');
        chip.click();
        expect(rowNames()).toHaveLength(16);
    });

    test('the grid names who is linked, in its People column', () => {
        t.openComputer();
        const row = el('grid-body').children.find((tr) => tr.children[0].children[0].textContent === 'Brightkettle');
        expect(row.children[2].textContent).toBe('Priya Anand');
        expect(row.children[2].dataset.label).toBe('People');
    });

    test('a new person from the Rolodex, and one added from a folder is linked to it', () => {
        t.openRolodex();
        el('rolodex-new').click();
        expect(el('contact-form').hidden).toBe(false);
        el('cf-name').value = 'Sam Rivera';
        el('cf-title').value = 'Hiring Manager';
        submit('cf-form');
        expect(person('Sam Rivera')).toBeTruthy();
        expect(said()).toBe('Added Sam Rivera to the Rolodex.');

        const app = byName('Saltmarsh Transit');
        t.openFolder(app.id);
        t.openContactForm(null, { linkTo: app.id });
        expect(el('contact-form-about').textContent).toBe('They will be linked to Saltmarsh Transit, Web Developer.');
        expect(el('cf-company').value).toBe('Saltmarsh Transit');
        el('cf-name').value = 'Ada Brook';
        submit('cf-form');
        expect(byName('Saltmarsh Transit').contactIds).toContain(person('Ada Brook').id);
        // One undo takes the person and the link back together.
        t.undo();
        expect(person('Ada Brook')).toBeUndefined();
    });

    test('the contact form says what to fix', () => {
        t.openContactForm(null);
        submit('cf-form');
        expect(el('cf-error').textContent).toBe('Please enter a name.');
        el('cf-name').value = 'Pat';
        el('cf-email').value = 'pat@';
        submit('cf-form');
        expect(el('cf-error').textContent).toBe('That email address looks incomplete.');
        el('cf-email').value = '';
        el('cf-linkedin').value = 'javascript:alert(1)';
        submit('cf-form');
        expect(el('cf-error').textContent).toBe('Please check the LinkedIn link.');
        expect(person('Pat')).toBeUndefined();
    });

    test('link someone already in the Rolodex from a folder, and unlink them again', () => {
        const app = byName('Orchard Street Media');
        const dana = person('Dana Whitcombe');
        t.openFolder(app.id);
        expect(t.setLink(app.id, dana.id, true).changed).toBe(true);
        expect(byName('Orchard Street Media').contactIds).toEqual([dana.id]);
        expect(said()).toBe('Linked Dana Whitcombe to Orchard Street Media, Creative Technologist');
        t.setLink(app.id, dana.id, false);
        expect(byName('Orchard Street Media').contactIds).toEqual([]);
        expect(t.setLink('nope', dana.id, true)).toBeNull();
    });

    test('an edit keeps the person’s links', () => {
        const lena = person('Lena Fischer');
        t.openContact(lena.id);
        t.openContactForm(lena.id);
        expect(el('cf-name').value).toBe('Lena Fischer');
        el('cf-title').value = 'Director of Engineering';
        submit('cf-form');
        expect(person('Lena Fischer').title).toBe('Director of Engineering');
        expect(byName('Quillfeather Labs').contactIds).toContain(lena.id);
    });

    test('a person thrown away comes back from the wastebasket with every link', () => {
        const priya = person('Priya Anand');
        t.openContact(priya.id);
        el('contact-actions').children.at(-1).click();
        expect(el('contact').hidden).toBe(true);
        t.openComputer();
        const row = el('grid-body').children.find((tr) => tr.children[0].children[0].textContent === 'Brightkettle');
        expect(row.children[2].textContent).toBe('');
        t.restore('contacts', priya.id);
        expect(byName('Brightkettle').contactIds).toContain(priya.id);
    });

    test('an event records who was there, from the application’s people', () => {
        const app = byName('Brightkettle');
        t.openEventForm(app.id, null);
        expect(el('ef-with-row').hidden).toBe(false);
        const box = el('ef-with').children[0].children[0];
        expect(el('ef-with').children[0].textContent).toBe('Priya Anand');
        box.checked = true;
        el('ef-at').value = `${formatDate(addDays(new Date(), 4))}T11:00`;
        submit('ef-form');
        const ev = doc().events.find((e) => e.applicationId === app.id && e.at.endsWith('T11:00'));
        expect(ev.withContactIds).toEqual([person('Priya Anand').id]);
        // An application with nobody linked does not ask.
        t.openEventForm(byName('Saltmarsh Transit').id, null);
        expect(el('ef-with-row').hidden).toBe(true);
    });
});

// ---- M6: places, the whiteboard, the departures board, the printer ----------------

describe('places', () => {
    test('the welcome card comes back from Places and the ? key, its way to the directory on it (QA, 2026-09-29)', () => {
        expect(el('welcome').hidden).toBe(true);
        place('welcome');
        expect(el('welcome').hidden).toBe(false);
        expect(el('welcome-actions').children.length).toBeGreaterThan(0);
        const html = readFileSync(join(process.cwd(), 'www/office/index.html'), 'utf8');
        const card = html.slice(html.indexOf('<div id="welcome"'), html.indexOf('<!-- THE COMPUTER'));
        expect(card).toContain('<a id="explore-link" class="welcome-explore" href="/">');
        // Its own button takes the visitor back in.
        el('welcome-actions').children.at(-1).click();
        expect(el('welcome').hidden).toBe(true);
        key('?');
        expect(el('welcome').hidden).toBe(false);
        // Not over another card: the key belongs to that card then.
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('c');
        key('?');
        expect(el('welcome').hidden).toBe(true);
    });

    test('the list opens beside its button, goes where it says, and closes', () => {
        el('bar-places').click();
        expect(el('places-menu').hidden).toBe(false);
        expect(el('bar-places').getAttribute('aria-expanded')).toBe('true');
        const items = el('places-menu').children;
        expect(items.map((b) => b.children[0] ? b.dataset.place : b.dataset.place)).toEqual(
            ['window', 'desk', 'computer', 'calendar', 'cabinet', 'board', 'rolodex', 'whiteboard', 'printer', 'welcome']);
        expect(dom.documentStub.activeElement).toBe(items[0]);
        expect(el('places-menu').style.left).toMatch(/px$/);
        items.find((b) => b.dataset.place === 'calendar').click();
        expect(el('places-menu').hidden).toBe(true);
        expect(el('calendar').hidden).toBe(false);
    });

    test('arrow keys move through it, Escape puts it away and hands focus back', () => {
        el('bar-places').click();
        const items = el('places-menu').children;
        fire(el('places-menu'), 'keydown', { key: 'ArrowDown', target: items[0] });
        expect(dom.documentStub.activeElement).toBe(items[1]);
        fire(el('places-menu'), 'keydown', { key: 'ArrowUp', target: items[0] });
        expect(dom.documentStub.activeElement).toBe(items.at(-1));
        fire(el('places-menu'), 'keydown', { key: 'Escape', target: items[0] });
        expect(el('places-menu').hidden).toBe(true);
        expect(dom.documentStub.activeElement).toBe(el('bar-places'));
    });

    test('a press outside puts it away, and a second press on its button too', () => {
        el('bar-places').click();
        fire(dom.documentStub, 'pointerdown', { target: dom.documentStub.body });
        expect(el('places-menu').hidden).toBe(true);
        el('bar-places').click();
        el('bar-places').click();
        expect(el('places-menu').hidden).toBe(true);
    });

    test('the window is a place of its own, from the list and the 9 key', () => {
        place('window');
        expect(t.ui.station).toBe('window');
        key('1');
        expect(t.ui.station).toBe('desk');
        key('9');
        expect(t.ui.station).toBe('window');
        expect(t.world()).toBeTruthy();
    });

    test('going to the desk closes whatever is open', () => {
        t.openComputer();
        expect(t.goToPlace('desk')).toBe(true);
        expect(el('computer').hidden).toBe(true);
        expect(t.ui.station).toBe('desk');
        expect(t.goToPlace('nowhere')).toBe(false);
    });
});

describe('the whiteboard', () => {
    beforeEach(() => t.stockOffice());

    test('opens at its station from Places, the room and the 7 key, and says its numbers in words', () => {
        place('whiteboard');
        expect(el('whiteboard').hidden).toBe(false);
        expect(t.ui.station).toBe('whiteboard');
        const lines = el('wb-summary').children.map((li) => li.textContent);
        expect(lines[0]).toMatch(/^This week: \d+ applications? sent, against a goal of 5\.$/);
        expect(lines.join(' ')).toMatch(/How far they got: Applied 15, Screening \d+, Interviewing \d+, Offer 1\./);
        expect(el('wb-funnel').children).toHaveLength(5);
        expect(el('wb-weeks').children).toHaveLength(8);
        expect(el('wb-weeks').children.at(-1).children[0].textContent).toMatch(/\(this week\)$/);
        el('whiteboard-close').click();
        t.actOn('whiteboard');
        expect(el('whiteboard').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('7');
        expect(el('whiteboard').hidden).toBe(false);
    });

    test('a tap on the goal line goes straight to the weekly goal', async () => {
        const wb = await import('../www/office/js/whiteboard.js');
        const chart = wb.weekChart(t.ui.whiteboardModel);
        t.actOn('whiteboard', { uv: { x: (chart.x0 + chart.x1) / 2, y: 1 - chart.goalY } });
        expect(el('whiteboard').hidden).toBe(false);
        expect(dom.documentStub.activeElement).toBe(el('wb-goal'));
        expect(said()).toBe('Your weekly goal is 5. You can change it here.');
        el('wb-goal').value = '7';
        fire(el('wb-goal'), 'change');
        expect(doc().settings.weeklyGoal).toBe(7);
        expect(el('wb-summary').children[0].textContent).toMatch(/against a goal of 7\.$/);
    });
});

describe('the departures board is gone (QA, 2026-09-29)', () => {
    test('no card, no place, no station, and the 8 key does nothing', () => {
        expect(Object.keys(CONFIG.stations)).not.toContain('departures');
        expect(CONFIG.room.departures).toBeUndefined();
        expect(t.goToPlace('departures')).toBeFalsy();
        const station = t.ui.station;
        key('8');
        expect(t.ui.station).toBe(station);
        expect(t.openDepartures).toBeUndefined();
        const html = readFileSync(join(process.cwd(), 'www/office/index.html'), 'utf8');
        expect(html).not.toMatch(/departures|dep-/i);
        expect(readFileSync(join(process.cwd(), 'www/office/js/main.js'), 'utf8')).not.toMatch(/departure|splitflap/i);
    });
});


describe('the printer', () => {
    beforeEach(() => {
        t.stockOffice();
        window.print = jest.fn();
    });

    test('offers the soonest interview first, and prints its prep sheet', () => {
        place('printer');
        expect(el('printer').hidden).toBe(false);
        const first = el('printer-app').children[0];
        expect(first.textContent).toMatch(/^Tidewater Robotics, Frontend Engineer, next up /);
        el('printer-print').click();
        expect(window.print).toHaveBeenCalledTimes(1);
        const sheet = el('print-sheet');
        expect(sheet.children[0].children[0].textContent).toBe('Tidewater Robotics');
        const headings = sheet.children.filter((c) => c.className === 'print-section').map((c) => c.children[0].textContent);
        expect(headings).toEqual(expect.arrayContaining(['Coming up', 'People', 'Still to do', 'Questions to ask']));
        expect(said()).toBe('The prep sheet for Tidewater Robotics, Frontend Engineer is ready to print.');
    });

    test('with nothing to print, it says so instead of showing an empty list (QA, 2026-09-25)', () => {
        t.openPrinter();
        expect(el('printer-choose').hidden).toBe(false);
        expect(el('printer-empty').hidden).toBe(true);
        t.clearTheSamples();
        t.openPrinter();
        expect(el('printer-app').children).toHaveLength(0);
        expect(el('printer-print').disabled).toBe(true);
        expect(el('printer-choose').hidden).toBe(true);
        expect(el('printer-empty').hidden).toBe(false);
    });

    test('from an open folder, the printer offers that application, and the folder prints it directly', () => {
        const app = live().find((a) => a.company === 'Quillfeather Labs');
        t.openFolder(app.id);
        el('folder-actions').children.find((b) => b.textContent === 'Print a prep sheet').click();
        expect(window.print).toHaveBeenCalledTimes(1);
        expect(el('print-sheet').children[0].children[0].textContent).toBe('Quillfeather Labs');
        t.openPrinter();
        expect(el('printer-app').value).toBe(app.id);
    });

    test('the out-tray, the printer on the floor and the P key all reach it', () => {
        el('bar-outtray').click();
        el('outtray-print').click();
        expect(el('printer').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        t.actOn('printer');
        expect(el('printer').hidden).toBe(false);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        key('p');
        expect(el('printer').hidden).toBe(false);
        expect(t.printPrep('nope')).toBeNull();
        expect(said()).toBe('That application is no longer here.');
    });
});

describe('looking around (QA, 2026-09-29: pan and zoom with no floating buttons)', () => {
    const canvas = () => el('game-canvas');
    const frame = (ms = 100) => {
        t.state.lastTime = performance.now() - ms;
        t.animate();
    };

    test('a zoom is a lens: narrowed in tan space, never wider than the widest the view allows', () => {
        expect(main.zoomedFov(50, 0)).toBeCloseTo(50, 9);
        const tan = (deg) => Math.tan((deg * Math.PI) / 360);
        expect(tan(main.zoomedFov(50, 1))).toBeCloseTo(tan(50) / 2, 9);
        expect(main.zoomedFov(80, -1)).toBe(CONFIG.view.maxFov);
        const { maxIn, maxOut } = CONFIG.view.look.zoom;
        expect(t.setZoom(9)).toBe(maxIn);
        expect(t.setZoom(-9)).toBe(-maxOut);
    });

    test('the wheel zooms, up for in, a notch at a time; the arrow keys turn the view', async () => {
        const pan = await import('../www/shared/js/pan-1.0.0.min.js');
        t.setZoom(0);
        fire(canvas(), 'wheel', { deltaY: -100, deltaMode: 0, cancelable: true });
        expect(t.ui.zoom).toBeCloseTo(CONFIG.view.look.zoom.wheel, 9);
        fire(canvas(), 'wheel', { deltaY: 100, deltaMode: 0, cancelable: true });
        expect(t.ui.zoom).toBeCloseTo(0, 9);
        fire(dom.windowStub, 'keydown', { code: 'ArrowLeft', target: dom.documentStub.body });
        frame(80);
        fire(dom.windowStub, 'keyup', { code: 'ArrowLeft', target: dom.documentStub.body });
        expect(pan.getPanAngle()).toBeCloseTo(-CONFIG.view.look.pan.speed * 0.08, 6);
        // Up and down tilt, and + and - zoom.
        fire(dom.windowStub, 'keydown', { code: 'ArrowUp', target: dom.documentStub.body });
        frame(100);
        fire(dom.windowStub, 'keyup', { code: 'ArrowUp', target: dom.documentStub.body });
        expect(pan.getTiltAngle()).toBeGreaterThan(0);
        fire(dom.windowStub, 'keydown', { code: 'Equal', target: dom.documentStub.body });
        frame(100);
        fire(dom.windowStub, 'keyup', { code: 'Equal', target: dom.documentStub.body });
        expect(t.ui.zoom).toBeGreaterThan(0);
    });

    test('a new station starts from its composed view, and any card holds the look still', async () => {
        const pan = await import('../www/shared/js/pan-1.0.0.min.js');
        t.setZoom(0.8);
        fire(dom.windowStub, 'keydown', { code: 'ArrowRight', target: dom.documentStub.body });
        frame(200);
        fire(dom.windowStub, 'keyup', { code: 'ArrowRight', target: dom.documentStub.body });
        expect(pan.getPanAngle()).toBeGreaterThan(0);
        expect(t.lookLocked()).toBe(false);
        key('c');
        expect(t.lookLocked()).toBe(true);
        expect(pan.getPanAngle()).toBe(0);
        expect(t.ui.zoom).toBe(0);
        // While the card is up, held keys do not turn the room behind it.
        fire(dom.windowStub, 'keydown', { code: 'ArrowRight', target: dom.documentStub.body });
        frame(200);
        fire(dom.windowStub, 'keyup', { code: 'ArrowRight', target: dom.documentStub.body });
        expect(pan.getPanAngle()).toBe(0);
    });

    test('no buttons on screen: the part’s row is built, and hidden by the office’s own sheet', () => {
        let row = null;
        for (const child of dom.documentStub.body.children || []) {
            if (String(child.className).includes('pan-controls')) row = child;
        }
        expect(row).toBeTruthy();
        expect(row.className).toContain('no-chrome');
        const css = readFileSync(join(process.cwd(), 'www/office/css/experience.css'), 'utf8');
        expect(css).toMatch(/body \.pan-controls\.no-chrome\.visible\s*\{\s*display:\s*none;/);
        // And the welcome card says how, since nothing on screen does.
        const html = readFileSync(join(process.cwd(), 'www/office/index.html'), 'utf8');
        expect(html).toMatch(/Drag to look around, and scroll or pinch to zoom\./);
    });

    test('a touch on the room is a tap at its end, its click canceled', () => {
        const ended = fire(canvas(), 'touchend', { cancelable: true, changedTouches: [{ clientX: 640, clientY: 400 }] });
        expect(ended.defaultPrevented).toBe(true);
    });
});
