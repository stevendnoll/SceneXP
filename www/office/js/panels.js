// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * panels.js - The folder on the desk, the wall calendar, today's list, the
 * wastebasket, and the settings card.
 *
 * Each draws one card from the document and a set of handlers, and never
 * changes anything itself: every button calls back into main.js, which runs
 * the mutation and redraws. So a folder is always a picture of the saved
 * document, never a stale copy of it.
 *
 * NO MARKUP FROM STRINGS. Everything the visitor typed reaches the page as
 * text, and a link is only drawn when store.js kept it as http or https.
 */

import { h, button, clear } from './cards.min.js';
import {
    STATUS_LABELS, OUTCOME_LABELS, WORK_MODE_LABELS, COLLECTION_LABELS, applicationName, salaryText, eventName
} from './labels.min.js';

export { eventName };
import { displayDate, displayDateTime, daysBetween, formatDate } from './dates.min.js';
import { eventsFor, tasksFor, contactsFor, wastebasket, hasSamples } from './store.min.js';
import { lastActivityOn, isUpcoming } from './derive.min.js';
import { dayLabel, longDay } from './calendar.min.js';

function byId(id) {
    return document.getElementById(id);
}

function fact(label, value) {
    if (!value) return null;
    return h('div', { className: 'folder-fact' }, [
        h('dt', { text: label }),
        h('dd', {}, value)
    ]);
}

// ---- The folder -------------------------------------------------------------


/**
 * Draw an application's folder. `status` is the one to show (`ghosted`
 * included). `on` holds: setStatus, edit, remove, logEvent, editEvent,
 * removeEvent, exportEvent, addTask, editTask, toggleTask, removeTask.
 */
