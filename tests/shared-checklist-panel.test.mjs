// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * DOM-panel tests for www/shared/js/checklist-1.0.0.js — the branch the
 * headless suite (tests/shared-checklist.test.mjs) deliberately leaves dark:
 * when getElementById finds the real #checklist / #checklist-items /
 * #checklist-count elements, initChecklist builds one row per injected item
 * and markChecklistItem ticks the matching row visually.
 *
 * Stubbing follows tests/shared-pan.test.mjs: tiny recording elements
 * (classList, dataset, appendChild, plus a querySelector that understands the
 * one [data-id="..."] selector the module uses) installed as per-test globals
 * and removed in afterEach. The one-shot just-done animation class is driven
 * with Jest fake timers so the 600ms cleanup is asserted deterministically.
 */
import { jest } from '@jest/globals';

const ITEMS = [
  { id: 'host', label: 'Say hello to the host', short: 'meet the host' },
  { id: 'lift', label: 'See the car up on the lift', short: 'see the lift' },
  { id: 'tv',   label: 'Check the TV', short: 'watch the TV' },
];

// ---- Recording DOM ---------------------------------------------------------

function makeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    classes: new Set(),
    dataset: {},
    attrs: {},
    _text: '',
  };
  Object.defineProperty(el, 'className', {
    get() { return [...el.classes].join(' '); },
    set(value) { el.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
  });
  // Setting textContent on a real element drops its children; the module
  // relies on that to clear the list before rebuilding rows on re-init.
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(value) { el._text = String(value); el.children.length = 0; },
  });
  el.classList = {
    add: (...cs) => cs.forEach((c) => el.classes.add(c)),
    remove: (...cs) => cs.forEach((c) => el.classes.delete(c)),
    toggle: (c, force) => {
      const on = force === undefined ? !el.classes.has(c) : !!force;
      if (on) el.classes.add(c); else el.classes.delete(c);
      return on;
    },
    contains: (c) => el.classes.has(c),
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.appendChild = (child) => { el.children.push(child); return child; };
  // The module only ever queries the list for one row: [data-id="..."].
  el.querySelector = (sel) => {
    const m = /^\[data-id="(.+)"\]$/.exec(sel);
    return (m && el.children.find((c) => c.dataset.id === m[1])) || null;
  };
  return el;
}

function installDom() {
  const panel = makeEl('div');
  const list = makeEl('ul');
  const count = makeEl('span');
  const byId = { checklist: panel, 'checklist-items': list, 'checklist-count': count };
  globalThis.document = {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => makeEl(tag),
  };
  return { panel, list, count };
}

// ---- Harness ---------------------------------------------------------------

/** Fresh module against a fresh panel DOM, optionally with persisted progress. */
async function setup({ seed } = {}) {
  const dom = installDom();
  const store = new Map();
  if (seed) store.set('dom-checklist', JSON.stringify(seed));
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  jest.resetModules();
  const m = await import('../www/shared/js/checklist-1.0.0.js');
  m.initChecklist({ items: ITEMS, storageKey: 'dom-checklist' });
  return { m, store, ...dom };
}

// Fake timers throughout: markChecklistItem schedules a 600ms cleanup, and a
// real pending timer would outlive the test worker.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  delete globalThis.sessionStorage;
  delete globalThis.document;
});

test('initChecklist builds one accessible row per injected item', async () => {
  const { list, count, panel } = await setup();

  expect(list.children).toHaveLength(3);
  expect(list.children.map((li) => li.dataset.id)).toEqual(['host', 'lift', 'tv']);
  list.children.forEach((li, i) => {
    expect(li.classList.contains('checklist-item')).toBe(true);
    expect(li.classList.contains('done')).toBe(false);
    const [box, text] = li.children;
    expect(box.classes.has('checklist-box')).toBe(true);
    expect(box.attrs['aria-hidden']).toBe('true');
    expect(text.classes.has('checklist-text')).toBe(true);
    expect(text.textContent).toBe(ITEMS[i].label);
  });
  expect(count.textContent).toBe('0 / 3');
  expect(panel.classList.contains('complete')).toBe(false);
});

test('restored progress renders its rows pre-ticked', async () => {
  const { list, count } = await setup({ seed: ['tv'] });
  const doneFlags = Object.fromEntries(
    list.children.map((li) => [li.dataset.id, li.classList.contains('done')]));
  expect(doneFlags).toEqual({ host: false, lift: false, tv: true });
  expect(count.textContent).toBe('1 / 3');
});

test('re-init rebuilds the rows instead of appending duplicates', async () => {
  const { m, list } = await setup();
  m.initChecklist({ items: ITEMS, storageKey: 'dom-checklist' });
  expect(list.children).toHaveLength(3);
});

test('marking an item ticks its row, pulses it once, and updates the count', async () => {
  const { m, list, count } = await setup();

  m.markChecklistItem('lift');

  const row = list.children.find((li) => li.dataset.id === 'lift');
  expect(row.classList.contains('done')).toBe(true);
  expect(row.classList.contains('just-done')).toBe(true); // tick animation armed
  expect(count.textContent).toBe('1 / 3');
  const others = list.children.filter((li) => li.dataset.id !== 'lift');
  expect(others.every((li) => !li.classList.contains('done'))).toBe(true);

  // The one-shot animation class drops after it plays; the tick itself stays.
  jest.advanceTimersByTime(600);
  expect(row.classList.contains('just-done')).toBe(false);
  expect(row.classList.contains('done')).toBe(true);
});

test('a throwing subscriber never blocks the panel update or the other mirrors', async () => {
  const { m, list, count } = await setup();
  const seen = [];
  m.onChecklistChange(() => { throw new Error('bad mirror'); });
  m.onChecklistChange((items, progress) => seen.push(progress.done));

  expect(() => m.markChecklistItem('host')).not.toThrow();
  expect(seen).toEqual([1]); // the well-behaved mirror still heard about it
  expect(list.children.find((li) => li.dataset.id === 'host').classList.contains('done')).toBe(true);
  expect(count.textContent).toBe('1 / 3');
});

test('completing every item flips the panel to its celebratory complete state', async () => {
  const { m, panel, count, list } = await setup();
  ITEMS.forEach((it) => m.markChecklistItem(it.id));
  expect(count.textContent).toBe('3 / 3');
  expect(panel.classList.contains('complete')).toBe(true);
  expect(list.children.every((li) => li.classList.contains('done'))).toBe(true);
});
