// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The meme catalog (www/meme/js/templates.js, specs/meme PLANNING 4.1):
 * every template is valid by the catalog's own rules, and the rules catch
 * each kind of defect a contributor could plant.
 *
 * The catalog is data, so this is the whole test of a template's shape;
 * what it looks like is judged by eye (scripts/meme-preview.mjs).
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import * as T from '../www/meme/js/templates.js';
import { EXPRESSIONS } from '../www/shared/js/avatar-expressions-1.0.0.js';
import { MEME_PAGE as CONFIG } from '../www/meme/js/config.js';
import { withOverrides, DEFAULT_AVATAR } from '../www/shared/js/avatar-1.0.0.js';

let POSES;
let SIDES;
let SCENE_IDS;
let PAINT_IDS;
beforeAll(async () => {
    installThree();
    jest.resetModules();
    ({ POSES, SIDES } = await import('../www/meme/js/poses.js'));
    ({ SCENE_IDS } = await import('../www/meme/js/scenes/index.js'));
    ({ PAINT_IDS } = await import('../www/meme/js/backdrops.js'));
});
afterAll(() => { delete globalThis.THREE; });

const rules = () => ({ expressions: EXPRESSIONS.map((e) => e.id), poses: POSES, scenes: SCENE_IDS, paints: PAINT_IDS, sides: SIDES, maxSlots: CONFIG.caption.maxSlots });

/** A deep, writable copy of a frozen template. */
const copy = (t) => JSON.parse(JSON.stringify(t));

