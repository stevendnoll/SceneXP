// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/js/theme.js — the light/dark/system theme switcher for
 * the base site pages.
 *
 * The script is an IIFE that applies the saved preference to <html> the
 * moment it is imported (it runs synchronously in <head> to avoid a theme
 * flash), then wires the header toggle on DOMContentLoaded. Each test stubs
 * document/localStorage, imports a fresh instance, and inspects the
 * attributes it set on the root element.
 */
import { jest } from '@jest/globals';

function makeDom({ stored = null, storageFails = false } = {}) {
  const dom = {
    listeners: {},
    root: {
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
    },
    btn: {
      hidden: true,
      title: '',
      attrs: {},
      listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { this.listeners[t] = f; },
    },
    saved: new Map(stored != null ? [['scenexp-theme', stored]] : []),
  };
  globalThis.document = {
    documentElement: dom.root,
    addEventListener(type, fn) { dom.listeners[type] = fn; },
    getElementById: (id) => (id === 'theme-toggle' ? dom.btn : null),
  };
  globalThis.localStorage = {
    getItem(k) { if (storageFails) throw new Error('blocked'); return dom.saved.has(k) ? dom.saved.get(k) : null; },
    setItem(k, v) { if (storageFails) throw new Error('blocked'); dom.saved.set(k, v); },
  };
  return dom;
}

async function load(dom) {
  jest.resetModules();
  await import('../www/js/theme.js');
  return dom;
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
});

test('applies a saved explicit choice before first paint', async () => {
  const dom = await load(makeDom({ stored: 'dark' }));
  expect(dom.root.attrs['data-theme']).toBe('dark');
  expect(dom.root.attrs['data-theme-pref']).toBe('dark');
});

test('an unknown saved value falls back to system (CSS decides)', async () => {
  const dom = await load(makeDom({ stored: 'purple' }));
  expect(dom.root.attrs['data-theme']).toBeUndefined();
  expect(dom.root.attrs['data-theme-pref']).toBe('system');
});

test('blocked storage still lands safely on system', async () => {
  const dom = await load(makeDom({ storageFails: true }));
  expect(dom.root.attrs['data-theme']).toBeUndefined();
  expect(dom.root.attrs['data-theme-pref']).toBe('system');
});

test('reveals and labels the toggle on page load', async () => {
  const dom = await load(makeDom());
  dom.listeners.DOMContentLoaded();
  expect(dom.btn.hidden).toBe(false);
  expect(dom.btn.attrs['aria-label']).toBe('Theme: System. Activate to change.');
  expect(dom.btn.title).toBe('Theme: System');
});

test('clicking cycles system -> light -> dark -> system and persists each step', async () => {
  const dom = await load(makeDom());
  dom.listeners.DOMContentLoaded();

  dom.btn.listeners.click();
  expect(dom.root.attrs['data-theme']).toBe('light');
  expect(dom.saved.get('scenexp-theme')).toBe('light');
  expect(dom.btn.title).toBe('Theme: Light');

  dom.btn.listeners.click();
  expect(dom.root.attrs['data-theme']).toBe('dark');
  expect(dom.saved.get('scenexp-theme')).toBe('dark');

  dom.btn.listeners.click();
  expect(dom.root.attrs['data-theme']).toBeUndefined();
  expect(dom.root.attrs['data-theme-pref']).toBe('system');
  expect(dom.saved.get('scenexp-theme')).toBe('system');
});

test('a click still applies for this page view when storage is blocked', async () => {
  const dom = await load(makeDom({ storageFails: true }));
  dom.listeners.DOMContentLoaded();
  expect(() => dom.btn.listeners.click()).not.toThrow();
  expect(dom.root.attrs['data-theme']).toBe('light');
});
