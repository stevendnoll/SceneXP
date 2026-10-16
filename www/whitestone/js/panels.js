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
import { UI, REPORT, ADDON_LIST } from './copy.min.js';
import { reportLines, billLines, reportCounts } from './report.min.js';
import { dayLabel } from './booking.min.js';
import { liveRooms, liveItems, itemsIn } from './store.min.js';
import { quoteChecklist, priceItem, formatMoney, spokenMoney, formatMinutes } from './pricing.min.js';
import { taskOf, optionOf } from './sheet.min.js';
import { levelOf, areaOf, roomName, preferenceLines } from './taxonomy.min.js';

function byId(id) {
    return document.getElementById(id);
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
            button(UI.edit, 'ws-btn ws-btn-small', () => on.editTask(item.id), { 'aria-describedby': nameId, 'data-beacon': 'edit-task:checklist' }),
            button(UI.remove, 'ws-btn ws-btn-small ws-btn-quiet', () => on.removeTask(item.id), { 'aria-describedby': nameId, 'data-beacon': 'remove-task:checklist' })
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
                        button(UI.addTask, 'ws-btn ws-btn-small ws-btn-primary', () => on.addTask(room.id), { 'aria-describedby': roomId, 'data-beacon': 'add-task:checklist' }),
                        button(UI.editRoom, 'ws-btn ws-btn-small', () => on.editRoom(room.id), { 'aria-describedby': roomId, 'data-beacon': 'edit-room:checklist' })
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
            button(UI.remove, 'ws-btn ws-btn-small', () => on.remove(p.id), { 'aria-label': UI.removePhoto(i + 1), title: UI.removePhoto(i + 1), 'data-beacon': 'remove-photo:task' })
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
    drawQuotePrefs(checklist);
}

/** The care preferences on the quote (QA, 2026-10-15: part of what the
 *  customer agrees to, though they change no price), read-only: Maya's
 *  Review is where they change. Hidden when there are none. */
function drawQuotePrefs(checklist) {
    const box = byId('quote-prefs');
    const list = byId('quote-prefs-list');
    const note = byId('quote-prefs-note');
    if (!box || !list || !note) return;
    const p = preferenceLines(checklist.serviceType, checklist.preferences);
    clear(list);
    for (const line of p.lines) list.appendChild(h('li', { text: line }));
    list.hidden = !p.lines.length;
    note.textContent = p.note;
    note.hidden = !p.note;
    box.hidden = !p.lines.length && !p.note;
}

/**
 * A visit's report in its card (M5 piece 3, PRD 12.4): when, who and how
 * long, then the bill first, what was skipped and why, what was not
 * reached, what became of the add-ons, and the cleaner's note. `visit` as
 * store.js keeps it, `form` the published checklist its names come from
 * (the customer's own when the published one is not to hand), `sheet` for
 * the amounts, `photos` the cleaner's proof photos as `{ itemId, url }` (M5
 * piece 4). Nothing to book from here (QA, 2026-10-15).
 */
export function renderVisitReport({ visit, form, sheet, photos = [] }) {
    const r = visit.report;
    const when = byId('visit-report-when');
    if (when) {
        when.textContent = [
            r.booking ? REPORT.visitOn(dayLabel(r.booking.date)) : '',
            r.cleaner ? REPORT.cleanedBy(r.cleaner) : '',
            r.minutesOnSite ? REPORT.onSite(r.minutesOnSite) : ''
        ].filter(Boolean).join(' ');
    }
    const body = byId('visit-report-body');
    if (!body) return;
    clear(body);
    const money = billLines(visit.bill);
    const lines = reportLines(sheet, form, r);
    const counts = reportCounts(r);
    const list = (id, heading, rows, row) => (rows.length ? h('section', { className: 'visit-report-list', id, attrs: { 'aria-labelledby': `${id}-title` } }, [
        h('h3', { id: `${id}-title`, className: 'quote-prefs-title', text: heading }),
        h('ul', {}, rows.map(row))
    ]) : null);
    const parts = [
        h('section', { className: 'visit-report-bill', attrs: { 'aria-labelledby': 'visit-report-bill-title' } }, [
            h('h3', { id: 'visit-report-bill-title', className: 'quote-prefs-title', text: REPORT.billHeading }),
            h('p', { className: 'quote-total', id: 'visit-report-billed', text: money.line }),
            money.parts.length ? h('ul', { className: 'visit-report-parts' }, money.parts.map((p) => h('li', { text: p }))) : null
        ]),
        h('p', { className: 'card-meta', id: 'visit-report-counts', text: REPORT.counts(counts.done, counts.skipped, counts.notReached) }),
        list('visit-report-skipped', REPORT.skippedHeading, lines.skipped, (t) => h('li', { className: 'quote-line' }, [
            h('span', { text: t.why ? `${t.label} (${t.why})` : t.label }),
            h('span', { text: t.off })
        ])),
        list('visit-report-not-reached', REPORT.notReachedHeading, lines.notReached, (t) => h('li', { className: 'quote-line' }, [
            h('span', { text: t.label }),
            h('span', { text: t.off })
        ])),
        list('visit-report-addons', REPORT.addOnsHeading, lines.addOns, (a) => h('li', { className: 'quote-line' }, [
            h('span', { text: `${a.label} (${a.outcome})` }),
            h('span', { text: a.money })
        ])),
        photos.length ? h('section', { className: 'visit-report-photos', attrs: { 'aria-labelledby': 'visit-report-photos-title' } }, [
            h('h3', { id: 'visit-report-photos-title', className: 'quote-prefs-title', text: REPORT.photosHeading }),
            h('ul', {}, photos.map((p) => {
                const item = ((form && form.items) || []).find((i) => i.id === p.itemId);
                const t = item && sheet ? taskOf(sheet, item.task) : null;
                const label = REPORT.photoOf(t ? t.name : (item ? item.task : REPORT.removedSince));
                return h('li', {}, [h('figure', {}, [h('img', { src: p.url, alt: label }), h('figcaption', { text: label })])]);
            }))
        ]) : null,
        r.note ? h('section', { className: 'visit-report-note', attrs: { 'aria-labelledby': 'visit-report-note-title' } }, [
            h('h3', { id: 'visit-report-note-title', className: 'quote-prefs-title', text: REPORT.noteHeading }),
            h('p', { className: 'quote-prefs-note', text: r.note })
        ]) : null
    ];
    parts.filter(Boolean).forEach((p) => body.appendChild(p));
}

