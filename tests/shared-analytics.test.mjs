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
  test('maps known action codes to human phrasings, passes through unknowns', async () => {
    const { prettyAction } = await loadHelpers();
    expect(prettyAction('enter-store')).toBe('Entered the gallery');
    expect(prettyAction('download-vcard')).toBe('Saved the contact card');
    expect(prettyAction('totally-unknown')).toBe('totally-unknown');
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
      sessions: [
        { label: 'Visitor 1', mobile: true, events: [{ action: 'enter-store', at: isoAt(FIXED_NOW) }] },
        { label: 'Visitor 2', mobile: false, events: [{ action: 'open-piece', at: isoAt(FIXED_NOW - 5 * 60 * 1000) }] },
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
      hasData: true,
      updatedAgo: 'just now',
      stale: false,
    });
    expect(summary.date).toContain('2026');
    expect(summary.recent[0]).toEqual({
      label: 'Visitor 1', action: 'Entered the gallery', ago: 'just now', mobile: true,
    });
    expect(summary.recent[1]).toEqual({
      label: 'Visitor 2', action: 'Opened an art piece', ago: '5m ago', mobile: false,
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

describe('leaderboard helpers', () => {
  test('fmtDuration formats whole seconds as m:ss with zero-padding', async () => {
    const { fmtDuration } = await loadHelpers();
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(7)).toBe('0:07');
    expect(fmtDuration(142)).toBe('2:22');
    expect(fmtDuration(600)).toBe('10:00');
    expect(fmtDuration(-5)).toBe('0:00');     // clamped
    expect(fmtDuration('90')).toBe('1:30');   // coerced
    expect(fmtDuration(undefined)).toBe('0:00');
  });

  test('leaderboardSummary ranks fastest-first, formats, and flags mobile', async () => {
    const { leaderboardSummary } = await loadHelpers();
    const s = leaderboardSummary({
      generated_at: isoAt(FIXED_NOW - 60_000),  // 1m ago
      entries: [
        { label: 'Quiet Comet 5f', seconds: 158, mobile: true },
        { label: 'Curious Otter a3', seconds: 142, mobile: false },
      ],
    });
    expect(s.count).toBe(2);
    expect(s.updatedAgo).toBe('1m ago');
    expect(s.entries[0]).toEqual({
      rank: 1, label: 'Curious Otter a3', seconds: 142, time: '2:22', mobile: false,
    });
    expect(s.entries[1]).toMatchObject({ rank: 2, time: '2:38', mobile: true });
  });

  test('leaderboardSummary drops malformed/non-positive entries defensively', async () => {
    const { leaderboardSummary } = await loadHelpers();
    const s = leaderboardSummary({
      entries: [
        { label: 'Good One', seconds: 100 },
        { label: 'No Time' },                 // missing seconds
        { label: 'Zero', seconds: 0 },        // non-positive
        { seconds: 50 },                      // missing label
        'garbage',                            // not an object
      ],
    });
    expect(s.count).toBe(1);
    expect(s.entries[0].label).toBe('Good One');
  });

  test('leaderboardSummary tolerates a missing/empty payload', async () => {
    const { leaderboardSummary } = await loadHelpers();
    expect(leaderboardSummary(null)).toMatchObject({ count: 0, entries: [] });
    expect(leaderboardSummary({}).count).toBe(0);
  });
});
