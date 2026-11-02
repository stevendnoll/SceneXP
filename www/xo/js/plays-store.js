// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * plays-store.js - The plays a visitor designed, and the plays they took out
 * of the book (specs/custom-plays-PRD, Section 5).
 *
 * ONE KEY, `CFG.storage.plays`, written whole and read once on first ask, the
 * way playbook-ui.js reads its settings. It holds two things: the visitor's own
 * plays, each a record design.js's `normalizeRecord` has made safe, and the
 * slugs of the book's plays they removed from the playbook. A designed play
 * that is deleted is HIDDEN rather than removed, so it can be restored, and
 * only "Delete for good" takes it out (PRD 4.7). Nothing here ever leaves the
 * device, and www/privacy.html says what is kept.
 *
 * THIS IS THE ONLY FILE THAT TOUCHES THE KEY. tests/privacy.test.mjs lists it
 * as a writer of local storage; the designer and the playbook ask it.
 *
 * `localStorage` is named outright rather than passed in, like colors.js and
 * jump.js, and every call is inside try/catch: private mode and a full quota
 * both leave a visitor with the plays they already had and no error.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { OFFENSIVE_PLAYS } from './play.min.js';
import { normalizeRecord, normalizeLine, newPlayId, isCustomId, MAX_NAME, MAX_PLAYS, PATH_PLAYERS } from './design.min.js';

const VERSION = 1;

let state = null;

/** What the key holds, read once, with anything doubtful dropped. */
function load() {
    if (state) return state;
    state = { plays: [], hidden: [] };
    try {
        const raw = localStorage.getItem(CFG.storage.plays);
        if (!raw) return state;
        const stored = JSON.parse(raw);
        if (!stored || typeof stored !== 'object') return state;
        const seen = new Set();
        for (const item of Array.isArray(stored.plays) ? stored.plays : []) {
            const record = normalizeRecord(item, OFFENSIVE_PLAYS);
            if (record && !seen.has(record.id)) {
                seen.add(record.id);
                state.plays.push(record);
            }
        }
        for (const slug of Array.isArray(stored.hidden) ? stored.hidden : []) {
            if (OFFENSIVE_PLAYS.includes(slug) && !state.hidden.includes(slug)) state.hidden.push(slug);
        }
    } catch (e) { /* private mode, or a value from an older shape. Empty. */ }
    return state;
}

/** Written whole. The key goes when there is nothing to keep, so a visitor
 *  who tried the designer once and deleted the result stores nothing. */
function save() {
    const s = load();
    try {
        if (s.plays.length === 0 && s.hidden.length === 0) {
            localStorage.removeItem(CFG.storage.plays);
        } else {
            localStorage.setItem(CFG.storage.plays, JSON.stringify({ v: VERSION, plays: s.plays, hidden: s.hidden }));
        }
        return true;
    } catch (e) {
        return false;
    }
}

const copy = (r) => ({ ...r, routes: Object.fromEntries(Object.entries(r.routes).map(([k, v]) => [k, v.map((p) => [p[0], p[1]])])) });

/** The visitor's plays, newest first, hidden ones left out unless asked. */
export function listPlays({ hidden = false } = {}) {
    return load().plays.filter((r) => hidden || !r.hidden).map(copy);
}

/** One play by id, or null. */
export function getPlay(id) {
    const r = load().plays.find((p) => p.id === id);
    return r ? copy(r) : null;
}

/** "My play 1", "My play 2", ... the first not already taken. */
export function nextName() {
    const names = new Set(load().plays.map((p) => p.name));
    for (let n = 1; ; n += 1) {
        const name = `My play ${n}`;
        if (!names.has(name)) return name;
    }
}

/** `name`, or `name 2`, `name 3`, ... if another of the visitor's plays
 *  (other than `except`) already has it. Trimmed and capped first. */
