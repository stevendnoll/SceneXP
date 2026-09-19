// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/analytics-1.0.0.js — the fetch + DOM half of the
 * visitor-activity dashboard that tests/shared-analytics.test.mjs deliberately
 * skipped (that suite pins the pure helpers and the no-DOM onSummary path).
 *
 * Approach: same recording-stub style as shared-pan.test.mjs. We stand up a
 * tiny stub document (createElement returning elements with classList,
 * setAttribute, appendChild, captured listeners, and a fire() helper) plus a
 * routing global.fetch that serves canned index/day payloads keyed
 * by URL, then drive the real exports:
 *   - loadAnalytics() with injected overlay elements: session cards, chips,
 *     collapse defaults/toggles, status line, prev/next enablement.
 *   - the error (rejected fetch AND non-ok status) and empty-day states.
 *   - navigate() via the captured prev/next click listeners.
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
        // A two-scene wander, which is what the scene chips and the per-event
        // scene label exist for.
        scenes: ['steve', 'garden'],
        events: [
          { action: 'enter-store', scene: 'steve', at: isoAt(FIXED_NOW - 3600 * 1000) },
          { action: 'open-piece', scene: 'garden', at: isoAt(FIXED_NOW - 3500 * 1000) },
        ],
      },
      {
        label: 'Visitor 2', started_at: isoAt(FIXED_NOW - 1800 * 1000), mobile: false,
        scenes: ['xo'],
        // 9 events > LONG_SESSION_EVENTS (8) -> this card starts collapsed.
        events: Array.from({ length: 9 }, (_, i) => (
          { action: 'click-prop', scene: 'xo', at: isoAt(FIXED_NOW - 1800 * 1000 + i * 1000) }
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
    groupSelect: makeEl('select'),
    sceneSelect: makeEl('select'),
    actionFilter: makeEl('div'),
    filterSummary: makeEl('span'),
    selectAllBtn: makeEl('button'),
    clearAllBtn: makeEl('button'),
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
    expect(findAll(first, 'achip').map((c) => c.textContent))
      .toEqual(["Steve's Home Office", 'Fractal Garden', 'Mobile', 'en-US']);
    expect(findOne(first, 'asession-count').textContent).toBe('2 events');
    expect(findOne(first, 'asession-time').textContent).toMatch(/^started /);

    // Timeline rows carry a time, a dot, and the human action phrasing.
    const rows = findAll(first, 'aevent');
    expect(rows).toHaveLength(2);
    expect(findOne(rows[0], 'aevent-name').textContent).toBe('Entered the gallery');
    expect(findOne(rows[1], 'aevent-name').textContent).toBe('Opened an art piece');

    expect(findAll(second, 'achip').map((c) => c.textContent))
      .toEqual(["X's and O's", 'Desktop']);
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
    expect(empty.textContent).toBe('No activity to show just yet. Please check back in a little while.');
    expect(els.status.textContent).toBe('');
    expect(els.dateLabel.textContent).toBe('—');
    expect(els.collapseAllBtn.disabled).toBe(true);
  });

  test('a non-ok HTTP status is treated exactly like a network failure', async () => {
    installFetch({ 'index.json': 'http500' });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('No activity to show just yet. Please check back in a little while.');
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
      .toBe('No activity to show just yet. Please check back in a little while.');
    expect(els.dateLabel.textContent).toContain('2026');   // still names the day
  });
});

// ---- Auto refresh -------------------------------------------------------------------

