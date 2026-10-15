// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * view.js - The cleaner's checklist, drawn (PRD 12.3, PLANNING 8.1).
 *
 * CARE PREFERENCES FIRST. Before anything else, in a banner the cleaner
 * cannot miss: "Fragrance-free products. No bleach. Pets at home.", with
 * the customer's note under it. Then the home (its name, its notes, the
 * quote and the visit), then Start here (every starred task, in the
 * customer's order), then every room by level, each task with what it
 * includes, about how long it takes, its notes, a clearly marked Avoid
 * line, its products, and its photos.
 *
 * READABLE AT ARM'S LENGTH: big type and plain words, and nothing the
 * cleaner has to open to find out what a task is.
 *
 * The helpers that decide what is shown (`readingOrder`, `startHere`,
 * `taskDetail`, `preferenceLines`, `summaryLines`) are pure.
 * `renderChecklist` draws them into a container, and `showPhoto` the
 * full-screen photo.
 *
 * THE VISIT (M4 piece 2): every task has two big buttons, Done and Skip,
 * for gloves and wet hands. Skip opens a few quick reasons, or room for a
 * few words, inside the task. A bar along the bottom says where the visit
 * stands, and that it is saved on the device as the cleaner goes.
 *
 * ADD-ONS (M4 piece 3): every room offers Propose an add-on, which opens a
 * picker inside the room (a task it does not have, or an upgrade of one it
 * does), shows the price before anything is sent, and takes a few words for
 * the customer. Each add-on then sits under its room's tasks with where it
 * stands, and once approved, a Done of its own.
 */

import { h, clear } from '../../js/cards.min.js';
import { TASKS_PAGE as COPY, UI } from '../../js/copy.min.js';
import { taskOf, optionOf } from '../../js/sheet.min.js';
import { priceItem, formatMoney, formatMinutes } from '../../js/pricing.min.js';
import { levelOf, roomName, preferenceLines as linesFor } from '../../js/taxonomy.min.js';
import { dayLabel, clockLabel } from '../../js/booking.min.js';
import { SKIP_REASONS, WORDS_MAX, summarize } from './visit.min.js';
import { choicesFor, priceOf, addOnName, roomOf, takenKeys } from './addons.min.js';

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

/**
 * The home as the cleaner reads it: `[{ level, name, rooms: [{ room, name,
 * items }] }]`, the levels in the home's own order, each room's tasks in
 * the customer's order. A level with no rooms is left out.
 */
export function readingOrder(form) {
    const type = form.serviceType;
    return (form.levels || []).map((key) => {
        const rooms = (form.rooms || []).filter((r) => r.level === key).map((room) => ({
            room,
            name: roomName(type, room),
            items: (form.items || []).filter((i) => i.roomId === room.id).sort(byOrder)
        }));
        const level = levelOf(type, key);
        return { level: key, name: level ? level.name : key, rooms };
    }).filter((l) => l.rooms.length);
}

/** Start here: every starred task, in the order the cleaner meets them
 *  below, each with its room's name. */
export function startHere(form) {
    return readingOrder(form).flatMap((l) => l.rooms.flatMap((r) => r.items.filter((i) => i.important).map((item) => ({ item, roomName: r.name }))));
}

/** The care preferences, each in its own words, then the customer's note
 *  (taxonomy.js, as the quote card reads them). `{ lines, note }`; both
 *  empty when there are none. */
export function preferenceLines(form) {
    return linesFor(form.serviceType, form.preferences);
}

/**
 * One task as the cleaner reads it: `{ name, includes, minutes, notes,
 * avoid, products, photos }`. `includes` is its options, its room's size
 * and its quantity in words; `minutes` about how long, from the sheet
 * ('' when the sheet cannot price it).
 */
export function taskDetail(sheet, form, item) {
    const t = sheet ? taskOf(sheet, item.task) : null;
    const parts = [];
    for (const key of item.options || []) {
        const o = sheet ? optionOf(sheet, key) : null;
        parts.push(o ? o.name : key);
    }
    if (item.size) parts.push(UI.sizes[item.size]);
    if (item.quantity && item.quantity > 1) parts.push(UI.quantity(item.quantity));
    const price = sheet ? priceItem(sheet, item, form.rooms) : { error: 'no-sheet' };
    return {
        name: t ? t.name : item.task,
        includes: parts.join(', '),
        minutes: price.error ? '' : formatMinutes(price.minutes),
        notes: String(item.notes || '').trim(),
        avoid: String(item.avoid || '').trim(),
        products: String(item.products || '').trim(),
        photos: Array.isArray(item.photos) ? item.photos : []
    };
}

/** The quote and the visit in a line each, or '' where there is none. */
export function headerLines(form, quote) {
    const b = form.booking;
    return {
        quote: quote ? COPY.quoteLine(formatMoney(quote.totalCents), formatMinutes(quote.minutes)) : '',
        visit: b && b.date && b.time ? COPY.visitLine(dayLabel(b.date), clockLabel(b.time)) : ''
    };
}

/** The element of `id` inside `root`, or null: looked for in what was
 *  drawn, so the keyboard lands on the button just drawn. */
export function findIn(root, id) {
    for (const child of Array.from((root && root.children) || [])) {
        if (child.id === id) return child;
        const deeper = findIn(child, id);
        if (deeper) return deeper;
    }
    return null;
}

/** Why a task was skipped, in words: its quick reason, its own words, or
 *  both. */
export function skipWhy(mark) {
    if (!mark || mark.status !== 'skipped') return '';
    const reason = mark.reason ? COPY.reasons[mark.reason] : '';
    return [reason, mark.words].filter(Boolean).join('. ');
}

/** Where the visit stands, in a line or two (PRD 12.4): "12 done, 1
 *  skipped, 7 to go." and how the starred tasks stand, then the add-ons
 *  ("Add-ons: 1 approved, 1 waiting."). */
export function summaryLines(form, progress, addOns = []) {
    const s = summarize(form, progress);
    const lines = [COPY.summary(s.done, s.skipped, s.toGo)];
    if (s.starred) {
        lines.push(s.starredToGo ? COPY.starredToGo(s.starredToGo)
            : s.starredSkipped ? COPY.starredMarked(s.starredDone, s.starredSkipped) : COPY.starredDone);
    }
    const parts = ['approved', 'waiting', 'declined']
        .map((status) => [status, addOns.filter((a) => a.status === status).length])
        .filter(([, n]) => n)
        .map(([status, n]) => COPY.addOnCount[status](n));
    if (parts.length) lines.push(COPY.addOnsLine(parts.join(', ')));
    return lines;
}

/** An add-on's price in words, or '' when the sheet cannot price it. */
function priceWords(sheet, form, addOn, line) {
    const p = priceOf(sheet, form, addOn);
    return p.error ? '' : line(formatMoney(p.cents), formatMinutes(p.minutes));
}

/** One add-on under its room: what, what it adds, the customer's words,
 *  where it stands, and Done once approved. */
function addOnBlock(sheet, form, addOn, progress, on) {
    const name = addOnName(sheet, form, addOn);
    const done = Boolean(progress.marks[addOn.id]);
    const price = priceWords(sheet, form, addOn, COPY.addOnPriced);
    let doneBtn = null;
    if (addOn.status === 'approved') {
        doneBtn = h('button', {
            type: 'button', className: `mark-done${done ? ' is-on' : ''}`, id: `addon-done-${addOn.id}`,
            text: done ? COPY.isDone : COPY.done, attrs: { 'aria-pressed': done ? 'true' : 'false', 'aria-label': COPY.markDone(name), title: COPY.markDone(name) }
        });
        doneBtn.addEventListener('click', () => on.addOnDone(addOn.id));
    }
    return h('li', { className: `addon is-${addOn.status}${done ? ' is-done' : ''}`, id: `addon-${addOn.id}` }, [
        h('p', { className: 'addon-name', text: name }),
        price ? h('p', { className: 'addon-price', text: price }) : null,
        addOn.words ? h('p', { className: 'addon-words', text: addOn.words }) : null,
        h('p', { className: 'addon-status', text: COPY.addOnStatus[addOn.status] }),
        doneBtn ? h('div', { className: 'task-marks' }, [doneBtn]) : null
    ]);
}

/** The add-on picker inside a room: what it needs (a select, grouped into
 *  new tasks and upgrades), how many for a task counted by the piece, the
 *  price, a few words, then Send or Cancel. */
function addOnPicker(sheet, form, roomId, roomLabel, choices, proposing, on) {
    const id = roomId;
    const select = h('select', { id: `addon-choice-${id}`, className: 'addon-choice' }, [
        h('option', { value: '', text: COPY.addOnChoose, selected: !proposing.key }),
        ...[['task', COPY.addOnNewTask], ['upgrade', COPY.addOnUpgrade]].map(([kind, label]) => {
            const list = choices.filter((c) => c.kind === kind);
            return list.length ? h('optgroup', { attrs: { label } }, list.map((c) => h('option', { value: c.key, text: c.name, selected: c.key === proposing.key }))) : null;
        })
    ]);
    select.value = proposing.key || '';
    select.addEventListener('change', () => on.pick(id, select.value));
    const chosen = choices.find((c) => c.key === proposing.key) || null;
    const counted = Boolean(chosen && chosen.addOn.quantity);
    const addOn = chosen ? (counted ? { ...chosen.addOn, quantity: proposing.quantity } : chosen.addOn) : null;
    let qty = null;
    if (counted) {
        qty = h('input', {
            type: 'number', id: `addon-qty-${id}`, className: 'addon-qty', value: String(proposing.quantity),
            attrs: { min: '1', max: '50', inputmode: 'numeric' }
        });
        qty.addEventListener('change', () => on.quantity(id, qty.value));
    }
    const price = addOn ? priceWords(sheet, form, addOn, COPY.addOnAdds) : '';
    const words = h('input', {
        type: 'text', id: `addon-words-${id}`, className: 'addon-words-input', value: proposing.words || '',
        attrs: { maxlength: String(WORDS_MAX), autocomplete: 'off' }
    });
    const send = h('button', {
        type: 'button', className: 'addon-send', id: `addon-send-${id}`,
        text: proposing.sending ? COPY.addOnSending : COPY.addOnSend, disabled: Boolean(proposing.sending)
    });
    send.addEventListener('click', () => on.send(id));
    const cancel = h('button', { type: 'button', className: 'skip-cancel', id: `addon-cancel-${id}`, text: COPY.cancel });
    cancel.addEventListener('click', () => on.propose(null));
    return h('div', { className: 'addon-picker', id: `addon-picker-${id}`, attrs: { role: 'group', 'aria-label': COPY.proposeIn(roomLabel) } }, [
        h('label', { className: 'addon-label', attrs: { for: `addon-choice-${id}` } }, [h('span', { text: COPY.addOnWhat })]),
        select,
        counted ? h('label', { className: 'addon-label', attrs: { for: `addon-qty-${id}` } }, [h('span', { text: COPY.addOnHowMany })]) : null,
        qty,
        price ? h('p', { className: 'addon-price', id: `addon-price-${id}`, attrs: { 'aria-live': 'polite' }, text: price }) : null,
        h('label', { className: 'addon-label', attrs: { for: `addon-words-${id}` } }, [h('span', { text: COPY.addOnWords })]),
        words,
        proposing.note ? h('p', { className: 'skip-note', attrs: { role: 'alert' }, text: proposing.note }) : null,
        h('div', { className: 'skip-actions' }, [send, cancel])
    ]);
}

/** A room's add-ons, and its way to propose one (none without the sheet,
 *  which prices them). */
function roomAddOns(sheet, form, r, visit, on) {
    const mine = visit.addOns.filter((a) => roomOf(form, a) === r.room.id);
    const choices = sheet ? choicesFor(sheet, form, r.room.id, takenKeys(visit.addOns)) : [];
    const open = Boolean(visit.proposing && visit.proposing.roomId === r.room.id);
    const out = [];
    if (mine.length) {
        out.push(h('h4', { className: 'addons-heading', text: COPY.addOnsHeading }));
        out.push(h('ul', { className: 'tasks-addons' }, mine.map((a) => addOnBlock(sheet, form, a, visit.progress, on))));
    }
    if (choices.length || open) {
        const btn = h('button', {
            type: 'button', className: 'addon-propose', id: `propose-${r.room.id}`, text: COPY.propose,
            attrs: { 'aria-expanded': open ? 'true' : 'false', 'aria-label': COPY.proposeIn(r.name), title: COPY.proposeIn(r.name) }
        });
        btn.addEventListener('click', () => on.propose(open ? null : r.room.id));
        out.push(btn);
        if (open) out.push(addOnPicker(sheet, form, r.room.id, r.name, choices, visit.proposing, on));
    }
    return out;
}

/** A photo's thumbnail button: its own image, or its place while it
 *  loads (`thumbs` maps a photo id to an object address). */
function photoButton(photoId, n, name, thumbs, on) {
    const url = thumbs.get(photoId);
    const label = COPY.photoOf(n, name);
    const btn = h('button', { type: 'button', className: 'task-photo', attrs: { 'aria-label': label, title: label } },
        url ? [h('img', { src: url, alt: '', width: 72, height: 72 })] : []);
    btn.addEventListener('click', () => on.photo(photoId, label));
    return btn;
}

/** The skip picker inside a task: the quick reasons, a few words of the
 *  cleaner's own, and, for a task already skipped, a way back. */
function skipPicker(item, name, mark, on, note) {
    const id = item.id;
    const reasons = SKIP_REASONS.map((key) => {
        const btn = h('button', {
            type: 'button', className: `skip-reason${mark && mark.reason === key ? ' is-on' : ''}`, id: `reason-${id}-${key}`,
            text: COPY.reasons[key], attrs: { 'aria-pressed': mark && mark.reason === key ? 'true' : 'false' }
        });
        btn.addEventListener('click', () => on.mark(id, { status: 'skipped', reason: key }));
        return btn;
    });
    const words = h('input', {
        type: 'text', id: `words-${id}`, className: 'skip-words', value: (mark && mark.words) || '',
        attrs: { maxlength: String(WORDS_MAX), autocomplete: 'off' }
    });
    const withWords = h('button', { type: 'button', className: 'skip-with-words', id: `skip-words-${id}`, text: COPY.skipWithWords });
    withWords.addEventListener('click', () => on.mark(id, { status: 'skipped', words: words.value }));
    const cancel = h('button', { type: 'button', className: 'skip-cancel', id: `skip-cancel-${id}`, text: COPY.cancel });
    cancel.addEventListener('click', () => on.skip(null));
    const back = mark ? h('button', { type: 'button', className: 'skip-cancel', id: `unskip-${id}`, text: COPY.unskip }) : null;
    if (back) back.addEventListener('click', () => on.mark(id, null));
    return h('div', { className: 'skip-picker', id: `picker-${id}`, attrs: { role: 'group', 'aria-label': COPY.skipWhyOf(name) } }, [
        h('p', { className: 'skip-why', text: COPY.skipWhy }),
        note ? h('p', { className: 'skip-note', attrs: { role: 'alert' }, text: note }) : null,
        h('div', { className: 'skip-reasons' }, reasons),
        h('label', { className: 'skip-words-label', attrs: { for: `words-${id}` } }, [h('span', { text: COPY.skipWords })]),
        words,
        h('div', { className: 'skip-actions' }, [withWords, back, cancel])
    ]);
}

/** Done and Skip, big, and what was said of a skip. */
function markRow(item, name, mark, picking, on, note) {
    const done = Boolean(mark && mark.status === 'done');
    const skipped = Boolean(mark && mark.status === 'skipped');
    const doneBtn = h('button', {
        type: 'button', className: `mark-done${done ? ' is-on' : ''}`, id: `done-${item.id}`,
        text: done ? COPY.isDone : COPY.done, attrs: { 'aria-pressed': done ? 'true' : 'false', 'aria-label': COPY.markDone(name), title: COPY.markDone(name) }
    });
    doneBtn.addEventListener('click', () => on.mark(item.id, done ? null : { status: 'done' }));
    const skipBtn = h('button', {
        type: 'button', className: `mark-skip${skipped ? ' is-on' : ''}`, id: `skip-${item.id}`,
        text: skipped ? COPY.isSkipped : COPY.skip,
        attrs: {
            'aria-pressed': skipped ? 'true' : 'false', 'aria-expanded': picking ? 'true' : 'false',
            'aria-label': COPY.markSkip(name), title: COPY.markSkip(name)
        }
    });
    skipBtn.addEventListener('click', () => on.skip(picking ? null : item.id));
    return [
        skipped ? h('p', { className: 'task-skipped', text: COPY.skippedBecause(skipWhy(mark)) }) : null,
        h('div', { className: 'task-marks' }, [doneBtn, skipBtn]),
        picking ? skipPicker(item, name, skipped ? mark : null, on, note) : null
    ];
}

function taskBlock(sheet, form, item, thumbs, on, visit) {
    const d = taskDetail(sheet, form, item);
    const extra = [];
    if (d.includes) extra.push(h('p', { className: 'task-includes', text: d.includes }));
    if (d.minutes) extra.push(h('p', { className: 'task-minutes', text: COPY.takes(d.minutes) }));
    if (d.notes) extra.push(h('p', { className: 'task-notes' }, [h('strong', { text: COPY.notes }), h('span', { text: ` ${d.notes}` })]));
    if (d.avoid) extra.push(h('p', { className: 'task-avoid' }, [h('strong', { text: COPY.avoid }), h('span', { text: ` ${d.avoid}` })]));
    if (d.products) extra.push(h('p', { className: 'task-products' }, [h('strong', { text: COPY.products }), h('span', { text: ` ${d.products}` })]));
    if (d.photos.length) {
        extra.push(h('div', { className: 'task-photos' }, d.photos.map((p, i) => photoButton(p, i + 1, d.name, thumbs, on))));
    }
    const mark = visit.progress.marks[item.id] || null;
    const state = mark ? ` is-${mark.status}` : '';
    return h('li', { className: `task${item.important ? ' is-starred' : ''}${state}`, id: `task-${item.id}` }, [
        h('h4', { className: 'task-name' }, [
            item.important ? h('span', { className: 'task-star', text: '★ ', attrs: { 'aria-hidden': 'true' } }) : null,
            h('span', { text: d.name }),
            item.important ? h('span', { className: 'visually-hidden', text: ` (${COPY.starred})` }) : null
        ]),
        ...extra,
        ...markRow(item, d.name, mark, visit.skipping === item.id, on, visit.skipNote)
    ]);
}

/**
 * Draw the checklist into `container`: `form` the published checklist,
 * `quote` its recomputed quote (null without the sheet), `sheet` the named
 * price sheet (null when it would not load), `thumbs` photo id to object
 * address, `notice` a line to show above the home (a quote that changed),
 * `progress` the visit's marks (visit.js), `skipping` the task whose skip
 * picker is open (or null), `skipNote` a line for that picker (a skip
 * asked for with no reason). `on.photo(photoId, label)` opens one full
 * screen, `on.mark(itemId, mark)` marks a task (null clears it), and
 * `on.skip(itemId)` opens a task's skip picker (null closes it).
 *
 * Add-ons: `addOns` the visit's (addons.js), `proposing` the open picker
 * (`{ roomId, key, quantity, words, note, sending }`, or null).
 * `on.propose(roomId)` opens a room's picker (null closes it),
 * `on.pick(roomId, key)` and `on.quantity(roomId, value)` change it,
 * `on.send(roomId)` sends it, and `on.addOnDone(addonId)` marks an approved
 * add-on done (or clears it). `on.print()` prints the work order.
 */
export function renderChecklist(container, { form, quote, sheet, thumbs = new Map(), notice = '', progress = { marks: {} }, skipping = null, skipNote = '', addOns = [], proposing = null, on }) {
    clear(container);
    const visit = { progress, skipping, skipNote, addOns, proposing };
    const prefs = preferenceLines(form);
    if (prefs.lines.length || prefs.note) {
        container.appendChild(h('section', { className: 'tasks-prefs', attrs: { 'aria-labelledby': 'prefs-heading' } }, [
            h('h2', { id: 'prefs-heading', text: COPY.prefsHeading }),
            prefs.lines.length ? h('ul', {}, prefs.lines.map((line) => h('li', { text: line }))) : null,
            prefs.note ? h('p', { className: 'tasks-prefs-note', text: prefs.note }) : null
        ]));
    }
    const head = headerLines(form, quote);
    const printBtn = h('button', { type: 'button', className: 'tasks-print', id: 'tasks-print', text: COPY.print });
    printBtn.addEventListener('click', () => on.print());
    container.appendChild(h('header', { className: 'tasks-home' }, [
        h('h1', { text: COPY.heading }),
        head.visit ? h('p', { className: 'tasks-visit', text: head.visit }) : null,
        head.quote ? h('p', { className: 'tasks-quote', text: head.quote }) : null,
        notice ? h('p', { className: 'tasks-notice', attrs: { role: 'note' }, text: notice }) : null,
        form.household ? h('p', { className: 'tasks-household' }, [h('strong', { text: COPY.household }), h('span', { text: ` ${form.household}` })]) : null,
        printBtn
    ]));
    const first = startHere(form);
    if (first.length) {
        container.appendChild(h('section', { className: 'tasks-start', attrs: { 'aria-labelledby': 'start-heading' } }, [
            h('h2', { id: 'start-heading', text: COPY.startHere }),
            h('ol', {}, first.map(({ item, roomName: where }) => {
                const mark = progress.marks[item.id];
                return h('li', { className: mark ? `is-${mark.status}` : '' }, [
                    h('a', { href: `#task-${item.id}`, text: taskDetail(sheet, form, item).name }),
                    h('span', { className: 'tasks-start-room', text: ` ${COPY.inRoom(where)}` }),
                    mark ? h('span', { className: 'tasks-start-mark', text: ` (${mark.status === 'done' ? COPY.isDone : COPY.isSkipped})` }) : null
                ]);
            }))
        ]));
    }
    for (const level of readingOrder(form)) {
        container.appendChild(h('section', { className: 'tasks-level', attrs: { 'aria-label': level.name } }, [
            h('h2', { className: 'tasks-level-name', text: level.name }),
            ...level.rooms.map((r) => h('section', { className: 'tasks-room', attrs: { 'aria-label': r.name } }, [
                h('h3', { className: 'tasks-room-name', text: r.name }),
                r.items.length
                    ? h('ul', { className: 'tasks-list' }, r.items.map((item) => taskBlock(sheet, form, item, thumbs, on, visit)))
                    : h('p', { className: 'tasks-empty', text: COPY.emptyRoom }),
                ...roomAddOns(sheet, form, r, visit, on)
            ]))
        ]));
    }
    // Where the visit stands, along the bottom, said as it changes.
    container.appendChild(h('div', { className: 'tasks-summary', id: 'tasks-summary' }, [
        h('p', { className: 'tasks-summary-line', attrs: { role: 'status', 'aria-live': 'polite' }, text: summaryLines(form, progress, addOns).join(' ') }),
        h('p', { className: 'tasks-summary-saved', text: COPY.savedHere })
    ]));
}

/**
 * The full-screen photo: `url` its object address, `label` what it is.
 * Closes on its button, a tap on the dark around it, or Escape, and gives
 * the keyboard back to `from`. Returns the overlay.
 */
export function showPhoto(doc, url, label, from) {
    const close = h('button', { type: 'button', className: 'photo-close', text: COPY.close });
    const overlay = h('div', { className: 'photo-view', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label } }, [
        h('img', { src: url, alt: label }),
        close
    ]);
    const done = () => {
        overlay.remove();
        doc.removeEventListener('keydown', onKey);
        if (from && typeof from.focus === 'function') from.focus();
    };
    const onKey = (event) => {
        if (event.key === 'Escape') done();
    };
    close.addEventListener('click', done);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) done();
    });
    doc.addEventListener('keydown', onKey);
    doc.body.appendChild(overlay);
    close.focus();
    return overlay;
}
