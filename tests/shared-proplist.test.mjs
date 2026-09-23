// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/proplist-1.0.0.js, the keyboard's way to the
 * things in a 3D room. Plain stub elements, no DOM library.
 */
import { jest } from '@jest/globals';
import { readFile as readPage, readdir as readWww } from 'node:fs/promises';

function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    listeners: {},
    type: '',
    className: '',
    _text: '',
  };
  Object.defineProperty(el, 'textContent', {
    get: () => el._text,
    set: (v) => { el._text = String(v); el.children = []; },
  });
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
  el.addEventListener = (type, fn, opts) => {
    (el.listeners[type] ||= []).push({ fn, opts });
  };
  el.fire = (type) => (el.listeners[type] || []).forEach(({ fn }) => fn({}));
  el.appendChild = (c) => { el.children.push(c); return c; };
  return el;
}

const rowsOf = (list) => list.children.map((li) => li.children[0]);

let m;
beforeEach(async () => {
  globalThis.document = { createElement: makeEl };
  jest.resetModules();
  m = await import('../www/shared/js/proplist-1.0.0.js');
});
afterEach(() => { delete globalThis.document; });

const CARDS = {
  dashboard: { title: 'The Wall Display', lines: [] },
  cat: { title: 'The Office Manager', lines: ['a'] },
  kettlebells: { title: 'The Kettlebells', lines: ['b'] },   // written, never built
  untitled: { lines: ['c'] },                                 // no title
  door: { title: 'The Office Door', lines: ['d'] },
};

describe('propListItems', () => {
  test('keeps only props that are registered AND have a titled card, in card order', () => {
    const rows = m.propListItems(CARDS, ['door', 'cat', 'dashboard', 'untitled', 'vent']);
    expect(rows).toEqual([
      { id: 'dashboard', label: 'The Wall Display' },
      { id: 'cat', label: 'The Office Manager' },
      { id: 'door', label: 'The Office Door' },
    ]);
  });

  test('a card written for something never built leaves no row that opens nothing', () => {
    const rows = m.propListItems(CARDS, ['cat']);
    expect(rows.map((r) => r.id)).not.toContain('kettlebells');
  });

  test('the row says exactly what the card says', () => {
    // So renaming a card renames its row, and the two can never disagree.
    const [row] = m.propListItems(CARDS, ['cat']);
    expect(row.label).toBe(CARDS.cat.title);
  });

  test('extra rows lead and follow, for the host and for panel controls', () => {
    const rows = m.propListItems(CARDS, ['cat'], {
      before: [{ id: 'steve', label: 'Steve' }],
      after: [{ id: 'lightswitch', label: 'The Light Switch' }],
    });
    expect(rows.map((r) => r.id)).toEqual(['steve', 'cat', 'lightswitch']);
  });

  test('tolerates a missing table or kind list', () => {
    expect(m.propListItems(null, null)).toEqual([]);
    expect(m.propListItems(CARDS, undefined)).toEqual([]);
    expect(m.propListItems({ bad: null }, ['bad'])).toEqual([]);
  });
});

