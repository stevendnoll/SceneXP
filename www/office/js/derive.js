// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * derive.js - Everything the office knows that is not written in the document.
 *
 * Pure functions of a document, a config, and a Date handed in as `now`.
 * Nothing here reads the clock, touches the DOM, or imports THREE, so all of
 * it runs under plain Node and the rules can be read in one sitting.
 *
 * WHAT IS IN THE WASTEBASKET DOES NOT COUNT. Every function here reads only
 * live records, and an event or follow-up only counts while its application
 * is live too.
 *
 * GHOSTED IS DERIVED, NEVER STORED. An application goes quiet when it has
 * been silent past the visitor's threshold with nothing on the calendar, and
 * an event, a status change or a ticked follow-up brings it back. Nobody
 * types that word about their own search.
 *
 * AN EDIT IS NOT ACTIVITY. Fixing a typo is not hearing back, and an
 * application from August entered today has still been quiet since August.
 * Counting `updatedAt` made every backfilled application look fresh for three
 * weeks (found by the first query test, 2026-09-24).
 *
 * INPUTS, NOT OUTCOMES. The weekly goal counts applications sent, which are
 * the visitor's to control. Replies and offers are reported, never scored.
 */

import { parseLocal, daysBetween, weekKey, weekStart, addDays, today, formatDate } from './dates.min.js';

export const live = (record) => !record.deletedAt;

/** The funnel's stages, in order. `saved` is before the funnel starts. */
export const FUNNEL = ['applied', 'screening', 'interviewing', 'offer', 'accepted'];

// ---- An index over the document ---------------------------------------------

/**
 * The live records grouped the way every view asks for them: events and
 * follow-ups by application (only for live applications), and contacts by id.
 * Built once per refresh and handed around, so the grid does not scan the
 * whole document once per row.
 */
export function buildIndex(doc) {
    const liveApps = new Set(doc.applications.filter(live).map((a) => a.id));
    const eventsByApp = new Map();
    const tasksByApp = new Map();
    for (const e of doc.events) {
        if (!live(e) || !liveApps.has(e.applicationId)) continue;
        if (!eventsByApp.has(e.applicationId)) eventsByApp.set(e.applicationId, []);
        eventsByApp.get(e.applicationId).push(e);
    }
    for (const t of doc.tasks) {
        if (!live(t) || (t.applicationId && !liveApps.has(t.applicationId))) continue;
        const key = t.applicationId || '';
        if (!tasksByApp.has(key)) tasksByApp.set(key, []);
        tasksByApp.get(key).push(t);
    }
    for (const list of eventsByApp.values()) list.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    const contactsById = new Map(doc.contacts.filter(live).map((c) => [c.id, c]));
    return {
        eventsByApp,
        tasksByApp,
        contactsById,
        events: (id) => eventsByApp.get(id) || [],
        tasks: (id) => tasksByApp.get(id) || []
    };
}

// ---- Activity and ghosting --------------------------------------------------

/**
 * The most recent moment the search moved on an application: the day it was
 * applied for, its last status change, any event on its calendar (a scheduled
 * interview is activity, since it means things are moving), or a follow-up
 * ticked off. Never a plain edit. A Date, or null for a record with no usable
 * date at all.
 */
