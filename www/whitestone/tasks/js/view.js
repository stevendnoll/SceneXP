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
 *
 * THE REPORT (M5 piece 2): Finish visit, along the bottom, shows the report
 * before it is sent (`renderReport`): the bill first, then what was
 * skipped and why, what was not reached, and what became of the add-ons,
 * each with what it takes off the quote; then the cleaner's first name,
 * time on site and a note, all optional, and Send. Waiting to send, it
 * says so; sent, it is the record of the visit, with nothing to change.
 */

import { h, clear } from '../../js/cards.min.js';
import { TASKS_PAGE as COPY, UI } from '../../js/copy.min.js';
import { taskOf, optionOf } from '../../js/sheet.min.js';
import { priceItem, formatMoney, formatMinutes } from '../../js/pricing.min.js';
import { reportCounts, REPORT_LIMITS, reportLines, billLines as sharedBillLines, skipWhy as reportSkipWhy } from '../../js/report.min.js';
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

/**
 * No visit to work on (QA, 2026-10-15): `kind` 'canceled' (with the
 * `booking` it had, when known) or 'none'. Said, with nothing to mark, until
 * a new time is booked.
 */
export function renderNoVisit(container, { kind, booking = null }) {
    clear(container);
    const canceled = kind === 'canceled';
    const line = canceled && booking && booking.date && booking.time
        ? COPY.canceledLine(dayLabel(booking.date), clockLabel(booking.time))
        : canceled ? COPY.canceledPlain : COPY.noVisitLine;
    container.appendChild(h('header', { className: 'tasks-home' }, [h('h1', { text: COPY.heading })]));
    container.appendChild(h('section', { className: 'tasks-novisit', id: 'tasks-novisit', attrs: { role: 'status', 'aria-labelledby': 'novisit-heading' } }, [
        h('h2', { id: 'novisit-heading', tabIndex: -1, text: canceled ? COPY.canceledHeading : COPY.noVisitHeading }),
        h('p', { text: line }),
        h('p', { className: 'tasks-novisit-more', text: COPY.newTimeShows })
    ]));
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
    return reportSkipWhy(mark);
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
            'aria-label': COPY.markSkip(name, skipped ? COPY.isSkipped : COPY.skip), title: COPY.markSkip(name, skipped ? COPY.isSkipped : COPY.skip)
        }
    });
    skipBtn.addEventListener('click', () => on.skip(picking ? null : item.id));
    return [
        skipped ? h('p', { className: 'task-skipped', text: COPY.skippedBecause(skipWhy(mark)) }) : null,
        h('div', { className: 'task-marks' }, [doneBtn, skipBtn]),
        picking ? skipPicker(item, name, skipped ? mark : null, on, note) : null
    ];
}

/**
 * A marked task's proof photos (M5 piece 4, PRD 11.7): each kept photo's
 * thumbnail with Remove, and while there is room for another, Add a photo
 * (a label for a hidden file input, which a phone opens on its camera),
 * with `hint`, once on the page, saying photos are optional.
 */
function proofRow(item, name, ids, thumbs, on, hint = false) {
    const shots = ids.map((photoId, n) => {
        const label = COPY.proofOf(n + 1, name);
        const url = thumbs.get(photoId);
        const remove = h('button', {
            type: 'button', className: 'skip-cancel proof-remove', id: `proof-remove-${photoId}`, text: COPY.removeProof,
            attrs: { 'aria-label': COPY.removeProofOf(n + 1, name), title: COPY.removeProofOf(n + 1, name) }
        });
        remove.addEventListener('click', () => on.unproof(item.id, photoId));
        return h('li', { className: 'proof', id: `proof-${photoId}` }, [
            url ? h('img', { src: url, alt: label, width: 72, height: 72 }) : h('span', { className: 'proof-place', text: label }),
            remove
        ]);
    });
    const out = [];
    if (shots.length) out.push(h('ul', { className: 'proofs', attrs: { 'aria-label': COPY.proofsOf(name) } }, shots));
    if (ids.length < REPORT_LIMITS.photos) {
        const input = h('input', {
            type: 'file', id: `proof-input-${item.id}`, className: 'visually-hidden proof-input',
            attrs: hint ? { accept: 'image/*', capture: 'environment', 'aria-describedby': 'proof-hint' } : { accept: 'image/*', capture: 'environment' }
        });
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (file) on.proof(item.id, file);
        });
        out.push(h('div', { className: 'proof-add' }, [
            input,
            h('label', { className: 'skip-cancel proof-label', attrs: { for: `proof-input-${item.id}`, title: COPY.addProofOf(name) } }, [
                h('span', { text: COPY.addProof }),
                h('span', { className: 'visually-hidden', text: ` ${COPY.ofTask(name)}` })
            ]),
            hint ? h('p', { className: 'proof-hint', id: 'proof-hint', text: COPY.proofsOptional }) : null
        ]));
    }
    return out;
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
        // Added by the customer after the visit began (QA, 2026-10-16).
        visit.added && visit.added.has(item.id) ? h('p', { className: 'task-added', text: COPY.addedDuring }) : null,
        ...extra,
        ...markRow(item, d.name, mark, visit.skipping === item.id, on, visit.skipNote),
        ...(mark ? proofRow(item, d.name, (visit.proofs || {})[item.id] || [], visit.proofThumbs || new Map(), on, visit.proofHint === item.id) : []),
        visit.proofNote && visit.proofNote.itemId === item.id ? h('p', { className: 'skip-note', attrs: { role: 'alert' }, text: visit.proofNote.text }) : null
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
 *
 * Proof photos (M5 piece 4): `proofs` the photo ids by task, `proofThumbs`
 * photo id to object address, `proofNote` `{ itemId, text }` when one could
 * not be added. `on.proof(itemId, file)` adds one, `on.unproof(itemId,
 * photoId)` removes it.
 */
