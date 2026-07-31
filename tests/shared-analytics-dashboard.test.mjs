// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/analytics-1.0.0.js — the fetch + DOM half of the
 * visitor-activity dashboard that tests/shared-analytics.test.mjs deliberately
 * skipped (that suite pins the pure helpers and the no-DOM onSummary path).
 *
 * Approach: same recording-stub style as shared-pan.test.mjs. We stand up a
 * tiny stub document (createElement returning elements with classList,
 * setAttribute, appendChild, captured listeners, and a fire() helper) plus a
 * routing global.fetch that serves canned index/day/leaderboard payloads keyed
 * by URL, then drive the real exports:
 *   - loadAnalytics() with injected overlay elements: session cards, chips,
 *     collapse defaults/toggles, status line, prev/next enablement.
 *   - the error (rejected fetch AND non-ok status) and empty-day states.
 *   - navigate() via the captured prev/next click listeners.
 *   - loadLeaderboard() rendering (medals, mobile badge, empty, failure).
 *   - startAnalyticsAutoRefresh() polling under fake timers, including the
 *     hidden-tab pause and the catch-up refresh on return.
 * Date.now is pinned so relative times and cache-bust query params are exact.
 */
import { jest } from '@jest/globals';

const FIXED_NOW = 1_700_000_000_000;
const POLL_MS = 5 * 60 * 1000;
const LATEST = '2026-06-28';
const OLDER = '2026-06-27';
const isoAt = (ms) => new Date(ms).toISOString();

// ---- Stub DOM ---------------------------------------------------------------

function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    listeners: {},
    classes: new Set(),
    _text: '',
    id: '',
    type: '',
    hidden: false,
    disabled: false,
  };
  Object.defineProperty(el, 'textContent', {
    get: () => el._text,
    // Mirror the real DOM: assigning textContent replaces all children.
    set: (v) => { el._text = String(v); el.children = []; },
  });
  Object.defineProperty(el, 'className', {
    get() { return [...el.classes].join(' '); },
    set(value) { el.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
  });
  el.classList = {
    add: (...cs) => cs.forEach((c) => el.classes.add(c)),
    remove: (...cs) => cs.forEach((c) => el.classes.delete(c)),
    contains: (c) => el.classes.has(c),
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  el.fire = (type, event = {}) => { (el.listeners[type] || []).forEach((fn) => fn(event)); };
  el.appendChild = (child) => { el.children.push(child); return child; };
  return el;
}

/** Every descendant of root carrying the given class, in document order. */
function findAll(root, cls) {
  const out = [];
  (function walk(n) {
    n.children.forEach((c) => {
      if (c.classList.contains(cls)) out.push(c);
      walk(c);
    });
  }(root));
  return out;
}
const findOne = (root, cls) => findAll(root, cls)[0];

/** Deep text of a node: its own text plus its descendants', space-joined. */
function deepText(node) {
  return [node._text, ...node.children.map(deepText)].filter(Boolean).join(' ');
}

function installDocument({ hidden = false } = {}) {
  const doc = {
    hidden,
    listeners: {},
    createElement: (tag) => makeEl(tag),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    fire(type, event = {}) { (this.listeners[type] || []).forEach((fn) => fn(event)); },
  };
  globalThis.document = doc;
  return doc;
}

// ---- Fetch routing ----------------------------------------------------------

/** Route fetches by URL substring. Each route value may be:
 *  data (served ok), the string 'reject' (network error), or the string
 *  'http500' (ok:false response, so fetchJSON must throw on res.ok). */
function installFetch(routes) {
  globalThis.fetch = jest.fn(async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (key === undefined) throw new Error(`unrouted fetch: ${url}`);
    const body = routes[key];
    if (body === 'reject') throw new Error('network down');
    if (body === 'http500') return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  });
}

const dayFetchCount = (fragment) =>
  globalThis.fetch.mock.calls.filter(([url]) => url.includes(fragment)).length;

// ---- Harness ----------------------------------------------------------------

const INDEX = { latest: LATEST, days: [{ date: LATEST }, { date: OLDER }] };

