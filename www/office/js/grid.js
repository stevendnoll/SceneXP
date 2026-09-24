// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * grid.js - The computer on the desk: every application in a table.
 *
 * THE GRID IS THE OFFICE'S COMPLETE KEYBOARD PATH. Everything the room shows
 * is a row here, every row opens its folder, and every change a folder can
 * make can be reached from it. It is a real <table> with header buttons that
 * report `aria-sort`, so a screen reader can navigate it as a table.
 *
 * It draws what query.js answers and nothing else, so the row count, the
 * chips' counts and (from M3) the folders lifted out of the cabinet always
 * agree.
 *
 * On a phone the same table lays out as a list of cards (experience.css),
 * each cell carrying its column name in `data-label`.
 */

import { h, button, clear } from './cards.min.js';
import { STATUS_LABELS, WORK_MODE_LABELS, EVENT_LABELS, SORT_LABELS, matchNote } from './labels.min.js';
import { displayDate, parseLocal, daysBetween } from './dates.min.js';

/** The columns: header text, the sort key a header button sets (or none). */
export const COLUMNS = [
    { key: 'company', label: 'Company', sort: 'company' },
    { key: 'role', label: 'Role', sort: null },
    { key: 'status', label: 'Status', sort: 'status' },
    { key: 'applied', label: 'Applied', sort: 'applied' },
    { key: 'next', label: 'Next up', sort: null },
    { key: 'salary', label: 'Salary', sort: 'salary' },
    { key: 'activity', label: 'Last activity', sort: 'activity' }
];

function byId(id) {
    return document.getElementById(id);
}

/** The handlers of the latest draw. The header buttons are wired once, in
 *  initGrid, and call through this. */
let current = null;

// ---- Words for cells ----------------------------------------------------------

/** "Today", "Yesterday", "3 days ago", or a date for anything older than a
 *  week, or '' for no date. Future moments say "Coming up". */