describe('startAnalyticsAutoRefresh', () => {
  // fetch always rejects here: each loadAnalytics costs exactly one index fetch,
  // which makes counting ticks easy.
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

  test('fetches immediately on start, so the wall screen is never blank', async () => {
    // REGRESSION GUARD: scheduling without an immediate load left the in-world
    // display reading "Waiting for today's numbers" for up to five minutes
    // after the page opened, which is most of a visit.
    const { m } = await setupPolling();
    m.startAnalyticsAutoRefresh();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('polls once per 5-minute slot while the tab is visible', async () => {
    const { m } = await setupPolling();
    m.startAnalyticsAutoRefresh();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);  // the immediate one

    jest.advanceTimersByTime(POLL_MS);                 // then the aligned cadence
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    m.startAnalyticsAutoRefresh();                     // second call is a no-op
    expect(globalThis.document.listeners.visibilitychange).toHaveLength(1);
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // still one poller, not two
  });

  test('hiding the tab pauses polling, returning catches up immediately', async () => {
    const { m, doc } = await setupPolling();
    m.startAnalyticsAutoRefresh();                     // one immediate fetch
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    doc.hidden = true;
    doc.fire('visibilitychange');
    jest.advanceTimersByTime(3 * POLL_MS);             // nobody is looking
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    doc.hidden = false;
    doc.fire('visibilitychange');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // immediate catch-up
    jest.advanceTimersByTime(POLL_MS);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // and the cadence resumes
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

// ---- Grouping, the scene picker, and the action filter ----------------------
// The controls added when the dashboard grew a scene dimension. The fixture day
// holds a two-scene wander (steve -> garden) and a nine-event xo session.

describe('scene picker', () => {
  async function ready(opts = {}) {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const h = await setup(opts);
    await h.m.loadAnalytics();
    return h;
  }

  test('lists the scenes the day holds, busiest first, behind an every-scene option', async () => {
    const { els } = await ready();
    expect(els.sceneSelect.children.map((o) => o.textContent))
      .toEqual(['Every scene', "X's and O's", 'Fractal Garden', "Steve's Home Office"]);
    // Tied scenes sort by slug, so the order is stable from one poll to the next.
    expect(els.sceneSelect.children.map((o) => o.value))
      .toEqual(['', 'xo', 'garden', 'steve']);
  });

  test('choosing a scene narrows the sessions to it', async () => {
    const { els } = await ready();
    els.sceneSelect.value = 'garden';
    els.sceneSelect.fire('change');
    const cards = findAll(els.body, 'asession');
    expect(cards).toHaveLength(1);
    expect(findOne(cards[0], 'asession-label').textContent).toBe('Visitor 1');
    // Only the garden event survives, so the count follows.
    expect(findOne(cards[0], 'asession-count').textContent).toBe('1 event');
  });

  test('the status line names the chosen scene and the events it is hiding', async () => {
    const { els } = await ready();
    els.sceneSelect.value = 'garden';
    els.sceneSelect.fire('change');
    expect(els.status.textContent).toContain('1 of 11 events');
    expect(els.status.textContent).toContain('Fractal Garden');
  });

  test('a scene that the newly chosen day does not hold falls back to every scene', async () => {
    const { m, els } = await ready();
    els.sceneSelect.value = 'garden';
    els.sceneSelect.fire('change');
    // Step to the older day, whose snapshot has no garden events at all.
    installFetch({
      'index.json': INDEX,
      'sessions-20260627': { date: OLDER, generated_at: isoAt(FIXED_NOW), sessions: [
        { label: 'Solo', started_at: isoAt(FIXED_NOW), scenes: ['xo'],
          events: [{ action: 'snap', scene: 'xo', at: isoAt(FIXED_NOW) }] },
      ] },
      'sessions-20260628': makeDaySnap(),
    });
    els.prevBtn.fire('click');
    await flush();
    expect(els.sceneSelect.value).toBe('');
    expect(findAll(els.body, 'asession')).toHaveLength(1);
  });
});

describe('group by scene', () => {
  async function ready() {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const h = await setup();
    await h.m.loadAnalytics();
    h.els.groupSelect.value = 'scene';
    h.els.groupSelect.fire('change');
    return h;
  }

  test('renders a row per scene with its own totals, busiest first', async () => {
    const { els } = await ready();
    const rows = findAll(els.body, 'ascene');
    expect(rows.map((r) => findOne(r, 'ascene-name').textContent))
      .toEqual(["X's and O's", 'Fractal Garden', "Steve's Home Office"]);
    expect(findAll(rows[0], 'ascene-stat').map((s) => s.textContent))
      .toEqual(['1 session', '9 events']);
  });

  test('a scene with mobile sessions says so', async () => {
    const { els } = await ready();
    const steve = findAll(els.body, 'ascene')
      .find((r) => findOne(r, 'ascene-name').textContent === "Steve's Home Office");
    expect(findAll(steve, 'ascene-stat').map((s) => s.textContent))
      .toEqual(['1 session', '1 event', '1 on mobile']);
  });

  test('clicking a scene row drills into that scene by session', async () => {
    const { els } = await ready();
    findAll(els.body, 'ascene')[1].fire('click');   // Fractal Garden
    expect(els.groupSelect.value).toBe('session');
    expect(els.sceneSelect.value).toBe('garden');
    expect(findAll(els.body, 'asession')).toHaveLength(1);
  });

  test('collapse all is disabled in the scene view, where there is nothing to collapse', async () => {
    const { els } = await ready();
    expect(els.collapseAllBtn.disabled).toBe(true);
  });

  test('switching back to sessions restores the cards', async () => {
    const { els } = await ready();
    els.groupSelect.value = 'session';
    els.groupSelect.fire('change');
    expect(findAll(els.body, 'asession')).toHaveLength(2);
    expect(findAll(els.body, 'ascene')).toHaveLength(0);
  });
});

describe('action filter', () => {
  async function ready() {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const h = await setup();
    await h.m.loadAnalytics();
    return h;
  }

  const boxes = (els) => findAll(els.actionFilter, 'afilter-box');
  const names = (els) => findAll(els.actionFilter, 'afilter-name').map((n) => n.textContent);

  test('offers a checkbox per action on screen, busiest first, all ticked', async () => {
    const { els } = await ready();
    expect(names(els)).toEqual(['Examined a prop', 'Entered the gallery', 'Opened an art piece']);
    expect(findAll(els.actionFilter, 'afilter-count').map((c) => c.textContent))
      .toEqual(['9', '1', '1']);
    expect(boxes(els).every((b) => b.checked)).toBe(true);
    expect(els.filterSummary.textContent).toBe('3 shown');
  });

  test('unticking an action removes its events and says how many are hidden', async () => {
    const { els } = await ready();
    const box = boxes(els)[0];      // click-prop, all 9 of Visitor 2's events
    box.checked = false;
    box.fire('change');
    // Visitor 2 had nothing else, so the card goes rather than sitting empty.
    expect(findAll(els.body, 'asession')).toHaveLength(1);
    expect(els.status.textContent).toContain('2 of 11 events');
    expect(els.filterSummary.textContent).toBe('1 of 3 hidden');
  });

  test('an unticked action keeps its checkbox so it can be ticked back on', async () => {
    const { els } = await ready();
    boxes(els)[0].checked = false;
    boxes(els)[0].fire('change');
    expect(names(els)).toHaveLength(3);          // the vocabulary did not shrink
    expect(boxes(els)[0].checked).toBe(false);
    boxes(els)[0].checked = true;
    boxes(els)[0].fire('change');
    expect(findAll(els.body, 'asession')).toHaveLength(2);
  });

  test('the vocabulary follows the chosen scene', async () => {
    const { els } = await ready();
    els.sceneSelect.value = 'garden';
    els.sceneSelect.fire('change');
    expect(names(els)).toEqual(['Opened an art piece']);
  });

  test('clear all empties the day and explains why it is empty', async () => {
    const { els } = await ready();
    els.clearAllBtn.fire('click');
    expect(findAll(els.body, 'asession')).toHaveLength(0);
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('Nothing matches these filters.');
    expect(els.clearAllBtn.disabled).toBe(true);
  });

  test('select all brings everything back', async () => {
    const { els } = await ready();
    els.clearAllBtn.fire('click');
    els.selectAllBtn.fire('click');
    expect(findAll(els.body, 'asession')).toHaveLength(2);
    expect(els.selectAllBtn.disabled).toBe(true);
    expect(els.filterSummary.textContent).toBe('3 shown');
  });

  test('the scene view honours the filter too', async () => {
    const { els } = await ready();
    boxes(els)[0].checked = false;
    boxes(els)[0].fire('change');      // hide click-prop, which is all of xo
    els.groupSelect.value = 'scene';
    els.groupSelect.fire('change');
    expect(findAll(els.body, 'ascene').map((r) => findOne(r, 'ascene-name').textContent))
      .toEqual(['Fractal Garden', "Steve's Home Office"]);
  });

  test('a day with nothing in it says so rather than blaming the filters', async () => {
    installFetch({
      'index.json': INDEX,
      'sessions-20260628': { date: LATEST, generated_at: isoAt(FIXED_NOW), sessions: [] },
    });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('No visits recorded for this day.');
    expect(findOne(els.actionFilter, 'afilter-empty').textContent).toBe('Nothing to filter.');
    expect(els.filterSummary.textContent).toBe('');
  });
});

describe('event rows', () => {
  test('name the scene only on a visit that crossed more than one', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();
    const [first, second] = findAll(els.body, 'asession');
    // Visitor 1 wandered steve -> garden, so each row names where it happened.
    expect(findAll(first, 'aevent-scene').map((s) => s.textContent))
      .toEqual(["Steve's Home Office", 'Fractal Garden']);
    // Visitor 2 never left xo, where the same word on every line says nothing.
    expect(findAll(second, 'aevent-scene')).toHaveLength(0);
  });

  test('carry the short detail an event brought with it', async () => {
    const snap = {
      date: LATEST, generated_at: isoAt(FIXED_NOW),
      sessions: [{
        label: 'Detail', started_at: isoAt(FIXED_NOW), scenes: ['xo'],
        events: [
          { action: 'play-result', scene: 'xo', at: isoAt(FIXED_NOW), kind: 'catch', seconds: 1.4 },
          { action: 'snap', scene: 'xo', at: isoAt(FIXED_NOW) },
        ],
      }],
    };
    installFetch({ 'index.json': INDEX, 'sessions-20260628': snap });
    const { m, els } = await setup();
    await m.loadAnalytics();
    const rows = findAll(els.body, 'aevent');
    expect(findOne(rows[0], 'aevent-detail').textContent).toBe('catch · 1.4s');
    expect(findAll(rows[1], 'aevent-detail')).toHaveLength(0);
  });
});

// ---- The "+N more" overflow rules and the defensive empty states ------------

describe('overflow and empty edges', () => {
  test('a visit through more than three scenes summarizes the tail', async () => {
    const scenes = ['xo', 'garden', 'steve', 'highwater', 'gavin'];
    installFetch({
      'index.json': INDEX,
      'sessions-20260628': {
        date: LATEST, generated_at: isoAt(FIXED_NOW),
        sessions: [{
          label: 'Bold Acorn 7f', started_at: isoAt(FIXED_NOW), scenes,
          events: scenes.map((scene) => ({ action: 'session-end', scene, at: isoAt(FIXED_NOW) })),
        }],
      },
    });
    const { m, els } = await setup();
    await m.loadAnalytics();
    const card = findOne(els.body, 'asession');
    expect(findAll(card, 'achip-scene').map((c) => c.textContent))
      .toEqual(["X's and O's", 'Fractal Garden', "Steve's Home Office"]);
    expect(findOne(card, 'achip-more').textContent).toBe('+2 more');
  });

  test('a scene with more than three actions names the top three and counts the rest', async () => {
    installFetch({
      'index.json': INDEX,
      'sessions-20260628': {
        date: LATEST, generated_at: isoAt(FIXED_NOW),
        sessions: [{
          label: 'Busy', started_at: isoAt(FIXED_NOW), scenes: ['xo'],
          events: ['snap', 'snap', 'throw', 'call-play', 'next-play', 'pause']
            .map((action) => ({ action, scene: 'xo', at: isoAt(FIXED_NOW) })),
        }],
      },
    });
    const { m, els } = await setup();
    await m.loadAnalytics();
    els.groupSelect.value = 'scene';
    els.groupSelect.fire('change');
    const row = findOne(els.body, 'ascene');
    expect(findAll(row, 'ascene-top')[0].children.map((c) => c.textContent))
      .toEqual(['Snap 2', 'Called a play 1', 'Moved to the next play 1', '+2 more']);
  });

  test('the scene view explains an empty body the filters caused', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': makeDaySnap() });
    const { m, els } = await setup();
    await m.loadAnalytics();
    els.clearAllBtn.fire('click');
    els.groupSelect.value = 'scene';
    els.groupSelect.fire('change');
    expect(findAll(els.body, 'ascene')).toHaveLength(0);
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('Nothing matches these filters.');
  });

  test('sessions that carry no events at all read as a quiet day, not a filtered one', async () => {
    // Defensive: a malformed or mid-write snapshot should not accuse the
    // viewer's filters of hiding something that was never there.
    installFetch({
      'index.json': INDEX,
      'sessions-20260628': {
        date: LATEST, generated_at: isoAt(FIXED_NOW),
        sessions: [{ label: 'Empty', started_at: isoAt(FIXED_NOW), events: [] }],
      },
    });
    const { m, els } = await setup();
    await m.loadAnalytics();
    expect(findOne(els.body, 'analytics-empty').textContent)
      .toBe('No visits recorded for this day.');
  });
});

// ---- Repeat visits ----------------------------------------------------------
// A label appearing twice in a day is one visitor coming back, because the
// proof-of-work hash behind it survives the whole day while the collector
// starts a new session after a thirty minute gap. Without a chip saying so,
// two cards with one name on them read as a bug.

describe('repeat visits', () => {
  const REGULAR = {
    date: LATEST, generated_at: isoAt(FIXED_NOW),
    sessions: [
      { label: 'Bold Cedar f8', started_at: isoAt(FIXED_NOW - 600 * 1000), mobile: false,
        scenes: ['xo'], events: [{ action: 'snap', scene: 'xo', at: isoAt(FIXED_NOW - 600 * 1000) }] },
      { label: 'Sleepy Maple 23', started_at: isoAt(FIXED_NOW - 1200 * 1000), mobile: false,
        scenes: ['xo'], events: [{ action: 'snap', scene: 'xo', at: isoAt(FIXED_NOW - 1200 * 1000) }] },
      { label: 'Bold Cedar f8', started_at: isoAt(FIXED_NOW - 9000 * 1000), mobile: false,
        scenes: ['garden'], events: [{ action: 'water-all', scene: 'garden', at: isoAt(FIXED_NOW - 9000 * 1000) }] },
    ],
  };

  async function ready() {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': REGULAR });
    const h = await setup();
    await h.m.loadAnalytics();
    return h;
  }

  test('a returning visitor gets a numbered chip on each card', async () => {
    const { els } = await ready();
    const cards = findAll(els.body, 'asession');
    expect(findOne(cards[0], 'achip-visit').textContent).toBe('visit 2 of 2');
    expect(findOne(cards[2], 'achip-visit').textContent).toBe('visit 1 of 2');
  });

  test('a one-off visitor gets no chip at all', async () => {
    const { els } = await ready();
    const cards = findAll(els.body, 'asession');
    expect(findOne(cards[1], 'asession-label').textContent).toBe('Sleepy Maple 23');
    expect(findAll(cards[1], 'achip-visit')).toHaveLength(0);
  });

  test('the chip sits before the route chips, next to the name it explains', async () => {
    const { els } = await ready();
    const chips = findAll(findAll(els.body, 'asession')[0], 'achip');
    expect(chips.map((c) => c.textContent))
      .toEqual(['visit 2 of 2', "X's and O's", 'Desktop']);
  });

  test('the two cards keep their own collapse state despite sharing a name', async () => {
    // sessionKey is label + started_at, so the visits do not toggle together.
    const { els } = await ready();
    const cards = findAll(els.body, 'asession');
    findOne(cards[0], 'asession-head').fire('click');
    expect(findOne(cards[0], 'asession-head').getAttribute('aria-expanded')).toBe('false');
    expect(findOne(cards[2], 'asession-head').getAttribute('aria-expanded')).toBe('true');
  });

  test('filtering to one of the visits stops claiming there are two', async () => {
    const { els } = await ready();
    els.sceneSelect.value = 'garden';
    els.sceneSelect.fire('change');
    const cards = findAll(els.body, 'asession');
    expect(cards).toHaveLength(1);
    expect(findAll(cards[0], 'achip-visit')).toHaveLength(0);
  });
});

// ---- Each day on its own clock --------------------------------------------------

describe('days and their clocks', () => {
  const OPTS = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
  const START = '2026-06-28T03:11:26Z';   // evening of Jun 27 in California

  function daySnap(date, timezone) {
    return {
      date, generated_at: isoAt(FIXED_NOW), ...(timezone ? { timezone } : {}),
      sessions: [{
        label: 'Night Owl 11', started_at: START, mobile: false, scenes: ['xo'],
        events: [{ action: 'snap', scene: 'xo', at: START }],
      }],
    };
  }

  test('a Pacific day lists its times on the Pacific clock, and says so', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': daySnap(LATEST, 'America/Los_Angeles') });
    const { m, els } = await setup();
    await m.loadAnalytics();
    const card = findOne(els.body, 'asession');
    const pacific = new Date(START).toLocaleTimeString(undefined, { ...OPTS, timeZone: 'America/Los_Angeles' });
    expect(findOne(card, 'asession-time').textContent).toBe(`started ${pacific}`);
    expect(findOne(card, 'aevent-time').textContent).toBe(pacific);
    expect(els.status.textContent).toMatch(/shown in Pacific/);
  });

  test('stepping back to a day cut on UTC shows that day on UTC, labeled', async () => {
    // Days frozen before the switch keep the zone they were cut in, and the
    // page follows each file rather than assuming one zone for all of them.
    installFetch({
      'index.json': INDEX,
      'sessions-20260628': daySnap(LATEST, 'America/Los_Angeles'),
      'sessions-20260627': daySnap(OLDER, 'UTC'),
    });
    const { m, els } = await setup();
    await m.loadAnalytics();
    els.prevBtn.fire('click');
    await flush();
    const utc = new Date(START).toLocaleTimeString(undefined, { ...OPTS, timeZone: 'UTC' });
    expect(findOne(findOne(els.body, 'asession'), 'asession-time').textContent).toBe(`started ${utc}`);
    expect(els.status.textContent).toMatch(/shown in UTC/);
  });

  test('a file that does not name its zone keeps the viewer\'s clock, unlabeled', async () => {
    installFetch({ 'index.json': INDEX, 'sessions-20260628': daySnap(LATEST, null) });
    const { m, els } = await setup();
    await m.loadAnalytics();
    const local = new Date(START).toLocaleTimeString(undefined, OPTS);
    expect(findOne(findOne(els.body, 'asession'), 'asession-time').textContent).toBe(`started ${local}`);
    expect(els.status.textContent).not.toMatch(/shown in/);
  });
});
