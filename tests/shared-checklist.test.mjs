// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/checklist-1.0.0.js — the shared engine's discovery
 * checklist mechanism. Unlike the www/js copy (fixed ITEMS baked in), the
 * shared part receives its item list and storage key via initChecklist(config),
 * so these tests focus on that injection plus the core tick/persist/notify
 * behavior. DOM access is null-guarded in the source, so a getElementById that
 * finds nothing is a valid (headless) environment.
 */
import { jest } from '@jest/globals';

const ITEMS = [
  { id: 'host', label: 'Say hello to the host', short: 'meet the host' },
  { id: 'lift', label: 'See the car up on the lift', short: 'see the lift' },
  { id: 'tv',   label: 'Check the TV', short: 'watch the TV' },
];

function installSessionStorage({ failing = false } = {}) {
  if (failing) {
    globalThis.sessionStorage = {
      getItem() { throw new Error('nope'); },
      setItem() { throw new Error('nope'); },
    };
    return { store: null };
  }
  const store = new Map();
  globalThis.sessionStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
  };
  return { store };
}

function installDocument() {
  globalThis.document = { getElementById() { return null; } };
}

async function loadChecklist() {
  installDocument();
  jest.resetModules();
  return import('../www/shared/js/checklist-1.0.0.js');
}

afterEach(() => {
  delete globalThis.sessionStorage;
  delete globalThis.document;
});

test('defaults: no items, empty progress, marks are no-ops', async () => {
  installSessionStorage();
  const m = await loadChecklist();
  m.initChecklist();
  expect(m.getChecklistItems()).toEqual([]);
  expect(m.getChecklistProgress()).toEqual({ done: 0, total: 0, complete: true });
  expect(() => m.markChecklistItem('anything')).not.toThrow();
});

test('injected items are returned with done state, in order', async () => {
  installSessionStorage();
  const m = await loadChecklist();
  m.initChecklist({ items: ITEMS, storageKey: 'test-checklist' });
  const items = m.getChecklistItems();
  expect(items.map((i) => i.id)).toEqual(['host', 'lift', 'tv']);
  expect(items.every((i) => i.done === false)).toBe(true);
  expect(m.getChecklistProgress()).toEqual({ done: 0, total: 3, complete: false });
});

test('marking ticks the item, persists under the injected key, and notifies once', async () => {
  const { store } = installSessionStorage();
  const m = await loadChecklist();
  m.initChecklist({ items: ITEMS, storageKey: 'test-checklist' });

  const seen = [];
  m.onChecklistChange((items, progress) => seen.push(progress.done));

  m.markChecklistItem('lift');
  m.markChecklistItem('lift');      // already done: no second notify
  m.markChecklistItem('unknown');   // unknown id: no-op

  expect(seen).toEqual([1]);
  expect(m.getChecklistItems().find((i) => i.id === 'lift').done).toBe(true);
  expect(JSON.parse(store.get('test-checklist'))).toEqual(['lift']);
});

test('progress restores from the injected storage key, dropping unknown ids', async () => {
  const { store } = installSessionStorage();
  store.set('test-checklist', JSON.stringify(['tv', 'retired-item']));
  const m = await loadChecklist();
  m.initChecklist({ items: ITEMS, storageKey: 'test-checklist' });
  expect(m.getChecklistProgress()).toEqual({ done: 1, total: 3, complete: false });
  expect(m.getChecklistItems().find((i) => i.id === 'tv').done).toBe(true);
});

test('completing every item reports complete', async () => {
  installSessionStorage();
  const m = await loadChecklist();
  m.initChecklist({ items: ITEMS });
  ITEMS.forEach((it) => m.markChecklistItem(it.id));
  expect(m.getChecklistProgress()).toEqual({ done: 3, total: 3, complete: true });
});

test('storage failures (private mode) never throw', async () => {
  installSessionStorage({ failing: true });
  const m = await loadChecklist();
  expect(() => {
    m.initChecklist({ items: ITEMS, storageKey: 'test-checklist' });
    m.markChecklistItem('host');
  }).not.toThrow();
  expect(m.getChecklistProgress().done).toBe(1);
});
