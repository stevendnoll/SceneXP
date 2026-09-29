// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * samples.js - "Stock the office": a search in progress, for anyone who wants
 * to see the office full before trusting it with their own.
 *
 * EVERY NAME HERE IS INVENTED. The companies are made-up compound names
 * chosen to sound like nobody in particular, and the people are ordinary
 * first and last names attached to them. No real company appears anywhere,
 * and if one of these ever turns out to be somebody's trademark, it should
 * simply be renamed here.
 *
 * DATES ARE RELATIVE TO TODAY, so the samples always look current: there is
 * an interview in two days, a follow-up due today, one overdue, and two
 * applications that have gone quiet. Every record carries `sample: true`, so
 * "Clear the samples" (store.clearSamples) removes exactly these and nothing
 * the visitor typed.
 *
 * BUILT AS RECORDS, NOT THROUGH THE MUTATIONS. A mutation stamps everything
 * with now: a rejection would close today and an offer would have moved
 * today, and nothing would ever look quiet. Each record is written with the
 * days it really happened on and passed through the store's own normalizers,
 * so a sample is exactly as valid as anything a visitor enters. Samples add
 * no log lines.
 *
 * Pure apart from the id maker, which a test may replace.
 */

import { addDays, formatDate, formatDateTime } from './dates.min.js';
import { newId } from './ids.min.js';
import {
    normalizeApplication, normalizeEvent, normalizeContact, normalizeTask, hasSamples
} from './store.min.js';

/** People, by a short key the applications below refer to. */
const PEOPLE = {
    priya: { name: 'Priya Anand', title: 'Senior Recruiter', company: 'Brightkettle', email: 'priya@brightkettle.example' },
    marcus: { name: 'Marcus Oyelaran', title: 'Hiring Manager', company: 'Tidewater Robotics' },
    lena: { name: 'Lena Fischer', title: 'Engineering Manager', company: 'Quillfeather Labs' },
    jordan: { name: 'Jordan Reyes', title: 'Talent Partner', company: 'Harborlight Analytics' },
    dana: { name: 'Dana Whitcombe', title: 'Former colleague', company: 'Copperleaf Health', notes: 'Offered to refer me. Owe her a coffee.' }
};

/**
 * The applications. `applied` and every `at` or `due` are days from today
 * (negative is the past), and an event's `hour` is its local time of day.
 * `closed` and `moved` are the days a closing status or the last status
 * change happened.
 */