export function uniqueName(name, except = '') {
    const base = String(name || '').trim().slice(0, MAX_NAME) || nextName();
    const taken = new Set(load().plays.filter((p) => p.id !== except).map((p) => p.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
        const suffix = ` ${n}`;
        const candidate = `${base.slice(0, MAX_NAME - suffix.length)}${suffix}`;
        if (!taken.has(candidate)) return candidate;
    }
}

/** The lines made safe, players who cannot be drawn dropped. */
function cleanRoutes(routes) {
    const out = {};
    for (const who of PATH_PLAYERS) {
        const line = normalizeLine(routes && routes[who]);
        if (line && line.length >= 2) out[who] = line;
    }
    return out;
}

/**
 * KEEP A NEW PLAY. Returns the record, or null when the browser is full of
 * them: the oldest hidden plays go first, and once there are `MAX_PLAYS`
 * visible ones the answer is a polite no rather than a quiet loss.
 */
export function addPlay({ name, base, routes } = {}, now = Date.now()) {
    const s = load();
    while (s.plays.length >= MAX_PLAYS) {
        const at = s.plays.map((p) => p.hidden).lastIndexOf(true);
        if (at < 0) return null;
        s.plays.splice(at, 1);
    }
    const record = normalizeRecord({
        id: newPlayId(now),
        name: uniqueName(name),
        base,
        routes: cleanRoutes(routes),
        created: new Date(now).toISOString(),
        hidden: false,
    }, OFFENSIVE_PLAYS);
    if (!record) return null;
    // Two saves inside one millisecond would share an id. Nobody draws that
    // fast, but a test might, and an id is a promise.
    while (s.plays.some((p) => p.id === record.id)) record.id += 'x';
    s.plays.unshift(record);
    save();
    return copy(record);
}

/** Change a play the visitor already has. Returns the record, or null for an
 *  id that is not one of theirs. */
export function replacePlay(id, { name, base, routes } = {}) {
    const s = load();
    const at = s.plays.findIndex((p) => p.id === id);
    if (at < 0) return null;
    const old = s.plays[at];
    const record = normalizeRecord({
        ...old,
        name: uniqueName(name === undefined ? old.name : name, id),
        base: base === undefined ? old.base : base,
        routes: routes === undefined ? old.routes : cleanRoutes(routes),
    }, OFFENSIVE_PLAYS);
    if (!record) return null;
    s.plays[at] = record;
    save();
    return copy(record);
}

/** Is this play, the visitor's own or the book's, out of the playbook? */
export function isHidden(idOrSlug) {
    const s = load();
    if (isCustomId(idOrSlug)) {
        const r = s.plays.find((p) => p.id === idOrSlug);
        return !!r && r.hidden;
    }
    return s.hidden.includes(idOrSlug);
}

/** The book's slugs that are out of the playbook, in the order removed. */
export function hiddenSlugs() {
    return load().hidden.slice();
}

/** How many plays, the visitor's and the book's, are out of the playbook. */
export function hiddenCount() {
    const s = load();
    return s.hidden.length + s.plays.filter((p) => p.hidden).length;
}

/**
 * TAKE A PLAY OUT OF THE PLAYBOOK. A book play's slug joins the hidden list, a
 * designed play is marked hidden. Returns whether anything changed. The rule
 * that the book keeps at least one visible play is the designer's to enforce,
 * where the button is, because only it knows what the visitor is looking at.
 */
export function hidePlay(idOrSlug) {
    const s = load();
    if (isCustomId(idOrSlug)) {
        const r = s.plays.find((p) => p.id === idOrSlug);
        if (!r || r.hidden) return false;
        r.hidden = true;
    } else {
        if (!OFFENSIVE_PLAYS.includes(idOrSlug) || s.hidden.includes(idOrSlug)) return false;
        s.hidden.push(idOrSlug);
    }
    save();
    return true;
}

/** ...and put it back. */
export function restorePlay(idOrSlug) {
    const s = load();
    if (isCustomId(idOrSlug)) {
        const r = s.plays.find((p) => p.id === idOrSlug);
        if (!r || !r.hidden) return false;
        r.hidden = false;
    } else {
        const at = s.hidden.indexOf(idOrSlug);
        if (at < 0) return false;
        s.hidden.splice(at, 1);
    }
    save();
    return true;
}

/** Delete one of the visitor's plays for good. Returns whether it existed. */
export function removePlay(id) {
    const s = load();
    const at = s.plays.findIndex((p) => p.id === id);
    if (at < 0) return false;
    s.plays.splice(at, 1);
    save();
    return true;
}

/** Forget what was read, so the next ask reads the key again (tests, and a
 *  page that wants to pick up another tab's save). */
export function resetPlaysStore() {
    state = null;
}
