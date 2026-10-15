// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * panel.js - The panel beside the house (PLANNING 4.4, ONBOARDING section 4):
 * whatever is selected on the house, in words, with what can be done to it.
 *
 * THE HOUSE IS THE INTERFACE, AND THE PANEL HOLDS THE WORDS. A tap on a
 * floor opens it and lists its rooms, with the rooms a floor like it usually
 * has offered as chips, each added with its standard tasks in one tap. A
 * tap on a room lists its tasks, each with its price and a star, and a
 * bathroom's type of bath (Full, Shower, Half) to switch in one tap. A tap on a
 * task's dot shows that task, to edit, star or remove. Escape, the panel's
 * back button, or a tap on empty space goes one step back: task to room,
 * room to floor, floor to the closed house.
 *
 * NOTHING ONLY A POINTER CAN DO. The Rooms chip, top left, opens the panel
 * on the whole house, its floors listed, so a keyboard reaches every floor,
 * room and task through real buttons, and the arrow keys move through each
 * list. The cards stay as the forms the panel opens to edit.
 *
 * It sits where Maya's bubble sits (beside her on a wide screen, a sheet
 * along the bottom on a phone), and she steps aside while it is open.
 *
 * `selectFromHit`, `stepOut`, `suggestions` and `panelView` are pure.
 * `createPanel` draws a view into index.html's #ws-panel and calls back into
 * main.js for what its buttons do. No markup from strings.
 */

import { h, clear } from './cards.min.js';
import { PANEL } from './copy.min.js';
import { roomName, levelOf, bathChoices, bathChoiceOf, residenceLine } from './taxonomy.min.js';
import { priceChoice, formatMoney, formatMinutes, roundMinutes } from './pricing.min.js';
import { taskName, choiceText } from './panels.min.js';
import { hasUnsent } from './store.min.js';

// ---- What is selected (pure) -----------------------------------------------------

/**
 * The selection after a tap that met the house (`hit` is model.js hitOf's
 * `{ level, roomId, itemId }`), with `lifted` the floor open now. Inside the
 * open floor a dot selects its task and anything else in a room its room;
 * anywhere else the tap selects the floor it met. Null when the tap met
 * nothing of the house.
 */
export function selectFromHit(hit, lifted) {
    if (!hit || !hit.level) return null;
    const open = hit.level === lifted;
    if (open && hit.itemId && hit.roomId) return { scope: 'task', level: hit.level, roomId: hit.roomId, itemId: hit.itemId };
    if (open && hit.roomId) return { scope: 'room', level: hit.level, roomId: hit.roomId, itemId: null };
    return { scope: 'floor', level: hit.level, roomId: null, itemId: null };
}

/** One step back: a task to its room, a room to its floor, a floor (or the
 *  whole house) to nothing. */
export function stepOut(sel) {
    if (!sel) return null;
    if (sel.scope === 'task') return { ...sel, scope: 'room', itemId: null };
    if (sel.scope === 'room') return { ...sel, scope: 'floor', roomId: null, itemId: null };
    return null;
}

/**
 * The selection as it can still be, once the checklist has changed (a room
 * removed, an undo): the deepest part of it that still exists, or null.
 */
export function reconcile(sel, checklist) {
    if (!sel || !checklist) return null;
    if (sel.scope === 'house') return sel;
    if (!checklist.levels.includes(sel.level)) return null;
    const room = sel.roomId ? (checklist.rooms || []).find((r) => r.id === sel.roomId && !r.deletedAt) : null;
    if (sel.roomId && (!room || room.level !== sel.level)) return { scope: 'floor', level: sel.level, roomId: null, itemId: null };
    const item = sel.itemId ? (checklist.items || []).find((i) => i.id === sel.itemId && !i.deletedAt) : null;
    if (sel.itemId && (!item || item.roomId !== sel.roomId)) return { ...sel, scope: 'room', itemId: null };
    return sel;
}

/**
 * The rooms a floor like this usually has, offered as chips: the common
 * kinds only, in the order most homes add them (QA, 2026-10-14: a mudroom
 * is not as common as a living room). Every other kind is one tap away
 * under Another kind of room. A kind there is one of in a home (a kitchen,
 * a primary bedroom) is not offered again once the home has it. At most
 * `max`.
 */