/**
 * The add-ons card (QA, 2026-10-15): every add-on of the visit under way,
 * the ones waiting first, each with Approve and Decline in place, then the
 * ones answered and what they add. `rows` as main.js names and prices them
 * (`{ id, name, room, money, time, cents, words, status }`, the oldest
 * first), `busy` while an answer is on its way (the buttons wait), and
 * `on.approve(id)` / `on.decline(id)`.
 */
export function renderAddOnList({ rows, busy = false, on = {} }) {
    const waiting = rows.filter((r) => r.status === 'waiting');
    const answered = rows.filter((r) => r.status !== 'waiting');
    const lead = byId('addons-lead');
    if (lead) lead.textContent = waiting.length ? ADDON_LIST.leadWaiting(waiting.length) : (rows.length ? ADDON_LIST.leadAnswered : ADDON_LIST.leadNone);
    const body = byId('addons-body');
    if (!body) return;
    clear(body);
    const top = (r) => [
        h('div', { className: 'quote-line addon-line' }, [
            h('span', { className: 'addon-name', text: r.name }),
            h('span', { text: r.money || ADDON_LIST.noPrice })
        ]),
        h('p', { className: 'addon-meta', text: ADDON_LIST.meta(r.room, r.time) })
    ];
    const section = (id, heading, list, row) => (list.length ? h('section', { className: 'addon-section', id, attrs: { 'aria-labelledby': `${id}-title` } }, [
        h('h3', { id: `${id}-title`, className: 'quote-prefs-title', text: heading }),
        h('ul', { className: 'addon-list' }, list.map(row))
    ]) : null);
    const approved = answered.filter((r) => r.status === 'approved' && r.cents);
    const sum = approved.reduce((n, r) => n + r.cents, 0);
    const parts = [
        section('addons-waiting', ADDON_LIST.waitingHeading, waiting, (r) => h('li', { className: 'addon-row addon-row-waiting' }, [
            ...top(r),
            r.words ? h('p', { className: 'addon-words', text: `“${r.words}”` }) : null,
            h('div', { className: 'addon-actions' }, [
                h('button', { type: 'button', id: `addon-approve-${r.id}`, className: 'ws-btn ws-btn-small ws-btn-primary', disabled: busy, text: ADDON_LIST.approve, onClick: () => on.approve && on.approve(r.id), attrs: { 'aria-label': ADDON_LIST.approveLabel(r.name), title: ADDON_LIST.approveLabel(r.name) } }),
                h('button', { type: 'button', id: `addon-decline-${r.id}`, className: 'ws-btn ws-btn-small', disabled: busy, text: ADDON_LIST.decline, onClick: () => on.decline && on.decline(r.id), attrs: { 'aria-label': ADDON_LIST.declineLabel(r.name), title: ADDON_LIST.declineLabel(r.name) } })
            ])
        ])),
        section('addons-answered', ADDON_LIST.answeredHeading, answered, (r) => h('li', { className: `addon-row addon-row-${r.status}` }, [
            ...top(r),
            h('p', { className: `addon-status addon-status-${r.status}`, text: ADDON_LIST.status[r.status] || r.status })
        ])),
        sum ? h('p', { className: 'addon-sum', id: 'addons-sum', text: ADDON_LIST.approvedSum(formatMoney(sum)) }) : null
    ];
    parts.filter(Boolean).forEach((p) => body.appendChild(p));
}
