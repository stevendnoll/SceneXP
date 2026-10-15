// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * panels.js - Drawing the cards' contents from the document.
 *
 * Every function here takes what it needs (the document, the price sheet,
 * handlers in `on`) and rebuilds one container from scratch with `h`, so a
 * card always shows the document as it is now. Nothing here changes the
 * document: a button calls back into main.js, which runs a mutation and
 * redraws.
 *
 * NO MARKUP FROM STRINGS. Titles, labels and notes are the visitor's own.
 */

import { h, clear, button } from './cards.min.js';
import { UI } from './copy.min.js';
import { isLive, liveRooms, liveItems, itemsIn, hasUnsent } from './store.min.js';
import { dayLabel } from './booking.min.js';
import { quoteChecklist, priceItem, priceChoice, formatMoney, spokenMoney, formatMinutes } from './pricing.min.js';
import { taskOf, optionOf, tasksFor, optionsFor } from './sheet.min.js';
import { levelOf, areaOf, roomName, serviceType, bathAllows } from './taxonomy.min.js';

const TAXONOMY_AREAS = () => serviceType('cleaning').areas;

function byId(id) {
    return document.getElementById(id);
}

/** The checklists worth listing: live ones, the visitor's own first and the
 *  most recently changed at the top, the example last. */
export function listedChecklists(doc) {
    return doc.checklists
        .filter(isLive)
        .slice()
        .sort((a, b) => (a.sample - b.sample) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** One line about a checklist: its rooms, its tasks and, with a sheet, its
 *  total. Plain text: a screen reader says "$186" as "186 dollars" by
 *  itself, and an aria-label on a span or a paragraph would be ignored. */
export function checklistSummary(checklist, sheet) {
    const parts = [UI.rooms(liveRooms(checklist).length), UI.tasks(liveItems(checklist).length)];
    if (sheet && liveItems(checklist).length) {
        const quote = quoteChecklist(sheet, { rooms: checklist.rooms, items: liveItems(checklist) });
        parts.push(formatMoney(quote.totalCents));
    }
    return { text: parts.join(', ') };
}

/** Where a checklist stands, for My checklists (PRD 8.6): the example, a
 *  draft, published, or its booked visit, and whether changes wait to be
 *  sent. */
export function checklistStatus(checklist) {
    if (checklist.sample) return UI.example;
    const pub = checklist.published;
    if (!pub || !pub.at) return UI.draft;
    const status = checklist.booking ? UI.booked(dayLabel(checklist.booking.date)) : UI.published;
    return hasUnsent(checklist) ? UI.withUnsent(status) : status;
}

/**
 * My checklists: every checklist in this browser, with Open, Duplicate and
 * Remove. `on` holds open(id), duplicate(id) and remove(id).
 */
export function renderMyChecklists({ doc, sheet, activeId, on }) {
    const list = byId('my-list');
    if (!list) return;
    clear(list);
    const rows = listedChecklists(doc);
    if (!rows.length) {
        list.appendChild(h('li', { className: 'my-empty', text: UI.noChecklists }));
        return;
    }
    for (const c of rows) {
        const summary = checklistSummary(c, sheet);
        const current = c.id === activeId;
        const titleId = `my-title-${c.id}`;
        list.appendChild(h('li', { className: current ? 'my-row is-current' : 'my-row' }, [
            h('div', { className: 'my-text' }, [
                h('span', { id: titleId, className: 'my-title', text: c.title }),
                h('span', { className: 'my-status', text: checklistStatus(c) }),
                h('span', { className: 'my-summary', text: summary.text })
            ]),
            h('div', { className: 'my-actions' }, [
                button(current ? UI.current : UI.open, current ? 'ws-btn ws-btn-small' : 'ws-btn ws-btn-small ws-btn-primary',
                    () => on.open(c.id), { 'aria-describedby': titleId }),
                c.sample ? null : button(UI.duplicate, 'ws-btn ws-btn-small', () => on.duplicate(c.id), { 'aria-describedby': titleId }),
                button(UI.remove, 'ws-btn ws-btn-small', () => on.remove(c.id), { 'aria-describedby': titleId })
            ])
        ]));
    }
}

// ---- The checklist view -----------------------------------------------------

/** What was chosen for a task, in words: its options, its size, its
 *  quantity. */
export function choiceText(sheet, item) {
    const parts = [];
    for (const key of item.options) {
        const o = sheet ? optionOf(sheet, key) : null;
        parts.push(o ? o.name : key);
    }
    if (item.size) parts.push(UI.sizes[item.size]);
    if (item.quantity && item.quantity > 1) parts.push(UI.quantity(item.quantity));
    return parts.join(', ');
}

/** A task's name from the sheet, or its key when the sheet is not loaded. */
export function taskName(sheet, item) {
    const t = sheet ? taskOf(sheet, item.task) : null;
    return t ? t.name : item.task;
}

function itemRow(checklist, sheet, item, on, place) {
    const name = taskName(sheet, item);
    const nameId = `task-name-${item.id}`;
    const facts = [choiceText(sheet, item)];
    if (item.photos.length) facts.push(UI.photos(item.photos.length));
    if (item.notes || item.avoid || item.products) facts.push(UI.hasNotes);
    let price = null;
    if (sheet) {
        const p = priceItem(sheet, item, checklist.rooms);
        if (!p.error) {
            price = h('span', { className: 'task-row-price', text: UI.priceAndTime(formatMoney(p.cents), formatMinutes(p.minutes)) });
        }
    }
    return h('li', { className: item.important ? 'task-row is-important' : 'task-row' }, [
        h('div', { className: 'task-row-text' }, [
            h('span', { id: nameId, className: 'task-row-name', text: name }),
            item.important ? h('span', { className: 'task-row-star', text: UI.important }) : null,
            h('span', { className: 'task-row-facts', text: facts.filter(Boolean).join(', ') }),
            price
        ]),
        h('div', { className: 'task-row-actions' }, [
            h('button', {
                type: 'button', id: `move-up-${item.id}`, className: 'ws-btn ws-btn-small', disabled: place.first,
                text: UI.moveUp, onClick: () => on.moveTask(item.id, -1), attrs: { 'aria-describedby': nameId }
            }),
            h('button', {
                type: 'button', id: `move-down-${item.id}`, className: 'ws-btn ws-btn-small', disabled: place.last,
                text: UI.moveDown, onClick: () => on.moveTask(item.id, 1), attrs: { 'aria-describedby': nameId }
            }),
            button(UI.edit, 'ws-btn ws-btn-small', () => on.editTask(item.id), { 'aria-describedby': nameId }),
            button(UI.remove, 'ws-btn ws-btn-small ws-btn-quiet', () => on.removeTask(item.id), { 'aria-describedby': nameId })
        ])
    ]);
}

/** The filter's choices: everything, the important tasks, or one level. */
export function filterChoices(checklist) {
    const out = [{ value: 'all', text: UI.filterAll }, { value: 'important', text: UI.filterImportant }];
    for (const key of checklist.levels) {
        const level = levelOf(checklist.serviceType, key);
        out.push({ value: `level:${key}`, text: UI.filterLevel(level ? level.name : key) });
    }
    return out;
}

/** Fill the filter select, keeping its choice if it still exists. */
export function fillChecklistFilter(checklist, current) {
    const select = byId('checklist-filter');
    if (!select) return 'all';
    const choices = filterChoices(checklist);
    clear(select);
    for (const c of choices) select.appendChild(h('option', { value: c.value, text: c.text }));
    const keep = choices.some((c) => c.value === current) ? current : 'all';
    select.value = keep;
    return keep;
}

/** Whether an item shows under a filter. Pure. */
export function passesFilter(filter, item, room) {
    if (filter === 'important') return item.important;
    if (typeof filter === 'string' && filter.startsWith('level:')) return room.level === filter.slice(6);
    return true;
}

/**
 * The checklist card's body: each level of the home, its rooms, and each
 * room's tasks in the customer's order. `on` holds addTask(roomId),
 * editRoom(roomId), editTask(itemId), removeTask(itemId) and
 * moveTask(itemId, step). `filter` is a filterChoices value.
 */
export function renderChecklist({ checklist, sheet, on, filter = 'all' }) {
    const title = byId('checklist-title');
    if (title) title.textContent = checklist.title;
    const summary = byId('checklist-summary');
    if (summary) {
        const line = checklistSummary(checklist, sheet);
        summary.textContent = sheet ? line.text : `${line.text}. ${UI.sheetMissing}`;
    }
    const body = byId('checklist-body');
    if (!body) return;
    clear(body);
    const rooms = liveRooms(checklist);
    if (!rooms.length) {
        body.appendChild(h('p', { className: 'checklist-empty', text: UI.noRooms }));
        return;
    }
    const filtering = filter !== 'all';
    let shownCount = 0;
    for (const levelKey of checklist.levels) {
        if (filter.startsWith('level:') && filter !== `level:${levelKey}`) continue;
        const level = levelOf(checklist.serviceType, levelKey);
        const here = rooms.filter((r) => r.level === levelKey)
            .filter((r) => !filtering || itemsIn(checklist, r.id).some((i) => passesFilter(filter, i, r)) || filter.startsWith('level:'));
        if (filtering && !here.length && !filter.startsWith('level:')) continue;
        const section = h('section', { className: 'checklist-level' }, [
            h('h3', { className: 'checklist-level-name', text: level ? level.name : levelKey })
        ]);
        if (!here.length) section.appendChild(h('p', { className: 'checklist-empty', text: UI.emptyLevel }));
        for (const room of here) {
            const name = roomName(checklist.serviceType, room);
            const area = areaOf(checklist.serviceType, room.area);
            const roomId = `room-name-${room.id}`;
            const all = itemsIn(checklist, room.id);
            const items = all.filter((i) => passesFilter(filter, i, room));
            shownCount += items.length;
            section.appendChild(h('div', { className: 'checklist-room' }, [
                h('div', { className: 'checklist-room-head' }, [
                    h('h4', { id: roomId, className: 'checklist-room-name' }, [
                        name,
                        room.label && area ? h('span', { className: 'checklist-room-kind', text: area.name }) : null
                    ]),
                    h('div', { className: 'checklist-room-actions' }, [
                        button(UI.addTask, 'ws-btn ws-btn-small ws-btn-primary', () => on.addTask(room.id), { 'aria-describedby': roomId }),
                        button(UI.editRoom, 'ws-btn ws-btn-small', () => on.editRoom(room.id), { 'aria-describedby': roomId })
                    ])
                ]),
                items.length
                    ? h('ul', { className: 'task-list' }, items.map((i) => itemRow(checklist, sheet, i, on, {
                        first: all.indexOf(i) === 0,
                        last: all.indexOf(i) === all.length - 1
                    })))
                    : h('p', { className: 'checklist-empty', text: UI.emptyRoom })
            ]));
        }
        body.appendChild(section);
    }
    const showing = byId('checklist-showing');
    if (showing) {
        const total = liveItems(checklist).length;
        showing.hidden = !filtering;
        showing.textContent = filtering ? UI.filterShowing(shownCount, total) : '';
    }
    if (filtering && !shownCount) body.appendChild(h('p', { className: 'checklist-empty', text: UI.filterNone }));
}

// ---- A task's photos ----------------------------------------------------------

/** The task card's photos: a thumbnail and a Remove button for each.
 *  `photos` is [{ id, url }] with object URLs made by main.js. */
export function renderTaskPhotos({ photos, taskLabel, on }) {
    const list = byId('task-photos');
    if (!list) return;
    clear(list);
    photos.forEach((p, i) => {
        list.appendChild(h('li', { className: 'task-photo' }, [
            h('img', { src: p.url, alt: UI.photoAlt(taskLabel, i + 1), width: 96, height: 96 }),
            button(UI.remove, 'ws-btn ws-btn-small', () => on.remove(p.id), { 'aria-label': UI.removePhoto(i + 1) })
        ]));
    });
}

// ---- The quote ----------------------------------------------------------------

/** The quote for a checklist's live tasks. */
export function quoteFor(checklist, sheet) {
    return quoteChecklist(sheet, { rooms: checklist.rooms, items: liveItems(checklist) });
}

/** The quote in words for a screen reader (the quote at a glance in
 *  Maya's bubble), or null when there is nothing to quote yet. */
export function quoteChip(checklist, sheet) {
    if (!checklist || !sheet || !liveItems(checklist).length) return null;
    const q = quoteFor(checklist, sheet);
    return { spoken: UI.quoteChipSpoken(spokenMoney(q.totalCents), formatMinutes(q.minutes)) };
}

/** The quote card: total, time, the visit minimum, any task that cannot be
 *  priced, and the breakdown by room and task. */
export function renderQuote({ checklist, sheet }) {
    const q = quoteFor(checklist, sheet);
    const set = (id, text) => { const el = byId(id); if (el) el.textContent = text; };
    set('quote-total', UI.quoteTotal(formatMoney(q.totalCents)));
    set('quote-time', UI.quoteTime(formatMinutes(q.minutes)));
    const minimum = formatMoney(sheet.visitMinimumCents);
    set('quote-minimum', q.topUpCents
        ? UI.minimumNudge(minimum, formatMoney(q.topUpCents))
        : (q.lines.length ? UI.minimumMet(minimum) : ''));
    set('quote-tax', `${sheet.taxIncluded ? UI.taxIncluded : UI.taxExtra} ${UI.sheetVersion(sheet.version)}`);
    const problems = byId('quote-problems');
    if (problems) {
        problems.textContent = q.errors.length ? UI.cannotPrice(q.errors.length) : '';
        problems.hidden = !q.errors.length;
    }

    const body = byId('quote-breakdown');
    if (!body) return;
    clear(body);
    const cents = new Map(q.lines.map((l) => [l.itemId, l.cents]));
    const rows = [];
    for (const room of liveRooms(checklist)) {
        const items = itemsIn(checklist, room.id).filter((i) => cents.has(i.id));
        if (!items.length) continue;
        const subtotal = items.reduce((n, i) => n + cents.get(i.id), 0);
        rows.push(h('div', { className: 'quote-room' }, [
            h('div', { className: 'quote-line quote-room-line' }, [
                h('span', { text: roomName(checklist.serviceType, room) }),
                h('span', { text: formatMoney(subtotal) })
            ]),
            h('ul', { className: 'quote-tasks' }, items.map((i) => h('li', { className: 'quote-line' }, [
                h('span', { text: [taskName(sheet, i), choiceText(sheet, i)].filter(Boolean).join(', ') }),
                h('span', { text: formatMoney(cents.get(i.id)) })
            ])))
        ]));
    }
    rows.forEach((r) => body.appendChild(r));
    const sums = [[UI.subtotalLine, q.subtotalCents]];
    if (q.topUpCents) sums.push([UI.topUpLine, q.topUpCents]);
    sums.push([UI.totalLine, q.totalCents]);
    body.appendChild(h('div', { className: 'quote-sums' }, sums.map(([label, value]) =>
        h('div', { className: 'quote-line' }, [h('span', { text: label }), h('span', { text: formatMoney(value) })]))));
}

// ---- The service menu ---------------------------------------------------------

/** How a task is priced, in words: per visit, each, or by room size. */
export function menuPrice(sheet, task) {
    if (task.unit === 'room') {
        const at = (size) => formatMoney(priceChoice(sheet, { task: task.key, size }).cents);
        return UI.menuRoom(at('small'), at('medium'), at('large'));
    }
    if (task.unit === 'count') return UI.menuCount(formatMoney(task.cents));
    return UI.menuEach(formatMoney(task.cents));
}

/**
 * The menu for one kind of room. Each task can be added to any room of that
 * kind in the open checklist (`on.add(roomId, taskKey)`) whose type of bath
 * has it: a bathtub to a full bath, never a shower bath.
 */
export function renderMenu({ sheet, area, checklist, on }) {
    const list = byId('menu-list');
    const note = byId('menu-note');
    if (!list) return;
    clear(list);
    const kind = areaOf('cleaning', area);
    const rooms = checklist ? liveRooms(checklist).filter((r) => r.area === area) : [];
    if (note) {
        note.textContent = !checklist ? UI.menuNoChecklist : (rooms.length ? '' : UI.menuNoRoom(kind ? kind.name : area));
    }
    const fits = (task) => rooms.filter((r) => bathAllows(checklist.serviceType, r.area, r.bath, task.key));
    for (const task of tasksFor(sheet, area)) {
        const nameId = `menu-task-${task.key}`;
        const options = optionsFor(sheet, task.key);
        list.appendChild(h('li', { className: 'menu-row' }, [
            h('div', { className: 'menu-row-text' }, [
                h('span', { id: nameId, className: 'menu-row-name', text: task.name }),
                h('span', { className: 'menu-row-price', text: `${menuPrice(sheet, task)}, ${UI.menuMinutes(task.minutes)}` }),
                h('span', { className: 'menu-row-about', text: task.description }),
                options.length ? h('span', { className: 'menu-row-options', text: options.map((o) => UI.menuOption(o.name, formatMoney(o.cents))).join('. ') }) : null
            ]),
            fits(task).length ? h('div', { className: 'menu-row-actions' }, fits(task).map((r) =>
                button(UI.menuAddTo(roomName(checklist.serviceType, r)), 'ws-btn ws-btn-small', () => on.add(r.id, task.key),
                    { 'aria-describedby': nameId }))) : null
        ]));
    }
}

/** The menu's kinds of room, every one, so the whole menu can be browsed. */
export function fillMenuAreas(current) {
    const select = byId('menu-area');
    if (!select) return;
    clear(select);
    for (const a of TAXONOMY_AREAS()) select.appendChild(h('option', { value: a.key, text: a.name }));
    select.value = current;
}
