// © 2026 Continuum Commerce LLC. MIT licensed.
//
// A dependency-free browser-DOM stand-in rich enough to boot an experience's
// main.js under Node. Where three-stub.mjs covers import-time needs (a global
// THREE, a bare document.createElement), this helper covers RUN-time needs:
// main.js auto-boots when `document` exists at import, walks the loading
// screen, wires window/document/element listeners, and hands its animate()
// callback to renderer.setAnimationLoop.
//
// Usage in a suite:
//
//   installThree();                     // from three-stub.mjs, THREE first
//   const dom = installDom();           // then the browser globals
//   const main = await import('../www/<exp>/js/main.js');   // auto-boots
//   await flushAsync();                 // let the async init() settle
//   dom.loops[0]();                     // step captured animation frames
//   fire(dom.el('game-canvas'), 'pointerdown', { clientX: 10, clientY: 10 });
//   dom.uninstall();
//
// Design notes:
// - getElementById auto-vivifies: any id yields a memoized element stub, so
//   suites never enumerate each experience's ids.
// - Elements record their listeners in a Map for the fire() helper, and honor
//   AbortSignal options the way main.js's cleanup expects.
// - installDom wraps the already-installed THREE so WebGLRenderer instances
//   capture setAnimationLoop callbacks into dom.loops. Everything else on the
//   renderer stays chainable.
// - window.crypto is deliberately absent: boot-1.0.0's proof of work takes
//   its graceful no-crypto path and init() proceeds without hashing.

// Local copy of three-stub's chainable absorber (kept private there): callable,
// constructable, chainable on every property, coerces to 0, iterates empty.
function chainable() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined;
      if (prop === 'parent') return undefined;
      return chainable();
    },
    set() { return true; },
    apply() { return chainable(); },
    construct() { return chainable(); },
  });
}

function makeClassList() {
  const set = new Set();
  return {
    add(...names) { names.forEach((n) => set.add(n)); },
    remove(...names) { names.forEach((n) => set.delete(n)); },
    contains(n) { return set.has(n); },
    toggle(n, force) {
      const want = force === undefined ? !set.has(n) : !!force;
      want ? set.add(n) : set.delete(n);
      return want;
    },
    values() { return [...set]; },
  };
}

// A no-op 2D context that returns sane primitives where drawing code reads
// back (measureText, gradients); every other method quietly absorbs.
function make2dContext() {
  return new Proxy({
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    canvas: { width: 512, height: 288 },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined;
      return () => undefined;
    },
    set() { return true; },
  });
}

/** A style object that answers the CUSTOM PROPERTY api as well as plain
 *  assignment. `style.left = '20%'` was all any experience needed until one
 *  started driving a widget's geometry through `--custom-property`, which is
 *  the right way to keep a layout in one place and is invisible to a bare
 *  object: `setProperty` is a method on CSSStyleDeclaration, not a key.
 *
 *  Custom properties are kept in their own map, and `getPropertyValue` falls
 *  back to the camelCase field so a test can read a value back whichever way
 *  the code under test happened to write it. */
