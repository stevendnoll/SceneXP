// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's corkboard: where every card is pinned (board.js), and the
 * controller that carries and drags them (pinboard.js), driven over plain
 * records so every position can be read back.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication, setStatus } from '../www/office/js/store.js';
import { queryApplications } from '../www/office/js/query.js';
import {
    boardColumns, boardPlan, cardSlots, columnZ, columnAt, cardPose, cardTilt, cardCorners, cardUvs, atlasRows,
    carryPose, boardSummary, CARD_ATLAS
} from '../www/office/js/board.js';

const NOW = new Date(2026, 8, 24, 10, 0);
const B = CONFIG.room.board;
const COLS = CONFIG.statuses.length;

function office() {
    let doc = emptyDoc(CONFIG, NOW);
    ['Acme', 'Birch', 'Cedar', 'Dune'].forEach((c, i) => {
        doc = addApplication(doc, { company: c, role: 'Designer' }, CONFIG, NOW, { id: `a${i}` }).doc;
    });
    doc = setStatus(doc, 'a1', 'interviewing', CONFIG, NOW).doc;
    doc = setStatus(doc, 'a3', 'rejected', CONFIG, NOW).doc;
    return doc;
}

describe('the board', () => {
    test('one column per stored status, in pipeline order, with its label', () => {
        const cols = boardColumns(CONFIG);
        expect(cols.map((c) => c.status)).toEqual(CONFIG.statuses);
        expect(cols[6].label).toBe('Not selected');
    });

    test('cards go to their status’s column, and empty columns stay', () => {
        const rows = queryApplications(office(), { sortKey: 'company', sortDir: 'asc' }, CONFIG, NOW).rows;
        const plan = boardPlan(rows, CONFIG);
        expect(plan).toHaveLength(COLS);
        expect(plan.find((c) => c.status === 'applied').ids).toEqual(['a0', 'a2']);
        expect(plan.find((c) => c.status === 'interviewing').ids).toEqual(['a1']);
        expect(plan.find((c) => c.status === 'saved').ids).toEqual([]);
        expect(cardSlots(plan).get('a2')).toEqual({ column: 1, index: 1, count: 2 });
        expect(boardSummary(plan)).toBe('On the board: Applied 2, Interviewing 1, Not selected 1.');
        expect(boardSummary(boardPlan([], CONFIG))).toBe('The board is empty.');
    });

    test('columns run left to right on screen, which is toward -z, and a point finds its column', () => {
        for (let c = 0; c < COLS; c++) {
            expect(columnAt(columnZ(c, B, COLS), B, COLS)).toBe(c);
            if (c) expect(columnZ(c, B, COLS)).toBeLessThan(columnZ(c - 1, B, COLS));
        }
        expect(columnAt(B.z + 99, B, COLS)).toBe(0);
        expect(columnAt(B.z - 99, B, COLS)).toBe(COLS - 1);
    });

    test('cards cascade down their column, closer together when crowded, and never off the cork', () => {
        const bottom = B.y - B.height / 2;
        const top = B.y + B.height / 2 - B.header;
        for (const count of [1, 3, 30]) {
            for (let i = 0; i < count; i++) {
                const p = cardPose({ column: 2, index: i, count }, B, COLS);
                expect(p.y + B.card[1] / 2).toBeLessThanOrEqual(top + 1e-9);
                expect(p.y - B.card[1] / 2).toBeGreaterThanOrEqual(bottom - 1e-9);
                expect(p.z).toBe(columnZ(2, B, COLS));
                if (i) expect(p.depth).toBeGreaterThan(cardPose({ column: 2, index: i - 1, count }, B, COLS).depth);
            }
        }
        // A short column does not overlap at all.
        const a = cardPose({ column: 0, index: 0, count: 3 }, B, COLS);
        const b = cardPose({ column: 0, index: 1, count: 3 }, B, COLS);
        expect(a.y - b.y).toBeGreaterThan(B.card[1]);
    });

    test('a card’s corners: its size, turned by a small steady tilt, its right toward -z', () => {
        const flat = cardCorners({ y: 1, z: 0 }, [0.2, 0.1], 0);
        expect(flat).toEqual([[0.95, 0.1], [0.95, -0.1], [1.05, -0.1], [1.05, 0.1]]);
        expect(cardTilt('abc')).toBe(cardTilt('abc'));
        expect(Math.abs(cardTilt('some-long-id-1234'))).toBeLessThanOrEqual(0.04);
        const turned = cardCorners({ y: 1, z: 0 }, [0.2, 0.1], 0.03);
        const side = Math.hypot(turned[1][0] - turned[0][0], turned[1][1] - turned[0][1]);
        expect(side).toBeCloseTo(0.2, 9);
    });

    test('each card has its own cell, and the atlas grows by rows', () => {
        expect(cardUvs(0, 2)).toEqual([[0, 0.5], [1 / 8, 0.5], [1 / 8, 1], [0, 1]]);
        expect(cardUvs(9, 4)[0]).toEqual([1 / 8, 0.5]);
        expect(atlasRows(0)).toBe(2);
        expect(atlasRows(16)).toBe(2);
        expect(atlasRows(17)).toBe(3);
        expect(CARD_ATLAS.cols).toBe(8);
    });

    test('a carried card comes off the cork and pins itself again', () => {
        const a = { y: 1.4, z: 0, depth: 0.004 };
        const b = { y: 1.3, z: -0.6, depth: 0.006 };
        expect(carryPose(a, b, 0)).toEqual(a);
        expect(carryPose(a, b, 1)).toEqual(b);
        expect(carryPose(a, b, 0.5).depth).toBeGreaterThan(0.09);
        expect(carryPose(a, a, 0.5)).toEqual(a);
    });
});

