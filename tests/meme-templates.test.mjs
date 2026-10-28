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

let POSES;
let SCENE_IDS;
beforeAll(async () => {
    installThree();
    jest.resetModules();
    ({ POSES } = await import('../www/meme/js/poses.js'));
    ({ SCENE_IDS } = await import('../www/meme/js/scenes/index.js'));
});
afterAll(() => { delete globalThis.THREE; });

const rules = () => ({ expressions: EXPRESSIONS.map((e) => e.id), poses: POSES, scenes: SCENE_IDS, maxSlots: CONFIG.caption.maxSlots });

/** A deep, writable copy of a frozen template. */
const copy = (t) => JSON.parse(JSON.stringify(t));

describe('the catalog', () => {
    test('has the six first-cut templates, each valid, with distinct ids and orders', () => {
        expect(T.TEMPLATES.map((t) => t.id).sort()).toEqual(['galaxyBrain', 'nopeYep', 'panic', 'plan', 'surprised', 'thenNow']);
        for (const t of T.TEMPLATES) {
            expect({ [t.id]: T.validateTemplate(t, rules()) }).toEqual({ [t.id]: [] });
        }
        const ids = T.TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        const orders = T.TEMPLATES.map((t) => t.order);
        expect(new Set(orders).size).toBe(orders.length);
        expect(T.byOrder().map((t) => t.id)).toEqual(['surprised', 'panic', 'nopeYep', 'thenNow', 'galaxyBrain', 'plan']);
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
        expect(T.templateOf('galaxyBrain').cells.filter((c) => c.figures.length).map((c) => c.figures[0].glow)).toEqual([0, 0.35, 0.7, 1]);
        expect(T.templateOf('plan').cells.every((c) => c.scene === 'plan' && c.figures[0].pose === 'present')).toBe(true);
        expect(T.templateOf('nopeYep').cells.map((c) => (c.figures[0] || {}).pose)).toEqual(['dismiss', undefined, 'approve', undefined]);
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
        expect(problems((t) => { delete t.cells[0].figures; })).toEqual(expect.arrayContaining([expect.stringMatching(/needs figures/)]));
        expect(problems((t) => { t.cells[0].figures = []; })).toEqual([expect.stringMatching(/nobody is in it/)]);
    });

    test('captions: a missing list, a bad slot, and more slots than the cap', () => {
        expect(problems((t) => { delete t.cells[0].captions; })).toEqual([expect.stringMatching(/needs captions/)]);
        expect(problems((t) => { t.cells[0].captions = ['middle']; })).toEqual([expect.stringMatching(/slot "middle"/)]);
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
});
