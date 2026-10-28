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
 *     figures   who stands in it (none for a plain caption cell): `role`,
 *               `pose` (poses.js), `expression` (avatar-expressions),
 *               `overrides` on the avatar (a build, a muscle), where (`at`
 *               [x, z] from the box's middle, `turn` radians, facing the
 *               open side at 0), `glow` 0 to 1, and a `label` pinned to it
 *               (M5)
 *     captions  the slots, 'top', 'bottom' and/or 'center', in that order
 *     camera    `{ eye, aim, fov }` in the box's own coordinates (its
 *               origin at the middle of its floor, +z toward the open side)
 *     backdrop  the back wall's color, or the box's default
 *     scene     a builder in scenes/ for props (scenes/index.js), or none
 *
 * Adding a template is one entry here (and a builder when it has props).
 * `validateTemplate` says what is wrong with one, and the suite runs it over
 * every entry.
 */

/** The caption slots a cell may carry, in the order they are drawn. A
 *  label pinned to a figure is `{ label: figureIndex }`. */
export const SLOTS = Object.freeze(['top', 'bottom', 'center']);

const deepFreeze = (o) => {
    for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
    return Object.freeze(o);
};

/** The close camera on a face: the chip's portrait backed off a touch,
 *  aimed below the head's middle, so the head sits low enough in the
 *  square for the caption to clear it (judged at thumbnail size). */
const FACE_CAMERA = { eye: [0, 1.62, 1.15], aim: [0, 1.54, 0], fov: 28 };

/** The camera on a figure from the knees up (the build reads, and the face
 *  is still a face at thumbnail size), the box's inner walls showing at
 *  the edges as a diorama's do. */
const FIGURE_CAMERA = { eye: [0, 1.35, 2.4], aim: [0, 1.2, 0], fov: 34 };

/** A plain caption cell: inside the box, looking at the back wall alone. */
const WALL_CAMERA = { eye: [0, 1.15, 0.45], aim: [0, 1.15, -0.7], fov: 30 };
const WALL = '#F4F1EA';

const you = (figure) => ({ role: 'you', pose: 'stand', at: [0, 0], turn: 0, ...figure });
const textCell = (backdrop = WALL) => ({ figures: [], captions: ['center'], camera: WALL_CAMERA, backdrop });
const faceCell = (figure, backdrop, captions = []) => ({ figures: [you(figure)], captions, camera: FACE_CAMERA, backdrop });

/** Surprised (template 9): one panel, one caption above, the shocked face
 *  close. */
