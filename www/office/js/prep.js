// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * prep.js - The interview prep sheet the printer prints: one application on
 * one page, with room to write.
 *
 * Everything the office knows about the application, in the order a visitor
 * wants it on the way to an interview: who, what, when next, who they will
 * meet, what happened before, what is still to do, their notes, and the
 * posting, then ruled space for questions to ask. It is printed from the
 * browser's own print dialog (a print stylesheet, no PDF library), so
 * "Save as PDF" is there too.
 *
 * Pure: the sheet as data. panels.js lays it out as text.
 */

import { eventsFor, tasksFor, contactsFor, findApplication } from './store.min.js';
import { isUpcoming, buildIndex, effectiveStatus } from './derive.min.js';
import {
    STATUS_LABELS, WORK_MODE_LABELS, OUTCOME_LABELS, applicationName, salaryText, eventName
} from './labels.min.js';
import { displayDate, displayDateTime, formatDate } from './dates.min.js';
import { contactLine } from './rolodex.min.js';

/** How many ruled lines the sheet leaves for questions. */
export const QUESTION_LINES = 6;

/**
 * The prep sheet for an application, or null when there is no such live
 * application. `now` dates the sheet and splits the events into what is
 * coming and what has happened.
 */
export function prepSheet(doc, appId, config, now) {
    const app = findApplication(doc, appId);
    if (!app || app.deletedAt) return null;
    const index = buildIndex(doc);
    const people = new Map(doc.contacts.map((c) => [c.id, c]));
    const withNames = (ev) => ev.withContactIds.map((id) => people.get(id)).filter((c) => c && !c.deletedAt).map((c) => c.name);
    const events = eventsFor(doc, app.id);
    const row = (ev) => ({
        what: eventName(ev),
        when: displayDateTime(ev.at),
        title: ev.title,
        with: withNames(ev),
        outcome: ev.outcome === 'none' ? '' : OUTCOME_LABELS[ev.outcome]
    });
    const facts = [
        ['Status', STATUS_LABELS[effectiveStatus(app, index, doc.settings, config, now)]],
        ['Applied', app.appliedOn ? displayDate(app.appliedOn) : ''],
        ['Work', app.workMode !== 'unknown' ? WORK_MODE_LABELS[app.workMode] : ''],
        ['Location', app.location],
        ['Salary', salaryText(app)],
        ['Found through', app.source],
        ['Posting', app.url]
    ].filter(([, v]) => v);
    return {
        title: applicationName(app),
        company: app.company,
        role: app.role,
        facts,
        people: contactsFor(doc, app).map((c) => ({
            name: c.name, line: contactLine(c), email: c.email, phone: c.phone
        })),
        upcoming: events.filter((ev) => isUpcoming(ev, now)).map(row),
        past: events.filter((ev) => !isUpcoming(ev, now)).map(row).reverse(),
        tasks: tasksFor(doc, app.id).filter((t) => !t.doneAt).map((t) => ({ text: t.text, due: t.due ? displayDate(t.due) : '' })),
        notes: app.notes,
        posting: app.posting,
        printed: `Printed from Corner Office on ${displayDate(formatDate(now))}.`
    };
}

/**
 * The applications worth printing for, soonest interview first, then the
 * rest by name: what the printer offers in its list.
 */
export function printChoices(doc, now) {
    const index = buildIndex(doc);
    const soonest = (app) => {
        const next = index.events(app.id).find((ev) => isUpcoming(ev, now));
        return next ? next.at : null;
    };
    return doc.applications
        .filter((a) => !a.deletedAt)
        .map((app) => ({ app, next: soonest(app) }))
        .sort((a, b) => {
            if (a.next && b.next) return a.next.localeCompare(b.next);
            if (a.next || b.next) return a.next ? -1 : 1;
            return applicationName(a.app).localeCompare(applicationName(b.app));
        });
}