describe('installPropList', () => {
  const ITEMS = [
    { id: 'steve', label: 'Steve' },
    { id: 'cat', label: 'The Office Manager' },
  ];

  test('builds one real button per item, its TEXT the accessible name', () => {
    const list = makeEl('ul');
    expect(m.installPropList({ list, items: ITEMS, onChoose: () => {} })).toBe(2);
    const rows = rowsOf(list);
    expect(list.children.map((li) => li.tagName)).toEqual(['LI', 'LI']);
    expect(rows.map((b) => b.tagName)).toEqual(['BUTTON', 'BUTTON']);
    expect(rows.map((b) => b.type)).toEqual(['button', 'button']);
    expect(rows.map((b) => b.textContent)).toEqual(['Steve', 'The Office Manager']);
    // No aria-label laid over different words.
    rows.forEach((b) => expect(b.getAttribute('aria-label')).toBeNull());
    expect(rows.map((b) => b.className)).toEqual(['prop-row', 'prop-row']);
    expect(rows.map((b) => b.getAttribute('data-prop'))).toEqual(['steve', 'cat']);
  });

  test('choosing a row hands its id back to the scene', () => {
    const list = makeEl('ul');
    const onChoose = jest.fn();
    m.installPropList({ list, items: ITEMS, onChoose });
    rowsOf(list)[1].fire('click');
    expect(onChoose).toHaveBeenCalledWith('cat');
  });

  test('a second install replaces the rows rather than adding to them', () => {
    const list = makeEl('ul');
    m.installPropList({ list, items: ITEMS, onChoose: () => {} });
    m.installPropList({ list, items: [ITEMS[0]], onChoose: () => {} });
    expect(rowsOf(list).map((b) => b.textContent)).toEqual(['Steve']);
  });

  test('skips malformed items instead of building a blank button', () => {
    const list = makeEl('ul');
    const n = m.installPropList({
      list, items: [null, { id: 'x' }, { label: 'No id' }, ITEMS[0]], onChoose: () => {},
    });
    expect(n).toBe(1);
    expect(rowsOf(list).map((b) => b.textContent)).toEqual(['Steve']);
  });

  test('passes the abort signal through, so a page teardown releases the rows', () => {
    const list = makeEl('ul');
    const signal = { aborted: false };
    m.installPropList({ list, items: ITEMS, onChoose: () => {}, signal });
    expect(rowsOf(list)[0].listeners.click[0].opts).toEqual({ signal });
  });

  test('a row with no callback does nothing rather than throwing', () => {
    const list = makeEl('ul');
    m.installPropList({ list, items: ITEMS });
    expect(() => rowsOf(list)[0].fire('click')).not.toThrow();
  });

  test('no list, no rows, no throw', () => {
    expect(m.installPropList({ items: ITEMS })).toBe(0);
    expect(m.installPropList()).toBe(0);
  });
});

describe('showPropRows', () => {
  const NIGHT = [
    { id: 'bee', label: 'The Bee' },
    { id: 'bat', label: 'The Bat' },
    { id: 'snail', label: 'The Snail' },
    { id: 'fence', label: 'The Fence' },
  ];

  function built() {
    const list = makeEl('ul');
    m.installPropList({ list, items: NIGHT, onChoose: () => {} });
    rowsOf(list).forEach((b) => { b.focus = () => { globalThis.document.activeElement = b; }; });
    return list;
  }
  const shownIds = (list) => list.children.filter((li) => !li.hidden)
    .map((li) => li.children[0].getAttribute('data-prop'));

  test('hides the rows whose thing is gone and shows them again when it returns', () => {
    const list = built();
    const out = new Set(['bee', 'fence']);
    expect(m.showPropRows(list, (id) => out.has(id))).toBe(2);
    expect(shownIds(list)).toEqual(['bee', 'fence']);
    out.clear(); out.add('bat'); out.add('snail'); out.add('fence');
    expect(m.showPropRows(list, (id) => out.has(id))).toBe(3);
    expect(shownIds(list)).toEqual(['bat', 'snail', 'fence']);
  });

  test('hides rather than rebuilds, so the rows are the same buttons', () => {
    const list = built();
    const before = rowsOf(list);
    m.showPropRows(list, (id) => id !== 'bat');
    expect(rowsOf(list)).toEqual(before);
    expect(list.children).toHaveLength(4);
  });

  test('a focused row that goes hands focus to the next row still shown', () => {
    const list = built();
    const [bee, bat, , fence] = rowsOf(list);
    bat.focus();
    m.showPropRows(list, (id) => id === 'bee' || id === 'fence');
    expect(globalThis.document.activeElement).toBe(fence);
    // And to the one before when nothing after it is left.
    m.showPropRows(list, () => true);
    fence.focus();
    m.showPropRows(list, (id) => id === 'bee');
    expect(globalThis.document.activeElement).toBe(bee);
  });

  test('focus elsewhere is left alone', () => {
    const list = built();
    const [bee] = rowsOf(list);
    bee.focus();
    m.showPropRows(list, (id) => id !== 'bat');
    expect(globalThis.document.activeElement).toBe(bee);
  });

  test('the last row going leaves focus where the browser puts it, without throwing', () => {
    const list = built();
    rowsOf(list)[0].focus();
    expect(m.showPropRows(list, () => false)).toBe(0);
    expect(shownIds(list)).toEqual([]);
  });

  test('no list or no test shows nothing and does not throw', () => {
    expect(m.showPropRows(null, () => true)).toBe(0);
    expect(m.showPropRows(built())).toBe(0);
  });
});