const SURPRISED = {
    id: 'surprised',
    title: 'Surprised',
    line: 'One face says it all.',
    order: 1,
    grid: [[{ span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [faceCell({ expression: 'shocked' }, '#F3D98A', ['top'])]
};

/** Panic / Calm / Panic (template 4): three rows, the words on the left
 *  and the face on the right, shocked, deadpan, shocked. */
const PANIC = {
    id: 'panic',
    title: 'Panic / Calm / Panic',
    line: 'Three rows, one rollercoaster.',
    order: 2,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [
        textCell(), faceCell({ expression: 'shocked' }, '#F3B6A6'),
        textCell(), faceCell({ expression: 'deadpan' }, '#BFD9C8'),
        textCell(), faceCell({ expression: 'shocked' }, '#F3B6A6')
    ]
};

/** Nope / Yep (template 3): two rows, the figure on the left waving a
 *  thing away, then pointing at the one they like, the words on the right. */
const NOPE_YEP = {
    id: 'nopeYep',
    title: 'Nope / Yep',
    line: 'Not that one. This one.',
    order: 3,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [
        { figures: [you({ pose: 'dismiss', expression: 'deadpan' })], captions: [], camera: { eye: [0, 1.3, 2.1], aim: [0, 1.2, 0], fov: 34 }, backdrop: '#E7C8C0' },
        textCell(),
        { figures: [you({ pose: 'approve', expression: 'bigGrin' })], captions: [], camera: { eye: [0, 1.3, 2.1], aim: [0, 1.2, 0], fov: 34 }, backdrop: '#C8E0CF' },
        textCell()
    ]
};

/** Then vs Now (template 8): two columns, the visitor slim and weepy on
 *  the left, buff and smug on the right, a caption over each. */
const THEN_NOW = {
    id: 'thenNow',
    title: 'Then vs Now',
    line: 'Same person. New build.',
    order: 4,
    grid: [[{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [
        { figures: [you({ expression: 'crying', overrides: { build: 'slim', muscles: 'standard' } })], captions: ['top'], camera: FIGURE_CAMERA, backdrop: '#C9D3DF' },
        { figures: [you({ expression: 'smug', overrides: { build: 'broad', muscles: 'buff' } })], captions: ['top'], camera: FIGURE_CAMERA, backdrop: '#F0C66E' }
    ]
};

/** Galaxy Brain (template 5): four rows of escalation, the words on the
 *  left, the head glowing brighter on the right. */
const GALAXY_BRAIN = {
    id: 'galaxyBrain',
    title: 'Galaxy Brain',
    line: 'Four rows, each one brighter.',
    order: 5,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [
        textCell(), faceCell({ expression: 'none', glow: 0 }, '#E3DFD7'),
        textCell(), faceCell({ expression: 'smug', glow: 0.35 }, '#C9BFE6'),
        textCell(), faceCell({ expression: 'bigGrin', glow: 0.7 }, '#9A82D6'),
        textCell(), faceCell({ expression: 'shocked', glow: 1 }, '#4B2E99')
    ]
};

/** The Plan (template 7): two by two, the visitor presenting a chart,
 *  pleased, pleased, pleased, then the last step twice over. */
const PLAN_CELL = (expression) => ({
    figures: [you({ pose: 'present', expression, at: [0.45, 0], turn: 0.3 })],
    captions: ['top'],
    camera: { eye: [-0.1, 1.35, 2.8], aim: [-0.12, 1.15, 0], fov: 34 },
    backdrop: '#D7E2EA',
    scene: 'plan'
});
const PLAN = {
    id: 'plan',
    title: 'The Plan',
    line: 'Step one, step two, step three, and step three again.',
    order: 6,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [PLAN_CELL('smug'), PLAN_CELL('smug'), PLAN_CELL('bigGrin'), PLAN_CELL('shocked')]
};

const THREE_ROLES = [
    { id: 'you', label: 'You', cast: 'avatar' },
    { id: 'friend', label: 'A Friend', cast: 'random' },
    { id: 'other', label: 'Someone', cast: 'random' }
];
const TWO_ROLES = THREE_ROLES.slice(0, 2);

/** The Head Turn (template 1): one wide panel, three people. The visitor
 *  walks with Someone and looks back at A Friend passing the other way;
 *  Someone is not pleased. A label on each. */
const HEAD_TURN = {
    id: 'headTurn',
    title: 'The Head Turn',
    line: 'Three people, one of them looking back.',
    order: 7,
    grid: [[{ span: 1 }]],
    roles: THREE_ROLES,
    cells: [{
        figures: [
            { role: 'you', pose: 'lookBack', expression: 'smug', at: [0.05, 0.1], turn: 0.25 },
            { role: 'friend', pose: 'stand', expression: 'none', at: [-0.78, -0.15], turn: 1.9 },
            { role: 'other', pose: 'stand', expression: 'rage', at: [0.8, 0], turn: -0.3 }
        ],
        captions: [{ label: 0 }, { label: 1 }, { label: 2 }],
        camera: { eye: [0, 1.35, 3.3], aim: [0, 1.05, 0], fov: 38 },
        backdrop: '#CFE3EE'
    }]
};

/** The Handshake (template 2): two people clasping hands, a label on each
 *  and one under the hands. The stances are poses.js's HANDSHAKE, solved
 *  on the rig. */
const HANDSHAKE_CELL = {
    figures: [
        { role: 'you', pose: 'shake', expression: 'bigGrin', at: [-0.4, -0.23], turn: Math.PI / 2 - 0.5 },
        { role: 'friend', pose: 'shake', expression: 'bigGrin', at: [0.4, 0.23], turn: -Math.PI / 2 + 0.5 }
    ],
    captions: [{ label: 0 }, { label: 1 }, 'bottom'],
    camera: { eye: [0, 1.35, 3.0], aim: [0, 1.0, 0], fov: 36 },
    backdrop: '#F2D6B3'
};
const HANDSHAKE = {
    id: 'handshake',
    title: 'The Handshake',
    line: 'Two people, one thing they agree on.',
    order: 8,
    grid: [[{ span: 1 }]],
    roles: TWO_ROLES,
    cells: [HANDSHAKE_CELL]
};

/** Always Has Been (template 6): two people in helmets, the Earth below,
 *  the stars behind. The visitor looks back at A Friend. */
const ALWAYS = {
    id: 'alwaysHasBeen',
    title: 'Always Has Been',
    line: 'Two people in space, one realization.',
    order: 9,
    grid: [[{ span: 1 }]],
    roles: TWO_ROLES,
    cells: [{
        figures: [
            { role: 'you', pose: 'lookBack', expression: 'shocked', at: [-0.35, 0.1], turn: 0.5, overrides: { shirt: 'white', sleeves: 'long', bottom: 'pants', bottomColor: 'white', hat: 'none' } },
            { role: 'friend', pose: 'approve', expression: 'smug', at: [0.5, -0.35], turn: -0.6, overrides: { shirt: 'white', sleeves: 'long', bottom: 'pants', bottomColor: 'white', hat: 'none' } }
        ],
        captions: ['top', 'bottom'],
        camera: { eye: [0, 1.4, 3.2], aim: [0, 1.0, 0], fov: 38 },
        backdrop: '#05060C',
        scene: 'space'
    }]
};

/** Everything Is Fine (template 10): one person, calm at a table while
 *  the room burns. */
const FINE_TEMPLATE = {
    id: 'everythingIsFine',
    title: 'Everything Is Fine',
    line: 'One calm person. One burning room.',
    order: 10,
    grid: [[{ span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [{
        figures: [{ role: 'you', pose: 'stand', expression: 'sweat', at: [0.2, 0.05], turn: -0.15 }],
        captions: ['top', 'bottom'],
        camera: { eye: [0.1, 1.3, 2.9], aim: [0, 1.0, 0], fov: 38 },
        backdrop: '#F0A070',
        scene: 'fine'
    }]
};

export const TEMPLATES = deepFreeze([SURPRISED, PANIC, NOPE_YEP, THEN_NOW, GALAXY_BRAIN, PLAN, HEAD_TURN, HANDSHAKE, ALWAYS, FINE_TEMPLATE]);

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

/** Every caption slot of a template in reading order: `{ cell, slot }`
 *  (`{ cell, slot: 'label', figure }` for a label pinned to a figure), the
 *  index into the meme's captions being the index here. */
export function slotsOf(template) {
    const out = [];
    template.cells.forEach((cell, i) => {
        for (const slot of cell.captions) {
            if (slot && typeof slot === 'object') out.push({ cell: i, slot: 'label', figure: slot.label });
            else out.push({ cell: i, slot });
        }
    });
    return out;
}

/**
 * What is wrong with a template, as a list of sentences (empty for a valid
 * one). `expressions`, `poses` and `scenes` are the ids the scene knows,
 * `maxSlots` the most caption slots a template may carry
 * (config.caption.maxSlots).
 */
export function validateTemplate(t, { expressions, poses, scenes = [], maxSlots }) {
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
    let figures = 0;
    t.cells.forEach((cell, i) => {
        const here = `${where}, cell ${i + 1}`;
        if (!Array.isArray(cell.figures)) bad.push(`${here}: needs figures (an empty list is fine)`);
        for (const f of cell.figures || []) {
            figures++;
            if (!roles.some((r) => r.id === f.role)) bad.push(`${here}: figure's role "${f.role}" is not declared`);
            if (!poses.includes(f.pose)) bad.push(`${here}: pose "${f.pose}" is not one the scene knows`);
            if (!expressions.includes(f.expression)) bad.push(`${here}: expression "${f.expression}" is not one the scene knows`);
            if (f.glow !== undefined && !(f.glow >= 0 && f.glow <= 1)) bad.push(`${here}: glow must be 0 to 1`);
            if (f.overrides !== undefined && (typeof f.overrides !== 'object' || f.overrides === null)) bad.push(`${here}: overrides must be an object of avatar fields`);
        }
        if (!Array.isArray(cell.captions)) bad.push(`${here}: needs captions (an empty list is fine)`);
        for (const slot of cell.captions || []) {
            if (slot && typeof slot === 'object') {
                if (!Number.isInteger(slot.label) || !(cell.figures || [])[slot.label]) bad.push(`${here}: label pinned to figure ${slot.label}, which is not there`);
            } else if (!SLOTS.includes(slot)) bad.push(`${here}: caption slot "${slot}" is not top, bottom, center or a label`);
        }
        slots += (cell.captions || []).length;
        const cam = cell.camera || {};
        const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
        if (!vec(cam.eye) || !vec(cam.aim) || !(cam.fov > 0 && cam.fov < 120)) bad.push(`${here}: camera needs eye, aim and a fov under 120`);
        if (cell.backdrop !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cell.backdrop)) bad.push(`${here}: backdrop must be a hex color`);
        if (cell.scene !== undefined && !scenes.includes(cell.scene)) bad.push(`${here}: scene "${cell.scene}" has no builder`);
    });
    if (figures === 0) bad.push(`${where}: nobody is in it`);
    if (Number.isInteger(maxSlots) && slots > maxSlots) bad.push(`${where}: ${slots} caption slots, over the cap of ${maxSlots}`);
    return bad;
}
