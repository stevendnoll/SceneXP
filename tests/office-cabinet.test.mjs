// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's filing cabinet: where every folder is filed (cabinet.js),
 * and the controller that moves them there (filing.js), driven with a
 * cabinet made of plain records so every position can be read back.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication, setStatus } from '../www/office/js/store.js';
import { queryApplications } from '../www/office/js/query.js';
import {
    chunkSizes, drawerPlan, drawerLabel, slotsOf, folderPose, tabPose, tabShift, refilePose, liftedLine,
    STATUS_DRAWERS, TAB_COLORS
} from '../www/office/js/cabinet.js';

const NOW = new Date(2026, 8, 24, 10, 0);
const CAB = CONFIG.room.cabinet;

function office(n = 9) {
    let doc = emptyDoc(CONFIG, NOW);
    const names = ['Acme', 'Birch', 'Cedar', 'Dune', 'Elm', 'Fjord', 'Grove', 'Heath', 'Isle', 'Juniper', 'Kestrel', 'Lark'];
    for (let i = 0; i < n; i++) {
        doc = addApplication(doc, {
            company: names[i % names.length], role: 'Designer', appliedOn: `2026-09-${String(10 + i).padStart(2, '0')}`,
            salaryMin: i % 3 ? 100000 + i * 5000 : null
        }, CONFIG, NOW, { id: `a${i}` }).doc;
    }
    return doc;
}

const rowsBy = (doc, sortKey, sortDir) => queryApplications(doc, { sortKey, sortDir }, CONFIG, NOW).rows;

describe('filing', () => {
    test('runs split as evenly as they can, the first ones longer', () => {
        expect(chunkSizes(9, 4)).toEqual([3, 2, 2, 2]);
        expect(chunkSizes(2, 4)).toEqual([1, 1, 0, 0]);
        expect(chunkSizes(0, 4)).toEqual([0, 0, 0, 0]);
    });

    test('by company, the drawers read as letter ranges, in the grid’s order', () => {
        const doc = office();
        const plan = drawerPlan(rowsBy(doc, 'company', 'asc'), 'company', 'asc', 4, NOW);
        expect(plan.map((d) => d.label)).toEqual(['A to C', 'D to E', 'F to G', 'H to I']);
        expect(plan.flatMap((d) => d.ids)).toEqual(rowsBy(doc, 'company', 'asc').map((r) => r.app.id));
        const back = drawerPlan(rowsBy(doc, 'company', 'desc'), 'company', 'desc', 4, NOW);
        expect(back[0].label).toBe('I to G');
    });

    test('too few folders leave the last drawers empty, and say so', () => {
        const plan = drawerPlan(rowsBy(office(2), 'company', 'asc'), 'company', 'asc', 4, NOW);
        expect(plan.map((d) => d.label)).toEqual(['A', 'B', 'Empty', 'Empty']);
    });

    test('by status, the drawers are the stages, whichever way the sort runs', () => {
        let doc = office(4);
        doc = setStatus(doc, 'a1', 'interviewing', CONFIG, NOW).doc;
        doc = setStatus(doc, 'a2', 'rejected', CONFIG, NOW).doc;
        doc = setStatus(doc, 'a3', 'offer', CONFIG, NOW).doc;
        const plan = drawerPlan(rowsBy(doc, 'status', 'asc'), 'status', 'asc', 4, NOW);
        expect(plan.map((d) => [d.label, d.ids])).toEqual([
            ['Saved and applied', ['a0']], ['In progress', ['a1']], ['Offers', ['a3']], ['Closed', ['a2']]
        ]);
        const desc = drawerPlan(rowsBy(doc, 'status', 'desc'), 'status', 'desc', 4, NOW);
        expect(desc.map((d) => d.label)).toEqual(STATUS_DRAWERS.map((g) => g.label).reverse());
    });

    test('dates, salaries and activity make readable labels', () => {
        const doc = office(8);
        expect(drawerPlan(rowsBy(doc, 'applied', 'desc'), 'applied', 'desc', 4, NOW)[0].label).toBe('Sep 17 to Sep 16');
        const salary = drawerPlan(rowsBy(doc, 'salary', 'desc'), 'salary', 'desc', 4, NOW).map((d) => d.label);
        expect(salary[0]).toMatch(/^\$1\d\dk to \$1\d\dk$/);
        expect(salary.at(-1)).toMatch(/No salary listed|and unlisted/);
        expect(drawerPlan(rowsBy(doc, 'activity', 'desc'), 'activity', 'desc', 4, NOW)[0].label).toBe('Sep 17 to Sep 16');
        const row = (app, lastActivity = null) => ({ app, lastActivity });
        expect(drawerLabel('applied', row({ appliedOn: null }), row({ appliedOn: null }), NOW)).toBe('Not sent yet');
        expect(drawerLabel('applied', row({ appliedOn: '2026-09-02' }), row({ appliedOn: null }), NOW)).toBe('Sep 2 and unsent');
        expect(drawerLabel('company', row({ company: '42 Labs' }), row({ company: 'Émile' }), NOW)).toBe('# to E');
        expect(drawerLabel('activity', row({}), row({}), NOW)).toBe('No date to no date');
        expect(drawerLabel('salary', row({ salaryMin: 55, salaryMax: 70, salaryPeriod: 'hour', salaryCurrency: 'USD' }), row({ salaryMin: null, salaryMax: null }), NOW))
            .toBe('$70/hr and unlisted');
    });
});