export function renderFolder({ doc, app, status, config, now, on }) {
    const title = byId('folder-title');
    if (title) title.textContent = applicationName(app);
    const body = byId('folder-body');
    if (!body) return;
    clear(body);

    // Status, changed right here, because it is the thing that changes most.
    const select = h('select', { id: 'folder-status', className: 'office-select' });
    for (const s of config.statuses) select.appendChild(h('option', { value: s, text: STATUS_LABELS[s] }));
    select.value = app.status;
    select.addEventListener('change', () => on.setStatus(select.value));
    body.appendChild(h('div', { className: 'folder-status-row' }, [
        h('label', { htmlFor: 'folder-status', text: 'Status' }),
        select,
        app.sample ? h('span', { className: 'grid-sample', text: 'Sample' }) : null
    ]));
    if (status === 'ghosted') {
        const last = lastActivityOn(app, eventsFor(doc, app.id), tasksFor(doc, app.id));
        const days = last ? daysBetween(last, now) : 0;
        body.appendChild(h('p', {
            className: 'folder-quiet',
            text: `This one has gone quiet, with no word in ${days} days. A friendly follow-up might help.`
        }));
    }

    const link = app.url
        ? h('a', { href: app.url, className: 'folder-link', attrs: { target: '_blank', rel: 'noopener noreferrer' } }, 'Open the posting')
        : null;
    const people = contactsFor(doc, app).map((c) => (c.title ? `${c.name}, ${c.title}` : c.name)).join('. ');
    const facts = [
        fact('Applied', app.appliedOn ? displayDate(app.appliedOn) : ''),
        fact('Closed', app.closedOn ? displayDate(app.closedOn) : ''),
        fact('Work', app.workMode !== 'unknown' ? WORK_MODE_LABELS[app.workMode] : ''),
        fact('Location', app.location),
        fact('Salary', salaryText(app)),
        fact('Found through', app.source),
        fact('People', people),
        fact('Link', link)
    ].filter(Boolean);
    if (facts.length) body.appendChild(h('dl', { className: 'folder-facts' }, facts));
    if (app.notes) body.appendChild(h('p', { className: 'folder-notes', text: app.notes }));
    if (app.posting) {
        body.appendChild(h('details', { className: 'folder-posting' }, [
            h('summary', { text: 'The posting' }),
            h('p', { text: app.posting })
        ]));
    }

    // Events.
    const events = eventsFor(doc, app.id);
    const eventList = h('ul', { className: 'folder-list' });
    for (const ev of events) {
        const name = eventName(ev);
        const when = displayDateTime(ev.at);
        eventList.appendChild(h('li', { className: 'folder-item' }, [
            h('div', { className: 'folder-item-main' }, [
                h('strong', { text: name }),
                h('span', { className: 'folder-item-when', text: when }),
                ev.title ? h('span', { className: 'folder-item-title', text: ev.title }) : null,
                ev.outcome !== 'none' ? h('span', { className: `folder-outcome outcome-${ev.outcome}`, text: OUTCOME_LABELS[ev.outcome] }) : null,
                ev.notes ? h('span', { className: 'folder-item-notes', text: ev.notes }) : null
            ]),
            h('div', { className: 'folder-item-actions' }, [
                isUpcoming(ev, now) ? button('Add to my calendar', 'office-btn office-btn-small', () => on.exportEvent(ev.id),
                    { 'aria-label': `Add the ${name.toLowerCase()} on ${when} to my calendar` }) : null,
                button('Edit', 'office-btn office-btn-small', () => on.editEvent(ev.id),
                    { 'aria-label': `Edit the ${name.toLowerCase()} on ${when}` }),
                button('Delete', 'office-btn office-btn-small', () => on.removeEvent(ev.id),
                    { 'aria-label': `Delete the ${name.toLowerCase()} on ${when}` })
            ])
        ]));
    }
    body.appendChild(h('section', { className: 'folder-section', attrs: { 'aria-labelledby': 'folder-events-title' } }, [
        h('div', { className: 'folder-section-head' }, [
            h('h3', { id: 'folder-events-title', text: 'Events' }),
            button('Log an event', 'office-btn office-btn-small', on.logEvent)
        ]),
        events.length ? eventList : h('p', { className: 'folder-empty', text: 'Nothing logged yet. Calls, screens and interviews go here.' })
    ]));

    // Follow-ups.
    const tasks = tasksFor(doc, app.id);
    const taskList = h('ul', { className: 'folder-list' });
    tasks.forEach((t, i) => {
        const boxId = `folder-task-${i}`;
        const box = h('input', { type: 'checkbox', id: boxId, className: 'folder-check' });
        box.checked = Boolean(t.doneAt);
        box.addEventListener('change', () => on.toggleTask(t.id, box.checked));
        const due = t.due ? `Due ${displayDate(t.due)}` : 'No date';
        taskList.appendChild(h('li', { className: `folder-item${t.doneAt ? ' is-done' : ''}` }, [
            h('div', { className: 'folder-item-main folder-task' }, [
                box,
                h('label', { htmlFor: boxId }, [t.text, h('span', { className: 'folder-item-when', text: t.doneAt ? 'Done' : due })])
            ]),
            h('div', { className: 'folder-item-actions' }, [
                button('Edit', 'office-btn office-btn-small', () => on.editTask(t.id), { 'aria-label': `Edit the follow-up ${t.text}` }),
                button('Delete', 'office-btn office-btn-small', () => on.removeTask(t.id), { 'aria-label': `Delete the follow-up ${t.text}` })
            ])
        ]));
    });
    body.appendChild(h('section', { className: 'folder-section', attrs: { 'aria-labelledby': 'folder-tasks-title' } }, [
        h('div', { className: 'folder-section-head' }, [
            h('h3', { id: 'folder-tasks-title', text: 'Follow-ups' }),
            button('Add a follow-up', 'office-btn office-btn-small', on.addTask)
        ]),
        tasks.length ? taskList : h('p', { className: 'folder-empty', text: 'No follow-ups. A short note a week after applying is always welcome.' })
    ]));

    const actions = byId('folder-actions');
    if (actions) {
        clear(actions);
        actions.appendChild(button('Edit details', 'office-btn', on.edit));
        actions.appendChild(button('Throw away', 'office-btn office-btn-danger', on.remove));
    }
}

// ---- The wastebasket --------------------------------------------------------

