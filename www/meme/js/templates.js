// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * templates.js - THE CATALOG (specs/meme PLANNING 4.1): every meme template
 * as data, and the rules that make one valid. Pure, no THREE, so the remix
 * link, the picker and the tests read it without a scene.
 *
 * A template is a situation and a panel layout, never a copy of a source
 * image (PRD section 7): named by what happens in it, with generic props,
 * and nobody's likeness.
 *
 *   id        in the remix link and the file names
 *   title     in the picker
 *   line      one line under the title
 *   order     where it sits in the picker (the one-person, instant-payoff
 *             templates first)
 *   grid      rows of cells, each `{ span }`; every row's spans sum to the
 *             same count (the template's columns)
 *   roles     the people in it: `cast` is 'avatar' (the visitor, or a
 *             stand-in with none saved) or 'random' (a cast member)
 *   cells     one per grid entry, in reading order:
 *     figures   who stands in it: `role`, `pose`, `expression`, where
 *               (`at` [x, z] from the box's middle, `turn` radians, facing
 *               the open side at 0), and a `label` pinned to it (M2)
 *     captions  the slots, 'top' and/or 'bottom', in that order
 *     camera    `{ eye, aim, fov }` in the box's own coordinates (its
 *               origin at the middle of its floor, +z toward the open side)
 *     backdrop  the back wall's color, or the box's default
 *     scene     a builder in scenes/ for props and lights (M2), or none
 *
 * Adding a template is one entry here (and a builder when it has props).
 * `validateTemplate` says what is wrong with one, and the suite runs it over
 * every entry.
 */

/** The poses a figure may hold. M1 is the rest pose; M2 adds the solved
 *  ones (dismiss, approve, present, look back, sit). */
export const POSES = Object.freeze(['stand']);

/** The caption slots a cell may carry, in the order they are drawn. */
export const SLOTS = Object.freeze(['top', 'bottom']);

/**
 * Surprised (template 9): one panel, one caption above, the shocked face
 * close. The camera is the chip's portrait backed off a touch, aimed below
 * the head's middle, so the head sits low enough in the square for the
 * caption to clear it (PLANNING 5.1: judged at thumbnail size).
 */
const SURPRISED = Object.freeze({
    id: 'surprised',
    title: 'Surprised',
    line: 'One face says it all.',
    order: 1,
    grid: Object.freeze([Object.freeze([Object.freeze({ span: 1 })])]),
    roles: Object.freeze([Object.freeze({ id: 'you', label: 'You', cast: 'avatar' })]),
    cells: Object.freeze([Object.freeze({
        figures: Object.freeze([Object.freeze({ role: 'you', pose: 'stand', expression: 'shocked', at: Object.freeze([0, 0]), turn: 0 })]),
        captions: Object.freeze(['top']),
        camera: Object.freeze({ eye: Object.freeze([0, 1.62, 1.15]), aim: Object.freeze([0, 1.54, 0]), fov: 28 }),
        backdrop: '#F3D98A'
    })])
});

export const TEMPLATES = Object.freeze([SURPRISED]);

/** The templates in the picker's order. */
export function byOrder(templates = TEMPLATES) {
    return templates.slice().sort((a, b) => a.order - b.order);
}

/** The template `id` names, or the first in the picker's order. */
export function templateOf(id, templates = TEMPLATES) {
    return templates.find((t) => t.id === id) || byOrder(templates)[0];
}

/** How many columns a grid has: the first row's spans. */
export function columnsOf(template) {
    return template.grid[0].reduce((n, c) => n + c.span, 0);
}

/** Every caption slot of a template in reading order: `{ cell, slot }`,
 *  the index into the meme's captions being the index here. */
export function slotsOf(template) {
    const out = [];
    template.cells.forEach((cell, i) => {
        for (const slot of cell.captions) out.push({ cell: i, slot });
    });
    return out;
}

/**
 * What is wrong with a template, as a list of sentences (empty for a valid
 * one). `expressions` and `poses` are the ids the scene knows, `maxSlots`
 * the most caption slots a template may carry (config.caption.maxSlots).
 */
export function validateTemplate(t, { expressions, poses = POSES, maxSlots }) {
    const bad = [];
    const where = `template "${t && t.id}"`;
    if (!t || typeof t.id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(t.id)) bad.push(`${where}: id must be a lowerCamelCase word`);
    if (!t) return bad;
    if (typeof t.title !== 'string' || !t.title) bad.push(`${where}: needs a title`);
    if (typeof t.line !== 'string' || !t.line) bad.push(`${where}: needs a line`);
    if (!Number.isInteger(t.order) || t.order < 1) bad.push(`${where}: order must be a whole number from 1`);
    if (!Array.isArray(t.grid) || !t.grid.length) {
        bad.push(`${where}: needs a grid of rows`);
        return bad;
    }
    const columns = columnsOf(t);
    t.grid.forEach((row, r) => {
        const sum = row.reduce((n, c) => n + (Number.isInteger(c.span) && c.span > 0 ? c.span : NaN), 0);
        if (sum !== columns) bad.push(`${where}: row ${r + 1} spans ${sum} columns, the first row ${columns}`);
    });
    const cellCount = t.grid.reduce((n, row) => n + row.length, 0);
    if (!Array.isArray(t.cells) || t.cells.length !== cellCount) {
        bad.push(`${where}: ${(t.cells || []).length} cells for ${cellCount} grid entries`);
        return bad;
    }
    const roles = Array.isArray(t.roles) ? t.roles : [];
    if (!roles.length) bad.push(`${where}: needs a role`);
    for (const role of roles) {
        if (!['avatar', 'random'].includes(role.cast)) bad.push(`${where}: role "${role.id}" casts "${role.cast}", not avatar or random`);
        if (typeof role.label !== 'string' || !role.label) bad.push(`${where}: role "${role.id}" needs a label`);
    }
    if (!roles.some((r) => r.cast === 'avatar')) bad.push(`${where}: no role is the visitor's avatar`);
    let slots = 0;
    t.cells.forEach((cell, i) => {
        const here = `${where}, cell ${i + 1}`;
        if (!Array.isArray(cell.figures)) bad.push(`${here}: needs figures`);
        for (const f of cell.figures || []) {
            if (!roles.some((r) => r.id === f.role)) bad.push(`${here}: figure's role "${f.role}" is not declared`);
            if (!poses.includes(f.pose)) bad.push(`${here}: pose "${f.pose}" is not one the scene knows`);
            if (!expressions.includes(f.expression)) bad.push(`${here}: expression "${f.expression}" is not one the scene knows`);
        }
        if (!Array.isArray(cell.captions)) bad.push(`${here}: needs captions (an empty list is fine)`);
        for (const slot of cell.captions || []) {
            if (!SLOTS.includes(slot)) bad.push(`${here}: caption slot "${slot}" is not top or bottom`);
        }
        slots += (cell.captions || []).length;
        const cam = cell.camera || {};
        const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
        if (!vec(cam.eye) || !vec(cam.aim) || !(cam.fov > 0 && cam.fov < 120)) bad.push(`${here}: camera needs eye, aim and a fov under 120`);
        if (cell.backdrop !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cell.backdrop)) bad.push(`${here}: backdrop must be a hex color`);
    });
    if (Number.isInteger(maxSlots) && slots > maxSlots) bad.push(`${where}: ${slots} caption slots, over the cap of ${maxSlots}`);
    return bad;
}
