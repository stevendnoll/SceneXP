// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * forms.js - Filling, reading and checking Whitestone's forms.
 *
 * The forms are static markup in index.html, so every field has a real
 * <label> a screen reader and a crawler can see. This file fills them, reads
 * them back as plain field objects for store.js, and says what is missing.
 * It never saves anything: main.js hands what it reads to a mutation.
 *
 * THE CHOICES COME FROM THE TAXONOMY. The levels and the care preferences
 * are built from taxonomy.js once, at boot, so the form can never offer a key
 * the store would drop. A bathroom's types of bath are built for the kind of
 * room chosen, each time it changes.
 */

import { h, clear } from './cards.min.js';
import { serviceType, roomName, bathChoices, bathChoiceOf, listedArea, residencesOf, residenceOf, levelsAllowed } from './taxonomy.min.js';
import { FREQUENCIES, GUARDS, UI, STORE } from './copy.min.js';
import { hintsFor } from './guards.min.js';
import { taskOf, tasksFor, presetFor, optionsFor, SIZES } from './sheet.min.js';
import { formatMoney } from './pricing.min.js';

function byId(id) {
    return document.getElementById(id);
}

function value(id) {
    const el = byId(id);
    return el && el.value != null ? String(el.value).trim() : '';
}

function setValue(id, v) {
    const el = byId(id);
    if (el) el.value = v == null ? '' : String(v);
}

/** Show a form's error line, or clear it with ''. */
export function showError(id, text) {
    const el = byId(id);
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
}

/** The checkboxes built for each group, kept as they are made, so reading a
 *  group never depends on searching the page. */
const boxes = new Map();

/** Each checkbox's row, so a row can be hidden (a level a kind of home
 *  cannot have). */
const rowsOf = new Map();

/** One checkbox with its label, in a row. */
function checkRow(name, key, label) {
    const id = `${name}-${key}`;
    const input = h('input', { id, type: 'checkbox', name, value: key });
    if (!boxes.has(name)) boxes.set(name, []);
    boxes.get(name).push(input);
    const row = h('div', { className: 'form-row form-check' }, [input, h('label', { attrs: { for: id }, text: label })]);
    rowsOf.set(input, row);
    return row;
}

/** The boxes ticked, of those showing. */
function checked(name) {
    return (boxes.get(name) || []).filter((input) => input.checked && !(rowsOf.get(input) || {}).hidden).map((input) => input.value);
}

function setChecked(name, keys) {
    for (const input of boxes.get(name) || []) input.checked = keys.includes(input.value);
}

/**
 * The gentle note under a free-text field (guards.js), or nothing. Polite
 * and quiet: the hint line is not a live region, so it is read when the
 * visitor reaches it, not shouted mid-sentence.
 */
export function showHints(textId, hintId) {
    const el = byId(hintId);
    if (!el) return [];
    const hints = hintsFor(value(textId));
    el.textContent = hints.map((code) => GUARDS[code]).join(' ');
    el.hidden = !hints.length;
    return hints;
}