function makeDaySnap() {
  return {
    date: LATEST,
    session_count: 2,
    event_count: 11,
    generated_at: isoAt(FIXED_NOW - 60 * 1000),   // 1m ago
    sessions: [
      {
        label: 'Visitor 1', started_at: isoAt(FIXED_NOW - 3600 * 1000), mobile: true, lang: 'en-US',
        events: [
          { action: 'enter-store', at: isoAt(FIXED_NOW - 3600 * 1000) },
          { action: 'open-piece', at: isoAt(FIXED_NOW - 3500 * 1000) },
        ],
      },
      {
        label: 'Visitor 2', started_at: isoAt(FIXED_NOW - 1800 * 1000), mobile: false,
        // 9 events > LONG_SESSION_EVENTS (8) -> this card starts collapsed.
        events: Array.from({ length: 9 }, (_, i) => (
          { action: 'click-prop', at: isoAt(FIXED_NOW - 1800 * 1000 + i * 1000) }
        )),
      },
    ],
  };
}

/** Fresh module instance wired to a full set of stub overlay elements. */
async function setup(opts = {}) {
  installDocument();
  jest.resetModules();
  const m = await import('../www/shared/js/analytics-1.0.0.js');
  const els = {
    body: makeEl('div'),
    dateLabel: makeEl('span'),
    status: makeEl('p'),
    prevBtn: makeEl('button'),
    nextBtn: makeEl('button'),
    collapseAllBtn: makeEl('button'),
  };
  m.initAnalytics({ ...els, ...opts });
  return { m, els };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete globalThis.fetch;
  delete globalThis.document;
});

// ---- localTime (the one pure helper the first suite left out) ----------------

describe('localTime', () => {
  test('formats a valid ISO timestamp and rejects garbage with an empty string', async () => {
    installDocument();
    jest.resetModules();
    const { localTime } = (await import('../www/shared/js/analytics-1.0.0.js')).__test__;
    const out = localTime('2026-06-28T10:04:05Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/\d/);
    expect(localTime('not a date')).toBe('');
  });
});

// ---- Overlay rendering via loadAnalytics -------------------------------------

describe('loadAnalytics -> overlay render (happy path)', () => {
  test('fetches index + latest day with cache-busted URLs', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m } = await setup();
    await m.loadAnalytics();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `snaps/index.json?t=${FIXED_NOW}`, { cache: 'no-store' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `snaps/sessions-20260628.json?t=${FIXED_NOW}`, { cache: 'no-store' });
  });

  test('renders one card per session with label, chips, count, and timeline', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();

    const cards = findAll(els.body, 'asession');
    expect(cards).toHaveLength(2);

    const [first, second] = cards;
    expect(findOne(first, 'asession-label').textContent).toBe('Visitor 1');
    expect(findAll(first, 'achip').map((c) => c.textContent)).toEqual(['Mobile', 'en-US']);
    expect(findOne(first, 'asession-count').textContent).toBe('2 events');
    expect(findOne(first, 'asession-time').textContent).toMatch(/^started /);

    // Timeline rows carry a time, a dot, and the human action phrasing.
    const rows = findAll(first, 'aevent');
    expect(rows).toHaveLength(2);
    expect(findOne(rows[0], 'aevent-name').textContent).toBe('Entered the gallery');
    expect(findOne(rows[1], 'aevent-name').textContent).toBe('Opened an art piece');

    expect(findAll(second, 'achip').map((c) => c.textContent)).toEqual(['Desktop']);
    expect(findOne(second, 'asession-count').textContent).toBe('9 events');
  });

  test('short sessions start expanded, long ones collapsed, with aria wiring', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();

    const heads = findAll(els.body, 'asession-head');
    const timelines = findAll(els.body, 'atimeline');
    expect(heads[0].getAttribute('aria-expanded')).toBe('true');
    expect(timelines[0].hidden).toBe(false);
    expect(heads[1].getAttribute('aria-expanded')).toBe('false');  // 9 > 8 events
    expect(timelines[1].hidden).toBe(true);
    expect(heads[0].getAttribute('aria-controls')).toBe(timelines[0].id);
    expect(timelines[0].id).not.toBe(timelines[1].id);
  });

  test('status line summarizes counts, freshness, and the 5-min refresh promise', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(els.status.textContent)
      .toBe('2 sessions  ·  11 events  ·  updated 1m ago  ·  refreshes every 5 min');
    expect(els.status.classList.contains('stale')).toBe(false);
    expect(els.dateLabel.textContent).toContain('2026');
    expect(els.dateLabel.textContent).not.toBe(LATEST);   // formatted, not the raw key
  });

  test('on the latest day only "older" navigation is offered', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(els.prevBtn.disabled).toBe(false);   // an older day exists
    expect(els.nextBtn.disabled).toBe(true);    // nothing newer than latest
    expect(els.collapseAllBtn.disabled).toBe(false);
    expect(els.collapseAllBtn.textContent).toBe('Collapse all');
  });

  test('a stale, truncated snapshot reports the trim and flags the status', async () => {
    const snap = makeDaySnap();
    snap.generated_at = isoAt(FIXED_NOW - 14 * 60 * 1000);  // > STALE_MS (13 min)
    snap.truncated = true;
    snap.dropped_sessions = 2;
    snap.dropped_events = 5;
    installFetch({ 'index.json': INDEX, 'sessions-20260628': snap });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(els.status.textContent).toContain('trimmed 2 sessions / 5 events');
    expect(els.status.textContent).toContain('updated 14m ago');
    expect(els.status.classList.contains('stale')).toBe(true);
  });
});

