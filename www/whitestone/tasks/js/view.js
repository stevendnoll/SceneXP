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
 * `taskDetail`, `preferenceLines`) are pure. `renderChecklist` draws them
 * into a container, and `showPhoto` the full-screen photo.
 */

import { h, clear } from '../../js/cards.min.js';
import { TASKS_PAGE as COPY, UI } from '../../js/copy.min.js';
import { taskOf, optionOf } from '../../js/sheet.min.js';
import { priceItem, formatMoney, formatMinutes } from '../../js/pricing.min.js';
import { levelOf, roomName, preferenceOf } from '../../js/taxonomy.min.js';
import { dayLabel, clockLabel } from '../../js/booking.min.js';

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

/** The care preferences, each in its own words, then the customer's note.
 *  `{ lines, note }`; both empty when there are none. */
export function preferenceLines(form) {
    const p = form.preferences || {};
    const lines = (p.keys || []).map((k) => preferenceOf(form.serviceType, k)).filter(Boolean).map((x) => x.name);
    return { lines, note: String(p.note || '').trim() };
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

function taskBlock(sheet, form, item, thumbs, on) {
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
    return h('li', { className: item.important ? 'task is-starred' : 'task', id: `task-${item.id}` }, [
        h('h4', { className: 'task-name' }, [
            item.important ? h('span', { className: 'task-star', text: '★ ', attrs: { 'aria-hidden': 'true' } }) : null,
            h('span', { text: d.name }),
            item.important ? h('span', { className: 'visually-hidden', text: ` (${COPY.starred})` }) : null
        ]),
        ...extra
    ]);
}

/**
 * Draw the checklist into `container`: `form` the published checklist,
 * `quote` its recomputed quote (null without the sheet), `sheet` the named
 * price sheet (null when it would not load), `thumbs` photo id to object
 * address, `notice` a line to show above the home (a quote that changed),
 * `on.photo(photoId, label)` to open one full screen.
 */
export function renderChecklist(container, { form, quote, sheet, thumbs = new Map(), notice = '', on }) {
    clear(container);
    const prefs = preferenceLines(form);
    if (prefs.lines.length || prefs.note) {
        container.appendChild(h('section', { className: 'tasks-prefs', attrs: { 'aria-labelledby': 'prefs-heading' } }, [
            h('h2', { id: 'prefs-heading', text: COPY.prefsHeading }),
            prefs.lines.length ? h('ul', {}, prefs.lines.map((line) => h('li', { text: line }))) : null,
            prefs.note ? h('p', { className: 'tasks-prefs-note', text: prefs.note }) : null
        ]));
    }
    const head = headerLines(form, quote);
    container.appendChild(h('header', { className: 'tasks-home' }, [
        h('h1', { text: form.title || COPY.untitled }),
        head.visit ? h('p', { className: 'tasks-visit', text: head.visit }) : null,
        head.quote ? h('p', { className: 'tasks-quote', text: head.quote }) : null,
        notice ? h('p', { className: 'tasks-notice', attrs: { role: 'note' }, text: notice }) : null,
        form.household ? h('p', { className: 'tasks-household' }, [h('strong', { text: COPY.household }), h('span', { text: ` ${form.household}` })]) : null
    ]));
    const first = startHere(form);
    if (first.length) {
        container.appendChild(h('section', { className: 'tasks-start', attrs: { 'aria-labelledby': 'start-heading' } }, [
            h('h2', { id: 'start-heading', text: COPY.startHere }),
            h('ol', {}, first.map(({ item, roomName: where }) => h('li', {}, [
                h('a', { href: `#task-${item.id}`, text: taskDetail(sheet, form, item).name }),
                h('span', { className: 'tasks-start-room', text: ` ${COPY.inRoom(where)}` })
            ])))
        ]));
    }
    for (const level of readingOrder(form)) {
        container.appendChild(h('section', { className: 'tasks-level', attrs: { 'aria-label': level.name } }, [
            h('h2', { className: 'tasks-level-name', text: level.name }),
            ...level.rooms.map((r) => h('section', { className: 'tasks-room', attrs: { 'aria-label': r.name } }, [
                h('h3', { className: 'tasks-room-name', text: r.name }),
                r.items.length
                    ? h('ul', { className: 'tasks-list' }, r.items.map((item) => taskBlock(sheet, form, item, thumbs, on)))
                    : h('p', { className: 'tasks-empty', text: COPY.emptyRoom })
            ]))
        ]));
    }
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