/** Build the choices from the taxonomy. Called once at boot. */
export function initForms(config, type = 'cleaning') {
    const t = serviceType(type);
    boxes.clear();
    rowsOf.clear();
    const residence = byId('setup-residence');
    if (residence) {
        clear(residence);
        for (const k of residencesOf(type)) residence.appendChild(h('option', { value: k.key, text: k.name }));
    }
    const attached = byId('setup-attached');
    if (attached) {
        clear(attached);
        const townhome = residencesOf(type).find((k) => k.attached);
        for (const a of townhome ? townhome.attached : []) attached.appendChild(h('option', { value: a.key, text: a.name }));
    }
    const levels = byId('setup-levels-list');
    if (levels) {
        clear(levels);
        for (const level of t.levels) levels.appendChild(checkRow('setup-levels', level.key, level.name));
    }
    const frequency = byId('setup-frequency');
    if (frequency) {
        clear(frequency);
        for (const key of ['', ...config.frequencies]) frequency.appendChild(h('option', { value: key, text: FREQUENCIES[key] }));
    }
    const area = byId('room-area');
    if (area) {
        clear(area);
        area.appendChild(h('option', { value: '', text: 'Choose a kind of room' }));
        // A half bath is a bathroom's third type of bath, not a kind of its own.
        for (const a of t.areas) {
            if (listedArea(type, a.key) === a.key) area.appendChild(h('option', { value: a.key, text: a.name }));
        }
    }
    const level = byId('room-level');
    if (level) {
        clear(level);
        for (const l of t.levels) level.appendChild(h('option', { value: l.key, text: l.name }));
    }
    const size = byId('task-size');
    if (size) {
        clear(size);
        for (const key of SIZES) size.appendChild(h('option', { value: key, text: UI.sizeChoices[key] }));
    }
    const prefs = byId('prefs-groups');
    if (prefs) {
        clear(prefs);
        for (const group of t.preferences) {
            prefs.appendChild(h('fieldset', { className: 'form-group' }, [
                h('legend', { text: group.name }),
                h('div', { id: `prefs-${group.key}-list` }, group.items.map((i) => checkRow(`prefs-${group.key}`, i.key, i.name)))
            ]));
        }
    }
}

// ---- The setup card ---------------------------------------------------------

/**
 * The setup card as a kind of home makes it: a townhome's neighbors asked,
 * and only the levels that kind can have offered (a condo, one or two).
 * Called on filling the card and on each change of kind.
 */
export function showResidence(type = 'cleaning') {
    const residence = residenceOf(type, { kind: value('setup-residence'), attached: value('setup-attached') });
    const kind = residencesOf(type).find((k) => residence && k.key === residence.kind);
    const row = byId('setup-attached-row');
    if (row) row.hidden = !(kind && kind.attached);
    const allowed = levelsAllowed(type, residence);
    for (const input of boxes.get('setup-levels') || []) {
        const r = rowsOf.get(input);
        if (r) r.hidden = !allowed.includes(input.value);
        // The main floor: every home has one, so it is ticked for good.
        if (input.value === 'main') {
            input.checked = true;
            input.disabled = true;
            input.setAttribute('aria-describedby', 'setup-levels-note');
        }
    }
    return residence;
}

/** Fill the setup card for a new home (`checklist` null) or an edit. */
export function fillSetupForm(checklist) {
    const src = checklist || { title: '', levels: ['main'], visitFrequency: null, household: '', residence: null };
    const type = (checklist && checklist.serviceType) || 'cleaning';
    const residence = residenceOf(type, src.residence);
    setValue('setup-residence', residence ? residence.kind : '');
    setValue('setup-attached', residence && residence.attached ? residence.attached : '');
    showResidence(type);
    setChecked('setup-levels', src.levels);
    setValue('setup-frequency', src.visitFrequency || '');
    setValue('setup-household', src.household);
    const title = byId('setup-title-text');
    if (title) title.textContent = checklist ? 'Your home' : 'Start your own';
    const save = byId('setup-save');
    if (save) save.textContent = checklist ? 'Save changes' : 'Start my checklist';
    showError('setup-error', '');
    showHints('setup-household', 'setup-household-hint');
}

/** The setup card as fields for createChecklist, updateChecklist,
 *  setResidence and setLevels. */
export function readSetupForm(type = 'cleaning') {
    return {
        residence: residenceOf(type, { kind: value('setup-residence'), attached: value('setup-attached') }),
        levels: checked('setup-levels'),
        visitFrequency: value('setup-frequency') || null,
        household: value('setup-household')
    };
}

export function validateSetup(fields) {
    return fields.levels.length ? '' : UI.levelsNeeded;
}

// ---- The care preferences card ----------------------------------------------

export function fillPreferencesForm(preferences, type = 'cleaning') {
    const keys = (preferences && preferences.keys) || [];
    for (const group of serviceType(type).preferences) setChecked(`prefs-${group.key}`, keys);
    setValue('prefs-note', preferences && preferences.note);
    showHints('prefs-note', 'prefs-note-hint');
}

