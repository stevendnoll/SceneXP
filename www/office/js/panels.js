// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * panels.js - The folder on the desk, the calendar, today's list, the
 * Rolodex and its people, the wastebasket, and the settings card.
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
import { contactLine, linksOf } from './rolodex.min.js';

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
 * removeEvent, exportEvent, addTask, editTask, toggleTask, removeTask,
 * openContact, unlinkContact, linkContact, addPerson.
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
    const facts = [
        fact('Applied', app.appliedOn ? displayDate(app.appliedOn) : ''),
        fact('Closed', app.closedOn ? displayDate(app.closedOn) : ''),
        fact('Work', app.workMode !== 'unknown' ? WORK_MODE_LABELS[app.workMode] : ''),
        fact('Location', app.location),
        fact('Salary', salaryText(app)),
        fact('Found through', app.source),
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

    // People: who is linked here, and a way to link somebody else.
    const people = contactsFor(doc, app);
    const peopleList = h('ul', { className: 'folder-list' });
    for (const c of people) {
        peopleList.appendChild(h('li', { className: 'folder-item' }, [
            h('div', { className: 'folder-item-main' }, [
                h('strong', { text: c.name }),
                contactLine(c) ? h('span', { className: 'folder-item-when', text: contactLine(c) }) : null
            ]),
            h('div', { className: 'folder-item-actions' }, [
                button('Open', 'office-btn office-btn-small', () => on.openContact(c.id), { 'aria-label': `Open ${c.name}` }),
                button('Unlink', 'office-btn office-btn-small', () => on.unlinkContact(c.id),
                    { 'aria-label': `Unlink ${c.name} from this application` })
            ])
        ]));
    }
    const others = doc.contacts.filter((c) => !c.deletedAt && !app.contactIds.includes(c.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    const linkRow = others.length ? (() => {
        const pick = h('select', { id: 'folder-link-person', className: 'office-select' });
        for (const c of others) pick.appendChild(h('option', { value: c.id, text: contactLine(c) ? `${c.name}, ${contactLine(c)}` : c.name }));
        pick.value = others[0].id;
        return h('div', { className: 'folder-link-row' }, [
            h('label', { htmlFor: 'folder-link-person', className: 'sr-only', text: 'Someone already in the Rolodex' }),
            pick,
            button('Link', 'office-btn office-btn-small', () => on.linkContact(pick.value), { 'aria-label': 'Link the chosen person to this application' })
        ]);
    })() : null;
    body.appendChild(h('section', { className: 'folder-section', attrs: { 'aria-labelledby': 'folder-people-title' } }, [
        h('div', { className: 'folder-section-head' }, [
            h('h3', { id: 'folder-people-title', text: 'People' }),
            button('Add a person', 'office-btn office-btn-small', on.addPerson)
        ]),
        people.length ? peopleList : h('p', { className: 'folder-empty', text: 'Nobody linked yet. Recruiters, interviewers and referrals go here.' }),
        linkRow
    ]));

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
                    { 'aria-label': `Add to my calendar: the ${name.toLowerCase()} on ${when}` }) : null,
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
        if (on.print) actions.appendChild(button('Print a prep sheet', 'office-btn', on.print));
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
                { 'aria-label': `Add to my calendar: the ${name.toLowerCase()} with ${app ? app.company || app.role : 'them'}` }) : null,
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

// ---- The Rolodex -------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A mailto link for a real-looking address, or the words as they are. */
function emailLink(email) {
    if (!EMAIL.test(email)) return email;
    return h('a', { href: `mailto:${email}`, className: 'folder-link' }, email);
}

/** A tel link when there are enough digits to dial, or the words. */
function phoneLink(phone) {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.replace(/\D/g, '').length < 7) return phone;
    return h('a', { href: `tel:${digits}`, className: 'folder-link' }, phone);
}

/**
 * Draw a person's card: who they are, how to reach them, and every
 * application and event they are part of. `on` holds openFolder, unlink
 * (appId), link (appId), showApplications, edit and remove.
 */
