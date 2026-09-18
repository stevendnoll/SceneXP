// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/analytics-1.0.0.js — the visitor-activity dashboard (shared engine copy, byte-identical to www/js).
 *
 * Two layers:
 *   1. The pure formatting/time helpers (exposed via `__test__`), pinned with a
 *      mocked Date.now so relative-time and staleness output is deterministic.
 *   2. The exported loadAnalytics(), driven through a mocked global.fetch. We
 *      wire up initAnalytics() with only an onSummary callback (no DOM nodes),
 *      so render() returns early and we can assert the compact summary handed to
 *      the 3D flatscreen without standing up a full document.
 */
import { jest } from '@jest/globals';

const FIXED_NOW = 1_700_000_000_000;   // a fixed "now" for all relative-time math
const POLL_MS = 5 * 60 * 1000;
const POLL_OFFSET_MS = 30 * 1000;
const STALE_MS = 13 * 60 * 1000;
const isoAt = (ms) => new Date(ms).toISOString();

async function loadHelpers() {
  jest.resetModules();
  const mod = await import('../www/shared/js/analytics-1.0.0.js');
  return mod.__test__;
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.fetch;
});

describe('prettyAction', () => {
  test('maps known action codes to human phrasings', async () => {
    const { prettyAction } = await loadHelpers();
    expect(prettyAction('enter-store')).toBe('Entered the gallery');
    expect(prettyAction('download-vcard')).toBe('Saved the contact card');
  });

  test('humanizes unknown actions rather than showing the raw slug', async () => {
    // The vocabulary is open (80 actions across 16 scenes and growing), so most
    // of what reaches this function will never be in the label map.
    const { prettyAction } = await loadHelpers();
    expect(prettyAction('reached-tsunami')).toBe('Reached tsunami');
    expect(prettyAction('totally-unknown')).toBe('Totally unknown');
    expect(prettyAction('')).toBe('');
  });
});

describe('prettyScene', () => {
  test('names known experiences and falls back to the slug', async () => {
    jest.resetModules();
    const { prettyScene } = await import('../www/shared/js/analytics-1.0.0.js');
    expect(prettyScene('xo')).toBe("X's and O's");
    expect(prettyScene('garden')).toBe('Fractal Garden');
    // A scene that ships after this map was last edited still renders.
    expect(prettyScene('brandnew')).toBe('brandnew');
    expect(prettyScene('')).toBe('');
  });
});

describe('dayUrl / cacheBust', () => {
  test('dayUrl strips the dashes into the snapshot filename', async () => {
    const { dayUrl } = await loadHelpers();
    expect(dayUrl('2026-06-28')).toBe('snaps/sessions-20260628.json');
  });

  test('cacheBust appends the current time as a query param', async () => {
    const { cacheBust } = await loadHelpers();
    expect(cacheBust('snaps/index.json')).toBe(`snaps/index.json?t=${FIXED_NOW}`);
  });
});

describe('relTime', () => {
  test('buckets an elapsed interval into just-now / m / h / d', async () => {
    const { relTime } = await loadHelpers();
    expect(relTime(isoAt(FIXED_NOW))).toBe('just now');
    expect(relTime(isoAt(FIXED_NOW - 44 * 1000))).toBe('just now');     // < 45s
    expect(relTime(isoAt(FIXED_NOW - 5 * 60 * 1000))).toBe('5m ago');
    expect(relTime(isoAt(FIXED_NOW - 3 * 60 * 60 * 1000))).toBe('3h ago');
    expect(relTime(isoAt(FIXED_NOW - 2 * 24 * 60 * 60 * 1000))).toBe('2d ago');
  });

  test('clamps future timestamps to "just now" and rejects unparseable input', async () => {
    const { relTime } = await loadHelpers();
    expect(relTime(isoAt(FIXED_NOW + 60 * 1000))).toBe('just now'); // negative elapsed -> clamped
    expect(relTime('not a date')).toBe('');
    expect(relTime(undefined)).toBe('');
  });
});

