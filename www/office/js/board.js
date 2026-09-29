// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * board.js - The corkboard: every application as an index card, pinned in
 * the column of its status.
 *
 * ONE COLUMN PER STORED STATUS, so a card dropped in a column means exactly
 * one thing. `ghosted` is not a column (it is derived, never stored): a card
 * that has gone quiet stays in its column and says so on its face.
 *
 * THE BOARD IS ON THE LEFT WALL, facing into the room, so its own frame is
 * the wall's: `y` up, and `z` along the wall. The camera faces the wall with
 * -z on its right, so the first column (Saved) sits at the largest z, on the
 * left of the screen, and the pipeline reads left to right.
 *
 * Pure: rows in, columns and card poses out. pinboard.js moves the cards and
 * paint.js paints their faces.
 */

import { STATUS_LABELS } from './labels.min.js';

/** The atlas every card face is painted into: columns of cells, and each
 *  cell's size in pixels. It grows by rows as cards are added. */
export const CARD_ATLAS = { cols: 8, cellW: 256, cellH: 160 };

/** The columns, left to right: the stored statuses in pipeline order. */
export function boardColumns(config) {
    return config.statuses.map((status) => ({ status, label: STATUS_LABELS[status] }));
}

/**
 * The cards in each column: `[{ status, label, ids }]`. Within a column the
 * cards keep the order they are handed (the most recently active first,
 * main.js hands them that way), and a column is never missing, so an empty
 * one still has its header and room to drop a card into.
 */
export function boardPlan(rows, config) {
    const columns = boardColumns(config).map((c) => ({ ...c, ids: [] }));
    const at = new Map(columns.map((c, i) => [c.status, i]));
    for (const row of rows) {
        const i = at.get(row.app.status);
        if (i != null) columns[i].ids.push(row.app.id);
    }
    return columns;
}

/** Each card's column and place in it: Map id to `{ column, index, count }`. */
export function cardSlots(plan) {
    const slots = new Map();
    plan.forEach((col, c) => col.ids.forEach((id, i) => slots.set(id, { column: c, index: i, count: col.ids.length })));
    return slots;
}

/** The z of a column's middle along the wall. Column 0 is the leftmost on
 *  screen, which is the largest z. */
export function columnZ(column, board, columns) {
    const w = board.width / columns;
    return board.z + board.width / 2 - w * (column + 0.5);
}

/** The column under a point along the wall, clamped to the board. */
export function columnAt(z, board, columns) {
    const w = board.width / columns;
    const i = Math.floor((board.z + board.width / 2 - z) / w);
    return Math.min(columns - 1, Math.max(0, i));
}

/**
 * Where a card is pinned: `{ y, z, depth }` (depth is how far it stands off
 * the cork, so a later card overlaps an earlier one cleanly). Cards cascade
 * down the column under its header, closer together when there are many,
 * so a busy column overlaps like a real one rather than running off the
 * board.
 */
export function cardPose(slot, board, columns) {
    const top = board.y + board.height / 2 - board.header - board.card[1] / 2 - 0.02;
    const room = board.height - board.header - board.card[1] - 0.04;
    const step = slot.count > 1 ? Math.min(board.card[1] + 0.012, room / (slot.count - 1)) : 0;
    return {
        y: top - step * slot.index,
        z: columnZ(slot.column, board, columns),
        depth: 0.004 + slot.index * 0.0012
    };
}

/** A small, steady tilt per card, so the board looks pinned by hand. The
 *  same card always leans the same way. */
export function cardTilt(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * 0.08;
}

/**
 * A card's four corners in the wall's frame, `[y, z]`, in the order bottom
 * left, bottom right, top right, top left AS SEEN from the room, where the
 * viewer's right is -z.
 */
export function cardCorners(pose, size, tilt = 0) {
    const hw = size[0] / 2;
    const hh = size[1] / 2;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    // (right, up) offsets, turned by the tilt, then right maps to -z.
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([r, u]) => {
        const rr = r * c - u * s;
        const uu = r * s + u * c;
        return [pose.y + uu, pose.z - rr];
    });
}

/** The atlas corners of cell `i` in an atlas of `rows` rows, in the same
 *  order as cardCorners. */
export function cardUvs(i, rows, atlas = CARD_ATLAS) {
    const col = i % atlas.cols;
    const row = Math.floor(i / atlas.cols);
    const u0 = col / atlas.cols;
    const u1 = (col + 1) / atlas.cols;
    const v1 = 1 - row / rows;
    const v0 = 1 - (row + 1) / rows;
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

/** How many atlas rows `n` cards need, never fewer than `min`. */
export function atlasRows(n, min = 2, atlas = CARD_ATLAS) {
    return Math.max(min, Math.ceil(n / atlas.cols));
}

/**
 * A card partway across the board, `t` from 0 to 1: it comes off the cork,
 * crosses, and pins itself again, so a card moving between columns reads as
 * being carried, not slid behind the others.
 */
export function carryPose(from, to, t, lift = 0.1) {
    const x = Math.min(1, Math.max(0, t));
    // The ends exactly, so a card lands where it belongs to the last digit.
    if (x >= 1) return { ...to };
    if (x <= 0) return { ...from };
    const k = x * x * (3 - 2 * x);
    const moving = from.y !== to.y || from.z !== to.z;
    return {
        y: from.y + (to.y - from.y) * k,
        z: from.z + (to.z - from.z) * k,
        depth: from.depth + (to.depth - from.depth) * k + (moving ? Math.sin(Math.PI * x) * lift : 0)
    };
}

/** What each column holds, as a sentence for a screen reader:
 *  "Saved 1, Applied 6, Screening 2, ..." Empty columns are left out. */
export function boardSummary(plan) {
    const parts = plan.filter((c) => c.ids.length).map((c) => `${c.label} ${c.ids.length}`);
    return parts.length ? `On the board: ${parts.join(', ')}.` : 'The board is empty.';
}
