// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * analytics.js - the in-world "visitor activity" dashboard.
 *
 * Fetches the anonymized, per-day snapshots written by the collector
 * (snaps/index.json + snaps/sessions-YYYYMMDD.json), renders them into the
 * #analytics-view overlay with day-to-day navigation, and hands a compact
 * summary to a callback (main.js) so the hanging 3D screen can mirror it.
 *
 * Everything here is already anonymized server-side: throwaway labels, no hash,
 * no IP, no user agent. This module only displays what it is given, and treats
 * every value as text (never innerHTML) on principle.
 *
 * ---- TWO WAYS TO READ ONE DAY ----
 *
 * A session is a visit to the SITE, not to one experience: the proof-of-work
 * `hash` that stitches a session together lives in sessionStorage and persists
 * site-wide for up to 24 hours (see telemetry-1.0.0.js). So one session
 * routinely wanders several scenes, and the snapshot tags every EVENT with the
 * scene it happened in rather than splitting sessions apart.
 *
 * That gives two readings of the same events, which this module offers as a
 * group mode:
 *
 *   by session - the visitor's journey, in order, across whatever scenes they
 *                wandered. The original devSteve view.
 *   by scene   - a row per experience with its totals, which drills down into
 *                that scene's sessions when you pick one.
 *
 * ---- THE ACTION FILTER ----
 *
 * Actions are an open vocabulary: 80 distinct names across 16 scenes at the time
 * of writing, and every new scene adds more. So the filter's checkboxes are
 * built from the events actually on screen (the chosen day, narrowed by the
 * chosen scene) rather than from any hardcoded list. That keeps the list at a
 * median of 3 and a worst case of about 35, the way a spreadsheet's autofilter
 * offers the values in the column rather than every value in the workbook, and
 * it means a newly shipped scene's actions simply appear, already checked.
 *
 * The vocabulary deliberately ignores which boxes are ticked. Building it from
 * the filtered events instead would make a checkbox vanish the moment you
 * unticked it.
 *
 * Filter state is held in memory only, never in storage: www/privacy.html
 * enumerates every storage key this site uses by name, so a new one is a promise
 * to keep rather than a convenience. It survives the background poll the same
 * way the collapsed-session state does, and resets when the tab closes.
 */

const SNAPS_BASE = 'snaps';
const POLL_MS = 5 * 60 * 1000;     // matches the collector cadence
const POLL_OFFSET_MS = 30 * 1000;  // poll 30s after each 5-min boundary, just behind the cron
const STALE_MS = 13 * 60 * 1000;   // ~2.5 cron intervals with no update -> flag as stale
const LONG_SESSION_EVENTS = 8;     // sessions with more events than this start collapsed
const SESSION_SCENE_CHIPS = 3;     // scene chips shown on a card before "+N more"
const TOP_ACTIONS_PER_SCENE = 3;   // actions named on a scene row

// Hand-written phrasings for actions that deserve better than their slug. The
// vocabulary is open and growing, so anything missing falls through to
// humanizeAction() rather than being dropped or shown raw.
const ACTION_LABELS = {
    'session-start': 'Arrived',
    'session-end': 'Left',
    'enter-store': 'Entered the gallery',
    'leave-store': 'Left the gallery',
    'open-piece': 'Opened an art piece',
    'open-help': 'Opened the help',
    'open-card': 'Viewed the business card',
    'open-egg': 'Found an easter egg',
    'open-light-switch': 'Used the light switch',
    'click-scenery': 'Examined the scenery',
    'click-prop': 'Examined a prop',
    'click-sky': 'Looked to the sky',
    'greet-passerby': 'Greeted a passerby',
    'discovery-complete': 'Completed every discovery',
    'download-vcard': 'Saved the contact card',
    'share': 'Shared the site',
    'set-brightness': 'Adjusted the lighting',
    'autopilot': 'Toggled the autopilot',
    'call-play': 'Called a play',
    'play-result': 'A play ended',
    'next-play': 'Moved to the next play',
    'take-field': 'Took the field',
    'game-summary': 'Read the game summary',
    'tree-planted': 'Planted a tree',
    'tree-watered': 'Watered a tree',
    'water-all': 'Watered everything',
    'garden-cleared': 'Started a new garden',
    'begin-watching': 'Started the arc',
    'arc-complete': 'Watched the arc through',
    'pause': 'Paused',
    'resume': 'Resumed',
    'restart': 'Started over',
    'seek': 'Moved along the timeline',
    'run-ended': 'A run ended',
    'contact-open': 'Opened the contact details',
    'poster-open': 'Opened the poster',
};

// Display names for the experiences, so the by-scene view reads like the site
// rather than like a folder listing. Unknown slugs fall through to the slug.
const SCENE_LABELS = {
    automan: 'The Auto Man',
    dad: 'The NCR Trail',
    earthdefense: 'Earth Defense',
    family: 'Putt Putt with Mom and Dad',
    garden: 'Fractal Garden',
    gavin: "Gavin's Bug Patrol",
    highwater: 'High Water',
    interstate: 'The Interstate Tire Shop',
    jamar: "Jamar's Karaoke Night",
    job: 'Prospect City',
    mandelbrot: 'The Mandelbrot Set',
    roqui: 'Zumba with Roqui',
    seedtoseed: 'The Seed to Seed Garden',
    steve: "Steve's Home Office",
    sunnyvalejenn: 'Sunnyvale Jenn Consulting',
    xo: "X's and O's",
};

