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
 *   tint      true when the visitor may color its background (M8); its
 *             cells that follow the pick name their own `tint`
 *   grid      rows of cells, each `{ span }`; every row's spans sum to the
 *             same count (the template's columns)
 *   roles     the people in it: `cast` is 'avatar' (the visitor, or a
 *             stand-in with none saved) or 'random' (a cast member)
 *   cells     one per grid entry, in reading order:
 *     figures   who stands in it (none for a plain caption cell): `role`,
 *               `pose` (poses.js) on `side` (the arm that leads, 'right'
 *               unless said) with the head turned `look` ('right' or
 *               'left' by the pose's measure, or radians, positive toward
 *               the figure's left; toward the leading arm unless said)
 *               and nodded `nod` radians (negative looks up), its legs in
 *               a `stride` (radians, the right leg forward when positive),
 *               the leading hand's `twist` about the forearm (radians,
 *               the pose's own unless given), where its label pins
 *               (`labelBelow`, meters under the head's middle, negative
 *               for over the head; config.label.below unless given),
 *               `expression` (avatar-expressions), `overrides` on the
 *               avatar (a build, a muscle), where (`at` [x, z] from the
 *               box's middle, `turn` radians, facing the open side at 0,
 *               positive toward +x), `glow` 0 to 1, and a `label` pinned
 *               to it (M5). SIDES ARE THE FIGURE'S OWN: facing the camera,
 *               its right arm is on the camera's left. The meme names the
 *               side; the avatar's handedness never changes a panel (QA
 *               2026-10-28).
 *     captions  the slots, 'top', 'bottom' and/or 'center', in that order,
 *               a `{ label }` pinned to a figure, or a `{ prop }` drawn on
 *               a surface the cell's scene names (the chart's sheet)
 *     camera    `{ eye, aim, fov }` in the box's own coordinates (its
 *               origin at the middle of its floor, +z toward the open side)
 *     backdrop  the back wall's color, or the box's default
 *     tint      in a template that offers one, how far this wall goes from
 *               paper (0) to the visitor's color (1); `backdrop` is worn
 *               until a color is picked
 *     floor     the floor's color, or the box's default
 *     paint     `{ wall, floor }`, a painter (backdrops.js) for either
 *               surface, painted in that surface's color (M8: the city
 *               block, the storm, the wash, the soot)
 *     scene     a builder in scenes/ for props (scenes/index.js), or none
 *
 * Adding a template is one entry here (and a builder when it has props).
 * `validateTemplate` says what is wrong with one, and the suite runs it over
 * every entry.
 */

/** The caption slots a cell may carry, in the order they are drawn. A
 *  label pinned to a figure is `{ label: figureIndex }`; a caption on a
 *  prop's surface (the chart's sheet) is `{ prop: 'board' }`, drawn where
 *  the scene's builder says that surface is (panels.js `propRects`). */
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
 *  thing away, then pointing at the one they like, the words on the right.
 *  The words are on the camera's right, the figure's left: the left arm
 *  leads in both rows, the head turned away from the words in the first
 *  and toward them in the second, the index out (the classic staging,
 *  2026-10-28: "a big part of the meme is in the point"). */
/** The camera a touch to the camera's right of the figure, and the figure
 *  a little to the left, so the arm reaching right, and the whole fist
 *  with its finger, stay in a square frame. */