/** Draw the wastebasket. `on` holds restore(collection, id) and empty(). */
export function renderWastebasket({ doc, on }) {
    const items = wastebasket(doc);
    const list = byId('wastebasket-list');
    const note = byId('wastebasket-note');
    const emptyBtn = byId('wastebasket-empty');
    if (note) {
        note.textContent = items.length
            ? 'Anything here can be restored until the wastebasket is emptied.'
            : 'The wastebasket is empty.';
    }
    if (emptyBtn) emptyBtn.disabled = items.length === 0;
    if (!list) return items;
    clear(list);
    for (const item of items) {
        const kind = COLLECTION_LABELS[item.collection];
        list.appendChild(h('li', { className: 'folder-item' }, [
            h('div', { className: 'folder-item-main' }, [
                h('strong', { text: item.label || kind }),
                h('span', { className: 'folder-item-when', text: `${kind}, thrown away ${displayDate(formatDate(new Date(item.record.deletedAt)))}` })
            ]),
            h('div', { className: 'folder-item-actions' }, [
                button('Restore', 'office-btn office-btn-small', () => on.restore(item.collection, item.record.id),
                    { 'aria-label': `Restore ${item.label || kind}` })
            ])
        ]));
    }
    return items;
}

// ---- Settings ---------------------------------------------------------------

/** Show the right samples button: stock when there are none, clear when
 *  there are. */
export function renderSamplesButtons(doc) {
    const stocked = hasSamples(doc);
    const stock = byId('settings-stock');
    const clearBtn = byId('settings-clear-samples');
    if (stock) stock.hidden = stocked;
    if (clearBtn) clearBtn.hidden = !stocked;
    return stocked;
}

// ---- Shared rows for the calendar and today's list ------------------------------

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

function timeOf(ev) {
    const [y, m, d] = ev.at.slice(0, 10).split('-').map(Number);
    return TIME.format(new Date(y, m - 1, d, Number(ev.at.slice(11, 13)), Number(ev.at.slice(14, 16))));
}

/** One event as a row: when, what, whose, and its buttons. */
function eventRow(doc, ev, now, on, { withDay = false } = {}) {
    const app = doc.applications.find((a) => a.id === ev.applicationId);
    const name = eventName(ev);
    const when = withDay ? `${longDay(ev.at.slice(0, 10))}, ${timeOf(ev)}` : timeOf(ev);
    return h('li', { className: 'folder-item' }, [
        h('div', { className: 'folder-item-main' }, [
            h('strong', { text: `${name}: ${applicationName(app)}` }),
            h('span', { className: 'folder-item-when', text: when }),
            ev.title ? h('span', { className: 'folder-item-title', text: ev.title }) : null
        ]),
        h('div', { className: 'folder-item-actions' }, [
            isUpcoming(ev, now) ? button('Add to my calendar', 'office-btn office-btn-small', () => on.exportEvent(ev.id),
                { 'aria-label': `Add the ${name.toLowerCase()} with ${app ? app.company || app.role : 'them'} to my calendar` }) : null,
            button('Open the folder', 'office-btn office-btn-small', () => on.openFolder(ev.applicationId),
                { 'aria-label': `Open the folder for ${applicationName(app)}` })
        ])
    ]);
}

let rowCount = 0;

/** One follow-up as a row, with its tick box. */
function taskRow(doc, t, on, small) {
    const app = t.applicationId ? doc.applications.find((a) => a.id === t.applicationId) : null;
    const boxId = `list-task-${rowCount++}`;
    const box = h('input', { type: 'checkbox', id: boxId, className: 'folder-check' });
    box.checked = Boolean(t.doneAt);
    box.addEventListener('change', () => on.toggleTask(t.id, box.checked));
    return h('li', { className: 'folder-item' }, [
        h('div', { className: 'folder-item-main folder-task' }, [
            box,
            h('label', { htmlFor: boxId }, [t.text, h('span', { className: 'folder-item-when', text: [small, app ? applicationName(app) : ''].filter(Boolean).join('. ') })])
        ]),
        app ? h('div', { className: 'folder-item-actions' }, [
            button('Open the folder', 'office-btn office-btn-small', () => on.openFolder(app.id),
                { 'aria-label': `Open the folder for ${applicationName(app)}` })
        ]) : null
    ]);
}

