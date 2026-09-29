// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * forms.js - Filling, reading and checking the office's forms.
 *
 * The forms are static markup in index.html, so every field has a real
 * <label> a screen reader and a crawler can see. This file fills them, reads
 * them back as plain field objects for store.js, and says what is missing.
 * It never saves anything: main.js hands what it reads to a mutation.
 *
 * THE SELECTS ARE FILLED FROM labels.js, so a status or an event type is
 * named the same way in the form, the grid and the folder.
 *
 * QUICK ADD IS THE SAME FORM. A new application shows only the company, the
 * role and the follow-up offer, with everything else behind "More details",
 * so the fifteen-second path is two boxes and Enter (Prospect City was
 * abandoned for asking too much up front). Editing opens with the details
 * showing.
 */

import { STATUS_LABELS, WORK_MODE_LABELS, EVENT_LABELS, OUTCOME_LABELS, salaryText } from './labels.min.js';
import { readPosting } from './posting.min.js';
import { isDateString, isDateTimeString } from './dates.min.js';
import { h, clear } from './cards.min.js';
import { safeUrl } from './store.min.js';

/** The "Who was there" boxes of the event form, as last built. */
let withBoxes = [];

const PERIOD_LABELS = { year: 'A year', hour: 'An hour' };

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

function fillSelect(id, values, labels) {
    const el = byId(id);
    if (!el) return;
    clear(el);
    for (const v of values) el.appendChild(h('option', { value: v, text: labels[v] }));
}

/** Show a form's error line, or clear it with ''. */
export function showError(id, text) {
    const el = byId(id);
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
}

/** Fill every select from the labels. Called once at boot. */
export function initForms(config) {
    fillSelect('af-status', config.statuses, STATUS_LABELS);
    fillSelect('af-workmode', config.workModes, WORK_MODE_LABELS);
    fillSelect('af-period', config.salaryPeriods, PERIOD_LABELS);
    fillSelect('ef-type', config.eventTypes, EVENT_LABELS);
    fillSelect('ef-outcome', config.outcomes, OUTCOME_LABELS);
}

// ---- Applications -----------------------------------------------------------

/** Form field ids by record field. */
export const AF = {
    company: 'af-company',
    role: 'af-role',
    status: 'af-status',
    appliedOn: 'af-applied',
    url: 'af-url',
    source: 'af-source',
    location: 'af-location',
    workMode: 'af-workmode',
    salaryMin: 'af-salary-min',
    salaryMax: 'af-salary-max',
    salaryPeriod: 'af-period',
    salaryCurrency: 'af-currency',
    notes: 'af-notes',
    posting: 'af-posting'
};

/**
 * Fill the application form for a new application (`app` null) or an edit.
 * `followUpDays` words the follow-up offer.
 */
export function fillApplicationForm(app, { followUpDays }) {
    // A new application's date is left empty: store.js dates one that has
    // been sent as today, and one saved for later stays undated, which a
    // filled-in date box would have undone.
    const src = app || { status: 'applied', workMode: 'unknown', salaryPeriod: 'year', salaryCurrency: 'USD' };
    for (const [field, id] of Object.entries(AF)) setValue(id, src[field]);
    const title = byId('application-form-title');
    if (title) title.textContent = app ? 'Edit application' : 'New application';
    const save = byId('af-save');
    // "Save application", not "Submit": in a job tracker that reads as
    // sending the application to the employer (QA, 2026-09-29: "Add to the
    // office" might confuse people).
    if (save) save.textContent = app ? 'Save changes' : 'Save application';
    // A status is changed from the folder, never from an edit (store.js pins
    // it), so the edit form does not offer one.
    const statusRow = byId('af-status-row');
    if (statusRow) statusRow.hidden = Boolean(app);
    const followRow = byId('af-follow-row');
    if (followRow) followRow.hidden = Boolean(app);
    const follow = byId('af-follow');
    if (follow) follow.checked = true;
    const followText = byId('af-follow-text');
    if (followText) followText.textContent = `Remind me to follow up in ${followUpDays} ${followUpDays === 1 ? 'day' : 'days'}`;
    const more = byId('af-more');
    if (more) more.open = Boolean(app);
    showError('af-error', '');
    updateFound();
}

