// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/telemetry-1.0.0.js — the shared-engine copy of the
 * fire-and-forget usage beacon.
 *
 * Same approach as tests/telemetry.test.mjs (which covers the untouched
 * www/js parent copy): telemetry's only output is the URL it pokes into an
 * Image's `src` (track / fallback) or hands to navigator.sendBeacon
 * (trackFinal), so we stub those sinks and assert on the query string.
 *
 * One deliberate difference: the shared copy serves experiences that live one
 * folder deep (/dad/, /roqui/, ...), so its ENDPOINT is '../api.html'. The
 * beacon URL resolves against the page, landing on the site-root api.html.
 */
import { jest } from '@jest/globals';

const FIXED_NOW = 1_700_000_000_000;

let lastImageSrc;
let imageConstructed;

function installImage({ throwing = false } = {}) {
  lastImageSrc = undefined;
  imageConstructed = 0;
  if (throwing) {
    globalThis.Image = function () { throw new Error('Image unavailable'); };
    return;
  }
  globalThis.Image = class {
    constructor() { imageConstructed += 1; }
    set src(v) { lastImageSrc = v; }
    get src() { return lastImageSrc; }
  };
}

function installNavigator({ language = 'en-US', sendBeacon } = {}) {
  const nav = { language };
  if (sendBeacon !== undefined) nav.sendBeacon = sendBeacon;
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

// Load a pristine shared telemetry.js. LANG is captured at import time, so
// navigator must be installed *before* the dynamic import.
async function loadTelemetry({ navigator = {}, image = {} } = {}) {
  installNavigator(navigator);
  installImage(image);
  jest.resetModules();
  return import('../www/shared/js/telemetry-1.0.0.js');
}

// Pull the query params out of a captured `../api.html?...` URL.
function queryOf(url) {
  expect(typeof url).toBe('string');
  const [path, qs] = url.split('?');
  expect(path).toBe('../api.html');
  return new URLSearchParams(qs);
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.Image;
  delete globalThis.navigator;
});

describe('shared track', () => {
  test('builds ../api.html with action, timestamp, mobile, and lang', async () => {
    const { track } = await loadTelemetry({ navigator: { language: 'en-US' } });
    track('enter-store');

    expect(imageConstructed).toBe(1);
    const q = queryOf(lastImageSrc);
    expect(q.get('action')).toBe('enter-store');
    expect(q.get('timestamp')).toBe(String(FIXED_NOW));
    expect(q.get('mobile')).toBe('false');
    expect(q.get('lang')).toBe('en-US');
    expect(q.get('hash')).toBeNull();
  });

  test('omits lang when navigator.language is empty', async () => {
    const { track } = await loadTelemetry({ navigator: { language: '' } });
    track('ping');
    expect(queryOf(lastImageSrc).has('lang')).toBe(false);
  });

  test('setMobile and setProofHash are reflected on subsequent pings', async () => {
    const { track, setMobile, setProofHash } = await loadTelemetry();
    setMobile(true);
    setProofHash('11abc');
    track('ping');
    const q = queryOf(lastImageSrc);
    expect(q.get('mobile')).toBe('true');
    expect(q.get('hash')).toBe('11abc');

    setProofHash(''); // falsy clears it back to null
    track('ping');
    expect(queryOf(lastImageSrc).has('hash')).toBe(false);
  });

  test('never throws even if Image construction fails', async () => {
    const { track } = await loadTelemetry({ image: { throwing: true } });
    expect(() => track('ping')).not.toThrow();
  });
});

describe('shared trackFinal', () => {
  test('prefers navigator.sendBeacon and does not use an Image', async () => {
    const sendBeacon = jest.fn(() => true);
    const { trackFinal } = await loadTelemetry({ navigator: { language: 'en-US', sendBeacon } });
    trackFinal('session-end', { reason: 'pagehide' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const q = queryOf(sendBeacon.mock.calls[0][0]);
    expect(q.get('action')).toBe('session-end');
    expect(q.get('reason')).toBe('pagehide');
    expect(imageConstructed).toBe(0);
  });

  test('falls back to an Image beacon when sendBeacon returns false', async () => {
    const sendBeacon = jest.fn(() => false);
    const { trackFinal } = await loadTelemetry({ navigator: { language: 'en-US', sendBeacon } });
    trackFinal('session-end');

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(imageConstructed).toBe(1);
    expect(queryOf(lastImageSrc).get('action')).toBe('session-end');
  });

  test('never throws even if both sinks fail', async () => {
    const sendBeacon = jest.fn(() => { throw new Error('beacon blew up'); });
    const { trackFinal } = await loadTelemetry({
      navigator: { language: 'en-US', sendBeacon },
      image: { throwing: true },
    });
    expect(() => trackFinal('session-end')).not.toThrow();
  });
});

describe('the scene parameter', () => {
  // SCENE is captured from window.location at import time (same pattern as
  // LANG), so the window stub must be installed before loadTelemetry.
  afterEach(() => { delete globalThis.window; });

  test('names the experience folder the page is served from', async () => {
    globalThis.window = { location: { pathname: '/interstate/' } };
    const { track } = await loadTelemetry();
    track('open-help');
    expect(queryOf(lastImageSrc).get('scene')).toBe('interstate');
  });

  test('ignores a trailing document name', async () => {
    globalThis.window = { location: { pathname: '/seedtoseed/index.html' } };
    const { track } = await loadTelemetry();
    track('open-help');
    expect(queryOf(lastImageSrc).get('scene')).toBe('seedtoseed');
  });

  test('is omitted at the site root and when location is unavailable', async () => {
    globalThis.window = { location: { pathname: '/index.html' } };
    let { track } = await loadTelemetry();
    track('open-help');
    expect(queryOf(lastImageSrc).has('scene')).toBe(false);

    delete globalThis.window;
    ({ track } = await loadTelemetry());
    track('open-help');
    expect(queryOf(lastImageSrc).has('scene')).toBe(false);
  });
});