describe('isStale', () => {
  test('flags snapshots older than the stale threshold', async () => {
    const { isStale } = await loadHelpers();
    expect(isStale({ generated_at: isoAt(FIXED_NOW) })).toBe(false);
    expect(isStale({ generated_at: isoAt(FIXED_NOW - (STALE_MS - 1000)) })).toBe(false);
    expect(isStale({ generated_at: isoAt(FIXED_NOW - (STALE_MS + 1000)) })).toBe(true);
  });

  test('treats missing or unparseable timestamps as not-stale', async () => {
    const { isStale } = await loadHelpers();
    expect(isStale(null)).toBe(false);
    expect(isStale({})).toBe(false);
    expect(isStale({ generated_at: 'whenever' })).toBe(false);
  });
});

describe('sessionKey', () => {
  test('joins label and started_at, tolerating missing fields', async () => {
    const { sessionKey } = await loadHelpers();
    expect(sessionKey({ label: 'Visitor 3', started_at: '2026-06-28T10:00:00Z' }))
      .toBe('Visitor 3|2026-06-28T10:00:00Z');
    expect(sessionKey({})).toBe('|');
  });
});

describe('prettyDate', () => {
  test('renders a placeholder for empty input and passes through malformed keys', async () => {
    const { prettyDate } = await loadHelpers();
    expect(prettyDate('')).toBe('—');
    expect(prettyDate('garbage')).toBe('garbage');   // split/Number -> NaN -> raw passthrough
  });

  test('formats a valid YYYY-MM-DD key into a readable, year-bearing string', async () => {
    const { prettyDate } = await loadHelpers();
    const out = prettyDate('2026-06-28');
    expect(typeof out).toBe('string');
    expect(out).toContain('2026');
    expect(out).not.toBe('2026-06-28'); // actually formatted, not the raw key
  });
});

describe('msUntilNextPoll', () => {
  test('always returns a value within (0, POLL_MS]', async () => {
    const { msUntilNextPoll } = await loadHelpers();
    const v = msUntilNextPoll();
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(POLL_MS);
  });

  test('returns a full interval (never 0) when sitting exactly on a slot boundary', async () => {
    Date.now.mockReturnValue(POLL_OFFSET_MS); // (now - offset) % POLL_MS === 0
    const { msUntilNextPoll } = await loadHelpers();
    expect(msUntilNextPoll()).toBe(POLL_MS);
  });

  test('counts down the remaining ms to the next aligned slot', async () => {
    Date.now.mockReturnValue(POLL_OFFSET_MS + 60 * 1000); // 1 min past a slot
    const { msUntilNextPoll } = await loadHelpers();
    expect(msUntilNextPoll()).toBe(POLL_MS - 60 * 1000);
  });
});