describe('the catalog', () => {
    test('has the ten first-cut templates, each valid, with distinct ids and orders', () => {
        expect(T.TEMPLATES.map((t) => t.id).sort()).toEqual(['alwaysHasBeen', 'everythingIsFine', 'galaxyBrain', 'handshake', 'headTurn', 'nopeYep', 'panic', 'plan', 'surprised', 'thenNow']);
        for (const t of T.TEMPLATES) {
            expect({ [t.id]: T.validateTemplate(t, rules()) }).toEqual({ [t.id]: [] });
        }
        const ids = T.TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        const orders = T.TEMPLATES.map((t) => t.order);
        expect(new Set(orders).size).toBe(orders.length);
        expect(T.byOrder().map((t) => t.id)).toEqual(['surprised', 'panic', 'nopeYep', 'thenNow', 'galaxyBrain', 'plan', 'headTurn', 'handshake', 'alwaysHasBeen', 'everythingIsFine']);
    });

    test('the catalog is frozen in the snapshot: a shipped template changes only on purpose', () => {
        expect(T.TEMPLATES).toMatchSnapshot();
    });

    test('the three-person templates pin a label to each figure, and the friends\' roles are declared', () => {
        expect(T.slotsOf(T.templateOf('headTurn'))).toEqual([{ cell: 0, slot: 'label', figure: 0 }, { cell: 0, slot: 'label', figure: 1 }, { cell: 0, slot: 'label', figure: 2 }]);
        expect(T.templateOf('headTurn').roles.map((r) => r.id)).toEqual(['you', 'friend', 'other']);
        expect(T.slotsOf(T.templateOf('handshake'))).toEqual([{ cell: 0, slot: 'label', figure: 0 }, { cell: 0, slot: 'label', figure: 1 }, { cell: 0, slot: 'bottom' }]);
        expect(T.templateOf('alwaysHasBeen').cells[0].scene).toBe('space');
        expect(T.templateOf('everythingIsFine').cells[0].scene).toBe('fine');
        expect(T.templateOf('headTurn').cells[0].figures[0].pose).toBe('lookBack');
    });

    test('is frozen all the way down, so nothing at run time can change a template', () => {
        for (const t of T.TEMPLATES) {
            expect(Object.isFrozen(t)).toBe(true);
            expect(Object.isFrozen(t.grid)).toBe(true);
            expect(Object.isFrozen(t.cells)).toBe(true);
            for (const cell of t.cells) {
                expect(Object.isFrozen(cell)).toBe(true);
                expect(Object.isFrozen(cell.camera)).toBe(true);
                for (const f of cell.figures) expect(Object.isFrozen(f)).toBe(true);
            }
        }
    });

    test('the shapes are the ones the PRD lists', () => {
        const shape = (id) => T.templateOf(id).grid.map((row) => row.map((c) => c.span));
        expect(shape('surprised')).toEqual([[1]]);
        expect(shape('panic')).toEqual([[1, 1], [1, 1], [1, 1]]);
        expect(shape('nopeYep')).toEqual([[1, 1], [1, 1]]);
        expect(shape('thenNow')).toEqual([[1, 1]]);
        expect(shape('galaxyBrain')).toEqual([[1, 1], [1, 1], [1, 1], [1, 1]]);
        expect(shape('plan')).toEqual([[1, 1], [1, 1]]);
        // The words sit in their own cells beside the faces.
        expect(T.slotsOf(T.templateOf('panic'))).toEqual([{ cell: 0, slot: 'center' }, { cell: 2, slot: 'center' }, { cell: 4, slot: 'center' }]);
        expect(T.templateOf('panic').cells[1].figures[0].expression).toBe('shocked');
        expect(T.templateOf('panic').cells[3].figures[0].expression).toBe('deadpan');
        // Then vs Now changes the build, not the person.
        const [then, now] = T.templateOf('thenNow').cells;
        expect(then.figures[0].overrides).toEqual({ build: 'slim', muscles: 'standard' });
        expect(now.figures[0].overrides).toEqual({ build: 'broad', muscles: 'buff' });
        // Galaxy Brain brightens row by row, and The Plan repeats its last step.
        expect(T.templateOf('galaxyBrain').cells.filter((c) => c.figures.length).map((c) => c.figures[0].glow)).toEqual([0, 0.45, 0.75, 1]);
        // Its background is the visitor's to color, pale to deep down the
        // faces' walls; the words' walls stay paper (Steve, M8). Only it.
        expect(T.templateOf('galaxyBrain').tint).toBe(true);
        expect(T.templateOf('galaxyBrain').cells.map((c) => c.tint)).toEqual([undefined, 0.15, undefined, 0.4, undefined, 0.7, undefined, 1]);
        expect(T.TEMPLATES.filter((t) => t.tint).map((t) => t.id)).toEqual(['galaxyBrain']);
        // The hat and the hair stay on every row (Steve, 2026-10-28).
        expect(T.templateOf('galaxyBrain').cells.every((c) => !c.figures.length || !c.figures[0].overrides)).toBe(true);
        expect(T.templateOf('plan').cells.every((c) => c.scene === 'plan' && c.figures[0].pose === 'present')).toBe(true);
        expect(T.templateOf('nopeYep').cells.map((c) => (c.figures[0] || {}).pose)).toEqual(['dismiss', undefined, 'point', undefined]);
    });

    test('the meme names the arm and the look, in the figure\'s own sides (QA 2026-10-28)', () => {
        const figure = (id, cell = 0, i = 0) => T.templateOf(id).cells[cell].figures[i];
        // Nope / Yep: the words are on the camera's right, the figure's
        // left. The left arm waves them off with the head turned away, then
        // points at them with the face turned toward them.
        expect(figure('nopeYep', 0)).toMatchObject({ side: 'left', look: 'right' });
        expect(figure('nopeYep', 2)).toMatchObject({ pose: 'point', side: 'left', look: 'left' });
        // The Plan: the chart is on the camera's left, so the right arm
        // presents it and the body leans toward it, the face to the room;
        // only the last step turns to look at the chart (Steve, 2026-10-28).
        for (const cell of [0, 1, 2]) {
            expect(figure('plan', cell).side).toBe('right');
            expect(figure('plan', cell).look).toBeGreaterThan(0);
        }
        expect(figure('plan', 3)).toMatchObject({ side: 'right', look: 'right', expression: 'shocked' });
        expect(T.templateOf('plan').cells.every((c) => c.figures[0].turn < 0)).toBe(true);
        // The Head Turn (Steve, 2026-10-28, round three): A Friend walks
        // beside the visitor on the camera's right, furious; Someone has
        // just passed and walks on toward the camera in the foreground on
        // the left, mid-stride; the visitor looks back at them, taken.
        const [you, friend, other] = T.templateOf('headTurn').cells[0].figures;
        expect(you).toMatchObject({ pose: 'lookBack', look: 'right', expression: 'ooh' });
        expect(friend).toMatchObject({ role: 'friend', expression: 'rage', look: 'right' });
        expect(friend.at[0]).toBeGreaterThan(0.5);
        expect(other.role).toBe('other');
        expect(other.at[0]).toBeLessThan(-0.5);
        expect(other.at[1]).toBeGreaterThan(you.at[1] + 0.3);     // nearer the camera
        expect(other.at[1]).toBeGreaterThan(friend.at[1] + 0.3);
        expect(Math.abs(other.turn)).toBeLessThan(0.6);              // toward the camera
        expect(other.stride).toBeGreaterThan(0.3);
        // Always Has Been (Steve, 2026-10-28): the roles swapped. A Friend
        // has turned away to gaze up at the Earth; the visitor, nearer the
        // camera, faces it with the blaster up.
        const [aimer, gazer] = T.templateOf('alwaysHasBeen').cells[0].figures;
        expect(aimer).toMatchObject({ role: 'you', pose: 'aim', side: 'right' });
        expect(aimer.look).toBeGreaterThan(0.5);          // the face round to the camera
        expect(Math.abs(aimer.turn + Math.PI / 2)).toBeLessThan(0.5);   // side-on, the arm toward the friend
        expect(gazer.role).toBe('friend');
        // Past pi, toward -x (the Earth's side), far enough round that the
        // camera sees some face (Steve, 2026-10-28).
        expect(gazer.turn - Math.PI).toBeGreaterThan(0.8);
        expect(gazer.turn - Math.PI).toBeLessThan(1.3);
        expect(gazer.nod).toBeLessThan(0);
        expect(aimer.at[0]).toBeGreaterThan(gazer.at[0] + 0.8);
        // The Handshake is right hands or the hands miss, and both are
        // broad and buff in short sleeves, white on the left, red on the
        // right (Steve, 2026-10-28).
        const shakers = T.templateOf('handshake').cells[0].figures;
        expect(shakers.every((f) => f.side === 'right')).toBe(true);
        expect(shakers[0].twist).toBeUndefined();            // the pose's own
        expect(shakers[1].twist).toBeCloseTo(0.91, 9);       // the friend's, solved with it
        // Both labels over the heads, clear of the clasp (Steve, 2026-10-28).
        expect(shakers.every((f) => f.labelBelow < 0)).toBe(true);
        expect(shakers.map((f) => f.overrides)).toEqual([
            { build: 'broad', muscles: 'buff', sleeves: 'short', shirt: 'white' },
            { build: 'broad', muscles: 'buff', sleeves: 'short', shirt: 'xc0262a' }
        ]);
        // Both shirts are colors the avatar model accepts (a swatch, or a
        // custom color id), so neither override is dropped on the floor.
        for (const f of shakers) expect(withOverrides(DEFAULT_AVATAR, f.overrides).shirt).toBe(f.overrides.shirt);
        // The Plan's words go on the chart (Steve, 2026-10-28).
        expect(T.slotsOf(T.templateOf('plan'))).toEqual([0, 1, 2, 3].map((cell) => ({ cell, slot: 'prop', prop: 'board' })));
    });

    test('the backdrops carry their memes, and The Plan dresses its presenter in black (Steve, M8)', () => {
        const cell = (id, i = 0) => T.templateOf(id).cells[i];
        expect(cell('headTurn').paint).toEqual({ wall: 'city', floor: 'sidewalk' });
        expect(cell('handshake').paint).toEqual({ wall: 'storm' });
        expect(cell('handshake').scene).toBe('handshake');
        expect(T.templateOf('plan').cells.every((c) => c.paint && c.paint.wall === 'wash')).toBe(true);
        expect(cell('everythingIsFine').paint).toEqual({ wall: 'soot' });
        // Every piece of the outfit is black, and every override names a
        // real option or a custom color, so none is dropped on the floor.
        for (const c of T.templateOf('plan').cells) {
            const o = c.figures[0].overrides;
            expect(Object.keys(o).sort()).toEqual(['armwearColor', 'bottomColor', 'hatColor', 'legwearColor', 'shirt', 'shoeColor']);
            const dressed = withOverrides(DEFAULT_AVATAR, o);
            for (const [key, value] of Object.entries(o)) expect({ [key]: dressed[key] }).toEqual({ [key]: value });
        }
        // Everything Is Fine: the table on the camera's right (scenes/fine.js),
        // the figure standing on its left, turned toward it, the face round
        // to the camera (Steve, M8).
        const [figure] = cell('everythingIsFine').figures;
        expect(figure).toMatchObject({ pose: 'stand', expression: 'sweat' });
        expect(figure.at[0]).toBeLessThan(0);
        expect(figure.turn).toBeGreaterThan(0.3);
        expect(figure.look).toBeLessThan(0);
    });

    test('an unknown id falls back to the first in the picker\'s order', () => {
        expect(T.templateOf('nope')).toBe(T.byOrder()[0]);
        expect(T.templateOf(undefined)).toBe(T.byOrder()[0]);
        const shuffled = [{ ...copy(T.TEMPLATES[0]), id: 'b', order: 2 }, { ...copy(T.TEMPLATES[0]), id: 'a', order: 1 }];
        expect(T.byOrder(shuffled).map((t) => t.id)).toEqual(['a', 'b']);
        expect(T.templateOf('zzz', shuffled).id).toBe('a');
    });

    test('slots run in reading order across cells', () => {
        const t = copy(T.TEMPLATES[0]);
        t.grid = [[{ span: 1 }, { span: 1 }], [{ span: 2 }]];
        t.cells = [
            { ...t.cells[0], captions: ['top', 'bottom'] },
            { ...t.cells[0], captions: [] },
            { ...t.cells[0], captions: ['bottom'] }
        ];
        expect(T.validateTemplate(t, rules())).toEqual([]);
        expect(T.columnsOf(t)).toBe(2);
        expect(T.slotsOf(t)).toEqual([{ cell: 0, slot: 'top' }, { cell: 0, slot: 'bottom' }, { cell: 2, slot: 'bottom' }]);
    });
});