const APPLICATIONS = [
    {
        key: 'brightkettle', company: 'Brightkettle', role: 'Senior Product Designer', status: 'interviewing',
        applied: -18, moved: -12, workMode: 'hybrid', location: 'Portland, OR', salary: [135000, 160000],
        source: 'Company careers page', url: 'https://brightkettle.example/careers/product-designer',
        people: ['priya'],
        notes: 'Design team of eight. They care a lot about accessibility, which is a great fit.',
        events: [
            { type: 'screen', at: -12, hour: 10, outcome: 'passed', with: ['priya'], title: 'Recruiter call' },
            { type: 'interview', at: -5, hour: 13, outcome: 'passed', round: 1, title: 'Portfolio review' },
            { type: 'interview', at: 2, hour: 14, round: 2, title: 'Panel with the design team', duration: 90 }
        ],
        tasks: [
            { text: 'Send a thank-you note to the portfolio reviewers', due: -4, done: -4 },
            { text: 'Prepare the case study walkthrough', due: 1 }
        ]
    },
    {
        key: 'tidewater', company: 'Tidewater Robotics', role: 'Frontend Engineer', status: 'screening',
        applied: -9, moved: -3, workMode: 'onsite', location: 'Oakland, CA', salary: [140000, 165000],
        source: 'Job board', people: ['marcus'],
        events: [{ type: 'screen', at: 1, hour: 10.5, with: ['marcus'], title: 'Intro call with the hiring manager' }],
        tasks: [{ text: 'Read up on their warehouse robots', due: 0 }]
    },
    {
        key: 'quillfeather', company: 'Quillfeather Labs', role: 'Staff Engineer', status: 'offer',
        applied: -40, moved: -3, workMode: 'remote', salary: [185000, 210000], people: ['lena'],
        source: 'Recruiter reached out',
        notes: 'Offer came in at the top of the range. Ask about the learning budget.',
        events: [
            { type: 'screen', at: -34, hour: 11, outcome: 'passed' },
            { type: 'interview', at: -26, hour: 15, round: 1, outcome: 'passed', with: ['lena'], title: 'Technical interview' },
            { type: 'interview', at: -19, hour: 10, round: 2, outcome: 'passed', title: 'Onsite loop', duration: 240 },
            { type: 'offer', at: -3, hour: 16, outcome: 'none', title: 'Verbal offer from Lena', with: ['lena'] }
        ],
        tasks: [{ text: 'Reply to the offer', due: 3 }]
    },
    {
        key: 'harborlight', company: 'Harborlight Analytics', role: 'Data Visualization Engineer', status: 'applied',
        applied: -6, workMode: 'remote', people: ['jordan'], source: 'Referral',
        tasks: [{ text: 'Follow up with Harborlight Analytics', due: 1, auto: true }]
    },
    {
        key: 'mossgate', company: 'Mossgate Studio', role: 'UX Researcher', status: 'applied',
        applied: -35, workMode: 'hybrid', location: 'Seattle, WA', source: 'Job board',
        tasks: [{ text: 'Follow up with Mossgate Studio', due: -3, auto: true }]
    },
    {
        key: 'pebblewick', company: 'Pebblewick Bank', role: 'Product Manager', status: 'rejected',
        applied: -30, moved: -22, closed: -22, workMode: 'onsite', location: 'Chicago, IL',
        events: [{ type: 'screen', at: -24, hour: 9, outcome: 'declined' }]
    },
    {
        key: 'lanternfish', company: 'Lanternfish Games', role: 'Gameplay Programmer', status: 'saved',
        workMode: 'remote', notes: 'Applications close on Friday. Polish the WebGL demo first.'
    },
    {
        key: 'copperleaf', company: 'Copperleaf Health', role: 'Senior Frontend Engineer', status: 'applied',
        applied: -2, workMode: 'remote', salary: [150000, 175000], source: 'Referral from Dana', people: ['dana'],
        tasks: [{ text: 'Follow up with Copperleaf Health', due: 5, auto: true }]
    },
    {
        key: 'juniper', company: 'Juniper & Vale', role: 'Design Systems Lead', status: 'interviewing',
        applied: -14, moved: -8, workMode: 'hybrid', location: 'Austin, TX', salary: [160000, 180000],
        events: [
            { type: 'assessment', at: -2, hour: 17, outcome: 'passed', title: 'Take-home component audit' },
            { type: 'interview', at: 5, hour: 11, round: 1, title: 'Meet the design systems team' }
        ]
    },
    {
        key: 'saltmarsh', company: 'Saltmarsh Transit', role: 'Web Developer', status: 'applied',
        applied: -1, workMode: 'hybrid', location: 'Boston, MA', salary: [105000, 125000], source: 'City jobs site'
    },
    {
        key: 'fernhollow', company: 'Fernhollow Books', role: 'Frontend Developer', status: 'withdrawn',
        applied: -20, moved: -11, closed: -11, workMode: 'onsite',
        notes: 'Withdrew after the commute math. Lovely people.'
    },
    {
        key: 'orchard', company: 'Orchard Street Media', role: 'Creative Technologist', status: 'applied',
        applied: -4, workMode: 'remote', source: 'Newsletter'
    },
    {
        key: 'glasswing', company: 'Glasswing Energy', role: 'Software Engineer II', status: 'applied',
        applied: -26, workMode: 'onsite', location: 'Denver, CO', source: 'Job board'
    },
    {
        key: 'kestrel', company: 'Kestrel Freight', role: 'Senior UI Engineer', status: 'rejected',
        applied: -21, moved: -8, closed: -8, workMode: 'remote', salary: [145000, 165000],
        events: [
            { type: 'screen', at: -15, hour: 12, outcome: 'passed' },
            { type: 'interview', at: -10, hour: 14, round: 1, outcome: 'declined', title: 'System design' }
        ],
        notes: 'They went with somebody with more logistics experience. Asked to stay in touch.'
    },
    {
        key: 'brambleway', company: 'Brambleway Coffee', role: 'Web Designer (contract)', status: 'applied',
        applied: -3, workMode: 'remote', salary: [55, 70], period: 'hour'
    },
    {
        key: 'tinderbox', company: 'Tinderbox Studio', role: '3D Web Developer', status: 'screening',
        applied: -7, moved: -1, workMode: 'remote', salary: [120000, 140000],
        events: [{ type: 'email', at: -1, hour: 9, outcome: 'none', title: 'Asked for a portfolio link' }]
    }
];

