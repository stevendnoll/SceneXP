// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * log.js - The activity log that is saved, and the undo history that is not.
 *
 * TWO DIFFERENT JOBS, KEPT APART.
 *
 * The ACTIVITY LOG lives in the document. It is an append-only list of what
 * happened (added, edited, moved to a status, thrown away, restored), capped
 * at `config.limits.log` entries with the oldest dropped first. The whiteboard
 * and "last touched" read it. An entry keeps a LABEL, the record's name at
 * the time, so the history still reads sensibly after the record is renamed
 * or emptied out of the wastebasket. It never keeps notes or anything longer
 * than that label.
 *
 * The UNDO HISTORY lives in memory only. Every mutation in store.js returns a
 * NEW document and leaves the old one untouched, so undoing a change is just
 * putting the previous document back. Nothing has to be replayed or inverted,
 * and structural sharing keeps a stack of them cheap. It is not saved,
 * because an undo offered after a reload would be undoing something the
 * visitor no longer remembers doing.
 *
 * Pure apart from the closure in createHistory. No DOM, no clock, no THREE.
 */

export const LOG_KINDS = ['create', 'update', 'status', 'delete', 'restore', 'purge', 'done', 'reopen'];
export const LOG_COLLECTIONS = ['applications', 'events', 'contacts', 'tasks', 'settings'];

function text(value, max) {
    if (value == null) return '';
    return String(value).trim().slice(0, max);
}

/** One entry from whatever was handed in, or null if it is not one. */
export function normalizeLogEntry(raw, config) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.at !== 'string' || Number.isNaN(new Date(raw.at).getTime())) return null;
    if (!LOG_KINDS.includes(raw.kind) || !LOG_COLLECTIONS.includes(raw.collection)) return null;
    const entry = {
        at: raw.at,
        kind: raw.kind,
        collection: raw.collection,
        id: text(raw.id, 64),
        label: text(raw.label, config.limits.short)
    };
    if (raw.kind === 'status') {
        if (!config.statuses.includes(raw.from) || !config.statuses.includes(raw.to)) return null;
        entry.from = raw.from;
        entry.to = raw.to;
    }
    return entry;
}

/** A whole saved log, newest last, with anything malformed dropped and the
 *  cap applied. */
export function normalizeLog(raw, config) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
        const entry = normalizeLogEntry(item, config);
        if (entry) out.push(entry);
    }
    return out.slice(-config.limits.log);
}

/**
 * A new document with one entry added to its log. The entry is normalized
 * like a saved one, so a bad entry is dropped here rather than written, and
 * the oldest entries fall off once the log is full.
 */
export function appendLog(doc, raw, config) {
    const entry = normalizeLogEntry(raw, config);
    if (!entry) return doc;
    const log = [...doc.log, entry];
    return { ...doc, log: log.length > config.limits.log ? log.slice(-config.limits.log) : log };
}

/** The last time anything was logged about one record, as an ISO string, or
 *  null if nothing was. */
export function lastLoggedAt(doc, id) {
    for (let i = doc.log.length - 1; i >= 0; i--) {
        if (doc.log[i].id === id) return doc.log[i].at;
    }
    return null;
}

/**
 * The in-memory undo stack. `push` is called with the document as it was
 * BEFORE a change and a short label for the change ("Moved Acme to
 * Interviewing"), and `undo` hands back that document and label. The stack
 * holds at most `limit` steps, oldest dropped first.
 */
export function createHistory(limit = 20) {
    let steps = [];
    return {
        push(doc, label) {
            steps.push({ doc, label: String(label || '') });
            if (steps.length > limit) steps = steps.slice(-limit);
        },
        undo() {
            return steps.pop() || null;
        },
        clear() {
            steps = [];
        },
        get canUndo() {
            return steps.length > 0;
        },
        /** The label of the step `undo` would take back, or ''. */
        get label() {
            return steps.length ? steps[steps.length - 1].label : '';
        },
        get size() {
            return steps.length;
        }
    };
}