export const CHIPS = Object.freeze({
    basement: Object.freeze(['family', 'bedroom', 'bathroom', 'laundry']),
    main: Object.freeze(['kitchen', 'living', 'dining', 'powder-room', 'office', 'laundry']),
    second: Object.freeze(['primary-bedroom', 'primary-bathroom', 'bedroom', 'bathroom', 'laundry']),
    third: Object.freeze(['bedroom', 'bathroom', 'office']),
    attic: Object.freeze(['bonus', 'bedroom']),
    garage: Object.freeze(['garage']),
    'detached-garage': Object.freeze(['garage'])
});

/**
 * The rooms most homes have, most common first, each with the floors it
 * usually goes on, best first (Maya's chips, QA 2026-10-14). A home with
 * none of those floors puts it on its main floor (or its first).
 */
export const COMMON = Object.freeze([
    ['kitchen', ['main']],
    ['living', ['main']],
    ['primary-bedroom', ['second', 'main', 'third']],
    ['primary-bathroom', ['second', 'main', 'third']],
    ['bedroom', ['second', 'third', 'main', 'basement']],
    ['bathroom', ['second', 'main', 'basement', 'third']],
    ['dining', ['main']],
    ['powder-room', ['main']],
    ['laundry', ['main', 'second', 'basement']],
    ['office', ['main', 'second', 'third']],
    ['family', ['basement', 'main']],
    ['garage', ['garage', 'detached-garage']]
].map(([area, floors]) => Object.freeze({ area, floors: Object.freeze(floors) })));
const ONE_PER_HOME = new Set(['kitchen', 'primary-bedroom', 'primary-bathroom', 'entry', 'mudroom', 'laundry', 'dining', 'living']);
const ONE_PER_FLOOR = new Set(['garage', 'hallway', 'family', 'gym', 'bonus']);

/**
 * The common rooms the whole home is offered (Maya's chips): `[{ area,
 * level }]`, each on the first of its usual floors the home has (a garage
 * only where there is one), none of a kind the home has its one of, at
 * most `max`.
 */
export function homeSuggestions(checklist, max = 6) {
    const levels = checklist.levels || [];
    const rooms = (checklist.rooms || []).filter((r) => !r.deletedAt);
    const fallback = levels.includes('main') ? 'main' : levels.find((l) => l !== 'garage' && l !== 'detached-garage') || levels[0];
    const out = [];
    for (const { area, floors } of COMMON) {
        if (ONE_PER_HOME.has(area) && rooms.some((r) => r.area === area)) continue;
        const level = floors.find((f) => levels.includes(f)) || (area === 'garage' ? null : fallback);
        if (!level) continue;
        if (ONE_PER_FLOOR.has(area) && rooms.some((r) => r.area === area && r.level === level)) continue;
        out.push({ area, level });
        if (out.length >= max) break;
    }
    return out;
}

export function suggestions(level, checklist, max = 6) {
    const rooms = (checklist.rooms || []).filter((r) => !r.deletedAt);
    return (CHIPS[level] || ['bedroom', 'bathroom', 'closet'])
        .filter((area) => !(ONE_PER_HOME.has(area) && rooms.some((r) => r.area === area)))
        .filter((area) => !(ONE_PER_FLOOR.has(area) && rooms.some((r) => r.area === area && r.level === level)))
        .slice(0, max);
}

// ---- What the panel says (pure) -----------------------------------------------------

/** A room's or a floor's tasks priced together: cents, minutes, count.
 *  `cents` is null without a sheet. */
function priced(sheet, items, areaOf) {
    let cents = sheet ? 0 : null;
    let minutes = 0;
    for (const item of items) {
        if (!sheet) continue;
        const p = priceChoice(sheet, item, areaOf(item));
        if (p.error) continue;
        cents += p.cents;
        minutes += p.minutes;
    }
    return { cents, minutes, count: items.length };
}

const live = (list) => (list || []).filter((x) => !x.deletedAt);

/** "9 tasks, $61", or "9 tasks" without a sheet. */
function tasksLine(p, withTime = false) {
    const parts = [PANEL.tasks(p.count)];
    if (p.cents !== null && p.count) parts.push(formatMoney(p.cents));
    if (withTime && p.cents !== null && p.minutes) parts.push(PANEL.about(formatMinutes(roundMinutes(p.minutes))));
    return parts.join(', ');
}

/** What a room is called after "Back to": "the kitchen", or its own name. */
function backName(type, room) {
    return room.label ? room.label : `the ${roomName(type, room).toLowerCase()}`;
}