export function renderChecklist(container, { form, quote, sheet, thumbs = new Map(), notice = '', progress = { marks: {} }, skipping = null, skipNote = '', addOns = [], proposing = null, added = new Set(), proofs = {}, proofThumbs = new Map(), proofNote = null, on }) {
    clear(container);
    // That photos are optional is said once: beside the first Add a photo,
    // in the order the cleaner reads the tasks.
    const proofHint = (readingOrder(form).flatMap((l) => l.rooms.flatMap((r) => r.items))
        .find((i) => progress.marks[i.id] && ((proofs || {})[i.id] || []).length < REPORT_LIMITS.photos) || {}).id || null;
    const visit = { progress, skipping, skipNote, addOns, proposing, added, proofs, proofThumbs, proofNote, proofHint };
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
    const finish = h('button', { type: 'button', className: 'tasks-finish', id: 'tasks-finish', text: COPY.finish });
    finish.addEventListener('click', () => on.finish());
    container.appendChild(h('div', { className: 'tasks-summary', id: 'tasks-summary' }, [
        h('div', { className: 'tasks-summary-text' }, [
            h('p', { className: 'tasks-summary-line', attrs: { role: 'status', 'aria-live': 'polite' }, text: summaryLines(form, progress, addOns).join(' ') }),
            h('p', { className: 'tasks-summary-saved', text: COPY.savedHere })
        ]),
        finish
    ]));
}

// ---- The report (M5 piece 2) ---------------------------------------------------

// What a report says in words is shared with the studio (report.js), and
// passed on from here.
export { reportLines } from '../../js/report.min.js';

/** The bill in words, as report.js says it, with the cleaner's own line
 *  for a sheet that will not load. */
export function billLines(bill) {
    return sharedBillLines(bill, COPY.billNoSheet);
}

/** Time on site in words: "2 hours 30 minutes". */
function onSite(minutes) {
    const hrs = Math.floor(minutes / 60);
    const min = minutes % 60;
    return [hrs ? COPY.hoursValue(hrs) : '', min ? COPY.minutesValue(min) : ''].filter(Boolean).join(' ');
}

/** A list under its heading, or nothing when it is empty. */
function listOf(id, heading, rows, row) {
    if (!rows.length) return null;
    return h('section', { className: 'report-list', id, attrs: { 'aria-labelledby': `${id}-heading` } }, [
        h('h2', { id: `${id}-heading`, text: heading }),
        h('ul', {}, rows.map(row))
    ]);
}

/** The cleaner's own fields: first name, time on site, a note. */
function reportFields(draft, on) {
    const name = h('input', {
        type: 'text', id: 'report-cleaner', className: 'report-input', value: draft.cleaner || '',
        attrs: { maxlength: String(REPORT_LIMITS.cleaner), autocomplete: 'given-name' }
    });
    const hours = h('select', { id: 'report-hours', className: 'report-select', attrs: { 'aria-label': COPY.hours } },
        Array.from({ length: 17 }, (_, n) => h('option', { value: String(n), text: COPY.hoursValue(n), selected: n === (draft.hours || 0) })));
    const mins = h('select', { id: 'report-minutes', className: 'report-select', attrs: { 'aria-label': COPY.minutes } },
        [0, 15, 30, 45].map((n) => h('option', { value: String(n), text: COPY.minutesValue(n), selected: n === (draft.minutes || 0) })));
    hours.value = String(draft.hours || 0);
    mins.value = String(draft.minutes || 0);
    const note = h('textarea', {
        id: 'report-note', className: 'report-note', value: draft.note || '',
        attrs: { maxlength: String(REPORT_LIMITS.note), rows: '3' }
    });
    for (const node of [name, note]) node.addEventListener('input', () => on.draft());
    for (const node of [hours, mins]) node.addEventListener('change', () => on.draft());
    return h('section', { className: 'report-fields' }, [
        h('label', { className: 'addon-label', attrs: { for: 'report-cleaner' } }, [h('span', { text: COPY.nameLabel })]),
        name,
        h('fieldset', { className: 'report-time' }, [h('legend', { text: COPY.timeLabel }), hours, mins]),
        h('label', { className: 'addon-label', attrs: { for: 'report-note' } }, [h('span', { text: COPY.noteLabel })]),
        note
    ]);
}