describe('where a folder stands', () => {
    test('every folder stands inside its drawer, the first at the front', () => {
        const plan = [{ ids: ['a', 'b', 'c'] }, { ids: [] }, { ids: ['d'] }, { ids: Array.from({ length: 60 }, (_, i) => `x${i}`) }];
        const slots = slotsOf(plan);
        expect(slots.get('c')).toEqual({ drawer: 0, index: 2, count: 3 });
        const w = CAB.width / CAB.drawers;
        for (const [id, slot] of slots) {
            const p = folderPose(slot, CAB);
            expect(p.x).toBeGreaterThan(-CAB.width / 2 + w * slot.drawer);
            expect(p.x).toBeLessThan(-CAB.width / 2 + w * (slot.drawer + 1));
            expect(Math.abs(p.z)).toBeLessThan(CAB.depth / 2);
            expect(p.y - CAB.folderHeight / 2).toBeCloseTo(CAB.floor, 9);
            expect(id).toBeTruthy();
        }
        expect(folderPose(slots.get('a'), CAB).z).toBeGreaterThan(folderPose(slots.get('b'), CAB).z);
        // A lone folder stands in the middle of its drawer.
        expect(folderPose(slots.get('d'), CAB).z).toBe(0);
    });

    test('a found folder rises by the lift, and clears the drawer’s rim', () => {
        const slot = { drawer: 0, index: 0, count: 1 };
        const down = folderPose(slot, CAB, 0);
        const up = folderPose(slot, CAB, 1);
        expect(up.y - down.y).toBeCloseTo(CAB.lift, 9);
        expect(up.y - CAB.folderHeight / 2).toBeGreaterThan(CAB.height - CAB.folderHeight);
        expect(down.y + CAB.folderHeight / 2).toBeLessThan(CAB.height);
    });

    test('tabs sit on the top edge, left, middle or right by stage', () => {
        const body = { x: 0, y: 0.5, z: 0 };
        const bodyW = CAB.width / CAB.drawers - 0.08;
        expect(tabShift('applied')).toBe(-1);
        expect(tabShift('ghosted')).toBe(-1);
        expect(tabShift('interviewing')).toBe(0);
        expect(tabShift('withdrawn')).toBe(1);
        for (const s of [...CONFIG.statuses, 'ghosted']) {
            const tab = tabPose(body, s, CAB);
            expect(Math.abs(tab.x) + 0.05).toBeLessThanOrEqual(bodyW / 2 + 1e-9);
            expect(tab.y).toBeGreaterThan(body.y + CAB.folderHeight / 2 - 0.02);
            expect(TAB_COLORS[s]).toBeDefined();
        }
    });

    test('a refile hops between drawers and lands exactly, and a folder that stays does not hop', () => {
        const a = { x: 0, y: 0.43, z: 0 };
        const b = { x: 0.5, y: 0.43, z: 0.1 };
        expect(refilePose(a, b, 0)).toEqual(a);
        expect(refilePose(a, b, 1)).toEqual(b);
        expect(refilePose(a, b, 0.5).y).toBeCloseTo(0.43 + 0.18, 9);
        expect(refilePose(a, a, 0.5)).toEqual(a);
    });

    test('the lifted line', () => {
        expect(liftedLine([], 5)).toBe('Nothing matches, so every folder stays in its drawer.');
        expect(liftedLine([], 0)).toBe('The cabinet is empty.');
        expect(liftedLine(['Acme'], 5)).toBe('1 folder lifted: Acme.');
        expect(liftedLine(['Acme', 'Birch'], 5)).toBe('2 folders lifted: Acme and Birch.');
        expect(liftedLine(['A', 'B', 'C', 'D', 'E'], 5)).toBe('5 folders lifted: A, B, C and 2 more.');
    });
});

// ---- The controller ------------------------------------------------------------