/** The form as fields for store.addApplication or updateApplication, plus
 *  whether the follow-up offer was kept. */
export function readApplicationForm() {
    const fields = {};
    for (const [field, id] of Object.entries(AF)) fields[field] = value(id);
    const follow = byId('af-follow');
    return { fields, followUp: Boolean(follow && follow.checked) };
}

/** What is wrong with the fields, in a sentence, or ''. */
export function validateApplication(fields) {
    if (!fields.company && !fields.role) return 'Please enter a company or a role.';
    if (fields.appliedOn && !isDateString(fields.appliedOn)) return 'Please choose a real date for when you applied.';
    const min = fields.salaryMin === '' ? null : Number(fields.salaryMin);
    const max = fields.salaryMax === '' ? null : Number(fields.salaryMax);
    if ((min != null && !(min >= 0)) || (max != null && !(max >= 0))) {
        return 'Please write the salary as a number, such as 120000.';
    }
    return '';
}

// ---- The posting helper -----------------------------------------------------

/** What the pasted posting offers that the form does not already have. */
export function foundInPosting() {
    const found = readPosting(value(AF.posting));
    const offer = {};
    if (found.url && !value(AF.url)) offer.url = found.url;
    if (found.salary && !value(AF.salaryMin) && !value(AF.salaryMax)) offer.salary = found.salary;
    return offer;
}

/** Say what the posting offers, and show the button that takes it. */
export function updateFound() {
    const offer = foundInPosting();
    const line = byId('af-found');
    const text = byId('af-found-text');
    const parts = [];
    if (offer.url) parts.push('a link');
    if (offer.salary) {
        parts.push(`a salary of ${salaryText({
            salaryMin: offer.salary.min, salaryMax: offer.salary.max,
            salaryPeriod: offer.salary.period, salaryCurrency: value(AF.salaryCurrency) || 'USD'
        })}`);
    }
    if (text) text.textContent = parts.length ? `Found in the posting: ${parts.join(' and ')}.` : '';
    if (line) line.hidden = parts.length === 0;
    return offer;
}

/** Copy what the posting offers into the empty fields. Returns what it took. */
export function useFound() {
    const offer = foundInPosting();
    if (offer.url) setValue(AF.url, offer.url);
    if (offer.salary) {
        setValue(AF.salaryMin, offer.salary.min);
        setValue(AF.salaryMax, offer.salary.max);
        setValue(AF.salaryPeriod, offer.salary.period);
    }
    const more = byId('af-more');
    if (more) more.open = true;
    updateFound();
    return offer;
}

// ---- Events -----------------------------------------------------------------

export const EF = {
    type: 'ef-type',
    title: 'ef-title',
    at: 'ef-at',
    durationMinutes: 'ef-duration',
    round: 'ef-round',
    outcome: 'ef-outcome',
    notes: 'ef-notes'
};

export function fillEventForm(ev, { defaultAt, applicationName }) {
    const src = ev || { type: 'interview', at: defaultAt, outcome: 'pending', durationMinutes: 45 };
    for (const [field, id] of Object.entries(EF)) setValue(id, src[field]);
    const title = byId('event-form-title');
    if (title) title.textContent = ev ? 'Edit event' : 'Log an event';
    const about = byId('event-form-about');
    if (about) about.textContent = applicationName || '';
    showError('ef-error', '');
}

/**
 * Build the event form's "Who was there" boxes from the application's
 * people, ticking `selected`. The whole question hides when the application
 * has nobody linked yet.
 */
