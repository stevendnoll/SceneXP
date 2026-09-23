// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Dependency-free stand-ins for the browser/Three.js globals the www/js modules
// expect at import time, so Jest can load them under Node. Nothing here models
// real geometry — it only lets the modules import and their pure helpers (and,
// for miniature.js, the diorama builder) run without a WebGL context or DOM.
//
// The only HARD import-time requirement across the module chain is a global
// `THREE` (scene.js builds a couple of objects at module scope, controls.js and
// main.js declare scratch vectors). Every other global read (window, navigator,
// document) is `typeof`-guarded in the sources, so we install those only where a
// *called* function needs them (miniature's canvas drawing + isTouchDevice).

// A value that is callable, constructable, and chainable on every property:
// each access yields another chainable, numbers coerce to 0, iteration is empty.
// This absorbs the fluent THREE API — new THREE.Vector3().set(1,2,3).clone() —
// without us having to model any of it.
function chainable() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined; // never look like a Promise
      // Real THREE objects end their ancestor chain with parent: null. A
      // truthy chainable here would turn every `while (obj.parent)` walk
      // (e.g. world-position accumulation in the NPC look-at code) into an
      // infinite loop under test.
      if (prop === 'parent') return undefined;
      return chainable();
    },
    set() { return true; },
    apply() { return chainable(); },
    construct() { return chainable(); },
  });
}

// Global `THREE`: every constructor/constant resolves to a chainable.
export function installThree() {
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      return chainable();
    },
  });
}

// Wrap the installed THREE so every Group and Mesh keeps a REAL `userData`
// object, a REAL `visible` flag (true until something sets it), and a REAL
// `parent` once another kept object add()s it. The plain stub swallows all
// three, so the `propKind` that registerOutdoorProp stamps on a prop is lost,
// and so is a creature hiding itself for the night, or a ring hidden by the
// group it sits in. Scene suites that build the keyboard's list of props need
// all three, or the list builds from nothing and the test passes while
// proving nothing.
// Call it AFTER any other THREE override: it passes everything else through.
const KEPT = Symbol('kept');
export function keepPropRecords() {
  const base = globalThis.THREE;
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      const Ctor = base[prop];
      if (prop !== 'Group' && prop !== 'Mesh') return Ctor;
      return function (...args) {
        const inner = new Ctor(...args);
        const own = { userData: {}, visible: true, parent: undefined };
        const self = new Proxy(inner, {
          get(t, p) {
            if (p === KEPT) return own;
            if (p === 'add') {
              return (...kids) => {
                kids.forEach((k) => { if (k && k[KEPT]) k[KEPT].parent = self; });
                return self;
              };
            }
            return p in own ? own[p] : t[p];
          },
          set(_t2, p, v) { if (p === 'visible') own.visible = v; return true; },
        });
        return self;
      };
    },
  });
}

// A throwaway canvas whose 2D context no-ops everything — enough for the
// procedural texture/sprite drawing in miniature.js.
export function installCanvas() {
  globalThis.document = {
    createElement() {
      return { width: 0, height: 0, style: {}, getContext() { return chainable(); } };
    },
  };
}

// Minimal window/navigator so feature checks (scene.isTouchDevice) resolve to
// "not a touch device" instead of throwing on a missing global.
export function installBrowserGlobals() {
  globalThis.window = {};
  globalThis.navigator = {};
}

// Remove everything installed above. Safe to call even if nothing was set.
export function uninstallAll() {
  delete globalThis.THREE;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.navigator;
}