export function renderContact({ doc, contact, on }) {
    const title = byId('contact-title');
    if (title) title.textContent = contact.name;
    const body = byId('contact-body');
    if (!body) return;
    clear(body);
    if (contactLine(contact)) body.appendChild(h('p', { className: 'card-detail', text: contactLine(contact) }));
    if (contact.sample) body.appendChild(h('span', { className: 'grid-sample', text: 'Sample' }));
    const facts = [
        fact('Email', contact.email ? emailLink(contact.email) : ''),
        fact('Phone', contact.phone ? phoneLink(contact.phone) : ''),
        fact('LinkedIn', contact.linkedIn
            ? h('a', { href: contact.linkedIn, className: 'folder-link', attrs: { target: '_blank', rel: 'noopener noreferrer' } }, 'Open the profile')
            : '')
    ].filter(Boolean);
    if (facts.length) body.appendChild(h('dl', { className: 'folder-facts' }, facts));
    if (contact.notes) body.appendChild(h('p', { className: 'folder-notes', text: contact.notes }));

    const links = linksOf(doc, contact.id);
    const apps = h('ul', { className: 'folder-list' });
    for (const app of links.applications) {
        const direct = app.contactIds.includes(contact.id);
        apps.appendChild(h('li', { className: 'folder-item' }, [
            h('div', { className: 'folder-item-main' }, [
                h('strong', { text: applicationName(app) }),
                h('span', { className: 'folder-item-when', text: direct ? STATUS_LABELS[app.status] : `${STATUS_LABELS[app.status]}. Met at an event` })
            ]),
            h('div', { className: 'folder-item-actions' }, [
                button('Open the folder', 'office-btn office-btn-small', () => on.openFolder(app.id),
                    { 'aria-label': `Open the folder for ${applicationName(app)}` }),
                direct ? button('Unlink', 'office-btn office-btn-small', () => on.unlink(app.id),
                    { 'aria-label': `Unlink ${contact.name} from ${applicationName(app)}` }) : null
            ])
        ]));
    }
    body.appendChild(h('section', { className: 'folder-section', attrs: { 'aria-labelledby': 'contact-apps-title' } }, [
        h('div', { className: 'folder-section-head' }, [h('h3', { id: 'contact-apps-title', text: 'Applications' })]),
        links.applications.length ? apps : h('p', { className: 'folder-empty', text: 'Not linked to any application yet.' })
    ]));
    const unlinked = doc.applications.filter((a) => !a.deletedAt && !a.contactIds.includes(contact.id))
        .sort((a, b) => applicationName(a).localeCompare(applicationName(b)));
    if (unlinked.length) {
        const pick = h('select', { id: 'contact-link-app', className: 'office-select' });
        for (const a of unlinked) pick.appendChild(h('option', { value: a.id, text: applicationName(a) }));
        pick.value = unlinked[0].id;
        body.appendChild(h('div', { className: 'folder-link-row' }, [
            h('label', { htmlFor: 'contact-link-app', className: 'sr-only', text: 'An application to link them to' }),
            pick,
            button('Link', 'office-btn office-btn-small', () => on.link(pick.value), { 'aria-label': `Link ${contact.name} to the chosen application` })
        ]));
    }

    if (links.events.length) {
        const list = h('ul', { className: 'folder-list' });
        for (const ev of links.events) {
            const app = doc.applications.find((a) => a.id === ev.applicationId);
            list.appendChild(h('li', { className: 'folder-item' }, h('div', { className: 'folder-item-main' }, [
                h('strong', { text: `${eventName(ev)}: ${applicationName(app)}` }),
                h('span', { className: 'folder-item-when', text: displayDateTime(ev.at) })
            ])));
        }
        body.appendChild(h('section', { className: 'folder-section', attrs: { 'aria-labelledby': 'contact-events-title' } }, [
            h('div', { className: 'folder-section-head' }, [h('h3', { id: 'contact-events-title', text: 'Met at' })]),
            list
        ]));
    }

    const actions = byId('contact-actions');
    if (actions) {
        clear(actions);
        if (links.applications.length) actions.appendChild(button('Show their applications in the computer', 'office-btn', on.showApplications));
        actions.appendChild(button('Edit', 'office-btn', on.edit));
        actions.appendChild(button('Throw away', 'office-btn office-btn-danger', on.remove));
    }
}

/**
 * Draw the Rolodex's list: the people a search found, each a button with
 * their title and company. `on.open(id)` opens one. Returns how many.
 */
