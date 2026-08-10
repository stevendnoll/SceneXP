// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/js/directory.js — the live search over the home page's
 * static experience cards.
 *
 * The script is an IIFE that registers a DOMContentLoaded listener on import,
 * so each test installs a capturing document stub first, imports a fresh
 * module instance, then fires the captured listener by hand and drives the
 * search box through its own captured 'input' listener.
 */
import { jest } from '@jest/globals';

const SLUGS = ['dad', 'family', 'roqui', 'seedtoseed', 'interstate', 'steve', 'gavin', 'jamar', 'mandelbrot', 'earthdefense'];

function makeDom({ withMarkup = true } = {}) {
  const dom = {
    listeners: {},
    cards: {},
    form: { hidden: true, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } },
    input: { value: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } },
    status: { textContent: 'untouched' },
    empty: { hidden: true },
  };
  SLUGS.forEach((slug) => { dom.cards[slug] = { hidden: false }; });
  globalThis.document = {
    addEventListener(type, fn) { dom.listeners[type] = fn; },
    getElementById(id) {
      if (!withMarkup) return null;
      return {
        'experience-search-form': dom.form,
        'experience-search': dom.input,
        'search-status': dom.status,
        'search-empty': dom.empty,
      }[id] ?? null;
    },
    querySelector(selector) {
      const m = selector.match(/data-slug="([^"]+)"/);
      return m ? dom.cards[m[1]] ?? null : null;
    },
  };
  return dom;
}

// Import fresh and simulate the page load.
async function load(dom) {
  jest.resetModules();
  await import('../www/js/directory.js');
  dom.listeners.DOMContentLoaded();
  return dom;
}

function search(dom, query) {
  dom.input.value = query;
  dom.input.listeners.input();
}

const shownSlugs = (dom) => SLUGS.filter((slug) => !dom.cards[slug].hidden);

afterEach(() => {
  delete globalThis.document;
});

test('reveals the search form (progressive enhancement)', async () => {
  const dom = await load(makeDom());
  expect(dom.form.hidden).toBe(false);
});

test('stays quiet on pages without the search markup', async () => {
  const dom = makeDom({ withMarkup: false });
  await expect(load(dom)).resolves.toBeDefined();
  expect(dom.form.hidden).toBe(true);
});

test('filters cards live and reports the count politely', async () => {
  const dom = await load(makeDom());
  search(dom, 'zumba');
  expect(shownSlugs(dom)).toEqual(['roqui']);
  expect(dom.status.textContent).toBe(`1 of ${SLUGS.length} experiences shown`);
  expect(dom.empty.hidden).toBe(true);
});

test('matching is case-insensitive, trims whitespace, and searches the tags', async () => {
  const dom = await load(makeDom());
  search(dom, '  PUTT  ');
  expect(shownSlugs(dom)).toEqual(['family']);
  // 'grow more food' only appears in the seedtoseed tag list.
  search(dom, 'grow more food');
  expect(shownSlugs(dom)).toEqual(['seedtoseed']);
});

test('no matches shows the empty message and a zero count', async () => {
  const dom = await load(makeDom());
  search(dom, 'xyzzy');
  expect(shownSlugs(dom)).toEqual([]);
  expect(dom.empty.hidden).toBe(false);
  expect(dom.status.textContent).toBe(`0 of ${SLUGS.length} experiences shown`);
});

test('clearing the box restores every card and empties the status', async () => {
  const dom = await load(makeDom());
  search(dom, 'zumba');
  search(dom, '');
  expect(shownSlugs(dom)).toEqual(SLUGS);
  expect(dom.empty.hidden).toBe(true);
  expect(dom.status.textContent).toBe('');
});

test('the form never navigates (submit is prevented)', async () => {
  const dom = await load(makeDom());
  const event = { preventDefault: jest.fn() };
  dom.form.listeners.submit(event);
  expect(event.preventDefault).toHaveBeenCalled();
});