export function readPreferencesForm(type = 'cleaning') {
    return {
        keys: serviceType(type).preferences.flatMap((g) => checked(`prefs-${g.key}`)),
        note: value('prefs-note')
    };
}

// ---- The room card ----------------------------------------------------------

/** The radios for a room's types of bath, kept as they are made. */
let bathRadios = [];

/**
 * The types of bath for the kind of room chosen (taxonomy.js
 * `bathChoices`), `current` checked or else the first, or none and the row
 * hidden for a room that is not a bathroom.
 */
export function showBathChoices(type, area, current = null) {
    const choices = area ? bathChoices(type, area) : [];
    const row = byId('room-bath-row');
    if (row) row.hidden = !choices.length;
    const list = byId('room-bath-list');
    if (list) clear(list);
    bathRadios = choices.map((c, i) => {
        const input = h('input', { id: `room-bath-${c.key}`, type: 'radio', name: 'room-bath', value: c.key });
        input.checked = current ? c.key === current : i === 0;
        if (list) list.appendChild(h('div', { className: 'form-row form-check' }, [input, h('label', { attrs: { for: input.id }, text: c.name })]));
        return input;
    });
    return choices;
}

/** Fill the room card for a new room (`room` null) or an edit. A new room
 *  goes on the main floor when the home has one. */
export function fillRoomForm(room, checklist) {
    const levels = checklist.levels;
    const type = checklist.serviceType;
    setValue('room-area', room ? listedArea(type, room.area) : '');
    showBathChoices(type, room ? room.area : '', room ? bathChoiceOf(type, room) : null);
    setValue('room-level', room ? room.level : (levels.includes('main') ? 'main' : levels[0]));
    setValue('room-label', room ? room.label : '');
    const area = byId('room-area');
    if (area) area.disabled = Boolean(room);   // a room keeps its kind (store.js)
    const preset = byId('room-preset');
    if (preset) preset.checked = true;
    const presetRow = byId('room-preset-row');
    if (presetRow) presetRow.hidden = Boolean(room);
    const list = byId('room-preset-list');
    if (list) list.hidden = Boolean(room);
    const title = byId('room-title');
    if (title) title.textContent = room ? UI.editRoomTitle : UI.addRoomTitle;
    const save = byId('room-save');
    if (save) save.textContent = room ? UI.saveChanges : UI.addRoomSave;
    const remove = byId('room-remove');
    if (remove) remove.hidden = !room;
    showError('room-error', '');
}

/** The room card as fields: its kind of room as its type of bath makes it
 *  (a half bath is its own area), its `bath`, and the type chosen by key as
 *  `bathChoice` (null in a room that is not a bathroom). */
export function readRoomForm(type = 'cleaning') {
    const preset = byId('room-preset');
    const listed = value('room-area');
    const choices = listed ? bathChoices(type, listed) : [];
    const on = bathRadios.find((r) => r.checked);
    const chosen = choices.find((c) => on && c.key === on.value) || choices.find((c) => c.area === listed) || choices[0] || null;
    return {
        area: chosen ? chosen.area : listed,
        bath: chosen ? chosen.bath : null,
        bathChoice: chosen ? chosen.key : null,
        level: value('room-level'),
        label: value('room-label'),
        preset: Boolean(preset && preset.checked)
    };
}

export function validateRoom(fields) {
    return fields.area ? '' : STORE.badArea;
}

/** The line under the preset box: what the standard tasks are, for the
 *  room's type of bath too. */
export function showPresetPreview(sheet, area, bath) {
    const el = byId('room-preset-list');
    if (!el) return;
    if (!area) { el.textContent = ''; return; }
    if (!sheet) { el.textContent = UI.presetWaiting; return; }
    const names = presetFor(sheet, area, bath).map((p) => (taskOf(sheet, p.task) || { name: p.task }).name);
    el.textContent = names.length ? UI.presetAdds(names.join(', ')) : '';
}

// ---- The task card ----------------------------------------------------------