export function renderRolodexList({ people, total, text, on }) {
    const list = byId('rolodex-list');
    const countEl = byId('rolodex-count');
    if (countEl) {
        countEl.textContent = !total ? 'The Rolodex is empty. New contact adds the first card.'
            : text.trim() ? `${people.length} of ${total} ${total === 1 ? 'person' : 'people'} match.`
                : `${total} ${total === 1 ? 'person' : 'people'} in the Rolodex.`;
    }
    if (!list) return people.length;
    clear(list);
    for (const c of people) {
        list.appendChild(h('li', {}, h('button', {
            type: 'button',
            className: 'office-btn rolodex-person',
            onClick: () => on.open(c.id)
        }, [c.name, contactLine(c) ? h('span', { className: 'person-line', text: contactLine(c) }) : null])));
    }
    return people.length;
}

// ---- The whiteboard ---------------------------------------------------------------

/** The whiteboard's sheet: its numbers in sentences, and as two tables. */
export function renderWhiteboardSheet(model, lines) {
    const summary = byId('wb-summary');
    if (summary) {
        clear(summary);
        for (const line of lines) summary.appendChild(h('li', { text: line }));
    }
    const goal = byId('wb-goal');
    if (goal && typeof document !== 'undefined' && document.activeElement !== goal) goal.value = String(model.goal);
    const funnelBody = byId('wb-funnel');
    if (funnelBody) {
        clear(funnelBody);
        for (const s of model.funnel) funnelBody.appendChild(h('tr', {}, [h('th', { attrs: { scope: 'row' }, text: s.label }), h('td', { text: String(s.count) })]));
    }
    const weeksBody = byId('wb-weeks');
    if (weeksBody) {
        clear(weeksBody);
        for (const w of model.weeks) {
            weeksBody.appendChild(h('tr', {}, [
                h('th', { attrs: { scope: 'row' }, text: w.current ? `${w.label} (this week)` : w.label }),
                h('td', { text: String(w.count) })
            ]));
        }
    }
}

// ---- The prep sheet ------------------------------------------------------------

function sheetSection(title, children) {
    return h('section', { className: 'print-section' }, [h('h2', { text: title }), ...children]);
}

function eventLines(list) {
    return h('ul', {}, list.map((ev) => h('li', {}, [
        h('strong', { text: `${ev.what}, ${ev.when}` }),
        ev.title ? ` ${ev.title}.` : '',
        ev.with.length ? ` With ${ev.with.join(', ')}.` : '',
        ev.outcome ? ` ${ev.outcome}.` : ''
    ])));
}

/**
 * Lay out a prep sheet (prep.js) in the page's print-only section, as text:
 * the browser's print dialog prints it and nothing else.
 */
export function renderPrintSheet(sheet, questionLines = 6) {
    const root = byId('print-sheet');
    if (!root) return null;
    clear(root);
    root.appendChild(h('header', { className: 'print-head' }, [
        h('h1', { text: sheet.company || sheet.role }),
        sheet.company && sheet.role ? h('p', { className: 'print-role', text: sheet.role }) : null
    ]));
    if (sheet.facts.length) {
        root.appendChild(h('dl', { className: 'print-facts' }, sheet.facts.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
    }
    if (sheet.upcoming.length) root.appendChild(sheetSection('Coming up', [eventLines(sheet.upcoming)]));
    if (sheet.people.length) {
        root.appendChild(sheetSection('People', [h('ul', {}, sheet.people.map((p) => h('li', {}, [
            h('strong', { text: p.name }),
            p.line ? `, ${p.line}` : '',
            [p.email, p.phone].filter(Boolean).length ? `. ${[p.email, p.phone].filter(Boolean).join(', ')}` : ''
        ])))]));
    }
    if (sheet.past.length) root.appendChild(sheetSection('So far', [eventLines(sheet.past)]));
    if (sheet.tasks.length) {
        root.appendChild(sheetSection('Still to do', [h('ul', {}, sheet.tasks.map((t) => h('li', { text: t.due ? `${t.text} (due ${t.due})` : t.text })))]));
    }
    if (sheet.notes) root.appendChild(sheetSection('Your notes', [h('p', { className: 'print-pre', text: sheet.notes })]));
    root.appendChild(sheetSection('Questions to ask', Array.from({ length: questionLines }, () => h('div', { className: 'print-line' }))));
    if (sheet.posting) root.appendChild(sheetSection('The posting', [h('p', { className: 'print-pre print-small', text: sheet.posting })]));
    root.appendChild(h('p', { className: 'print-foot', text: sheet.printed }));
    return root;
}
