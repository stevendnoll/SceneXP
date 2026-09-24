// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * csv.js - The applications as a spreadsheet file.
 *
 * FORMULA INJECTION IS GUARDED. A spreadsheet runs any cell that begins with
 * `=`, `+`, `-` or `@` as a formula, and a tab or carriage return at the
 * start can smuggle one in too. A company name pasted from anywhere could be
 * `=HYPERLINK(...)`, so every such cell is written with an apostrophe in
 * front, which a spreadsheet shows as plain text. A negative number is not
 * at risk because no number field here can be negative, and the guard would
 * only ever reach one as text.
 *
 * RFC 4180 quoting, CRLF line endings, and a byte order mark at the front so
 * Excel opens the accents in "Café" as accents.
 *
 * Pure.
 */

import { buildIndex, effectiveStatus, nextEvent, live } from './derive.min.js';
import { STATUS_LABELS, WORK_MODE_LABELS, EVENT_LABELS } from './labels.min.js';
import { today } from './dates.min.js';

const RISKY_START = /^[=+\-@\t\r]/;

/** One cell, guarded and quoted as needed. */
export function csvCell(value) {
    let text = value == null ? '' : String(value);
    if (RISKY_START.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
}

/** Rows of cells as CSV text, with a byte order mark. */
export function toCsv(rows) {
    return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export const CSV_COLUMNS = [
    'Company', 'Role', 'Status', 'Applied', 'Closed', 'Work mode', 'Location', 'Salary from',
    'Salary to', 'Per', 'Currency', 'Source', 'Link', 'Contacts', 'Next event', 'Next event at',
    'Events logged', 'Open follow-ups', 'Notes', 'Sample'
];

/** Every live application as a table, in the order handed in (the grid's,
 *  so the file matches what the visitor was looking at). */
export function applicationsTable(doc, apps, config, now) {
    const index = buildIndex(doc);
    const rows = [CSV_COLUMNS];
    for (const app of apps) {
        if (!live(app)) continue;
        const events = index.events(app.id);
        const next = nextEvent(events, now);
        const contacts = app.contactIds.map((id) => index.contactsById.get(id)).filter(Boolean).map((c) => c.name);
        const openTasks = index.tasks(app.id).filter((t) => !t.doneAt).length;
        rows.push([
            app.company, app.role, STATUS_LABELS[effectiveStatus(app, index, doc.settings, config, now)],
            app.appliedOn || '', app.closedOn || '', WORK_MODE_LABELS[app.workMode], app.location,
            app.salaryMin ?? '', app.salaryMax ?? '',
            app.salaryMin == null && app.salaryMax == null ? '' : app.salaryPeriod,
            app.salaryMin == null && app.salaryMax == null ? '' : app.salaryCurrency,
            app.source, app.url, contacts.join(', '),
            next ? EVENT_LABELS[next.type] : '', next ? next.at.replace('T', ' ') : '',
            events.length, openTasks, app.notes, app.sample ? 'yes' : ''
        ]);
    }
    return rows;
}

/** The file's text and the name it is offered under. */
export function applicationsCsv(doc, apps, config, now) {
    return { text: toCsv(applicationsTable(doc, apps, config, now)), filename: `corner-office-${today(now)}.csv` };
}