export function lastActivityOn(app, events = [], tasks = []) {
    let latest = null;
    const consider = (d) => {
        if (d && !Number.isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
    };
    consider(parseLocal(app.appliedOn));
    if (app.statusAt) consider(new Date(app.statusAt));
    for (const e of events) consider(parseLocal(e.at));
    for (const t of tasks) if (t.doneAt) consider(new Date(t.doneAt));
    return latest;
}

/** Whether an event is still ahead of `now`. */
export function isUpcoming(event, now) {
    const when = parseLocal(event.at);
    return Boolean(when) && when.getTime() > now.getTime();
}

/** The next event ahead of `now` in a list, or null. */
export function nextEvent(events, now) {
    let next = null;
    for (const e of events) {
        if (isUpcoming(e, now) && (!next || e.at < next.at)) next = e;
    }
    return next;
}

/**
 * Whether a live application has gone quiet: in a status that waits on
 * somebody else, nothing on the calendar, and no activity for longer than the
 * visitor's threshold.
 */
export function isGhosted(app, events, tasks, settings, config, now) {
    if (!config.ghostableStatuses.includes(app.status)) return false;
    if (nextEvent(events, now)) return false;
    const last = lastActivityOn(app, events, tasks);
    if (!last) return false;
    return daysBetween(last, now) > settings.ghostAfterDays;
}

/** The status to show: the stored one, or `ghosted` when it has gone quiet. */
export function effectiveStatus(app, index, settings, config, now) {
    return isGhosted(app, index.events(app.id), index.tasks(app.id), settings, config, now)
        ? 'ghosted'
        : app.status;
}

// ---- Today ------------------------------------------------------------------

/**
 * Open follow-ups that are due: `overdue` before today and `today` on it, each
 * oldest due first. Undated follow-ups are never due, so they wait quietly on
 * their application rather than nagging from the monitor.
 */
export function dueTasks(doc, now) {
    const index = buildIndex(doc);
    const day = today(now);
    const overdue = [];
    const dueToday = [];
    for (const list of index.tasksByApp.values()) {
        for (const t of list) {
            if (t.doneAt || !t.due) continue;
            if (t.due < day) overdue.push(t);
            else if (t.due === day) dueToday.push(t);
        }
    }
    const byDue = (a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt);
    return { overdue: overdue.sort(byDue), today: dueToday.sort(byDue) };
}

/** Events from `now` through the end of the day `days` from today, soonest
 *  first. */
export function upcomingEvents(doc, now, days = 7) {
    const index = buildIndex(doc);
    const last = formatDate(addDays(now, days));
    const out = [];
    for (const list of index.eventsByApp.values()) {
        for (const e of list) {
            if (isUpcoming(e, now) && e.at.slice(0, 10) <= last) out.push(e);
        }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The follow-up the office offers after an application is logged: "Follow up
 * with Acme", due `followUpDays` from today. The fields for store.addTask.
 */
export function followUpFor(app, settings, now) {
    return {
        applicationId: app.id,
        text: `Follow up with ${app.company || app.role}`,
        due: formatDate(addDays(now, settings.followUpDays)),
        auto: true
    };
}

// ---- Weeks ------------------------------------------------------------------

function sentApplications(doc) {
    return doc.applications.filter((a) => live(a) && a.status !== 'saved' && parseLocal(a.appliedOn));
}

/** Applications sent in the week that holds `now` (weeks start on Monday),
 *  against the visitor's goal. */
export function weekly(doc, now) {
    const key = weekKey(now);
    const count = sentApplications(doc).filter((a) => weekKey(parseLocal(a.appliedOn)) === key).length;
    const goal = doc.settings.weeklyGoal;
    return { key, count, goal, met: count >= goal, remaining: Math.max(0, goal - count) };
}

/** Applications sent per week for the last `weeks` weeks, oldest first,
 *  including the current one. */
export function perWeek(doc, now, weeks = 8) {
    const start = weekStart(now);
    const keys = [];
    for (let i = weeks - 1; i >= 0; i--) keys.push(formatDate(addDays(start, -7 * i)));
    const counts = new Map(keys.map((k) => [k, 0]));
    for (const a of sentApplications(doc)) {
        const k = weekKey(parseLocal(a.appliedOn));
        if (counts.has(k)) counts.set(k, counts.get(k) + 1);
    }
    return keys.map((key) => ({ key, count: counts.get(key) }));
}

// ---- The funnel and replies -------------------------------------------------

/**
 * How far an application got, as an index into FUNNEL, or -1 for one only
 * saved. Read from its status AND its events, because a rejection after two
 * interviews still reached interviewing, and the status alone forgets that.
 */
export function stageReached(app, events, config) {
    if (app.status === 'saved' && !events.length) return -1;
    let stage = 0;
    const statusStage = FUNNEL.indexOf(app.status);
    if (statusStage > stage) stage = statusStage;
    for (const e of events) {
        const s = FUNNEL.indexOf(config.eventAdvances[e.type]);
        if (s > stage) stage = s;
    }
    return stage;
}

/** How many live applications reached each stage of the funnel. */
export function funnel(doc, config) {
    const index = buildIndex(doc);
    const counts = FUNNEL.map(() => 0);
    for (const app of doc.applications) {
        if (!live(app)) continue;
        const reached = stageReached(app, index.events(app.id), config);
        for (let i = 0; i <= reached; i++) counts[i]++;
    }
    return FUNNEL.map((stage, i) => ({ stage, count: counts[i] }));
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How often, and how quickly, companies reply. An application has had a reply
 * once any event is logged on it or its status has moved past `applied`
 * (a rejection is a reply too). Withdrawn ones the visitor closed themselves
 * are left out of both sides. `medianDays` is from the application date to the
 * first event, or to the closing day for a rejection with no events.
 */
export function responseStats(doc, config) {
    const index = buildIndex(doc);
    let sent = 0;
    let replied = 0;
    const days = [];
    for (const app of sentApplications(doc)) {
        if (app.status === 'withdrawn') continue;
        sent++;
        const events = index.events(app.id);
        const moved = app.status !== 'applied';
        if (!events.length && !moved) continue;
        replied++;
        const first = events.find((e) => e.at);
        const when = first ? parseLocal(first.at) : parseLocal(app.closedOn);
        const from = parseLocal(app.appliedOn);
        if (when && from) {
            const d = daysBetween(from, when);
            if (d >= 0) days.push(d);
        }
    }
    return { sent, replied, rate: sent ? replied / sent : null, medianDays: median(days) };
}

// ---- Everything at once -----------------------------------------------------

/** The numbers the office shows in one place: the grid's summary bar now,
 *  and the whiteboard later. */
export function stats(doc, config, now) {
    const index = buildIndex(doc);
    const apps = doc.applications.filter(live);
    const due = dueTasks(doc, now);
    let ghosted = 0;
    let open = 0;
    for (const app of apps) {
        if (config.closedStatuses.includes(app.status)) continue;
        open++;
        if (effectiveStatus(app, index, doc.settings, config, now) === 'ghosted') ghosted++;
    }
    return {
        applications: apps.length,
        open,
        ghosted,
        contacts: index.contactsById.size,
        weekly: weekly(doc, now),
        dueToday: due.today.length,
        overdue: due.overdue.length,
        upcoming: upcomingEvents(doc, now, 7).length,
        funnel: funnel(doc, config),
        response: responseStats(doc, config)
    };
}