/**
 * The whole house's buttons (M3): changes not sent yet come first; then a
 * booked visit's receipt; a published checklist with no visit, Choose a
 * time and its link; a priced draft of the visitor's own, Choose a time.
 */
function houseActions(checklist, items, b) {
    const pub = checklist.published && checklist.published.at;
    const rest = [b('checklist', PANEL.checklist), b('home', PANEL.home)];
    if (pub) {
        const visit = b('visit', checklist.booking ? PANEL.visit : PANEL.link);
        if (hasUnsent(checklist)) return [b('send', PANEL.send, true), visit, ...rest];
        if (checklist.booking) return [{ ...visit, primary: true }, ...rest];
        return [b('book', PANEL.book, true), visit, ...rest];
    }
    if (!checklist.sample && items.length) return [b('book', PANEL.book, true), ...rest];
    return [b('checklist', PANEL.checklist, true), b('home', PANEL.home)];
}

/**
 * What the panel shows for a selection: `{ scope, title, back, summary,
 * baths, heading, rows, empty, chips, actions, detail }`. `rows` are `{ kind,
 * id, label, detail, starred }` (floors, rooms, or tasks), `baths` a
 * bathroom's types of bath (`{ key, label, pressed }`, else null), `chips`
 * the kinds of room to add (`{ area, label, aria }`), `actions` the buttons
 * under the list (`{ id, label, primary }`), and `detail` a task's lines.
 * Null when nothing is selected or there is no checklist.
 */