function day(now, offset) {
    return formatDate(addDays(now, offset));
}

function moment(now, offset, hour = 9) {
    const d = addDays(now, offset);
    const whole = Math.floor(hour);
    return formatDateTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), whole, Math.round((hour - whole) * 60)));
}

function stampAt(now, offset, hour = 12) {
    const d = addDays(now, offset);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).toISOString();
}

/**
 * The sample records, normalized, with fresh ids. `makeId` lets a test hand
 * in predictable ids.
 */
export function sampleRecords(config, now, makeId = newId) {
    const created = now.toISOString();
    const base = { sample: true, createdAt: created, updatedAt: created, deletedAt: null };
    const contactIds = {};
    const contacts = [];
    for (const [key, person] of Object.entries(PEOPLE)) {
        const c = normalizeContact({ ...person, ...base, id: makeId() }, config);
        contactIds[key] = c.id;
        contacts.push(c);
    }
    const applications = [];
    const events = [];
    const tasks = [];
    for (const spec of APPLICATIONS) {
        const app = normalizeApplication({
            ...base,
            id: makeId(),
            company: spec.company,
            role: spec.role,
            status: spec.status,
            appliedOn: spec.applied == null ? null : day(now, spec.applied),
            closedOn: spec.closed == null ? null : day(now, spec.closed),
            statusAt: spec.moved == null ? null : stampAt(now, spec.moved),
            workMode: spec.workMode,
            location: spec.location,
            source: spec.source,
            url: spec.url,
            notes: spec.notes,
            salaryMin: spec.salary ? spec.salary[0] : null,
            salaryMax: spec.salary ? spec.salary[1] : null,
            salaryPeriod: spec.period || 'year',
            contactIds: (spec.people || []).map((k) => contactIds[k])
        }, config);
        applications.push(app);
        const ids = new Set([app.id]);
        for (const ev of spec.events || []) {
            events.push(normalizeEvent({
                ...base,
                id: makeId(),
                applicationId: app.id,
                type: ev.type,
                title: ev.title,
                at: moment(now, ev.at, ev.hour),
                durationMinutes: ev.duration || (ev.type === 'email' ? null : 45),
                round: ev.round,
                outcome: ev.outcome || 'pending',
                withContactIds: (ev.with || []).map((k) => contactIds[k])
            }, config, ids));
        }
        for (const t of spec.tasks || []) {
            tasks.push(normalizeTask({
                ...base,
                id: makeId(),
                applicationId: app.id,
                text: t.text,
                due: day(now, t.due),
                doneAt: t.done == null ? null : stampAt(now, t.done, 17),
                auto: t.auto === true
            }, config, ids));
        }
    }
    return { applications, events, contacts, tasks };
}

/**
 * The document with the samples added alongside whatever is there. Refused
 * when samples are already in, so a double press cannot stock two sets.
 */
export function stockSamples(doc, config, now, makeId = newId) {
    if (hasSamples(doc)) return { doc, record: null, error: 'The office is already stocked with samples.' };
    const r = sampleRecords(config, now, makeId);
    return {
        doc: {
            ...doc,
            applications: [...doc.applications, ...r.applications],
            events: [...doc.events, ...r.events],
            contacts: [...doc.contacts, ...r.contacts],
            tasks: [...doc.tasks, ...r.tasks]
        },
        record: null,
        error: null,
        count: r.applications.length
    };
}
