// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/js/nav.js — the mobile hamburger menu on the base
 * SceneXP.com pages.
 *
 * Same technique as the directory tests: the script is an IIFE that
 * registers a DOMContentLoaded listener on import, so each test installs a
 * capturing document stub, imports a fresh module instance, fires the
 * captured listener by hand, and then drives the menu through the click,
 * pointerdown, and keydown listeners the script registered.
 */
import { jest } from '@jest/globals';

function makeClassList() {
  const set = new Set();
  return {
    add(c) { set.add(c); },
    toggle(c, force) {
      const want = force === undefined ? !set.has(c) : force;
      if (want) set.add(c); else set.delete(c);
      return want;
    },
    contains(c) { return set.has(c); },
  };
}

function makeDom({ withMarkup = true } = {}) {
  const dom = {
    docListeners: {},
    html: { classList: makeClassList() },
    btn: {
      hidden: true,
      listeners: {},
      attrs: {},
      focused: false,
      addEventListener(t, f) { this.listeners[t] = f; },
      setAttribute(name, value) { this.attrs[name] = value; },
      contains(el) { return el === this; },
      focus() { this.focused = true; },
    },
    nav: {
      classList: makeClassList(),
      listeners: {},
      addEventListener(t, f) { this.listeners[t] = f; },
      contains(el) { return el === this || el?.insideNav === true; },
    },
  };
  globalThis.document = {
    documentElement: dom.html,
    addEventListener(type, fn) { dom.docListeners[type] = fn; },
    getElementById(id) {
      if (!withMarkup) return null;
      return { 'nav-toggle': dom.btn, 'site-nav': dom.nav }[id] ?? null;
    },
  };
  return dom;
}

// Import fresh and simulate the page load.
async function load(dom) {
  jest.resetModules();
  await import('../www/js/nav.js');
  dom.docListeners.DOMContentLoaded();
  return dom;
}

const isOpen = (dom) => dom.nav.classList.contains('open');
const clickToggle = (dom) => {
  const event = { stopPropagation: jest.fn() };
  dom.btn.listeners.click(event);
  return event;
};

afterEach(() => {
  delete globalThis.document;
});

test('reveals the hamburger and tags <html> (progressive enhancement)', async () => {
  const dom = await load(makeDom());
  expect(dom.html.classList.contains('js-nav')).toBe(true);
  expect(dom.btn.hidden).toBe(false);
  expect(isOpen(dom)).toBe(false);
});

test('stays quiet on pages without the nav markup', async () => {
  const dom = makeDom({ withMarkup: false });
  await expect(load(dom)).resolves.toBeDefined();
  expect(dom.html.classList.contains('js-nav')).toBe(false);
  expect(dom.btn.hidden).toBe(true);
});

test('the button toggles the menu and keeps aria-expanded honest', async () => {
  const dom = await load(makeDom());

  const openEvent = clickToggle(dom);
  expect(openEvent.stopPropagation).toHaveBeenCalled();
  expect(isOpen(dom)).toBe(true);
  expect(dom.btn.attrs['aria-expanded']).toBe('true');

  clickToggle(dom);
  expect(isOpen(dom)).toBe(false);
  expect(dom.btn.attrs['aria-expanded']).toBe('false');
});

test('following a link closes the menu, other taps inside it do not', async () => {
  const dom = await load(makeDom());
  clickToggle(dom);

  // A tap inside the nav that is not on a link leaves the menu open
  dom.nav.listeners.click({ target: { closest: () => null } });
  expect(isOpen(dom)).toBe(true);

  // A tap on (or inside) a link closes it
  dom.nav.listeners.click({ target: { closest: (sel) => (sel === 'a' ? {} : null) } });
  expect(isOpen(dom)).toBe(false);
  expect(dom.btn.attrs['aria-expanded']).toBe('false');
});

test('a press outside closes the menu, presses on the menu or button do not', async () => {
  const dom = await load(makeDom());

  // Closed: an outside press is ignored entirely
  dom.docListeners.pointerdown({ target: {} });
  expect(isOpen(dom)).toBe(false);

  clickToggle(dom);

  // Presses inside the nav, or on the toggle itself, leave it open
  dom.docListeners.pointerdown({ target: { insideNav: true } });
  expect(isOpen(dom)).toBe(true);
  dom.docListeners.pointerdown({ target: dom.btn });
  expect(isOpen(dom)).toBe(true);

  // Anywhere else closes it
  dom.docListeners.pointerdown({ target: {} });
  expect(isOpen(dom)).toBe(false);
});

test('Escape closes the menu and hands focus back to the button', async () => {
  const dom = await load(makeDom());
  clickToggle(dom);

  dom.docListeners.keydown({ key: 'Escape' });
  expect(isOpen(dom)).toBe(false);
  expect(dom.btn.focused).toBe(true);
});

test('Escape while closed (and other keys) do nothing', async () => {
  const dom = await load(makeDom());

  dom.docListeners.keydown({ key: 'Escape' });
  expect(isOpen(dom)).toBe(false);
  expect(dom.btn.focused).toBe(false);

  clickToggle(dom);
  dom.docListeners.keydown({ key: 'Enter' });
  expect(isOpen(dom)).toBe(true);
});