// ---- Where the panel sits in each page ----------------------------------------
// A click sets where the browser's next Tab starts. The panel used to sit up by
// each page's heading, ABOVE the welcome card and the 3D view, so the first Tab
// after clicking either one went straight past the list to the view controls
// (reported from Chrome on jamar, 2026-09-23). No stub can see tab order, so
// this reads it off the markup: the panel must come after both.

describe('one tab stop, arrow keys, and Escape', () => {
  // The panel is open exactly while focus is inside it, and every row used to
  // be its own tab stop, so putting it away meant tabbing past every row
  // (twenty three in jamar, reported 2026-09-23). Now the list is one stop:
  // arrows move within it, one Tab leaves, and Escape puts it away.
  const ROWS = [
    { id: 'jamar', label: 'Jamar' },
    { id: 'stage', label: 'The Corner Stage' },
    { id: 'tv', label: 'The Lyrics Screen' },
  ];

  /** A list whose rows really take focus, and a key helper that bubbles to it. */
  function wired(opts = {}) {
    const list = makeEl('ul');
    m.installPropList({ list, items: ROWS, onChoose: () => {}, ...opts });
    rowsOf(list).forEach((b) => {
      b.focus = () => { globalThis.document.activeElement = b; b.fire('focus'); };
      b.blur = () => { globalThis.document.activeElement = null; };
    });
    const key = (target, k) => {
      const ev = {
        key: k, target, currentTarget: list,
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
      };
      (list.listeners.keydown || []).forEach(({ fn }) => fn(ev));
      return ev;
    };
    return { list, rows: rowsOf(list), key };
  }
  const stops = (list) => rowsOf(list).map((b) => b.tabIndex);

  test('the list is one tab stop, on the first row', () => {
    const { list } = wired();
    expect(stops(list)).toEqual([0, -1, -1]);
  });

  test('the arrow keys move between rows and wrap, Home and End jump', () => {
    const { rows, key } = wired();
    rows[0].focus();
    key(rows[0], 'ArrowDown');
    expect(globalThis.document.activeElement).toBe(rows[1]);
    key(rows[1], 'ArrowRight');
    expect(globalThis.document.activeElement).toBe(rows[2]);
    key(rows[2], 'ArrowDown');                                  // wraps to the top
    expect(globalThis.document.activeElement).toBe(rows[0]);
    key(rows[0], 'ArrowUp');                                    // and to the bottom
    expect(globalThis.document.activeElement).toBe(rows[2]);
    key(rows[2], 'ArrowLeft');
    expect(globalThis.document.activeElement).toBe(rows[1]);
    key(rows[1], 'Home');
    expect(globalThis.document.activeElement).toBe(rows[0]);
    key(rows[0], 'End');
    expect(globalThis.document.activeElement).toBe(rows[2]);
  });

  test('the row last used is the one Tab comes back to', () => {
    const { list, rows, key } = wired();
    rows[0].focus();
    key(rows[0], 'ArrowDown');
    expect(stops(list)).toEqual([-1, 0, -1]);
  });

  test('a key the list answers stops there, so the camera does not also turn', () => {
    const { rows, key } = wired();
    rows[0].focus();
    const arrow = key(rows[0], 'ArrowLeft');
    expect(arrow.prevented && arrow.stopped).toBe(true);
    // Enter and Space belong to the button itself, and Tab to the browser.
    ['Enter', ' ', 'Tab'].forEach((k) => {
      const ev = key(rows[0], k);
      expect(`${k}: ${ev.prevented || ev.stopped}`).toBe(`${k}: false`);
    });
  });

  test('Escape moves focus on to the exit the scene names', () => {
    const exit = makeEl('button');
    exit.focus = () => { globalThis.document.activeElement = exit; };
    const { rows, key } = wired({ exitTo: () => exit });
    rows[1].focus();
    const ev = key(rows[1], 'Escape');
    expect(globalThis.document.activeElement).toBe(exit);
    expect(ev.stopped).toBe(true);    // a scene's own Escape does not also fire
  });

  test('with no exit named, Escape goes to the view controls', () => {
    const pan = makeEl('button');
    pan.focus = () => { globalThis.document.activeElement = pan; };
    globalThis.document.querySelector = (sel) => (sel === '.pan-controls button' ? pan : null);
    const { rows, key } = wired();
    rows[0].focus();
    key(rows[0], 'Escape');
    expect(globalThis.document.activeElement).toBe(pan);
  });

  test('an exit that cannot take focus still lets go of the row', () => {
    // A control hidden at this aspect ignores focus(), and the panel would
    // stay open around the row that kept it.
    const hiddenExit = makeEl('button');
    hiddenExit.focus = () => {};
    const { rows, key } = wired({ exitTo: () => hiddenExit });
    rows[0].focus();
    key(rows[0], 'Escape');
    expect(globalThis.document.activeElement).toBe(null);
  });

  test('hidden rows are skipped, and the tab stop moves off a row that hides', () => {
    const { list, rows, key } = wired();
    m.showPropRows(list, (id) => id !== 'jamar');     // the stop's own row goes
    expect(stops(list)).toEqual([-1, 0, -1]);
    rows[1].focus();
    key(rows[1], 'ArrowDown');
    key(rows[2], 'ArrowDown');                          // wraps past the hidden row
    expect(globalThis.document.activeElement).toBe(rows[1]);
  });

  test('filling the list again adds no second key listener, and uses the new exit', () => {
    const list = makeEl('ul');
    m.installPropList({ list, items: ROWS, onChoose: () => {} });
    const exit = makeEl('button');
    exit.focus = () => { globalThis.document.activeElement = exit; };
    m.installPropList({ list, items: ROWS, onChoose: () => {}, exitTo: () => exit });
    expect(list.listeners.keydown).toHaveLength(1);
    const row = rowsOf(list)[0];
    list.listeners.keydown[0].fn({ key: 'Escape', target: row, currentTarget: list });
    expect(globalThis.document.activeElement).toBe(exit);
  });
});