// ---- The controller --------------------------------------------------------------

describe('the pinboard controller', () => {
    let createPinboard;
    let board;
    let atlases;
    let painted;

    beforeEach(async () => {
        jest.resetModules();
        installThree();
        ({ createPinboard } = await import('../www/office/js/pinboard.js'));
        board = { cards: { material: { map: null, needsUpdate: false }, geometry: null, visible: false } };
        atlases = [];
        painted = [];
    });

    afterEach(() => {
        delete globalThis.THREE;
    });

    function make(opts = {}) {
        return createPinboard(board, CONFIG, {
            makeAtlas: (rows) => {
                const atlas = { rows, canvas: { getContext: () => ({}) }, texture: { needsUpdate: false, dispose: jest.fn() } };
                atlases.push(atlas);
                return atlas;
            },
            paintCard: (ctx, x, y, w, h, face) => painted.push([x, y, face.title]),
            ...opts
        });
    }

    const plan = (byStatus) => boardColumns(CONFIG).map((c) => ({ ...c, ids: byStatus[c.status] || [] }));
    const faces = (ids) => new Map(ids.map((id) => [id, { title: id }]));

    test('pins new cards in place and paints each face once, into its own cell', () => {
        const p = make();
        expect(p.sync(plan({ applied: ['a', 'b'], offer: ['c'] }), faces(['a', 'b', 'c']))).toBe(false);
        expect(p.count).toBe(3);
        expect(p.rows).toBe(2);
        expect(painted).toEqual([[0, 0, 'a'], [256, 0, 'b'], [512, 0, 'c']]);
        expect(p.card('c').at).toEqual(cardPose({ column: 4, index: 0, count: 1 }, B, COLS));
        expect(board.cards.material.map).toBe(atlases[0].texture);
        p.sync(plan({ applied: ['a', 'b'], offer: ['c'] }), faces(['a', 'b', 'c']));
        expect(painted).toHaveLength(3);
        p.sync(plan({ applied: ['a', 'b'], offer: ['c'] }), new Map([['a', { title: 'A!' }], ['b', { title: 'b' }], ['c', { title: 'c' }]]));
        expect(painted.at(-1)).toEqual([0, 0, 'A!']);
        expect(p.idAtFace(0)).toBe('a');
        expect(p.idAtFace(5)).toBe('c');
        expect(p.idAtFace(99)).toBeNull();
    });

    test('a status change carries the card across, off the cork and back on', () => {
        const p = make();
        p.sync(plan({ applied: ['a'] }), faces(['a']));
        expect(p.sync(plan({ interviewing: ['a'] }), faces(['a']))).toBe(true);
        p.update(CONFIG.view.carrySeconds / 2);
        expect(p.card('a').at.depth).toBeGreaterThan(0.05);
        while (p.update(0.1)) { /* carrying */ }
        expect(p.card('a').at).toEqual(cardPose({ column: 3, index: 0, count: 1 }, B, COLS));
    });

    test('a dragged card follows the hand, stays on the cork, and settles where it belongs on release', () => {
        const p = make();
        p.sync(plan({ applied: ['a', 'b'] }), faces(['a', 'b']));
        expect(p.beginDrag('nope')).toBe(false);
        expect(p.beginDrag('a')).toBe(true);
        expect(p.dragging).toBe('a');
        p.dragTo(1.4, B.z - 0.5);
        expect(p.card('a').at).toEqual({ y: 1.4, z: B.z - 0.5, depth: 0.07 });
        p.dragTo(99, 99);
        expect(p.card('a').at.y).toBeCloseTo(B.y + B.height / 2 - B.card[1] / 2, 9);
        expect(p.card('a').at.z).toBeCloseTo(B.z + B.width / 2 - B.card[0] / 2, 9);
        // While held, a refile does not snatch it back.
        p.sync(plan({ offer: ['a'], applied: ['b'] }), faces(['a', 'b']));
        expect(p.card('a').at.depth).toBe(0.07);
        const released = p.endDrag();
        expect(released.id).toBe('a');
        expect(p.dragging).toBeNull();
        while (p.update(0.1)) { /* settling */ }
        expect(p.card('a').at).toEqual(cardPose({ column: 4, index: 0, count: 1 }, B, COLS));
        expect(p.endDrag()).toBeNull();
    });

    test('the atlas grows a row when the cards outgrow it, and every face is repainted', () => {
        const p = make();
        const ids = Array.from({ length: 17 }, (_, i) => `c${i}`);
        p.sync(plan({ applied: ids.slice(0, 16) }), faces(ids));
        expect(atlases).toHaveLength(1);
        p.sync(plan({ applied: ids }), faces(ids));
        expect(atlases).toHaveLength(2);
        expect(atlases[1].rows).toBe(3);
        expect(painted).toHaveLength(16 + 17);
        expect(atlases[0].texture.dispose).toHaveBeenCalled();
    });

    test('a card that leaves the board is gone, the others keep their cells', () => {
        const p = make();
        p.sync(plan({ applied: ['a', 'b', 'c'] }), faces(['a', 'b', 'c']));
        p.sync(plan({ applied: ['a', 'c'] }), faces(['a', 'c']));
        expect(p.count).toBe(2);
        expect(p.card('b')).toBeNull();
        expect(p.idAtFace(2)).toBe('c');
    });

    test('with less motion, a carry lands at once, and a release settles at once', () => {
        const p = make({ reducedMotion: true });
        p.sync(plan({ applied: ['a'] }), faces(['a']));
        expect(p.sync(plan({ offer: ['a'] }), faces(['a']))).toBe(false);
        expect(p.card('a').at).toEqual(cardPose({ column: 4, index: 0, count: 1 }, B, COLS));
        p.beginDrag('a');
        p.dragTo(1.2, B.z);
        p.endDrag();
        expect(p.card('a').at).toEqual(cardPose({ column: 4, index: 0, count: 1 }, B, COLS));
    });

    test('works without an atlas at all', () => {
        const p = createPinboard(board, CONFIG, {});
        expect(p.sync(plan({ applied: ['a'] }), faces(['a']))).toBe(false);
        expect(p.count).toBe(1);
    });
});