describe('loadAnalytics -> onSummary (mocked fetch, no DOM)', () => {
  // Fake snapshot pipeline: an index naming the latest day + that day's sessions.
  const LATEST = '2026-06-28';
  function installFetch(daySnap, { failIndex = false } = {}) {
    globalThis.fetch = jest.fn(async (url) => {
      if (failIndex) throw new Error('network down');
      const body = url.includes('index.json')
        ? { latest: LATEST, days: [{ date: LATEST }, { date: '2026-06-27' }] }
        : daySnap;
      return { ok: true, json: async () => body };
    });
  }

  async function loadModule() {
    jest.resetModules();
    return import('../www/shared/js/analytics-1.0.0.js');
  }

  test('hands the 3D screen a compact summary of the latest day', async () => {
    const daySnap = {
      date: LATEST,
      session_count: 3,
      event_count: 12,
      generated_at: isoAt(FIXED_NOW),
      // The collector's precomputed group-by, busiest scene first.
      scenes: [
        { scene: 'xo', session_count: 2, event_count: 9 },
        { scene: 'garden', session_count: 1, event_count: 3 },
      ],
      sessions: [
        { label: 'Visitor 1', mobile: true, events: [{ action: 'enter-store', scene: 'xo', at: isoAt(FIXED_NOW) }] },
        { label: 'Visitor 2', mobile: false, events: [{ action: 'open-piece', scene: 'garden', at: isoAt(FIXED_NOW - 5 * 60 * 1000) }] },
      ],
    };
    installFetch(daySnap);
    const mod = await loadModule();
    const onSummary = jest.fn();
    mod.initAnalytics({ onSummary });       // no DOM nodes -> render() returns early
    await mod.loadAnalytics();

    expect(onSummary).toHaveBeenCalledTimes(1);
    const summary = onSummary.mock.calls[0][0];
    expect(summary).toMatchObject({
      sessionCount: 3,
      eventCount: 12,
      sceneCount: 2,
      busiestScene: "X's and O's",
      busiestSceneEvents: 9,
      hasData: true,
      updatedAgo: 'just now',
      stale: false,
    });
    expect(summary.date).toContain('2026');
    expect(summary.recent[0]).toEqual({
      label: 'Visitor 1', action: 'Entered the gallery', scene: "X's and O's",
      ago: 'just now', mobile: true,
    });
    expect(summary.recent[1]).toEqual({
      label: 'Visitor 2', action: 'Opened an art piece', scene: 'Fractal Garden',
      ago: '5m ago', mobile: false,
    });
  });

  test('a day with no scenes block still summarizes', async () => {
    // Defensive: the wall screen must not go blank because a field is missing.
    installFetch({
      date: LATEST, session_count: 0, event_count: 0,
      generated_at: isoAt(FIXED_NOW), sessions: [],
    });
    const mod = await loadModule();
    const onSummary = jest.fn();
    mod.initAnalytics({ onSummary });
    await mod.loadAnalytics();
    expect(onSummary.mock.calls[0][0]).toMatchObject({
      sceneCount: 0, busiestScene: '', busiestSceneEvents: 0, hasData: false,
    });
  });

  test('a failed fetch pushes a null summary instead of throwing', async () => {
    installFetch(null, { failIndex: true });
    const mod = await loadModule();
    const onSummary = jest.fn();
    mod.initAnalytics({ onSummary });
    await expect(mod.loadAnalytics()).resolves.toBeUndefined();
    expect(onSummary).toHaveBeenLastCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// The grouping + filtering view model. These are the functions that turn one
// day's events into either reading (by session, by scene) and narrow them by the
// action checkboxes, so they carry most of the dashboard's real logic.
// ---------------------------------------------------------------------------

async function loadModel() {
  jest.resetModules();
  return import('../www/shared/js/analytics-1.0.0.js');
}

// One day: a visitor who wandered xo -> garden, and one who stayed in xo.
const DAY = {
  date: '2026-06-28',
  sessions: [
    {
      label: 'Wandering Willow df', mobile: false, started_at: 'A',
      scenes: ['xo', 'garden'],
      events: [
        { action: 'session-start', scene: 'xo', at: 'A' },
        { action: 'snap', scene: 'xo', at: 'B' },
        { action: 'tree-planted', scene: 'garden', at: 'C' },
      ],
    },
    {
      label: 'Quiet Comet 5f', mobile: true, started_at: 'D',
      scenes: ['xo'],
      events: [
        { action: 'session-start', scene: 'xo', at: 'D' },
        { action: 'snap', scene: 'xo', at: 'E' },
      ],
    },
  ],
};

describe('scenesOf', () => {
  test('keeps the route order rather than sorting', async () => {
    const { scenesOf } = await loadModel();
    expect(scenesOf([
      { scene: 'xo' }, { scene: 'garden' }, { scene: 'xo' },
    ])).toEqual(['xo', 'garden']);
  });

  test('tolerates missing events and missing scenes', async () => {
    const { scenesOf } = await loadModel();
    expect(scenesOf(undefined)).toEqual([]);
    expect(scenesOf([null, {}, { scene: '' }])).toEqual([]);
  });
});

describe('visibleEvents', () => {
  test('narrows to one scene', async () => {
    const { visibleEvents } = await loadModel();
    const out = visibleEvents(DAY.sessions[0], 'garden', new Set());
    expect(out.map(e => e.action)).toEqual(['tree-planted']);
  });

  test('drops hidden actions', async () => {
    const { visibleEvents } = await loadModel();
    const out = visibleEvents(DAY.sessions[0], '', new Set(['snap']));
    expect(out.map(e => e.action)).toEqual(['session-start', 'tree-planted']);
  });

  test('applies both filters together', async () => {
    const { visibleEvents } = await loadModel();
    expect(visibleEvents(DAY.sessions[0], 'xo', new Set(['snap'])).map(e => e.action))
      .toEqual(['session-start']);
  });

  test('an absent hidden-set is treated as nothing hidden', async () => {
    const { visibleEvents } = await loadModel();
    expect(visibleEvents(DAY.sessions[0], '', undefined)).toHaveLength(3);
    expect(visibleEvents(null, '', new Set())).toEqual([]);
  });
});

describe('filterSessions', () => {
  test('unfiltered, every session survives intact', async () => {
    const { filterSessions } = await loadModel();
    expect(filterSessions(DAY, '', new Set())).toHaveLength(2);
  });

  test('a session with nothing left is dropped, not left empty', async () => {
    // Quiet Comet is xo-only, so filtering to garden must remove the card
    // entirely rather than render a session with no events under it.
    const { filterSessions } = await loadModel();
    const out = filterSessions(DAY, 'garden', new Set());
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Wandering Willow df');
  });

  test('surviving sessions carry a scenes list matching what is shown', async () => {
    const { filterSessions } = await loadModel();
    const out = filterSessions(DAY, 'garden', new Set());
    expect(out[0].scenes).toEqual(['garden']);       // not the original ['xo','garden']
    expect(out[0].events).toHaveLength(1);
  });

  test('hiding every action empties the day', async () => {
    const { filterSessions } = await loadModel();
    const all = new Set(['session-start', 'snap', 'tree-planted']);
    expect(filterSessions(DAY, '', all)).toEqual([]);
  });

  test('the source snapshot is not mutated', async () => {
    const { filterSessions } = await loadModel();
    filterSessions(DAY, 'garden', new Set());
    expect(DAY.sessions[0].events).toHaveLength(3);
    expect(DAY.sessions[0].scenes).toEqual(['xo', 'garden']);
  });

  test('tolerates a missing snapshot', async () => {
    const { filterSessions } = await loadModel();
    expect(filterSessions(null, '', new Set())).toEqual([]);
  });
});

describe('filterTotals', () => {
  test('reports shown against the day total', async () => {
    const { filterTotals } = await loadModel();
    expect(filterTotals(DAY, '', new Set())).toEqual({ total: 5, shown: 5 });
    expect(filterTotals(DAY, 'xo', new Set())).toEqual({ total: 5, shown: 4 });
    expect(filterTotals(DAY, '', new Set(['snap']))).toEqual({ total: 5, shown: 3 });
  });

  test('total counts the whole day even when nothing is shown', async () => {
    const { filterTotals } = await loadModel();
    const all = new Set(['session-start', 'snap', 'tree-planted']);
    expect(filterTotals(DAY, '', all)).toEqual({ total: 5, shown: 0 });
  });
});

describe('actionVocabulary', () => {
  test('counts every action in the day, busiest first', async () => {
    const { actionVocabulary } = await loadModel();
    expect(actionVocabulary(DAY, '')).toEqual([
      { action: 'session-start', count: 2 },
      { action: 'snap', count: 2 },
      { action: 'tree-planted', count: 1 },
    ]);
  });

  test('narrows to the chosen scene', async () => {
    const { actionVocabulary } = await loadModel();
    expect(actionVocabulary(DAY, 'garden')).toEqual([
      { action: 'tree-planted', count: 1 },
    ]);
  });

  test('ignores which boxes are ticked', async () => {
    // THE POINT: building the vocabulary from filtered events would make a
    // checkbox vanish the moment you unticked it, and there would be no way
    // to tick it back on.
    const { actionVocabulary } = await loadModel();
    const before = actionVocabulary(DAY, '');
    expect(actionVocabulary(DAY, '')).toEqual(before);
    expect(before.some(v => v.action === 'snap')).toBe(true);
  });

  test('ties break on name so the order is stable between polls', async () => {
    const { actionVocabulary } = await loadModel();
    const vocab = actionVocabulary(DAY, '');
    // session-start and snap both have 2; 'session-start' sorts before 'snap'.
    expect(vocab[0].action).toBe('session-start');
    expect(vocab[1].action).toBe('snap');
  });

  test('tolerates an empty or missing day', async () => {
    const { actionVocabulary } = await loadModel();
    expect(actionVocabulary(null, '')).toEqual([]);
    expect(actionVocabulary({ sessions: [] }, '')).toEqual([]);
  });
});

describe('sceneRows', () => {
  test('one row per scene, busiest first', async () => {
    const { sceneRows } = await loadModel();
    const rows = sceneRows(DAY, new Set());
    expect(rows.map(r => r.scene)).toEqual(['xo', 'garden']);
    expect(rows[0]).toMatchObject({ scene: 'xo', eventCount: 4, sessionCount: 2 });
    expect(rows[1]).toMatchObject({ scene: 'garden', eventCount: 1, sessionCount: 1 });
  });

  test('a session counts once per scene it touched, not once per event', async () => {
    const { sceneRows } = await loadModel();
    const rows = sceneRows(DAY, new Set());
    // Wandering Willow fired two xo events but is one xo session.
    expect(rows.find(r => r.scene === 'xo').sessionCount).toBe(2);
  });

  test('mobile sessions are counted per scene', async () => {
    const { sceneRows } = await loadModel();
    const rows = sceneRows(DAY, new Set());
    expect(rows.find(r => r.scene === 'xo').mobileSessions).toBe(1);
    expect(rows.find(r => r.scene === 'garden').mobileSessions).toBe(0);
  });

  test('recomputes under the action filter', async () => {
    // The snapshot's own `scenes` block describes the unfiltered day, so the
    // by-scene view has to do its own counting or the totals would lie.
    const { sceneRows } = await loadModel();
    const rows = sceneRows(DAY, new Set(['snap']));
    expect(rows.find(r => r.scene === 'xo').eventCount).toBe(2);
  });

  test('a scene filtered away entirely loses its row', async () => {
    const { sceneRows } = await loadModel();
    const rows = sceneRows(DAY, new Set(['tree-planted']));
    expect(rows.map(r => r.scene)).toEqual(['xo']);
  });

  test('names the top actions and counts the rest', async () => {
    const { sceneRows } = await loadModel();
    const xo = sceneRows(DAY, new Set()).find(r => r.scene === 'xo');
    expect(xo.actionCount).toBe(2);
    expect(xo.topActions).toEqual([
      { action: 'session-start', count: 2 },
      { action: 'snap', count: 2 },
    ]);
  });

  test('tolerates a missing day', async () => {
    const { sceneRows } = await loadModel();
    expect(sceneRows(null, new Set())).toEqual([]);
  });
});

describe('scenesInSnapshot', () => {
  test('lists the scenes the day actually holds, busiest first', async () => {
    const { scenesInSnapshot } = await loadModel();
    expect(scenesInSnapshot(DAY)).toEqual(['xo', 'garden']);
    expect(scenesInSnapshot(null)).toEqual([]);
  });
});

describe('eventDetail', () => {
  test('joins the short fields an event carried', async () => {
    const { eventDetail } = await loadModel();
    expect(eventDetail({ kind: 'catch', seconds: 1.4 })).toBe('catch · 1.4s');
    expect(eventDetail({ seconds: 62 })).toBe('62s');
    expect(eventDetail({ saved: 3, destroyed: 9 })).toBe('3 saved · 9 destroyed');
  });

  test('zero is a number worth showing, absent is not', async () => {
    const { eventDetail } = await loadModel();
    expect(eventDetail({ seconds: 0 })).toBe('0s');
    expect(eventDetail({ saved: 0 })).toBe('0 saved');
    expect(eventDetail({ action: 'snap' })).toBe('');
    expect(eventDetail(null)).toBe('');
  });

  test('leaves the nested outcome string out of the timeline', async () => {
    const { eventDetail } = await loadModel();
    expect(eventDetail({ outcome: 'defense=cover3&offense=pass2' })).toBe('');
  });
});

describe('humanizeAction', () => {
  test('turns a slug into a sentence', async () => {
    const { humanizeAction } = await loadModel();
    expect(humanizeAction('reached-tsunami')).toBe('Reached tsunami');
    expect(humanizeAction('snap')).toBe('Snap');
    expect(humanizeAction('')).toBe('');
    expect(humanizeAction(undefined)).toBe('');
  });
});
