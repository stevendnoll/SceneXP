// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cabinet.js - Where every folder goes in the filing cabinet, and how it
 * moves there.
 *
 * THE CABINET IS FILED BY THE SAME SORT AS THE GRID. Every live application
 * is a folder, in the grid's order, split across the drawers, and each
 * drawer's label says what it holds ("A to F", "Sep 2 to Sep 18"). Change the
 * sort and the labels change and the folders refile.
 *
 * A SEARCH LIFTS, IT DOES NOT HIDE. The cabinet always holds everything. The
 * folders a search or a filter finds rise out of their drawers, and while
 * anything is being looked for, the rest dim. So a search reads as a place in
 * the room ("those three, there") rather than a list.
 *
 * A TAB SAYS THE STATUS TWICE: by its color, and by where it sits on the
 * folder's edge, the way real folders stagger their tabs. Waiting on somebody
 * sits left, moving sits in the middle, closed sits right. Nobody has to tell
 * colors apart to read a drawer.
 *
 * Pure: rows in, plans and poses out. room.js builds the cabinet, and main.js
 * moves the instances.
 */

import { fold } from './query.min.js';
import { compactSalary, activityText } from './grid.min.js';

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** The status groups a status sort files into, in pipeline order. */
export const STATUS_DRAWERS = [
    { label: 'Saved and applied', statuses: ['saved', 'applied'] },
    { label: 'In progress', statuses: ['screening', 'interviewing'] },
    { label: 'Offers', statuses: ['offer', 'accepted'] },
    { label: 'Closed', statuses: ['rejected', 'withdrawn'] }
];

/** Where a tab sits on the folder's top edge: -1 left, 0 middle, 1 right. */
export function tabShift(status) {
    if (['screening', 'interviewing', 'offer', 'accepted'].includes(status)) return 0;
    if (['rejected', 'withdrawn'].includes(status)) return 1;
    return -1;
}

/** A tab's color by the status shown (`ghosted` included). */
export const TAB_COLORS = {
    saved: 0xb9c3cf,
    applied: 0x6fa8dc,
    screening: 0x4fb3bf,
    interviewing: 0x7b6fd6,
    offer: 0x5dbb63,
    accepted: 0xe4c07a,
    rejected: 0xb0766f,
    withdrawn: 0x8f8f8f,
    ghosted: 0x9aa5b1
};

/** `n` things split into `parts` contiguous runs, as even as can be, the
 *  first runs one longer where they cannot be equal. */
export function chunkSizes(n, parts) {
    const base = Math.floor(n / parts);
    const extra = n % parts;
    return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

function initial(row) {
    const ch = fold(row.app.company || row.app.role).trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : '#';
}

function dateOf(key) {
    const [y, m, d] = key.split('-').map(Number);
    return SHORT_DATE.format(new Date(y, m - 1, d));
}

/** A drawer's label from the first and last folders in it. */
export function drawerLabel(sortKey, first, last, now) {
    if (!first) return 'Empty';
    const range = (a, b) => (a === b ? a : `${a} to ${b}`);
    switch (sortKey) {
    case 'company': return range(initial(first), initial(last));
    case 'applied': {
        const a = first.app.appliedOn;
        const b = last.app.appliedOn;
        if (!a && !b) return 'Not sent yet';
        if (!a || !b) return `${dateOf(a || b)} and unsent`;
        return range(dateOf(a), dateOf(b));
    }
    case 'salary': {
        const a = compactSalary(first.app);
        const b = compactSalary(last.app);
        if (!a && !b) return 'No salary listed';
        const top = (s) => s.split(' to ').pop().replace(' an hour', '/hr');
        if (!a || !b) return `${top(a || b)} and unlisted`;
        return range(top(a), top(b));
    }
    default: {
        const a = activityText(first.lastActivity, now) || 'No date';
        const b = activityText(last.lastActivity, now) || 'no date';
        return range(a, b);
    }
    }
}

/**
 * The drawers for a set of rows already in sort order: each
 * `{ label, ids }`. A status sort files by stage. Every other sort splits the
 * rows into even runs, so the drawers fill together.
 */
export function drawerPlan(rows, sortKey, sortDir, drawers, now) {
    if (sortKey === 'status') {
        const groups = STATUS_DRAWERS.slice(0, drawers).map((g) => ({ label: g.label, ids: [] }));
        const order = sortDir === 'desc' ? [...groups].reverse() : groups;
        for (const row of rows) {
            const at = STATUS_DRAWERS.findIndex((g) => g.statuses.includes(row.app.status));
            groups[at >= 0 ? at : 0].ids.push(row.app.id);
        }
        return order;
    }
    const sizes = chunkSizes(rows.length, drawers);
    const out = [];
    let at = 0;
    for (const size of sizes) {
        const run = rows.slice(at, at + size);
        at += size;
        out.push({ label: drawerLabel(sortKey, run[0], run[run.length - 1], now), ids: run.map((r) => r.app.id) });
    }
    return out;
}

/** Each folder's drawer and place in it: Map id to `{ drawer, index, count }`. */
export function slotsOf(plan) {
    const slots = new Map();
    plan.forEach((drawer, d) => drawer.ids.forEach((id, i) => slots.set(id, { drawer: d, index: i, count: drawer.ids.length })));
    return slots;
}

/**
 * Where a folder stands, in the drawers' frame (x across from the cabinet's
 * middle, y up from the room's floor, z out toward the room). The drawers'
 * slide is their group's, not the folder's. `lift` is how far the folder has
 * risen, 0 to 1.
 */
export function folderPose(slot, cab, lift = 0) {
    const drawerW = cab.width / cab.drawers;
    const x = -cab.width / 2 + drawerW * (slot.drawer + 0.5);
    const inner = cab.depth - 0.08;
    const spacing = Math.min(0.035, inner / Math.max(slot.count, 1));
    // Front to back, the first folder nearest the front, the run centered in
    // the drawer (whose middle is z = 0).
    const run = spacing * (slot.count - 1);
    const z = run / 2 - spacing * slot.index;
    const y = cab.floor + cab.folderHeight / 2 + cab.lift * lift;
    return { x, y, z };
}

const smooth = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * A folder partway through a refile, `t` from 0 to 1: it rises out of its
 * old drawer, crosses over, and drops into the new one, so a move between
 * drawers never passes through a drawer's wall.
 */
export function refilePose(from, to, t, rise = 0.18) {
    if (t >= 1) return { ...to };
    if (t <= 0) return { ...from };
    const k = smooth(t);
    const hop = from.x === to.x && from.z === to.z ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * rise;
    return {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k + hop,
        z: from.z + (to.z - from.z) * k
    };
}

/** How the cabinet reads a search to a screen reader: "3 folders lifted:
 *  Acme, Birch and Cedar." */
export function liftedLine(names, total) {
    if (!names.length) return total ? 'Nothing matches, so every folder stays in its drawer.' : 'The cabinet is empty.';
    const shown = names.slice(0, 3);
    const rest = names.length - shown.length;
    const list = rest > 0 ? `${shown.join(', ')} and ${rest} more`
        : shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
    return `${names.length} ${names.length === 1 ? 'folder' : 'folders'} lifted: ${list}.`;
}

/** Where a folder's tab sits, from where its body stands. */
export function tabPose(body, status, cab) {
    const bodyW = cab.width / cab.drawers - 0.08;
    return { x: body.x + tabShift(status) * (bodyW / 2 - 0.07), y: body.y + cab.folderHeight / 2 + 0.012, z: body.z };
}