// ---- Collapse toggles ---------------------------------------------------------

describe('session collapse behavior', () => {
  test('clicking a head collapses its timeline, and a re-render preserves it', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();

    findAll(els.body, 'asession-head')[0].fire('click');
    expect(findAll(els.body, 'atimeline')[0].hidden).toBe(true);
    expect(findAll(els.body, 'asession-head')[0].getAttribute('aria-expanded')).toBe('false');

    // The 5-min poll re-renders from scratch; manual state must survive it.
    await m.loadAnalytics();
    expect(findAll(els.body, 'atimeline')[0].hidden).toBe(true);
  });

  test('manually expanding a long session is never reverted by the poll default', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();

    findAll(els.body, 'asession-head')[1].fire('click');   // expand the long one
    expect(findAll(els.body, 'atimeline')[1].hidden).toBe(false);
    await m.loadAnalytics();
    expect(findAll(els.body, 'atimeline')[1].hidden).toBe(false);
  });

  test('the header button collapses everything, then flips to Expand all', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();

    els.collapseAllBtn.fire('click');
    expect(findAll(els.body, 'atimeline').every((t) => t.hidden)).toBe(true);
    expect(els.collapseAllBtn.textContent).toBe('Expand all');
    expect(els.collapseAllBtn.getAttribute('aria-label')).toBe('Expand all sessions');

    els.collapseAllBtn.fire('click');
    expect(findAll(els.body, 'atimeline').every((t) => !t.hidden)).toBe(true);
    expect(els.collapseAllBtn.textContent).toBe('Collapse all');
    expect(els.collapseAllBtn.getAttribute('aria-label')).toBe('Collapse all sessions');
  });
});

// ---- Error and empty states ----------------------------------------------------

describe('error and empty states', () => {
  test('a rejected index fetch renders the pipeline hint instead of throwing', async () => {
    installFetch({ 'index.json': 'reject' });
    const { m, els } = await setup();
    await expect(m.loadAnalytics()).resolves.toBeUndefined();
    const empty = findOne(els.body, 'analytics-empty');
    expect(empty.textContent).toBe('Could not load analytics. Is the snapshot pipeline running?');
    expect(els.status.textContent).toBe('');
    expect(els.dateLabel.textContent).toBe('—');
    expect(els.collapseAllBtn.disabled).toBe(true);
  });

  test('a non-ok HTTP status is treated exactly like a network failure', async () => {
    installFetch({ 'index.json': 'http500' });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('Could not load analytics. Is the snapshot pipeline running?');
  });

  test('a day with zero sessions renders the friendly empty message', async () => {
    const emptyDay = { date: LATEST, session_count: 0, event_count: 0, generated_at: isoAt(FIXED_NOW), sessions: [] };
    installFetch({ 'index.json': INDEX, 'sessions-20260628': emptyDay });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(findOne(els.body, 'analytics-empty').textContent).toBe('No visits recorded for this day.');
    expect(els.collapseAllBtn.disabled).toBe(true);
    expect(els.status.textContent).toContain('0 sessions');
  });
});

