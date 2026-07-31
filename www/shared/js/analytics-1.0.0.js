// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * analytics.js - the in-world "visitor activity" dashboard.
 *
 * Fetches the anonymized, per-day snapshots written by ops/collect_snaps.py
 * (snaps/index.json + snaps/sessions-YYYYMMDD.json), renders them into the
 * #analytics-view overlay with day-to-day navigation, and hands a compact
 * summary to a callback (main.js) so the hanging 3D flatscreen can mirror it.
 *
 * Everything here is already anonymized server-side: throwaway labels, no hash,
 * no IP, no user agent. This module only displays what it is given, and treats
 * every value as text (never innerHTML) on principle.
 */

const SNAPS_BASE = 'snaps';
const POLL_MS = 5 * 60 * 1000;     // matches the collector cadence
const POLL_OFFSET_MS = 30 * 1000;  // poll 30s after each 5-min boundary, just behind the cron
const STALE_MS = 13 * 60 * 1000;   // ~2.5 cron intervals with no update -> flag as stale
const LONG_SESSION_EVENTS = 8;     // sessions with more events than this start collapsed
const LEADERBOARD_URL = `${SNAPS_BASE}/leaderboard.json`;  // all-time checklist speedrun board

// Human phrasings for each tracked action (see js/telemetry.js call sites).
const ACTION_LABELS = {
    'session-start': 'Arrived on the site',
    'session-end': 'Left the site',
    'enter-store': 'Entered the gallery',
    'leave-store': 'Left the gallery',
    'enter-shop': 'Entered a shop',
    'leave-shop': 'Left a shop',
    'open-piece': 'Opened an art piece',
    'open-help': 'Opened the help',
    'open-card': 'Viewed the business card',
    'open-egg': 'Found an easter egg',
    'open-miniature': 'Inspected the model village',
    'open-light-switch': 'Used the light switch',
    'click-scenery': 'Examined the scenery',
    'click-prop': 'Examined a prop',
    'click-sky': 'Looked to the sky',
    'chat-visitor': 'Chatted with a visitor',
    'greet-passerby': 'Greeted a passerby',
    'greet-shopkeeper': 'Greeted a shopkeeper',
    'discovery-complete': 'Completed every discovery',
    'contact-nudge': 'Opened the reach-out invitation',
    'download-vcard': 'Saved the contact card',
    'share': 'Shared the site',
    'set-brightness': 'Adjusted the lighting',
    'portrait-pan': 'Panned the view (buttons)',
    'portrait-zoom': 'Zoomed the view (buttons)',
    'portrait-tilt': 'Tilted the view (keys)',
    'portrait-swipe': 'Swiped to look around',
    'portrait-pinch': 'Pinched to zoom',
    'dive-start': 'Began the infinite dive',
    'dive-steer': 'Steered the dive',
    'dive-floor': 'Reached the precision floor',
    'autozoom-on': 'Started the auto zoom',
    'autozoom-off': 'Paused the auto zoom',
    'autozoom-direction': 'Reversed the auto zoom',
    'autozoom-speed': 'Changed the auto zoom speed',
    'dive-target': 'Chose a dive destination',
    'dive-reset': 'Reset to the starting view',
};

let els = null;          // { body, dateLabel, status, prevBtn, nextBtn }
let onSummary = null;    // callback(summary | null) feeding the 3D screen
let onLeaderboard = null;// callback(summary | null) feeding the in-world leaderboard board
let lbBody = null;       // #leaderboard-body element for the click-to-expand overlay
let indexData = null;    // { latest, days: [{ date, ... }] }
let latestSnap = null;   // the most recent day, mirrored on the in-world screen
let currentDate = null;  // 'YYYY-MM-DD' shown in the overlay (defaults to latest)
let currentSnap = null;  // the loaded day snapshot for the overlay
let pollTimer = 0;
let autoRefreshOn = false; // a single background poller, paused while the tab is hidden

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