describe('the panel in the page', () => {
  test('every page with a list places it after the welcome card and the 3D view', async () => {
    const www = new URL('../www/', import.meta.url);
    const found = [];
    for (const entry of await readWww(www, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let html;
      try { html = await readPage(new URL(`${entry.name}/index.html`, www), 'utf8'); } catch { continue; }
      const panel = html.indexOf('<section id="prop-panel"');
      if (panel < 0) continue;
      found.push(entry.name);
      const blocker = html.indexOf('<div id="blocker"');
      const canvas = html.indexOf('<canvas id="game-canvas"');
      const script = html.indexOf('<script src=');
      // Named so a failure says which page and which neighbour.
      expect(`${entry.name} after the welcome card: ${blocker >= 0 && panel > blocker}`)
        .toBe(`${entry.name} after the welcome card: true`);
      expect(`${entry.name} after the 3D view: ${canvas >= 0 && panel > canvas}`)
        .toBe(`${entry.name} after the 3D view: true`);
      expect(`${entry.name} before the scripts: ${script < 0 || panel < script}`)
        .toBe(`${entry.name} before the scripts: true`);
    }
    // The scan has to find them, or this passes on nothing.
    expect(found).toEqual(expect.arrayContaining(['gavin', 'jamar', 'mandelbrot', 'steve', 'sunnyvalejenn']));
  });
});