let els = null;          // the overlay's elements, supplied by initAnalytics
let onSummary = null;    // callback(summary | null) feeding the 3D screen
let indexData = null;    // { latest, days: [{ date, ... }] }
let latestSnap = null;   // the most recent day, mirrored on the in-world screen
let currentDate = null;  // 'YYYY-MM-DD' shown in the overlay (defaults to latest)
let currentSnap = null;  // the loaded day snapshot for the overlay
let pollTimer = 0;
let autoRefreshOn = false; // a single background poller, paused while the tab is hidden

// ---- View state (in memory, never stored; see the header note) --------------
let groupMode = 'session';        // 'session' | 'scene'
let sceneFilter = '';             // '' = every scene, else one scene slug
const hiddenActions = new Set();  // action names the viewer has unticked

// Which session cards the viewer has collapsed, keyed by a stable session key so a
// background re-render (the 5-min poll) preserves what they collapsed rather than
// snapping everything back open. Default is empty -> every session starts expanded.
const collapsedSessions = new Set();
// Sessions we've already applied the "long sessions start collapsed" default to,
// so the default fires once on first sight and never overrides a later manual toggle.
const seenSessions = new Set();
let timelineSeq = 0; // unique ids for aria-controls wiring

// ---- small helpers ---------------------------------------------------------

function cacheBust(url) {
    return `${url}?t=${Date.now()}`;
}

function dayUrl(dateIso) {
    return `${SNAPS_BASE}/sessions-${dateIso.replace(/-/g, '')}.json`;
}

async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/** A slug as a sentence: 'reached-tsunami' -> 'Reached tsunami'. The fallback
 *  for every action the label map has not been taught, which is most of them
 *  and always will be. */