function prettyAction(a) {
    return ACTION_LABELS[a] || a;
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

/** A localized, human-readable time-of-day in the viewer's own timezone. */
function localTime(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime())
        ? ''
        : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/** A localized, human-readable date for a UTC day key ('YYYY-MM-DD'). The label
 *  still names the snapshot's UTC day; we only format it nicely, pinning the
 *  formatter to UTC so the calendar date never shifts under the viewer's offset. */
function prettyDate(ymd) {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
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

// ---- in-world screen summary ----------------------------------------------

/** Hand a compact summary of the latest day to the 3D flatscreen. */
function pushSummary() {
    if (!onSummary) return;
    if (!latestSnap) { onSummary(null); return; }
    const recent = (latestSnap.sessions || []).slice(0, 4).map(s => {
        const last = s.events && s.events[s.events.length - 1];
        return {
            label: s.label,
            action: last ? prettyAction(last.action) : '',
            ago: last ? relTime(last.at) : '',
            mobile: !!s.mobile,
        };
    });
    onSummary({
        date: prettyDate(latestSnap.date),
        sessionCount: latestSnap.session_count || 0,
        eventCount: latestSnap.event_count || 0,
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

    // The head is a button so the whole row toggles the timeline (mouse + keyboard).
    const head = el('button', 'asession-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(!collapsed));

    head.appendChild(el('span', 'asession-caret', '▸'));
    head.appendChild(el('span', 'asession-label', session.label || 'Visitor'));

    const chips = el('span', 'asession-chips');
    chips.appendChild(el('span', 'achip', session.mobile ? 'Mobile' : 'Desktop'));
    if (session.lang) chips.appendChild(el('span', 'achip', session.lang));
    head.appendChild(chips);

    // Event count stays visible when collapsed, so the card still hints at length.
    head.appendChild(el('span', 'asession-count', `${events.length} event${events.length === 1 ? '' : 's'}`));
    head.appendChild(el('span', 'asession-time', `started ${localTime(session.started_at)}`));
    card.appendChild(head);

    const timeline = el('ol', 'atimeline');
    timeline.id = `atimeline-${++timelineSeq}`;
    head.setAttribute('aria-controls', timeline.id);
    events.forEach(ev => {
        const li = el('li', 'aevent');
        li.appendChild(el('span', 'aevent-time', localTime(ev.at)));
        li.appendChild(el('span', 'aevent-dot'));
        li.appendChild(el('span', 'aevent-name', prettyAction(ev.action)));
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

/** True when there is at least one session and every one is collapsed. */
function allSessionsCollapsed() {
    const sessions = (currentSnap && currentSnap.sessions) || [];
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
    const sessions = (currentSnap && currentSnap.sessions) || [];
    els.collapseAllBtn.disabled = sessions.length === 0;
    const offerExpand = allSessionsCollapsed();   // all collapsed -> next action is "Expand all"
    els.collapseAllBtn.textContent = offerExpand ? 'Expand all' : 'Collapse all';
    els.collapseAllBtn.setAttribute('aria-label', offerExpand ? 'Expand all sessions' : 'Collapse all sessions');
}

/** Header button: collapse every session, or expand them all if already collapsed. */
function toggleCollapseAll() {
    const sessions = (currentSnap && currentSnap.sessions) || [];
    if (!sessions.length) return;
    const collapse = !allSessionsCollapsed();
    sessions.forEach(s => {
        const k = sessionKey(s);
        if (collapse) collapsedSessions.add(k);
        else collapsedSessions.delete(k);
    });
    render();
}

function renderStatus() {
    if (!els) return;
    const latest = indexData && indexData.latest;

    if (els.dateLabel) els.dateLabel.textContent = prettyDate(currentDate);

    if (els.status) {
        els.status.classList.remove('stale');
        if (!currentSnap) {
            els.status.textContent = '';
        } else {
            const bits = [
                `${currentSnap.session_count || 0} sessions`,
                `${currentSnap.event_count || 0} events`,
                `updated ${relTime(currentSnap.generated_at)}`,
            ];
            if (currentSnap.truncated) {
                bits.push(`trimmed ${currentSnap.dropped_sessions || 0} sessions / ${currentSnap.dropped_events || 0} events`);
            }
            if (currentDate && latest && currentDate !== latest) {
                bits.push('viewing a past day');
            } else if (latest && currentDate === latest) {
                bits.push('refreshes every 5 min');   // only true for the live (latest) day
            }
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
    renderStatus();
    if (!els || !els.body) return;
    els.body.textContent = '';

    if (!currentSnap) {
        els.body.appendChild(el('p', 'analytics-empty',
            'Could not load analytics. Is the snapshot pipeline running?'));
        updateCollapseAllControl();
        return;
    }
    const sessions = currentSnap.sessions || [];
    if (!sessions.length) {
        els.body.appendChild(el('p', 'analytics-empty', 'No visits recorded for this day.'));
        updateCollapseAllControl();
        return;
    }
    applyCollapseDefaults(sessions);
    sessions.forEach(s => els.body.appendChild(renderSessionCard(s)));
    updateCollapseAllControl();
}

// ---- data flow -------------------------------------------------------------

/** Load the index + the relevant day file(s), refresh the screen summary, and
 *  re-render the overlay. Safe to call repeatedly (open, poll, date change). */
/** Format a whole-second duration as m:ss (e.g. 142 -> "2:22"). */
function fmtDuration(secs) {
    secs = Math.max(0, Math.round(Number(secs) || 0));
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** Shape snaps/leaderboard.json into the compact summary the 3D board renders:
 *  validated, fastest-first, with a formatted time and a 1-based rank. Defensive
 *  about the public file's contents on principle (same stance as the dashboard). */
function leaderboardSummary(data) {
    const raw = (data && Array.isArray(data.entries)) ? data.entries : [];
    const entries = raw
        .filter(e => e && e.label && typeof e.seconds === 'number' && e.seconds > 0)
        .sort((a, b) => a.seconds - b.seconds)   // trust-but-verify the ordering
        .map((e, i) => ({
            rank: i + 1,
            label: String(e.label),
            seconds: e.seconds,
            time: fmtDuration(e.seconds),
            mobile: e.mobile === true,
        }));
    return { entries, count: entries.length, updatedAgo: relTime(data && data.generated_at) };
}

/** Render the full leaderboard into the click-to-expand overlay body. Lists every
 *  ranked run (the in-world board shows only the top few), with medal glyphs for
 *  the podium. Builds DOM via textContent only — never innerHTML, on principle. */
function renderLeaderboard(summary) {
    if (!lbBody) return;
    lbBody.textContent = '';

    if (!summary) {
        lbBody.appendChild(el('p', 'lb-empty',
            'Could not load the leaderboard. Is the snapshot pipeline running?'));
        return;
    }
    const entries = summary.entries || [];
    if (!entries.length) {
        lbBody.appendChild(el('p', 'lb-empty',
            'No record times yet. Be the first to find everything!'));
        return;
    }

    const MEDALS = ['🥇', '🥈', '🥉'];
    const list = document.createElement('ol');
    list.className = 'lb-list';
    entries.forEach((e) => {
        const row = document.createElement('li');
        row.className = 'lb-row' + (e.rank <= 3 ? ` lb-rank-${e.rank}` : '');
        row.appendChild(el('span', 'lb-rank', e.rank <= 3 ? MEDALS[e.rank - 1] : String(e.rank)));
        const name = el('span', 'lb-name', e.label);
        if (e.mobile) name.appendChild(el('span', 'lb-badge', 'mobile'));
        row.appendChild(name);
        row.appendChild(el('span', 'lb-time', e.time));
        list.appendChild(row);
    });
    lbBody.appendChild(list);

    if (summary.updatedAgo) {
        lbBody.appendChild(el('p', 'lb-updated', `updated ${summary.updatedAgo}`));
    }
}

/** Fetch the all-time leaderboard and feed both the in-world board and the
 *  overlay. Independent of the dashboard fetch (its own try/catch) so one failing
 *  never breaks the other; runs on the same poll cadence via loadAnalytics(), and
 *  again immediately when the overlay is opened (see main.js). */
export async function loadLeaderboard() {
    if (!onLeaderboard && !lbBody) return;
    try {
        const summary = leaderboardSummary(await fetchJSON(cacheBust(LEADERBOARD_URL)));
        if (onLeaderboard) onLeaderboard(summary);
        renderLeaderboard(summary);
    } catch (e) {
        if (onLeaderboard) onLeaderboard(null);   // board shows its placeholder
        renderLeaderboard(null);
    }
}

export async function loadAnalytics() {
    loadLeaderboard();   // fire-and-forget; feeds the wall leaderboard each poll
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
    };
    onSummary = opts.onSummary || null;
    onLeaderboard = opts.onLeaderboard || null;
    lbBody = opts.leaderboardBody || null;
    if (els.prevBtn) els.prevBtn.addEventListener('click', () => navigate(-1));
    if (els.nextBtn) els.nextBtn.addEventListener('click', () => navigate(1));
    if (els.collapseAllBtn) els.collapseAllBtn.addEventListener('click', toggleCollapseAll);
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
    if (!document.hidden) startInterval();
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    SNAPS_BASE, POLL_MS, POLL_OFFSET_MS, STALE_MS, LONG_SESSION_EVENTS, ACTION_LABELS,
    cacheBust, dayUrl, prettyAction, relTime, localTime, prettyDate,
    isStale, sessionKey, msUntilNextPoll,
    fmtDuration, leaderboardSummary,
};