describe('the rules catch', () => {
    const base = () => copy(T.TEMPLATES[0]);
    const problems = (mutate) => {
        const t = base();
        mutate(t);
        return T.validateTemplate(t, rules());
    };

    test('nothing at all, or a template with no grid', () => {
        expect(T.validateTemplate(null, rules())).toEqual([expect.stringMatching(/id must be/)]);
        expect(problems((t) => { t.grid = []; })).toEqual([expect.stringMatching(/needs a grid/)]);
    });

    test('a bad id, a missing title or line, a bad order', () => {
        expect(problems((t) => { t.id = 'Head Turn'; })).toEqual([expect.stringMatching(/lowerCamelCase/)]);
        expect(problems((t) => { t.title = ''; })).toEqual([expect.stringMatching(/needs a title/)]);
        expect(problems((t) => { delete t.line; })).toEqual([expect.stringMatching(/needs a line/)]);
        expect(problems((t) => { t.order = 0; })).toEqual([expect.stringMatching(/order must be/)]);
        expect(problems((t) => { t.order = 1.5; })).toEqual([expect.stringMatching(/order must be/)]);
    });

    test('rows whose spans disagree, and a span that is not a whole number', () => {
        expect(problems((t) => {
            t.grid = [[{ span: 1 }, { span: 1 }], [{ span: 1 }]];
            t.cells = [t.cells[0], t.cells[0], t.cells[0]];
        })).toEqual([expect.stringMatching(/row 2 spans 1 columns, the first row 2/)]);
        expect(problems((t) => { t.grid = [[{ span: 0 }]]; })).toEqual([expect.stringMatching(/row 1 spans NaN/)]);
    });

    test('cells that do not match the grid', () => {
        expect(problems((t) => { t.cells = []; })).toEqual([expect.stringMatching(/0 cells for 1 grid entries/)]);
        expect(problems((t) => { delete t.cells; })).toEqual([expect.stringMatching(/0 cells for 1/)]);
        expect(problems((t) => { t.grid = [[{ span: 1 }], [{ span: 1 }]]; })).toEqual([expect.stringMatching(/1 cells for 2 grid entries/)]);
    });

    test('roles: none, a bad cast, no label, and nobody for the visitor', () => {
        expect(problems((t) => { t.roles = []; })).toEqual(expect.arrayContaining([expect.stringMatching(/needs a role/), expect.stringMatching(/no role is the visitor/)]));
        expect(problems((t) => { t.roles[0].cast = 'friend'; })).toEqual(expect.arrayContaining([expect.stringMatching(/casts "friend"/), expect.stringMatching(/no role is the visitor/)]));
        expect(problems((t) => { t.roles[0].label = ''; })).toEqual([expect.stringMatching(/needs a label/)]);
        expect(problems((t) => { delete t.roles; })).toEqual(expect.arrayContaining([expect.stringMatching(/needs a role/)]));
    });

    test('a figure whose role, pose, expression, glow or overrides are wrong, a cell with no figure list, and a template with nobody in it', () => {
        expect(problems((t) => { t.cells[0].figures[0].role = 'them'; })).toEqual([expect.stringMatching(/role "them" is not declared/)]);
        expect(problems((t) => { t.cells[0].figures[0].pose = 'moonwalk'; })).toEqual([expect.stringMatching(/pose "moonwalk"/)]);
        expect(problems((t) => { t.cells[0].figures[0].expression = 'bored'; })).toEqual([expect.stringMatching(/expression "bored"/)]);
        expect(problems((t) => { t.cells[0].figures[0].glow = 2; })).toEqual([expect.stringMatching(/glow must be 0 to 1/)]);
        expect(problems((t) => { t.cells[0].figures[0].overrides = 'slim'; })).toEqual([expect.stringMatching(/overrides must be/)]);
        expect(problems((t) => { t.cells[0].figures[0].side = 'both'; })).toEqual([expect.stringMatching(/side "both" is not right or left/)]);
        expect(problems((t) => { t.cells[0].figures[0].look = 'away'; })).toEqual([expect.stringMatching(/look must be right, left or radians/)]);
        expect(problems((t) => { t.cells[0].figures[0].look = 'left'; })).toEqual([]);
        expect(problems((t) => { t.cells[0].figures[0].look = -0.4; })).toEqual([]);
        expect(problems((t) => { t.cells[0].figures[0].side = 'left'; })).toEqual([]);
        expect(problems((t) => { t.cells[0].figures[0].stride = 'long'; })).toEqual([expect.stringMatching(/stride must be radians/)]);
        expect(problems((t) => { t.cells[0].figures[0].nod = NaN; })).toEqual([expect.stringMatching(/nod must be radians/)]);
        expect(problems((t) => { t.cells[0].figures[0].twist = 'up'; })).toEqual([expect.stringMatching(/twist must be radians/)]);
        expect(problems((t) => { t.cells[0].figures[0].twist = 0.9; })).toEqual([]);
        expect(problems((t) => { t.cells[0].figures[0].labelBelow = 'top'; })).toEqual([expect.stringMatching(/labelBelow must be meters/)]);
        expect(problems((t) => { t.cells[0].figures[0].labelBelow = -0.3; })).toEqual([]);
        expect(problems((t) => { t.cells[0].figures[0].stride = 0.4; t.cells[0].figures[0].nod = -0.3; })).toEqual([]);
        expect(problems((t) => { delete t.cells[0].figures; })).toEqual(expect.arrayContaining([expect.stringMatching(/needs figures/)]));
        expect(problems((t) => { t.cells[0].figures = []; })).toEqual([expect.stringMatching(/nobody is in it/)]);
    });

    test('captions: a missing list, a bad slot, and more slots than the cap', () => {
        expect(problems((t) => { delete t.cells[0].captions; })).toEqual([expect.stringMatching(/needs captions/)]);
        expect(problems((t) => { t.cells[0].captions = ['middle']; })).toEqual([expect.stringMatching(/slot "middle"/)]);
        expect(problems((t) => { t.cells[0].captions = [{ label: 3 }]; })).toEqual([expect.stringMatching(/label pinned to figure 3/)]);
        expect(problems((t) => { t.cells[0].captions = [{ label: 'a' }]; })).toEqual([expect.stringMatching(/label pinned to figure a/)]);
        expect(problems((t) => { t.cells[0].captions = [{ label: 0 }, 'top']; })).toEqual([]);
        // A caption on a prop needs a name and a scene to draw it.
        expect(problems((t) => { t.cells[0].captions = [{ prop: '' }]; })).toEqual([expect.stringMatching(/prop slot needs the surface's name/)]);
        expect(problems((t) => { t.cells[0].captions = [{ prop: 'board' }]; })).toEqual([expect.stringMatching(/no scene to draw it/)]);
        expect(problems((t) => { t.cells[0].captions = [{ prop: 'board' }]; t.cells[0].scene = 'plan'; })).toEqual([]);
        expect(problems((t) => { t.cells[0].captions = ['top', 'bottom', 'top', 'bottom', 'top', 'bottom', 'top']; }))
            .toEqual([expect.stringMatching(/7 caption slots, over the cap of 6/)]);
        const t = base();
        t.cells[0].captions = ['top', 'bottom', 'top', 'bottom', 'top', 'bottom', 'top'];
        expect(T.validateTemplate(t, { ...rules(), maxSlots: undefined })).toEqual([]);
    });

    test('a camera missing a part or too wide, a backdrop that is not a color, and a scene with no builder', () => {
        expect(problems((t) => { t.cells[0].camera = { eye: [0, 1, 2], aim: [0, 1], fov: 30 }; })).toEqual([expect.stringMatching(/camera needs/)]);
        expect(problems((t) => { t.cells[0].camera.fov = 120; })).toEqual([expect.stringMatching(/camera needs/)]);
        expect(problems((t) => { delete t.cells[0].camera; })).toEqual([expect.stringMatching(/camera needs/)]);
        expect(problems((t) => { t.cells[0].backdrop = 'yellow'; })).toEqual([expect.stringMatching(/backdrop must be/)]);
        expect(problems((t) => { delete t.cells[0].backdrop; })).toEqual([]);
        expect(problems((t) => { t.cells[0].scene = 'castle'; })).toEqual([expect.stringMatching(/scene "castle" has no builder/)]);
        expect(problems((t) => { t.cells[0].scene = 'plan'; })).toEqual([]);
    });

    test('a tint that is not true or false, a template offering one no cell follows, and a cell following one not offered (M8)', () => {
        expect(problems((t) => { t.tint = 'yes'; })).toEqual(expect.arrayContaining([expect.stringMatching(/tint must be true or false/)]));
        expect(problems((t) => { t.tint = true; })).toEqual([expect.stringMatching(/offers a tint, but no cell follows it/)]);
        expect(problems((t) => { t.cells[0].tint = 0.5; })).toEqual([expect.stringMatching(/follows a tint the template does not offer/)]);
        expect(problems((t) => { t.tint = true; t.cells[0].tint = 1.5; })).toEqual([expect.stringMatching(/tint must be 0 to 1/)]);
        expect(problems((t) => { t.tint = true; t.cells[0].tint = 1; t.cells[0].paint = { wall: 'wash' }; })).toEqual([expect.stringMatching(/painted wall cannot follow a tint/)]);
        expect(problems((t) => { t.tint = true; t.cells[0].tint = 1; })).toEqual([]);
        expect(problems((t) => { t.tint = false; })).toEqual([]);
    });

    test('a floor that is not a color, and paint on a surface a box lacks or with no painter (M8)', () => {
        expect(problems((t) => { t.cells[0].floor = 'gray'; })).toEqual([expect.stringMatching(/floor must be/)]);
        expect(problems((t) => { t.cells[0].floor = '#CBC7C0'; })).toEqual([]);
        expect(problems((t) => { t.cells[0].paint = 'city'; })).toEqual([expect.stringMatching(/paint must be/)]);
        expect(problems((t) => { t.cells[0].paint = null; })).toEqual([expect.stringMatching(/paint must be/)]);
        expect(problems((t) => { t.cells[0].paint = { ceiling: 'city' }; })).toEqual([expect.stringMatching(/paint names "ceiling"/)]);
        expect(problems((t) => { t.cells[0].paint = { wall: 'mural' }; })).toEqual([expect.stringMatching(/paint "mural" has no painter/)]);
        expect(problems((t) => { t.cells[0].paint = { wall: 'city', floor: 'sidewalk' }; })).toEqual([]);
        // A catalog checked without the painters' list knows none.
        const t = base();
        t.cells[0].paint = { wall: 'city' };
        expect(T.validateTemplate(t, { ...rules(), paints: undefined })).toEqual([expect.stringMatching(/paint "city" has no painter/)]);
    });
});