/**
 * Draw a report into `container`: `mode` 'finish' (before sending, the
 * cleaner's fields open), 'pending' (sent but waiting for a signal) or
 * 'sent'. `report` from visit.js buildReport, `bill` from report.js
 * reportBill (null without the sheet), `draft` the fields as typed, `note`
 * a line about sending (`problem` when it went wrong), `sending` while a
 * send is on its way. `on.send()`, `on.back()`, `on.retry()`, `on.draft()`.
 */
export function renderReport(container, { form, sheet, report, bill, mode, draft = {}, note = '', problem = false, sending = false, on }) {
    clear(container);
    const counts = reportCounts(report);
    const lines = reportLines(sheet, form, report);
    const money = billLines(bill);
    const title = { finish: COPY.finishTitle, pending: COPY.pendingTitle, sent: COPY.sentTitle }[mode];
    const told = [];
    if (mode !== 'finish') {
        if (report.cleaner) told.push(h('p', { text: COPY.cleanerLine(report.cleaner) }));
        if (report.minutesOnSite) told.push(h('p', { text: COPY.onSiteLine(onSite(report.minutesOnSite)) }));
        if (report.note) told.push(h('p', { className: 'report-said' }, [h('strong', { text: COPY.noteLine }), h('span', { text: ` ${report.note}` })]));
    }
    const actions = [];
    if (mode === 'finish') {
        const send = h('button', { type: 'button', className: 'addon-send', id: 'report-send', text: sending ? COPY.sendingReport : COPY.sendReport, disabled: sending });
        send.addEventListener('click', () => on.send());
        const back = h('button', { type: 'button', className: 'skip-cancel', id: 'report-back', text: COPY.backToList, disabled: sending });
        back.addEventListener('click', () => on.back());
        actions.push(send, back);
    } else if (mode === 'pending') {
        const retry = h('button', { type: 'button', className: 'addon-send', id: 'report-retry', text: sending ? COPY.sendingReport : COPY.retry, disabled: sending });
        retry.addEventListener('click', () => on.retry());
        actions.push(retry);
    }
    container.appendChild(h('section', { className: `tasks-report is-${mode}`, id: 'tasks-report', attrs: { 'aria-labelledby': 'report-title' } }, [
        h('h1', { id: 'report-title', text: title, attrs: { tabindex: '-1' } }),
        h('p', { className: 'tasks-lead', text: mode === 'sent' ? COPY.sentLead : COPY.finishLead }),
        h('section', { className: 'report-bill', id: 'report-bill', attrs: { 'aria-labelledby': 'report-bill-heading' } }, [
            h('h2', { id: 'report-bill-heading', text: COPY.billHeading }),
            h('p', { className: 'report-bill-line', text: money.line }),
            money.parts.length ? h('ul', {}, money.parts.map((p) => h('li', { text: p }))) : null
        ]),
        h('p', { className: 'report-counts', text: COPY.reportCounts(counts.done, counts.skipped, counts.notReached) }),
        listOf('report-skipped', COPY.skippedHeading, lines.skipped, (t) => h('li', { id: `report-${t.id}` }, [
            h('span', { className: 'report-label', text: t.label }),
            t.why ? h('span', { className: 'report-why', text: ` (${t.why})` }) : null,
            t.off ? h('span', { className: 'report-off', text: ` ${t.off}` }) : null
        ])),
        listOf('report-not-reached', COPY.notReachedHeading, lines.notReached, (t) => h('li', { id: `report-${t.id}` }, [
            h('span', { className: 'report-label', text: t.label }),
            t.off ? h('span', { className: 'report-off', text: ` ${t.off}` }) : null
        ])),
        listOf('report-addons', COPY.addOnsReportHeading, lines.addOns, (a) => h('li', { id: `report-${a.id}` }, [
            h('span', { className: 'report-label', text: a.label }),
            h('span', { className: 'report-why', text: ` (${a.outcome})` }),
            a.money ? h('span', { className: 'report-off', text: ` ${a.money}` }) : null
        ])),
        ...told,
        mode === 'finish' ? reportFields(draft, on) : null,
        note ? h('p', { className: `report-status${problem ? ' is-problem' : ''}`, id: 'report-status', attrs: { role: problem ? 'alert' : 'status' }, text: note }) : null,
        actions.length ? h('div', { className: 'skip-actions report-actions' }, actions) : null
    ]));
}

/**
 * The full-screen photo: `url` its object address, `label` what it is.
 * Closes on its button, a tap on the dark around it, or Escape, and gives
 * the keyboard back to `from`. Tab stays on its button. Returns the overlay.
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
    // Modal for the keyboard too (the accessibility sweep, 2026-10-16): its
    // one control keeps Tab, or Tab walked out onto the checklist hidden
    // behind the dark.
    const onKey = (event) => {
        if (event.key === 'Escape') done();
        else if (event.key === 'Tab') {
            event.preventDefault();
            close.focus();
        }
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