function makeStyle() {
  const custom = Object.create(null);
  return {
    setProperty(name, value) { custom[name] = String(value); },
    removeProperty(name) {
      const previous = custom[name];
      delete custom[name];
      return previous === undefined ? '' : previous;
    },
    getPropertyValue(name) {
      if (name in custom) return custom[name];
      const camel = String(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return this[camel] === undefined ? '' : String(this[camel]);
    },
  };
}

/** Depth-first search for the first descendant carrying a class. */
function findByClass(root, name) {
  if (!root || !Array.isArray(root.children)) return null;
  for (const child of root.children) {
    if (child && child.classList && child.classList.contains(name)) return child;
    const deeper = findByClass(child, name);
    if (deeper) return deeper;
  }
  return null;
}

/** Take a node out of whatever parent it is in, so a move is a move. */
function detach(node) {
  const parent = node && (node.parentNode || node.parentElement);
  if (parent && Array.isArray(parent.children)) {
    parent.children = parent.children.filter((x) => x !== node);
  }
}

function adopt(parent, node) {
  if (!node) return;
  node.parentElement = parent;
  node.parentNode = parent;
}

function makeElement(tag = 'div') {
  const listeners = new Map(); // type -> Set<fn>
  const el = {
    tagName: String(tag).toUpperCase(),
    style: makeStyle(),
    dataset: {},
    attributes: {},
    classList: makeClassList(),
    children: [],
    parentElement: null,
    parentNode: null,
    textContent: '',
    innerHTML: '',
    value: '',
    href: '',
    disabled: false,
    hidden: false,
    inert: false,
    width: 300,
    height: 150,
    listeners,
    addEventListener(type, fn, opts) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      if (opts && opts.signal) {
        opts.signal.addEventListener('abort', () => listeners.get(type).delete(fn), { once: true });
      }
      if (opts && opts.once) {
        const orig = fn;
        listeners.get(type).delete(fn);
        const wrapped = (...args) => { listeners.get(type).delete(wrapped); orig(...args); };
        listeners.get(type).add(wrapped);
      }
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    setAttribute(k, v) { el.attributes[k] = String(v); if (k === 'href') el.href = String(v); },
    getAttribute(k) { return k in el.attributes ? el.attributes[k] : null; },
    removeAttribute(k) { delete el.attributes[k]; },
    hasAttribute(k) { return k in el.attributes; },
    // APPENDING A NODE THAT ALREADY HAS A PARENT MOVES IT, which is what the
    // real DOM does and what any code that reparents a widget depends on.
    // Without the detach a node ends up in its old parent's children as well,
    // and a test asserting a row's contents reads a row that never existed.
    appendChild(c) { detach(c); el.children.push(c); adopt(el, c); return c; },
    removeChild(c) {
      el.children = el.children.filter((x) => x !== c);
      if (c) { c.parentElement = null; c.parentNode = null; }
      return c;
    },
    // The reference node is honoured, or insertion order is not a thing a test
    // can check and every layout assertion passes by accident.
    insertBefore(c, ref) {
      detach(c);
      const at = ref ? el.children.indexOf(ref) : -1;
      if (at >= 0) el.children.splice(at, 0, c);
      else el.children.push(c);
      adopt(el, c);
      return c;
    },
    remove() { el.parentElement?.removeChild?.(el); },
    querySelector(sel) { return el._selMemo?.get(sel) ?? memoChild(el, sel); },
    querySelectorAll() { return []; },
    contains() { return false; },
    closest() { return null; },
    focus() { el.focused = true; if (globalThis.document) globalThis.document.activeElement = el; },
    blur() { el.focused = false; },
    click() { fire(el, 'click'); },
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }; },
    setPointerCapture() {},
    releasePointerCapture() {},
    getContext(type) { return type === '2d' ? make2dContext() : chainable(); },
    toDataURL() { return 'data:,'; },
  };
  // `className` AND `classList` ARE THE SAME STATE. As two plain fields they
  // drift the moment any code sets one and reads the other, and a class
  // assigned by `el.className = 'a b'` is then invisible to `contains('a')`,
  // to a class-based querySelector, and to every assertion written against
  // either. The shared parts set className; the experiences use classList.
  Object.defineProperty(el, 'className', {
    enumerable: true,
    configurable: true,
    get() { return el.classList.values().join(' '); },
    set(value) {
      el.classList.values().forEach((name) => el.classList.remove(name));
      String(value).split(/\s+/).filter(Boolean).forEach((name) => el.classList.add(name));
    },
  });
  return el;
}

