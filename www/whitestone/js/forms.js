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
 * the store would drop.
 */

import { h, clear } from './cards.min.js';
import { serviceType, roomName } from './taxonomy.min.js';
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

/** One checkbox with its label, in a row. */
function checkRow(name, key, label) {
    const id = `${name}-${key}`;
    const input = h('input', { id, type: 'checkbox', name, value: key });
    if (!boxes.has(name)) boxes.set(name, []);
    boxes.get(name).push(input);
    return h('div', { className: 'form-row form-check' }, [input, h('label', { attrs: { for: id }, text: label })]);
}

function checked(name) {
    return (boxes.get(name) || []).filter((input) => input.checked).map((input) => input.value);
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
        for (const a of t.areas) area.appendChild(h('option', { value: a.key, text: a.name }));
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

/** Fill the setup card for a new home (`checklist` null) or an edit. */
export function fillSetupForm(checklist) {
    const src = checklist || { title: '', levels: ['main'], visitFrequency: null, household: '' };
    setChecked('setup-levels', src.levels);
    setValue('setup-title', checklist ? src.title : '');
    setValue('setup-frequency', src.visitFrequency || '');
    setValue('setup-household', src.household);
    const title = byId('setup-title-text');
    if (title) title.textContent = checklist ? 'Your home' : 'Start your own';
    const save = byId('setup-save');
    if (save) save.textContent = checklist ? 'Save changes' : 'Start my checklist';
    showError('setup-error', '');
    showHints('setup-household', 'setup-household-hint');
}

/** The setup card as fields for createChecklist, updateChecklist and setLevels. */
export function readSetupForm() {
    return {
        levels: checked('setup-levels'),
        title: value('setup-title'),
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

/** Fill the room card for a new room (`room` null) or an edit. A new room
 *  goes on the main floor when the home has one. */
export function fillRoomForm(room, checklist) {
    const levels = checklist.levels;
    setValue('room-area', room ? room.area : '');
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

export function readRoomForm() {
    const preset = byId('room-preset');
    return {
        area: value('room-area'),
        level: value('room-level'),
        label: value('room-label'),
        preset: Boolean(preset && preset.checked)
    };
}

export function validateRoom(fields) {
    return fields.area ? '' : STORE.badArea;
}

/** The line under the preset box: what the standard tasks are. */
export function showPresetPreview(sheet, area) {
    const el = byId('room-preset-list');
    if (!el) return;
    if (!area) { el.textContent = ''; return; }
    if (!sheet) { el.textContent = UI.presetWaiting; return; }
    const names = presetFor(sheet, area).map((p) => (taskOf(sheet, p.task) || { name: p.task }).name);
    el.textContent = names.length ? UI.presetAdds(names.join(', ')) : '';
}

// ---- The task card ----------------------------------------------------------

/** The task the card is showing choices for, so reading the form knows
 *  whether a size or a quantity belongs to it. */
let shownTask = null;

/**
 * Fill the task card. A new task (`item` null) offers every task the room's
 * kind allows. An edit shows only the item's own task, since a task is fixed
 * once chosen (store.js).
 */
export function fillTaskForm({ sheet, room, item, roomLabel, taskKey = null }) {
    const select = byId('task-task');
    if (select) {
        clear(select);
        const tasks = item ? [taskOf(sheet, item.task)].filter(Boolean) : tasksFor(sheet, room.area);
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
