// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * history.js - Undo, in memory.
 *
 * Copied from Corner Office's `createHistory` (www/office/js/log.js). Every
 * change pushes the document it replaced with a short label ("Removed
 * Stovetop"), and `undo` hands back that document and label. Mutations never
 * change a document in place (store.js), so keeping the old one is all undo
 * takes.
 *
 * IN MEMORY ONLY. An undo offered after a reload would be undoing something
 * the visitor no longer remembers doing. The stack holds at most `limit`
 * steps, oldest dropped first.
 *
 * Pure apart from the closure.
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