function memoChild(parent, sel) {
  if (!parent._selMemo) parent._selMemo = new Map();
  const child = makeElement('div');
  child.parentElement = parent;
  parent._selMemo.set(sel, child);
  return child;
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

/** Fire a recorded listener list on an element, document, or window stub. */
export function fire(target, type, event = {}) {
  const base = {
    type,
    target,
    currentTarget: target,
    preventDefault() { base.defaultPrevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() {},
    defaultPrevented: false,
    ...event,
  };
  const set = target.listeners?.get(type);
  if (set) [...set].forEach((fn) => fn(base));
  return base;
}

/** Drain pending microtasks so an awaited async init() can settle. */
export async function flushAsync(turns = 10) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

/**
 * Install document/window/navigator/storage globals plus the animation-loop
 * capture. Call installThree() from three-stub.mjs FIRST: this wraps the
 * installed THREE so WebGLRenderer records setAnimationLoop callbacks.
 * Returns { el, loops, windowStub, documentStub, replaced, uninstall }.
 */
export function installDom({ innerWidth = 1280, innerHeight = 800 } = {}) {
  const byId = new Map();
  const bySelector = new Map();
  const loops = [];       // callbacks handed to renderer.setAnimationLoop
  const replaced = [];    // urls passed to location.replace (2D fallback)

  const documentListeners = new Map();
  const documentStub = {
    readyState: 'complete',
    visibilityState: 'visible',
    hidden: false,
    documentElement: makeElement('html'),
    head: makeElement('head'),
    body: makeElement('body'),
    activeElement: null,
    title: '',
    listeners: documentListeners,
    createElement: (tag) => makeElement(tag),
    createTextNode: (t) => ({ textContent: t }),
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeElement('div'));
      return byId.get(id);
    },
    // A REAL SEARCH FIRST, then the auto-vivify fallback the rest of the
    // suites lean on. Code that builds a widget and then goes looking for it
    // by class was finding a fresh empty div and quietly working on nothing,
    // which is a test passing while the thing under test did not happen.
    // Only simple `.class` selectors are searched, which is all any experience
    // uses on the document.
    querySelector(sel) {
      if (typeof sel === 'string' && /^\.[\w-]+$/.test(sel)) {
        const found = findByClass(documentStub.body, sel.slice(1));
        if (found) return found;
      }
      if (!bySelector.has(sel)) bySelector.set(sel, makeElement('div'));
      return bySelector.get(sel);
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn, opts) {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(fn);
      if (opts && opts.signal) {
        opts.signal.addEventListener('abort', () => documentListeners.get(type).delete(fn), { once: true });
      }
    },
    removeEventListener(type, fn) { documentListeners.get(type)?.delete(fn); },
    hasFocus() { return true; },
  };

  const windowListeners = new Map();
  const windowStub = {
    innerWidth,
    innerHeight,
    devicePixelRatio: 1,
    WebGLRenderingContext: function WebGLRenderingContext() {},
    isSecureContext: true,
    listeners: windowListeners,
    location: {
      href: 'http://localhost:8000/test/',
      pathname: '/test/',
      search: '',
      hash: '',
      origin: 'http://localhost:8000',
      replace: (url) => { replaced.push(url); },
      assign: (url) => { replaced.push(url); },
      reload() {},
    },
    history: { replaceState() {}, pushState() {} },
    matchMedia: (media) => ({
      media,
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
    addEventListener(type, fn, opts) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
      if (opts && opts.signal) {
        opts.signal.addEventListener('abort', () => windowListeners.get(type).delete(fn), { once: true });
      }
    },
    removeEventListener(type, fn) { windowListeners.get(type)?.delete(fn); },
    requestAnimationFrame: (cb) => { loops.push(cb); return loops.length; },
    cancelAnimationFrame() {},
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    open() { return null; },
    scrollTo() {},
    focus() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  windowStub.self = windowStub;

  globalThis.document = documentStub;
  globalThis.window = windowStub;
  globalThis.navigator = {
    userAgent: 'jest',
    language: 'en-US',
    maxTouchPoints: 0,
    sendBeacon: () => true,
  };
  globalThis.sessionStorage = makeStorage();
  globalThis.localStorage = makeStorage();
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;
  if (!globalThis.fetch || !globalThis.fetch._domStubKept) {
    const fetchStub = () => Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' });
    fetchStub._domStubKept = true;
    globalThis.fetch = fetchStub;
  }

  // Wrap the (already installed) THREE so WebGLRenderer instances capture the
  // animation loop main.js hands to renderer.setAnimationLoop.
  const baseThree = globalThis.THREE;
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'WebGLRenderer') {
        return function WebGLRenderer() {
          const body = chainable();
          return new Proxy(function () {}, {
            get(_bt, p) {
              if (p === 'setAnimationLoop') return (cb) => { if (cb) loops.push(cb); };
              return body[p];
            },
            set() { return true; },
            apply() { return chainable(); },
            construct() { return chainable(); },
          });
        };
      }
      return baseThree[prop];
    },
  });

  return {
    loops,
    replaced,
    windowStub,
    documentStub,
    el: (id) => documentStub.getElementById(id),
    uninstall() {
      delete globalThis.document;
      delete globalThis.window;
      delete globalThis.navigator;
      delete globalThis.sessionStorage;
      delete globalThis.localStorage;
      delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame;
      delete globalThis.THREE;
    },
  };
}
