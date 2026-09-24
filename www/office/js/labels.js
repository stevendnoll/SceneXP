// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * labels.js - The words the office shows for the words it stores.
 *
 * The document stores short machine words (`rejected`, `screen`, `onsite`)
 * and this is the one table that turns each into what a visitor reads. Two
 * are deliberately gentler than the stored word: a rejection reads "Not
 * selected" and a ghosted application reads "Gone quiet", because this is a
 * tool somebody opens on a hard day too.
 *
 * Pure. House style applies (tests/office-copy.test.mjs).
 */

export const STATUS_LABELS = {
    saved: 'Saved for later',
    applied: 'Applied',
    screening: 'Screening',
    interviewing: 'Interviewing',
    offer: 'Offer',
    accepted: 'Accepted',
    rejected: 'Not selected',
    withdrawn: 'Withdrawn',
    ghosted: 'Gone quiet'
};

export const EVENT_LABELS = {
    screen: 'Phone screen',
    interview: 'Interview',
    assessment: 'Assessment',
    offer: 'Offer',
    call: 'Call',
    email: 'Email',
    other: 'Other'
};

export const OUTCOME_LABELS = {
    pending: 'Waiting to hear',
    passed: 'Moved forward',
    declined: 'Did not move forward',
    none: 'No outcome needed'
};

export const WORK_MODE_LABELS = {
    onsite: 'On site',
    hybrid: 'Hybrid',
    remote: 'Remote',
    unknown: 'Not sure yet'
};

export const SORT_LABELS = {
    activity: 'Last activity',
    company: 'Company',
    applied: 'Date applied',
    status: 'Status',
    salary: 'Salary'
};

/** Where a search word was found, as the grid says it ("Found in the
 *  posting"). */
export const MATCH_LABELS = {
    company: 'the company',
    role: 'the role',
    location: 'the location',
    source: 'the source',
    notes: 'your notes',
    posting: 'the posting',
    contacts: 'a contact',
    events: 'an event',
    tasks: 'a follow-up'
};

export const COLLECTION_LABELS = {
    applications: 'Application',
    events: 'Event',
    contacts: 'Contact',
    tasks: 'Follow-up'
};

export const STATION_LABELS = {
    desk: 'Desk',
    computer: 'Computer',
    calendar: 'Calendar',
    cabinet: 'Filing cabinet',
    board: 'Corkboard',
    rolodex: 'Rolodex',
    whiteboard: 'Whiteboard',
    departures: 'Departures board',
    window: 'The window'
};

/** "Interview, round 2" or "Phone screen". */
export function eventName(ev) {
    const base = EVENT_LABELS[ev.type];
    return ev.round && ev.type === 'interview' ? `${base}, round ${ev.round}` : base;
}

/** "Acme, Product Designer", or whichever half there is. */
export function applicationName(app) {
    if (!app) return '';
    return app.company && app.role ? `${app.company}, ${app.role}` : app.company || app.role;
}

/** A money amount with no cents, in the application's currency. */
export function money(amount, currency = 'USD') {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch (e) {
        return `${currency} ${Math.round(amount).toLocaleString('en-US')}`;
    }
}

/** "$120,000 to $150,000 a year", "$60 an hour", or '' when there is none. */
export function salaryText(app) {
    const { salaryMin: min, salaryMax: max, salaryCurrency: cur } = app;
    if (min == null && max == null) return '';
    const per = app.salaryPeriod === 'hour' ? 'an hour' : 'a year';
    if (min != null && max != null && min !== max) return `${money(min, cur)} to ${money(max, cur)} ${per}`;
    if (min == null) return `Up to ${money(max, cur)} ${per}`;
    return `${money(min ?? max, cur)} ${per}`;
}

/** "Found in the posting and a contact", for a row whose match is not in a
 *  column the grid shows. '' when the company or role matched, since the
 *  visitor can already see why that row is there. */
export function matchNote(matches) {
    if (!matches || !matches.length || matches.includes('company') || matches.includes('role')) return '';
    const words = matches.map((m) => MATCH_LABELS[m]);
    const list = words.length === 1 ? words[0]
        : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
    return `Found in ${list}`;
}