// ---- Day navigation -------------------------------------------------------------

describe('day navigation (prev/next buttons)', () => {
  const olderDay = { date: OLDER, session_count: 0, event_count: 0, generated_at: isoAt(FIXED_NOW - 86400 * 1000), sessions: [] };

  test('prev steps to the older day, labels it as past, and flips the buttons', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap(), 'sessions-20260627': olderDay });
    const { m, els } = await setup();
    await m.loadAnalytics();

    els.prevBtn.fire('click');
    await flush();
    expect(dayFetchCount('sessions-20260627')).toBe(1);
    expect(els.status.textContent).toContain('viewing a past day');
    expect(els.status.textContent).not.toContain('refreshes every 5 min');
    expect(els.prevBtn.disabled).toBe(true);    // nothing older
    expect(els.nextBtn.disabled).toBe(false);   // latest is newer

    // Another prev at the oldest day is a no-op (guarded, no fetch).
    els.prevBtn.fire('click');
    await flush();
    expect(dayFetchCount('sessions-20260627')).toBe(1);
  });

  test('next returns to the latest day from cache without refetching it', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap(), 'sessions-20260627': olderDay });
    const { m, els } = await setup();
    await m.loadAnalytics();
    const latestFetches = dayFetchCount('sessions-20260628');

    els.prevBtn.fire('click');
    await flush();
    els.nextBtn.fire('click');
    await flush();
    expect(dayFetchCount('sessions-20260628')).toBe(latestFetches);  // reused latestSnap
    expect(findAll(els.body, 'asession')).toHaveLength(2);
    expect(els.status.textContent).toContain('refreshes every 5 min');

    // Another next at the newest day is a no-op.
    els.nextBtn.fire('click');
    await flush();
    expect(els.status.textContent).toContain('refreshes every 5 min');
  });

  test('a failing fetch for the stepped-to day shows the error state for that day', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap(), 'sessions-20260627': 'reject' });
    const { m, els } = await setup();
    await m.loadAnalytics();

    els.prevBtn.fire('click');
    await flush();
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('Could not load analytics. Is the snapshot pipeline running?');
    expect(els.dateLabel.textContent).toContain('2026');   // still names the day
  });
});

// ---- Leaderboard -------------------------------------------------------------------