describe('the filing controller', () => {
    let createFiling;
    let cabinet;

    function meshRecord() {
        return {
            count: 0,
            matrices: new Map(),
            colors: new Map(),
            setMatrixAt(i, m) { this.matrices.set(i, m); },
            setColorAt(i, c) { this.colors.set(i, c); },
            instanceMatrix: { needsUpdate: false },
            instanceColor: { needsUpdate: false }
        };
    }

    beforeEach(async () => {
        jest.resetModules();
        installThree();
        ({ createFiling } = await import('../www/office/js/filing.js'));
        cabinet = { bodies: meshRecord(), tabs: meshRecord(), drawers: { position: { z: 0 } }, capacity: 128 };
    });

    afterEach(() => {
        delete globalThis.THREE;
    });

    const statuses = (ids, s = 'applied') => new Map(ids.map((id) => [id, s]));

    test('files new folders straight into place, and counts them', () => {
        const f = createFiling(cabinet, CONFIG);
        const plan = [{ ids: ['a', 'b'] }, { ids: ['c'] }, { ids: [] }, { ids: [] }];
        expect(f.sync(plan, statuses(['a', 'b', 'c']), new Set(), false)).toBe(false);
        expect(f.count).toBe(3);
        expect(cabinet.bodies.count).toBe(3);
        expect(f.folder('c').at).toEqual(folderPose({ drawer: 1, index: 0, count: 1 }, CAB));
        expect(f.idAt(2)).toBe('c');
        expect(f.idAt(9)).toBeNull();
        expect(f.idAt(-1)).toBeNull();
    });

    test('a refile moves a folder over time, hopping, and lands', () => {
        const f = createFiling(cabinet, CONFIG);
        f.sync([{ ids: ['a'] }, { ids: [] }, { ids: [] }, { ids: [] }], statuses(['a']), new Set(), false);
        const moving = f.sync([{ ids: [] }, { ids: [] }, { ids: [] }, { ids: ['a'] }], statuses(['a']), new Set(), false);
        expect(moving).toBe(true);
        expect(f.update(0)).toBe(true);
        expect(f.folder('a').t).toBe(0);
        f.update(CONFIG.view.refileSeconds / 2);
        const mid = f.folder('a').at;
        expect(mid.y).toBeGreaterThan(folderPose({ drawer: 3, index: 0, count: 1 }, CAB).y);
        while (f.update(0.1)) { /* until it lands */ }
        expect(f.folder('a').at).toEqual(folderPose({ drawer: 3, index: 0, count: 1 }, CAB));
    });

    test('a search lifts what it found and dims the rest, and letting go settles them', () => {
        const f = createFiling(cabinet, CONFIG);
        const plan = [{ ids: ['a', 'b'] }, { ids: [] }, { ids: [] }, { ids: [] }];
        f.sync(plan, statuses(['a', 'b']), new Set(), false);
        expect(f.sync(plan, statuses(['a', 'b']), new Set(['b']), true)).toBe(true);
        expect(f.folder('a').dim).toBe(true);
        expect(f.folder('b').dim).toBe(false);
        while (f.update(0.1)) { /* rising */ }
        expect(f.folder('b').lift).toBe(1);
        expect(f.folder('b').at.y - f.folder('a').at.y).toBeCloseTo(CAB.lift, 9);
        f.sync(plan, statuses(['a', 'b']), new Set(), false);
        while (f.update(0.1)) { /* settling */ }
        expect(f.folder('b').lift).toBe(0);
        expect(f.folder('a').dim).toBe(false);
    });

    test('a folder that leaves gives back its instance, and the rest keep theirs', () => {
        const f = createFiling(cabinet, CONFIG);
        f.sync([{ ids: ['a', 'b', 'c'] }, { ids: [] }, { ids: [] }, { ids: [] }], statuses(['a', 'b', 'c']), new Set(), false);
        f.sync([{ ids: ['a', 'c'] }, { ids: ['d'] }, { ids: [] }, { ids: [] }], statuses(['a', 'c', 'd']), new Set(), false);
        expect([0, 1, 2].map((i) => f.idAt(i))).toEqual(['a', 'c', 'd']);
        expect(f.folder('b')).toBeNull();
        expect(cabinet.bodies.count).toBe(3);
    });

    test('the drawers slide out and back in', () => {
        const f = createFiling(cabinet, CONFIG);
        expect(f.setOpen(true)).toBe(true);
        while (f.update(0.1)) { /* sliding */ }
        expect(f.open).toBe(1);
        expect(cabinet.drawers.position.z).toBeCloseTo(CAB.pull, 9);
        f.setOpen(false);
        while (f.update(0.1)) { /* sliding */ }
        expect(cabinet.drawers.position.z).toBe(0);
    });

    test('with less motion, everything lands at once', () => {
        const f = createFiling(cabinet, CONFIG, { reducedMotion: true });
        f.sync([{ ids: ['a'] }, { ids: [] }, { ids: [] }, { ids: [] }], statuses(['a']), new Set(), false);
        expect(f.sync([{ ids: [] }, { ids: ['a'] }, { ids: [] }, { ids: [] }], statuses(['a']), new Set(['a']), true)).toBe(false);
        expect(f.folder('a').at).toEqual(folderPose({ drawer: 1, index: 0, count: 1 }, CAB, 1));
        expect(f.setOpen(true)).toBe(false);
        expect(cabinet.drawers.position.z).toBeCloseTo(CAB.pull, 9);
    });
});
