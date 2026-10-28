// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * state.js - the meme being made (specs/meme PLANNING 4.2): which template,
 * the captions by slot, the expression chosen for each cell (null for the
 * template's own), and the roles (M5). Pure, no THREE and no DOM, so the
 * remix link and the tests read it without a scene.
 *
 * `normalizeMeme` reduces anything to a valid meme: an unknown template
 * becomes the first in the picker's order, captions are cut at the cap and
 * padded to the template's slots, an unknown expression becomes null.
 * Nothing from a link or a store is ever trusted as it came.
 *
 * THE LAST MEME IS KEPT IN THIS BROWSER (F8), under `storageKey`, so a
 * half-made meme is not lost between visits. A browser that refuses storage
 * (a private window) is not an error: `createMemeStore` says so and the
 * page goes on without it.
 */

export const MEME_VERSION = 1;

/**
 * A valid meme from `raw` (anything), for `templates` (the catalog),
 * `slotsOf(template)` (its caption slots), `expressions` (the ids the
 * scene knows) and `maxChars` a caption.
 */
export function normalizeMeme(raw, { templates, byOrder, slotsOf, expressions, maxChars }) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const template = templates.find((t) => t.id === r.template) || byOrder(templates)[0];
    const slots = slotsOf(template);
    const captions = Array.isArray(r.captions) ? r.captions : [];
    const chosen = Array.isArray(r.expressions) ? r.expressions : [];
    return {
        v: MEME_VERSION,
        template: template.id,
        captions: slots.map((_, k) => String(captions[k] == null ? '' : captions[k]).slice(0, maxChars)),
        expressions: template.cells.map((cell, i) => (cell.figures.length && expressions.includes(chosen[i]) ? chosen[i] : null))
    };
}

/** Whether two memes are the same meme. */
export function sameMeme(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The store for the last meme: `load()` (the raw object, or null),
 * `save(meme)` (true when kept), `clear()`, and `available` (whether this
 * browser keeps anything). `win` is handed in for tests.
 */
export function createMemeStore({ key = 'scenexp-meme', win = typeof window === 'undefined' ? null : window } = {}) {
    // The window's storage, or the global one (the avatar store's way, and
    // the test stub's), or none.
    const storage = () => {
        try {
            if (win && win.localStorage) return win.localStorage;
            return typeof localStorage !== 'undefined' ? localStorage : null;
        } catch (e) {
            return null;
        }
    };
    return {
        get available() {
            const s = storage();
            if (!s) return false;
            try {
                s.setItem(`${key}-probe`, '1');
                s.removeItem(`${key}-probe`);
                return true;
            } catch (e) {
                return false;
            }
        },
        load() {
            const s = storage();
            if (!s) return null;
            try {
                const text = s.getItem(key);
                if (!text || text.length > 8192) return null;
                const parsed = JSON.parse(text);
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (e) {
                return null;
            }
        },
        save(meme) {
            const s = storage();
            if (!s) return false;
            try {
                s.setItem(key, JSON.stringify(meme));
                return true;
            } catch (e) {
                return false;
            }
        },
        clear() {
            const s = storage();
            if (!s) return false;
            try {
                s.removeItem(key);
                return true;
            } catch (e) {
                return false;
            }
        }
    };
}