export function activityText(date, now) {
    if (!date) return '';
    const days = daysBetween(date, now);
    if (days < 0) return 'Coming up';
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

/** "$135k to $160k", "$55 to $70 an hour", or ''. */
export function compactSalary(app) {
    const { salaryMin: min, salaryMax: max } = app;
    if (min == null && max == null) return '';
    const sign = app.salaryCurrency === 'USD' ? '$' : `${app.salaryCurrency} `;
    const k = (n) => (n >= 1000 ? `${sign}${Math.round(n / 1000)}k` : `${sign}${n}`);
    const per = app.salaryPeriod === 'hour' ? ' an hour' : '';
    if (min != null && max != null && min !== max) return `${k(min)} to ${k(max)}${per}`;
    return `${k(min ?? max)}${per}`;
}

/** "Interview, Sep 26, 2:00 PM", or ''. */
export function nextText(ev) {
    if (!ev) return '';
    const d = parseLocal(ev.at);
    const when = d ? new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(d) : '';
    return `${EVENT_LABELS[ev.type]}, ${when}`;
}

/** "Showing 12 of 31 applications." */
export function countText(shown, total) {
    if (!total) return 'No applications yet.';
    const noun = total === 1 ? 'application' : 'applications';
    return shown === total ? `Showing all ${total} ${noun}.` : `Showing ${shown} of ${total} ${noun}.`;
}

/** Whether a query narrows anything, so the Clear button knows to show. */
export function isFiltered(q) {
    return Boolean(q.text.trim()) || q.statuses.length > 0 || q.workModes.length > 0
        || q.upcoming || q.origin !== 'all' || Boolean(q.appliedFrom) || Boolean(q.appliedTo);
}

// ---- Drawing ----------------------------------------------------------------

function chip(label, count, pressed, onClick, extra = '') {
    return h('button', {
        type: 'button',
        className: `grid-chip${pressed ? ' is-on' : ''}${extra}`,
        attrs: { 'aria-pressed': pressed ? 'true' : 'false' },
        onClick
    }, [label, h('span', { className: 'grid-chip-count', text: String(count) })]);
}

/** Draw the filter chips into a container: the grid's, or the cabinet's. */
export function renderChips(boxId, q, facets, config, on) {
    const box = byId(boxId);
    if (!box) return;
    clear(box);
    for (const s of [...config.statuses, 'ghosted']) {
        const n = facets.byStatus[s];
        const pressed = q.statuses.includes(s);
        if (!n && !pressed) continue;
        box.appendChild(chip(STATUS_LABELS[s], n, pressed, () => on.toggleStatus(s), ` status-${s}`));
    }
    for (const m of config.workModes) {
        const n = facets.byWorkMode[m];
        const pressed = q.workModes.includes(m);
        if (m === 'unknown' || (!n && !pressed)) continue;
        box.appendChild(chip(WORK_MODE_LABELS[m], n, pressed, () => on.toggleWorkMode(m)));
    }
    if (facets.upcoming || q.upcoming) {
        box.appendChild(chip('Something coming up', facets.upcoming, q.upcoming, () => on.toggleUpcoming()));
    }
    if (facets.sample) {
        box.appendChild(chip('Samples', facets.sample, q.origin === 'sample', () => on.origin('sample')));
        box.appendChild(chip('Mine', facets.total - facets.sample, q.origin === 'mine', () => on.origin('mine')));
    }
}

function drawHeaders(q) {
    for (const col of COLUMNS) {
        const th = byId(`grid-h-${col.key}`);
        if (!th || !col.sort) continue;
        const active = q.sortKey === col.sort;
        th.setAttribute('aria-sort', active ? (q.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
        const btn = byId(`grid-sort-${col.key}`);
        if (btn) btn.className = `grid-sort${active ? ` is-${q.sortDir}` : ''}`;
    }
    const select = byId('grid-sort');
    if (select && select.value !== q.sortKey) select.value = q.sortKey;
    const dir = byId('grid-dir');
    if (dir) {
        dir.textContent = q.sortDir === 'asc' ? '↑' : '↓';
        dir.setAttribute('aria-label', `Reverse the order, now ${q.sortDir === 'asc' ? 'ascending' : 'descending'}`);
        dir.title = 'Reverse the order';
    }
}

function cell(col, children, className = '') {
    return h('td', { className: `grid-cell grid-${col}${className}`, dataset: { label: COLUMNS.find((c) => c.key === col).label } }, children);
}

function drawRows(rows, now, on) {
    const body = byId('grid-body');
    if (!body) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const focusedId = active && active.dataset && active.dataset.gridId ? active.dataset.gridId : null;
    clear(body);
    let refocus = null;
    for (const row of rows) {
        const { app } = row;
        const open = h('button', {
            type: 'button',
            className: 'grid-open',
            dataset: { gridId: app.id },
            onClick: () => on.open(app.id)
        }, app.company || app.role);
        if (app.id === focusedId) refocus = open;
        const note = matchNote(row.matches);
        const tr = h('tr', { className: `grid-row status-${row.status}` }, [
            cell('company', [open, app.sample ? h('span', { className: 'grid-sample', text: 'Sample' }) : null]),
            cell('role', [app.company ? app.role : '', note ? h('span', { className: 'grid-match', text: note }) : null]),
            cell('status', h('span', { className: `status-badge status-${row.status}`, text: STATUS_LABELS[row.status] })),
            cell('applied', app.appliedOn ? displayDate(app.appliedOn) : ''),
            cell('next', nextText(row.next)),
            cell('salary', compactSalary(app)),
            cell('activity', activityText(row.lastActivity, now))
        ]);
        body.appendChild(tr);
    }
    if (refocus && typeof refocus.focus === 'function') refocus.focus({ preventScroll: true });
}

function drawEmpty(result, q, on) {
    const box = byId('grid-empty');
    const text = byId('grid-empty-text');
    const actions = byId('grid-empty-actions');
    const table = byId('grid-table');
    const empty = result.shown === 0;
    if (box) box.hidden = !empty;
    if (table) table.hidden = empty;
    if (!empty || !text || !actions) return;
    clear(actions);
    if (result.total === 0) {
        text.textContent = 'Your office is empty. Add your first application, or stock the office with samples to look around.';
        actions.appendChild(button('Add your first application', 'office-btn office-btn-primary', on.create));
        if (on.stock) actions.appendChild(button('Stock the office with samples', 'office-btn', on.stock));
    } else {
        text.textContent = isFiltered(q) ? 'Nothing matches that search.' : 'Nothing to show.';
        actions.appendChild(button('Clear the search and filters', 'office-btn', on.clearFilters));
    }
}

/**
 * Draw the whole grid from a query result. `on` holds the handlers: open,
 * sort, toggleStatus, toggleWorkMode, toggleUpcoming, origin, clearFilters,
 * create, and stock (omitted when samples are already in).
 */
export function renderGrid({ result, facets, week, goal, config, now, on }) {
    current = on;
    const q = result.query;
    const count = byId('grid-count');
    if (count) count.textContent = countText(result.shown, result.total);
    const weekEl = byId('grid-week');
    if (weekEl) {
        weekEl.textContent = `${week.count} sent this week${week.met ? '. Goal met, well done.' : '.'}`;
    }
    const goalEl = byId('grid-goal');
    if (goalEl && typeof document !== 'undefined' && document.activeElement !== goalEl) goalEl.value = String(goal);
    const search = byId('grid-search');
    if (search && search.value !== q.text && document.activeElement !== search) search.value = q.text;
    const clearBtn = byId('grid-clear');
    if (clearBtn) clearBtn.hidden = !isFiltered(q);
    renderChips('grid-filters', q, { ...facets, total: result.total }, config, on);
    drawHeaders(q);
    drawRows(result.rows, now, on);
    drawEmpty(result, q, on);
}

/** Fill the sort select once, from the labels. */
export function initGrid(config, { signal, onSortKey, onReverse }) {
    const select = byId('grid-sort');
    if (select) {
        clear(select);
        for (const key of Object.keys(config.sortKeys)) select.appendChild(h('option', { value: key, text: SORT_LABELS[key] }));
        select.addEventListener('change', () => onSortKey(select.value), { signal });
    }
    const dir = byId('grid-dir');
    if (dir) dir.addEventListener('click', onReverse, { signal });
    for (const col of COLUMNS) {
        const btn = col.sort && byId(`grid-sort-${col.key}`);
        if (btn) btn.addEventListener('click', () => { if (current) current.sort(col.sort); }, { signal });
    }
    // Up and Down move between rows, so a long table is not forty Tab presses.
    const body = byId('grid-body');
    if (body) {
        body.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const target = event.target;
            if (!target || !target.dataset || !target.dataset.gridId) return;
            const buttons = [];
            for (const tr of body.children) {
                const first = tr.children && tr.children[0] && tr.children[0].children[0];
                if (first) buttons.push(first);
            }
            const i = buttons.indexOf(target);
            const next = buttons[i + (event.key === 'ArrowDown' ? 1 : -1)];
            if (next) {
                event.preventDefault();
                next.focus();
            }
        }, { signal });
    }
}