export function fillEventWith(people, selected = []) {
    const row = byId('ef-with-row');
    const list = byId('ef-with');
    withBoxes = [];
    if (list) clear(list);
    if (row) row.hidden = people.length === 0;
    people.forEach((person, i) => {
        const id = `ef-with-${i}`;
        const box = h('input', { type: 'checkbox', id, value: person.id });
        box.checked = selected.includes(person.id);
        withBoxes.push(box);
        if (list) list.appendChild(h('label', { htmlFor: id }, [box, person.name]));
    });
}

export function readEventForm() {
    const fields = {};
    for (const [field, id] of Object.entries(EF)) fields[field] = value(id);
    fields.withContactIds = withBoxes.filter((b) => b.checked).map((b) => b.value);
    return fields;
}

export function validateEvent(fields) {
    if (!isDateTimeString(fields.at)) return 'Please choose a date and time.';
    if (fields.round !== '' && !(Number(fields.round) >= 1)) return 'Please write the round as a number, such as 2.';
    if (fields.durationMinutes !== '' && !(Number(fields.durationMinutes) >= 1)) {
        return 'Please write how long it lasts in minutes, such as 45.';
    }
    return '';
}

// ---- Follow-ups -------------------------------------------------------------

export function fillTaskForm(task, { defaultDue, applicationName }) {
    setValue('tf-text', task ? task.text : '');
    setValue('tf-due', task ? task.due : defaultDue);
    const title = byId('task-form-title');
    if (title) title.textContent = task ? 'Edit follow-up' : 'Add a follow-up';
    const about = byId('task-form-about');
    if (about) about.textContent = applicationName || '';
    showError('tf-error', '');
}

export function readTaskForm() {
    return { text: value('tf-text'), due: value('tf-due') };
}

export function validateTask(fields) {
    if (!fields.text) return 'Please describe the follow-up.';
    if (fields.due && !isDateString(fields.due)) return 'Please choose a real date.';
    return '';
}

// ---- Settings ---------------------------------------------------------------

export const SF = {
    weeklyGoal: 'set-goal',
    followUpDays: 'set-followup',
    ghostAfterDays: 'set-ghost'
};

export function fillSettingsForm(settings, config) {
    for (const [field, id] of Object.entries(SF)) {
        setValue(id, settings[field]);
        const el = byId(id);
        if (el) {
            el.min = String(config.settingsBounds[field].min);
            el.max = String(config.settingsBounds[field].max);
        }
    }
}

export function readSettingsForm() {
    const out = {};
    for (const [field, id] of Object.entries(SF)) {
        const v = value(id);
        if (v !== '') out[field] = Number(v);
    }
    return out;
}

// ---- Contacts ---------------------------------------------------------------

export const CF = {
    name: 'cf-name',
    title: 'cf-title',
    company: 'cf-company',
    email: 'cf-email',
    phone: 'cf-phone',
    linkedIn: 'cf-linkedin',
    notes: 'cf-notes'
};

/** Fill the contact form for a new person (`contact` null) or an edit.
 *  `about` says what a new one will be linked to, if anything. */
export function fillContactForm(contact, { about = '', company = '' } = {}) {
    for (const [field, id] of Object.entries(CF)) setValue(id, contact ? contact[field] : field === 'company' ? company : '');
    const title = byId('contact-form-title');
    if (title) title.textContent = contact ? 'Edit contact' : 'New contact';
    const note = byId('contact-form-about');
    if (note) note.textContent = about;
    showError('cf-error', '');
}

export function readContactForm() {
    const fields = {};
    for (const [field, id] of Object.entries(CF)) fields[field] = value(id);
    return fields;
}

export function validateContact(fields) {
    if (!fields.name) return 'Please enter a name.';
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return 'That email address looks incomplete.';
    if (fields.linkedIn && !safeUrl(fields.linkedIn)) return 'Please check the LinkedIn link.';
    return '';
}
