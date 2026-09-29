// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * rolodex.js - The people: recruiters, hiring managers, interviewers,
 * referrals. What the Rolodex card lists, and what each person is part of.
 *
 * A PERSON IS LINKED THROUGH APPLICATIONS AND EVENTS. `linksOf` gathers both,
 * so a recruiter linked to one application and met at an interview on
 * another shows under both.
 *
 * Pure. The Rolodex was a wheel on the desk until QA on 2026-09-25 took it
 * away, and it is a list alone now.
 */

import { buildIndex, live } from './derive.min.js';

/** "Senior Recruiter at Brightkettle", or whichever half there is. */
export function contactLine(c) {
    if (!c) return '';
    if (c.title && c.company) return `${c.title} at ${c.company}`;
    return c.title || c.company || '';
}

/** The People cell of the grid: "Priya Anand", "Priya Anand and Lena
 *  Fischer", or "Priya Anand, Lena Fischer and 2 more". */
export function peopleText(names) {
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The live contacts an application is linked to, in link order. */
export function peopleOf(doc, app, index = buildIndex(doc)) {
    return app.contactIds.map((id) => index.contactsById.get(id)).filter(Boolean);
}

/**
 * Everything a person is part of: the live applications they are linked to
 * directly or through an event, and the events they were at, soonest last.
 */
export function linksOf(doc, contactId, index = buildIndex(doc)) {
    const apps = new Map();
    const events = [];
    for (const app of doc.applications) {
        if (!live(app)) continue;
        if (app.contactIds.includes(contactId)) apps.set(app.id, app);
        for (const ev of index.events(app.id)) {
            if (ev.withContactIds.includes(contactId)) {
                events.push(ev);
                apps.set(app.id, app);
            }
        }
    }
    events.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    return { applications: [...apps.values()], events };
}

/** Whether an application involves a person, directly or through an event. */
export function involves(app, contactId, index) {
    if (app.contactIds.includes(contactId)) return true;
    return index.events(app.id).some((ev) => ev.withContactIds.includes(contactId));
}