/** The task the card is showing choices for, so reading the form knows
 *  whether a size or a quantity belongs to it. */
let shownTask = null;

/**
 * Fill the task card. A new task (`item` null) offers every task the room's
 * kind (and its type of bath) allows. An edit shows only the item's own task, since a task is fixed
 * once chosen (store.js).
 */
export function fillTaskForm({ sheet, room, item, roomLabel, taskKey = null }) {
    const select = byId('task-task');
    if (select) {
        clear(select);
        const tasks = item ? [taskOf(sheet, item.task)].filter(Boolean) : tasksFor(sheet, room.area, room.bath);
        for (const t of tasks) select.appendChild(h('option', { value: t.key, text: `${t.name}, ${formatMoney(t.cents)}` }));
        select.disabled = Boolean(item);
        const wanted = taskKey && tasks.some((t) => t.key === taskKey) ? taskKey : (tasks[0] ? tasks[0].key : '');
        select.value = item ? item.task : wanted;
    }
    showTaskChoices(sheet, value('task-task'), item || {});
    const src = item || { important: false, notes: '', avoid: '', products: '' };
    const important = byId('task-important');
    if (important) important.checked = Boolean(src.important);
    setValue('task-notes', src.notes);
    setValue('task-avoid', src.avoid);
    setValue('task-products', src.products);
    const more = byId('task-more');
    if (more) more.open = Boolean(item && (item.notes || item.avoid || item.products || item.photos.length));
    const shown = shownTask ? shownTask.name : '';
    const title = byId('task-title');
    if (title) title.textContent = item ? UI.editTaskTitle(shown) : UI.addTaskTitle(roomLabel);
    const save = byId('task-save');
    if (save) save.textContent = item ? UI.saveChanges : UI.addTaskSave;
    const remove = byId('task-remove');
    if (remove) remove.hidden = !item;
    showError('task-error', '');
    showHints('task-notes', 'task-notes-hint');
    showHints('task-avoid', 'task-avoid-hint');
}

/** Rebuild the options, size and quantity for one task, keeping `choice`'s
 *  values where they still apply. */
export function showTaskChoices(sheet, taskKey, choice = {}) {
    shownTask = taskOf(sheet, taskKey);
    const about = byId('task-about');
    if (about) about.textContent = shownTask ? shownTask.description : '';

    boxes.set('task-options', []);
    const list = byId('task-options-list');
    if (list) clear(list);
    const options = shownTask ? optionsFor(sheet, taskKey) : [];
    for (const o of options) {
        const line = o.cents || o.minutes ? UI.optionLine(o.name, formatMoney(o.cents), o.minutes) : UI.optionFree(o.name);
        const row = checkRow('task-options', o.key, line);
        if (list) list.appendChild(row);
    }
    setChecked('task-options', choice.options || []);
    const optionsRow = byId('task-options-row');
    if (optionsRow) optionsRow.hidden = !options.length;

    const unit = shownTask ? shownTask.unit : null;
    const sizeRow = byId('task-size-row');
    if (sizeRow) sizeRow.hidden = unit !== 'room';
    setValue('task-size', choice.size || 'medium');
    const qtyRow = byId('task-quantity-row');
    if (qtyRow) qtyRow.hidden = unit !== 'count';
    setValue('task-quantity', choice.quantity || 1);
}

/** The task card as fields for store.js addItem or updateItem. Only the
 *  task's own kind of amount is read: a size for a room task, a quantity
 *  for a counted one. */
export function readTaskForm() {
    const important = byId('task-important');
    const unit = shownTask ? shownTask.unit : null;
    const quantity = Number(value('task-quantity'));
    return {
        task: value('task-task'),
        options: checked('task-options'),
        size: unit === 'room' ? value('task-size') : null,
        quantity: unit === 'count' ? quantity : null,
        important: Boolean(important && important.checked),
        notes: value('task-notes'),
        avoid: value('task-avoid'),
        products: value('task-products')
    };
}

/** The room's name for a title line: its label, or its kind. */
export function roomTitle(type, room) {
    return roomName(type, room);
}