export function humanizeAction(action) {
    const words = String(action || '').replace(/-/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

function prettyAction(a) {
    return ACTION_LABELS[a] || humanizeAction(a);
}

/** An experience's display name, or its slug when we have not been told one
 *  (a scene that shipped after this map was last edited). */
export function prettyScene(slug) {
    return SCENE_LABELS[slug] || slug || '';
}

/** "just now" / "4m ago" / "3h ago" / "2d ago" from an ISO timestamp. */
function relTime(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (secs < 45) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The timezone the day on screen was cut in, from the snapshot's own
 * `timezone` field ('' when a file does not say, which reads as the viewer's).
 *
 * ---- A DAY'S TIMES ARE SHOWN IN THE ZONE THE DAY WAS CUT IN ----
 *
 * The collector decides which day a visit belongs to, and since 2026-09-19 it
 * cuts days on Pacific time (it was UTC before). Showing that day's times in
 * the VIEWER'S zone instead would let a page claim to be "Sep 18" while listing
 * clock times from Sep 17 or Sep 19 for anyone further east, which is exactly
 * the muddle Pacific days were brought in to end. Reading the zone per file,
 * rather than assuming one, also keeps a day cut on UTC before the switch
 * labeled and shown as UTC. The timestamps themselves are UTC in the file, so
 * nothing is lost: only how they are presented follows the day.
 */
let dayZone = '';

/** A localized, human-readable time-of-day, in `zone` when one is given (the
 *  day's own zone, by default) or the viewer's own otherwise. An unknown zone
 *  name falls back to the viewer's clock rather than failing to render. */
function localTime(iso, zone = dayZone) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const opts = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
    if (zone) {
        try {
            return d.toLocaleTimeString(undefined, { ...opts, timeZone: zone });
        } catch (e) {
            /* not a zone this browser knows: show the viewer's own clock */
        }
    }
    return d.toLocaleTimeString(undefined, opts);
}

/** A zone's everyday name for the status line: 'America/Los_Angeles' reads as
 *  "Pacific Time" (both halves of the year, which is why it is the generic
 *  name and not "Pacific Daylight Time"). English, because the rest of the
 *  dashboard is. Falls back to the raw name for a zone the browser cannot
 *  name, and to nothing for no zone at all. */
export function zoneLabel(zone) {
    if (!zone) return '';
    if (zone === 'UTC') return 'UTC';
    try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
            .formatToParts(new Date())
            .find(p => p.type === 'timeZoneName');
        if (part && part.value) return part.value;
    } catch (e) {
        /* unknown zone, or a browser without generic zone names */
    }
    return zone;
}

/** A localized, human-readable date for a day key ('YYYY-MM-DD'). The key
 *  names the calendar day the collector cut (in the day's own zone); this only
 *  formats it, pinning the formatter to UTC so the calendar date never shifts
 *  under the viewer's offset. */
function prettyDate(ymd) {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
}

function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

function availableDates() {
    return (indexData && Array.isArray(indexData.days))
        ? indexData.days.map(d => d.date)
        : [];
}

function hasDate(date) {
    return availableDates().includes(date);
}

function isStale(snap) {
    if (!snap || !snap.generated_at) return false;
    const t = Date.parse(snap.generated_at);
    return !isNaN(t) && (Date.now() - t) > STALE_MS;
}

// ---- Pure view-model helpers ------------------------------------------------
// The filtering and grouping all live here as plain functions over a snapshot,
// so they can be tested without a DOM and so the render path below stays thin.

/** The scenes a run of events touched, in the order they were first reached.
 *  That ordering is the visitor's route, so it is worth keeping over sorting. */
export function scenesOf(events) {
    const seen = [];
    for (const e of events || []) {
        if (e && e.scene && !seen.includes(e.scene)) seen.push(e.scene);
    }
    return seen;
}

/** One session's events that survive the current scene + action filters. */
export function visibleEvents(session, scene, hidden) {
    const skip = hidden || new Set();
    return ((session && session.events) || []).filter(e =>
        e && (!scene || e.scene === scene) && !skip.has(e.action));
}

/** The day's sessions under the current filters. A session whose events are all
 *  filtered away is dropped rather than left as an empty card, and the ones that
 *  survive carry a `scenes` list recomputed from what is actually shown. */
export function filterSessions(snap, scene, hidden) {
    const out = [];
    for (const session of (snap && snap.sessions) || []) {
        const events = visibleEvents(session, scene, hidden);
        if (!events.length) continue;
        out.push({ ...session, events, scenes: scenesOf(events) });
    }
    return numberRepeatVisits(out);
}

/**
 * Number the sessions of anyone who appears more than once in the day.
 *
 * A LABEL REPEATING IS NOT A COLLISION, it is a visitor who came back. The
 * label is derived from the proof-of-work hash, which lives in sessionStorage
 * for up to 24 hours, so one person keeps one name all day, while the collector
 * starts a new session after any gap over thirty minutes. Somebody who played
 * three times before lunch is therefore three cards with one name on them,
 * scattered among strangers, which reads as a bug rather than as a regular.
 *
 * Numbering runs in the order the visits happened, so "visit 1" is the first of
 * the day whichever way the list is sorted. Counted over the sessions actually
 * on screen, so the figures agree with what the filters left rather than
 * describing cards the viewer cannot see.
 */
export function numberRepeatVisits(sessions) {
    const totals = new Map();
    for (const s of sessions) totals.set(s.label, (totals.get(s.label) || 0) + 1);

    const order = [...sessions].sort((a, b) =>
        String(a.started_at || '').localeCompare(String(b.started_at || '')));
    const nth = new Map();
    const numbered = new Map();
    for (const s of order) {
        const total = totals.get(s.label) || 1;
        if (total < 2) continue;
        const n = (nth.get(s.label) || 0) + 1;
        nth.set(s.label, n);
        numbered.set(s, { visit: n, visitCount: total });
    }
    return sessions.map(s => (numbered.has(s) ? { ...s, ...numbered.get(s) } : s));
}

/** How many of the day's events the filters are showing. Drives the status line,
 *  because a count that quietly drops is worse than no count at all. */
export function filterTotals(snap, scene, hidden) {
    const skip = hidden || new Set();
    let total = 0;
    let shown = 0;
    for (const session of (snap && snap.sessions) || []) {
        for (const e of session.events || []) {
            total += 1;
            if (e && (!scene || e.scene === scene) && !skip.has(e.action)) shown += 1;
        }
    }
    return { total, shown };
}

/** The checkbox vocabulary: every action present in the chosen day, narrowed by
 *  the chosen SCENE only. Ticked state is deliberately not consulted, or a box
 *  would disappear the moment it was unticked. Busiest first, ties by name so
 *  the order is stable between polls. */
export function actionVocabulary(snap, scene) {
    const counts = new Map();
    for (const session of (snap && snap.sessions) || []) {
        for (const e of session.events || []) {
            if (!e || !e.action) continue;
            if (scene && e.scene !== scene) continue;
            counts.set(e.action, (counts.get(e.action) || 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([action, count]) => ({ action, count }));
}

/** The by-scene rows: one per experience, recomputed under the action filter.
 *  The snapshot's own `scenes` block describes the UNFILTERED day, so it is the
 *  right answer for the in-world headline and the wrong one here. */
export function sceneRows(snap, hidden) {
    const skip = hidden || new Set();
    const rows = new Map();

    for (const session of (snap && snap.sessions) || []) {
        const touched = new Set();
        for (const e of session.events || []) {
            if (!e || !e.scene || !e.action || skip.has(e.action)) continue;
            let row = rows.get(e.scene);
            if (!row) {
                row = {
                    scene: e.scene, sessionCount: 0, eventCount: 0,
                    mobileSessions: 0, actions: new Map(),
                };
                rows.set(e.scene, row);
            }
            row.eventCount += 1;
            row.actions.set(e.action, (row.actions.get(e.action) || 0) + 1);
            touched.add(e.scene);
        }
        for (const scene of touched) {
            const row = rows.get(scene);
            row.sessionCount += 1;
            if (session.mobile) row.mobileSessions += 1;
        }
    }

    return [...rows.values()]
        .map(row => ({
            scene: row.scene,
            sessionCount: row.sessionCount,
            eventCount: row.eventCount,
            mobileSessions: row.mobileSessions,
            actionCount: row.actions.size,
            topActions: [...row.actions.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .slice(0, TOP_ACTIONS_PER_SCENE)
                .map(([action, count]) => ({ action, count })),
        }))
        .sort((a, b) => b.eventCount - a.eventCount || a.scene.localeCompare(b.scene));
}

/** Every scene slug present in a day, busiest first. Feeds the scene picker, so
 *  it lists what the day actually holds rather than every experience on the site. */
export function scenesInSnapshot(snap) {
    return sceneRows(snap, new Set()).map(r => r.scene);
}

// ---- in-world screen summary ----------------------------------------------

/** Hand a compact summary of the latest day to the 3D screen. Deliberately
 *  reads the UNFILTERED day: the wall screen reports the day, and the overlay's
 *  filters are the viewer's private lens on it. */
function pushSummary() {
    if (!onSummary) return;
    if (!latestSnap) { onSummary(null); return; }
    const recent = (latestSnap.sessions || []).slice(0, 4).map(s => {
        const last = s.events && s.events[s.events.length - 1];
        return {
            label: s.label,
            action: last ? prettyAction(last.action) : '',
            scene: last ? prettyScene(last.scene) : '',
            ago: last ? relTime(last.at) : '',
            mobile: !!s.mobile,
        };
    });
    const scenes = Array.isArray(latestSnap.scenes) ? latestSnap.scenes : [];
    const busiest = scenes.length ? scenes[0] : null;
    onSummary({
        date: prettyDate(latestSnap.date),
        sessionCount: latestSnap.session_count || 0,
        eventCount: latestSnap.event_count || 0,
        sceneCount: scenes.length,
        busiestScene: busiest ? prettyScene(busiest.scene) : '',
        busiestSceneEvents: busiest ? (busiest.event_count || 0) : 0,
        hasData: (latestSnap.session_count || 0) > 0,
        recent,
        updatedAgo: relTime(latestSnap.generated_at),
        stale: isStale(latestSnap),
    });
}

// ---- overlay rendering -----------------------------------------------------

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

/** A stable key for a session so its collapsed state survives re-renders. The
 *  server salt is persistent, so labels (and started_at) are stable across runs. */
function sessionKey(session) {
    return `${session.label || ''}|${session.started_at || ''}`;
}

function renderSessionCard(session) {
    const card = el('div', 'asession');
    const key = sessionKey(session);
    const collapsed = collapsedSessions.has(key);
    const events = session.events || [];
    const scenes = session.scenes || [];

    // The head is a button so the whole row toggles the timeline (mouse + keyboard).
    const head = el('button', 'asession-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(!collapsed));

    head.appendChild(el('span', 'asession-caret', '▸'));
    head.appendChild(el('span', 'asession-label', session.label || 'Visitor'));

    const chips = el('span', 'asession-chips');
    // Right beside the name, because it is the name it explains: a repeated
    // label is one visitor coming back, not two visitors colliding.
    if (session.visitCount > 1) {
        chips.appendChild(el('span', 'achip achip-visit',
            `visit ${session.visit} of ${session.visitCount}`));
    }
    // Then the route: which experiences this visit passed through, in order.
    scenes.slice(0, SESSION_SCENE_CHIPS).forEach(scene =>
        chips.appendChild(el('span', 'achip achip-scene', prettyScene(scene))));
    if (scenes.length > SESSION_SCENE_CHIPS) {
        chips.appendChild(el('span', 'achip achip-more',
            `+${scenes.length - SESSION_SCENE_CHIPS} more`));
    }
    chips.appendChild(el('span', 'achip', session.mobile ? 'Mobile' : 'Desktop'));
    if (session.lang) chips.appendChild(el('span', 'achip', session.lang));
    head.appendChild(chips);

    // Event count stays visible when collapsed, so the card still hints at length.
    head.appendChild(el('span', 'asession-count', plural(events.length, 'event', 'events')));
    head.appendChild(el('span', 'asession-time', `started ${localTime(session.started_at)}`));
    card.appendChild(head);

    // Name the scene on each event only when the visit crossed more than one,
    // where it is the difference between a list and a route. On a single-scene
    // visit it would be the same word on every line.
    const showScene = scenes.length > 1;
    const timeline = el('ol', 'atimeline');
    timeline.id = `atimeline-${++timelineSeq}`;
    head.setAttribute('aria-controls', timeline.id);
    events.forEach(ev => {
        const li = el('li', 'aevent');
        li.appendChild(el('span', 'aevent-time', localTime(ev.at)));
        li.appendChild(el('span', 'aevent-dot'));
        li.appendChild(el('span', 'aevent-name', prettyAction(ev.action)));
        if (showScene) li.appendChild(el('span', 'aevent-scene', prettyScene(ev.scene)));
        const detail = eventDetail(ev);
        if (detail) li.appendChild(el('span', 'aevent-detail', detail));
        timeline.appendChild(li);
    });
    timeline.hidden = collapsed;
    card.appendChild(timeline);

    head.addEventListener('click', () => {
        const nowCollapsed = !timeline.hidden;
        timeline.hidden = nowCollapsed;
        head.setAttribute('aria-expanded', String(!nowCollapsed));
        if (nowCollapsed) collapsedSessions.add(key);
        else collapsedSessions.delete(key);
        updateCollapseAllControl();
    });

    return card;
}

/** The short trailing note on an event row: the one word worth counting and the
 *  duration, when the ping carried them. `outcome` is deliberately not shown —
 *  it is a whole nested query string, which belongs in a detail view rather than
 *  strung along a timeline. */
export function eventDetail(ev) {
    if (!ev) return '';
    const bits = [];
    if (ev.kind) bits.push(String(ev.kind));
    if (typeof ev.seconds === 'number' && isFinite(ev.seconds)) bits.push(`${ev.seconds}s`);
    if (typeof ev.saved === 'number') bits.push(`${ev.saved} saved`);
    if (typeof ev.destroyed === 'number') bits.push(`${ev.destroyed} destroyed`);
    return bits.join(' · ');
}

/** One row of the by-scene view. The whole row is a button: picking a scene
 *  narrows the day to it and drops into the session view, which is the drill-down
 *  the two groupings are for. */
function renderSceneRow(row) {
    const card = el('button', 'ascene');
    card.type = 'button';
    card.appendChild(el('span', 'ascene-name', prettyScene(row.scene)));

    const stats = el('span', 'ascene-stats');
    stats.appendChild(el('span', 'ascene-stat', plural(row.sessionCount, 'session', 'sessions')));
    stats.appendChild(el('span', 'ascene-stat', plural(row.eventCount, 'event', 'events')));
    if (row.mobileSessions) {
        stats.appendChild(el('span', 'ascene-stat', `${row.mobileSessions} on mobile`));
    }
    card.appendChild(stats);

    if (row.topActions.length) {
        const top = el('span', 'ascene-top');
        row.topActions.forEach(a =>
            top.appendChild(el('span', 'achip', `${prettyAction(a.action)} ${a.count}`)));
        if (row.actionCount > row.topActions.length) {
            top.appendChild(el('span', 'achip achip-more',
                `+${row.actionCount - row.topActions.length} more`));
        }
        card.appendChild(top);
    }

    card.addEventListener('click', () => {
        sceneFilter = row.scene;
        groupMode = 'session';
        syncControls();
        render();
    });
    return card;
}

/** True when there is at least one session and every one is collapsed. */
function allSessionsCollapsed() {
    const sessions = filterSessions(currentSnap, sceneFilter, hiddenActions);
    return sessions.length > 0 && sessions.every(s => collapsedSessions.has(sessionKey(s)));
}

/** Apply the "long sessions start collapsed" default once per session, the first
 *  time it's seen — so a re-render (or the 5-min poll) never reverts a manual toggle. */
function applyCollapseDefaults(sessions) {
    sessions.forEach(s => {
        const k = sessionKey(s);
        if (seenSessions.has(k)) return;
        seenSessions.add(k);
        if ((s.events || []).length > LONG_SESSION_EVENTS) collapsedSessions.add(k);
    });
}

/** Sync the header "Collapse all / Expand all" button to the current state. */
function updateCollapseAllControl() {
    if (!els || !els.collapseAllBtn) return;
    const sessions = filterSessions(currentSnap, sceneFilter, hiddenActions);
    // Only meaningful in the session view; the scene rows have nothing to collapse.
    els.collapseAllBtn.disabled = groupMode !== 'session' || sessions.length === 0;
    const offerExpand = allSessionsCollapsed();   // all collapsed -> next action is "Expand all"
    els.collapseAllBtn.textContent = offerExpand ? 'Expand all' : 'Collapse all';
    els.collapseAllBtn.setAttribute('aria-label', offerExpand ? 'Expand all sessions' : 'Collapse all sessions');
}

/** Header button: collapse every session, or expand them all if already collapsed. */
function toggleCollapseAll() {
    const sessions = filterSessions(currentSnap, sceneFilter, hiddenActions);
    if (!sessions.length) return;
    const collapse = !allSessionsCollapsed();
    sessions.forEach(s => {
        const k = sessionKey(s);
        if (collapse) collapsedSessions.add(k);
        else collapsedSessions.delete(k);
    });
    render();
}

// ---- controls ---------------------------------------------------------------

/** Rebuild the scene picker from the day on screen, keeping the chosen scene
 *  selected when it is still present and falling back to every scene when the
 *  day (or the date) no longer has it. */
function syncSceneSelect() {
    if (!els || !els.sceneSelect) return;
    const scenes = scenesInSnapshot(currentSnap);
    if (sceneFilter && !scenes.includes(sceneFilter)) sceneFilter = '';

    els.sceneSelect.textContent = '';
    const all = el('option', null, 'Every scene');
    all.value = '';
    els.sceneSelect.appendChild(all);
    scenes.forEach(scene => {
        const opt = el('option', null, prettyScene(scene));
        opt.value = scene;
        els.sceneSelect.appendChild(opt);
    });
    els.sceneSelect.value = sceneFilter;
    els.sceneSelect.disabled = scenes.length === 0;
}

/** Rebuild the action checkboxes for what is on screen. Rebuilt on every render
 *  because the vocabulary belongs to the day and the chosen scene, and both move. */
function syncActionFilter() {
    if (!els || !els.actionFilter) return;
    const vocab = actionVocabulary(currentSnap, sceneFilter);
    // THE REBUILD MUST NOT MOVE THE VIEWER. Every tick of a box re-renders, and
    // a new list starts scrolled to the top with nothing focused, so unticking
    // a row near the bottom threw the list back to the top and dropped a
    // keyboard viewer's focus onto the page body. Note both before the old
    // list goes, and put them back on the new one.
    const keep = filterPlace();
    els.actionFilter.textContent = '';

    if (!vocab.length) {
        els.actionFilter.appendChild(el('p', 'afilter-empty', 'Nothing to filter.'));
        filterList = null;
        if (els.filterSummary) els.filterSummary.textContent = '';
        return;
    }

    // Drop any unticked action that is not in this day's vocabulary, so a filter
    // set on a busy day does not silently narrow a quiet one.
    const present = new Set(vocab.map(v => v.action));
    [...hiddenActions].forEach(a => { if (!present.has(a)) hiddenActions.delete(a); });

    const list = el('div', 'afilter-list');
    vocab.forEach(({ action, count }) => {
        const id = `afilter-${++timelineSeq}`;
        const row = el('label', 'afilter-item');
        row.setAttribute('for', id);
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'afilter-box';
        box.id = id;
        box.setAttribute('data-action', action);
        box.checked = !hiddenActions.has(action);
        box.addEventListener('change', () => {
            if (box.checked) hiddenActions.delete(action);
            else hiddenActions.add(action);
            render();
        });
        row.appendChild(box);
        row.appendChild(el('span', 'afilter-name', prettyAction(action)));
        row.appendChild(el('span', 'afilter-count', String(count)));
        list.appendChild(row);
    });
    els.actionFilter.appendChild(list);
    filterList = list;
    restoreFilterPlace(list, keep);
    watchMoreBelow(list);

    if (els.filterSummary) {
        const hidden = vocab.filter(v => hiddenActions.has(v.action)).length;
        els.filterSummary.textContent = hidden
            ? `${hidden} of ${vocab.length} hidden`
            : `${vocab.length} shown`;
    }
    if (els.selectAllBtn) els.selectAllBtn.disabled = !vocab.some(v => hiddenActions.has(v.action));
    if (els.clearAllBtn) els.clearAllBtn.disabled = vocab.every(v => hiddenActions.has(v.action));
}

let filterList = null;   // the checkbox list on screen, until the next rebuild

/** Where the viewer is in the list: how far it is scrolled, and which
 *  action's box has focus (by action, since the box itself is rebuilt). */
function filterPlace() {
    const place = { scrollTop: 0, action: null };
    if (!filterList) return place;
    place.scrollTop = filterList.scrollTop || 0;
    const active = document.activeElement;
    if (active && active.className === 'afilter-box'
        && typeof active.getAttribute === 'function') {
        place.action = active.getAttribute('data-action');
    }
    return place;
}

/** Put the viewer back where they were. An action that left the vocabulary
 *  (a new day, another scene) has no box to return to, and focus stays put. */
function restoreFilterPlace(list, place) {
    if (place.scrollTop) list.scrollTop = place.scrollTop;
    if (!place.action) return;
    const box = Array.from(list.children)
        .map(row => row.children && row.children[0])
        .find(b => b && b.getAttribute('data-action') === place.action);
    if (box && typeof box.focus === 'function') box.focus({ preventScroll: true });
}

/** Fade the list's bottom edge while rows sit below its cap, and only then.
 *  A row cut in half at the edge read as a rendering fault, where a fade reads
 *  as "there is more", and it lifts once the viewer has scrolled to the end. */
function markMoreBelow(list) {
    const more = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    if (more) list.classList.add('has-more');
    else list.classList.remove('has-more');
}

let filterObserver = null;

function watchMoreBelow(list) {
    list.addEventListener('scroll', () => markMoreBelow(list), { passive: true });
    // The list is often built while the display is closed (the poll runs
    // regardless), when it has no height to measure. The observer measures
    // again the moment it is laid out, and whenever a new width re-wraps it.
    if (filterObserver) filterObserver.disconnect();
    if (typeof ResizeObserver === 'function') {
        filterObserver = new ResizeObserver(() => markMoreBelow(list));
        filterObserver.observe(list);
    }
    markMoreBelow(list);
}

/** Push the current view state onto the controls (used when code, rather than
 *  the viewer, changes it — picking a scene from a scene row, for instance). */
function syncControls() {
    if (els && els.groupSelect) els.groupSelect.value = groupMode;
    if (els && els.sceneSelect) els.sceneSelect.value = sceneFilter;
}

function setGroupMode(mode) {
    groupMode = mode === 'scene' ? 'scene' : 'session';
    render();
}

function setSceneFilter(scene) {
    sceneFilter = scene || '';
    render();
}

/** Tick or untick every action in the current vocabulary at once. */
function setAllActions(hidden) {
    const vocab = actionVocabulary(currentSnap, sceneFilter);
    vocab.forEach(({ action }) => {
        if (hidden) hiddenActions.add(action);
        else hiddenActions.delete(action);
    });
    render();
}

// ---- render -----------------------------------------------------------------

function renderStatus() {
    if (!els) return;
    const latest = indexData && indexData.latest;

    if (els.dateLabel) els.dateLabel.textContent = prettyDate(currentDate);

    if (els.status) {
        els.status.classList.remove('stale');
        if (!currentSnap) {
            els.status.textContent = '';
        } else {
            const sessions = filterSessions(currentSnap, sceneFilter, hiddenActions);
            const { total, shown } = filterTotals(currentSnap, sceneFilter, hiddenActions);
            const bits = [plural(sessions.length, 'session', 'sessions')];
            // Say "204 of 377 events" whenever a filter is narrowing the day, so
            // the number on screen is never quietly smaller than the truth.
            bits.push(shown === total
                ? plural(total, 'event', 'events')
                : `${shown} of ${total} events`);
            if (sceneFilter) bits.push(prettyScene(sceneFilter));
            bits.push(`updated ${relTime(currentSnap.generated_at)}`);
            if (currentSnap.truncated) {
                bits.push(`trimmed ${currentSnap.dropped_sessions || 0} sessions / ${currentSnap.dropped_events || 0} events`);
            }
            if (currentDate && latest && currentDate !== latest) {
                bits.push('viewing a past day');
            }
            // NO REFRESH PROMISE HERE. The line used to add "refreshes every
            // 5 min" on the live day, which described this page's own poll
            // rather than the data under it: the snapshots are written by a
            // collector on the server, and until that job is scheduled the day
            // on screen is as fresh as the last time somebody ran it by hand.
            // "updated <n> ago" above is the honest version of the same fact,
            // and it stays true whatever the collector is doing. If a cadence
            // is ever promised again, promise the COLLECTOR's, and only when
            // something in the data says what it is.
            // Which clock this page is on, so a time is never ambiguous.
            if (dayZone) bits.push(`shown in ${zoneLabel(dayZone)}`);
            els.status.textContent = bits.join('  ·  ');
            if (isStale(currentSnap) && currentDate === latest) els.status.classList.add('stale');
        }
    }

    if (els.prevBtn && els.nextBtn) {
        const dates = availableDates();          // newest-first
        const i = dates.indexOf(currentDate);
        els.nextBtn.disabled = !(i > 0);          // a newer day exists
        els.prevBtn.disabled = !(i >= 0 && i < dates.length - 1); // an older day exists
    }
}

function render() {
    dayZone = (currentSnap && typeof currentSnap.timezone === 'string') ? currentSnap.timezone : '';
    syncSceneSelect();
    syncActionFilter();
    renderStatus();
    if (!els || !els.body) return;
    els.body.textContent = '';

    if (!currentSnap) {
        els.body.appendChild(el('p', 'analytics-empty',
            'No activity to show just yet. Please check back in a little while.'));
        updateCollapseAllControl();
        return;
    }

    if (groupMode === 'scene') {
        const rows = sceneRows(currentSnap, hiddenActions);
        if (!rows.length) {
            els.body.appendChild(el('p', 'analytics-empty', emptyMessage()));
        } else {
            rows.forEach(r => els.body.appendChild(renderSceneRow(r)));
        }
        updateCollapseAllControl();
        return;
    }

    const sessions = filterSessions(currentSnap, sceneFilter, hiddenActions);
    if (!sessions.length) {
        els.body.appendChild(el('p', 'analytics-empty', emptyMessage()));
        updateCollapseAllControl();
        return;
    }
    applyCollapseDefaults(sessions);
    sessions.forEach(s => els.body.appendChild(renderSessionCard(s)));
    updateCollapseAllControl();
}

/** Why the body is empty, which is a different sentence when the viewer's own
 *  filters are what emptied it. */
function emptyMessage() {
    const hasAny = (currentSnap && (currentSnap.sessions || []).length) > 0;
    if (!hasAny) return 'No visits recorded for this day.';
    if (hiddenActions.size || sceneFilter) return 'Nothing matches these filters.';
    return 'No visits recorded for this day.';
}

// ---- data flow -------------------------------------------------------------

export async function loadAnalytics() {
    try {
        indexData = await fetchJSON(cacheBust(`${SNAPS_BASE}/index.json`));
        const latest = indexData.latest;
        latestSnap = latest ? await fetchJSON(cacheBust(dayUrl(latest))) : null;
        pushSummary();

        if (!currentDate || !hasDate(currentDate)) currentDate = latest;
        currentSnap = (currentDate === latest)
            ? latestSnap
            : (currentDate ? await fetchJSON(cacheBust(dayUrl(currentDate))) : null);
        render();
    } catch (e) {
        latestSnap = null;
        currentSnap = null;
        pushSummary();   // null -> screen shows its loading/placeholder state
        render();
    }
}

/** Step to an adjacent available day (delta -1 = older, +1 = newer). */
async function navigate(delta) {
    const dates = availableDates();          // newest-first
    const i = dates.indexOf(currentDate);
    if (i < 0) return;
    const j = i - delta;                      // newer = earlier index
    if (j < 0 || j >= dates.length) return;
    currentDate = dates[j];
    try {
        currentSnap = (currentDate === (indexData && indexData.latest))
            ? latestSnap
            : await fetchJSON(cacheBust(dayUrl(currentDate)));
    } catch (e) {
        currentSnap = null;
    }
    render();
}

export function initAnalytics(opts) {
    els = {
        body: opts.body, dateLabel: opts.dateLabel, status: opts.status,
        prevBtn: opts.prevBtn, nextBtn: opts.nextBtn,
        collapseAllBtn: opts.collapseAllBtn,
        groupSelect: opts.groupSelect, sceneSelect: opts.sceneSelect,
        actionFilter: opts.actionFilter, filterSummary: opts.filterSummary,
        selectAllBtn: opts.selectAllBtn, clearAllBtn: opts.clearAllBtn,
    };
    onSummary = opts.onSummary || null;
    if (els.prevBtn) els.prevBtn.addEventListener('click', () => navigate(-1));
    if (els.nextBtn) els.nextBtn.addEventListener('click', () => navigate(1));
    if (els.collapseAllBtn) els.collapseAllBtn.addEventListener('click', toggleCollapseAll);
    if (els.groupSelect) els.groupSelect.addEventListener('change', () => setGroupMode(els.groupSelect.value));
    if (els.sceneSelect) els.sceneSelect.addEventListener('change', () => setSceneFilter(els.sceneSelect.value));
    if (els.selectAllBtn) els.selectAllBtn.addEventListener('click', () => setAllActions(false));
    if (els.clearAllBtn) els.clearAllBtn.addEventListener('click', () => setAllActions(true));
}

/** ms until the next 5-min wall-clock boundary + POLL_OFFSET_MS. Computed from the
 *  epoch (which sits on a 5-min boundary), so it's timezone-independent. Always
 *  returns a value in (0, POLL_MS] — never 0, so we don't double-fire on a slot. */
function msUntilNextPoll() {
    const since = (Date.now() - POLL_OFFSET_MS) % POLL_MS;   // ms past the last slot
    return POLL_MS - (since < 0 ? since + POLL_MS : since);
}

/** Self-scheduling timer that re-aligns to the cron's cadence every tick (rather
 *  than a fixed setInterval that drifts from whenever the page happened to load),
 *  so each poll lands just after the server has written a fresh snapshot. */
function startInterval() {
    stopInterval();
    const tick = () => {
        loadAnalytics();
        pollTimer = setTimeout(tick, msUntilNextPoll());
    };
    pollTimer = setTimeout(tick, msUntilNextPoll());
}

function stopInterval() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = 0; }
}

/** Pause polling while the tab is hidden; on returning, catch up immediately and
 *  resume. Avoids a steady trickle of fetches when nobody is looking. */
function onVisibilityChange() {
    if (!autoRefreshOn) return;
    if (document.hidden) {
        stopInterval();
    } else {
        loadAnalytics();
        startInterval();
    }
}

/** Keep the dashboard and the in-world screen fresh with a single 5-minute poll
 *  that runs while the tab is visible. Call once at startup. The poll keeps going
 *  whether or not the dashboard overlay is open; opening it just forces an extra
 *  immediate refresh (see main.js). */
export function startAnalyticsAutoRefresh() {
    if (autoRefreshOn) return;
    autoRefreshOn = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) {
        // FETCH NOW, THEN FALL INTO THE CADENCE. Scheduling alone leaves the
        // first poll up to five minutes out, and a scene whose wall screen is
        // the thing you walked in to look at would spend that time showing a
        // placeholder to somebody who is already standing in front of it.
        // This is the same load-then-schedule the visibility handler does.
        loadAnalytics();
        startInterval();
    }
}

// Exposed for unit tests only; production code uses the named exports above.
// There is no reset here on purpose: every suite re-imports the module through
// jest.resetModules(), which gives it a genuinely fresh set of module state
// rather than a hand-maintained copy that can drift from the real thing.
export const __test__ = {
    SNAPS_BASE, POLL_MS, POLL_OFFSET_MS, STALE_MS, LONG_SESSION_EVENTS,
    SESSION_SCENE_CHIPS, TOP_ACTIONS_PER_SCENE, ACTION_LABELS, SCENE_LABELS,
    cacheBust, dayUrl, prettyAction, relTime, localTime, prettyDate, plural,
    isStale, sessionKey, msUntilNextPoll,
};
