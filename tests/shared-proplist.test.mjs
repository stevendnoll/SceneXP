// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/proplist-1.0.0.js, the keyboard's way to the
 * things in a 3D room. Plain stub elements, no DOM library.
 */
import { jest } from '@jest/globals';

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
