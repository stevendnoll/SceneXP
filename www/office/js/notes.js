// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * notes.js - The sticky notes on the monitor: what is due today, at a glance.
 *
 * One note per follow-up due today or overdue, stuck around the edge of the
 * monitor the way everybody's are. There is room for six. When more are due,
 * the sixth says how many more, so the monitor is never papered over.
 *
 * ALL THE NOTES ARE ONE MESH. Each note is a quad with its own corner of a
 * single canvas atlas, so six notes cost one draw call and one texture.
 *
 * Pure: the notes to show, where each sits, and the corners of its quad.
 * room.js builds the geometry and paint.js paints the atlas.
 */

/** Slots around the bezel, from the screen's center, in meters, with a tilt
 *  in radians. Right side first, top to bottom, then the left. */
export const NOTE_SLOTS = [
    { x: 0.325, y: 0.13, tilt: 0.09 },
    { x: 0.335, y: 0.02, tilt: -0.05 },
    { x: 0.325, y: -0.09, tilt: 0.12 },
    { x: -0.325, y: 0.13, tilt: -0.08 },
    { x: -0.335, y: 0.02, tilt: 0.06 },
    { x: -0.325, y: -0.09, tilt: -0.11 }
];

export const NOTE_SIZE = 0.085;

/** The atlas: columns and rows of square cells. */
export const ATLAS = { cols: 3, rows: 2 };

export const NOTE_COLORS = {
    overdue: '#f6a9bb',
    today: '#fbe38e',
    more: '#a9d8f2'
};

/**
 * The notes for today's follow-ups, overdue ones first. Each is
 * `{ kind: 'task', task, overdue }`, or one last `{ kind: 'more', count }`.
 */
export function stickyNotes(due, max = NOTE_SLOTS.length) {
    const all = [
        ...due.overdue.map((task) => ({ kind: 'task', task, overdue: true })),
        ...due.today.map((task) => ({ kind: 'task', task, overdue: false }))
    ];
    if (all.length <= max) return all;
    const shown = all.slice(0, max - 1);
    shown.push({ kind: 'more', count: all.length - shown.length });
    return shown;
}

/** A signature for a set of notes, so the atlas is repainted only when what
 *  it says changes. */
export function notesKey(notes) {
    return notes.map((n) => (n.kind === 'more' ? `+${n.count}` : `${n.task.id}:${n.task.text}:${n.overdue}`)).join('|');
}

/** What a note says: its words, and a small line under them. */
export function noteWords(note) {
    if (note.kind === 'more') return { text: `${note.count} more`, small: 'on the Today list' };
    return { text: note.task.text, small: note.overdue ? 'Overdue' : 'Today' };
}

/** A note's color. */
export function noteColor(note) {
    if (note.kind === 'more') return NOTE_COLORS.more;
    return note.overdue ? NOTE_COLORS.overdue : NOTE_COLORS.today;
}

/**
 * The four corners of a note's quad, relative to the screen's center, in the
 * order bottom left, bottom right, top right, top left, turned by its tilt.
 */
export function quadCorners(slot, size = NOTE_SIZE) {
    const h = size / 2;
    const c = Math.cos(slot.tilt);
    const s = Math.sin(slot.tilt);
    return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [slot.x + x * c - y * s, slot.y + x * s + y * c]);
}

/** The atlas corners (u, v) of cell `i`, in the same order as quadCorners. */
export function cellUvs(i, atlas = ATLAS) {
    const col = i % atlas.cols;
    const row = Math.floor(i / atlas.cols);
    const u0 = col / atlas.cols;
    const u1 = (col + 1) / atlas.cols;
    // Row 0 is the TOP of the canvas, and v runs upward.
    const v1 = 1 - row / atlas.rows;
    const v0 = 1 - (row + 1) / atlas.rows;
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}