const NOPE_CAMERA = { eye: [0.05, 1.3, 2.6], aim: [0.05, 1.2, 0], fov: 34 };
const NOPE_YEP = {
    id: 'nopeYep',
    title: 'Nope / Yep',
    line: 'Not that one. This one.',
    order: 3,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [
        // Backdrops deep enough that a pale hand and a dark one both read
        // against them (Steve, 2026-10-28: the first cut's pastels did not).
        { figures: [you({ pose: 'dismiss', side: 'left', look: 'right', expression: 'deadpan', at: [-0.1, 0] })], captions: [], camera: NOPE_CAMERA, backdrop: '#C9736A' },
        textCell(),
        { figures: [you({ pose: 'point', side: 'left', look: 'left', expression: 'bigGrin', at: [-0.1, 0] })], captions: [], camera: NOPE_CAMERA, backdrop: '#6FAE86' },
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
 *  left, the head glowing brighter on the right: a halo behind it that
 *  grows, then rays (panels.js GLOW). The visitor keeps the hat and the
 *  hair (Steve, 2026-10-28: the glow behind is the whole effect). The
 *  background is the visitor's to color (Steve, M8): the faces' walls
 *  follow one pick, pale to deep down the rows, by each cell's `tint`. */
const GALAXY_BRAIN = {
    id: 'galaxyBrain',
    title: 'Galaxy Brain',
    line: 'Four rows, each one brighter.',
    order: 5,
    tint: true,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [
        textCell(), { ...faceCell({ expression: 'none', glow: 0 }, '#E3DFD7'), tint: 0.15 },
        textCell(), { ...faceCell({ expression: 'smug', glow: 0.45 }, '#C9BFE6'), tint: 0.4 },
        textCell(), { ...faceCell({ expression: 'bigGrin', glow: 0.75 }, '#9A82D6'), tint: 0.7 },
        textCell(), { ...faceCell({ expression: 'shocked', glow: 1 }, '#4B2E99'), tint: 1 }
    ]
};

/** The Plan (template 7): two by two, the visitor presenting a chart,
 *  pleased, pleased, pleased, then the last step twice over. The chart
 *  stands on the camera's left (scenes/plan.js), so the figure turns a
 *  little toward it with the right arm out to it, and faces the room for
 *  three steps; only in the last does the head turn to the chart, shocked
 *  (Steve, 2026-10-28: the look at the board is the fourth panel alone).
 *  A tan wall in a soft gradient, and the presenter dressed all in black
 *  (Steve, M8). A black outfit is a costume; nothing more of anyone's
 *  character (no scarf, no bald head) is added. */
const BLACK = 'x1f1f22';
const ALL_BLACK = { shirt: BLACK, hatColor: BLACK, bottomColor: 'black', shoeColor: 'black', legwearColor: 'black', armwearColor: 'black' };
const PLAN_CELL = (expression, look = 0.2) => ({
    figures: [you({ pose: 'present', side: 'right', look, expression, at: [0.5, 0], turn: -0.2, overrides: ALL_BLACK })],
    // The step is written on the chart (Steve, 2026-10-28).
    captions: [{ prop: 'board' }],
    camera: { eye: [0.03, 1.35, 3.1], aim: [-0.02, 1.15, 0], fov: 36 },
    backdrop: '#D9BF93',
    paint: { wall: 'wash' },
    scene: 'plan'
});
const PLAN = {
    id: 'plan',
    title: 'The Plan',
    line: 'Step one, step two, step three, and step three again.',
    order: 6,
    grid: [[{ span: 1 }, { span: 1 }], [{ span: 1 }, { span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [PLAN_CELL('smug'), PLAN_CELL('smug'), PLAN_CELL('bigGrin'), PLAN_CELL('shocked', 'right')]
};

const THREE_ROLES = [
    { id: 'you', label: 'You', cast: 'avatar' },
    { id: 'friend', label: 'A Friend', cast: 'random' },
    { id: 'other', label: 'Someone', cast: 'random' }
];
const TWO_ROLES = THREE_ROLES.slice(0, 2);

/** The Head Turn (template 1): one wide panel, three people. The visitor
 *  walks toward the camera beside A Friend (on the camera's right, who is
 *  furious) and looks back over the shoulder, taken, at Someone, who has
 *  just passed them and walks on toward the camera in the foreground on
 *  the left. A label on each. (Steve, 2026-10-28: the friend is the one
 *  beside you; the passer-by is nearer the camera than either of you.)
 *  Out on a city block: facades across the street under a strip of sky,
 *  a sidewalk underfoot (Steve, M8). */
const HEAD_TURN = {
    id: 'headTurn',
    title: 'The Head Turn',
    line: 'Three people, one of them looking back.',
    order: 7,
    grid: [[{ span: 1 }]],
    roles: THREE_ROLES,
    cells: [{
        figures: [
            { role: 'you', pose: 'lookBack', look: 'right', expression: 'ooh', at: [0.12, -0.05], turn: 0.3, stride: 0.3 },
            { role: 'friend', pose: 'stand', expression: 'rage', look: 'right', at: [0.78, -0.1], turn: -0.15, stride: -0.3 },
            { role: 'other', pose: 'stand', expression: 'smug', at: [-0.72, 0.45], turn: 0.2, stride: 0.5 }
        ],
        captions: [{ label: 0 }, { label: 1 }, { label: 2 }],
        camera: { eye: [0, 1.35, 3.3], aim: [0, 1.05, 0], fov: 38 },
        backdrop: '#B9D3E6',
        floor: '#CBC7C0',
        paint: { wall: 'city', floor: 'sidewalk' }
    }]
};

/** The Handshake (template 2): two people clasping hands at chest height,
 *  a label on each and one under the hands. The stances are poses.js's
 *  HANDSHAKE, solved on the rig. Both are built broad and buff in short
 *  sleeves, white on the camera's left and red on the right (Steve,
 *  2026-10-28: "the super buff arms" are the other crux), the meme's
 *  costume as the spacesuit is Always Has Been's. Dark gray clouds behind
 *  them with the light pooled round the clasp (scenes/handshake.js,
 *  Steve, M8). */
const BUFF = { build: 'broad', muscles: 'buff', sleeves: 'short' };
/** A true red for the second shirt: the swatches have only a rust, so
 *  this is a custom color id (avatar-1.0.0 `customColor`), which the
 *  override accepts for any color field. */
const RED_SHIRT = 'xc0262a';
const HANDSHAKE_CELL = {
    figures: [
        // The labels over the heads, so neither covers the clasp (Steve,
        // 2026-10-28: the handshake is the crux).
        { role: 'you', pose: 'shake', side: 'right', expression: 'bigGrin', at: [-0.4, -0.23], turn: Math.PI / 2 - 0.5, labelBelow: -0.2, overrides: { ...BUFF, shirt: 'white' } },
        // The friend's hand turned its own way (poses.js: the stances are
        // not a mirror pair), its back away from the camera behind yours.
        { role: 'friend', pose: 'shake', side: 'right', twist: 0.91, expression: 'bigGrin', at: [0.4, 0.23], turn: -Math.PI / 2 + 0.5, labelBelow: -0.2, overrides: { ...BUFF, shirt: RED_SHIRT } }
    ],
    captions: [{ label: 0 }, { label: 1 }, 'bottom'],
    camera: { eye: [0, 1.35, 3.0], aim: [0, 1.0, 0], fov: 36 },
    backdrop: '#3E4146',
    floor: '#2C2E32',
    paint: { wall: 'storm' },
    scene: 'handshake'
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

/** Always Has Been (template 6): two people in helmets, the Earth hanging
 *  up in the camera's top left, the stars behind. A Friend, on the left,
 *  has turned away to gaze up at it; the visitor stands side-on at the
 *  right with the blaster out level at the back of the friend's helmet,
 *  the face turned to the camera (Steve, 2026-10-28: the visitor takes
 *  the punchline, the face the camera sees). */
const SUIT = { shirt: 'white', sleeves: 'long', bottom: 'pants', bottomColor: 'white', hat: 'none' };
const ALWAYS = {
    id: 'alwaysHasBeen',
    title: 'Always Has Been',
    line: 'Two people in space, one realization.',
    order: 9,
    grid: [[{ span: 1 }]],
    roles: TWO_ROLES,
    cells: [{
        figures: [
            { role: 'you', pose: 'aim', side: 'right', look: 0.9, expression: 'smug', at: [0.65, 0.2], turn: -Math.PI / 2 + 0.3, overrides: SUIT },
            // Facing back and to the camera's left (a turn past pi goes
            // toward -x), far enough round that the camera sees some face,
            // the head pitched well up: at the Earth.
            { role: 'friend', pose: 'stand', expression: 'none', at: [-0.3, 0.1], turn: Math.PI + 0.95, nod: -0.5, overrides: SUIT }
        ],
        captions: ['top', 'bottom'],
        camera: { eye: [0, 1.4, 3.2], aim: [0, 1.0, 0], fov: 38 },
        backdrop: '#05060C',
        scene: 'space'
    }]
};

/** Everything Is Fine (template 10): one person, calm at a table while
 *  the room burns. The table on the camera's right and the figure
 *  standing on its left, turned toward it with the face round to the
 *  camera; soot down the wall and smoke under the ceiling (Steve, M8; the
 *  figure stands until the shared figure can sit). */
const FINE_TEMPLATE = {
    id: 'everythingIsFine',
    title: 'Everything Is Fine',
    line: 'One calm person. One burning room.',
    order: 10,
    grid: [[{ span: 1 }]],
    roles: [{ id: 'you', label: 'You', cast: 'avatar' }],
    cells: [{
        figures: [{ role: 'you', pose: 'stand', expression: 'sweat', look: -0.5, at: [-0.22, 0.1], turn: 0.55 }],
        captions: ['top', 'bottom'],
        camera: { eye: [0.05, 1.3, 2.9], aim: [0.05, 1.0, 0], fov: 38 },
        backdrop: '#F0A070',
        paint: { wall: 'soot' },
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
            if (slot && typeof slot === 'object' && slot.prop) out.push({ cell: i, slot: 'prop', prop: slot.prop });
            else if (slot && typeof slot === 'object') out.push({ cell: i, slot: 'label', figure: slot.label });
            else out.push({ cell: i, slot });
        }
    });
    return out;
}

/**
 * What is wrong with a template, as a list of sentences (empty for a valid
 * one). `expressions`, `poses`, `scenes` and `paints` are the ids the scene
 * knows, `sides` the arm sides (poses.js SIDES), `maxSlots` the most
 * caption slots a template may carry (config.caption.maxSlots).
 */
export function validateTemplate(t, { expressions, poses, scenes = [], paints = [], sides = ['right', 'left'], maxSlots }) {
    const bad = [];
    const where = `template "${t && t.id}"`;
    if (!t || typeof t.id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(t.id)) bad.push(`${where}: id must be a lowerCamelCase word`);
    if (!t) return bad;
    if (typeof t.title !== 'string' || !t.title) bad.push(`${where}: needs a title`);
    if (typeof t.line !== 'string' || !t.line) bad.push(`${where}: needs a line`);
    if (!Number.isInteger(t.order) || t.order < 1) bad.push(`${where}: order must be a whole number from 1`);
    if (t.tint !== undefined && typeof t.tint !== 'boolean') bad.push(`${where}: tint must be true or false`);
    if (t.tint === true && !(t.cells || []).some((c) => c && c.tint !== undefined)) bad.push(`${where}: offers a tint, but no cell follows it`);
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
            if (f.side !== undefined && !sides.includes(f.side)) bad.push(`${here}: side "${f.side}" is not right or left`);
            if (f.look !== undefined && !sides.includes(f.look) && !Number.isFinite(f.look)) bad.push(`${here}: look must be right, left or radians`);
            if (f.stride !== undefined && !Number.isFinite(f.stride)) bad.push(`${here}: stride must be radians`);
            if (f.nod !== undefined && !Number.isFinite(f.nod)) bad.push(`${here}: nod must be radians`);
            if (f.twist !== undefined && !Number.isFinite(f.twist)) bad.push(`${here}: twist must be radians`);
            if (f.labelBelow !== undefined && !Number.isFinite(f.labelBelow)) bad.push(`${here}: labelBelow must be meters`);
            if (f.glow !== undefined && !(f.glow >= 0 && f.glow <= 1)) bad.push(`${here}: glow must be 0 to 1`);
            if (f.overrides !== undefined && (typeof f.overrides !== 'object' || f.overrides === null)) bad.push(`${here}: overrides must be an object of avatar fields`);
        }
        if (!Array.isArray(cell.captions)) bad.push(`${here}: needs captions (an empty list is fine)`);
        for (const slot of cell.captions || []) {
            if (slot && typeof slot === 'object' && slot.prop !== undefined) {
                if (typeof slot.prop !== 'string' || !slot.prop) bad.push(`${here}: a prop slot needs the surface's name`);
                else if (cell.scene === undefined) bad.push(`${here}: caption on "${slot.prop}", but the cell has no scene to draw it`);
            } else if (slot && typeof slot === 'object') {
                if (!Number.isInteger(slot.label) || !(cell.figures || [])[slot.label]) bad.push(`${here}: label pinned to figure ${slot.label}, which is not there`);
            } else if (!SLOTS.includes(slot)) bad.push(`${here}: caption slot "${slot}" is not top, bottom, center, a label or a prop`);
        }
        slots += (cell.captions || []).length;
        const cam = cell.camera || {};
        const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
        if (!vec(cam.eye) || !vec(cam.aim) || !(cam.fov > 0 && cam.fov < 120)) bad.push(`${here}: camera needs eye, aim and a fov under 120`);
        if (cell.backdrop !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cell.backdrop)) bad.push(`${here}: backdrop must be a hex color`);
        if (cell.floor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cell.floor)) bad.push(`${here}: floor must be a hex color`);
        if (cell.tint !== undefined) {
            if (t.tint !== true) bad.push(`${here}: follows a tint the template does not offer`);
            else if (!(cell.tint >= 0 && cell.tint <= 1)) bad.push(`${here}: tint must be 0 to 1`);
            if (cell.paint && cell.paint.wall) bad.push(`${here}: a painted wall cannot follow a tint`);
        }
        if (cell.paint !== undefined) {
            const paint = cell.paint && typeof cell.paint === 'object' ? cell.paint : null;
            if (!paint) bad.push(`${here}: paint must be { wall, floor }`);
            for (const [surface, id] of Object.entries(paint || {})) {
                if (!['wall', 'floor'].includes(surface)) bad.push(`${here}: paint names "${surface}", not the wall or the floor`);
                else if (!paints.includes(id)) bad.push(`${here}: paint "${id}" has no painter`);
            }
        }
        if (cell.scene !== undefined && !scenes.includes(cell.scene)) bad.push(`${here}: scene "${cell.scene}" has no builder`);
    });
    if (figures === 0) bad.push(`${where}: nobody is in it`);
    if (Number.isInteger(maxSlots) && slots > maxSlots) bad.push(`${where}: ${slots} caption slots, over the cap of ${maxSlots}`);
    return bad;
}