describe('loadLeaderboard', () => {
  const LB = {
    generated_at: isoAt(FIXED_NOW - 60 * 1000),
    entries: [
      { label: 'Curious Otter a3', seconds: 142, mobile: false },
      { label: 'Quiet Comet 5f', seconds: 158, mobile: true },
      { label: 'Gentle Falcon 9c', seconds: 200, mobile: false },
      { label: 'Bold Heron 2e', seconds: 260, mobile: false },
    ],
  };

  async function setupLb(routes, opts = {}) {
    installFetch(routes);
    installDocument();
    jest.resetModules();
    const m = await import('../www/shared/js/analytics-1.0.0.js');
    const lbBody = makeEl('div');
    m.initAnalytics({ leaderboardBody: lbBody, ...opts });
    return { m, lbBody };
  }

  test('renders every run with medals for the podium and a plain rank after', async () => {
    const { m, lbBody } = await setupLb({ 'leaderboard.json': LB });
    await m.loadLeaderboard();

    const rows = findAll(lbBody, 'lb-row');
    expect(rows).toHaveLength(4);
    expect(findAll(lbBody, 'lb-rank').map((r) => r.textContent)).toEqual(['🥇', '🥈', '🥉', '4']);
    expect(rows[0].classList.contains('lb-rank-1')).toBe(true);
    expect(rows[3].className).toBe('lb-row');   // no podium class off the podium
    expect(deepText(findOne(rows[0], 'lb-name'))).toBe('Curious Otter a3');
    expect(findOne(rows[0], 'lb-time').textContent).toBe('2:22');
    expect(findOne(lbBody, 'lb-updated').textContent).toBe('updated 1m ago');
  });

  test('only mobile runs get the mobile badge inside the name', async () => {
    const { m, lbBody } = await setupLb({ 'leaderboard.json': LB });
    await m.loadLeaderboard();
    const rows = findAll(lbBody, 'lb-row');
    expect(findOne(rows[1], 'lb-badge').textContent).toBe('mobile');   // Quiet Comet 5f
    expect(findAll(rows[0], 'lb-badge')).toHaveLength(0);
  });

  test('feeds the in-world board callback the same ranked summary', async () => {
    const onLeaderboard = jest.fn();
    const { m } = await setupLb({ 'leaderboard.json': LB }, { onLeaderboard });
    await m.loadLeaderboard();
    expect(onLeaderboard).toHaveBeenCalledTimes(1);
    const summary = onLeaderboard.mock.calls[0][0];
    expect(summary.count).toBe(4);
    expect(summary.entries[0]).toMatchObject({ rank: 1, label: 'Curious Otter a3', time: '2:22' });
  });

  test('an empty board invites the first record instead of showing nothing', async () => {
    const { m, lbBody } = await setupLb({ 'leaderboard.json': { entries: [] } });
    await m.loadLeaderboard();
    expect(findOne(lbBody, 'lb-empty').textContent)
      .toBe('No record times yet. Be the first to find everything!');
  });

  test('a failed fetch renders the pipeline hint and nulls the callback', async () => {
    const onLeaderboard = jest.fn();
    const { m, lbBody } = await setupLb({ 'leaderboard.json': 'reject' }, { onLeaderboard });
    await m.loadLeaderboard();
    expect(findOne(lbBody, 'lb-empty').textContent)
      .toBe('Could not load the leaderboard. Is the snapshot pipeline running?');
    expect(onLeaderboard).toHaveBeenLastCalledWith(null);
  });

  test('with no consumer wired up it does not fetch at all', async () => {
    installFetch({ 'leaderboard.json': LB });
    installDocument();
    jest.resetModules();
    const m = await import('../www/shared/js/analytics-1.0.0.js');
    m.initAnalytics({});    // no leaderboardBody, no onLeaderboard
    await m.loadLeaderboard();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// ---- Auto refresh -------------------------------------------------------------------

describe('startAnalyticsAutoRefresh', () => {
  // fetch always rejects here: each loadAnalytics costs exactly one index fetch
  // (the leaderboard arm no-ops with no consumer), which makes counting ticks easy.
  async function setupPolling({ hidden = false } = {}) {
    jest.useFakeTimers();                 // the fake clock owns Date.now from here
    jest.setSystemTime(FIXED_NOW);
    installFetch({ '': 'reject' });
    const doc = installDocument({ hidden });
    jest.resetModules();
    const m = await import('../www/shared/js/analytics-1.0.0.js');
    m.initAnalytics({});
    return { m, doc };
  }

  test('polls once per 5-minute slot while the tab is visible', async () => {
    const { m } = await setupPolling();
    m.startAnalyticsAutoRefresh();
    expect(globalThis.fetch).not.toHaveBeenCalled();   // aligned to the slot, not immediate

    jest.advanceTimersByTime(POLL_MS);                 // first aligned tick fires within one slot
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    m.startAnalyticsAutoRefresh();                     // second call is a no-op
    expect(globalThis.document.listeners.visibilitychange).toHaveLength(1);
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // still one poller, not two
  });

  test('hiding the tab pauses polling, returning catches up immediately', async () => {
    const { m, doc } = await setupPolling();
    m.startAnalyticsAutoRefresh();
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    doc.hidden = true;
    doc.fire('visibilitychange');
    jest.advanceTimersByTime(3 * POLL_MS);             // nobody is looking
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    doc.hidden = false;
    doc.fire('visibilitychange');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // immediate catch-up
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // and the cadence resumes
  });

  test('starting while hidden defers the first poll until the tab is shown', async () => {
    const { m, doc } = await setupPolling({ hidden: true });
    m.startAnalyticsAutoRefresh();
    jest.advanceTimersByTime(2 * POLL_MS);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    doc.hidden = false;
    doc.fire('visibilitychange');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