export function panelView(sel, checklist, sheet) {
    if (!sel || !checklist) return null;
    const type = checklist.serviceType;
    const rooms = live(checklist.rooms);
    const items = live(checklist.items);
    const roomOf = (id) => rooms.find((r) => r.id === id) || null;
    const areaOf = (item) => (roomOf(item.roomId) || {}).area;
    const ordered = (roomId) => items.filter((i) => i.roomId === roomId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const b = (id, label, primary = false) => ({ id, label, primary });

    if (sel.scope === 'house') {
        const rows = checklist.levels.map((key) => {
            const here = rooms.filter((r) => r.level === key);
            return { kind: 'floor', id: key, label: (levelOf(type, key) || { name: key }).name, detail: PANEL.rooms(here.length) };
        });
        // The kind of home first ("A townhome, end unit."), which Your home
        // below can change.
        const kind = residenceLine(type, checklist.residence);
        const counts = [PANEL.rooms(rooms.length), tasksLine(priced(sheet, items, areaOf))].join(', ');
        return {
            scope: 'house', title: checklist.title, back: PANEL.close, heading: PANEL.floorsHeading,
            summary: kind ? `${kind}. ${counts}` : counts,
            rows, empty: null, baths: null, chips: null, detail: null,
            actions: houseActions(checklist, items, b)
        };
    }
    const level = levelOf(type, sel.level) || { name: sel.level };
    if (sel.scope === 'floor') {
        const here = rooms.filter((r) => r.level === sel.level);
        const rows = here.map((r) => ({ kind: 'room', id: r.id, label: roomName(type, r), detail: tasksLine(priced(sheet, ordered(r.id), areaOf)) }));
        const onFloor = items.filter((i) => here.some((r) => r.id === i.roomId));
        const chips = suggestions(sel.level, checklist).map((area) => {
            const name = roomName(type, { area, label: '' });
            return { area, label: name, aria: PANEL.chipLabel(name) };
        });
        return {
            scope: 'floor', title: level.name, back: PANEL.back(PANEL.wholeHouse), heading: PANEL.roomsHeading,
            summary: [PANEL.rooms(here.length), tasksLine(priced(sheet, onFloor, areaOf))].join(', '),
            rows, empty: rows.length ? null : PANEL.noRooms, baths: null, chips, detail: null,
            actions: [b('anotherRoom', PANEL.anotherRoom)]
        };
    }
    const room = roomOf(sel.roomId);
    if (!room) return null;
    const tasks = ordered(room.id);
    if (sel.scope === 'room') {
        const rows = tasks.map((i) => {
            const p = sheet ? priceChoice(sheet, i, room.area) : null;
            return {
                kind: 'task', id: i.id, label: taskName(sheet, i), starred: Boolean(i.important),
                detail: p && !p.error ? formatMoney(p.cents) : ''
            };
        });
        const now = bathChoiceOf(type, room);
        const baths = bathChoices(type, room.area).map((c) => ({ key: c.key, label: c.name, pressed: c.key === now }));
        return {
            scope: 'room', title: roomName(type, room), back: PANEL.back(`the ${level.name.toLowerCase()}`), heading: PANEL.tasksHeading,
            summary: tasksLine(priced(sheet, tasks, () => room.area), true),
            baths: baths.length ? baths : null,
            rows, empty: rows.length ? null : PANEL.noTasks, chips: null, detail: null,
            actions: [b('addTask', PANEL.addTask, true), b('editRoom', PANEL.editRoom)]
        };
    }
    const item = tasks.find((i) => i.id === sel.itemId);
    if (!item) return null;
    const p = sheet ? priceChoice(sheet, item, room.area) : null;
    const detail = [];
    const chosen = choiceText(sheet, item);
    if (chosen) detail.push(chosen);
    if (item.notes) detail.push(PANEL.notes(item.notes));
    if (item.avoid) detail.push(PANEL.avoid(item.avoid));
    return {
        scope: 'task', title: taskName(sheet, item), back: PANEL.back(backName(type, room)), heading: null,
        summary: p && !p.error ? [formatMoney(p.cents), PANEL.about(formatMinutes(roundMinutes(p.minutes)))].join(', ') : '',
        rows: [], empty: null, baths: null, chips: null, detail, starred: Boolean(item.important),
        actions: [
            b('editTask', PANEL.editTask, true),
            b('starTask', item.important ? PANEL.unstar : PANEL.star),
            b('removeTask', PANEL.removeTask)
        ]
    };
}

// ---- Drawing it ------------------------------------------------------------------------

/**
 * Drive the panel in index.html. `on` holds back(), row(kind, id),
 * star(itemId), bath(key), chip(area) and action(id). Returns { show, hide, shown,
 * view, contains, focusFirst, anchor }.
 */
export function createPanel({ on = {}, signal } = {}) {
    const byId = (id) => document.getElementById(id);
    const root = byId('ws-panel');
    const backBtn = byId('panel-back');
    const title = byId('panel-title');
    const summary = byId('panel-summary');
    const heading = byId('panel-heading');
    const list = byId('panel-list');
    const empty = byId('panel-empty');
    const detail = byId('panel-detail');
    const chips = byId('panel-chips');
    const baths = byId('panel-baths');
    const bathList = byId('panel-baths-list');
    const bathLabel = byId('panel-baths-label');
    const actions = byId('panel-actions');
    let view = null;
    let rows = [];
    let bathButtons = [];
    let anchored = '';
    const call = (name, ...args) => { if (typeof on[name] === 'function') on[name](...args); };

    if (backBtn) backBtn.addEventListener('click', () => call('back'), { signal });
    // The arrow keys move through the list's rows (ONBOARDING section 10).
    if (list) {
        list.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const at = rows.indexOf(document.activeElement);
            if (at < 0) return;
            const next = rows[Math.min(rows.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
            if (event.preventDefault) event.preventDefault();
            if (next && typeof next.focus === 'function') next.focus();
        }, { signal });
    }

    function draw() {
        if (title) title.textContent = view.title;
        if (backBtn) backBtn.textContent = view.back;
        if (summary) {
            summary.textContent = view.summary || '';
            summary.hidden = !view.summary;
        }
        if (baths) {
            const kinds = view.baths || [];
            baths.hidden = !kinds.length;
            if (bathLabel) bathLabel.textContent = PANEL.bathHeading;
            bathButtons = [];
            if (bathList) {
                clear(bathList);
                for (const k of kinds) {
                    const btn = h('button', {
                        type: 'button',
                        className: `panel-bath${k.pressed ? ' is-on' : ''}`,
                        id: `panel-bath-${k.key}`,
                        text: k.label,
                        attrs: { 'aria-pressed': k.pressed ? 'true' : 'false' }
                    });
                    btn.addEventListener('click', () => call('bath', k.key), { signal });
                    bathButtons.push(btn);
                    bathList.appendChild(btn);
                }
            }
        }
        if (heading) {
            heading.textContent = view.heading || '';
            heading.hidden = !view.heading || !view.rows.length;
        }
        rows = [];
        if (list) {
            clear(list);
            list.hidden = !view.rows.length;
            for (const r of view.rows) {
                const main = h('button', { type: 'button', className: 'panel-row', id: `panel-${r.kind}-${r.id}` }, [
                    h('span', { className: 'panel-row-label', text: r.label }),
                    r.detail ? h('span', { className: 'panel-row-detail', text: r.detail }) : null
                ]);
                main.addEventListener('click', () => call('row', r.kind, r.id), { signal });
                rows.push(main);
                const parts = [main];
                if (r.kind === 'task') {
                    const star = h('button', {
                        type: 'button',
                        className: `panel-star${r.starred ? ' is-on' : ''}`,
                        id: `panel-star-${r.id}`,
                        text: r.starred ? '★' : '☆',
                        attrs: { 'aria-pressed': r.starred ? 'true' : 'false', 'aria-label': PANEL.starLabel(r.label), title: PANEL.starLabel(r.label) }
                    });
                    star.addEventListener('click', () => call('star', r.id), { signal });
                    parts.push(star);
                }
                list.appendChild(h('li', { className: 'panel-item' }, parts));
            }
        }
        if (empty) {
            empty.textContent = view.empty || '';
            empty.hidden = !view.empty;
        }
        if (detail) {
            clear(detail);
            const lines = view.detail || [];
            detail.hidden = !lines.length;
            for (const line of lines) detail.appendChild(h('p', { className: 'panel-detail-line', text: line }));
        }
        if (chips) {
            clear(chips);
            const list2 = view.chips || [];
            chips.hidden = !list2.length;
            if (list2.length) {
                chips.appendChild(h('p', { className: 'panel-chips-heading', text: PANEL.addRoom }));
                for (const c of list2) {
                    const chip = h('button', { type: 'button', className: 'panel-chip', id: `panel-chip-${c.area}`, text: `+ ${c.label}`, attrs: { 'aria-label': c.aria, title: c.aria } });
                    chip.addEventListener('click', () => call('chip', c.area), { signal });
                    chips.appendChild(chip);
                }
            }
        }
        if (actions) {
            clear(actions);
            for (const a of view.actions || []) {
                const btn = h('button', { type: 'button', id: `panel-${a.id}`, className: a.primary ? 'ws-btn ws-btn-primary' : 'ws-btn', text: a.label });
                btn.addEventListener('click', () => call('action', a.id), { signal });
                actions.appendChild(btn);
            }
        }
    }

    const api = {
        /** Draw a view, or put the panel away for null. */
        show(next) {
            view = next;
            if (view) draw();
            if (root) root.hidden = !view;
        },
        hide() {
            api.show(null);
        },
        get shown() {
            return Boolean(view);
        },
        get view() {
            return view;
        },
        /** Whether a node is inside the panel (its keys are its own). */
        contains(node) {
            return Boolean(root && node && typeof root.contains === 'function' && root.contains(node));
        },
        /** Focus on the first row, else the first action, else the back
         *  button: where a keyboard picks up after a step. */
        focusFirst() {
            const first = rows[0] || (actions && Array.from(actions.children || [])[0]) || backBtn;
            if (first && typeof first.focus === 'function') first.focus();
            return first || null;
        },
        /** Focus on a type of bath by key, once the panel is drawn again
         *  after the change, so a keyboard stays where it was. */
        focusBath(key) {
            const btn = bathButtons.find((b) => b.id === `panel-bath-${key}`);
            if (btn && typeof btn.focus === 'function') btn.focus();
            return btn || null;
        },
        /** Beside Maya's head on a wide screen, as her bubble is (host.js),
         *  running down toward the bottom; null puts it back in its place. */
        anchor(x, y, w, hgt) {
            if (!root || !root.style) return false;
            const width = root.offsetWidth || 340;
            const ok = x != null && Number.isFinite(x) && Number.isFinite(y) && x + 18 + width <= w - 16;
            const left = ok ? Math.round(x + 18) : 0;
            const top = ok ? Math.round(Math.min(Math.max(y - 28, 76), hgt * 0.4)) : 0;
            const key = ok ? `${left},${top},${hgt}` : '';
            if (key === anchored) return ok;
            anchored = key;
            if (root.classList) root.classList.toggle('is-anchored', ok);
            root.style.left = ok ? `${left}px` : '';
            root.style.top = ok ? `${top}px` : '';
            root.style.maxHeight = ok ? `${Math.round(hgt - top - 16)}px` : '';
            return ok;
        }
    };
    return api;
}