// ---- The wall calendar ---------------------------------------------------------

/**
 * Draw the calendar card: the month as a table of day buttons, and the
 * chosen day's events and follow-ups below it. `on` holds selectDay,
 * openFolder, toggleTask and exportEvent.
 */
export function renderCalendar({ doc, grid, marks, selectedKey, todayKey, now, on }) {
    const title = byId('calendar-title');
    if (title) title.textContent = grid.title;
    const body = byId('cal-body');
    if (body) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        const hadFocus = Boolean(active && active.dataset && active.dataset.day);
        let focusTarget = null;
        clear(body);
        for (const week of grid.weeks) {
            const tr = h('tr');
            for (const day of week) {
                const items = marks.get(day.key);
                const classes = ['cal-day'];
                if (!day.inMonth) classes.push('is-out');
                if (day.key === todayKey) classes.push('is-today');
                if (day.key === selectedKey) classes.push('is-selected');
                const btn = h('button', {
                    type: 'button',
                    className: classes.join(' '),
                    dataset: { day: day.key },
                    attrs: {
                        'aria-label': dayLabel(day.key, items),
                        'aria-pressed': day.key === selectedKey ? 'true' : 'false'
                    },
                    onClick: () => on.selectDay(day.key)
                }, [
                    h('span', { className: 'cal-num', text: String(day.day) }),
                    items && items.events.length ? h('span', { className: 'cal-dot', attrs: { 'aria-hidden': 'true' } }) : null,
                    items && items.tasks.length ? h('span', { className: 'cal-ring', attrs: { 'aria-hidden': 'true' } }) : null
                ]);
                // One tab stop for the whole month: the chosen day.
                btn.tabIndex = day.key === selectedKey ? 0 : -1;
                if (day.key === selectedKey) focusTarget = btn;
                tr.appendChild(h('td', {}, btn));
            }
            body.appendChild(tr);
        }
        if (hadFocus && focusTarget) focusTarget.focus({ preventScroll: true });
    }

    const dayTitle = byId('cal-day-title');
    if (dayTitle) dayTitle.textContent = longDay(selectedKey);
    const list = byId('cal-day-list');
    if (!list) return;
    clear(list);
    const items = marks.get(selectedKey);
    if (!items || (!items.events.length && !items.tasks.length)) {
        list.appendChild(h('li', { className: 'folder-empty', text: 'Nothing on this day.' }));
        return;
    }
    for (const ev of items.events) list.appendChild(eventRow(doc, ev, now, on));
    for (const t of items.tasks) list.appendChild(taskRow(doc, t, on, 'Follow-up'));
}

// ---- Today's list ------------------------------------------------------------

/**
 * Draw the Today card: overdue follow-ups, today's, and the week's events.
 * `due` is derive.dueTasks and `coming` is derive.upcomingEvents. `on` holds
 * openFolder, toggleTask and exportEvent. Returns how many rows it drew.
 */
export function renderToday({ doc, due, coming, now, on }) {
    const list = byId('today-list');
    const note = byId('today-note');
    if (!list) return 0;
    clear(list);
    let rows = 0;
    const group = (heading, items) => {
        if (!items.length) return;
        list.appendChild(h('li', { className: 'today-heading' }, h('h3', { text: heading })));
        for (const item of items) {
            list.appendChild(item);
            rows++;
        }
    };
    group('Overdue', due.overdue.map((t) => taskRow(doc, t, on, `Due ${displayDate(t.due)}`)));
    group('Today', due.today.map((t) => taskRow(doc, t, on, 'Due today')));
    group('Coming up this week', coming.map((ev) => eventRow(doc, ev, now, on, { withDay: true })));
    if (note) {
        note.textContent = due.overdue.length || due.today.length
            ? 'Ticking a follow-up off takes its note off the monitor.'
            : 'Nothing is due today. Enjoy the clear desk.';
    }
    return rows;
}
