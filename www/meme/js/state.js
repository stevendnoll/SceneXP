// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * state.js - the meme being made (specs/meme PLANNING 4.2): which template,
 * the captions by slot, the expression chosen for each cell (null for the
 * template's own), the background color picked where a template offers
 * one (M8), and the roles (M5): a friend's avatar, and anyone else dressed
 * by hand (M8's Customize) or sent in a link. Pure, no THREE and no DOM, so the
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

import { normalizeAvatar } from '../../shared/js/avatar-1.0.0.min.js';

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
        expressions: template.cells.map((cell, i) => (cell.figures.length && expressions.includes(chosen[i]) ? chosen[i] : null)),
        // The background color (M8), lowercase '#rrggbb', only for a
        // template that offers one; null is the template's own.
        tint: template.tint && typeof r.tint === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.tint) ? r.tint.toLowerCase() : null,
        // A friend's avatar (M5), made valid, or none. It is already in
        // the visitor's hands (pasted or opened), so it is kept with the meme.
        friend: r.friend && typeof r.friend === 'object' ? normalizeAvatar(r.friend) : null,
        // Anyone else in a crowd role who is not from the crowd (M8): dressed
        // by hand with Customize, or sent in a link. By role id, only for a
        // crowd role some template declares (the friend's is `friend`), each
        // made valid. A role the crowd fills is not kept: it is rolled again.
        cast: castOf(r.cast, templates)
    };
}

/** The crowd roles a dressed person may be kept for: every `random` role
 *  of the catalog but the friend's, which is kept as `friend`. */
function castRoles(templates) {
    const ids = new Set();
    for (const t of templates) for (const role of t.roles) if (role.cast === 'random' && role.id !== 'friend') ids.add(role.id);
    return [...ids];
}

/** `raw`'s people, made valid, for the roles `castRoles` names alone, read
 *  from its own properties only. */
function castOf(raw, templates) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const id of castRoles(templates)) {
        if (!Object.prototype.hasOwnProperty.call(raw, id)) continue;
        const a = raw[id];
        if (a && typeof a === 'object' && !Array.isArray(a)) out[id] = normalizeAvatar(a);
    }
    return out;
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
